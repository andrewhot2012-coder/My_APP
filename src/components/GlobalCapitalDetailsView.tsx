import React from "react";
import { ArrowRight, Landmark, Coins, TrendingUp, TrendingDown, Info, RefreshCw, Calendar, Sparkles, Sliders, ShieldCheck, ArrowUpRight, ArrowDownRight, HelpCircle, X, Scale, Calculator, Lightbulb } from "lucide-react";
import { InitData } from "../types";

interface GlobalCapitalDetailsViewProps {
  initData: InitData | null;
  onBack: () => void;
  rateUsd: string;
  rateUsdSell: string;
  rateEur: string;
  rateEurSell: string;
  rateSource: string;
  onRateUsdChange: (val: string) => void;
  onRateUsdSellChange: (val: string) => void;
  onRateEurChange: (val: string) => void;
  onRateEurSellChange: (val: string) => void;
  onRateSourceChange: (val: string) => void;
  onForceRefreshRates: (source?: string) => Promise<boolean>;
  summaryBase: string;
  onSummaryBaseChange: (val: string) => void;
  onNavigateToCurrencyCapital?: (cur: "UAH" | "USD" | "EUR") => void;
  onSelectContractor?: (name: string) => void;
  currentCurrency: "UAH" | "USD" | "EUR";
  onOpenComprehensiveReport?: () => void;
}

