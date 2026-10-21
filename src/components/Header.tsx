import React from "react";
import { createPortal } from "react-dom";
import { LogOut, RefreshCw, Layers, Maximize, Minimize, Fingerprint, Smartphone, Lock, Scale } from "lucide-react";
import { User } from "firebase/auth";
import { formatRatesLastUpdated } from "../lib/dailyRates";

interface HeaderProps {
  user: User | null;
  currentCurrency: string;
  onCurrencyToggle: () => void;
  onRefresh: () => void;
  onLogout: () => void;
  onNavigateToGlobalCapital: () => void;
  loading: boolean;
  isConnected?: boolean;
  isSessionExpired?: boolean;
  onLock?: () => void;
  onPinSetup?: () => void;
  onOpenInitialDataModal?: () => void;
  ratesLastUpdated?: string;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  currentCurrency,
  onCurrencyToggle,
  onRefresh,
  onLogout,
  onNavigateToGlobalCapital,
  loading,
  isConnected = false,
  isSessionExpired = false,
  onLock,
  onPinSetup,
  onOpenInitialDataModal,
  ratesLastUpdated
}) => {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [showQrModal, setShowQrModal] = React.useState(false);

  React.useEffect(() => {
    const handleIntercept = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (showQrModal) {
        customEvent.detail.preventScreenTransition();
        setShowQrModal(false);
      }
    };
    window.addEventListener("app-back-intercept", handleIntercept);
    return () => window.removeEventListener("app-back-intercept", handleIntercept);
  }, [showQrModal]);

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      if (document.documentElement?.requestFullscreen) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.warn("Fullscreen toggle error:", err);
        });
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          console.warn(err);
        });
      }
    }
  };

  const isFullscreenSupported = typeof document.documentElement !== "undefined" && typeof document.documentElement.requestFullscreen === "function";

  const getCurrencySymbol = (c: string) => {
    if (c === "UAH") return "🇺🇦 ₴ UAH";
    if (c === "USD") return "🇺🇸 $ USD";
    if (c === "EUR") return "🇪🇺 € EUR";
    return c;
  };

  const getHeaderBgClass = () => {
    return "bg-black border-slate-900 shadow-[0_4px_20px_rgba(0,0,0,0.8)]";
  };

  const getCurrencyBtnClass = () => {
    if (currentCurrency === "UAH") {
      return "bg-sky-900/80 text-sky-300 border-2 border-sky-500/40 hover:bg-sky-800 hover:text-white hover:border-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.25)]";
    }
    if (currentCurrency === "USD") {
      return "bg-emerald-900/80 text-emerald-300 border-2 border-emerald-500/40 hover:bg-emerald-800 hover:text-white hover:border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.25)]";
    }
    if (currentCurrency === "EUR") {
      return "bg-indigo-900/80 text-indigo-300 border-2 border-indigo-500/40 hover:bg-indigo-800 hover:text-white hover:border-indigo-400 shadow-[0_0_12px_rgba(99,102,241,0.25)]";
    }
    return "bg-slate-800 text-sky-400 border border-slate-700";
  };

  const getStatusDotClass = () => {
    if (loading) return "bg-sky-400 animate-pulse";
    if (isSessionExpired) return "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]";
    if (isConnected) return "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]";
    return "bg-slate-500";
  };

  const getStatusTitle = () => {
    if (loading) return "Йде синхронізація з Google Sheets...";
    if (isSessionExpired) return "Сесія Google застаріла. Натисніть «Оновити» або увійдіть повторно.";
    if (isConnected) return "Google Sheets підключено в реальному часі";
    return "Таблицю Google Sheets не підключено";
  };

  return (
    <header className={`flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 border-b sticky top-0 z-50 backdrop-blur-md h-[53px] sm:h-[61px] transition-all duration-700 ${getHeaderBgClass()}`}>
      <div className="flex items-center gap-2">
        {/* User avatar with Google Sheets connection status dot */}
        <div className="relative shrink-0 cursor-help" title={getStatusTitle()}>
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt="Avatar"
              className="w-9 h-9 rounded-full border border-slate-700 object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-slate-200">
              {user?.displayName?.charAt(0) || "U"}
            </div>
          )}
          {/* Status Indicator Dot */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-900 transition-all ${getStatusDotClass()}`}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-2 bg-slate-800 border border-slate-700 hover:bg-slate-700 rounded-xl text-slate-200 transition-all active:scale-95 disabled:opacity-50"
          title={`Оновити • ${formatRatesLastUpdated(ratesLastUpdated)}`}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-sky-400" : ""}`} />
        </button>

        <button
          onClick={onCurrencyToggle}
          className={`px-3 py-1.5 font-black rounded-xl text-xs sm:text-sm tracking-wide transition-all active:scale-95 ${getCurrencyBtnClass()}`}
          title={`Змінити відображувану валюту • ${formatRatesLastUpdated(ratesLastUpdated)}`}
        >
          {getCurrencySymbol(currentCurrency)}
        </button>

        {onOpenInitialDataModal && (
          <button
            onClick={onOpenInitialDataModal}
            className="p-2 bg-slate-800 border border-slate-700 hover:bg-amber-900/30 hover:border-amber-700 hover:text-amber-400 rounded-xl text-amber-400 transition-all active:scale-95"
            title="Внесення початкових даних (Залишки / Борги)"
          >
            <Scale className="w-4 h-4" />
          </button>
        )}

        {onLock && (
          <button
            onClick={onLock}
            className="p-2 bg-slate-800 border border-slate-700 hover:bg-sky-900/30 hover:border-sky-700 hover:text-sky-400 rounded-xl text-sky-400 transition-all active:scale-95"
            title="Заблокувати відбитком"
          >
            <Fingerprint className="w-4 h-4" />
          </button>
        )}

        {onPinSetup && (
          <button
            onClick={onPinSetup}
            className="p-2 bg-slate-800 border border-slate-700 hover:bg-sky-900/30 hover:border-sky-700 hover:text-sky-400 rounded-xl text-sky-400 transition-all active:scale-95"
            title="Налаштувати PIN-код входу"
          >
            <Lock className="w-4 h-4" />
          </button>
        )}

        {isFullscreenSupported && (
          <button
            onClick={toggleFullscreen}
            className="p-2 bg-slate-800 border border-slate-700 hover:bg-sky-900/30 hover:border-sky-700 hover:text-sky-400 rounded-xl text-sky-400 transition-all active:scale-95"
            title={isFullscreen ? "Вийти з повного екрану" : "Увімкнути повний екран"}
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        )}

        <button
          onClick={() => setShowQrModal(true)}
          className="p-2 bg-slate-800 border border-slate-700 hover:bg-sky-900/30 hover:border-sky-700 hover:text-sky-400 rounded-xl text-sky-400 transition-all active:scale-95"
          title="Відкрити на телефоні (QR-код)"
        >
          <Smartphone className="w-4 h-4" />
        </button>

        <button
          onClick={onLogout}
          className="p-2 bg-slate-800 border border-slate-700 hover:bg-red-900/30 hover:border-red-700 hover:text-red-400 rounded-xl text-slate-400 transition-all active:scale-95"
          title="Вийти"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {showQrModal && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="relative bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-xs w-full text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-slate-100 mb-1">
              Перенести на телефон
            </h3>
            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed font-semibold">
              Наведіть камеру телефону на QR-код нижче:
            </p>
            
            <div className="bg-white p-3 rounded-2xl w-36 h-36 mx-auto mb-4 flex items-center justify-center shadow-inner">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=0f172a&bgcolor=ffffff&data=${encodeURIComponent(window.location.href)}`}
                alt="QR Code"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="bg-slate-950/40 border border-slate-800/80 p-2.5 rounded-2xl text-left mb-4">
              <span className="text-[9px] font-black text-sky-400 uppercase tracking-wider block mb-0.5">💡 Порада для зручності:</span>
              <p className="text-[9px] text-slate-400 font-bold leading-normal">
                Після відкриття на телефоні натисніть кнопку <span className="text-sky-400 font-black">"Поділитися" (Share)</span> та оберіть <span className="text-sky-400 font-black">"Додати на початковий екран"</span>.
              </p>
            </div>

            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition-all active:scale-95 text-[11px] uppercase tracking-wider"
            >
              Закрити
            </button>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
};
