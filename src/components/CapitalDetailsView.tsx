import React from "react";
import { 
  Wallet, 
  Landmark, 
  LandmarkIcon, 
  Layers, 
  ArrowUpRight, 
  ArrowDownLeft, 
  ChevronRight, 
  Edit2, 
  RefreshCw,
  Printer,
  X,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Search,
  Calendar,
  FileText,
  Info,
  Trash2,
  Scale,
  HelpCircle,
  Lightbulb,
  CheckCircle2,
  Calculator,
  Coins,
  Sparkles,
  Target,
  ShieldCheck,
  TrendingUp,
  Copy,
  Check
} from "lucide-react";
import { InitData, HistoryGroup } from "../types";
import { replaceBankKeysWithAliases, parseTransactionText } from "../lib/transactionUtils";
import { parseSheetFloat } from "../googleSheets";

interface CapitalDetailsViewProps {
  initData: InitData | null;
  currentCurrency: string;
  onBack: () => void;
  onNavigateToHistoryWithSearch?: (query: string) => void;
  onNavigate?: (screen: string) => void;
  onSaveAdjustment?: (bankKey: string, currentBalance: number, targetBalance: number, comment?: string) => Promise<void>;
  onDeleteBankOperation?: (dateStr: string, bankKey: string) => Promise<void>;
  historyGroups?: HistoryGroup[];
  onOpenInitialDataModal?: () => void;
}