export const GlobalCapitalDetailsView: React.FC<GlobalCapitalDetailsViewProps> = ({
  initData,
  onBack,
  rateUsd,
  rateUsdSell,
  rateEur,
  rateEurSell,
  rateSource,
  onRateUsdChange,
  onRateUsdSellChange,
  onRateEurChange,
  onRateEurSellChange,
  onRateSourceChange,
  onForceRefreshRates,
  summaryBase,
  onSummaryBaseChange,
  onNavigateToCurrencyCapital,
  onSelectContractor,
  currentCurrency,
  onOpenComprehensiveReport
}) => {
  const [showPrintPreview, setShowPrintPreview] = React.useState(false);
  const [showGlobalHint, setShowGlobalHint] = React.useState(false);

  React.useEffect(() => {
    const handleIntercept = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (showPrintPreview) {
        customEvent.detail.preventScreenTransition();
        setShowPrintPreview(false);
      }
    };
    window.addEventListener("app-back-intercept", handleIntercept);
    return () => window.removeEventListener("app-back-intercept", handleIntercept);
  }, [showPrintPreview]);

  const getCurrencySymbol = (c: string) => {
    if (c === "UAH") return "₴";
    if (c === "USD") return "$";
    if (c === "EUR") return "€";
    return c;
  };

  const getCurrencyNameUk = (c: string) => {
    if (c === "UAH") return "Гривня";
    if (c === "USD") return "Долар США";
    if (c === "EUR") return "Євро";
    return c;
  };

  const getCurrencyFlag = (c: string) => {
    if (c === "UAH") return "🇺🇦";
    if (c === "USD") return "🇺🇸";
    if (c === "EUR") return "🇪🇺";
    return "🌐";
  };

  const rUsd = parseFloat(rateUsd) || 0;
  const rEur = parseFloat(rateEur) || 0;

  const uah = initData?.globalTotals.UAH || 0;
  const usd = initData?.globalTotals.USD || 0;
  const eur = initData?.globalTotals.EUR || 0;

  const weOweUsd = initData?.weOweTotals?.USD || 0;
  const weOweEur = initData?.weOweTotals?.EUR || 0;

  const rUsdSellCalculated = parseFloat(rateUsdSell) || rUsd;
  const rEurSellCalculated = parseFloat(rateEurSell) || rEur;

  // Real-world Kantor cash conversion helper:
  const convertBalance = (amount: number, from: string, to: string) => {
    if (from === to) return amount;
    
    if (amount >= 0) {
      // Rule 1: Positive balance (asset)
      // 1. Convert from 'from' currency to UAH (sell 'from' currency to Kantor)
      let uahAmount = 0;
      if (from === "UAH") {
        uahAmount = amount;
      } else if (from === "USD") {
        uahAmount = amount * rUsd;
      } else if (from === "EUR") {
        uahAmount = amount * rEur;
      }

      // 2. Convert from UAH to 'to' currency (buy 'to' currency from Kantor)
      if (to === "UAH") {
        return uahAmount;
      } else if (to === "USD") {
        return rUsdSellCalculated > 0 ? uahAmount / rUsdSellCalculated : 0;
      } else if (to === "EUR") {
        return rEurSellCalculated > 0 ? uahAmount / rEurSellCalculated : 0;
      }
    } else {
      // Rule 2: Negative balance (debt)
      const absAmount = Math.abs(amount);
      // 1. Find how much UAH is needed to buy the 'from' currency from Kantor
      let uahNeeded = 0;
      if (from === "UAH") {
        uahNeeded = absAmount;
      } else if (from === "USD") {
        uahNeeded = absAmount * rUsdSellCalculated;
      } else if (from === "EUR") {
        uahNeeded = absAmount * rEurSellCalculated;
      }

      // 2. Find how much of 'to' currency we must sell to Kantor to get that UAH
      let toNeeded = 0;
      if (to === "UAH") {
        toNeeded = uahNeeded;
      } else if (to === "USD") {
        toNeeded = rUsd > 0 ? uahNeeded / rUsd : 0;
      } else if (to === "EUR") {
        toNeeded = rEur > 0 ? uahNeeded / rEur : 0;
      }
      return -toNeeded;
    }
    return 0;
  };

  const uahInUah = uah;
  const usdInUah = usd >= 0 ? usd * rUsd : usd * rUsdSellCalculated;
  const eurInUah = eur >= 0 ? eur * rEur : eur * rEurSellCalculated;

  const totalInUah = uahInUah + usdInUah + eurInUah;

  const getCombinedDisplay = (base: string) => {
    const total = convertBalance(uah, "UAH", base) + convertBalance(usd, "USD", base) + convertBalance(eur, "EUR", base);
    return total.toFixed(2);
  };

  const handleToggleSummaryBase = () => {
    onSummaryBaseChange(
      summaryBase === "UAH" ? "USD" : summaryBase === "USD" ? "EUR" : "UAH"
    );
  };

  // Theme accents for the active base currency
  const getThemeClass = () => {
    if (summaryBase === "UAH") {
      return {
        cardGlow: "shadow-[0_0_20px_rgba(56,189,248,0.12)] border-sky-500/20 bg-slate-900/90",
        pillText: "text-sky-400 bg-sky-950/40 border border-sky-900/30",
        accentText: "text-sky-400",
        badge: "🇺🇦"
      };
    }
    if (summaryBase === "USD") {
      return {
        cardGlow: "shadow-[0_0_20px_rgba(16,185,129,0.12)] border-emerald-500/20 bg-emerald-950/10",
        pillText: "text-emerald-400 bg-emerald-950/40 border border-emerald-900/30",
        accentText: "text-emerald-400",
        badge: "🇺🇸"
      };
    }
    if (summaryBase === "EUR") {
      return {
        cardGlow: "shadow-[0_0_20px_rgba(99,102,241,0.12)] border-indigo-500/20 bg-indigo-950/10",
        pillText: "text-indigo-400 bg-indigo-950/40 border border-indigo-900/30",
        accentText: "text-indigo-400",
        badge: "🇪🇺"
      };
    }
    return {
      cardGlow: "border-slate-800 bg-slate-900",
      pillText: "text-slate-400 bg-slate-800/40",
      accentText: "text-white",
      badge: "🌐"
    };
  };

  const currentTheme = getThemeClass();

  // Calculate percentage share based on absolute values to handle negative balances gracefully
  const absUah = Math.abs(uahInUah);
  const absUsd = Math.abs(usdInUah);
  const absEur = Math.abs(eurInUah);
  const totalAbs = (absUah + absUsd + absEur) || 1;

  const uahShare = (absUah / totalAbs) * 100;
  const usdShare = (absUsd / totalAbs) * 100;
  const eurShare = (absEur / totalAbs) * 100;

  const ukDate = new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date());

  const formatValue = (val: any) => {
    const num = parseFloat(val) || 0;
    const parts = num.toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.join(".");
  };

  if (showPrintPreview) {
    const banksList = initData?.capital?.banks ? Object.entries(initData.capital.banks) : [];
    const aliases = initData?.allAliases[summaryBase as "UAH" | "USD" | "EUR"] || {};
    
    return (
      <div className="fixed inset-0 bg-white z-[9999] overflow-y-auto p-6 md:p-12 text-slate-900 font-sans">
        {/* Top Control Header - Hidden during actual print */}
        <div className="no-print bg-slate-900 border border-slate-800 text-white p-4 rounded-2xl mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-start gap-2.5 text-left">
            <span className="text-xl">📄</span>
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-xs text-slate-200">Попередній перегляд фінансового звіту</span>
              <p className="text-[10px] text-slate-400 leading-tight max-w-md">
                Якщо діалогове вікно друку не відкрилося автоматично (через блокування iframe), натисніть кнопку "Надрукувати" або скористайтеся клавішами <kbd className="bg-slate-800 px-1 py-0.5 rounded text-white font-mono">Ctrl + P</kbd>.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => {
                try {
                  window.print();
                } catch (e) {
                  console.warn(e);
                }
              }}
              type="button"
              className="py-2 px-4 text-xs font-black bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all cursor-pointer shadow-sm shadow-blue-900/10 active:scale-95 flex items-center gap-1.5"
            >
              🖨️ Надрукувати
            </button>
            <button
              onClick={() => setShowPrintPreview(false)}
              type="button"
              className="py-2 px-4 text-xs font-black bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl transition-all cursor-pointer active:scale-95"
            >
              Закрити
            </button>
          </div>
        </div>

        {/* Printable document container */}
        <div className="max-w-4xl mx-auto border border-slate-200 p-8 rounded-xl bg-white shadow-sm print:border-0 print:p-0 print:shadow-none">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="text-left">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">ЗВЕДЕНИЙ ФІНАНСОВИЙ ЗВІТ</h1>
              <p className="text-xs text-slate-500 mt-1 uppercase tracking-wider font-bold">Система контролю капіталу & Зведеного бюджету</p>
            </div>
            <div className="text-left md:text-right text-xs text-slate-600">
              <p className="font-bold">Дата генерації звіту:</p>
              <p className="font-medium text-slate-800 mt-0.5">{ukDate}</p>
            </div>
          </div>

          {/* Exchange rates */}
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 text-left">Курси перерахунку валют</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs text-left">
              <div>
                <span className="font-bold text-slate-700">🇺🇸 USD (Долар США):</span>
                <p className="mt-1 font-semibold text-slate-800">
                  Купівля: {rateUsd} ₴ | Продаж: {rateUsdSell} ₴
                </p>
              </div>
              <div>
                <span className="font-bold text-slate-700">🇪🇺 EUR (Євро):</span>
                <p className="mt-1 font-semibold text-slate-800">
                  Купівля: {rateEur} ₴ | Продаж: {rateEurSell} ₴
                </p>
              </div>
              <div className="sm:col-span-2 border-t border-slate-200 pt-2 text-[10px] text-slate-500 font-medium">
                Джерело курсів: <span className="font-bold text-slate-700 uppercase">{rateSource}</span>
              </div>
            </div>
          </div>

          {/* Consolidated Summary Balances */}
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 text-left">Загальний зведений капітал</h2>
            <div className="grid grid-cols-3 gap-3 bg-slate-900 text-white p-4 rounded-xl text-center">
              <div className="p-2 border-r border-slate-850">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Гривневий еквівалент</p>
                <p className="text-base font-black mt-1 text-sky-400">{getCombinedDisplay("UAH")} ₴</p>
              </div>
              <div className="p-2 border-r border-slate-850">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Доларовий еквівалент</p>
                <p className="text-base font-black mt-1 text-emerald-400">{getCombinedDisplay("USD")} $</p>
              </div>
              <div className="p-2">
                <p className="text-[10px] text-slate-400 uppercase font-black tracking-wider">Євро еквівалент</p>
                <p className="text-base font-black mt-1 text-indigo-400">{getCombinedDisplay("EUR")} €</p>
              </div>
            </div>
          </div>

          {/* Distribution per currency */}
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 text-left">Розподіл за валютами</h2>
            <table className="w-full text-xs text-left border-collapse border border-slate-200 rounded-xl overflow-hidden">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="p-3 font-bold text-slate-700">Валюта</th>
                  <th className="p-3 font-bold text-slate-700">Базова сума</th>
                  <th className="p-3 font-bold text-slate-700">Курс перерахунку</th>
                  <th className="p-3 font-bold text-slate-700 text-right">Гривневий еквівалент</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-3 font-bold">🇺🇦 UAH (Гривня)</td>
                  <td className="p-3">{formatValue(uah)} ₴</td>
                  <td className="p-3 text-slate-400">1.00 (Базова)</td>
                  <td className="p-3 text-right font-bold">{formatValue(uah)} ₴</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold">🇺🇸 USD (Долар США)</td>
                  <td className="p-3">{formatValue(usd)} $</td>
                  <td className="p-3">{usd >= 0 ? rateUsd : rateUsdSell} ₴</td>
                  <td className="p-3 text-right font-bold">{formatValue(usdInUah)} ₴</td>
                </tr>
                <tr>
                  <td className="p-3 font-bold">🇪🇺 EUR (Євро)</td>
                  <td className="p-3">{formatValue(eur)} €</td>
                  <td className="p-3">{eur >= 0 ? rateEur : rateEurSell} ₴</td>
                  <td className="p-3 text-right font-bold">{formatValue(eurInUah)} ₴</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Active Accounts Breakdown */}
          {banksList.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 text-left">
                Детальний баланс рахунків (У {summaryBase})
              </h2>
              <table className="w-full text-xs text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-3 font-bold text-slate-700">Назва рахунку / банку</th>
                    <th className="p-3 font-bold text-slate-700">Офіційна назва системи</th>
                    <th className="p-3 font-bold text-slate-700 text-right">Сума балансу</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {banksList.map(([bKey, bVal], idx) => {
                    const customName = aliases[bKey] || bKey;
                    return (
                      <tr key={idx}>
                        <td className="p-3 font-bold text-slate-800">{customName}</td>
                        <td className="p-3 text-slate-500 font-mono text-[10px]">{bKey}</td>
                        <td className="p-3 text-right font-bold">
                          {formatValue(bVal)} {getCurrencySymbol(summaryBase)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-bold border-t border-slate-300">
                    <td className="p-3" colSpan={2}>Всього на рахунках:</td>
                    <td className="p-3 text-right font-black text-slate-900">
                      {formatValue(initData?.capital?.bankTotal)} {getCurrencySymbol(summaryBase)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Debtors details */}
          {((initData?.debtors?.oweUs && initData.debtors.oweUs.length > 0) || 
            (initData?.debtors?.weOwe && initData.debtors.weOwe.length > 0)) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {initData?.debtors?.oweUs && initData.debtors.oweUs.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 text-left">👤 Нам винні (Борги нам)</h3>
                  <table className="w-full text-xs text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="p-2 font-bold text-slate-700">Контрагент</th>
                        <th className="p-2 font-bold text-slate-700 text-right">Сума боргу</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {initData.debtors.oweUs.map((debt, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-medium">
                            <button
                              type="button"
                              onClick={() => onSelectContractor?.(debt.name)}
                              className="text-left font-bold hover:text-sky-600 dark:hover:text-sky-400 transition-colors flex items-center gap-1 cursor-pointer hover:underline"
                            >
                              👤 {debt.name}
                            </button>
                          </td>
                          <td className="p-2 text-right font-bold text-emerald-600">
                            +{formatValue(debt.sum)} {getCurrencySymbol(currentCurrency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {initData?.debtors?.weOwe && initData.debtors.weOwe.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 text-left">👤 Наші борги (Ми винні)</h3>
                  <table className="w-full text-xs text-left border-collapse border border-slate-200">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="p-2 font-bold text-slate-700">Кому винні</th>
                        <th className="p-2 font-bold text-slate-700 text-right">Сума боргу</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {initData.debtors.weOwe.map((debt, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-medium">
                            <button
                              type="button"
                              onClick={() => onSelectContractor?.(debt.name)}
                              className="text-left font-bold hover:text-sky-600 dark:hover:text-sky-400 transition-colors flex items-center gap-1 cursor-pointer hover:underline"
                            >
                              👤 {debt.name}
                            </button>
                          </td>
                          <td className="p-2 text-right font-bold text-red-600">
                            -{formatValue(debt.sum)} {getCurrencySymbol(currentCurrency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Footer signature */}
          <div className="border-t border-slate-200 mt-12 pt-6 text-[10px] text-slate-400 flex justify-between items-center">
            <span>Звіт сформовано автоматично за допомогою системи контролю капіталу</span>
            <span className="font-mono text-slate-300">ПІДПИС НЕ ПОТРІБЕН</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-left animate-fadeIn">
      {/* Printable Report Header (Visible only when printing) */}
      <div className="print-only-block border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">ЗВЕДЕНИЙ ФІНАНСОВИЙ ЗВІТ</h1>
            <p className="text-xs text-slate-600 mt-1">Система контролю капіталу & Зведеного бюджету</p>
          </div>
          <div className="text-right text-xs text-slate-600">
            <p className="font-bold">Дата генерації:</p>
            <p>{ukDate}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
          <div>
            <p className="font-bold text-slate-800">Курси перерахунку:</p>
            <p>🇺🇸 USD (Долар США): купівля {rateUsd} ₴ / продаж {rateUsdSell} ₴</p>
            <p>🇪🇺 EUR (Євро): купівля {rateEur} ₴ / продаж {rateEurSell} ₴</p>
            <p className="text-[10px] text-slate-500 mt-1">Джерело даних: {rateSource.toUpperCase()}</p>
          </div>
          <div className="text-right">
            <p className="font-bold text-slate-800">Загальний зведений баланс:</p>
            <p className="text-sm font-black text-slate-900 mt-1">
              {getCombinedDisplay("UAH")} ₴ | {getCombinedDisplay("USD")} $ | {getCombinedDisplay("EUR")} €
            </p>
          </div>
        </div>
      </div>

      {/* Centered Title */}
      <div className="flex flex-col items-center justify-center text-center mt-1 no-print">
        <h2 className="text-xl font-black text-white flex items-center gap-2 justify-center">
          <span className="text-2xl">🗳️</span> Зведений капітал
        </h2>
      </div>

      {/* Grid of wide buttons (Back & Print) */}
      <div className="grid grid-cols-2 gap-3 no-print">
        <button
          onClick={onBack}
          type="button"
          className="py-3 px-4 text-xs font-bold text-slate-400 hover:text-white transition-all bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
        >
          Назад
        </button>
        {onOpenComprehensiveReport && (
          <button
            onClick={onOpenComprehensiveReport}
            type="button"
            className="py-3 px-4 text-xs font-black text-white transition-all bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-sky-950/40 active:scale-95"
          >
            🏛️ Повний зведений звіт
          </button>
        )}
        <button
          onClick={() => {
            setShowPrintPreview(true);
            setTimeout(() => {
              try {
                window.print();
              } catch (e) {
                console.warn("window.print failed or blocked inside iframe", e);
              }
            }, 300);
          }}
          type="button"
          className="py-3 px-4 text-xs font-bold text-sky-400 hover:text-white transition-all bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
        >
          🖨️ Друк короткого звіту
        </button>
      </div>

      {/* Rates settings card */}
      <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl flex flex-col gap-3.5 shadow-sm no-print">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
            ⚙️ Джерело курсів:
          </span>
          <select
            value={rateSource}
            onChange={(e) => {
              onRateSourceChange(e.target.value);
              onForceRefreshRates(e.target.value);
            }}
            className="bg-slate-800 p-2 rounded-xl text-white font-bold outline-none text-xs border border-slate-700 max-w-[185px] cursor-pointer"
          >
            <option value="telegram">Telegram (EXCHANGE)</option>
            <option value="minfin">Мінфін чорний ринок</option>
            <option value="nbu">НБУ Офіційний</option>
          </select>
        </div>

        <button
          onClick={() => onForceRefreshRates(rateSource)}
          type="button"
          className="py-3 w-full bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-95 shadow-md shadow-blue-900/10 cursor-pointer"
        >
          🔄 Оновити курс примусово
        </button>

        {/* Buy/Sell Fields for USD/EUR */}
        <div className="grid grid-cols-2 gap-3.5 border-t border-slate-800/60 pt-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">USD Купівля</label>
            <input
              type="number"
              step="0.01"
              value={rateUsd}
              onChange={(e) => onRateUsdChange(e.target.value)}
              placeholder="44.70"
              inputMode="decimal"
              className="bg-slate-800 border-2 border-slate-700 focus:border-sky-400 p-2.5 rounded-xl text-white outline-none font-black text-sm text-center"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">USD Продаж</label>
            <input
              type="number"
              step="0.01"
              value={rateUsdSell}
              onChange={(e) => onRateUsdSellChange(e.target.value)}
              placeholder="45.10"
              inputMode="decimal"
              className="bg-slate-800 border-2 border-slate-700 focus:border-sky-400 p-2.5 rounded-xl text-white outline-none font-black text-sm text-center"
            />
          </div>
          <div className="flex flex-col gap-1 mt-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">EUR Купівля</label>
            <input
              type="number"
              step="0.01"
              value={rateEur}
              onChange={(e) => onRateEurChange(e.target.value)}
              placeholder="51.20"
              inputMode="decimal"
              className="bg-slate-800 border-2 border-slate-700 focus:border-sky-400 p-2.5 rounded-xl text-white outline-none font-black text-sm text-center"
            />
          </div>
          <div className="flex flex-col gap-1 mt-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">EUR Продаж</label>
            <input
              type="number"
              step="0.01"
              value={rateEurSell}
              onChange={(e) => onRateEurSellChange(e.target.value)}
              placeholder="51.50"
              inputMode="decimal"
              className="bg-slate-800 border-2 border-slate-700 focus:border-sky-400 p-2.5 rounded-xl text-white outline-none font-black text-sm text-center"
            />
          </div>
        </div>
      </div>

      {/* Main Total display card */}
      <div 
        onClick={handleToggleSummaryBase}
        className={`border p-6 rounded-3xl flex flex-col transition-all duration-500 cursor-pointer active:scale-[0.99] group ${currentTheme.cardGlow}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <span>{currentTheme.badge}</span>
            СУМАРНО У {summaryBase === "UAH" ? "ГРИВНІ" : summaryBase === "USD" ? "ДОЛАРАХ" : "ЄВРО"}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowGlobalHint(true);
              }}
              className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer no-print"
              title="Підказка до правил розрахунку"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </span>
          <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${currentTheme.pillText} no-print`}>
            Клік для зміни валюти
          </span>
        </div>
        
        <div className="flex items-baseline gap-2 mt-3.5">
          <span className="text-4xl font-black text-white tracking-tight">
            {getCombinedDisplay(summaryBase)}
          </span>
          <span className={`text-2xl font-bold ${currentTheme.accentText}`}>
            {getCurrencySymbol(summaryBase)}
          </span>
        </div>

        {/* Mini progress bar of distribution */}
        <div className="flex h-1.5 w-full bg-slate-800/80 rounded-full overflow-hidden mt-5 gap-0.5">
          <div 
            title={`Гривня: ${uahShare.toFixed(1)}%`} 
            style={{ width: `${uahShare}%` }} 
            className="bg-sky-400 rounded-l-full transition-all duration-1000"
          />
          <div 
            title={`Долар: ${usdShare.toFixed(1)}%`} 
            style={{ width: `${usdShare}%` }} 
            className="bg-emerald-400 transition-all duration-1000"
          />
          <div 
            title={`Євро: ${eurShare.toFixed(1)}%`} 
            style={{ width: `${eurShare}%` }} 
            className="bg-indigo-400 rounded-r-full transition-all duration-1000"
          />
        </div>

        <div className="flex justify-between items-center mt-3 text-[10px] text-slate-500 font-bold px-0.5">
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-sky-400 rounded-full"></span> ₴ {uahShare.toFixed(0)}%</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span> $ {usdShare.toFixed(0)}%</span>
          <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span> € {eurShare.toFixed(0)}%</span>
        </div>
      </div>



      {/* Breakdown per currency grid */}
      <div className="flex flex-col gap-2.5 mt-1">
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 px-1 mt-1 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Coins className="w-4 h-4 text-slate-500" />
            Розподіл за валютами
          </span>
          <button
            type="button"
            onClick={() => setShowGlobalHint(true)}
            className="text-[10px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 cursor-pointer bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800 no-print"
          >
            <HelpCircle className="w-3 h-3" />
            <span>Як конвертується?</span>
          </button>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              key: "UAH",
              fullname: "UA ГРИВНЯ",
              flag: "🇺🇦",
              val: uah,
              symbol: "₴",
              rate: null,
              equiv: uahInUah,
              color: "from-sky-500/10 to-sky-500/0 hover:border-sky-500/40 border-sky-500/20"
            },
            {
              key: "USD",
              fullname: "US ДОЛАР",
              flag: "🇺🇸",
              val: usd,
              symbol: "$",
              rate: usd >= 0 ? rateUsd : rateUsdSell,
              equiv: usdInUah,
              color: "from-emerald-500/10 to-emerald-500/0 hover:border-emerald-500/40 border-emerald-500/20"
            },
            {
              key: "EUR",
              fullname: "EU ЄВРО",
              flag: "🇪🇺",
              val: eur,
              symbol: "€",
              rate: eur >= 0 ? rateEur : rateEurSell,
              equiv: eurInUah,
              color: "from-indigo-500/10 to-indigo-500/0 hover:border-indigo-500/40 border-indigo-500/20"
            }
          ].map((item) => {
            const isSelectedBase = summaryBase === item.key;

            return (
              <div
                key={item.key}
                onClick={() => onNavigateToCurrencyCapital?.(item.key as "UAH" | "USD" | "EUR")}
                className={`p-3.5 bg-gradient-to-br border rounded-2xl flex flex-col justify-between gap-2.5 cursor-pointer transition-all hover:scale-[1.02] active:scale-95 group ${item.color} ${
                  isSelectedBase ? "ring-2 ring-sky-400/50 border-sky-400/50 shadow-md shadow-sky-950/30" : "bg-slate-900/60"
                }`}
                title="Натисніть для детального звіту по рахунках"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-2 truncate">
                    <span className="text-xl select-none">{item.flag}</span>
                    <span className="text-xs font-black text-white group-hover:text-sky-400 transition-colors truncate">
                      {item.fullname}
                    </span>
                  </div>
                  {isSelectedBase && (
                    <span className="text-[8px] tracking-wide font-extrabold uppercase px-1.5 py-0.5 bg-sky-500/20 text-sky-400 border border-sky-500/40 rounded-md shrink-0">
                      База
                    </span>
                  )}
                </div>

                {/* Amount Main */}
                <div className="my-0.5">
                  <div className="text-lg font-black text-slate-100 tracking-tight leading-tight">
                    {(item.val ?? 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {item.symbol}
                  </div>
                  {item.key !== "UAH" && (
                    <div className="text-[11px] font-semibold text-slate-400 mt-0.5">
                      ≈ {(item.equiv ?? 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                    </div>
                  )}
                </div>

                {/* Exchange Rate */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500 font-bold">
                  {item.rate ? (
                    <span className="flex items-center gap-1 text-slate-400">
                      <TrendingUp className="w-3 h-3 text-sky-400" /> Курс: {item.rate} ₴
                    </span>
                  ) : (
                    <span>Базова валюта</span>
                  )}
                  <span className="flex items-center gap-0.5 text-slate-500 group-hover:text-sky-400 transition-colors no-print">
                    <span>Детальніше</span>
                    <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* GLOBAL CAPITAL HINT MODAL */}
      {showGlobalHint && (
        <div 
          onClick={() => setShowGlobalHint(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fadeIn text-white"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl flex flex-col gap-4 text-left relative max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30 shrink-0">
                  <Scale className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Правила конвертації та розрахунку
                  </h3>
                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block mt-0.5">
                    Ринкова оцінка активів та зобов'язань
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowGlobalHint(false)}
                className="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formula Block */}
            <div className="flex flex-col gap-1.5 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 text-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-sky-400" />
                Формула зведення у валюту {summaryBase}:
              </span>
              <div className="font-mono text-sky-300 font-bold bg-slate-900/90 p-2.5 rounded-xl border border-slate-800/80 text-[11px] leading-relaxed">
                Зведений капітал = Конвертація(UAH) + Конвертація(USD) + Конвертація(EUR)
              </div>
            </div>

            {/* Kantor Rules */}
            <div className="space-y-2 text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-3.5 rounded-2xl border border-slate-800/60">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block flex items-center gap-1">
                <Lightbulb className="w-3.5 h-3.5 text-emerald-400" />
                Два золотих правила розрахунку:
              </span>
              <div className="space-y-2 pt-1 text-[11.5px]">
                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <strong className="text-emerald-400 block mb-0.5">🟢 Позитивні кошти (Активи):</strong>
                  <span>
                    Рахуються за курсом купівлі (Bid). Якщо у вас є $1000, вони оцінюються в гривні за {rateUsd} ₴ (скільки ви отримаєте готівки на руки в обміннику).
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                  <strong className="text-rose-400 block mb-0.5">🔴 Борги та зобов'язання:</strong>
                  <span>
                    Рахуються за курсом продажу (Ask: {rateUsdSell} ₴). Для закриття боргу у $1000 вам доведеться купити долари за дорожчим курсом продажу.
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed italic px-1">
              Це дає найточнішу та найконсервативнішу фінансову картину без штучного роздування капіталу.
            </p>

            {/* Footer */}
            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowGlobalHint(false)}
                className="px-5 py-2 rounded-xl bg-sky-500 text-slate-950 font-black text-xs hover:bg-sky-400 transition-all active:scale-95 cursor-pointer shadow-md shadow-sky-500/20"
              >
                Зрозуміло
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
