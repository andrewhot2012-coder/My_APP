import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  User
} from "firebase/auth";
import { Capacitor } from "@capacitor/core";
import firebaseConfig from "../firebase-applet-config.json";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const safeStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`localStorage setItem failed for ${key}:`, e);
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`localStorage removeItem failed for ${key}:`, e);
    }
  }
};

const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/spreadsheets");
provider.addScope("https://www.googleapis.com/auth/drive.file");
provider.setCustomParameters({
  prompt: "select_account"
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let activeSignInPromise: Promise<{ user: User; accessToken: string } | null> | null = null;

// Load cached token from session memory if needed, but in-memory is required by guidelines
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  const storedToken = safeStorage.getItem("oauth_access_token");
  if (storedToken) {
    cachedAccessToken = storedToken;
  }

  // Set up auth state change observer
  const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // We have a firebase user but no cached token in memory.
        // Try to retrieve it from any pending redirect result.
        if (!isSigningIn) {
          try {
            const redirectResult = await getRedirectResult(auth);
            if (redirectResult) {
              const credential = GoogleAuthProvider.credentialFromResult(redirectResult);
              if (credential?.accessToken) {
                cachedAccessToken = credential.accessToken;
                safeStorage.setItem("oauth_access_token", cachedAccessToken);
                if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
                return;
              }
            }
          } catch (e) {
            console.error("Error checking redirect result inside auth observer:", e);
          }
          // If no redirect token was retrieved and no token is cached, we cannot access Sheets API.
          if (onAuthFailure) onAuthFailure();
        }
      }
    } else {
      if (!isSigningIn) {
        cachedAccessToken = null;
        safeStorage.removeItem("oauth_access_token");
        if (onAuthFailure) onAuthFailure();
      }
    }
  });

  return unsubscribe;
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (isSigningIn && activeSignInPromise) {
    console.warn("Sign-in is already in progress, returning existing promise");
    return activeSignInPromise;
  }

  isSigningIn = true;
  activeSignInPromise = (async () => {
    try {
      try {
        const result = await signInWithPopup(auth, provider);
        if (result && result.user) {
          let token = "";
          try {
            const credential = GoogleAuthProvider.credentialFromResult(result);
            token = credential?.accessToken || "";
          } catch (cErr) {
            console.warn("Error parsing credential from result:", cErr);
          }
          if (!token) {
            token = (result as any)?._tokenResponse?.oauthAccessToken ||
                    (result as any)?._tokenResponse?.accessToken ||
                    cachedAccessToken ||
                    "";
          }
          if (token) {
            cachedAccessToken = token;
            safeStorage.setItem("oauth_access_token", token);
          }
          return { user: result.user, accessToken: token };
        }
      } catch (popupError: any) {
        console.warn("Popup sign-in failed/blocked:", popupError);
        
        const isCancellation = popupError.code === "auth/cancelled-popup-request" || 
                               popupError.code === "auth/popup-closed-by-user" ||
                               popupError.message?.includes("cancelled-popup-request") ||
                               popupError.message?.includes("popup-closed-by-user");
        
        if (isCancellation) {
          return null;
        }

        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                         Capacitor.isNativePlatform();
        
        if (isMobile || popupError.code === "auth/popup-blocked") {
          try {
            await signInWithRedirect(auth, provider);
          } catch (rErr) {
            console.warn("Redirect sign-in fallback failed:", rErr);
            throw rErr;
          }
          return null;
        }
        throw popupError;
      }
      return null;
    } catch (error: any) {
      console.warn("Sign in error caught inside googleSignIn:", error);
      throw error;
    }
  })();

  try {
    return await activeSignInPromise;
  } catch (error: any) {
    console.warn("Sign in error caught in googleSignIn wrapper:", error);
    throw error;
  } finally {
    isSigningIn = false;
    activeSignInPromise = null;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  safeStorage.removeItem("oauth_access_token");
};