export const CapitalDetailsView: React.FC<CapitalDetailsViewProps> = ({
  initData,
  currentCurrency,
  onBack,
  onNavigateToHistoryWithSearch,
  onNavigate,
  onSaveAdjustment,
  onDeleteBankOperation,
  historyGroups = [],
  onOpenInitialDataModal
}) => {
  const [adjustingBank, setAdjustingBank] = React.useState<{ key: string; name: string; balance: number } | null>(null);
  const [targetBalance, setTargetBalance] = React.useState<string>("");
  const [comment, setComment] = React.useState<string>("");
  const [isSaving, setIsSaving] = React.useState(false);

  // States for detailed Bank Report
  const [selectedBankReport, setSelectedBankReport] = React.useState<{ key: string; name: string } | null>(null);
  const [isPrintMode, setIsPrintMode] = React.useState(false);
  const [filterType, setFilterType] = React.useState<"all" | "income" | "expense">("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [monthFilter, setMonthFilter] = React.useState<string>("all");
  const [expandedTxs, setExpandedTxs] = React.useState<{[key: number]: boolean}>({});
  const [activeBalanceHint, setActiveBalanceHint] = React.useState<{
    title: string;
    badge: string;
    formula: string;
    breakdown?: string;
    description: string;
    tips: string[];
    accentColor: string;
    targetAction?: {
      label: string;
      onClick: () => void;
    };
  } | null>(null);
  const [showBalanceGuide, setShowBalanceGuide] = React.useState(false);
  const [guideTab, setGuideTab] = React.useState<"overview" | "simulator" | "rules">("overview");
  const [targetRunwayMonths, setTargetRunwayMonths] = React.useState<number>(6);
  const [targetGoalSum, setTargetGoalSum] = React.useState<string>(() => {
    return currentCurrency === "UAH" ? "500000" : currentCurrency === "USD" ? "15000" : "12000";
  });
  const [isCopiedGuide, setIsCopiedGuide] = React.useState(false);

  const openBankReport = React.useCallback((bKey: string, customName: string) => {
    setSelectedBankReport({ key: bKey, name: customName });
    setIsPrintMode(false);
    setFilterType("all");
    setSearchQuery("");
    setMonthFilter("all");

    if (window.history.state?.subView !== "bankReport" || window.history.state?.bankKey !== bKey) {
      const nextIndex = (window.history.state?.index || 0) + 1;
      window.history.pushState(
        { screen: "capital", subView: "bankReport", bankKey: bKey, bankName: customName, index: nextIndex },
        "",
        ""
      );
    }
  }, []);

  const closeBankReport = React.useCallback(() => {
    if (window.history.state?.subView === "bankReport") {
      window.history.back();
    } else {
      setSelectedBankReport(null);
    }
  }, []);

  React.useEffect(() => {
    const handlePopState = () => {
      const state = window.history.state;
      if (state?.screen === "capital" && state?.subView === "bankReport" && state?.bankKey) {
        setSelectedBankReport({ key: state.bankKey, name: state.bankName || state.bankKey });
      } else {
        setSelectedBankReport(null);
      }
    };

    handlePopState();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  React.useEffect(() => {
    setExpandedTxs({});
  }, [selectedBankReport]);

  React.useEffect(() => {
    const handleIntercept = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (adjustingBank) {
        customEvent.detail.preventScreenTransition();
        setAdjustingBank(null);
      } else if (isPrintMode) {
        customEvent.detail.preventScreenTransition();
        setIsPrintMode(false);
      }
    };
    window.addEventListener("app-back-intercept", handleIntercept);
    return () => window.removeEventListener("app-back-intercept", handleIntercept);
  }, [isPrintMode, adjustingBank]);

  const handleSaveAdjust = async () => {
    if (!adjustingBank || !onSaveAdjustment) return;
    const targetVal = parseFloat(targetBalance);
    if (isNaN(targetVal)) {
      alert("Будь ласка, введіть коректне числове значення балансу.");
      return;
    }
    
    setIsSaving(true);
    try {
      await onSaveAdjustment(adjustingBank.key, adjustingBank.balance, targetVal, comment);
      setAdjustingBank(null);
    } catch (e: any) {
      alert("Не вдалося зберегти зміни: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getCurrencySymbol = (c: string) => {
    if (c === "UAH") return "₴";
    if (c === "USD") return "$";
    if (c === "EUR") return "€";
    return c;
  };

  const getCardIcon = (key: string, iconColor: string) => {
    if (key === "Готівка") return <Wallet className={`w-5 h-5 ${iconColor}`} />;
    if (key.includes("Банк")) return <Landmark className={`w-5 h-5 ${iconColor}`} />;
    return <LandmarkIcon className={`w-5 h-5 ${iconColor}`} />;
  };

  const getBankStyle = (bKey: string, customName: string) => {
    const normName = (customName || bKey).toLowerCase();
    
    if (normName.includes("готівка") || normName.includes("cash") || normName.includes("кишен") || normName.includes("гаманець")) {
      return {
        border: "border-amber-500/25 hover:border-amber-500/60 shadow-[0_2px_10px_rgba(245,158,11,0.06)]",
        bg: "bg-amber-950/15 hover:bg-amber-950/30",
        iconBg: "bg-amber-950/45 border-amber-900/40",
        iconColor: "text-amber-400",
        accentText: "text-amber-300",
        leftBar: "bg-amber-500",
        indicatorText: "Готівкові кошти"
      };
    }
    if (normName.includes("моно") || normName.includes("mono") || normName.includes("банк 1")) {
      return {
        border: "border-rose-500/25 hover:border-rose-500/60 shadow-[0_2px_10px_rgba(244,63,94,0.06)]",
        bg: "bg-rose-950/15 hover:bg-rose-950/30",
        iconBg: "bg-rose-950/45 border-rose-900/40",
        iconColor: "text-rose-400",
        accentText: "text-rose-300",
        leftBar: "bg-rose-500",
        indicatorText: "Monobank"
      };
    }
    if (normName.includes("приват") || normName.includes("privat") || normName.includes("банк 2")) {
      return {
        border: "border-emerald-500/25 hover:border-emerald-500/60 shadow-[0_2px_10px_rgba(16,185,129,0.06)]",
        bg: "bg-emerald-950/15 hover:bg-emerald-950/30",
        iconBg: "bg-emerald-950/45 border-emerald-900/40",
        iconColor: "text-emerald-400",
        accentText: "text-emerald-300",
        leftBar: "bg-emerald-500",
        indicatorText: "ПриватБанк"
      };
    }
    if (normName.includes("а-банк") || normName.includes("абанк") || normName.includes("а банк") || normName.includes("банк 3")) {
      return {
        border: "border-lime-500/25 hover:border-lime-500/60 shadow-[0_2px_10px_rgba(132,204,22,0.06)]",
        bg: "bg-lime-950/15 hover:bg-lime-950/30",
        iconBg: "bg-lime-950/45 border-lime-900/40",
        iconColor: "text-lime-400",
        accentText: "text-lime-300",
        leftBar: "bg-lime-500",
        indicatorText: "А-Банк"
      };
    }
    if (normName.includes("ощад") || normName.includes("oschad") || normName.includes("банк 4")) {
      return {
        border: "border-teal-500/25 hover:border-teal-500/60 shadow-[0_2px_10px_rgba(20,184,166,0.06)]",
        bg: "bg-teal-950/15 hover:bg-teal-950/30",
        iconBg: "bg-teal-950/45 border-teal-900/40",
        iconColor: "text-teal-400",
        accentText: "text-teal-300",
        leftBar: "bg-teal-500",
        indicatorText: "Ощадбанк"
      };
    }
    if (normName.includes("пумб") || normName.includes("pumb") || normName.includes("сенс") || normName.includes("sense") || normName.includes("банк 5")) {
      return {
        border: "border-purple-500/25 hover:border-purple-500/60 shadow-[0_2px_10px_rgba(168,85,247,0.06)]",
        bg: "bg-purple-950/15 hover:bg-purple-950/30",
        iconBg: "bg-purple-950/45 border-purple-900/40",
        iconColor: "text-purple-400",
        accentText: "text-purple-300",
        leftBar: "bg-purple-500",
        indicatorText: "PUMB / Sense Bank"
      };
    }
    // Default Bank style
    return {
      border: "border-sky-500/20 hover:border-sky-500/60 shadow-[0_2px_10px_rgba(14,165,233,0.06)]",
      bg: "bg-sky-950/15 hover:bg-sky-950/30",
      iconBg: "bg-sky-950/45 border-sky-900/40",
      iconColor: "text-sky-400",
      accentText: "text-sky-300",
      leftBar: "bg-sky-500",
      indicatorText: "Банківський рахунок"
    };
  };

  const curr = (currentCurrency as "UAH" | "USD" | "EUR") || "UAH";
  const banks = initData ? (initData.allBankDetails?.[curr] || initData.capital?.banks || {}) : {};
  const aliases = initData?.allAliases?.[curr] || {};
  const debtors = initData ? (initData.allDebtorsDetails?.[curr] || initData.debtors || {}) : {};

  const bankTotal = Object.values(banks).reduce<number>((acc, val) => acc + (Number(val) || 0), 0);
  const positiveBankTotal = Object.values(banks).reduce<number>((acc, val) => {
    const num = Number(val) || 0;
    return num > 0 ? acc + num : acc;
  }, 0);
  const debtorsTotal = initData?.debtorsTotals?.[curr] ?? initData?.capital?.debtorsTotal ?? 0;
  const netTotal = initData?.globalTotals?.[curr] ?? (bankTotal + debtorsTotal);

  // Financial Runway & Insights Calculation
  const { avgMonthlyExpense, runwayMonths, cashPercent, banksPercent, debtorsPercent } = React.useMemo(() => {
    const cashVal = Math.max(0, Number(banks['Готівка']) || 0);
    const banksVal = Math.max(0, bankTotal - (Number(banks['Готівка']) || 0));
    const debtVal = Math.max(0, debtorsTotal);
    const totalAssets = cashVal + banksVal + debtVal;

    const cashP = totalAssets > 0 ? Math.round((cashVal / totalAssets) * 100) : 0;
    const banksP = totalAssets > 0 ? Math.round((banksVal / totalAssets) * 100) : 0;
    const debtP = totalAssets > 0 ? Math.max(0, 100 - cashP - banksP) : 0;

    const monthlyExpensesMap: { [monthKey: string]: number } = {};
    (historyGroups || []).forEach(g => {
      if (!g.isIncome && g.totalSum > 0) {
        const parts = (g.dateStr || "").split(" ")[0].split(".");
        if (parts.length === 3) {
          const mKey = `${parts[2]}-${parts[1]}`;
          monthlyExpensesMap[mKey] = (monthlyExpensesMap[mKey] || 0) + g.totalSum;
        }
      }
    });

    const expVals = Object.values(monthlyExpensesMap);
    const avgExpense = expVals.length > 0 
      ? expVals.reduce((a, b) => a + b, 0) / expVals.length 
      : 0;

    const runway = (avgExpense > 0 && positiveBankTotal > 0) 
      ? positiveBankTotal / avgExpense 
      : null;

    return {
      avgMonthlyExpense: avgExpense,
      runwayMonths: runway,
      cashPercent: cashP,
      banksPercent: banksP,
      debtorsPercent: debtP
    };
  }, [banks, bankTotal, debtorsTotal, positiveBankTotal, historyGroups]);

  if (!initData) {
    return <div className="text-center py-6 text-slate-400 animate-pulse">Завантаження даних...</div>;
  }

  if (selectedBankReport) {
    const bKey = selectedBankReport.key;
    const customName = selectedBankReport.name;
    const bal = banks[bKey as keyof typeof banks] || 0;
    const style = getBankStyle(bKey, customName);
    const symbol = getCurrencySymbol(currentCurrency);

    // Extract all transactions for this specific bank from historyGroups
    const bankTransactions: Array<{
      dateStr: string;
      timestamp: number;
      category: string;
      comment: string;
      sum: number;
      isIncome: boolean;
      fullText: string;
    }> = [];

    // 1. Direct extraction from raw spreadsheet rows (allRawMoneyRows) for this bank
    const rawRows = (initData.allRawMoneyRows?.[curr] && initData.allRawMoneyRows[curr].length > 0)
      ? initData.allRawMoneyRows[curr]
      : (curr === "UAH" && initData.rawMoneyRows && initData.rawMoneyRows.length > 0)
        ? initData.rawMoneyRows
        : [];

    const bankKeys = ['Готівка', 'Банк 1', 'Банк 2', 'Банк 3', 'Банк 4', 'Банк 5'];
    let bankColIdx = bankKeys.indexOf(bKey);
    if (bankColIdx === -1 && rawRows.length > 0) {
      const headerRow = rawRows[0] || [];
      const cleanBKey = bKey.trim().toLowerCase();
      const cleanCustomName = customName.trim().toLowerCase();
      for (let c = 0; c < 6; c++) {
        const hText = (headerRow[c * 2] || "").toString().trim().toLowerCase();
        if (hText === cleanBKey || hText === cleanCustomName || (cleanBKey.length > 2 && hText.includes(cleanBKey)) || (cleanCustomName.length > 2 && hText.includes(cleanCustomName))) {
          bankColIdx = c;
          break;
        }
      }
    }

    const seenTxKeys = new Set<string>();

    if (bankColIdx !== -1 && rawRows.length > 1) {
      const textIdx = bankColIdx * 2;
      const valIdx = bankColIdx * 2 + 1;
      for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row) continue;
        const rawText = (row[textIdx] != null ? row[textIdx].toString().trim() : "");
        let rawVal = row.length > valIdx && row[valIdx] != null ? parseSheetFloat(row[valIdx]) : NaN;

        if (isNaN(rawVal) && rawText) {
          const m = rawText.match(/💰\s*Сума:\s*([\d.,\s]+?)(?:USD|\$|EUR|€|UAH|₴|\s|$)/i) ||
                    rawText.match(/([\d.,]+)\s*(?:USD|\$|EUR|€|UAH|₴)/i) ||
                    rawText.match(/\$\s*([\d.,]+)/i) ||
                    rawText.match(/💰\s*Сума:\s*([\d.,]+)/i);
          if (m) rawVal = parseSheetFloat(m[1]);
        }

        if (!isNaN(rawVal) && Math.abs(rawVal) > 0.0001) {
          // Verify currency match if specified in raw text
          const upperText = rawText.toUpperCase();
          if (curr === "USD" && (upperText.includes("EUR") || upperText.includes("€") || (upperText.includes("UAH") && !upperText.includes("USD")))) {
            continue;
          }
          if (curr === "EUR" && (upperText.includes("USD") || upperText.includes("$") || (upperText.includes("UAH") && !upperText.includes("EUR")))) {
            continue;
          }
          if (curr === "UAH" && (upperText.includes("USD") || upperText.includes("$") || upperText.includes("EUR") || upperText.includes("€"))) {
            // If it's an exchange with UAH leg, it's allowed; otherwise skip if purely foreign
            if (!upperText.includes("UAH") && !upperText.includes("₴") && !upperText.includes("ГРН") && !upperText.includes("ОБМІН")) {
              continue;
            }
          }

          let dateStr = "Без дати " + r;
          let operation = rawVal > 0 ? "Надходження" : "Списання";
          let cleanText = rawText || (rawVal > 0 ? "Надходження коштів" : "Списання коштів");
          let timeStamp = r;

          const match = rawText.match(/^\[(.*?)\]\s*([\s\S]*)/);
          if (match) {
            const bracketData = match[1];
            cleanText = match[2];
            if (bracketData.includes(" | ")) {
              const bParts = bracketData.split(" | ");
              dateStr = bParts[0];
              operation = bParts[1];
            } else {
              dateStr = bracketData;
            }
            const parts = dateStr.split(" ");
            if (parts.length >= 2) {
              const dParts = parts[0].split(".");
              const tParts = parts[1].split(":");
              if ((dParts.length === 3 || dParts.length === 2) && tParts.length >= 2) {
                let yr = dParts.length === 3 ? parseInt(dParts[2], 10) : new Date().getFullYear();
                if (yr < 100) yr += 2000;
                const mo = parseInt(dParts[1], 10) - 1;
                const d = parseInt(dParts[0], 10);
                const h = parseInt(tParts[0], 10);
                const mi = parseInt(tParts[1], 10);
                const sec = tParts[2] ? parseInt(tParts[2], 10) : 0;
                if (!isNaN(yr) && !isNaN(mo) && !isNaN(d) && !isNaN(h) && !isNaN(mi)) {
                  timeStamp = new Date(yr, mo, d, h, mi, sec).getTime();
                }
              }
            }
          }

          let isIncome = rawVal > 0;
          const opLow = operation.toLowerCase();
          const textLow = cleanText.toLowerCase();
          if (opLow.includes("прибуток") || opLow.includes("повернули борг") || opLow.includes("прихід") || textLow.includes("отримано") || opLow.includes("(+)")) {
            isIncome = true;
          } else if (opLow.includes("витрата") || opLow.includes("покупка") || opLow.includes("повертаю борг") || textLow.includes("списано") || opLow.includes("(-)")) {
            isIncome = false;
          }

          const dMatch = dateStr.match(/(\d{1,2}\.\d{1,2}\.\d{2,4})/);
          const normD = dMatch ? dMatch[1] : dateStr.split(" ")[0];
          const tMatch = dateStr.match(/(\d{1,2}:\d{2})/);
          const normTime = tMatch ? tMatch[1] : "";
          const normSnippet = cleanText.replace(/[^a-zA-Zа-яА-Я0-9]/g, "").slice(0, 20);
          const txKey = `${normD}_${normTime}_${Math.abs(rawVal).toFixed(2)}_${isIncome ? "1" : "0"}_${normSnippet}`;
          if (seenTxKeys.has(txKey)) continue;
          seenTxKeys.add(txKey);

          bankTransactions.push({
            dateStr,
            timestamp: isNaN(timeStamp) ? r : timeStamp,
            category: operation,
            comment: cleanText,
            sum: Math.abs(rawVal),
            isIncome,
            fullText: rawText
          });
        }
      }
    }

    // 2. Fallback extraction from historyGroups ONLY if direct raw rows were not available
    if (bankTransactions.length === 0) {
      const isCurrMatch = (item: any, g: any) => {
        const itemCurr = (item.curr || g.curr || g.items?.[0]?.curr || "").trim().toUpperCase();
        const curUp = (currentCurrency || "UAH").trim().toUpperCase();

        if (itemCurr) {
          if (curUp === "USD" || curUp === "$") return itemCurr === "USD" || itemCurr === "$";
          if (curUp === "EUR" || curUp === "€") return itemCurr === "EUR" || itemCurr === "€";
          return itemCurr === "UAH" || itemCurr === "₴" || itemCurr.includes("ГРН");
        }

        const full = ((item.fullText || item.text || "") + " " + (g.operation || "")).toUpperCase();
        const hasUSD = full.includes("USD") || full.includes("$") || full.includes("ДОЛ");
        const hasEUR = full.includes("EUR") || full.includes("€") || full.includes("ЄВР");
        const hasUAH = full.includes("UAH") || full.includes("₴") || full.includes("ГРН");

        if (curUp === "USD" || curUp === "$") return hasUSD && !hasEUR;
        if (curUp === "EUR" || curUp === "€") return hasEUR && !hasUSD;
        return hasUAH || (!hasUSD && !hasEUR);
      };

      const normBKey = bKey.trim().toLowerCase();
      const normCustomName = customName.trim().toLowerCase();
      const stripSymbols = (s: string) => s.replace(/[$€₴]/g, "").replace(/\b(?:usd|eur|uah|грн)\b/gi, "").trim();
      const cleanBKey = stripSymbols(normBKey);
      const cleanCustomName = stripSymbols(normCustomName);

      const aliasesList = ["UAH", "USD", "EUR"].flatMap(c => {
        const dict = initData?.allAliases?.[c as "UAH" | "USD" | "EUR"] || {};
        return [
          (dict[bKey] || "").trim().toLowerCase(),
          (dict[customName] || "").trim().toLowerCase()
        ];
      }).filter(Boolean);

      const resolvedTargetBank = replaceBankKeysWithAliases(bKey, initData).trim().toLowerCase();

      historyGroups.forEach(g => {
        g.items.forEach(item => {
          if (!isCurrMatch(item, g)) return;

          const normItemBank = (item.bank || "").trim().toLowerCase();
          const cleanItemBank = stripSymbols(normItemBank);
          const resolvedItemBank = replaceBankKeysWithAliases(item.bank || "", initData).trim().toLowerCase();

          // Check direct bank match
          const isDirectBankMatch = 
            normItemBank === normBKey || 
            normItemBank === normCustomName || 
            cleanItemBank === cleanBKey ||
            cleanItemBank === cleanCustomName ||
            resolvedItemBank === resolvedTargetBank ||
            aliasesList.some(alias => {
              const aClean = stripSymbols(alias);
              return alias === normItemBank || (aClean && aClean === cleanItemBank);
            });

          // Check if item points to a DIFFERENT known bank
          const allOtherKnownBanks = ['готівка', 'банк 1', 'банк 2', 'банк 3', 'банк 4', 'банк 5'].filter(k => k !== normBKey && k !== cleanBKey);
          const isAnotherBankLeg = allOtherKnownBanks.some(otherKey => {
            if (normItemBank === otherKey || cleanItemBank === otherKey) return true;
            const otherCustom = (aliases[otherKey] || "").trim().toLowerCase();
            if (otherCustom && (normItemBank === otherCustom || cleanItemBank === stripSymbols(otherCustom))) return true;
            return false;
          });

          if (isAnotherBankLeg && !isDirectBankMatch) {
            // This item belongs to another bank account, do not attach to this report
            return;
          }

          // Fallback text match ONLY if item has no explicit bank
          const rawContent = (item.fullText || item.text || "").toLowerCase();
          const isTextBankMatch = !normItemBank && (
            (rawContent.includes("списано з") || rawContent.includes("отримано на") || rawContent.includes("➔")) &&
            (rawContent.includes(normBKey) || (normCustomName.length > 2 && rawContent.includes(normCustomName)) || (cleanBKey.length > 2 && rawContent.includes(cleanBKey)) || (cleanCustomName.length > 2 && rawContent.includes(cleanCustomName)))
          );

          const isMatch = isDirectBankMatch || isTextBankMatch;

          if (isMatch) {
            let txSum = item.sum;
            if (isNaN(txSum) || Math.abs(txSum) < 0.001) {
              const rawContentFull = item.fullText || item.text || "";
              const m = rawContentFull.match(/💰\s*Сума:\s*([\d.,\s]+?)(?:USD|\$|EUR|€|UAH|₴|\s|$)/i) ||
                        rawContentFull.match(/([\d.,]+)\s*(?:USD|\$|EUR|€|UAH|₴)/i) ||
                        rawContentFull.match(/\$\s*([\d.,]+)/i) ||
                        rawContentFull.match(/💰\s*Сума:\s*([\d.,]+)/i) ||
                        rawContentFull.match(/Отримано:\s*([\d.,]+)/i) ||
                        rawContentFull.match(/Віддано:\s*([\d.,]+)/i);
              if (m) {
                const pVal = parseSheetFloat(m[1]);
                if (!isNaN(pVal) && pVal > 0) {
                  txSum = pVal;
                }
              } else if (g.totalSum > 0) {
                txSum = g.totalSum;
              }
            }

            if (isNaN(txSum) || Math.abs(txSum) < 0.001) return;

            const itemCategory = item.operation || g.operation;
            let isIncome = g.isIncome;
            const lineLower = (item.text || "").toLowerCase();
            const opLower = (itemCategory || "").toLowerCase();
            if (opLower.includes("прибуток") || opLower.includes("повернули борг") || opLower.includes("прихід") || opLower.includes("коригування (+)") || opLower.includes("введені початкові залишки (+)") || (opLower.includes("введені початкові залишки") && !opLower.includes("(-)")) || opLower.includes("початковий борг (+)")) {
              isIncome = true;
            } else if (opLower.includes("повертаю борг") || opLower.includes("покупка") || opLower.includes("витрата") || opLower.includes("коригування (-)") || opLower.includes("введені початкові залишки (-)") || opLower.includes("початковий борг (-)")) {
              isIncome = false;
            } else if (lineLower.includes("отримано") || lineLower.includes("переказ на") || lineLower.includes("(+)") || /(?:^|\s)\+\d/.test(lineLower)) {
              isIncome = true;
            } else if (lineLower.includes("списано") || lineLower.includes("переказ з") || lineLower.includes("(-)") || /(?:^|\s)-\d/.test(lineLower)) {
              isIncome = false;
            }

            const stripReversePlanned = (str: string) => {
              if (!str) return "";
              const patterns = [
                "⚙️ Реверс запланованого",
                "⚙️Реверс запланованого",
                "Реверс запланованого"
              ];
              for (const pattern of patterns) {
                const idx = str.indexOf(pattern);
                if (idx !== -1) {
                  return str.substring(0, idx).trim();
                }
              }
              return str;
            };

            const cleanComment = stripReversePlanned(item.text);
            const cleanFullText = stripReversePlanned(item.fullText || g.operation);
            const dMatch = (g.dateStr || "").match(/(\d{1,2}\.\d{1,2}\.\d{2,4})/);
            const gDate = dMatch ? dMatch[1] : (g.dateStr || "").split(" ")[0];
            const tMatch = (g.dateStr || "").match(/(\d{1,2}:\d{2})/);
            const gTime = tMatch ? tMatch[1] : "";
            const normSnippet = (cleanComment || cleanFullText).replace(/[^a-zA-Zа-яА-Я0-9]/g, "").slice(0, 20);
            const txKey = `${gDate}_${gTime}_${Math.abs(txSum).toFixed(2)}_${isIncome ? "1" : "0"}_${normSnippet}`;

            if (seenTxKeys.has(txKey)) return;
            seenTxKeys.add(txKey);

            bankTransactions.push({
              dateStr: g.dateStr,
              timestamp: g.timestamp,
              category: itemCategory,
              comment: cleanComment,
              sum: Math.abs(txSum),
              isIncome: isIncome,
              fullText: cleanFullText
            });
          }
        });
      });
    }

    // Deduplicate any transactions that might have duplicate keys across representations
    const seenFinalTxKeys = new Set<string>();
    const deduplicatedTxs = bankTransactions.filter(t => {
      const rawD = t.dateStr.trim();
      const dMatch = rawD.match(/(\d{1,2}\.\d{1,2}\.\d{2,4})/);
      const normD = dMatch ? dMatch[1] : rawD.split(" ")[0];
      const tMatch = rawD.match(/(\d{1,2}:\d{2})/);
      const normTime = tMatch ? tMatch[1] : "";
      const normSum = Math.abs(t.sum).toFixed(2);
      const normSign = t.isIncome ? "INC" : "EXP";
      const cleanSnippet = (t.comment || t.fullText || "").replace(/\[.*?\]/g, "").replace(/💰.*?($|\n)/g, "").replace(/[^a-zA-Zа-яА-Я0-9]/g, "").toLowerCase().slice(0, 18);
      
      const kPrecise = `${normD}_${normTime}_${normSum}_${normSign}_${cleanSnippet}`;
      const kTimeSum = normTime ? `${normD}_${normTime}_${normSum}` : "";
      const kBroad = `${normD}_${normSum}_${normSign}_${cleanSnippet}`;
      const kSumCore = `${normD}_${normSum}_${cleanSnippet}`;

      if (
        seenFinalTxKeys.has(kPrecise) ||
        (kTimeSum && seenFinalTxKeys.has(kTimeSum)) ||
        (cleanSnippet.length >= 3 && seenFinalTxKeys.has(kBroad)) ||
        (cleanSnippet.length >= 4 && seenFinalTxKeys.has(kSumCore))
      ) {
        return false;
      }

      seenFinalTxKeys.add(kPrecise);
      if (kTimeSum) seenFinalTxKeys.add(kTimeSum);
      if (cleanSnippet.length >= 3) seenFinalTxKeys.add(kBroad);
      if (cleanSnippet.length >= 4) seenFinalTxKeys.add(kSumCore);
      return true;
    });

    // Sort transactions by date descending (using timestamp)
    const sortedTxs = [...deduplicatedTxs].sort((a, b) => b.timestamp - a.timestamp);

    // Extract months for filter
    const uniqueMonths = Array.from(new Set(sortedTxs.map(t => {
      const parts = t.dateStr.split(".");
      if (parts.length === 3) {
        return parts[1] + "." + parts[2];
      }
      return "";
    }).filter(Boolean))).sort((a, b) => {
      const [mA, yA] = a.split(".").map(Number);
      const [mB, yB] = b.split(".").map(Number);
      if (yA !== yB) return yB - yA;
      return mB - mA;
    });

    const getMonthNameUk = (monYear: string) => {
      const [m, y] = monYear.split(".");
      const names = [
        "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень",
        "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"
      ];
      const idx = parseInt(m, 10) - 1;
      return `${names[idx] || m} ${y}`;
    };

    // 1. Transactions filtered by Month and Search (base set for this period's metrics)
    const periodTxs = sortedTxs.filter(t => {
      // Filter Month
      if (monthFilter !== "all") {
        const parts = t.dateStr.split(".");
        const tMonth = parts.length === 3 ? `${parts[1]}.${parts[2]}` : "";
        if (tMonth !== monthFilter) return false;
      }

      // Filter Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const categoryMatch = t.category.toLowerCase().includes(q);
        const commentMatch = t.comment.toLowerCase().includes(q);
        const sumMatch = t.sum.toFixed(2).includes(q);
        const dateMatch = t.dateStr.includes(q);
        if (!categoryMatch && !commentMatch && !sumMatch && !dateMatch) return false;
      }

      return true;
    });

    // Calculate metrics for current selected period (stable and accurate)
    let totalIncome = 0;
    let totalExpense = 0;
    let incomeCount = 0;
    let expenseCount = 0;
    periodTxs.forEach(t => {
      const val = Math.abs(t.sum);
      if (t.isIncome) {
        totalIncome += val;
        incomeCount++;
      } else {
        totalExpense += val;
        expenseCount++;
      }
    });
    const netFlow = totalIncome - totalExpense;
    const totalTurnover = totalIncome + totalExpense;

    // 2. Transactions displayed in the list (filtered by filterType)
    const filteredTxs = periodTxs.filter(t => {
      if (filterType === "income" && !t.isIncome) return false;
      if (filterType === "expense" && t.isIncome) return false;
      return true;
    });

    // PRINT PREVIEW OVERLAY
    if (isPrintMode) {
      return (
        <div className="fixed inset-0 bg-slate-900 z-[9999] overflow-y-auto p-4 md:p-8 text-left animate-fadeIn">
          {/* Print controls header */}
          <div className="max-w-4xl mx-auto mb-6 bg-slate-950/80 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xl print:hidden animate-slideUp">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-sky-500/10 border border-sky-400/20 text-sky-400 rounded-xl">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white">Версія для друку</h2>
                <p className="text-xs font-semibold text-slate-400">Виписка по рахунку: {customName}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Роздрукувати</span>
              </button>
              
              <button
                onClick={() => setIsPrintMode(false)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-black rounded-xl text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Закрити</span>
              </button>
            </div>
          </div>

          {/* Printable container */}
          <div className="w-full max-w-4xl mx-auto bg-white text-slate-900 p-8 md:p-12 rounded-2xl shadow-2xl border border-slate-200 font-sans print:shadow-none print:border-none print:p-0 print:m-0 animate-scaleUp">
            
            {/* Header Document */}
            <div className="border-b-2 border-slate-900 pb-5 mb-6">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                  <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                    ФІНАНСОВИЙ ЗВІТ ТА ВИПИСКА ПО РАХУНКУ
                  </h1>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">
                    Сгенеровано автоматично • Контроль капіталу
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-xs font-bold text-slate-500">Дата генерації:</p>
                  <p className="text-sm font-black text-slate-900">{new Date().toLocaleString("uk-UA")}</p>
                </div>
              </div>
            </div>

            {/* General Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Реквізити рахунку</h3>
                <table className="w-full text-xs text-left">
                  <tbody>
                    <tr className="border-b border-slate-100"><td className="py-2 text-slate-500 font-semibold">Назва рахунку / банку:</td><td className="py-2 font-black text-slate-900 text-right">{customName}</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-2 text-slate-500 font-semibold">Системний код:</td><td className="py-2 font-mono text-slate-900 text-right">{bKey}</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-2 text-slate-500 font-semibold">Валюта рахунку:</td><td className="py-2 font-bold text-slate-900 text-right">{currentCurrency}</td></tr>
                    <tr><td className="py-2 text-slate-500 font-semibold">Поточний баланс:</td><td className="py-2 font-black text-slate-900 text-right">{bal.toFixed(2)} {symbol}</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Підсумки за вибраний період</h3>
                <table className="w-full text-xs text-left">
                  <tbody>
                    <tr className="border-b border-slate-100"><td className="py-2 text-slate-500 font-semibold">Звітний період:</td><td className="py-2 font-bold text-slate-900 text-right">{monthFilter === 'all' ? 'За весь час' : getMonthNameUk(monthFilter)}</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-2 text-slate-500 font-semibold">Всього надходжень (+):</td><td className="py-2 font-black text-emerald-600 text-right">+{Math.abs(totalIncome).toFixed(2)} {symbol}</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-2 text-slate-500 font-semibold">Всього списань (-):</td><td className="py-2 font-black text-rose-600 text-right">-{Math.abs(totalExpense).toFixed(2)} {symbol}</td></tr>
                    <tr className="border-b border-slate-100"><td className="py-2 text-slate-500 font-semibold">Загальний валовий обіг:</td><td className="py-2 font-black text-sky-700 text-right">{(totalIncome + totalExpense).toFixed(2)} {symbol}</td></tr>
                    <tr><td className="py-2 text-slate-500 font-semibold">Чисте сальдо (результат):</td><td className={`py-2 font-black text-right ${netFlow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{netFlow >= 0 ? "+" : ""}{netFlow.toFixed(2)} {symbol}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* List of transactions */}
            <div className="mb-8">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-3 border-b-2 border-slate-900 pb-1.5">
                Реєстр операцій по рахунку ({filteredTxs.length})
              </h3>

              {filteredTxs.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-6 text-center">За вибраний період транзакцій не знайдено.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b-2 border-slate-300 text-slate-500 font-bold">
                        <th className="py-2.5 pr-2">Дата</th>
                        <th className="py-2.5 px-2">Категорія / Стаття</th>
                        <th className="py-2.5 px-2">Опис / Коментар</th>
                        <th className="py-2.5 px-2 text-center">Тип</th>
                        <th className="py-2.5 pl-2 text-right">Сума</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredTxs.map((t, tIdx) => (
                        <tr key={tIdx} className="hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 pr-2 font-medium text-slate-600 whitespace-nowrap">{t.dateStr}</td>
                          <td className="py-2.5 px-2 font-bold text-slate-900">{t.category}</td>
                          <td className="py-2.5 px-2 text-slate-600 max-w-[250px] truncate">{t.comment || "—"}</td>
                          <td className="py-2.5 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              t.isIncome ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                            }`}>
                              {t.isIncome ? "Надходження" : "Списання"}
                            </span>
                          </td>
                          <td className={`py-2.5 pl-2 text-right font-black ${
                            t.isIncome ? "text-emerald-600" : "text-rose-600"
                          }`}>
                            {t.isIncome ? "+" : "-"}{Math.abs(t.sum).toFixed(2)} {symbol}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Signature section */}
            <div className="mt-16 pt-8 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 gap-6">
              <div>
                <p className="italic">Відповідальна особа: andrewhot2012@gmail.com</p>
                <p className="text-[10px] text-slate-400 mt-1">Організація обліку капіталу підприємства / ФОП</p>
              </div>
              <div className="flex flex-col items-center">
                <p className="font-bold text-slate-400">М.П. / ПІДПИС</p>
                <div className="w-40 border-b border-slate-400 mt-6" />
              </div>
            </div>

          </div>
        </div>
      );
    }

    // MAIN INTERACTIVE BANK REPORT DASHBOARD VIEW
    return (
      <div className="flex flex-col gap-4 text-left animate-fadeIn">
        
        {/* Navigation row */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 no-print">
          <button
            type="button"
            onClick={closeBankReport}
            className="text-xs font-black text-sky-400 hover:text-sky-300 transition-all flex items-center gap-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 px-3.5 py-2 rounded-xl cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>До рахунків</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPrintMode(true)}
              className="text-xs font-black text-slate-950 bg-sky-400 hover:bg-sky-300 transition-all flex items-center gap-1.5 px-4 py-2 rounded-xl cursor-pointer shadow-md shadow-sky-400/10"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Друк звіту</span>
            </button>
          </div>
        </div>

        {/* Bank brand summary card */}
        <div className={`p-4 border rounded-2xl flex flex-col relative overflow-hidden transition-all shadow-xl ${style.border} ${style.bg}`}>
          {/* Left indicator bar */}
          <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${style.leftBar}`} />
          
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className={`p-2 rounded-xl border shrink-0 ${style.iconBg}`}>
                {getCardIcon(bKey, style.iconColor)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-white text-base font-black truncate leading-tight">{customName}</span>
                <span className="text-[10px] text-slate-400 font-bold truncate mt-0.5">{style.indicatorText}</span>
              </div>
            </div>

            <div className="text-right shrink-0 pl-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Поточний баланс</span>
              <span className={`text-lg sm:text-xl font-black font-mono ${style.accentText}`}>
                {bal.toFixed(2)} {symbol}
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Filters Panel */}
        <div className="bg-slate-900/60 border border-slate-800/80 p-3.5 rounded-2xl flex flex-col gap-2.5 no-print">
          <div className="flex flex-col sm:flex-row gap-2">
            
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Шукати за описом, сумою чи статтею..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl pl-9 pr-10 py-2 text-xs font-semibold text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-sky-500/30 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="p-1 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-white absolute right-2.5 top-1.5 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Month Filter */}
            <div className="sm:w-48">
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2 text-xs font-black text-slate-300 focus:outline-none focus:border-sky-500/30 transition-all cursor-pointer"
              >
                <option value="all">📅 Всі місяці</option>
                {uniqueMonths.map(mon => (
                  <option key={mon} value={mon}>{getMonthNameUk(mon)}</option>
                ))}
              </select>
            </div>

          </div>
        </div>

        {/* Selected Period Financial Summary Card with Clickable Filter Buttons */}
        <div className="bg-slate-900/80 border border-slate-800 p-3.5 sm:p-4 rounded-2xl flex flex-col gap-3 shadow-md no-print">
          {/* Header of summary */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2 gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 truncate">
              <span>📊</span> Підсумки ({monthFilter === 'all' ? 'весь час' : getMonthNameUk(monthFilter)})
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              {filterType !== "all" && (
                <button
                  type="button"
                  onClick={() => setFilterType("all")}
                  className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30 hover:bg-sky-500/25 transition-all cursor-pointer active:scale-95"
                >
                  ✕ Всі ({periodTxs.length})
                </button>
              )}
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border shrink-0 ${
                netFlow >= 0 
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" 
                  : "bg-rose-500/15 text-rose-300 border-rose-500/30"
              }`}>
                {netFlow >= 0 ? "Сальдо: Приріст (+)" : "Сальдо: Спад (-)"}
              </span>
            </div>
          </div>

          {/* Interactive Clickable Income & Expense Buttons */}
          <div className="grid grid-cols-2 gap-2">
            {/* Income Button */}
            <button
              type="button"
              onClick={() => setFilterType(prev => prev === "income" ? "all" : "income")}
              className={`p-2.5 rounded-xl flex flex-col gap-1 text-left transition-all cursor-pointer active:scale-95 select-none relative ${
                filterType === "income"
                  ? "bg-emerald-900/40 border-2 border-emerald-400 ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/20"
                  : "bg-emerald-950/25 border border-emerald-500/30 hover:bg-emerald-950/40 hover:border-emerald-500/50"
              }`}
              title="Натисніть для фільтрації виписки: показати тільки доходи"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 text-emerald-300">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-sm shadow-emerald-400/50" />
                  <span>Надходження</span>
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9.5px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.2 rounded border border-slate-800">
                    {incomeCount} оп.
                  </span>
                  {filterType === "income" && (
                    <span className="text-[8.5px] font-black text-emerald-300 bg-emerald-500/30 px-1 rounded border border-emerald-400/40">
                      ✓
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm sm:text-base font-black text-emerald-400 font-mono truncate">
                +{totalIncome.toFixed(2)} {symbol}
              </div>
            </button>

            {/* Expense Button */}
            <button
              type="button"
              onClick={() => setFilterType(prev => prev === "expense" ? "all" : "expense")}
              className={`p-2.5 rounded-xl flex flex-col gap-1 text-left transition-all cursor-pointer active:scale-95 select-none relative ${
                filterType === "expense"
                  ? "bg-rose-900/40 border-2 border-rose-400 ring-2 ring-rose-500/30 shadow-lg shadow-rose-500/20"
                  : "bg-rose-950/25 border border-rose-500/30 hover:bg-rose-950/40 hover:border-rose-500/50"
              }`}
              title="Натисніть для фільтрації виписки: показати тільки списання"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 text-rose-300">
                  <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0 shadow-sm shadow-rose-400/50" />
                  <span>Списання</span>
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[9.5px] font-bold text-slate-400 bg-slate-900/80 px-1.5 py-0.2 rounded border border-slate-800">
                    {expenseCount} оп.
                  </span>
                  {filterType === "expense" && (
                    <span className="text-[8.5px] font-black text-rose-300 bg-rose-500/30 px-1 rounded border border-rose-400/40">
                      ✓
                    </span>
                  )}
                </div>
              </div>
              <div className="text-sm sm:text-base font-black text-rose-400 font-mono truncate">
                -{Math.abs(totalExpense).toFixed(2)} {symbol}
              </div>
            </button>
          </div>

          {/* Turnover & Saldo row */}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60">
            <div 
              onClick={() => setFilterType("all")}
              className="flex flex-col text-left cursor-pointer hover:opacity-80 transition-opacity"
              title="Показати всі операції"
            >
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1">
                <span>Загальний обіг:</span>
                {filterType === "all" ? (
                  <span className="text-[9px] text-sky-400 font-black">• всі</span>
                ) : (
                  <span className="text-[9px] text-sky-400 underline font-bold">показати всі</span>
                )}
              </span>
              <span className="text-xs sm:text-sm font-black text-sky-300 font-mono mt-0.5 truncate">
                {totalTurnover.toFixed(2)} {symbol}
              </span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Чисте сальдо:</span>
              <span className={`text-xs sm:text-sm font-black font-mono mt-0.5 truncate ${netFlow >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {netFlow >= 0 ? "+" : ""}{netFlow.toFixed(2)} {symbol}
              </span>
            </div>
          </div>
        </div>

        {/* Transactions List */}
        <div className="flex flex-col gap-2 mt-1">
          <div className="flex justify-between items-center px-1 no-print">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-sky-400" />
              <span>Виписка операцій ({filteredTxs.length})</span>
              {filterType !== "all" && (
                <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                  filterType === "income" 
                    ? "text-emerald-300 border-emerald-500/30 bg-emerald-950/40" 
                    : "text-rose-300 border-rose-500/30 bg-rose-950/40"
                }`}>
                  {filterType === "income" ? "доходи" : "списання"}
                </span>
              )}
            </span>
            
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const allExpanded = filteredTxs.length > 0 && filteredTxs.every((_, i) => expandedTxs[i]);
                  if (allExpanded) {
                    setExpandedTxs({});
                  } else {
                    const next: {[key: number]: boolean} = {};
                    filteredTxs.forEach((_, i) => { next[i] = true; });
                    setExpandedTxs(next);
                  }
                }}
                className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-all cursor-pointer active:scale-95"
              >
                {filteredTxs.length > 0 && filteredTxs.every((_, i) => expandedTxs[i]) ? "Згорнути всі" : "Розгорнути всі"}
              </button>

              <button
                type="button"
                onClick={() => onNavigateToHistoryWithSearch?.(customName)}
                className="text-[10px] font-black text-sky-400 hover:text-sky-300 transition-all flex items-center gap-1"
                title="Відкрити ці операції у загальній вкладці Історії для детального редагування"
              >
                <span>Повний пошук ➔</span>
              </button>
            </div>
          </div>

          {filteredTxs.length === 0 ? (
            <div className="bg-slate-900/25 border border-slate-800/40 p-10 rounded-2xl text-center flex flex-col items-center justify-center gap-2">
              <Info className="w-6 h-6 text-slate-600" />
              <p className="text-xs text-slate-500 font-semibold italic">За вибраними фільтрами операцій не знайдено.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredTxs.map((t, idx) => {
                const isTxExpanded = !!expandedTxs[idx];
                const itemStyle = t.isIncome 
                  ? { border: isTxExpanded ? "border-emerald-500/40 bg-emerald-950/20" : "border-emerald-500/20 bg-slate-900/80", sumColor: "text-emerald-400", indicator: "bg-emerald-500", badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" }
                  : { border: isTxExpanded ? "border-rose-500/40 bg-rose-950/20" : "border-rose-500/20 bg-slate-900/80", sumColor: "text-rose-400", indicator: "bg-rose-500", badge: "bg-rose-500/15 text-rose-300 border-rose-500/30" };

                const parsed = parseTransactionText(t.fullText || t.comment);
                let displayTitle = t.category || "Операція";
                let displayComment = "";

                if (parsed.comment) {
                  const catMatch = parsed.comment.match(/^\[(.*?)\]\s*([\s\S]*)/);
                  if (catMatch) {
                    displayTitle = catMatch[1].trim();
                    displayComment = catMatch[2].trim();
                  } else {
                    displayComment = parsed.comment;
                  }
                }

                if (!displayComment) {
                  if (parsed.contractor) {
                    displayComment = `👤 ${parsed.contractor}`;
                  } else if (parsed.cardDetails) {
                    displayComment = `💳 ${parsed.cardDetails.replace(/\n/g, " | ")}`;
                  } else if (parsed.exchangeDetails) {
                    displayComment = `🔄 ${parsed.exchangeDetails.replace(/\n/g, " | ")}`;
                  } else if (parsed.cleanDescription && !parsed.cleanDescription.startsWith("💰")) {
                    displayComment = parsed.cleanDescription;
                  }
                }

                return (
                  <div
                    key={idx}
                    onClick={() => setExpandedTxs(prev => ({ ...prev, [idx]: !isTxExpanded }))}
                    className={`p-3 sm:p-3.5 border rounded-2xl flex flex-col gap-2 relative overflow-hidden transition-all duration-200 cursor-pointer hover:bg-slate-850 shadow-md ${itemStyle.border}`}
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${itemStyle.indicator}`} />
                    
                    <div className="flex items-center justify-between gap-3 w-full pl-2.5 sm:pl-3">
                      <div className="flex flex-col gap-1 text-xs min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`px-2 py-0.5 rounded-md text-[10.5px] font-black uppercase tracking-wider border shadow-sm max-w-[140px] sm:max-w-[220px] truncate shrink-0 ${itemStyle.badge}`}>
                            {displayTitle}
                          </span>
                          <span className="text-[10px] text-slate-400 font-bold font-mono shrink-0">
                            {t.dateStr}
                          </span>
                        </div>
                        {displayComment ? (
                          <span className="text-[11px] text-slate-300 font-medium break-words leading-tight line-clamp-2 block w-full mt-0.5">
                            {displayComment}
                          </span>
                        ) : null}
                      </div>

                      <div className="shrink-0 flex items-center gap-2 text-right pl-2">
                        <span className={`text-sm sm:text-base font-black font-mono tracking-tight whitespace-nowrap ${itemStyle.sumColor}`}>
                          {t.isIncome ? "+" : "-"}{Math.abs(t.sum).toFixed(2)} {symbol}
                        </span>
                        <div className="p-1 rounded-lg bg-slate-800 text-slate-300 shrink-0">
                          {isTxExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </div>
                      </div>
                    </div>

                    {isTxExpanded && (
                      <div 
                        onClick={(e) => e.stopPropagation()}
                        className="mt-2.5 pt-2.5 border-t border-slate-800/80 text-xs text-slate-300 font-medium flex flex-col gap-2.5 animate-fadeIn"
                      >
                        <div className="flex flex-col gap-1.5">
                          <span className="text-slate-400 block font-extrabold uppercase tracking-wider text-[10px] flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-sky-400" />
                            Повний опис та деталі операції:
                          </span>

                          {(() => {
                            const parsed = parseTransactionText(t.fullText || t.comment);
                            const rawContent = (t.fullText || t.comment || "").trim();

                            return (
                              <div className="flex flex-col gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800/90 shadow-inner text-left">
                                {/* Contractor if present */}
                                {parsed.contractor && (
                                  <div className="flex items-center gap-1.5 text-xs text-amber-300 font-bold bg-amber-950/30 p-2 rounded-lg border border-amber-800/40">
                                    <span className="text-slate-400 font-medium">👤 Контрагент:</span>
                                    <span>{parsed.contractor}</span>
                                  </div>
                                )}

                                {/* Exchange / Rate if present */}
                                {(parsed.exchangeDetails || parsed.rate) && (
                                  <div className="flex flex-col gap-1 p-2 rounded-lg bg-purple-950/30 border border-purple-800/40 text-xs">
                                    {parsed.exchangeDetails && (
                                      <div className="text-purple-200 font-semibold">🔄 {parsed.exchangeDetails}</div>
                                    )}
                                    {parsed.rate && (
                                      <div className="text-emerald-400 font-bold">📈 Курс: {parsed.rate}</div>
                                    )}
                                  </div>
                                )}

                                {/* Card / Bank details if present */}
                                {parsed.cardDetails && (
                                  <div className="flex flex-col gap-0.5 text-xs text-sky-300 bg-sky-950/20 p-2 rounded-lg border border-sky-800/30">
                                    <span className="text-[10px] text-slate-400 font-bold">💳 Деталі переказу / рахунку:</span>
                                    <span className="font-mono whitespace-pre-wrap">{parsed.cardDetails}</span>
                                  </div>
                                )}

                                {/* Main comment / description text */}
                                <div className="text-slate-100 text-xs font-medium leading-relaxed whitespace-pre-wrap break-words">
                                  {parsed.comment || parsed.cleanDescription || rawContent || "Немає додаткового опису"}
                                </div>

                                {/* Receipt URL if present */}
                                {parsed.receiptUrl && (
                                  <a
                                    href={parsed.receiptUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 underline font-bold mt-1"
                                  >
                                    📎 Чек / додаток
                                  </a>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {onDeleteBankOperation && (
                          <div className="flex justify-end mt-1">
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!confirm("Ви впевнені, що хочете видалити цю конкретну транзакцію зі звіту цього банку?\n\nЦя дія очистить операцію лише з цього рахунку, не впливаючи на інші загальні записи.")) return;
                                try {
                                  await onDeleteBankOperation(t.dateStr, bKey);
                                } catch (err) {
                                  alert("Помилка видалення операції зі звіту.");
                                }
                              }}
                              className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 font-bold rounded-lg text-[10px] flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 select-none"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Видалити тільки зі звіту</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    );
  }

  const symbol = getCurrencySymbol(currentCurrency);

  return (
    <div className="flex flex-col gap-4 text-left animate-fadeIn">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 no-print flex-wrap gap-2">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <Layers className="w-5 h-5 text-sky-400" />
          Деталі рахунків ({currentCurrency})
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setShowBalanceGuide(true)}
            type="button"
            className="text-xs font-black text-sky-300 hover:text-white transition-all bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
            title="Відкрити довідник по всіх балансах та формулах"
          >
            <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
            <span>Підказки до балансів</span>
          </button>

          {onOpenInitialDataModal && (
            <button
              onClick={onOpenInitialDataModal}
              className="text-xs font-black text-amber-300 hover:text-white transition-all bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
            >
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <span>📥 Початкові залишки</span>
            </button>
          )}
          <button
            onClick={onBack}
            type="button"
            className="text-xs font-bold text-slate-400 hover:text-white transition-all bg-slate-800 px-3 py-1.5 rounded-lg cursor-pointer"
          >
            Назад
          </button>
        </div>
      </div>

      {/* Net capital card */}
      <div className="bg-slate-900/80 border border-slate-800/80 p-5 rounded-2xl flex flex-col shadow-sm text-center relative overflow-hidden">
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Чистий капітал в валюті ({currentCurrency})
          </span>
          <button
            type="button"
            onClick={() => setActiveBalanceHint({
              title: `Чистий капітал (${currentCurrency})`,
              badge: "Головний показник капіталу",
              formula: "Чистий капітал = Загалом на рахунках + Борговий баланс",
              breakdown: `${netTotal.toFixed(2)} ${symbol} = ${bankTotal.toFixed(2)} ${symbol} (Рахунки) + ${debtorsTotal >= 0 ? "+" : ""}${debtorsTotal.toFixed(2)} ${symbol} (Борги)`,
              description: "Повна реальна фінансова вартість усіх ваших активів у цій валюті. Враховує реальні кошти на рахунках та сальдо заборгованостей (хто винен вам мінус кому винні ви).",
              tips: [
                "Якщо чистий капітал зростає щомісяця — ваші фінанси стабільні та прибуткові.",
                "Звертайте увагу на частку боргів: високий капітал при великих боргах несе ризик неповернення коштів.",
                "Для щоденних витрат спирайтеся на блок «Тільки власні кошти» нижче."
              ],
              accentColor: "sky"
            })}
            className="p-1 text-slate-500 hover:text-sky-400 transition-colors cursor-pointer rounded-full hover:bg-slate-800"
            title="Як рахується чистий капітал?"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="text-3xl font-black text-white mt-1">
          {netTotal.toFixed(2)} {getCurrencySymbol(currentCurrency)}
        </span>
        
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-800/60 text-xs">
          <div className="flex flex-col border-r border-slate-800/60 pr-1">
            <div className="flex items-center justify-center gap-1">
              <span className="text-slate-500 font-bold flex items-center gap-1">🏦 Загалом рахунки</span>
              <button
                type="button"
                onClick={() => setActiveBalanceHint({
                  title: `Рахунки (Банки та Готівка)`,
                  badge: "Всі ліквідні рахунки",
                  formula: "Сума рахунків = Готівка + Банк 1 + Банк 2 + Банк 3 + Банк 4 + Банк 5",
                  breakdown: `Разом: ${bankTotal.toFixed(2)} ${symbol}`,
                  description: "Загальний баланс усіх зареєстрованих банківських карток та готівки. Якщо на якомусь із рахунків є мінус (наприклад, кредитний ліміт), він зменшує цю суму.",
                  tips: [
                    "Натисніть на картку будь-якого банку нижче, щоб переглянути детальний реєстр операцій.",
                    "Для виправлення залишку використовуйте кнопку коригування ✏️."
                  ],
                  accentColor: "indigo"
                })}
                className="text-slate-500 hover:text-sky-400 p-0.5 rounded cursor-pointer"
                title="Підказка до рахунків"
              >
                <HelpCircle className="w-3 h-3" />
              </button>
            </div>
            <span className="text-sm font-black text-slate-300 mt-0.5">
              {bankTotal.toFixed(2)} {getCurrencySymbol(currentCurrency)}
            </span>
          </div>

          <div className="flex flex-col pl-1">
            <div className="flex items-center justify-center gap-1">
              <span 
                onClick={() => onNavigate?.("debtors")}
                className="text-slate-500 font-bold flex items-center gap-1 cursor-pointer hover:text-sky-400 transition-colors"
                title="Переглянути список боржників"
              >
                👤 Борговий баланс
              </span>
              <button
                type="button"
                onClick={() => setActiveBalanceHint({
                  title: `Борговий баланс (Сальдо заборгованостей)`,
                  badge: debtorsTotal >= 0 ? "Позитивне сальдо" : "Негативне сальдо",
                  formula: "Борговий баланс = Хто винен нам (Дебітори) - Кому винні ми (Кредитори)",
                  breakdown: `Сальдо: ${debtorsTotal >= 0 ? "+" : ""}${debtorsTotal.toFixed(2)} ${symbol}`,
                  description: "Чисте сальдо заборгованостей. Додатнє число означає, що вам винні більше, ніж ви іншим. Від'ємне — що ваші боргові зобов'язання перевищують очікувані надходження.",
                  tips: [
                    "Натисніть на цю категорію для переходу до детального списку боржників.",
                    "Своєчасно контролюйте строки повернення позик та відсотки."
                  ],
                  accentColor: debtorsTotal >= 0 ? "emerald" : "rose",
                  targetAction: {
                    label: "Перейти до боржників ➔",
                    onClick: () => {
                      setActiveBalanceHint(null);
                      onNavigate?.("debtors");
                    }
                  }
                })}
                className="text-slate-500 hover:text-sky-400 p-0.5 rounded cursor-pointer"
                title="Підказка до боргового балансу"
              >
                <HelpCircle className="w-3 h-3" />
              </button>
            </div>
            <span 
              onClick={() => onNavigate?.("debtors")}
              className={`text-sm font-black mt-0.5 cursor-pointer ${debtorsTotal >= 0 ? "text-emerald-400" : "text-red-400"}`}
            >
              {debtorsTotal >= 0 ? "+" : ""}{debtorsTotal.toFixed(2)} {getCurrencySymbol(currentCurrency)}
            </span>
          </div>
        </div>

        {/* Highlight Positive Liquid Resources */}
        <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
          <div className="flex items-center gap-1.5">
            <span className="text-amber-200 font-bold flex items-center gap-1.5">
              💵 Тільки власні кошти ({currentCurrency}):
            </span>
            <button
              type="button"
              onClick={() => setActiveBalanceHint({
                title: `Тільки власні кошти (Ліквідність)`,
                badge: "Вільні живі гроші",
                formula: "Власні кошти = Сума тільки додатних залишків на рахунках (без кредитів і боргів)",
                breakdown: `Доступно негайно: +${positiveBankTotal.toFixed(2)} ${symbol}`,
                description: "Реальний грошовий запас, який є у вашому прямому розпорядженні в цю секунду. Тут не враховуються обіцяні борги контрагентів чи кредитні мінуси — тільки реальні вільні гроші.",
                tips: [
                  "Це ваш головний захисний буфер для щоденних витрат.",
                  "Саме цей показник використовується для оцінки фінансової подушки безпеки."
                ],
                accentColor: "amber"
              })}
              className="text-amber-400/80 hover:text-amber-200 p-0.5 rounded cursor-pointer"
              title="Підказка: що таке власні кошти?"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="text-sm font-black text-amber-300">
            +{positiveBankTotal.toFixed(2)} {getCurrencySymbol(currentCurrency)}
          </span>
        </div>
      </div>

      {/* NEW: Financial Health & Runway Insight Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-2xl flex flex-col gap-3 shadow-sm no-print">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Lightbulb className="w-4 h-4" />
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                Фінансова аналітика та диверсифікація
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                Оцінка ліквідності та розподілу активів
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveBalanceHint({
              title: "Фінансовий запас міцності (Runway)",
              badge: "Аналітика фінансової стійкості",
              formula: "Runway (місяців) = Тільки власні кошти / Середні щомісячні витрати",
              breakdown: avgMonthlyExpense > 0 
                ? `~${runwayMonths?.toFixed(1) || "0"} міс. (${positiveBankTotal.toFixed(2)} ${symbol} ÷ ~${avgMonthlyExpense.toFixed(2)} ${symbol}/міс.)`
                : "Ще недостатньо операцій для розрахунку середньомісячних витрат",
              description: "Показує, скільки часу ви зможете повністю комфортно покривати витрати на наявних власних коштах без нових надходжень.",
              tips: [
                "🟢 Більше 3-6 місяців: безпечна подушка, відмінна фінансова стабільність.",
                "🟡 1-3 місяці: помірний запас, контролюйте щомісячні витрати.",
                "🔴 Менше 1 місяця: критична зона, рекомендується терміново створити резерв."
              ],
              accentColor: "emerald"
            })}
            className="text-[11px] font-black text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700/60"
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Як розраховано?</span>
          </button>
        </div>

        {/* Runway & Asset allocation details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          {/* Runway block */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col justify-between gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>🛡️</span> Запас міцності (Runway)
            </span>
            <div className="flex items-baseline gap-2">
              <span className={`text-base font-black ${
                runwayMonths == null ? "text-slate-400" :
                runwayMonths >= 3 ? "text-emerald-400" :
                runwayMonths >= 1 ? "text-amber-400" :
                "text-rose-400"
              }`}>
                {runwayMonths != null ? `~${runwayMonths.toFixed(1)} міс.` : "Розраховується"}
              </span>
              {avgMonthlyExpense > 0 && (
                <span className="text-[10px] text-slate-500 font-medium">
                  при сер. витратах ~{avgMonthlyExpense.toFixed(0)} {symbol}/міс.
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 leading-tight">
              {runwayMonths == null ? "Додайте витрати в історію для точного підрахунку" :
               runwayMonths >= 3 ? "Безпечний запас фінансової подушки (>3 міс.)" :
               runwayMonths >= 1 ? "Помірний рівень ліквідності (1-3 міс.)" :
               "Рекомендовано збільшити резерв ліквідних грошей"}
            </p>
          </div>

          {/* Asset structure block */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              <span>📊 Структура капіталу</span>
              <span className="text-slate-500">{positiveBankTotal > 0 ? "100%" : "—"}</span>
            </div>
            
            {/* Visual allocation bar */}
            <div className="w-full h-2.5 bg-slate-850 rounded-full overflow-hidden flex shadow-inner">
              {cashPercent > 0 && (
                <div 
                  style={{ width: `${cashPercent}%` }} 
                  className="h-full bg-emerald-500 transition-all duration-500" 
                  title={`Готівка: ${cashPercent}%`} 
                />
              )}
              {banksPercent > 0 && (
                <div 
                  style={{ width: `${banksPercent}%` }} 
                  className="h-full bg-sky-500 transition-all duration-500" 
                  title={`Банки: ${banksPercent}%`} 
                />
              )}
              {debtorsPercent > 0 && (
                <div 
                  style={{ width: `${debtorsPercent}%` }} 
                  className="h-full bg-purple-500 transition-all duration-500" 
                  title={`Борги: ${debtorsPercent}%`} 
                />
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] font-bold text-slate-300">
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                💵 Готівка {cashPercent}%
              </span>
              <span className="flex items-center gap-1 text-sky-400">
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                🏦 Банки {banksPercent}%
              </span>
              {debtorsPercent > 0 && (
                <span className="flex items-center gap-1 text-purple-400">
                  <span className="w-2 h-2 rounded-full bg-purple-500" />
                  👤 Борги {debtorsPercent}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Active Accounts */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5 px-1">
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
            🏦 Активні рахунки:
          </span>
          <span className="text-[10px] text-slate-500 font-semibold italic no-print">
            (Натисніть на рахунок, щоб відкрити його історію транзакцій)
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {Object.keys(banks).map((bKey, idx) => {
            const bal = banks[bKey as keyof typeof banks] || 0;
            const customName = aliases[bKey] || bKey;
            const style = getBankStyle(bKey, customName);

            return (
              <div
                key={idx}
                onClick={() => openBankReport(bKey, customName)}
                className={`p-3.5 border rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] group relative overflow-hidden ${style.border} ${style.bg}`}
                title={`Показати звіт по рахунку ${customName}`}
              >
                {/* Brand vertical border highlight on the left */}
                <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${style.leftBar}`} />

                <div className="flex items-center gap-3.5 min-w-0 flex-1 text-sm font-semibold pl-1.5">
                  <div className={`p-2.5 rounded-xl border flex-shrink-0 transition-colors ${style.iconBg}`}>
                    {getCardIcon(bKey, style.iconColor)}
                  </div>
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1 text-xs text-slate-500 font-semibold">
                    <span className="text-white text-sm font-black truncate group-hover:text-sky-400 transition-colors">
                      {customName}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold truncate">{style.indicatorText}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-base font-black ${style.accentText}`}>
                    {bal.toFixed(2)} {getCurrencySymbol(currentCurrency)}
                  </span>
                  {onSaveAdjustment && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAdjustingBank({ key: bKey, name: customName, balance: bal });
                        setTargetBalance(bal.toFixed(2));
                        setComment(`Коригування балансу ${customName}`);
                      }}
                      className="p-1.5 hover:bg-slate-800/80 rounded-lg text-slate-400 hover:text-sky-400 transition-all cursor-pointer no-print flex items-center justify-center border border-transparent hover:border-slate-700/60"
                      title="Коригувати баланс"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all no-print" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Debtors who owe us */}
      {debtors && debtors.oweUs.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              Нам винні (Дебітори):
            </span>
            <span className="text-[10px] text-slate-500 font-semibold italic no-print">
              (Натисніть на контрагента для перегляду взаєморозрахунків)
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {debtors.oweUs.map((item, idx) => (
              <div
                key={idx}
                onClick={() => onNavigateToHistoryWithSearch?.(item.name)}
                className="p-3.5 bg-emerald-950/10 hover:bg-emerald-950/20 border border-emerald-500/20 hover:border-emerald-500/50 rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] group relative overflow-hidden"
                title={`Показати історію взаємозаліків з ${item.name}`}
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500" />
                <div className="flex flex-col gap-0.5 truncate text-[10px] text-slate-500 font-semibold pl-1.5">
                  <span className="text-sm font-black text-white group-hover:text-emerald-400 transition-colors">
                    {item.name}
                  </span>
                  <span className="font-bold text-slate-500">Контрагент-боржник</span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-base font-black text-emerald-400">
                    +{item.sum.toFixed(2)} {getCurrencySymbol(currentCurrency)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all no-print" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Creditors whom we owe */}
      {debtors && debtors.weOwe.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <div className="flex flex-col gap-0.5 px-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-red-400 flex items-center gap-1">
              <ArrowDownLeft className="w-4 h-4 text-red-400" />
              Ми винні (Кредитори):
            </span>
            <span className="text-[10px] text-slate-500 font-semibold italic no-print">
              (Натисніть на контрагента для перегляду взаєморозрахунків)
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {debtors.weOwe.map((item, idx) => (
              <div
                key={idx}
                onClick={() => onNavigateToHistoryWithSearch?.(item.name)}
                className="p-3.5 bg-red-950/10 hover:bg-red-950/20 border border-red-500/20 hover:border-red-500/50 rounded-2xl flex items-center justify-between gap-4 cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99] group relative overflow-hidden"
                title={`Показати історію взаємозаліків з ${item.name}`}
              >
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
                <div className="flex flex-col gap-0.5 truncate text-[10px] text-slate-500 font-semibold pl-1.5">
                  <span className="text-sm font-black text-white group-hover:text-red-400 transition-colors">
                    {item.name}
                  </span>
                  <span className="font-bold text-slate-500">Контрагент-кредитор</span>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-base font-black text-red-400">
                    -{item.sum.toFixed(2)} {getCurrencySymbol(currentCurrency)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-red-400 group-hover:translate-x-0.5 transition-all no-print" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {adjustingBank && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 w-full max-w-[340px] shadow-2xl flex flex-col text-left">
            <h3 className="font-black text-sky-400 mb-1 text-base flex items-center gap-2">
              <Edit2 className="w-4 h-4" />
              Коригувати баланс
            </h3>
            <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
              Коригування для рахунку <span className="font-bold text-slate-200">{adjustingBank.name}</span>
            </p>

            <div className="flex flex-col gap-3.5">
              {/* Current balance display */}
              <div className="bg-slate-950/50 border border-slate-800/60 p-2.5 rounded-xl text-xs flex justify-between items-center">
                <span className="text-slate-500 font-bold">Поточний баланс:</span>
                <span className="font-black text-slate-300">
                  {adjustingBank.balance.toFixed(2)} {getCurrencySymbol(currentCurrency)}
                </span>
              </div>

              {/* Target balance Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Новий баланс ({getCurrencySymbol(currentCurrency)}):
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={targetBalance}
                  onChange={(e) => setTargetBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3.5 py-2.5 text-sm font-black text-white focus:outline-none focus:border-sky-500/50 transition-all placeholder:text-slate-700"
                />
              </div>

              {/* Comment Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Коментар (необов'язково):
                </label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Причина коригування..."
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-200 focus:outline-none focus:border-sky-500/50 transition-all placeholder:text-slate-700"
                />
              </div>

              {/* Calculated difference */}
              {(() => {
                const targetVal = parseFloat(targetBalance);
                if (isNaN(targetVal)) return null;
                const diff = targetVal - adjustingBank.balance;
                if (diff === 0) {
                  return (
                    <div className="text-[11px] font-bold text-slate-500 bg-slate-955 p-2 rounded-lg text-center border border-slate-800/40">
                      Баланс не зміниться
                    </div>
                  );
                }
                const sign = diff > 0 ? "+" : "";
                const isPositive = diff > 0;
                return (
                  <div className={`text-[11px] font-extrabold p-2.5 rounded-xl text-center border flex items-center justify-center gap-1.5 leading-none ${
                    isPositive 
                      ? "text-emerald-400 bg-emerald-950/20 border-emerald-500/20" 
                      : "text-rose-400 bg-rose-950/20 border-rose-500/20"
                  }`}>
                    <span>{isPositive ? "📈 Збільшення на" : "📉 Зменшення на"}:</span>
                    <span className="font-black">{sign}{diff.toFixed(2)} {getCurrencySymbol(currentCurrency)}</span>
                  </div>
                );
              })()}

              {/* Actions */}
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setAdjustingBank(null)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-bold rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  disabled={isSaving || isNaN(parseFloat(targetBalance)) || parseFloat(targetBalance) === adjustingBank.balance}
                  onClick={handleSaveAdjust}
                  className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Збереження...
                    </>
                  ) : (
                    "Зберегти"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE BALANCE HINT MODAL */}
      {activeBalanceHint && (
        <div 
          onClick={() => setActiveBalanceHint(null)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-5 sm:p-6 w-full max-w-lg shadow-2xl flex flex-col gap-4 text-left relative max-h-[90vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl flex-shrink-0 ${
                  activeBalanceHint.accentColor === "sky" ? "bg-sky-500/20 text-sky-400 border border-sky-500/30" :
                  activeBalanceHint.accentColor === "emerald" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                  activeBalanceHint.accentColor === "amber" ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" :
                  activeBalanceHint.accentColor === "indigo" ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30" :
                  "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                }`}>
                  <HelpCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base sm:text-lg font-black text-white">
                      {activeBalanceHint.title}
                    </h3>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                    {activeBalanceHint.badge}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setActiveBalanceHint(null)}
                className="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formula Block */}
            <div className="flex flex-col gap-1.5 p-3 sm:p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 text-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-sky-400" />
                Математична формула розрахунку:
              </span>
              <div className="font-mono text-sky-300 font-bold bg-slate-900/90 p-2.5 rounded-xl border border-slate-800/80 break-words leading-relaxed text-[11px] sm:text-xs">
                {activeBalanceHint.formula}
              </div>
              {activeBalanceHint.breakdown && (
                <div className="mt-1 pt-1.5 border-t border-slate-900 text-[11px] text-slate-300 font-semibold flex items-baseline justify-between gap-2 flex-wrap">
                  <span className="text-slate-500">Поточний результат:</span>
                  <span className="font-mono font-black text-emerald-400">{activeBalanceHint.breakdown}</span>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1 text-xs text-slate-300 leading-relaxed">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Суть та фінансове значення:
              </span>
              <p className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 text-slate-200 font-medium">
                {activeBalanceHint.description}
              </p>
            </div>

            {/* Tips Block */}
            {activeBalanceHint.tips && activeBalanceHint.tips.length > 0 && (
              <div className="flex flex-col gap-2 p-3 sm:p-3.5 rounded-2xl bg-emerald-950/15 border border-emerald-500/20 text-xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Lightbulb className="w-3.5 h-3.5 text-emerald-400" />
                  Практичні поради щодо контролю:
                </span>
                <div className="space-y-1.5 text-slate-300 text-[11.5px] leading-relaxed">
                  {activeBalanceHint.tips.map((tip, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <span className="text-emerald-400 font-bold select-none">•</span>
                      <span>{tip}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions Footer */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800 flex-wrap">
              {activeBalanceHint.targetAction ? (
                <button
                  type="button"
                  onClick={activeBalanceHint.targetAction.onClick}
                  className="px-4 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200 font-black text-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <span>{activeBalanceHint.targetAction.label}</span>
                </button>
              ) : <div />}

              <button
                type="button"
                onClick={() => setActiveBalanceHint(null)}
                className="px-5 py-2.5 rounded-xl bg-sky-500 text-slate-950 font-black text-xs hover:bg-sky-400 transition-all active:scale-95 cursor-pointer ml-auto shadow-md shadow-sky-500/20"
              >
                Зрозуміло
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FULL BALANCE GUIDEBOOK & SIMULATOR MODAL */}
      {showBalanceGuide && (
        <div 
          onClick={() => setShowBalanceGuide(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border-2 border-slate-800 rounded-3xl p-4 sm:p-6 w-full max-w-2xl shadow-2xl flex flex-col gap-4 text-left relative max-h-[92vh] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 shrink-0">
                  <Sparkles className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white flex items-center gap-1.5">
                    <span>Довідник та симулятор балансів ({currentCurrency})</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Повні формули розрахунку, оцінка ліквідності та планування фінансової подушки
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const text = `📊 Фінансове резюме (${currentCurrency}):\n` +
                      `💎 Чистий капітал: ${netTotal.toFixed(2)} ${symbol}\n` +
                      `🏦 Загалом рахунки: ${bankTotal.toFixed(2)} ${symbol}\n` +
                      `💵 Тільки власні кошти: +${positiveBankTotal.toFixed(2)} ${symbol}\n` +
                      `👤 Борговий баланс: ${debtorsTotal >= 0 ? "+" : ""}${debtorsTotal.toFixed(2)} ${symbol}\n` +
                      `🛡️ Запас міцності: ${runwayMonths != null ? `~${runwayMonths.toFixed(1)} міс.` : "не визначено"}`;

                    navigator.clipboard.writeText(text).then(() => {
                      setIsCopiedGuide(true);
                      setTimeout(() => setIsCopiedGuide(false), 2000);
                    }).catch(() => {});
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border flex items-center gap-1 cursor-pointer ${
                    isCopiedGuide 
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" 
                      : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750"
                  }`}
                  title="Скопіювати показники капіталу"
                >
                  {isCopiedGuide ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Скопійовано!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-400" />
                      <span>Скопіювати</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowBalanceGuide(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sub-Tabs Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0 text-xs">
              <button
                type="button"
                onClick={() => setGuideTab("overview")}
                className={`flex-1 py-1.5 px-2 rounded-lg font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  guideTab === "overview"
                    ? "bg-sky-500 text-slate-950 shadow-md font-black"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Огляд балансів</span>
              </button>

              <button
                type="button"
                onClick={() => setGuideTab("simulator")}
                className={`flex-1 py-1.5 px-2 rounded-lg font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  guideTab === "simulator"
                    ? "bg-emerald-500 text-slate-950 shadow-md font-black"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <Target className="w-3.5 h-3.5" />
                <span>🎯 Симулятор подушки та цілей</span>
              </button>

              <button
                type="button"
                onClick={() => setGuideTab("rules")}
                className={`flex-1 py-1.5 px-2 rounded-lg font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  guideTab === "rules"
                    ? "bg-amber-500 text-slate-950 shadow-md font-black"
                    : "text-slate-400 hover:text-white hover:bg-slate-900"
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>💱 Валютні правила</span>
              </button>
            </div>

            {/* Scrollable Content Viewport */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-3 text-xs">
              {guideTab === "overview" && (
                <div className="space-y-3 animate-fadeIn">
                  {/* Card 1: Чистий капітал */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-sky-500/30 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-lg bg-sky-500/20 text-sky-400 font-black">1</span>
                        <span className="font-black text-sm text-white">Чистий капітал (Net Worth)</span>
                      </div>
                      <span className="font-mono font-black text-sky-400 text-sm">
                        {netTotal.toFixed(2)} {symbol}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] bg-slate-900 p-2 rounded-lg text-sky-300 border border-slate-800">
                      Чистий капітал = Загалом на рахунках + Борговий баланс
                    </div>
                    <p className="text-slate-400 text-[11.5px] leading-relaxed">
                      Це головна сума вашого добробуту. Вона об'єднує всі гроші на картках, готівку, а також враховує, хто винен вам (дебітори) мінус те, що ви повинні віддати (кредитори).
                    </p>
                  </div>

                  {/* Card 2: Рахунки та картки */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-indigo-500/30 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-lg bg-indigo-500/20 text-indigo-400 font-black">2</span>
                        <span className="font-black text-sm text-white">Рахунки (Банки та Готівка)</span>
                      </div>
                      <span className="font-mono font-black text-indigo-300 text-sm">
                        {bankTotal.toFixed(2)} {symbol}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] bg-slate-900 p-2 rounded-lg text-indigo-300 border border-slate-800">
                      Сума рахунків = Готівка + Банк 1 + Банк 2 + Банк 3 + Банк 4 + Банк 5
                    </div>
                    <p className="text-slate-400 text-[11.5px] leading-relaxed">
                      Фактичний залишок на всіх ваших платіжних засобах. Якщо по картці увімкнено овердрафт або кредитний ліміт і баланс від'ємний, він автоматично віднімається.
                    </p>
                  </div>

                  {/* Card 3: Борговий баланс */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-purple-500/30 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-lg bg-purple-500/20 text-purple-400 font-black">3</span>
                        <span className="font-black text-sm text-white">Борговий баланс (Сальдо заборгованостей)</span>
                      </div>
                      <span className={`font-mono font-black text-sm ${debtorsTotal >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        {debtorsTotal >= 0 ? "+" : ""}{debtorsTotal.toFixed(2)} {symbol}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] bg-slate-900 p-2 rounded-lg text-purple-300 border border-slate-800">
                      Борговий баланс = Хто винен нам (Дебітори) - Кому винні ми (Кредитори)
                    </div>
                    <p className="text-slate-400 text-[11.5px] leading-relaxed">
                      Показує чистий борговий стан. Якщо число зелене з плюсом — вам винні більше коштів. Якщо червоне — ваші зобов'язання перевищують очікувані повернення.
                    </p>
                  </div>

                  {/* Card 4: Тільки власні кошти */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-amber-500/30 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-lg bg-amber-500/20 text-amber-400 font-black">4</span>
                        <span className="font-black text-sm text-white">Тільки власні кошти (Вільна ліквідність)</span>
                      </div>
                      <span className="font-mono font-black text-amber-300 text-sm">
                        +{positiveBankTotal.toFixed(2)} {symbol}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] bg-slate-900 p-2 rounded-lg text-amber-300 border border-slate-800">
                      Власні кошти = Сума виключно додатних залишків на рахунках
                    </div>
                    <p className="text-slate-400 text-[11.5px] leading-relaxed">
                      Це реальні "живі" гроші, які ви можете витратити прямо зараз без залучення кредитів чи очікування повернення позик від боржників.
                    </p>
                  </div>

                  {/* Card 5: Runway запас */}
                  <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-emerald-500/30 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400 font-black">5</span>
                        <span className="font-black text-sm text-white">Запас міцності (Runway)</span>
                      </div>
                      <span className="font-mono font-black text-emerald-400 text-sm">
                        {runwayMonths != null ? `~${runwayMonths.toFixed(1)} міс.` : "розраховується"}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] bg-slate-900 p-2 rounded-lg text-emerald-300 border border-slate-800">
                      Runway = Тільки власні кошти ÷ Середні витрати за місяць
                    </div>
                    <p className="text-slate-400 text-[11.5px] leading-relaxed">
                      Показник автономності: скільки місяців ви зможете комфортно жити на наявні власні кошти без надходження нових доходів.
                    </p>
                  </div>
                </div>
              )}

              {guideTab === "simulator" && (
                <div className="space-y-3.5 animate-fadeIn">
                  {/* Simulator Block 1: Подушка безпеки (Runway Buffer) */}
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-emerald-500/30 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        <div>
                          <h4 className="font-black text-sm text-white">Розрахунок фінансової подушки безпеки</h4>
                          <span className="text-[10px] text-slate-400">
                            Базується на ваших середніх витратах: ~{avgMonthlyExpense.toFixed(2)} {symbol}/міс.
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Бажаний термін автономності (місяців):
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[1, 3, 6, 12].map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setTargetRunwayMonths(m)}
                            className={`py-1.5 rounded-xl font-black text-xs transition-all border cursor-pointer ${
                              targetRunwayMonths === m
                                ? "bg-emerald-500 text-slate-950 border-emerald-400 shadow-md scale-105"
                                : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800"
                            }`}
                          >
                            {m} {m === 1 ? "місяць" : m < 5 ? "місяці" : "місяців"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(() => {
                      const requiredBuffer = avgMonthlyExpense * targetRunwayMonths;
                      const diff = positiveBankTotal - requiredBuffer;
                      const hasSurplus = diff >= 0;

                      return (
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400">Необхідна подушка на {targetRunwayMonths} міс.:</span>
                            <span className="font-mono font-black text-white text-sm">
                              {requiredBuffer.toFixed(2)} {symbol}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-xs border-t border-slate-800/80 pt-1.5">
                            <span className="text-slate-400">Наявні вільні кошти:</span>
                            <span className="font-mono font-black text-amber-300">
                              +{positiveBankTotal.toFixed(2)} {symbol}
                            </span>
                          </div>

                          <div className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-between ${
                            hasSurplus 
                              ? "bg-emerald-950/30 text-emerald-300 border-emerald-500/30" 
                              : "bg-rose-950/30 text-rose-300 border-rose-500/30"
                          }`}>
                            <span>{hasSurplus ? "🟢 Повна безпека! Профіцит подушки:" : "🟡 Дефіцит резерву (потрібно накопичити):"}</span>
                            <span className="font-black font-mono">
                              {hasSurplus ? "+" : ""}{diff.toFixed(2)} {symbol}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Simulator Block 2: Ціль капіталу (Target Capital Goal) */}
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-sky-500/30 space-y-3">
                    <div className="flex items-center gap-2">
                      <Target className="w-5 h-5 text-sky-400" />
                      <div>
                        <h4 className="font-black text-sm text-white">Планування та прогрес фінансової цілі</h4>
                        <span className="text-[10px] text-slate-400">Встановіть цільову планку загального капіталу</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        Цільова сума капіталу ({symbol}):
                      </label>
                      <input
                        type="number"
                        step="1000"
                        value={targetGoalSum}
                        onChange={(e) => setTargetGoalSum(e.target.value)}
                        placeholder="500000"
                        className="w-full bg-slate-900 border border-slate-700 focus:border-sky-400 rounded-xl px-3 py-2 text-sm font-black text-white outline-none"
                      />
                    </div>

                    {(() => {
                      const goal = parseFloat(targetGoalSum) || 1;
                      const progress = Math.min(100, Math.max(0, (netTotal / goal) * 100));
                      const remaining = Math.max(0, goal - netTotal);

                      return (
                        <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-400">Прогрес до цілі:</span>
                            <span className="font-black text-sky-400">{progress.toFixed(1)}%</span>
                          </div>

                          {/* Progress bar */}
                          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/60">
                            <div 
                              style={{ width: `${progress}%` }} 
                              className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-700" 
                            />
                          </div>

                          <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-800/80">
                            <span className="text-slate-400">Залишилося накопичити:</span>
                            <span className="font-mono font-black text-emerald-400">
                              {remaining.toFixed(2)} {symbol}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {guideTab === "rules" && (
                <div className="space-y-3 animate-fadeIn">
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-amber-500/30 space-y-2.5">
                    <h4 className="font-black text-sm text-amber-300 flex items-center gap-1.5">
                      <span>💱</span> Принцип реального ринкового перерахунку (Kantor Rules)
                    </h4>
                    <p className="text-slate-300 text-xs leading-relaxed">
                      У системі застосовано професійний підхід оцінки мультивалютного капіталу:
                    </p>
                    <div className="space-y-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <strong className="text-emerald-400 block mb-0.5">1. Додатні кошти (Активи):</strong>
                        <span className="text-slate-400">
                          Перераховуються за комерційним курсом купівлі (Bid). Тобто за скільки гривень ви реально можете продати свої долари чи євро в обміннику прямо зараз.
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <strong className="text-rose-400 block mb-0.5">2. Від'ємні залишки та борги (Зобов'язання):</strong>
                        <span className="text-slate-400">
                          Перераховуються за комерційним курсом продажу (Ask). Тобто за вищим курсом, за яким вам доведеться купувати валюту, щоб погасити свої борги.
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <strong className="text-sky-400 block mb-0.5">3. Захист від самообману:</strong>
                        <span className="text-slate-400">
                          Цей подвійний розрахунок гарантує, що ваш капітал не завищується штучно через усереднений курс, а показує справжню реальну ліквідаційну вартість.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 font-medium">
                Підказка: натискайте <HelpCircle className="w-3.5 h-3.5 inline text-sky-400" /> на будь-якому балансі для миттєвої формули
              </span>
              <button
                type="button"
                onClick={() => setShowBalanceGuide(false)}
                className="px-5 py-2 rounded-xl bg-sky-500 text-slate-950 font-black text-xs hover:bg-sky-400 transition-all active:scale-95 cursor-pointer shadow-md shadow-sky-500/20"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
