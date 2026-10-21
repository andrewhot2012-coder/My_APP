import React, { useState } from "react";
import {
  Coins,
  X,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  Printer,
  Copy,
  ChevronDown,
  ChevronUp,
  Building2,
  ArrowRightLeft,
  Info
} from "lucide-react";
import { InitData, BankBalances } from "../types";

interface AvailableResourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initData: InitData | null;
  currentCurrency: string;
  summaryBase: string;
  onToggleSummaryBase?: () => void;
  globalRateUsd: number;
  globalRateEur: number;
  globalRateUsdSell: number;
  globalRateEurSell: number;
  onChangeCurrency?: (c: "UAH" | "USD" | "EUR") => void;
  onNavigate?: (view: string) => void;
}

export const AvailableResourcesModal: React.FC<AvailableResourcesModalProps> = ({
  isOpen,
  onClose,
  initData,
  currentCurrency,
  summaryBase,
  onToggleSummaryBase,
  globalRateUsd,
  globalRateEur,
  globalRateUsdSell,
  globalRateEurSell,
  onChangeCurrency,
  onNavigate
}) => {
  const [activeTab, setActiveTab] = useState<"ALL" | "UAH" | "USD" | "EUR">("ALL");
  const [showExcluded, setShowExcluded] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen || !initData) return null;

  const getCurrencySymbol = (c: string) => {
    if (c === "UAH") return "₴";
    if (c === "USD") return "$";
    if (c === "EUR") return "€";
    return c;
  };

  const getCurrencyFlag = (c: string) => {
    if (c === "UAH") return "🇺🇦";
    if (c === "USD") return "🇺🇸";
    if (c === "EUR") return "🇪🇺";
    return "🌐";
  };

  const convertAmount = (amount: number, from: string, to: string) => {
    if (from === to) return amount;
    const rUsd = globalRateUsd || 0;
    const rUsdSell = globalRateUsdSell || rUsd;
    const rEur = globalRateEur || 0;
    const rEurSell = globalRateEurSell || rEur;

    if (amount >= 0) {
      let uahVal = 0;
      if (from === "UAH") uahVal = amount;
      else if (from === "USD") uahVal = amount * rUsd;
      else if (from === "EUR") uahVal = amount * rEur;

      if (to === "UAH") return uahVal;
      if (to === "USD") return rUsdSell > 0 ? uahVal / rUsdSell : 0;
      if (to === "EUR") return rEurSell > 0 ? uahVal / rEurSell : 0;
    } else {
      let uahVal = 0;
      if (from === "UAH") uahVal = amount;
      else if (from === "USD") uahVal = amount * rUsdSell;
      else if (from === "EUR") uahVal = amount * rEurSell;

      if (to === "UAH") return uahVal;
      if (to === "USD") return rUsd > 0 ? uahVal / rUsd : 0;
      if (to === "EUR") return rEur > 0 ? uahVal / rEur : 0;
    }
    return amount;
  };

  const currenciesList = ["UAH", "USD", "EUR"] as const;

  // Process details per currency
  const currencyData: Record<
    string,
    {
      totalPos: number;
      cashPos: number;
      banksPos: number;
      posItems: Array<{ key: string; name: string; val: number; isCash: boolean }>;
      excludedItems: Array<{ key: string; name: string; val: number; isCash: boolean }>;
    }
  > = {};

  let grandTotalBase = 0;
  let grandTotalCashBase = 0;
  let grandTotalBanksBase = 0;
  let totalExcludedCount = 0;

  currenciesList.forEach((c) => {
    const bankMap: BankBalances | undefined =
      initData.allBankDetails?.[c] || (currentCurrency === c ? initData.capital.banks : undefined);
    const aliases = initData.allAliases?.[c] || {};

    let cPos = 0;
    let cCashPos = 0;
    let cBanksPos = 0;

    const posItems: Array<{ key: string; name: string; val: number; isCash: boolean }> = [];
    const excludedItems: Array<{ key: string; name: string; val: number; isCash: boolean }> = [];

    if (bankMap) {
      Object.entries(bankMap).forEach(([bKey, rawVal]) => {
        const val = Number(rawVal) || 0;
        const name = aliases[bKey] || bKey;
        const isCash = bKey === "Готівка";

        if (val > 0.001) {
          posItems.push({ key: bKey, name, val, isCash });
          cPos += val;
          if (isCash) cCashPos += val;
          else cBanksPos += val;
        } else {
          excludedItems.push({ key: bKey, name, val, isCash });
        }
      });
    } else {
      // Fallback if bankMap not found for non-current currency
      const globalTot = initData.globalTotals?.[c] || 0;
      const cashTot = initData.allCashBalances?.[c] || 0;
      if (cashTot > 0) {
        posItems.push({ key: "Готівка", name: aliases["Готівка"] || "Готівка", val: cashTot, isCash: true });
        cPos += cashTot;
        cCashPos += cashTot;
      }
      const bankPart = globalTot - cashTot;
      if (bankPart > 0) {
        posItems.push({ key: "Банки", name: "Банківські рахунки", val: bankPart, isCash: false });
        cPos += bankPart;
        cBanksPos += bankPart;
      }
    }

    currencyData[c] = {
      totalPos: cPos,
      cashPos: cCashPos,
      banksPos: cBanksPos,
      posItems: posItems.sort((a, b) => b.val - a.val),
      excludedItems: excludedItems.sort((a, b) => a.val - b.val)
    };

    totalExcludedCount += excludedItems.length;

    grandTotalBase += convertAmount(cPos, c, summaryBase);
    grandTotalCashBase += convertAmount(cCashPos, c, summaryBase);
    grandTotalBanksBase += convertAmount(cBanksPos, c, summaryBase);
  });

  const handleCopySummary = () => {
    let text = `💎 НАЯВНІ РЕСУРСИ (ВЛАСНІ КОШТИ ТА ГОТІВКА)\n`;
    text += `Станом на: ${new Date().toLocaleDateString("uk-UA")} ${new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}\n`;
    text += `Загалом в ${summaryBase}: ${grandTotalBase.toFixed(2)} ${getCurrencySymbol(summaryBase)}\n`;
    text += `• Готівка: ${grandTotalCashBase.toFixed(2)} ${getCurrencySymbol(summaryBase)}\n`;
    text += `• Банки: ${grandTotalBanksBase.toFixed(2)} ${getCurrencySymbol(summaryBase)}\n\n`;

    currenciesList.forEach((c) => {
      const data = currencyData[c];
      if (data.totalPos > 0) {
        text += `${getCurrencyFlag(c)} ${c}: +${data.totalPos.toFixed(2)} ${getCurrencySymbol(c)}\n`;
        data.posItems.forEach((it) => {
          text += `  - ${it.name}: +${it.val.toFixed(2)} ${getCurrencySymbol(c)}\n`;
        });
      }
    });

    text += `\n* Кредитні ліміти, від'ємні баланси та боржники виключені.`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrintReport = () => {
    const printWindow = window.open("", "_blank", "width=850,height=900");
    if (!printWindow) {
      alert("Будь ласка, дозвольте спливаючі вікна для друку звіту.");
      return;
    }

    const todayFormatted = new Date().toLocaleDateString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });

    let itemsHtml = "";
    currenciesList.forEach((c) => {
      const data = currencyData[c];
      if (data.totalPos > 0) {
        itemsHtml += `
          <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
            <h3 style="margin: 0 0 10px 0; color: #0f172a; font-size: 16px; display: flex; align-items: center; justify-content: space-between;">
              <span>${getCurrencyFlag(c)} Валюта ${c}</span>
              <span style="color: #059669; font-weight: 800;">+${data.totalPos.toFixed(2)} ${getCurrencySymbol(c)}</span>
            </h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="border-b: 1px solid #cbd5e1; text-align: left; color: #64748b;">
                  <th style="padding: 6px 0;">Рахунок / Готівка</th>
                  <th style="padding: 6px 0; text-align: right;">Позитивний баланс</th>
                </tr>
              </thead>
              <tbody>
        `;

        data.posItems.forEach((it) => {
          itemsHtml += `
            <tr style="border-b: 1px solid #f1f5f9;">
              <td style="padding: 8px 0; color: #334155;">${it.isCash ? "💵" : "🏦"} <strong>${it.name}</strong></td>
              <td style="padding: 8px 0; text-align: right; color: #059669; font-weight: bold;">+${it.val.toFixed(2)} ${getCurrencySymbol(c)}</td>
            </tr>
          `;
        });

        itemsHtml += `
              </tbody>
            </table>
          </div>
        `;
      }
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Звіт: Наявні власні ресурси (${todayFormatted})</title>
        <meta charset="utf-8">
        <style>
          body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 25px; color: #1e293b; background: #fff; }
          .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; }
          .title { font-size: 22px; font-weight: 900; color: #0f172a; margin: 0; }
          .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
          .summary-card { background: #0f172a; color: #fff; padding: 20px; border-radius: 14px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; }
          .grand-sum { font-size: 28px; font-weight: 900; color: #34d399; }
          .badge { background: #1e293b; color: #38bdf8; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: bold; }
          .footer { font-size: 11px; color: #94a3b8; text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">💵 Звіт наявних власних ресурсів</div>
          <div class="subtitle">Формування станом на ${todayFormatted} | Тільки додатні рахунки та готівка (без боргів та кредитів)</div>
        </div>

        <div class="summary-card">
          <div>
            <div style="font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: bold;">Усього ліквідних власних коштів (${summaryBase}):</div>
            <div class="grand-sum">${grandTotalBase.toFixed(2)} ${getCurrencySymbol(summaryBase)}</div>
          </div>
          <div>
            <span class="badge">Готівка: ${grandTotalCashBase.toFixed(2)} ${getCurrencySymbol(summaryBase)}</span>
            <span class="badge" style="margin-left: 6px;">Банки: ${grandTotalBanksBase.toFixed(2)} ${getCurrencySymbol(summaryBase)}</span>
          </div>
        </div>

        ${itemsHtml}

        <div class="footer">
          ⚡ Звіт згенеровано автоматично з облікової системи. Від'ємні залишки (кредити) та боржники не включені в підсумок.
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-white relative">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800/80 transition-colors cursor-pointer"
          title="Закрити"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Body Scrollable */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto custom-scrollbar pt-4 sm:pt-5">
          {/* Main Hero Card */}
          <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-amber-500/30 shadow-lg relative overflow-hidden flex flex-col gap-3">
            <div className="absolute top-0 right-0 p-8 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between pr-8 flex-wrap gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-400" />
                Ресурси
              </span>
              {/* Currency Toggle */}
              {onToggleSummaryBase && (
                <button
                  type="button"
                  onClick={() => onToggleSummaryBase()}
                  className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-amber-300 font-black text-xs border border-amber-500/30 flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                  title="Змінити базову валюту відображення"
                >
                  <ArrowRightLeft className="w-3 h-3 text-amber-400" />
                  <span>База: {getCurrencyFlag(summaryBase)} {summaryBase}</span>
                </button>
              )}
            </div>

            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl sm:text-4xl font-black tracking-tight text-white">
                {grandTotalBase.toFixed(2)} {getCurrencySymbol(summaryBase)}
              </span>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 100% Власні ресурси
              </span>
            </div>

            {/* Sub Stats Row */}
            <div className="grid grid-cols-2 gap-2 mt-1 pt-3 border-t border-slate-800/80 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                  💵 Готівка
                </span>
                <span className="font-extrabold text-sm text-emerald-300">
                  {grandTotalCashBase.toFixed(2)} {getCurrencySymbol(summaryBase)}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-0.5">
                <span className="text-[10px] text-slate-400 font-bold uppercase flex items-center gap-1">
                  🏦 Банківські рахунки
                </span>
                <span className="font-extrabold text-sm text-sky-300">
                  {grandTotalBanksBase.toFixed(2)} {getCurrencySymbol(summaryBase)}
                </span>
              </div>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab("ALL")}
              className={`flex-1 min-w-[90px] py-1.5 px-3 rounded-lg text-xs font-black transition-all cursor-pointer ${
                activeTab === "ALL"
                  ? "bg-amber-500 text-slate-950 shadow-md"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
            >
              🌐 Всі валюти
            </button>
            {currenciesList.map((c) => {
              const data = currencyData[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setActiveTab(c)}
                  className={`flex-1 min-w-[85px] py-1.5 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1 cursor-pointer ${
                    activeTab === c
                      ? "bg-amber-500 text-slate-950 shadow-md"
                      : "text-slate-400 hover:text-white hover:bg-slate-900"
                  }`}
                >
                  <span>{getCurrencyFlag(c)}</span>
                  <span>{c}</span>
                  {data.totalPos > 0 && (
                    <span className="text-[9px] opacity-80">
                      ({data.totalPos.toFixed(0)})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Currency Breakdown Cards */}
          <div className="space-y-3">
            {currenciesList
              .filter((c) => activeTab === "ALL" || activeTab === c)
              .map((c) => {
                const data = currencyData[c];
                const hasPos = data.posItems.length > 0;

                return (
                  <div
                    key={c}
                    className="p-3.5 sm:p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col gap-3"
                  >
                    {/* Currency Header */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{getCurrencyFlag(c)}</span>
                        <span className="font-extrabold text-sm text-slate-200">Валюта {c}</span>
                        {onChangeCurrency && (
                          <button
                            type="button"
                            onClick={() => {
                              onChangeCurrency(c);
                              if (onNavigate) onNavigate("capital");
                            }}
                            className="text-[10px] font-bold text-sky-400 hover:text-sky-300 underline ml-1 cursor-pointer"
                          >
                            Деталі рахунків
                          </button>
                        )}
                      </div>
                      <span className="text-sm font-black text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20">
                        +{data.totalPos.toFixed(2)} {getCurrencySymbol(c)}
                      </span>
                    </div>

                    {/* Positive Items List */}
                    {hasPos ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {data.posItems.map((it) => {
                          const convertedVal = convertAmount(it.val, c, summaryBase);
                          return (
                            <div
                              key={it.key}
                              onClick={() => {
                                if (onChangeCurrency) onChangeCurrency(c);
                                if (onNavigate) onNavigate("capital");
                              }}
                              className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs hover:border-slate-600 transition-all cursor-pointer hover:bg-slate-800/80 active:scale-[0.99]"
                            >
                              <div className="flex items-center gap-2 truncate pr-2">
                                <span className="text-base">{it.isCash ? "💵" : "🏦"}</span>
                                <div className="flex flex-col truncate">
                                  <span className="font-bold text-slate-200 truncate">{it.name}</span>
                                  <span className="text-[9px] text-emerald-400/80 font-semibold">
                                    ✓ Додатній ресурс
                                  </span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <div className="font-black text-emerald-400 text-xs">
                                  +{it.val.toFixed(2)} {getCurrencySymbol(c)}
                                </div>
                                {summaryBase !== c && (
                                  <div className="text-[9px] text-slate-500 font-medium">
                                    ≈ {convertedVal.toFixed(2)} {getCurrencySymbol(summaryBase)}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 italic py-1 text-center">
                        Немає додатних балансів у {c}
                      </div>
                    )}

                    {/* Excluded Accounts (Negative or Zero) */}
                    {data.excludedItems.length > 0 && showExcluded && (
                      <div className="mt-2 pt-2 border-t border-slate-800/50 space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                          ⚠️ Виключені (кредитні / від'ємні / 0 рахунки):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {data.excludedItems.map((it) => (
                            <div
                              key={it.key}
                              className="p-2 rounded-lg bg-rose-950/20 border border-rose-900/30 flex items-center justify-between text-[11px] text-slate-400"
                            >
                              <span className="truncate pr-2">{it.isCash ? "💵" : "🏦"} {it.name}</span>
                              <span className="font-extrabold text-rose-400 shrink-0">
                                {it.val.toFixed(2)} {getCurrencySymbol(c)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Toggle show excluded */}
          {totalExcludedCount > 0 && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => setShowExcluded(!showExcluded)}
                className="text-xs text-slate-400 hover:text-slate-200 font-bold flex items-center gap-1 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 transition-colors cursor-pointer"
              >
                {showExcluded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                <span>
                  {showExcluded
                    ? "Сховати виключені рахунки"
                    : `Показати виключені кредитні/0 рахунки (${totalExcludedCount})`}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopySummary}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
              title="Скопіювати підсумок у буфер обміну"
            >
              <Copy className="w-3.5 h-3.5 text-sky-400" />
              <span>{copied ? "✓ Скопійовано!" : "Копіювати"}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintReport}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 border border-sky-500/20"
              title="Роздрукувати або зберегти звіт у PDF"
            >
              <Printer className="w-3.5 h-3.5 text-sky-400" />
              <span>Друк звіту</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
          >
            Зрозуміло
          </button>
        </div>
      </div>
    </div>
  );
};
