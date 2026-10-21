import { useState, useEffect, useRef } from "react";
import { App as CapApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { User } from "firebase/auth";
import { Header } from "./components/Header";
import { Dashboard } from "./components/Dashboard";
import { DuePlannedReminders } from "./components/DuePlannedReminders";
import { FormView } from "./components/FormView";
import { ExchangeView } from "./components/ExchangeView";
import { HistoryView } from "./components/HistoryView";
import { PlannedView } from "./components/PlannedView";
import { ReportView } from "./components/ReportView";
import { ReportDetailsView } from "./components/ReportDetailsView";
import { DebtorsView } from "./components/DebtorsView";
import { CapitalDetailsView } from "./components/CapitalDetailsView";
import { GlobalCapitalDetailsView } from "./components/GlobalCapitalDetailsView";
import { CategoriesManager } from "./components/CategoriesManager";
import { ContractorReportView } from "./components/ContractorReportView";
import { InitialDataModal } from "./components/InitialDataModal";
import { ComprehensiveReportView } from "./components/ComprehensiveReportView";

import {
  initAuth,
  googleSignIn,
  logout
} from "./auth";

import {
  getInitData,
  getMonthlyReport,
  parseMonthlyReportFromRows,
  saveDataFromApp,
  saveExchange,
  undoLastAction,
  clearContractorData,
  attachReceiptToPast,
  deleteReceipt,
  getPlannedItems,
  parseDateString,
  formatDateUkr,
  calculateAccruedInterest,
  savePlannedItem,
  deletePlannedItem,
  savePlannedItemOnline,
  deletePlannedItemOnline,
  getCustomCategories,
  saveCustomCategory,
  deleteCustomCategory,
  parseAndAddToGroups,
  getSheetsForCurrency,
  updatePastOperation,
  deletePastOperation,
  deleteBankSpecificOperation,
  fetchWithRetry,
  parseSheetFloat,
  cleanSpreadsheetId
} from "./googleSheets";
import { saveDailyRatesForDate, saveDailyRatesMap } from "./lib/dailyRates";

import { InitData, HistoryGroup, MonthlyReportItem } from "./types";
import { resolveItemCurrency, getGroupEffectiveItems } from "./lib/transactionUtils";
import { RefreshCw, FileSpreadsheet, Lock, Fingerprint, Undo2 } from "lucide-react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [isConnected, setIsConnected] = useState(() => {
    const savedId = localStorage.getItem("accounting_spreadsheet_id");
    const hasCachedData = localStorage.getItem("cached_init_data_UAH");
    return !!savedId && !!hasCachedData;
  });

  // Active server wake-up/cold-start states
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [wakeProgress, setWakeProgress] = useState(0);

  const [isImportedFromUrl, setIsImportedFromUrl] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return !!urlParams.get("sheetId");
    } catch (e) {
      return false;
    }
  });

  // Biometric screen/lock states
  const [isBiometricLocked, setIsBiometricLocked] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("sheetId")) {
        return false;
      }
    } catch (e) {}
    const savedId = localStorage.getItem("accounting_spreadsheet_id");
    const hasPin = localStorage.getItem("accounting_app_pin");
    return !!savedId && !!hasPin;
  });
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [biometricError, setBiometricError] = useState<string | null>(null);

  // PIN states
  const [isEnteringPin, setIsEnteringPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSetupStep, setPinSetupStep] = useState<"idle" | "enter" | "confirm">("idle");
  const [tempPin, setTempPin] = useState("");
  const [savedPin, setSavedPin] = useState<string | null>(() => localStorage.getItem("accounting_app_pin"));

  // Initial Data Modal state
  const [isInitialDataModalOpen, setIsInitialDataModalOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinModalInput, setPinModalInput] = useState("");
  const [pinModalStep, setPinModalStep] = useState<"enter" | "confirm">("enter");
  const [pinModalTemp, setPinModalTemp] = useState("");
  const [pinModalError, setPinModalError] = useState<string | null>(null);

  const handlePinModalSubmit = (entered: string) => {
    if (pinModalStep === "enter") {
      setPinModalTemp(entered);
      setPinModalInput("");
      setPinModalStep("confirm");
    } else if (pinModalStep === "confirm") {
      if (entered === pinModalTemp) {
        localStorage.setItem("accounting_app_pin", entered);
        setSavedPin(entered);
        setPinModalInput("");
        setPinModalOpen(false);
        setPinModalError(null);
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
        alert("🎉 Резервний PIN-код успішно встановлено!");
      } else {
        setPinModalError("PIN-коди не співпадають!");
        setPinModalInput("");
        setPinModalStep("enter");
        setPinModalTemp("");
        if (navigator.vibrate) {
          navigator.vibrate(200);
        }
      }
    }
  };

  const hasAutoTriggeredRef = useRef(false);
  const savedPinRef = useRef<string | null>(null);
  savedPinRef.current = savedPin;
  const pinSetupStepRef = useRef<"idle" | "enter" | "confirm">("idle");
  pinSetupStepRef.current = pinSetupStep;
  const tempPinRef = useRef<string>("");
  tempPinRef.current = tempPin;

  const handleFingerprintScan = async (isAuto = false) => {
    if (isScanning || scanStatus === "success") return;
    setIsScanning(true);
    setScanStatus("scanning");
    setBiometricError(null);
    
    if (!isAuto && navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    // Check if we are inside an iframe, secure context, or a development sandbox
    const isInIframe = window.self !== window.top;
    const isSecureContext = window.isSecureContext;
    const isDevSandbox = 
      window.location.hostname.includes("googleusercontent.com") ||
      window.location.hostname.includes("aistudio") ||
      window.location.hostname.includes("webcontainer") ||
      window.location.hostname.includes("stackblitz") ||
      window.location.hostname.includes("sandbox") ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    const hasPin = !!savedPinRef.current;

    if (isInIframe || !isSecureContext || isDevSandbox) {
      if (isAuto) {
        // If it's an automatic background trigger, don't auto-unlock! 
        // Just silently reset scanning state so the user is presented with the lock screen
        setIsScanning(false);
        setScanStatus("idle");
        return;
      }
      // In sandbox/iframe/localhost, run simulated scan to prevent cross-origin Permissions Policy or WebAuthn errors
      setTimeout(() => {
        setScanStatus("success");
        setIsScanning(false);
        if (navigator.vibrate) {
          navigator.vibrate(200);
        }
        setTimeout(() => {
          setIsBiometricLocked(false);
          setScanStatus("idle");
        }, 600);
      }, 1000);
      return;
    }

    try {
      if (!window.PublicKeyCredential) {
        throw new Error("Ваш браузер або пристрій не підтримує біометрію (WebAuthn).");
      }

      // Check if user verification platform authenticator is available (Touch ID, Face ID, Android Fingerprint, Windows Hello)
      const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!isAvailable) {
        throw new Error("Апаратний сканер (відбитка/обличчя) не знайдено або не налаштовано в системі.");
      }

      // Create challenge to trigger REAL system prompt
      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);
      const rpId = window.location.hostname;

      const credentialCreationOptions: CredentialCreationOptions = {
        publicKey: {
          challenge: challenge,
          rp: {
            name: "Фінансовий Облік",
            id: rpId,
          },
          user: {
            id: new Uint8Array([7, 7, 7, 7, 7]),
            name: "user@accounting",
            displayName: "Користувач Обліку",
          },
          pubKeyCredParams: [
            { alg: -7, type: "public-key" }, // ES256
            { alg: -257, type: "public-key" } // RS256
          ],
          timeout: 60000,
          authenticatorSelection: {
            authenticatorAttachment: "platform", // Force native on-device authenticator
            userVerification: "required",
          },
        },
      };

      const credential = await navigator.credentials.create(credentialCreationOptions);
      if (credential) {
        setScanStatus("success");
        setIsScanning(false);
        if (navigator.vibrate) {
          navigator.vibrate(200);
        }
        setTimeout(() => {
          setIsBiometricLocked(false);
          setScanStatus("idle");
        }, 600);
      } else {
        throw new Error("Не вдалося зчитати біометричний відбиток.");
      }
    } catch (err: any) {
      console.warn("Real biometric scan was blocked or not available:", err);
      
      const hasPin = !!savedPinRef.current;
      
      // Check if it's a browser activation/security restriction block
      const isSecurityOrActivationBlock = 
        err?.name === "NotAllowedError" || 
        err?.name === "SecurityError" || 
        String(err).includes("NotAllowed") || 
        String(err).includes("SecurityError") ||
        String(err).includes("gesture");

      if (isAuto && isSecurityOrActivationBlock) {
        // Silently fallback to idle state so they can trigger with a tap
        setIsScanning(false);
        setScanStatus("idle");
        return;
      }

      if (isDevSandbox) {
        // Run simulated auto-unlock in sandbox
        setTimeout(() => {
          setScanStatus("success");
          setIsScanning(false);
          if (navigator.vibrate) {
            navigator.vibrate(200);
          }
          setTimeout(() => {
            setIsBiometricLocked(false);
            setScanStatus("idle");
          }, 600);
        }, 800);
      } else {
        // Real phone, user-triggered scan failed or cancelled
        setScanStatus("error");
        setIsScanning(false);
        setBiometricError("Авторизація не вдалася або була скасована. Будь ласка, спробуйте знову або введіть PIN-код.");
        if (hasPin) {
          setTimeout(() => {
            setIsEnteringPin(true);
          }, 1000);
        }
      }
    }
  };

  // Automatically trigger biometric scan on entry and capture first gesture
  useEffect(() => {
    if (isBiometricLocked && !isEnteringPin && !isWakingUp) {
      // 1. Try immediate auto trigger to capture any launch gesture
      if (!hasAutoTriggeredRef.current) {
        hasAutoTriggeredRef.current = true;
        handleFingerprintScan(true);
      }

      // 2. Add fallback gesture listeners so any tap/click anywhere on the screen triggers the scanner instantly
      const handleInteraction = () => {
        if (scanStatus !== "success") {
          handleFingerprintScan(false);
        }
      };

      window.addEventListener("click", handleInteraction, { passive: true });
      window.addEventListener("touchstart", handleInteraction, { passive: true });
      window.addEventListener("pointerdown", handleInteraction, { passive: true });
      window.addEventListener("mousedown", handleInteraction, { passive: true });

      return () => {
        window.removeEventListener("click", handleInteraction);
        window.removeEventListener("touchstart", handleInteraction);
        window.removeEventListener("pointerdown", handleInteraction);
        window.removeEventListener("mousedown", handleInteraction);
      };
    } else {
      hasAutoTriggeredRef.current = false;
    }
  }, [isBiometricLocked, isWakingUp, isEnteringPin, scanStatus]);

  const handlePinDigit = (digit: string) => {
    setPinError(null);
    const updated = pinInput + digit;
    if (updated.length > 4) return;
    
    setPinInput(updated);

    if (navigator.vibrate) {
      navigator.vibrate(40);
    }

    if (updated.length === 4) {
      setTimeout(() => {
        processPin(updated);
      }, 200);
    }
  };

  const handlePinBackspace = () => {
    setPinInput(prev => prev.slice(0, -1));
    setPinError(null);
  };

  const cancelPinEntry = () => {
    setPinInput("");
    setPinError(null);
    setPinSetupStep("idle");
    setTempPin("");
    setIsEnteringPin(false);
  };

  const processPin = (entered: string) => {
    const currentSavedPin = savedPinRef.current;
    const currentSetupStep = pinSetupStepRef.current;
    const currentTemp = tempPinRef.current;

    if (!currentSavedPin) {
      // Setup flow
      if (currentSetupStep === "enter" || currentSetupStep === "idle") {
        setTempPin(entered);
        setPinInput("");
        setPinSetupStep("confirm");
      } else if (currentSetupStep === "confirm") {
        if (entered === currentTemp) {
          localStorage.setItem("accounting_app_pin", entered);
          setSavedPin(entered);
          setPinInput("");
          setPinSetupStep("idle");
          setIsEnteringPin(false);
          setIsBiometricLocked(false);
          if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
          }
          alert("🎉 Резервний PIN-код встановлено та вхід виконано!");
        } else {
          setPinError("PIN-коди не співпадають. Спробуйте ще раз.");
          setPinInput("");
          setPinSetupStep("enter");
          setTempPin("");
          if (navigator.vibrate) {
            navigator.vibrate(200);
          }
        }
      }
    } else {
      // Validation flow
      if (entered === currentSavedPin) {
        setIsBiometricLocked(false);
        setPinInput("");
        setIsEnteringPin(false);
        if (navigator.vibrate) {
          navigator.vibrate([80, 40, 80]);
        }
      } else {
        setPinError("Невірний PIN-код! Спробуйте знову.");
        setPinInput("");
        if (navigator.vibrate) {
          navigator.vibrate(250);
        }
      }
    }
  };

  // Loading & App States
  const [screen, setScreen] = useState<string>(() => {
    const savedId = localStorage.getItem("accounting_spreadsheet_id");
    const hasCachedData = localStorage.getItem("cached_init_data_UAH");
    const savedScreen = localStorage.getItem("accounting_active_screen");
    if (savedScreen && savedId && hasCachedData) {
      return savedScreen;
    }
    return (savedId && hasCachedData) ? "main" : "connection";
  });
  
  useEffect(() => {
    localStorage.setItem("accounting_active_screen", screen);
  }, [screen]);

  const [screenHistory, setScreenHistory] = useState<string[]>([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const isExitingRef = useRef(false);
  const showExitConfirmRef = useRef(false);
  const currentScreenRef = useRef(screen);

  useEffect(() => {
    showExitConfirmRef.current = showExitConfirm;
  }, [showExitConfirm]);

  useEffect(() => {
    currentScreenRef.current = screen;
  }, [screen]);

  const initHistory = (screenName: string) => {
    window.history.replaceState({ screen: "exit_intercept", index: 0 }, "", "");
    window.history.pushState({ screen: screenName, index: 1 }, "", "");
    setScreen(screenName);
    setScreenHistory(prev => []);
  };

  const navigateTo = (newScreen: string, options?: { replace?: boolean }) => {
    if (newScreen === screen && !window.history.state?.subView) return;
    if (options?.replace) {
      const curIndex = window.history.state?.index || 1;
      window.history.replaceState({ screen: newScreen, index: curIndex }, "", "");
      setScreen(newScreen);
    } else {
      const nextIndex = (window.history.state?.index || 0) + 1;
      window.history.pushState({ screen: newScreen, index: nextIndex }, "", "");
      setScreenHistory(prev => [...prev, screen]);
      setScreen(newScreen);
    }
  };

  const goBack = () => {
    if (window.history.state && window.history.state.index > 1) {
      window.history.back();
    } else {
      setShowExitConfirm(true);
    }
  };

  const goHome = () => {
    const currentIndex = window.history.state?.index || 0;
    if (currentIndex > 1) {
      window.history.go(-(currentIndex - 1));
    } else {
      setScreen(isConnected ? "main" : "connection");
    }
    setScreenHistory(prev => []);
  };

  const handleCancelExit = () => {
    setShowExitConfirm(false);
    window.history.forward();
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    isExitingRef.current = true;
    
    if (Capacitor.isNativePlatform()) {
      CapApp.exitApp();
      return;
    }
    
    // Trigger standard Android Home Intent to minimize Chrome and go back to phone's home screen
    try {
      window.location.replace("intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.HOME;launchFlags=0x10000000;end");
    } catch (e) {
      console.warn("Direct home intent failed:", e);
      try {
        const a = document.createElement("a");
        a.href = "intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.HOME;launchFlags=0x10000000;end";
        document.body.appendChild(a);
        a.click();
        a.remove();
      } catch (err) {
        console.warn("Simulated click home intent failed:", err);
      }
    }

    // Try closing the window as a deferred fallback
    setTimeout(() => {
      try {
        window.close();
      } catch (e) {
        console.warn("Window close failed:", e);
      }
    }, 150);
  };



  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const registerBackButton = async () => {
        const handler = await CapApp.addListener("backButton", () => {
          if (showExitConfirmRef.current) {
            handleConfirmExit();
            return;
          }

          if (screen === "main" || screen === "connection" || screenHistory.length === 0) {
            setShowExitConfirm(true);
          } else {
            goBack();
          }
        });
        return handler;
      };

      const backButtonHandlerPromise = registerBackButton();

      return () => {
        backButtonHandlerPromise.then((handler) => {
          handler.remove();
        });
      };
    }
  }, [screen, screenHistory, isConnected]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (screen !== "main" && screen !== "connection") {
          e.preventDefault();
          goBack();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [screen, screenHistory, isConnected]);

  useEffect(() => {
    if (!window.history.state || window.history.state.screen === "exit_intercept") {
      initHistory(isConnected ? "main" : "connection");
    }

    const handlePopState = (event: PopStateEvent) => {
      if (isExitingRef.current) {
        return;
      }

      // If the exit confirmation is already shown and they swipe back again, immediately exit to home!
      if (showExitConfirmRef.current) {
        handleConfirmExit();
        return;
      }

      let wasIntercepted = false;
      const interceptEvent = new CustomEvent("app-back-intercept", {
        detail: {
          preventScreenTransition: () => {
            wasIntercepted = true;
          }
        }
      });
      window.dispatchEvent(interceptEvent);

      if (wasIntercepted) {
        // Restore history index to stay on current screen
        const restoredIdx = (event.state?.index || 0) + 1;
        window.history.pushState({ screen: currentScreenRef.current, index: restoredIdx }, "", "");
        return;
      }

      if (event.state) {
        const screenName = event.state.screen;
        const idx = event.state.index || 0;
        
        if (screenName === "exit_intercept") {
          setShowExitConfirm(true);
        } else {
          setScreen(screenName);
          setScreenHistory(prev => prev.slice(0, Math.max(0, idx - 1)));
        }
      } else {
        setShowExitConfirm(true);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [isConnected]);

  const [currentCurrency, setCurrentCurrency] = useState<"UAH" | "USD" | "EUR">(() => {
    const saved = localStorage.getItem("accounting_active_currency");
    if (saved === "UAH" || saved === "USD" || saved === "EUR") return saved;
    return "UAH";
  });
  
  useEffect(() => {
    localStorage.setItem("accounting_active_currency", currentCurrency);
  }, [currentCurrency]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Data states (with offline caching from localStorage for instant loading)
  const [initData, setInitData] = useState<InitData | null>(() => {
    try {
      const cached = localStorage.getItem("cached_init_data_UAH");
      return cached ? JSON.parse(cached) : null;
    } catch (e) { return null; }
  });
  const [historyGroups, setHistoryGroups] = useState<HistoryGroup[]>(() => {
    try {
      const cached = localStorage.getItem("cached_history_groups_UAH");
      return cached ? JSON.parse(cached) : [];
    } catch (e) { return []; }
  });
  const [allHistoryGroups, setAllHistoryGroups] = useState<HistoryGroup[]>(() => {
    try {
      const cached = localStorage.getItem("cached_history_groups_ALL");
      return cached ? JSON.parse(cached) : [];
    } catch (e) { return []; }
  });
  const [monthlyReports, setMonthlyReports] = useState<MonthlyReportItem[]>(() => {
    try {
      const cached = localStorage.getItem("cached_monthly_reports_UAH");
      return cached ? JSON.parse(cached) : [];
    } catch (e) { return []; }
  });
  const [allMonthlyReports, setAllMonthlyReports] = useState<{
    UAH: MonthlyReportItem[];
    USD: MonthlyReportItem[];
    EUR: MonthlyReportItem[];
  }>(() => {
    try {
      const u = localStorage.getItem("cached_monthly_reports_UAH");
      const us = localStorage.getItem("cached_monthly_reports_USD");
      const e = localStorage.getItem("cached_monthly_reports_EUR");
      return {
        UAH: u ? JSON.parse(u) : [],
        USD: us ? JSON.parse(us) : [],
        EUR: e ? JSON.parse(e) : []
      };
    } catch (e) {
      return { UAH: [], USD: [], EUR: [] };
    }
  });
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(() => {
    return localStorage.getItem("accounting_selected_month_key") || null;
  });
  const [isSessionExpired, setIsSessionExpired] = useState(false);
  
  // Undo & Session Logs
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [lastActionData, setLastActionData] = useState<any | null>(() => {
    try {
      const saved = localStorage.getItem("accounting_last_action_data");
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const updateLastActionData = (data: any | null) => {
    setLastActionData(data);
    try {
      if (data) {
        localStorage.setItem("accounting_last_action_data", JSON.stringify(data));
      } else {
        localStorage.removeItem("accounting_last_action_data");
      }
    } catch (e) {
      console.warn("Failed to update lastActionData in localStorage", e);
    }
  };

  // Conversion rates (stored in LocalStorage)
  const [rateUsd, setRateUsd] = useState(() => localStorage.getItem("rate_usd_app") || "41.50");
  const [rateUsdSell, setRateUsdSell] = useState(() => localStorage.getItem("rate_usd_sell_app") || "41.90");
  const [rateEur, setRateEur] = useState(() => localStorage.getItem("rate_eur_app") || "44.80");
  const [rateEurSell, setRateEurSell] = useState(() => localStorage.getItem("rate_eur_sell_app") || "45.30");
  const [rateSource, setRateSource] = useState(() => localStorage.getItem("rate_source_app") || "telegram");
  const [summaryBase, setSummaryBase] = useState(() => localStorage.getItem("summary_base_app") || "UAH");
  const [ratesLastUpdated, setRatesLastUpdated] = useState<string>(
    () => localStorage.getItem("rates_last_updated_time") || ""
  );

  // Form operation parameter (used when opening form)
  const [formOperation, setFormOperation] = useState(() => {
    return localStorage.getItem("accounting_form_operation") || "";
  });
  // Selected planned item when fulfilling
  const [prefilledPlanned, setPrefilledPlanned] = useState<any | null>(() => {
    try {
      const val = localStorage.getItem("accounting_prefilled_planned");
      return val ? JSON.parse(val) : null;
    } catch (e) {
      return null;
    }
  });
  const [highlightedPlannedId, setHighlightedPlannedId] = useState<string | null>(null);
  const [selectedInterestItem, setSelectedInterestItem] = useState<any | null>(null);
  const [interestPrincipalAction, setInterestPrincipalAction] = useState<"none" | "all" | "part">("none");
  const [interestPrincipalWithdrawSum, setInterestPrincipalWithdrawSum] = useState<string>("");
  const [selectedReminderItem, setSelectedReminderItem] = useState<any | null>(null);

  useEffect(() => {
    const handleIntercept = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (selectedReminderItem) {
        customEvent.detail.preventScreenTransition();
        setSelectedReminderItem(null);
      }
    };
    window.addEventListener("app-back-intercept", handleIntercept);
    return () => window.removeEventListener("app-back-intercept", handleIntercept);
  }, [selectedReminderItem]);
  const [newDueDate, setNewDueDate] = useState<string>("");
  const [fulfillmentTargetDate, setFulfillmentTargetDate] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [selectedReport, setSelectedReport] = useState<MonthlyReportItem | null>(() => {
    try {
      const val = localStorage.getItem("accounting_selected_report");
      return val ? JSON.parse(val) : null;
    } catch (e) {
      return null;
    }
  });
  const [selectedContractorName, setSelectedContractorName] = useState<string>(() => {
    return localStorage.getItem("accounting_selected_contractor_name") || "";
  });
  const [prefilledContractor, setPrefilledContractor] = useState<string>(() => {
    return localStorage.getItem("accounting_prefilled_contractor") || "";
  });

  useEffect(() => {
    localStorage.setItem("accounting_form_operation", formOperation);
  }, [formOperation]);

  useEffect(() => {
    if (prefilledPlanned) {
      localStorage.setItem("accounting_prefilled_planned", JSON.stringify(prefilledPlanned));
    } else {
      localStorage.removeItem("accounting_prefilled_planned");
    }
  }, [prefilledPlanned]);

  useEffect(() => {
    if (selectedReport) {
      localStorage.setItem("accounting_selected_report", JSON.stringify(selectedReport));
    } else {
      localStorage.removeItem("accounting_selected_report");
    }
  }, [selectedReport]);

  useEffect(() => {
    if (selectedMonthKey) {
      localStorage.setItem("accounting_selected_month_key", selectedMonthKey);
    } else {
      localStorage.removeItem("accounting_selected_month_key");
    }
  }, [selectedMonthKey]);

  useEffect(() => {
    localStorage.setItem("accounting_selected_contractor_name", selectedContractorName);
  }, [selectedContractorName]);

  useEffect(() => {
    localStorage.setItem("accounting_prefilled_contractor", prefilledContractor);
  }, [prefilledContractor]);

  // Save exchange rates to localStorage on update
  useEffect(() => {
    localStorage.setItem("rate_usd_app", rateUsd);
  }, [rateUsd]);

  useEffect(() => {
    localStorage.setItem("rate_usd_sell_app", rateUsdSell);
  }, [rateUsdSell]);

  useEffect(() => {
    localStorage.setItem("rate_eur_app", rateEur);
  }, [rateEur]);

  useEffect(() => {
    localStorage.setItem("rate_eur_sell_app", rateEurSell);
  }, [rateEurSell]);

  useEffect(() => {
    localStorage.setItem("rate_source_app", rateSource);
  }, [rateSource]);

  useEffect(() => {
    localStorage.setItem("summary_base_app", summaryBase);
  }, [summaryBase]);

  // Dynamic body background color transitions based on currency
  useEffect(() => {
    document.body.style.transition = "background-color 0.5s ease";
    const activeCurrency = screen === "global-capital" ? summaryBase : currentCurrency;
    if (activeCurrency === "UAH") {
      document.body.style.backgroundColor = "#000000";
    } else if (activeCurrency === "USD") {
      document.body.style.backgroundColor = "#042116"; // Dark green for USD
    } else if (activeCurrency === "EUR") {
      document.body.style.backgroundColor = "#0b0c24"; // Dark blue/purple for EUR
    } else {
      document.body.style.backgroundColor = "#000000";
    }
  }, [screen, summaryBase, currentCurrency]);

  // Active server wake-up/ping loop for Cloud Run containers
  useEffect(() => {
    let active = true;
    let attempts = 0;

    // Increment progress bar periodically to give the user active visual feedback
    const progressInterval = setInterval(() => {
      setWakeProgress(prev => {
        if (prev >= 96) return 96;
        return prev + 1.2;
      });
    }, 150);

    const pingServer = async () => {
      while (active) {
        try {
          const controller = new AbortController();
          const id = setTimeout(() => controller.abort(), 15000);

          const res = await fetch("/api/health", { signal: controller.signal });
          clearTimeout(id);

          if (res.ok) {
            const data = await res.json();
            if (data?.status === "ok") {
              // Server is hot and ready!
              clearInterval(progressInterval);
              setWakeProgress(100);
              setTimeout(() => {
                if (active) setIsWakingUp(false);
              }, 250);
              break;
            }
          }
        } catch (err) {
          console.log("Health check attempt failed (server is likely cold starting):", err);
        }

        attempts++;
        // Wait 1.5 seconds before retrying
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    };

    pingServer();

    return () => {
      active = false;
      clearInterval(progressInterval);
    };
  }, []);

  // Auth initialization
  useEffect(() => {
    let activeId = localStorage.getItem("accounting_spreadsheet_id");
    
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlSheetId = urlParams.get("sheetId");
      if (urlSheetId) {
        localStorage.setItem("accounting_spreadsheet_id", urlSheetId);
        activeId = urlSheetId;
        // Clean up URL parameters so they don't leak or stay in the browser history
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, "", cleanUrl);
      }
    } catch (e) {
      console.warn("Failed to parse sheetId from URL:", e);
    }

    if (activeId) {
      const cleaned = cleanSpreadsheetId(activeId);
      if (cleaned !== activeId) {
        localStorage.setItem("accounting_spreadsheet_id", cleaned);
      }
      setSpreadsheetId(cleaned);
      activeId = cleaned;
    }

    const unsubscribe = initAuth(
      (authUser, accessToken) => {
        setUser(authUser);
        setToken(accessToken);
        setIsSessionExpired(false);
        if (activeId) {
          initHistory("main");
          setIsConnected(true);
        }
      },
      () => {
        const cachedInit = localStorage.getItem("cached_init_data_UAH");
        if (activeId && cachedInit) {
          setIsSessionExpired(true);
          setUser(null);
          setToken(null);
          // Stay on "main" screen with cached/offline data, do not call initHistory("connection")!
        } else {
          initHistory("connection");
          setUser(null);
          setToken(null);
          setIsConnected(false);
        }
      }
    );
    return () => unsubscribe();
  }, []);

  const rateSourceRef = useRef(rateSource);
  useEffect(() => {
    rateSourceRef.current = rateSource;
  }, [rateSource]);

  const fetchLatestRates = async (overrideSource?: string) => {
    const src = overrideSource || rateSourceRef.current || "telegram";
    
    // Asynchronously sync historical Telegram rates
    fetch(`/api/rates-history?source=${src}`)
      .then(r => r.json())
      .then(hData => {
        if (hData && hData.success && hData.rates) {
          saveDailyRatesMap(hData.rates);
        }
      })
      .catch(err => console.warn("Failed to sync rates history:", err));

    try {
      const res = await fetch(`/api/rates?source=${src}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data && !data.error) {
        const uBuy = data.USD?.buy ? data.USD.buy.toFixed(2) : null;
        const uSell = data.USD?.sell ? data.USD.sell.toFixed(2) : uBuy;
        const eBuy = data.EUR?.buy ? data.EUR.buy.toFixed(2) : null;
        const eSell = data.EUR?.sell ? data.EUR.sell.toFixed(2) : eBuy;

        if (uBuy) setRateUsd(uBuy);
        if (uSell) setRateUsdSell(uSell);
        if (eBuy) setRateEur(eBuy);
        if (eSell) setRateEurSell(eSell);

        if (overrideSource) {
          setRateSource(overrideSource);
        }

        if (uBuy && eBuy) {
          const todayISO = new Date().toISOString().split("T")[0];
          saveDailyRatesForDate(todayISO, {
            usd: parseFloat(uBuy),
            usdSell: parseFloat(uSell || uBuy),
            eur: parseFloat(eBuy),
            eurSell: parseFloat(eSell || eBuy)
          });
          const nowTs = Date.now().toString();
          localStorage.setItem("rates_last_updated_time", nowTs);
          setRatesLastUpdated(nowTs);
        }
        return true;
      } else {
        if (overrideSource) {
          throw new Error(data.error || "Невідома помилка");
        }
      }
    } catch (err: any) {
      console.warn("Server rates unavailable, attempting direct fallback:", err?.message || err);
      // Client-side fallback to NBU if server route is temporarily unreachable
      try {
        const nbuRes = await fetch("https://bank.gov.ua/NBUStatService/v1/statistcl/exchange?json");
        if (nbuRes.ok) {
          const nbuData = await nbuRes.json();
          const usdObj = nbuData.find((x: any) => x.valcode === "USD");
          const eurObj = nbuData.find((x: any) => x.valcode === "EUR");
          if (usdObj && eurObj) {
            const uVal = usdObj.rate.toFixed(2);
            const eVal = eurObj.rate.toFixed(2);
            setRateUsd(uVal);
            setRateUsdSell(uVal);
            setRateEur(eVal);
            setRateEurSell(eVal);
            return true;
          }
        }
      } catch (fbErr) {
        // Fallback quiet
      }
      if (overrideSource) {
        alert("Не вдалося оновити курси: " + (err?.message || "Помилка мережі"));
      }
    }
    return false;
  };

  const forceRefreshRates = async (selectedSource?: string) => {
    setLoading(true);
    try {
      return await fetchLatestRates(selectedSource);
    } finally {
      setLoading(false);
    }
  };

  // Fetch real-time rates on startup and every time user enters / focuses / unlocks the app
  useEffect(() => {
    fetchLatestRates();

    const handleFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        fetchLatestRates();
      }
    };

    window.addEventListener("focus", handleFocusOrVisible);
    document.addEventListener("visibilitychange", handleFocusOrVisible);

    let capListenerPromise: Promise<any> | null = null;
    if (Capacitor.isNativePlatform()) {
      capListenerPromise = CapApp.addListener("appStateChange", (state) => {
        if (state.isActive) {
          fetchLatestRates();
        }
      });
    }

    return () => {
      window.removeEventListener("focus", handleFocusOrVisible);
      document.removeEventListener("visibilitychange", handleFocusOrVisible);
      if (capListenerPromise) {
        capListenerPromise.then((h) => h.remove?.());
      }
    };
  }, []);

  // Fetch / Sync Spreadsheet data
  const loadAllData = async (curToken: string, curSheetId: string, curCurr: "UAH" | "USD" | "EUR") => {
    if (!curToken || !curSheetId) return;
    setLoading(true);
    setError("");
    try {
      const data = await getInitData(curSheetId, curToken, curCurr);
      setInitData(data);

      // Save to localStorage cache for ALL currencies so switching is instantaneous and accurate
      try {
        (["UAH", "USD", "EUR"] as const).forEach(c => {
          const cBanks = data.allBankDetails?.[c] || { 'Готівка': 0, 'Банк 1': 0, 'Банк 2': 0, 'Банк 3': 0, 'Банк 4': 0, 'Банк 5': 0 };
          const cBankTotal = Object.values(cBanks).reduce<number>((a, b) => a + (Number(b) || 0), 0);
          const cDebtorsTotal = Number(data.debtorsTotals?.[c] ?? 0);
          const cTotal = Number(data.globalTotals?.[c] ?? (cBankTotal + cDebtorsTotal));
          const cDebtors = data.allDebtorsDetails?.[c] || { oweUs: [], weOwe: [], settled: [] };
          const cInitData: InitData = {
            ...data,
            currency: c,
            rawMoneyRows: data.allRawMoneyRows?.[c] || [],
            capital: {
              total: cTotal,
              bankTotal: cBankTotal,
              debtorsTotal: cDebtorsTotal,
              banks: cBanks
            },
            debtors: cDebtors
          };
          localStorage.setItem(`cached_init_data_${c}`, JSON.stringify(cInitData));
        });
      } catch (e) { console.warn("Failed to cache initData for all currencies:", e); }

      // Parse recent transactions from Money Sheet
      const sheetNames = data.sheetConfigs.map(s => s.title);
      
      const allRowsMap = data.allRawMoneyRows || { [curCurr]: data.rawMoneyRows || [] };
      const groupsObj: { [key: string]: HistoryGroup } = {};
      
      Object.keys(allRowsMap).forEach(cKey => {
        const cCurr = cKey as "UAH" | "USD" | "EUR";
        const cRows = allRowsMap[cKey] || [];
        if (cRows.length >= 2) {
          const bankHeaders = cRows[0];
          const cols = [1, 3, 5, 7, 9, 11];
          const keys = ["Готівка", "Банк 1", "Банк 2", "Банк 3", "Банк 4", "Банк 5"];

          for (let r = 1; r < cRows.length; r++) {
            const row = cRows[r];
            if (!row) continue;
            for (let c = 0; c < 6; c++) {
              const textIdx = cols[c] - 1;
              const valIdx = cols[c];
              if (row[textIdx] != null && row[textIdx].toString().trim() !== "") {
                const text = row[textIdx].toString().trim();
                let sum = (row.length > valIdx && row[valIdx] != null) ? parseSheetFloat(row[valIdx]) : NaN;
                if (isNaN(sum) || sum === 0) {
                  const mSum = text.match(/💰\s*Сума:\s*([\d.,]+)/i) || text.match(/([\d.,]+)\s*(?:USD|\$|EUR|€|UAH|₴)/i) || text.match(/\$\s*([\d.,]+)/i);
                  if (mSum) {
                    const parsedS = parseSheetFloat(mSum[1]);
                    if (!isNaN(parsedS) && parsedS > 0) {
                      sum = parsedS;
                    }
                  }
                }
                if (text && !isNaN(sum)) {
                  const bName = bankHeaders[textIdx] || keys[c];
                  parseAndAddToGroups(text, sum, bName, `${cCurr}_${r}`, groupsObj, cCurr);
                }
              }
            }
          }
        }
      });
      const sortedGroups = Object.keys(groupsObj)
        .map(k => groupsObj[k])
        .filter(g => {
          const hasNonZero = g.items.some(it => Math.abs(it.sum) > 0.001);
          const isExchange = g.operation?.includes("Обмін") || g.items.some(it => it.text?.includes("➔") || it.text?.includes("Обмін"));
          const hasTextSum = g.items.some(it => (it.text || "").includes("Сума:") || (it.fullText || "").includes("Сума:") || (it.text || "").includes("USD") || (it.text || "").includes("$"));
          return hasNonZero || isExchange || hasTextSum;
        })
        .sort((a, b) => b.timestamp - a.timestamp);
      
      const filterByCurr = (target: "UAH" | "USD" | "EUR") => sortedGroups.filter(g => {
        const effItems = getGroupEffectiveItems(g);
        if (effItems.length > 0) {
          return effItems.some(it => it.curr === target);
        }
        const itemC = g.curr || g.items?.[0]?.curr;
        if (!itemC) return target === "UAH";
        const up = itemC.toUpperCase();
        if (target === "USD") return up === "USD" || up === "$" || up.includes("USD") || (g.operation === "Обмін" && g.items.some(it => (it.text || it.fullText || "").toUpperCase().includes("USD") || (it.text || it.fullText || "").includes("$")));
        if (target === "EUR") return up === "EUR" || up === "€" || up.includes("EUR") || (g.operation === "Обмін" && g.items.some(it => (it.text || it.fullText || "").toUpperCase().includes("EUR") || (it.text || it.fullText || "").includes("€")));
        return up === "UAH" || up === "₴" || up.includes("ГРН") || (g.operation === "Обмін" && g.items.some(it => (it.text || it.fullText || "").toUpperCase().includes("UAH") || (it.text || it.fullText || "").includes("₴")));
      });

      const curCurrGroups = filterByCurr(curCurr);
      setHistoryGroups(curCurrGroups);
      try {
        (["UAH", "USD", "EUR"] as const).forEach(c => {
          const cGroups = filterByCurr(c);
          localStorage.setItem(`cached_history_groups_${c}`, JSON.stringify(cGroups));
        });
        localStorage.setItem(`cached_history_groups_ALL`, JSON.stringify(sortedGroups));
        setAllHistoryGroups(sortedGroups);
      } catch (e) { console.warn("Failed to cache historyGroups:", e); }

      // Parse monthly reports directly from debtor rows in memory with precise currency filtering
      const debtorRowsForUAH = (data.allDebtorRows?.UAH && data.allDebtorRows.UAH.length > 0)
        ? data.allDebtorRows.UAH
        : [];
      const debtorRowsForUSD = (data.allDebtorRows?.USD && data.allDebtorRows.USD.length > 0)
        ? data.allDebtorRows.USD
        : [];
      const debtorRowsForEUR = (data.allDebtorRows?.EUR && data.allDebtorRows.EUR.length > 0)
        ? data.allDebtorRows.EUR
        : [];

      const repDataUAH = debtorRowsForUAH.length > 0
        ? parseMonthlyReportFromRows(debtorRowsForUAH, "UAH")
        : (sheetNames.some(s => s.toLowerCase().includes("боржники") || s.toLowerCase().includes("debtors"))
            ? await getMonthlyReport(curSheetId, curToken, "UAH", sheetNames)
            : []);
      const repDataUSD = debtorRowsForUSD.length > 0
        ? parseMonthlyReportFromRows(debtorRowsForUSD, "USD")
        : (sheetNames.some(s => (s.toLowerCase().includes("боржники") || s.toLowerCase().includes("debtors")) && (s.toLowerCase().includes("usd") || s.toLowerCase().includes("$")))
            ? await getMonthlyReport(curSheetId, curToken, "USD", sheetNames)
            : []);
      const repDataEUR = debtorRowsForEUR.length > 0
        ? parseMonthlyReportFromRows(debtorRowsForEUR, "EUR")
        : (sheetNames.some(s => (s.toLowerCase().includes("боржники") || s.toLowerCase().includes("debtors")) && (s.toLowerCase().includes("eur") || s.toLowerCase().includes("€")))
            ? await getMonthlyReport(curSheetId, curToken, "EUR", sheetNames)
            : []);

      const allReps = { UAH: repDataUAH, USD: repDataUSD, EUR: repDataEUR };

      // Ensure all interest income from bank history (sortedGroups) is present in monthly reports
      const monthNamesUk = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
      sortedGroups.forEach(g => {
        const rawGroupText = (g.items.map(i => i.fullText || i.text || "").join(" ") + " " + (g.operation || "")).toLowerCase();
        const isInterest = g.isInterestFulfillment || g.items.some(i => i.isInterestFulfillment) || rawGroupText.includes("відсот") || rawGroupText.includes("процент");
        if (!isInterest) return;

        // Check if this is an expense vs income
        const isExpense = !g.isIncome || g.operation?.toLowerCase().includes("витрат") || g.operation?.toLowerCase().includes("списан") || rawGroupText.includes("сплата відсотків");
        if (isExpense) return;

        // The interest amount for this entire operation:
        const itemsSum = g.items.reduce((acc, it) => acc + Math.abs(it.sum || 0), 0);
        let gSum = 0;
        if (itemsSum > 0.001) {
          gSum = itemsSum;
        } else {
          const mInt = rawGroupText.match(/відсотків\s*\(\s*([\d.]+)/i) || rawGroupText.match(/відсотки\s*\(\s*([\d.]+)/i);
          if (mInt && parseFloat(mInt[1]) > 0) {
            gSum = parseFloat(mInt[1]);
          } else if (g.totalSum > 0) {
            gSum = g.totalSum;
          }
        }

        if (gSum <= 0.001) return;

        let targetCur: "UAH" | "USD" | "EUR" = resolveItemCurrency(g.curr, g.items[0]?.curr, rawGroupText, rawGroupText, gSum);

        const parts = g.dateStr.split(" ")[0].split(".");
        if (parts.length >= 2) {
          const d = parts[0].padStart(2, "0");
          const m = parseInt(parts[1], 10);
          let y = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
          if (y < 100) y += 2000;
          const sortKey = `${y}-${m < 10 ? '0' + m : m}`;
          const targetList = allReps[targetCur] || [];
          let monthRep = targetList.find(r => r.sortKey === sortKey);
          if (!monthRep) {
            const label = `${monthNamesUk[m - 1] || m} ${y}`;
            monthRep = { label, inc: 0, exp: 0, sortKey, currency: targetCur, items: [] };
            targetList.push(monthRep);
            targetList.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
          }

          // Check if already in items (by date and matching sum within 0.05, OR same date and total sum)
          const cleanD = parseInt(d, 10).toString();
          const alreadyExists = monthRep.items.some(mIt => 
            mIt.type === "inc" && 
            (Math.abs(mIt.sum - gSum) < 0.05 || (g.totalSum > 0 && Math.abs(mIt.sum - g.totalSum) < 0.05)) && 
            (mIt.dateStr?.startsWith(d) || mIt.dateStr?.startsWith(cleanD) || mIt.fullText?.includes(d))
          );
          if (!alreadyExists) {
            monthRep.inc = Number((monthRep.inc + gSum).toFixed(2));
            const primaryItem = g.items[0];
            monthRep.items.push({
              type: 'inc',
              sum: Number(gSum.toFixed(2)),
              text: primaryItem?.text || primaryItem?.fullText || "Відсотки (прибуток)",
              dateStr: `${d}.${m < 10 ? '0' + m : m}.${y}`,
              fullText: primaryItem?.fullText || primaryItem?.text || "",
              curr: targetCur
            });
          }
        }
      });

      setAllMonthlyReports(allReps);
      setMonthlyReports(allReps[curCurr] || []);
      try {
        localStorage.setItem("cached_monthly_reports_UAH", JSON.stringify(allReps.UAH));
        localStorage.setItem("cached_monthly_reports_USD", JSON.stringify(allReps.USD));
        localStorage.setItem("cached_monthly_reports_EUR", JSON.stringify(allReps.EUR));
      } catch (e) { console.warn("Failed to cache monthlyReports:", e); }

      if (selectedMonthKey) {
        const curList = allReps[curCurr] || [];
        const matching = curList.find((r: MonthlyReportItem) => r.sortKey === selectedMonthKey);
        if (matching) setSelectedReport(matching);
      }

      setIsSessionExpired(false);
    } catch (err: any) {
      const isFetchOrNetwork = 
        err?.name === "TypeError" || 
        err?.message?.includes("Failed to fetch") || 
        err?.message?.includes("NetworkError") ||
        err?.message?.includes("Load failed");
      const isAuthError = 
        err?.message === "AUTH_EXPIRED" || 
        err?.message?.includes("401") || 
        err?.message?.includes("token") || 
        err?.message?.includes("UNAUTHENTICATED") ||
        isFetchOrNetwork;

      if (isAuthError) {
        console.warn("Data loading authentication or connection issue (using cache if available):", err?.message || err);
      } else {
        console.warn("Data loading error:", err?.message || err);
      }
      
      // Fallback to cached data if network or quota limit fails
      try {
        const cachedInit = localStorage.getItem(`cached_init_data_${curCurr}`);
        const cachedHistory = localStorage.getItem(`cached_history_groups_${curCurr}`);
        const cachedReportsUAH = localStorage.getItem("cached_monthly_reports_UAH");
        const cachedReportsUSD = localStorage.getItem("cached_monthly_reports_USD");
        const cachedReportsEUR = localStorage.getItem("cached_monthly_reports_EUR");

        if (cachedInit) setInitData(prev => prev || JSON.parse(cachedInit));
        if (cachedHistory) setHistoryGroups(prev => prev.length > 0 ? prev : JSON.parse(cachedHistory));
        if (cachedReportsUAH || cachedReportsUSD || cachedReportsEUR) {
          const reps = {
            UAH: cachedReportsUAH ? JSON.parse(cachedReportsUAH) : [],
            USD: cachedReportsUSD ? JSON.parse(cachedReportsUSD) : [],
            EUR: cachedReportsEUR ? JSON.parse(cachedReportsEUR) : []
          };
          setAllMonthlyReports(reps);
          setMonthlyReports(reps[curCurr] || []);
        }
      } catch (cacheErr) {
        console.warn("Could not recover from cache:", cacheErr);
      }

      if (isAuthError) {
        setIsSessionExpired(true);
        setToken(null);
      } else {
        const isQuota = err.message?.includes("429") || err.message?.includes("Quota");
        setError(isQuota 
          ? "Перевищено хвилинний ліміт запитів до Google Таблиці (429). Зачекайте 10-20 секунд та оновіть сторінку. Відображаються останні збережені дані." 
          : (err.message || "Помилка при завантаженні даних таблиці. Перевірте посилання або права."));
      }
    } finally {
      setLoading(false);
    }
  };

  // Trigger sync on token + sheetId change (independent of currency switches to avoid quota exhaustion)
  useEffect(() => {
    if (token && spreadsheetId && isConnected) {
      loadAllData(token, spreadsheetId, currentCurrency);
    }
  }, [token, spreadsheetId, isConnected]);

  const handleLogin = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setIsSessionExpired(false);
        if (spreadsheetId) {
          initHistory("main");
          setIsConnected(true);
          if (res.accessToken) {
            loadAllData(res.accessToken, spreadsheetId, currentCurrency);
          }
        }
      }
    } catch (err: any) {
      setError("Помилка авторизації Google: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleConnectSpreadsheet = async () => {
    if (!spreadsheetId.trim()) {
      setError("Будь ласка, введіть посилання або ID таблиці!");
      return;
    }
    const parsedId = cleanSpreadsheetId(spreadsheetId);
    if (!parsedId) {
      setError("Некоректний формат посилання або ID таблиці.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      let curToken = token;
      if (!curToken) {
        const loginRes = await googleSignIn();
        if (loginRes) {
          setUser(loginRes.user);
          setToken(loginRes.accessToken);
          curToken = loginRes.accessToken;
        } else {
          return;
        }
      }
      
      // Validate sheet accessibility by fetching meta
      const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${parsedId}?fields=spreadsheetId`, {
        headers: { Authorization: `Bearer ${curToken}` }
      });
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Необхідно повторно авторизуватися в Google.");
        }
        if (res.status === 404) {
          throw new Error("Таблицю не знайдено. Перевірте посилання або ID.");
        }
        if (res.status === 403) {
          throw new Error("Немає доступу до цієї таблиці. Перевірте налаштування доступу у Google Sheets.");
        }
        throw new Error("Не вдалося отримати доступ до цієї таблиці. Перевірте правильність ID та права доступу.");
      }
      
      setSpreadsheetId(parsedId);
      localStorage.setItem("accounting_spreadsheet_id", parsedId);
      initHistory("main");
      setIsConnected(true);
    } catch (err: any) {
      setError(err.message || "Помилка підключення таблиці.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (confirm("Ви дійсно хочете відключити таблицю та вийти з акаунту?")) {
      await logout();
      setUser(null);
      setToken(null);
      initHistory("connection");
      setIsConnected(false);
    }
  };

  const handleRefresh = () => {
    if (isSessionExpired) {
      handleLogin();
    } else if (token && spreadsheetId) {
      loadAllData(token, spreadsheetId, currentCurrency);
    }
  };

  const handleFormSubmission = async (formData: any) => {
    if (!token || !spreadsheetId || !initData) return;
    setLoading(true);
    try {
      // Append active context variables
      const dataWithContext = {
        ...formData,
        currency: currentCurrency,
        plannedId: prefilledPlanned?.id || null,
        plannedType: prefilledPlanned?.type || null,
        isInterestFulfillment: prefilledPlanned?.isInterestFulfillment || false,
        interestFulfillmentPeriod: prefilledPlanned?.interestFulfillmentPeriod || null,
        interestFulfillmentBaseSum: prefilledPlanned?.interestFulfillmentBaseSum || null,
        interestFulfillmentRate: prefilledPlanned?.interestFulfillmentRate || null,
        interestFulfillmentUpToDate: prefilledPlanned?.interestFulfillmentUpToDate || null,
        interestFulfillmentCalculatedAccrued: prefilledPlanned?.interestFulfillmentCalculatedAccrued || 0,
        interestPrincipalAction: prefilledPlanned?.interestPrincipalAction || "none",
        interestPrincipalWithdrawSum: prefilledPlanned?.interestPrincipalWithdrawSum || 0
      };

      const actionLog = await saveDataFromApp(spreadsheetId, token, dataWithContext, initData.sheetConfigs);
      updateLastActionData(actionLog);
      setPrefilledPlanned(null);
      setPrefilledContractor("");
      
      // Clear the local draft upon successful submission
      const isIncome = formData.operation.includes("Прибуток") || formData.operation.includes("Повернули");
      const draftKey = isIncome ? "accounting_form_draft_income" : "accounting_form_draft_expense";
      localStorage.removeItem(draftKey);

      goHome();
      
      // Auto refresh list
      await loadAllData(token, spreadsheetId, currentCurrency);
    } catch (err: any) {
      const isAuthError = err?.message === "AUTH_EXPIRED" || err?.message?.includes("401") || err?.message?.includes("UNAUTHENTICATED");
      if (isAuthError) {
        setIsSessionExpired(true);
        setToken(null);
        alert("Сесію авторизації Google завершено. Будь ласка, увійдіть знову.");
      } else {
        alert("Помилка під час збереження запису: " + (err?.message || String(err)));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleExchangeSubmission = async (exchangeData: any) => {
    if (!token || !spreadsheetId || !initData) return;
    setLoading(true);
    try {
      const actionLog = await saveExchange(spreadsheetId, token, exchangeData, initData.sheetConfigs);
      updateLastActionData(actionLog);
      goHome();
      await loadAllData(token, spreadsheetId, currentCurrency);
    } catch (err: any) {
      const isAuthError = err?.message === "AUTH_EXPIRED" || err?.message?.includes("401") || err?.message?.includes("UNAUTHENTICATED");
      if (isAuthError) {
        setIsSessionExpired(true);
        setToken(null);
        alert("Сесію авторизації Google завершено. Будь ласка, увійдіть знову.");
      } else {
        alert("Помилка під час проведення обміну: " + (err?.message || String(err)));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUndoLastRecord = () => {
    if (!token || !spreadsheetId || !lastActionData) {
      if (!lastActionData) {
        alert("Немає збереженої операції для відміни.");
      }
      return;
    }
    setShowUndoConfirm(true);
  };

  const executeUndoLastRecord = async () => {
    setShowUndoConfirm(false);
    if (!token || !spreadsheetId || !lastActionData) return;

    setLoading(true);
    try {
      const success = await undoLastAction(spreadsheetId, token, lastActionData, initData?.sheetConfigs || []);
      if (success) {
        updateLastActionData(null);
        await new Promise(r => setTimeout(r, 400));
        await loadAllData(token, spreadsheetId, currentCurrency);
        try {
          alert("Останній запис успішно відмінено та стерто з таблиці!");
        } catch (e) {}
      } else {
        try {
          alert("Не вдалося відмінити запис.");
        } catch (e) {}
      }
    } catch (err: any) {
      console.error("Undo error:", err);
      const isAuthError = err?.message === "AUTH_EXPIRED" || err?.message?.includes("401") || err?.message?.includes("UNAUTHENTICATED");
      if (isAuthError) {
        setIsSessionExpired(true);
        setToken(null);
        alert("Сесію авторизації Google завершено. Будь ласка, увійдіть знову для відміни запису.");
      } else {
        try {
          alert("Помилка відміни запису: " + (err?.message || String(err)));
        } catch (e) {}
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClearDebtorHistory = async (name: string, mode: "all" | "keep_balance" = "all") => {
    if (!token || !spreadsheetId || !initData) return;
    try {
      const success = await clearContractorData(spreadsheetId, token, name, currentCurrency, initData.sheetConfigs, mode);
      if (success) {
        await loadAllData(token, spreadsheetId, currentCurrency);
      } else {
        throw new Error("Failed to clear history");
      }
    } catch (err: any) {
      const isAuthError = err?.message === "AUTH_EXPIRED" || err?.message?.includes("401") || err?.message?.includes("UNAUTHENTICATED");
      if (isAuthError) {
        setIsSessionExpired(true);
        setToken(null);
        alert("Сесію авторизації Google завершено. Будь ласка, увійдіть знову.");
      } else {
        alert("Помилка при очищенні історії: " + (err?.message || String(err)));
      }
    }
  };

  const handleAttachReceiptPast = async (dateStr: string, file: any) => {
    if (!token || !spreadsheetId || !initData) return;
    try {
      await attachReceiptToPast(spreadsheetId, token, dateStr, file, currentCurrency, initData.sheetConfigs);
      await loadAllData(token, spreadsheetId, currentCurrency);
    } catch (err: any) {
      const isAuthError = err?.message === "AUTH_EXPIRED" || err?.message?.includes("401") || err?.message?.includes("UNAUTHENTICATED");
      if (isAuthError) {
        setIsSessionExpired(true);
        setToken(null);
        alert("Сесію авторизації Google завершено. Будь ласка, увійдіть знову.");
      } else {
        alert("Помилка при прикріпленні чека: " + (err?.message || String(err)));
      }
    }
  };

  const handleDeleteReceiptPast = async (dateStr: string) => {
    if (!token || !spreadsheetId || !initData) return;
    try {
      await deleteReceipt(spreadsheetId, token, dateStr, currentCurrency, initData.sheetConfigs);
      await loadAllData(token, spreadsheetId, currentCurrency);
    } catch (err: any) {
      const isAuthError = err?.message === "AUTH_EXPIRED" || err?.message?.includes("401") || err?.message?.includes("UNAUTHENTICATED");
      if (isAuthError) {
        setIsSessionExpired(true);
        setToken(null);
        alert("Сесію авторизації Google завершено. Будь ласка, увійдіть знову.");
      } else {
        alert("Помилка при видаленні чека: " + (err?.message || String(err)));
      }
    }
  };

  const handleEditOperation = async (
    dateStr: string,
    updatedData: { sum: number; contractor: string; comment: string; isSplit?: boolean }
  ) => {
    if (!token || !spreadsheetId || !initData) return;
    setLoading(true);
    try {
      await updatePastOperation(
        spreadsheetId,
        token,
        dateStr,
        updatedData,
        currentCurrency,
        initData.sheetConfigs
      );
      await loadAllData(token, spreadsheetId, currentCurrency);
    } catch (err: any) {
      const isAuthError = err?.message === "AUTH_EXPIRED" || err?.message?.includes("401") || err?.message?.includes("UNAUTHENTICATED");
      if (isAuthError) {
        setIsSessionExpired(true);
        setToken(null);
        alert("Сесію авторизації Google завершено. Будь ласка, увійдіть знову.");
      } else {
        alert("Помилка під час редагування операції: " + (err?.message || String(err)));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOperation = async (dateStr: string, mode: "all" | "history_only" = "all") => {
    if (!token || !spreadsheetId || !initData) return;
    setLoading(true);
    try {
      await deletePastOperation(
        spreadsheetId,
        token,
        dateStr,
        currentCurrency,
        initData.sheetConfigs,
        mode
      );
      await new Promise(r => setTimeout(r, 400));
      await loadAllData(token, spreadsheetId, currentCurrency);
    } catch (err: any) {
      const isAuthError = err?.message === "AUTH_EXPIRED" || err?.message?.includes("401") || err?.message?.includes("UNAUTHENTICATED");
      if (isAuthError) {
        setIsSessionExpired(true);
        setToken(null);
        alert("Сесію авторизації Google завершено. Будь ласка, увійдіть знову.");
      } else {
        alert("Помилка під час видалення операції: " + (err?.message || String(err)));
      }
    } finally {
      setLoading(false);
    }
  };

  // Planned items actions
  const handleSavePlannedLocal = async (pItem: any, pType: "income" | "expense") => {
    setLoading(true);
    try {
      if (token && spreadsheetId && initData) {
        await savePlannedItemOnline(spreadsheetId, token, pItem, currentCurrency, pType, initData.allPlanned);
      } else {
        savePlannedItem(pItem, currentCurrency, pType);
      }
      if (token && spreadsheetId) {
        await loadAllData(token, spreadsheetId, currentCurrency);
      }
    } catch (e: any) {
      alert("Помилка збереження запланованої транзакції: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlannedLocal = async (pId: string, pType: "income" | "expense") => {
    setLoading(true);
    try {
      if (token && spreadsheetId && initData) {
        await deletePlannedItemOnline(spreadsheetId, token, pId, initData.allPlanned);
      } else {
        deletePlannedItem(pId, currentCurrency, pType);
      }
      if (token && spreadsheetId) {
        await loadAllData(token, spreadsheetId, currentCurrency);
      }
    } catch (e: any) {
      alert("Помилка видалення запланованої транзакції: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFulfillPlannedLocal = (pItem: any) => {
    if (pItem.isInterest) {
      setSelectedInterestItem(pItem);
      const todayD = new Date();
      const todayStr = todayD.getFullYear() + '-' + String(todayD.getMonth() + 1).padStart(2, '0') + '-' + String(todayD.getDate()).padStart(2, '0');
      setFulfillmentTargetDate(todayStr);
      return;
    }

    if (pItem.currency && pItem.currency !== currentCurrency) {
      const targetCur = pItem.currency as "UAH" | "USD" | "EUR";
      setCurrentCurrency(targetCur);
      
      // Sync local state with cached currency values for immediate UI feedback
      try {
        const cachedInit = localStorage.getItem(`cached_init_data_${targetCur}`);
        const cachedHistory = localStorage.getItem(`cached_history_groups_${targetCur}`);
        const cachedReports = localStorage.getItem(`cached_monthly_reports_${targetCur}`);

        if (cachedInit) setInitData(JSON.parse(cachedInit));
        else setInitData(null);

        if (cachedHistory) setHistoryGroups(JSON.parse(cachedHistory));
        else setHistoryGroups([]);

        if (cachedReports) {
          const parsedRep = JSON.parse(cachedReports);
          setMonthlyReports(parsedRep);
          if (selectedMonthKey) {
            const match = parsedRep.find((r: MonthlyReportItem) => r.sortKey === selectedMonthKey);
            if (match) setSelectedReport(match);
          }
        } else {
          setMonthlyReports([]);
        }
      } catch (e) {
        console.warn("Failed to load cached currency data:", e);
      }
    }

    setPrefilledPlanned(pItem);
    setFormOperation(pItem.type === "income" ? "Прибуток" : "Покупка");
    navigateTo(pItem.type === "income" ? "income" : "expense");
  };

  // Category Actions
  const handleSaveCategoryLocal = (catName: string) => {
    const updated = saveCustomCategory(catName);
    if (initData) {
      const nextInit = { ...initData, categories: updated };
      setInitData(nextInit);
      try {
        localStorage.setItem(`cached_init_data_${currentCurrency}`, JSON.stringify(nextInit));
      } catch (e) { console.warn("Failed to cache updated categories:", e); }
    }
  };

  const handleDeleteCategoryLocal = (catName: string) => {
    const updated = deleteCustomCategory(catName);
    if (initData) {
      const nextInit = { ...initData, categories: updated };
      setInitData(nextInit);
      try {
        localStorage.setItem(`cached_init_data_${currentCurrency}`, JSON.stringify(nextInit));
      } catch (e) { console.warn("Failed to cache updated categories:", e); }
    }
  };

  const handleSaveAdjustmentLocal = async (bankKey: string, currentBalance: number, targetBalance: number, comment?: string) => {
    if (!token || !spreadsheetId || !initData) return;
    const diff = Number((targetBalance - currentBalance).toFixed(2));
    if (diff === 0) return;
    
    setLoading(true);
    try {
      const isPositive = diff > 0;
      const isInitBalance = comment && (comment.includes("початко") || comment.includes("Початко"));
      const opName = isInitBalance 
        ? (isPositive ? "Введені початкові залишки (+)" : "Введені початкові залишки (-)")
        : (isPositive ? "Коригування (+)" : "Коригування (-)");
      const defaultComment = isInitBalance
        ? `Введені початкові залишки (${isPositive ? "+" : ""}${diff.toFixed(2)})`
        : (isPositive ? `Коригування балансу (+${diff.toFixed(2)})` : `Коригування балансу (${diff.toFixed(2)})`);
      
      const dataWithContext = {
        operation: opName,
        currency: currentCurrency,
        total_sum: Math.abs(diff),
        comment: comment || defaultComment,
        contractor: "",
        splits: [
          {
            acc: bankKey,
            sum: Math.abs(diff)
          }
        ]
      };

      const actionLog = await saveDataFromApp(spreadsheetId, token, dataWithContext, initData.sheetConfigs);
      updateLastActionData(actionLog);
      
      // Auto refresh list
      await loadAllData(token, spreadsheetId, currentCurrency);
    } catch (err: any) {
      alert("Помилка під час збереження коригування: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveInitialDebtLocal = async (
    contractorName: string,
    type: "owe_us" | "we_owe",
    sum: number,
    debtCurrency: string,
    comment?: string
  ) => {
    if (!token || !spreadsheetId || !initData) return;
    setLoading(true);
    try {
      const isOweUs = type === "owe_us";
      const opName = isOweUs ? "Початковий борг (+)" : "Початковий борг (-)";
      const defaultComment = isOweUs
        ? `Введені початкові залишки (нам винні: ${sum.toFixed(2)})`
        : `Введені початкові залишки (ми винні: ${sum.toFixed(2)})`;

      const dataWithContext = {
        operation: opName,
        currency: debtCurrency,
        total_sum: sum,
        comment: comment || defaultComment,
        contractor: contractorName.trim(),
        splits: [
          {
            acc: "НеоплаченийБорг",
            sum: sum,
            text: contractorName.trim()
          }
        ]
      };

      const actionLog = await saveDataFromApp(spreadsheetId, token, dataWithContext, initData.sheetConfigs);
      updateLastActionData(actionLog);
      await loadAllData(token, spreadsheetId, currentCurrency);
    } catch (err: any) {
      alert("Помилка під час збереження початкового боргу: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBankOperationLocal = async (dateStr: string, bankKey: string) => {
    if (!token || !spreadsheetId || !initData) return;
    setLoading(true);
    try {
      const success = await deleteBankSpecificOperation(
        spreadsheetId,
        token,
        dateStr,
        bankKey,
        currentCurrency,
        initData.sheetConfigs
      );
      if (success) {
        await loadAllData(token, spreadsheetId, currentCurrency);
      } else {
        alert("Не вдалося знайти відповідну операцію в даній колонці.");
      }
    } catch (err: any) {
      alert("Помилка під час видалення операції: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFulfillInterestLocal = (
    pItem: any, 
    accruedSum: number, 
    chosenDate?: string,
    principalAction: "none" | "all" | "part" = "none",
    principalWithdrawSum: number = 0
  ) => {
    // Switch currency if mismatch
    if (pItem.currency && pItem.currency !== currentCurrency) {
      const targetCur = pItem.currency as "UAH" | "USD" | "EUR";
      setCurrentCurrency(targetCur);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const targetDateStr = chosenDate || todayStr;
    const isIncome = pItem.interestMode === "give"; // "give" (deposit) -> income, "take" (credit) -> expense
    
    // Calculate period
    const formatDateUkr = (dateStr: string) => {
      if (!dateStr) return "";
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        return `${parts[2]}.${parts[1]}.${parts[0]}`;
      }
      return dateStr;
    };

    const getDaysUkrWord = (n: number) => {
      const mod10 = n % 10;
      const mod100 = n % 100;
      if (mod10 === 1 && mod100 !== 11) {
        return "день";
      }
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
        return "дні";
      }
      return "днів";
    };

    const { elapsedDays, elapsedMonths } = calculateAccruedInterest(
      Number(pItem.sum) || 0,
      Number(pItem.interestRate) || 0,
      pItem.interestPeriod,
      pItem.interestStartDate || targetDateStr,
      targetDateStr
    );

    const startFormatted = pItem.interestStartDate ? formatDateUkr(pItem.interestStartDate) : "";
    const targetFormatted = formatDateUkr(targetDateStr);
    const durationLabel = `${elapsedDays} ${getDaysUkrWord(elapsedDays)}`;
    const periodComment = startFormatted 
      ? `з ${startFormatted} по ${targetFormatted} (за ${durationLabel})`
      : `станом на ${targetFormatted}`;

    const baseSum = Number(pItem.sum) || 0;
    const getCurrencySymbolLocal = (curr?: string) => {
      if (curr === "USD") return "$";
      if (curr === "EUR") return "€";
      return "₴";
    };
    const currencySymbol = getCurrencySymbolLocal(pItem.currency);

    const rate = Number(pItem.interestRate) || 0;
    const rateStr = rate ? ` під ${rate}%` : "";

    const accumulated = Number(pItem.accumulatedInterest) || 0;
    const accumulatedInfo = accumulated > 0 
      ? `, у т.ч. ${accumulated.toFixed(2)} ${currencySymbol} невиплачених % з попереднього періоду`
      : "";

    let finalSum = accruedSum;
    let customComment = `Відсотки за договором: "${pItem.name}" (нараховано з суми ${baseSum.toFixed(2)} ${currencySymbol}${rateStr} за період: ${periodComment}${accumulatedInfo})`;
    let title = `Відсотки: ${pItem.name}`;

    if (principalAction === "all") {
      finalSum = Number((accruedSum + baseSum).toFixed(2));
      customComment = `Повне закриття договору: "${pItem.name}". Повернення тіла (${baseSum.toFixed(2)} ${currencySymbol}) та відсотків (${accruedSum.toFixed(2)} ${currencySymbol}, нарахованих з суми ${baseSum.toFixed(2)} ${currencySymbol}${rateStr} за період: ${periodComment}${accumulatedInfo})`;
      title = `Повернення договору: ${pItem.name}`;
    } else if (principalAction === "part") {
      finalSum = Number((accruedSum + principalWithdrawSum).toFixed(2));
      customComment = `Часткове повернення тіла (${Number(principalWithdrawSum).toFixed(2)} ${currencySymbol}) та відсотків (${accruedSum.toFixed(2)} ${currencySymbol}, нарахованих з суми ${baseSum.toFixed(2)} ${currencySymbol}${rateStr} за період: ${periodComment}${accumulatedInfo}) за договором: "${pItem.name}"`;
      title = `Часткове повернення: ${pItem.name}`;
    }

    const prefill = {
      id: pItem.id,
      name: title,
      sum: finalSum,
      type: isIncome ? "income" : "expense",
      date: todayStr,
      contractor: pItem.name.startsWith("Нараховані відсотки: ")
        ? pItem.name.replace("Нараховані відсотки: ", "").trim()
        : pItem.name,
      comment: customComment,
      isInterestFulfillment: true,
      interestFulfillmentPeriod: periodComment,
      interestFulfillmentBaseSum: baseSum,
      interestFulfillmentRate: rate,
      interestFulfillmentUpToDate: targetDateStr,
      interestFulfillmentCalculatedAccrued: accruedSum,
      interestPrincipalAction: principalAction,
      interestPrincipalWithdrawSum: principalWithdrawSum
    };

    setPrefilledPlanned(prefill);
    setFormOperation(isIncome ? "Прибуток" : "Покупка");
    navigateTo(isIncome ? "income" : "expense");
  };

  const getQrDataUrl = () => {
    try {
      const baseUrl = window.location.origin + window.location.pathname;
      const activeId = spreadsheetId || localStorage.getItem("accounting_spreadsheet_id");
      if (activeId) {
        return `${baseUrl}?sheetId=${encodeURIComponent(activeId)}`;
      }
      return baseUrl;
    } catch (e) {
      return window.location.href;
    }
  };

  // Sub-screens routing / render switcher
  const renderScreen = () => {
    if (error === "AUTH_EXPIRED") {
      return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] p-4 text-center max-w-sm mx-auto animate-scaleIn">
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl flex items-center justify-center mb-6 shadow-md shadow-amber-500/5 animate-pulse">
            <Lock className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-black text-white tracking-tight mb-2">Сеанс Google закінчився</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-6 font-semibold">
            Для безпеки та продовження роботи з таблицями необхідно оновити авторизацію.
          </p>

          <div className="w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm text-left flex flex-col gap-4">
            <div className="text-xs text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 p-4 rounded-xl leading-relaxed">
              🔑 Натисніть кнопку нижче, щоб увійти з Google та продовжити роботу з вашою таблицею.
            </div>

            <button
              onClick={handleLogin}
              className="gsi-material-button w-full shadow active:scale-95 transition-all mt-2"
              disabled={loading}
            >
              <div className="gsi-material-button-icon">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.5 24c0-1.61-.15-3.16-.41-4.69H24v9.09h12.64c-.55 2.89-2.18 5.33-4.64 6.99l7.19 5.58C43.41 39.77 46.5 32.53 46.5 24z"></path>
                  <path fill="#FBBC05" d="M10.54 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.98-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.19-5.58c-1.97 1.32-4.55 2.2-8.7 2.2-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
              </div>
              <span className="gsi-material-button-contents">Увійти з Google</span>
            </button>
          </div>
        </div>
      );
    }

    if (screen === "connection" || !isConnected) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[85vh] p-4 text-center max-w-sm mx-auto animate-scaleIn">
          <div className="w-16 h-16 bg-sky-500/10 border border-sky-400/30 text-sky-400 rounded-2xl flex items-center justify-center mb-6 shadow-md shadow-sky-500/5">
            <FileSpreadsheet className="w-8 h-8" />
          </div>

          <h1 className="text-2xl font-black text-white tracking-tight mb-2">Облік у Google Таблицях</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-6 font-semibold">
            Підключіть свою робочу фінансову таблицю та керуйте капіталом у зручному мобільному інтерфейсі.
          </p>

          {/* QR Code Import Success Banner */}
          {isImportedFromUrl && (
            <div className="mb-5 w-full p-4 bg-emerald-950/30 border border-emerald-500/20 rounded-2xl text-left shadow-lg animate-in fade-in slide-in-from-top-4 duration-300">
              <span className="text-[11px] font-black text-emerald-400 uppercase tracking-wider block mb-1">🔗 ТАБЛИЦЮ УСПІШНО ІМПОРТОВАНО</span>
              <p className="text-[10px] text-slate-300 font-bold leading-relaxed">
                Ми автоматично зчитали посилання на вашу таблицю з комп'ютера. Тепер просто увійдіть за допомогою Google нижче, щоб завершити налаштування на телефоні!
              </p>
            </div>
          )}

          {/* Iframe Safe Login Assist */}
          {window.self !== window.top && (
            <div className="mb-4 w-full p-4 bg-sky-950/30 border border-sky-500/20 rounded-2xl text-left shadow-lg">
              <span className="text-[11px] font-black text-sky-400 uppercase tracking-wider block mb-1">📱 Увійти з телефону без обмежень</span>
              <p className="text-[10px] text-slate-300 font-bold mb-3 leading-relaxed">
                Браузер блокує авторизацію Google у вікні перегляду. Натисніть кнопку, щоб відкрити додаток на весь екран прямо у телефоні!
              </p>
              <a
                href={window.location.href}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-black rounded-xl text-[11px] uppercase tracking-wide transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md shadow-sky-500/10 text-center"
              >
                🚀 Відкрити у повній вкладці
              </a>
            </div>
          )}

          <div className="flex flex-col gap-4 w-full bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm text-left">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Посилання або ID таблиці Google Sheets</label>
              <input
                type="text"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                className="bg-slate-800 border border-slate-700 focus:border-sky-400 p-3 rounded-xl text-white outline-none text-xs w-full transition-all"
              />
            </div>

            {error && (
              <div className="text-xs text-red-400 font-bold bg-red-500/10 border border-red-500/20 p-3 rounded-xl leading-relaxed">
                ⚠️ {error === "AUTH_EXPIRED" ? "Час вашої сесії Google минув. Будь ласка, увійдіть знову для оновлення підключення." : error}
              </div>
            )}

            {!user ? (
              <button
                onClick={handleLogin}
                className="gsi-material-button w-full shadow active:scale-95 transition-all mt-2"
                disabled={loading}
              >
                <div className="gsi-material-button-icon">
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.5 24c0-1.61-.15-3.16-.41-4.69H24v9.09h12.64c-.55 2.89-2.18 5.33-4.64 6.99l7.19 5.58C43.41 39.77 46.5 32.53 46.5 24z"></path>
                    <path fill="#FBBC05" d="M10.54 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.98-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.19-5.58c-1.97 1.32-4.55 2.2-8.7 2.2-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                </div>
                <span className="gsi-material-button-contents">Увійти з Google</span>
              </button>
            ) : (
              <button
                onClick={handleConnectSpreadsheet}
                className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl text-sm transition-all active:scale-[0.98] mt-2 shadow-lg shadow-sky-500/10 flex items-center justify-center gap-2"
                disabled={loading}
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Підключити таблицю</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* QR Code Widget for quick phone transition */}
          <div className="mt-6 w-full max-w-sm bg-slate-950/50 border border-slate-900 rounded-2xl p-4 flex items-center gap-4 text-left shadow-sm">
            <div className="bg-white p-1 rounded-xl shrink-0 shadow-md">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&color=020617&bgcolor=ffffff&data=${encodeURIComponent(getQrDataUrl())}`}
                alt="QR Code"
                className="w-16 h-16"
              />
            </div>
            <div>
              <span className="text-[10px] font-black text-sky-400 uppercase tracking-wider block mb-0.5">⚡ Миттєвий вхід з телефону</span>
              <p className="text-[10px] text-slate-400 font-bold leading-normal">
                Скануйте цей QR-код камерою смартфона для миттєвого відкриття та входу безпосередньо у мобільному браузері!
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (screen === "main") {
      const allPlanned = initData?.allPlanned || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const hasFutureItems = allPlanned.some((p: any) => {
        if (!p.date) return false;
        const parts = p.date.split("-");
        const pDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        pDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((pDate.getTime() - today.getTime()) / 86400000);
        return diffDays > 1;
      });

      return (
        <div className="flex flex-col gap-2 animate-scaleIn">
          <DuePlannedReminders
            allPlanned={allPlanned}
            currentCurrency={currentCurrency}
            onFulfill={(pItem) => {
              setSelectedReminderItem(pItem);
              setNewDueDate(pItem.isInterest ? (pItem.dueDate || pItem.date || "") : (pItem.date || ""));
            }}
          />
          <Dashboard
            initData={initData}
            currentCurrency={currentCurrency}
            loading={loading}
            allPlanned={allPlanned}
            onChangeCurrency={handleSwitchCurrency}
            historyGroups={allHistoryGroups && allHistoryGroups.length > 0 ? allHistoryGroups : historyGroups}
            onSelectContractor={(name) => {
              setSelectedContractorName(name);
              navigateTo("contractor-report");
            }}
            onNavigate={(tgt) => {
              if (tgt === "history") setHistorySearch("");
              navigateTo(tgt);
            }}
            onHighlightPlanned={setHighlightedPlannedId}
            onUndo={handleUndoLastRecord}
            hasLastAction={!!lastActionData}
            globalRateUsd={parseFloat(rateUsd) || 0}
            globalRateEur={parseFloat(rateEur) || 0}
            globalRateUsdSell={parseFloat(rateUsdSell) || 0}
            globalRateEurSell={parseFloat(rateEurSell) || 0}
            summaryBase={summaryBase}
            onToggleSummaryBase={(targetCurr) => {
              if (typeof targetCurr === "string" && (targetCurr === "UAH" || targetCurr === "USD" || targetCurr === "EUR")) {
                setSummaryBase(targetCurr);
              } else {
                setSummaryBase(prev => {
                  if (prev === "UAH") return "USD";
                  if (prev === "USD") return "EUR";
                  return "UAH";
                });
              }
            }}
            onOpenInitialDataModal={() => setIsInitialDataModalOpen(true)}
            ratesLastUpdated={ratesLastUpdated}
          />
          
          {!hasFutureItems && (
            <button
              onClick={() => navigateTo("planned")}
              className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed border-sky-500/30 hover:border-sky-500/50 text-sky-400 hover:bg-sky-500/5 font-bold text-sm transition-all active:scale-95 mt-1"
            >
              📋 Керувати бюджетом та планами
            </button>
          )}
        </div>
      );
    }

    if (screen === "income" || screen === "income-voice") {
      const ops = [
        "Прибуток",
        "Повернули борг/позичили мені"
      ];
      return (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
            {ops.map((op, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setFormOperation(op);
                  // Clear planned if switching
                  if (prefilledPlanned && prefilledPlanned.type !== "income") {
                    setPrefilledPlanned(null);
                  }
                }}
                className={`py-3 rounded-xl font-bold text-xs uppercase tracking-wide transition-all ${
                  (formOperation || "Прибуток") === op ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm" : "text-slate-400"
                }`}
              >
                {op}
              </button>
            ))}
          </div>
          <FormView
            operation={formOperation || "Прибуток"}
            initData={initData}
            currentCurrency={currentCurrency}
            onBack={() => { goBack(); setPrefilledPlanned(null); setPrefilledContractor(""); }}
            onSubmit={handleFormSubmission}
            onNavigateToCategories={() => navigateTo("categories-mgr")}
            prefilledContractor={prefilledContractor}
            prefilledPlanned={prefilledPlanned}
            autoStartVoice={screen === "income-voice"}
            onChangeCurrency={(cur) => handleSwitchCurrency(cur as "UAH" | "USD" | "EUR")}
            onChangeOperation={(op, tgtScreen) => {
              setFormOperation(op);
              if (tgtScreen && screen !== tgtScreen && screen !== `${tgtScreen}-voice`) {
                setScreen(tgtScreen);
              }
            }}
          />
        </div>
      );
    }

    if (screen === "expense" || screen === "expense-voice") {
      const ops = [
        "Покупка",
        "Повертаю борг/позичаю комусь",
        "Покупка зі знижкою в борг",
        "Покупка зі знижкою в борг комусь"
      ];
      return (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-2xl border border-slate-800">
            {ops.map((op, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setFormOperation(op);
                  if (prefilledPlanned && prefilledPlanned.type !== "expense") {
                    setPrefilledPlanned(null);
                  }
                }}
                className={`py-2 px-1 rounded-xl font-bold text-[9px] uppercase tracking-tight transition-all leading-snug ${
                  (formOperation || "Покупка") === op ? "bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm" : "text-slate-400"
                }`}
              >
                {op}
              </button>
            ))}
          </div>
          <FormView
            operation={formOperation || "Покупка"}
            initData={initData}
            currentCurrency={currentCurrency}
            onBack={() => { goBack(); setPrefilledPlanned(null); setPrefilledContractor(""); }}
            onSubmit={handleFormSubmission}
            onNavigateToCategories={() => navigateTo("categories-mgr")}
            prefilledContractor={prefilledContractor}
            prefilledPlanned={prefilledPlanned}
            autoStartVoice={screen === "expense-voice"}
            onChangeCurrency={(cur) => handleSwitchCurrency(cur as "UAH" | "USD" | "EUR")}
            onChangeOperation={(op, tgtScreen) => {
              setFormOperation(op);
              if (tgtScreen && screen !== tgtScreen && screen !== `${tgtScreen}-voice`) {
                setScreen(tgtScreen);
              }
            }}
          />
        </div>
      );
    }

    if (screen === "history") {
      return (
        <HistoryView
          groups={historyGroups}
          allGroups={allHistoryGroups && allHistoryGroups.length > 0 ? allHistoryGroups : historyGroups}
          loading={loading}
          initData={initData}
          onBack={() => goBack()}
          onAttachReceipt={handleAttachReceiptPast}
          onDeleteReceipt={handleDeleteReceiptPast}
          initialSearch={historySearch}
          onClearSearch={() => setHistorySearch("")}
          onSelectContractor={(name) => {
            setSelectedContractorName(name);
            navigateTo("contractor-report");
          }}
          onEditOperation={handleEditOperation}
          onDeleteOperation={handleDeleteOperation}
          currentCurrency={currentCurrency}
        />
      );
    }

    if (screen === "report") {
      return (
        <ReportView
          reports={monthlyReports}
          allMonthlyReports={allMonthlyReports}
          historyGroups={allHistoryGroups && allHistoryGroups.length > 0 ? allHistoryGroups : historyGroups}
          initData={initData}
          loading={loading}
          currentCurrency={currentCurrency}
          rateUsd={rateUsd}
          rateUsdSell={rateUsdSell}
          rateEur={rateEur}
          rateEurSell={rateEurSell}
          onBack={() => goBack()}
          onSelectReport={(rep, monthKey) => {
            setSelectedReport(rep);
            setSelectedMonthKey(monthKey || rep.sortKey);
            navigateTo("report-details");
          }}
          onNavigateToContractorReport={(name) => {
            setSelectedContractorName(name);
            navigateTo("contractor-report");
          }}
          onOpenComprehensiveReport={() => navigateTo("comprehensive-report")}
        />
      );
    }

    if (screen === "report-details") {
      const activeMonthKey = selectedMonthKey || selectedReport?.sortKey || "";
      const uahFound = allMonthlyReports.UAH.find(r => r.sortKey === activeMonthKey);
      const usdFound = allMonthlyReports.USD.find(r => r.sortKey === activeMonthKey);
      const eurFound = allMonthlyReports.EUR.find(r => r.sortKey === activeMonthKey);

      const monthReports = {
        UAH: uahFound || (selectedReport?.currency === "UAH" ? selectedReport : null),
        USD: usdFound || (selectedReport?.currency === "USD" ? selectedReport : null),
        EUR: eurFound || (selectedReport?.currency === "EUR" ? selectedReport : null),
      };

      return (
        <ReportDetailsView
          report={selectedReport}
          monthReports={monthReports}
          monthSortKey={activeMonthKey}
          initData={initData}
          currentCurrency={currentCurrency}
          rateUsd={rateUsd}
          rateUsdSell={rateUsdSell}
          rateEur={rateEur}
          rateEurSell={rateEurSell}
          onBack={() => goBack()}
          onCurrencyChange={(newCur) => {
            handleSwitchCurrency(newCur);
          }}
          onNavigateToHistoryWithSearch={(query) => {
            setHistorySearch(query);
            navigateTo("history");
          }}
          onNavigateToContractorReport={(name) => {
            setSelectedContractorName(name);
            navigateTo("contractor-report");
          }}
        />
      );
    }

    if (screen === "debtors") {
      return (
        <ReportView
          reports={monthlyReports}
          allMonthlyReports={allMonthlyReports}
          historyGroups={allHistoryGroups && allHistoryGroups.length > 0 ? allHistoryGroups : historyGroups}
          initData={initData}
          initialViewMode="debtors"
          loading={loading}
          currentCurrency={currentCurrency}
          rateUsd={rateUsd}
          rateUsdSell={rateUsdSell}
          rateEur={rateEur}
          rateEurSell={rateEurSell}
          onBack={() => goBack()}
          onSelectReport={(rep, monthKey) => {
            setSelectedReport(rep);
            setSelectedMonthKey(monthKey || rep.sortKey);
            navigateTo("report-details");
          }}
          onNavigateToContractorReport={(name) => {
            setSelectedContractorName(name);
            navigateTo("contractor-report");
          }}
        />
      );
    }

    if (screen === "contractor-report") {
      return (
        <ContractorReportView
          contractorName={selectedContractorName}
          historyGroups={allHistoryGroups && allHistoryGroups.length > 0 ? allHistoryGroups : historyGroups}
          initData={initData}
          onBack={() => goBack()}
          onNavigateToHistoryWithSearch={(query) => {
            setHistorySearch(query);
            navigateTo("history");
          }}
          onSelectContractor={(name) => {
            setSelectedContractorName(name);
            navigateTo("contractor-report");
          }}
          currentCurrency={currentCurrency}
          onAddIncome={(operation, name) => {
            setFormOperation(operation);
            setPrefilledContractor(name);
            navigateTo("income");
          }}
          onAddExpense={(operation, name) => {
            setFormOperation(operation);
            setPrefilledContractor(name);
            navigateTo("expense");
          }}
        />
      );
    }

    if (screen === "exchange") {
      return (
        <ExchangeView
          initData={initData}
          currentCurrency={currentCurrency}
          onBack={() => goBack()}
          onSubmit={handleExchangeSubmission}
          ratesLastUpdated={ratesLastUpdated}
        />
      );
    }

    if (screen === "planned") {
      return (
        <PlannedView
          plannedItems={initData?.allPlanned || []}
          currentCurrency={currentCurrency}
          onBack={() => goBack()}
          onSave={handleSavePlannedLocal}
          onDelete={handleDeletePlannedLocal}
          onFulfill={handleFulfillPlannedLocal}
          onFulfillInterest={handleFulfillInterestLocal}
          highlightedId={highlightedPlannedId}
          clearHighlight={() => setHighlightedPlannedId(null)}
        />
      );
    }

    if (screen === "categories-mgr") {
      return (
        <CategoriesManager
          categories={initData?.categories || []}
          onBack={() => goBack()}
          onSaveCategory={handleSaveCategoryLocal}
          onDeleteCategory={handleDeleteCategoryLocal}
        />
      );
    }

    if (screen === "capital") {
      return (
        <CapitalDetailsView
          initData={initData}
          currentCurrency={currentCurrency}
          onBack={() => goBack()}
          onNavigateToHistoryWithSearch={(query) => {
            setHistorySearch(query);
            navigateTo("history");
          }}
          onNavigate={(tgt) => {
            if (tgt === "history") setHistorySearch("");
            navigateTo(tgt);
          }}
          onSaveAdjustment={handleSaveAdjustmentLocal}
          onDeleteBankOperation={handleDeleteBankOperationLocal}
          historyGroups={historyGroups}
          onOpenInitialDataModal={() => setIsInitialDataModalOpen(true)}
        />
      );
    }

    if (screen === "global-capital") {
      return (
        <GlobalCapitalDetailsView
          initData={initData}
          onBack={() => goBack()}
          rateUsd={rateUsd}
          rateUsdSell={rateUsdSell}
          rateEur={rateEur}
          rateEurSell={rateEurSell}
          rateSource={rateSource}
          onRateUsdChange={setRateUsd}
          onRateUsdSellChange={setRateUsdSell}
          onRateEurChange={setRateEur}
          onRateEurSellChange={setRateEurSell}
          onRateSourceChange={setRateSource}
          onForceRefreshRates={forceRefreshRates}
          summaryBase={summaryBase}
          onSummaryBaseChange={setSummaryBase}
          onNavigateToCurrencyCapital={(cur) => {
            handleSwitchCurrency(cur);
            navigateTo("capital");
          }}
          onSelectContractor={(name) => {
            setSelectedContractorName(name);
            navigateTo("contractor-report");
          }}
          currentCurrency={currentCurrency}
          onOpenComprehensiveReport={() => navigateTo("comprehensive-report")}
        />
      );
    }

    if (screen === "comprehensive-report") {
      return (
        <ComprehensiveReportView
          initData={initData}
          historyGroups={allHistoryGroups && allHistoryGroups.length > 0 ? allHistoryGroups : historyGroups}
          monthlyReports={monthlyReports}
          rateUsd={rateUsd}
          rateUsdSell={rateUsdSell}
          rateEur={rateEur}
          rateEurSell={rateEurSell}
          rateSource={rateSource}
          currentCurrency={currentCurrency}
          onBack={() => goBack()}
          onSelectContractor={(name) => {
            setSelectedContractorName(name);
            navigateTo("contractor-report");
          }}
        />
      );
    }

    return null;
  };

    const handleSwitchCurrency = (next: "UAH" | "USD" | "EUR") => {
      setCurrentCurrency(next);
      setSummaryBase(next);
      try {
        const cachedInit = localStorage.getItem(`cached_init_data_${next}`);
        const cachedHistory = localStorage.getItem(`cached_history_groups_${next}`);
        const cachedReports = localStorage.getItem(`cached_monthly_reports_${next}`);

        if (cachedInit) {
          setInitData(JSON.parse(cachedInit));
        } else if (initData) {
          const nextBanks = initData.allBankDetails?.[next] || { 'Готівка': 0, 'Банк 1': 0, 'Банк 2': 0, 'Банк 3': 0, 'Банк 4': 0, 'Банк 5': 0 };
          const nextBankTotal = Object.values(nextBanks).reduce<number>((a, b) => a + (Number(b) || 0), 0);
          const nextDebtorsTotal = Number(initData.debtorsTotals?.[next] ?? 0);
          const nextTotal = Number(initData.globalTotals?.[next] ?? (nextBankTotal + nextDebtorsTotal));
          const nextDebtors = initData.allDebtorsDetails?.[next] || { oweUs: [], weOwe: [], settled: [] };
          const synthesized: InitData = {
            ...initData,
            currency: next,
            rawMoneyRows: initData.allRawMoneyRows?.[next] || [],
            capital: {
              total: nextTotal,
              bankTotal: nextBankTotal,
              debtorsTotal: nextDebtorsTotal,
              banks: nextBanks
            },
            debtors: nextDebtors
          };
          setInitData(synthesized);
        }

        const allHistoryCached = localStorage.getItem("cached_history_groups_ALL");
        const poolGroups = (allHistoryCached ? (() => { try { return JSON.parse(allHistoryCached); } catch { return null; } })() : null) || historyGroups || [];

        if (cachedHistory) {
          try {
            const parsedH = JSON.parse(cachedHistory);
            if (Array.isArray(parsedH) && parsedH.length > 0) {
              setHistoryGroups(parsedH);
            } else if (poolGroups && poolGroups.length > 0) {
              const filtered = poolGroups.filter((g: any) => {
                const c = g.curr || g.items?.[0]?.curr;
                if (!c) return next === "UAH";
                const up = c.toUpperCase();
                if (next === "USD") return up === "USD" || up === "$" || up.includes("USD") || (g.operation === "Обмін" && (g.items || []).some((it: any) => (it.text || it.fullText || "").toUpperCase().includes("USD") || (it.text || it.fullText || "").includes("$")));
                if (next === "EUR") return up === "EUR" || up === "€" || up.includes("EUR") || (g.operation === "Обмін" && (g.items || []).some((it: any) => (it.text || it.fullText || "").toUpperCase().includes("EUR") || (it.text || it.fullText || "").includes("€")));
                return up === "UAH" || up === "₴" || up.includes("ГРН") || (g.operation === "Обмін" && (g.items || []).some((it: any) => (it.text || it.fullText || "").toUpperCase().includes("UAH") || (it.text || it.fullText || "").includes("₴")));
              });
              setHistoryGroups(filtered);
            }
          } catch (e) {}
        } else if (poolGroups && poolGroups.length > 0) {
          const filtered = poolGroups.filter((g: any) => {
            const c = g.curr || g.items?.[0]?.curr;
            if (!c) return next === "UAH";
            const up = c.toUpperCase();
            if (next === "USD") return up === "USD" || up === "$" || up.includes("USD") || (g.operation === "Обмін" && (g.items || []).some((it: any) => (it.text || it.fullText || "").toUpperCase().includes("USD") || (it.text || it.fullText || "").includes("$")));
            if (next === "EUR") return up === "EUR" || up === "€" || up.includes("EUR") || (g.operation === "Обмін" && (g.items || []).some((it: any) => (it.text || it.fullText || "").toUpperCase().includes("EUR") || (it.text || it.fullText || "").includes("€")));
            return up === "UAH" || up === "₴" || up.includes("ГРН") || (g.operation === "Обмін" && (g.items || []).some((it: any) => (it.text || it.fullText || "").toUpperCase().includes("UAH") || (it.text || it.fullText || "").includes("₴")));
          });
          setHistoryGroups(filtered);
        }

        if (cachedReports) {
          const parsed = JSON.parse(cachedReports);
          setMonthlyReports(parsed);
          if (selectedMonthKey) {
            const matching = parsed.find((r: MonthlyReportItem) => r.sortKey === selectedMonthKey);
            if (matching) setSelectedReport(matching);
          }
        } else if (allMonthlyReports && allMonthlyReports[next]) {
          setMonthlyReports(allMonthlyReports[next]);
        }
      } catch (e) {
        console.warn("Failed to load cached currency data:", e);
      }

      if (token && spreadsheetId) {
        loadAllData(token, spreadsheetId, next);
      }
    };

    const handleCurrencyToggleLocal = () => {
      const next: "UAH" | "USD" | "EUR" = currentCurrency === "UAH" ? "USD" : currentCurrency === "USD" ? "EUR" : "UAH";
      handleSwitchCurrency(next);
    };

    const getBgColorClass = () => {
      return "bg-black";
    };

    if (isWakingUp) {
      return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center text-white select-none relative overflow-hidden">
          {/* Ambient background glow */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-72 h-72 bg-sky-500/10 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-72 h-72 bg-amber-500/5 blur-3xl rounded-full pointer-events-none" />

          <div className="relative z-10 max-w-sm w-full flex flex-col items-center">
            {/* Pulsing logo container */}
            <div className="w-20 h-20 bg-sky-500/10 border-2 border-sky-400 rounded-3xl flex items-center justify-center mb-8 shadow-xl shadow-sky-500/10 animate-pulse">
              <RefreshCw className="w-10 h-10 text-sky-400 animate-spin" />
            </div>

            <h1 className="text-2xl font-black tracking-tight text-white mb-3">
              ☕ Запуск фінансового обліку
            </h1>
            <p className="text-slate-400 text-sm font-semibold leading-relaxed mb-8 max-w-[280px]">
              Сервер прокидається від сну. Це може зайняти до 10 секунд при першому вході...
            </p>

            {/* Progress bar container */}
            <div className="w-full bg-slate-900 border border-slate-800 h-3 rounded-full overflow-hidden mb-4 p-0.5 shadow-inner">
              <div
                className="bg-sky-500 h-full rounded-full transition-all duration-200 ease-out shadow-[0_0_12px_rgba(56,189,248,0.5)]"
                style={{ width: `${wakeProgress}%` }}
              />
            </div>

            <div className="flex flex-col items-center gap-1.5 mb-10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 animate-pulse">
                Підключення {Math.round(wakeProgress)}%
              </span>
              <span className="text-[10px] text-slate-500 font-semibold">
                Здійснюємо запит до хмарної бази даних...
              </span>
            </div>

            {/* Fallback button if it takes too long */}
            {wakeProgress > 40 && (
              <button
                onClick={() => window.location.reload()}
                className="py-3 px-6 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white font-bold rounded-2xl text-xs uppercase tracking-wider transition-all active:scale-95 shadow-md"
              >
                🔄 Оновити сторінку
              </button>
            )}
          </div>
        </div>
      );
    }

    if (isBiometricLocked) {
      if (isEnteringPin) {
        const hasPin = !!savedPin;
        let headingText = "Введіть PIN-код";
        let subText = "Введіть 4-значний PIN-код для резервного входу";
        
        if (!hasPin) {
          if (pinSetupStep === "confirm") {
            headingText = "Підтвердження PIN-коду";
            subText = "Введіть новий PIN-код ще раз для підтвердження";
          } else {
            headingText = "Встановлення PIN-коду";
            subText = "Створіть свій 4-значний резервний PIN-код для входу без сканера";
          }
        }

        return (
          <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center text-white select-none relative overflow-hidden">
            {/* Ambient background glow */}
            <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-sky-500/10 blur-3xl rounded-full pointer-events-none" />
            
            <div className="relative z-10 max-w-sm w-full flex flex-col items-center">
              <div className="mb-4 flex items-center gap-1.5 px-3 py-1 bg-sky-950/40 border border-sky-500/10 rounded-full text-[10px] uppercase font-black text-sky-400 tracking-wider shadow-sm">
                <Lock className="w-3 h-3" />
                <span>Резервний Вхід</span>
              </div>

              <h1 className="text-2xl font-black tracking-tight text-white mb-2 font-sans">
                {headingText}
              </h1>
              <p className="text-slate-400 text-xs font-semibold mb-8 max-w-[280px] leading-relaxed">
                {subText}
              </p>

              {/* PIN Dot Indicators */}
              <div className="flex items-center gap-6 mb-8 justify-center">
                {[0, 1, 2, 3].map((index) => {
                  const isActive = pinInput.length > index;
                  return (
                    <div
                      key={index}
                      className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                        isActive
                          ? "bg-sky-400 border-sky-400 shadow-[0_0_10px_#38bdf8]"
                          : "bg-transparent border-slate-700"
                      }`}
                    />
                  );
                })}
              </div>

              {/* Error Message */}
              <div className="h-6 mb-4">
                {pinError && (
                  <span className="text-red-400 text-[11px] font-bold tracking-wide">
                    ⚠️ {pinError}
                  </span>
                )}
              </div>

              {/* Keypad Grid */}
              <div className="grid grid-cols-3 gap-y-4 gap-x-6 w-full max-w-[260px] mb-8">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handlePinDigit(num)}
                    className="w-16 h-16 rounded-full bg-slate-950 border border-slate-850 hover:bg-slate-900 hover:border-slate-800 text-xl font-black flex items-center justify-center transition-all active:scale-90"
                  >
                    {num}
                  </button>
                ))}
                {/* Clear/Cancel */}
                <button
                  type="button"
                  onClick={cancelPinEntry}
                  className="w-16 h-16 rounded-full text-slate-500 hover:text-slate-300 text-xs font-bold flex items-center justify-center transition-all active:scale-95"
                >
                  Скасувати
                </button>
                {/* Zero */}
                <button
                  type="button"
                  onClick={() => handlePinDigit("0")}
                  className="w-16 h-16 rounded-full bg-slate-950 border border-slate-850 hover:bg-slate-900 hover:border-slate-800 text-xl font-black flex items-center justify-center transition-all active:scale-90"
                >
                  0
                </button>
                {/* Backspace */}
                <button
                  type="button"
                  onClick={handlePinBackspace}
                  className="w-16 h-16 rounded-full text-slate-500 hover:text-sky-400 text-lg font-black flex items-center justify-center transition-all active:scale-95"
                >
                  ⌫
                </button>
              </div>

              {hasPin && (
                <button
                  type="button"
                  onClick={() => {
                    setPinInput("");
                    setPinError(null);
                    setIsEnteringPin(false);
                  }}
                  className="text-xs font-black text-sky-400 hover:text-sky-300 uppercase tracking-wider flex items-center gap-1.5 active:scale-95"
                >
                  <Fingerprint className="w-4 h-4" />
                  <span>Повернутися до відбитка</span>
                </button>
              )}
            </div>
          </div>
        );
      }

      return (
        <div 
          onClick={() => handleFingerprintScan(false)}
          className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center text-white select-none relative overflow-hidden cursor-pointer"
        >
          {/* Ambient background glow */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-sky-500/10 blur-3xl rounded-full pointer-events-none" />
          
          <div className="relative z-10 max-w-sm w-full flex flex-col items-center">
            {/* Lock Icon header */}
            <div className="mb-4 flex items-center gap-1.5 px-3 py-1 bg-sky-950/40 border border-sky-500/10 rounded-full text-[10px] uppercase font-black text-sky-400 tracking-wider shadow-sm">
              <Lock className="w-3 h-3" />
              <span>Захищений вхід</span>
            </div>

            <h1 className="text-2xl font-black tracking-tight text-white mb-2 font-sans">
              Фінансовий Облік
            </h1>
            <p className="text-slate-400 text-xs font-semibold mb-12 max-w-[260px] leading-relaxed">
              {window.self !== window.top 
                ? "Для тестування реального відбитка пальця відкрийте додаток у новій вкладці (кнопка вгорі справа ↗️). Або увійдіть за допомогою PIN-коду 👇."
                : "Будь ласка, пройдіть авторизацію відбитком пальця для входу в програму."}
            </p>

            {/* Interactive Glowing Fingerprint Scanner */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleFingerprintScan(false);
              }}
              disabled={isScanning || scanStatus === "success"}
              className={`w-28 h-28 rounded-3xl flex flex-col items-center justify-center border-2 transition-all duration-300 cursor-pointer relative group active:scale-95 shadow-lg select-none outline-none ${
                scanStatus === "scanning"
                  ? "bg-sky-500/10 border-sky-400 shadow-sky-500/25 scale-105"
                  : scanStatus === "success"
                  ? "bg-emerald-500/10 border-emerald-400 shadow-emerald-500/25 scale-105"
                  : "bg-slate-950 hover:bg-slate-900 border-sky-500/30 hover:border-sky-400/60 shadow-sky-500/5"
              }`}
            >
              {/* Pulsing Scan Ripples */}
              {(isScanning || scanStatus === "scanning") && (
                <span className="absolute inset-0 rounded-3xl bg-sky-500/10 animate-ping" />
              )}
              
              <Fingerprint className={`w-14 h-14 transition-all duration-300 ${
                scanStatus === "scanning"
                  ? "text-sky-400 scale-110"
                  : scanStatus === "success"
                  ? "text-emerald-400 scale-110"
                  : "text-sky-500 group-hover:text-sky-400"
              }`} />

              {/* Glowing horizontal scanner bar moving down when scanning */}
              {scanStatus === "scanning" && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-sky-400 shadow-[0_0_8px_#38bdf8] rounded-full animate-scanBar" />
              )}
            </button>

            {/* Status Text Under scanner */}
            <div className="mt-8 min-h-12 flex flex-col items-center justify-center px-6">
              {scanStatus === "scanning" && (
                <span className="text-sky-400 text-xs font-black tracking-wider animate-pulse uppercase">
                  Сканування відбитка...
                </span>
              )}
              {scanStatus === "success" && (
                <span className="text-emerald-400 text-xs font-black tracking-wider uppercase flex items-center gap-1.5 animate-bounce">
                  <span>🟢</span> Вхід успішний
                </span>
              )}
              {scanStatus === "error" && biometricError && (
                <div className="text-red-400 text-[11px] font-bold leading-relaxed max-w-[300px] bg-red-950/30 border border-red-500/25 p-3 rounded-2xl animate-shake">
                  ⚠️ {biometricError}
                </div>
              )}
              {scanStatus === "idle" && (
                <span className="text-slate-500 text-xs font-black tracking-wider uppercase hover:text-sky-400 transition-colors cursor-pointer flex items-center gap-1">
                  <span>👆</span> Торкніться будь-де для розблокування
                </span>
              )}
            </div>

            {/* Fallback Option */}
            <div className="mt-14 w-full">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!savedPin) {
                    setPinSetupStep("enter");
                  }
                  setIsEnteringPin(true);
                }}
                className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 hover:text-sky-400 hover:bg-sky-950/25 hover:border-sky-500/20 transition-all py-3 px-6 rounded-xl bg-slate-950 border border-slate-900 active:scale-95 shadow-sm"
              >
                {savedPin ? "🔑 Вхід за допомогою PIN-коду" : "⚙️ Встановити PIN-код входу"}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`min-h-screen text-slate-100 flex flex-col font-sans ${getBgColorClass()}`}>
        {isConnected && (
          <Header
            user={user}
            currentCurrency={currentCurrency}
            onCurrencyToggle={handleCurrencyToggleLocal}
            onRefresh={handleRefresh}
            onLogout={handleDisconnect}
            onNavigateToGlobalCapital={() => {
              if (screen !== "global-capital") {
                navigateTo("global-capital");
              }
            }}
            loading={loading}
            isConnected={isConnected}
            isSessionExpired={isSessionExpired}
            onLock={() => setIsBiometricLocked(true)}
            onPinSetup={() => {
              setPinModalOpen(true);
              setPinModalInput("");
              setPinModalStep("enter");
              setPinModalError(null);
            }}
            onOpenInitialDataModal={() => setIsInitialDataModalOpen(true)}
            ratesLastUpdated={ratesLastUpdated}
          />
        )}

        {isConnected && isSessionExpired && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-3 text-amber-400 font-bold text-[11px] flex items-center justify-between gap-3 max-w-md w-full mx-auto shadow-md">
            <span className="flex items-start gap-1.5 text-left leading-relaxed">
              <span>⚠️</span>
              <span>Сесія Google закінчилася. Дані завантажено з кешу. Будь ласка, оновіть авторизацію для збереження змін та синхронізації.</span>
            </span>
            <button
              onClick={handleLogin}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-95 shrink-0 shadow-lg shadow-amber-500/20"
            >
              Увійти
            </button>
          </div>
        )}

        <main className="flex-1 px-3 py-2.5 sm:p-4 max-w-md w-full mx-auto pb-8">
          {isConnected && error && error !== "AUTH_EXPIRED" && (
            <div className="mb-4 bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-xs text-red-400 font-bold leading-relaxed flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <span>⚠️</span>
                <div>
                  {error}
                </div>
              </div>
              <button
                onClick={handleRefresh}
                className="mt-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold py-1.5 px-3 rounded-lg text-[10px] uppercase tracking-wider self-start transition-all active:scale-95"
              >
                Спробувати знову
              </button>
            </div>
          )}
          {renderScreen()}
        </main>

        {pinModalOpen && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="w-12 h-12 bg-sky-500/10 text-sky-400 rounded-full flex items-center justify-center mx-auto mb-3 text-lg">
                🔒
              </div>
              <h3 className="text-base font-bold text-slate-100 mb-1">
                {pinModalStep === "enter" ? "Новий PIN-код" : "Підтвердження"}
              </h3>
              <p className="text-[11px] text-slate-400 mb-5 leading-normal font-semibold">
                {pinModalStep === "enter"
                  ? "Встановіть новий 4-значний PIN-код для входу:"
                  : "Введіть новий PIN-код ще раз для підтвердження:"}
              </p>

              {/* Dots */}
              <div className="flex items-center gap-4 mb-5 justify-center">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className={`w-3 h-3 rounded-full border-2 transition-all duration-150 ${
                      pinModalInput.length > index
                        ? "bg-sky-400 border-sky-400 shadow-[0_0_8px_#38bdf8]"
                        : "bg-transparent border-slate-700"
                    }`}
                  />
                ))}
              </div>

              {/* Error Message */}
              <div className="h-5 mb-3">
                {pinModalError && (
                  <span className="text-red-400 text-[10px] font-bold">
                    ⚠️ {pinModalError}
                  </span>
                )}
              </div>

              {/* Keypad */}
              <div className="grid grid-cols-3 gap-y-3 gap-x-4 w-full max-w-[200px] mx-auto mb-5">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      setPinModalError(null);
                      const updated = pinModalInput + num;
                      if (updated.length > 4) return;
                      setPinModalInput(updated);
                      if (navigator.vibrate) navigator.vibrate(30);

                      if (updated.length === 4) {
                        setTimeout(() => {
                          handlePinModalSubmit(updated);
                        }, 200);
                      }
                    }}
                    className="w-12 h-12 rounded-full bg-slate-950 border border-slate-850 hover:bg-slate-800 text-sm font-black flex items-center justify-center transition-all active:scale-90"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPinModalOpen(false);
                    setPinModalInput("");
                    setPinModalError(null);
                  }}
                  className="w-12 h-12 text-slate-500 hover:text-slate-300 text-[10px] font-bold flex items-center justify-center transition-all active:scale-95"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPinModalError(null);
                    const updated = pinModalInput + "0";
                    if (updated.length > 4) return;
                    setPinModalInput(updated);
                    if (navigator.vibrate) navigator.vibrate(30);

                    if (updated.length === 4) {
                      setTimeout(() => {
                        handlePinModalSubmit(updated);
                      }, 200);
                    }
                  }}
                  className="w-12 h-12 rounded-full bg-slate-950 border border-slate-850 hover:bg-slate-800 text-sm font-black flex items-center justify-center transition-all active:scale-90"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPinModalInput((prev) => prev.slice(0, -1));
                    setPinModalError(null);
                  }}
                  className="w-12 h-12 text-slate-500 hover:text-sky-400 text-sm font-black flex items-center justify-center transition-all active:scale-95"
                >
                  ⌫
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modern, elegant exit confirmation dialog for mobile back-gesture protection */}
        {showExitConfirm && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                🚪
              </div>
              <h3 className="text-lg font-bold text-slate-100 mb-2">
                Вихід з додатка
              </h3>
              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                Ви дійсно хочете закрити додаток?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleCancelExit}
                  className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition-all active:scale-95 text-sm"
                >
                  Скасувати
                </button>
                <button
                  onClick={handleConfirmExit}
                  className="py-3 px-4 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl transition-all active:scale-95 shadow-lg shadow-red-600/20 text-sm"
                >
                  Вийти
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedInterestItem && (() => {
          const it = selectedInterestItem;
          const startStr = it.interestStartDate || it.date;
          const todayD = new Date();
          const todayStr = todayD.getFullYear() + '-' + String(todayD.getMonth() + 1).padStart(2, '0') + '-' + String(todayD.getDate()).padStart(2, '0');
          const targetDate = fulfillmentTargetDate || todayStr;
          const rate = Number(it.interestRate) || 0;
          const baseSum = Number(it.sum) || 0;
          const { accrued: newAccrued, elapsedDays, elapsedMonths } = calculateAccruedInterest(
            baseSum,
            rate,
            it.interestPeriod,
            startStr,
            targetDate
          );
          const calculatedAccrued = Number(((it.accumulatedInterest || 0) + newAccrued).toFixed(2));

          const isGive = it.interestMode === "give";

          const getDaysUkrWordLocal = (n: number) => {
            const mod10 = n % 10;
            const mod100 = n % 100;
            if (mod10 === 1 && mod100 !== 11) return "день";
            if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дні";
            return "днів";
          };

          const getCurrencySymbol = (curr?: string) => {
            if (curr === "USD") return "$";
            if (curr === "EUR") return "€";
            return "₴";
          };

          return (
            <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-[400px] animate-scaleIn shadow-2xl flex flex-col gap-4 text-left max-h-[92vh] overflow-y-auto">
                <h3 className="font-extrabold text-white text-base flex items-center gap-2 border-b border-slate-800 pb-3">
                  <span>📅 Розрахунок відсотків по договору</span>
                </h3>

                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-slate-400 font-bold">Договір:</span>
                  <span className="text-white font-black truncate bg-slate-950 px-3 py-2 rounded-xl border border-slate-800/40">
                    {it.name.replace("Нараховані відсотки: ", "")}
                  </span>
                </div>

                {/* Блок дат та ставки */}
                <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-400 font-extrabold text-[11px]">🗓 Початок розрахунку:</span>
                    <span className="text-sky-400 font-black font-mono text-sm">{formatDateUkr(startStr)}</span>
                    <span className="text-[10px] text-slate-500 leading-tight">Дата ост. виплати / укладання</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-slate-400 font-extrabold text-[11px]">📈 Ставка відсотків:</span>
                    <span className="text-emerald-400 font-black font-mono text-sm">{it.interestRate}%</span>
                    <span className="text-[10px] text-slate-500 leading-tight">{it.interestPeriod === "monthly" ? "щомісяця" : "річних"}</span>
                  </div>
                </div>

                {it.dueDate && (
                  <div className="flex items-center justify-between text-xs bg-slate-950/40 px-3 py-2 rounded-xl border border-slate-800/40">
                    <span className="text-slate-400 font-bold">🏁 Кінцевий термін договору (тіло):</span>
                    <span className="text-amber-400 font-black font-mono">{formatDateUkr(it.dueDate)}</span>
                  </div>
                )}

                {/* Вибір кінцевої дати нарахування */}
                <div className="flex flex-col gap-1.5 bg-slate-950/30 p-3 rounded-2xl border border-slate-800/40">
                  <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wide">
                    🎯 Нарахувати по дату (включно):
                  </label>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Оберіть день, по який включно підраховуються відсотки:
                  </p>
                  <div className="flex flex-wrap gap-1.5 my-1">
                    <button
                      type="button"
                      onClick={() => setFulfillmentTargetDate(todayStr)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                        targetDate === todayStr 
                          ? "bg-violet-600 text-white border-violet-500" 
                          : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                      }`}
                    >
                      Сьогодні ({formatDateUkr(todayStr)})
                    </button>
                    {it.dueDate && it.dueDate !== todayStr && (
                      <button
                        type="button"
                        onClick={() => setFulfillmentTargetDate(it.dueDate)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                          targetDate === it.dueDate 
                            ? "bg-violet-600 text-white border-violet-500" 
                            : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                        }`}
                      >
                        До терміну ({formatDateUkr(it.dueDate)})
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={fulfillmentTargetDate || todayStr}
                      min={startStr}
                      onChange={(e) => setFulfillmentTargetDate(e.target.value)}
                      className="flex-1 bg-slate-800 border-2 border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                    />
                    <span className="text-xs text-sky-400 font-mono font-bold whitespace-nowrap bg-slate-950 px-2.5 py-2 rounded-xl border border-slate-800">
                      {formatDateUkr(targetDate)}
                    </span>
                  </div>
                </div>

                {/* Дії з тілом договору */}
                <div className="flex flex-col gap-2 border-t border-slate-800/60 pt-3">
                  <label className="text-xs font-extrabold text-slate-400 uppercase tracking-wide">
                    💰 Тіло договору ({baseSum.toFixed(2)} {getCurrencySymbol(it.currency)}):
                  </label>
                  <select
                    value={interestPrincipalAction}
                    onChange={(e) => {
                      const val = e.target.value as "none" | "all" | "part";
                      setInterestPrincipalAction(val);
                      if (val !== "part") {
                        setInterestPrincipalWithdrawSum("");
                      }
                    }}
                    className="w-full bg-slate-800 border-2 border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none font-bold"
                  >
                    <option value="none">❌ Тільки відсотки (без змін тіла)</option>
                    <option value="all">🏦 Закрити договір (повернути все тіло)</option>
                    <option value="part">📉 Повернути частину тіла договору</option>
                  </select>
                </div>

                {interestPrincipalAction === "part" && (
                  <div className="flex flex-col gap-1.5 bg-slate-950/40 p-3 rounded-2xl border border-slate-800/40 animate-scaleIn">
                    <label className="text-[11px] font-bold text-slate-400">
                      Сума повернення тіла ({getCurrencySymbol(it.currency)}):
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={baseSum}
                      value={interestPrincipalWithdrawSum}
                      onChange={(e) => setInterestPrincipalWithdrawSum(e.target.value)}
                      placeholder={`Макс: ${baseSum}`}
                      className="w-full bg-slate-800 border-2 border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3 py-1.5 text-xs text-white outline-none font-mono font-bold"
                    />
                  </div>
                )}

                {/* Підсумок нарахування за період */}
                <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/60 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-400 font-bold">Період розрахунку:</span>
                    <span className="text-sky-300 font-bold font-mono text-xs">
                      з {formatDateUkr(startStr)} по {formatDateUkr(targetDate)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-400 font-bold">Днів у роботі:</span>
                    <span className="text-sky-400 font-black font-mono text-sm">
                      {`${elapsedDays} ${getDaysUkrWordLocal(elapsedDays)}`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs border-t border-slate-800/50 pt-2 font-semibold">
                    <span className="text-slate-400 font-bold">Відсотки за цей період:</span>
                    <span className="text-white font-black font-mono">{calculatedAccrued.toFixed(2)} {getCurrencySymbol(it.currency)}</span>
                  </div>
                  {Boolean(it.accumulatedInterest && it.accumulatedInterest > 0) && (
                    <div className="text-[10px] text-amber-400 font-medium text-right -mt-1">
                      (включаючи {it.accumulatedInterest.toFixed(2)} {getCurrencySymbol(it.currency)} невиплачених % з попереднього періоду)
                    </div>
                  )}
                  {interestPrincipalAction === "all" && (
                    <div className="flex items-center justify-between text-xs border-t border-slate-800/30 pt-1.5 font-semibold text-sky-400">
                      <span>Повернення тіла:</span>
                      <span className="font-mono">+{baseSum.toFixed(2)} {getCurrencySymbol(it.currency)}</span>
                    </div>
                  )}
                  {interestPrincipalAction === "part" && Number(interestPrincipalWithdrawSum) > 0 && (
                    <div className="flex items-center justify-between text-xs border-t border-slate-800/30 pt-1.5 font-semibold text-sky-400">
                      <span>Повернення тіла:</span>
                      <span className="font-mono">+{Number(interestPrincipalWithdrawSum).toFixed(2)} {getCurrencySymbol(it.currency)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs border-t border-slate-800/50 pt-2 font-semibold">
                    <span className="text-amber-400 font-black">ЗАГАЛОМ {isGive ? "ОТРИМАТИ:" : "ВИПЛАТИТИ:"}</span>
                    <span className={`font-black text-base font-mono ${isGive ? "text-emerald-400" : "text-rose-400"}`}>
                      {(calculatedAccrued + (interestPrincipalAction === "all" ? baseSum : (interestPrincipalAction === "part" ? (Number(interestPrincipalWithdrawSum) || 0) : 0))).toFixed(2)} {getCurrencySymbol(it.currency)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedInterestItem(null);
                      setInterestPrincipalAction("none");
                      setInterestPrincipalWithdrawSum("");
                    }}
                    className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all active:scale-[0.98]"
                  >
                    Скасувати
                  </button>
                  <button
                    type="button"
                    disabled={calculatedAccrued <= 0}
                    onClick={() => {
                      const pWithdraw = interestPrincipalAction === "part" ? parseFloat(interestPrincipalWithdrawSum) : 0;
                      if (interestPrincipalAction === "part" && (!pWithdraw || pWithdraw <= 0 || pWithdraw > baseSum)) {
                        alert(`Будь ласка, вкажіть коректну суму повернення тіла (від 0.01 до ${baseSum})`);
                        return;
                      }
                      handleFulfillInterestLocal(
                        it, 
                        calculatedAccrued, 
                        targetDate, 
                        interestPrincipalAction, 
                        interestPrincipalAction === "all" ? baseSum : pWithdraw
                      );
                      setSelectedInterestItem(null);
                      setInterestPrincipalAction("none");
                      setInterestPrincipalWithdrawSum("");
                    }}
                    className={`py-3 font-black rounded-xl text-xs text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
                      isGive ? "bg-emerald-500 hover:bg-emerald-400" : "bg-rose-500 hover:bg-rose-400"
                    }`}
                  >
                    {isGive ? "📥 Продовжити" : "📤 Продовжити"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {selectedReminderItem && (() => {
          const it = selectedReminderItem;
          const isInterest = !!it.isInterest;
          const currentTerm = isInterest ? (it.dueDate || it.date) : it.date;

          const getCurrencySymbol = (curr?: string) => {
            if (curr === "USD") return "$";
            if (curr === "EUR") return "€";
            return "₴";
          };

          const addMonthsToDateStr = (baseDateStr: string, monthsToAdd: number) => {
            if (!baseDateStr) return "";
            const parts = baseDateStr.split('-');
            if (parts.length !== 3) return baseDateStr;
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            const dateObj = new Date(y, m, d);
            dateObj.setMonth(dateObj.getMonth() + monthsToAdd);
            const newY = dateObj.getFullYear();
            const newM = String(dateObj.getMonth() + 1).padStart(2, '0');
            const newD = String(dateObj.getDate()).padStart(2, '0');
            return `${newY}-${newM}-${newD}`;
          };

          return (
            <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-[390px] animate-scaleIn shadow-2xl flex flex-col gap-4 text-left max-h-[92vh] overflow-y-auto">
                <h3 className="font-extrabold text-white text-base flex items-center gap-2 border-b border-slate-800/80 pb-3">
                  <span>🔔 Керування нагадуванням</span>
                </h3>

                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-widest">
                    {isInterest ? "Договір з нарахуванням %:" : "Запланована операція:"}
                  </span>
                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800/50 flex flex-col gap-2">
                    <span className="text-white font-black text-sm truncate">{it.name}</span>
                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/30">
                      <span className="text-slate-400 font-bold">Сума:</span>
                      <span className={`font-black font-mono ${it.type === "expense" ? "text-rose-400" : "text-emerald-400"}`}>
                        {it.type === "expense" ? "-" : "+"}
                        {it.sum} {getCurrencySymbol(it.currency)}
                      </span>
                    </div>

                    {isInterest ? (
                      <div className="flex flex-col gap-1 pt-1.5 border-t border-slate-800/30 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-bold">📅 Чергова дата виплати %:</span>
                          <span className="text-sky-400 font-black font-mono">{formatDateUkr(currentTerm)}</span>
                        </div>
                        {it.interestStartDate && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 font-medium">⏳ Відсотки рахуються з:</span>
                            <span className="text-emerald-400 font-bold font-mono">{formatDateUkr(it.interestStartDate)}</span>
                          </div>
                        )}
                        {it.dueDate && it.dueDate !== currentTerm && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-500 font-medium">🏁 Термін дії договору (тіло):</span>
                            <span className="text-amber-400 font-bold font-mono">{formatDateUkr(it.dueDate)}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/30">
                        <span className="text-slate-400 font-bold">📅 Планова дата платежу:</span>
                        <span className="text-sky-400 font-black font-mono">{formatDateUkr(currentTerm)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Секція пролонгації або перенесення дати */}
                <div className="flex flex-col gap-3 bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800/40">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold text-slate-300 uppercase tracking-widest">
                        {isInterest ? "⏳ Перенести або пролонгувати виплату %:" : "⏳ Перенести планову дату:"}
                      </label>
                      {newDueDate && newDueDate !== currentTerm && (
                        <span className="text-[10px] text-sky-400 font-bold font-mono">
                          (нова: {formatDateUkr(newDueDate)})
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-0.5">
                      <button
                        type="button"
                        onClick={() => setNewDueDate(addMonthsToDateStr(newDueDate || currentTerm, 1))}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-sky-400 font-extrabold text-[11px] rounded-lg border border-slate-700 transition-all cursor-pointer"
                        title="Додати 1 місяць до терміну"
                      >
                        +1 міс
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewDueDate(addMonthsToDateStr(newDueDate || currentTerm, 3))}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-sky-400 font-extrabold text-[11px] rounded-lg border border-slate-700 transition-all cursor-pointer"
                        title="Додати 3 місяці до терміну"
                      >
                        +3 міс
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewDueDate(addMonthsToDateStr(newDueDate || currentTerm, 6))}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-sky-400 font-extrabold text-[11px] rounded-lg border border-slate-700 transition-all cursor-pointer"
                        title="Додати 6 місяців до терміну"
                      >
                        +6 міс
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewDueDate(addMonthsToDateStr(newDueDate || currentTerm, 12))}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 active:scale-95 text-sky-400 font-extrabold text-[11px] rounded-lg border border-slate-700 transition-all cursor-pointer"
                        title="Додати 1 рік до терміну"
                      >
                        +1 рік
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                        className="flex-1 bg-slate-800 border-2 border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                      />
                      <button
                        type="button"
                        disabled={!newDueDate || newDueDate === currentTerm}
                        onClick={async () => {
                          const updatedItem = { ...it };
                          updatedItem.dueDate = newDueDate;
                          updatedItem.date = newDueDate;
                          await handleSavePlannedLocal(updatedItem, it.type);
                          setSelectedReminderItem(null);
                        }}
                        className="px-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all active:scale-95 shadow-md shadow-violet-600/10"
                      >
                        💾 Оновити
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1 font-bold">
                  <button
                    type="button"
                    onClick={() => setSelectedReminderItem(null)}
                    className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all active:scale-[0.98]"
                  >
                    Закрити
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleFulfillPlannedLocal(it);
                      setSelectedReminderItem(null);
                    }}
                    className={`py-3 font-black rounded-xl text-xs text-white shadow-lg transition-all active:scale-[0.98] ${
                      it.type === "expense" ? "bg-rose-500 hover:bg-rose-400" : "bg-emerald-500 hover:bg-emerald-400"
                    }`}
                  >
                    {isInterest ? (it.type === "income" ? "📈 Розрахувати та отримати %" : "📈 Розрахувати та виплатити %") : "💵 Сплатити / Виконати"}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        <InitialDataModal
          isOpen={isInitialDataModalOpen}
          onClose={() => setIsInitialDataModalOpen(false)}
          initData={initData}
          currentCurrency={currentCurrency}
          onSaveAdjustment={handleSaveAdjustmentLocal}
          onSaveInitialDebt={handleSaveInitialDebtLocal}
          loading={loading}
        />

        {showUndoConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-4 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <Undo2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white mb-1">Підтвердження відміни</h3>
                <p className="text-xs text-slate-400">
                  Ви дійсно хочете відмінити та повністю стерти останній створений запис?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 font-bold">
                <button
                  type="button"
                  onClick={() => setShowUndoConfirm(false)}
                  className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all active:scale-95"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={executeUndoLastRecord}
                  className="py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-all active:scale-95 shadow-lg shadow-amber-500/20"
                >
                  Так, відмінити
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
}
