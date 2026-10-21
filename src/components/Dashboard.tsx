import React, { useState, useMemo, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  History,
  FileText,
  FileSpreadsheet,
  Users,
  RefreshCw,
  Undo2,
  Globe,
  Wallet,
  ChevronDown,
  ChevronUp,
  Calendar,
  Camera,
  Printer,
  Clock,
  Bookmark,
  X,
  Plus,
  Trash2,
  Coins,
  Scale,
  ArrowLeftRight,
  Copy,
  Check,
  Mic,
  Maximize2,
  Minimize2,
  RotateCw,
  BarChart2,
  HelpCircle,
  ChevronRight,
  Edit2,
  Info,
  Sparkles
} from "lucide-react";
import { InitData, HistoryGroup, HistoryItem } from "../types";
import { parseDateString, calculateAccruedInterest } from "../googleSheets";
import { AvailableResourcesModal } from "./AvailableResourcesModal";
import { getDailyRatesMap, saveDailyRatesForDate, getRatesForDate, formatRatesLastUpdated, fetchHistoricalRatesForDate } from "../lib/dailyRates";
import { isValidContractorName } from "../googleSheetsUtils";
import { parseTransactionText, resolveItemCurrency, getGroupEffectiveItems } from "../lib/transactionUtils";
export { getDailyRatesMap, saveDailyRatesForDate, getRatesForDate, formatRatesLastUpdated, fetchHistoricalRatesForDate };

interface DashboardProps {
  initData: InitData | null;
  currentCurrency: string;
  loading: boolean;
  onNavigate: (screen: string) => void;
  onUndo: () => void;
  hasLastAction: boolean;
  globalRateUsd: number;
  globalRateEur: number;
  globalRateUsdSell: number;
  globalRateEurSell: number;
  summaryBase: string;
  onToggleSummaryBase: (curr?: "UAH" | "USD" | "EUR") => void;
  allPlanned?: any[];
  onChangeCurrency?: (currency: "UAH" | "USD" | "EUR") => void;
  onHighlightPlanned?: (id: string) => void;
  historyGroups?: HistoryGroup[];
  onOpenInitialDataModal?: () => void;
  ratesLastUpdated?: string;
  onSelectContractor?: (name: string) => void;
}

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

const getCurrencyFlag = (currency: string) => {
  if (currency === "UAH") return "🇺🇦";
  if (currency === "USD") return "🇺🇸";
  if (currency === "EUR") return "🇪🇺";
  return "";
};

export const Dashboard: React.FC<DashboardProps> = ({
  initData,
  currentCurrency,
  loading,
  onNavigate,
  onUndo,
  hasLastAction,
  globalRateUsd,
  globalRateEur,
  globalRateUsdSell,
  globalRateEurSell,
  summaryBase,
  onToggleSummaryBase,
  allPlanned = [],
  onChangeCurrency,
  onHighlightPlanned,
  historyGroups = [],
  onOpenInitialDataModal,
  ratesLastUpdated,
  onSelectContractor
}) => {
  const [expandedCurrencies, setExpandedCurrencies] = useState<Record<string, boolean>>({});
  const [isPlannedExpanded, setIsPlannedExpanded] = useState(false);
  const [isComparePeriodExpanded, setIsComparePeriodExpanded] = useState(false);
  const [comparePreset, setComparePreset] = useState<string>("yesterday");
  const [customCompareDate, setCustomCompareDate] = useState<string>("");
  const [customCompareMonth, setCustomCompareMonth] = useState<string>(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    let m = d.getMonth();
    let y = d.getFullYear();
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    return `${y}-${pad(m)}`;
  });
  const [customCompareYear, setCustomCompareYear] = useState<string>(() => {
    return String(new Date().getFullYear() - 1);
  });
  const [monthOptionType, setMonthOptionType] = useState<"end" | "start">("end");
  const [yearOptionType, setYearOptionType] = useState<"end" | "start">("end");
  const [showComparisonDetails, setShowComparisonDetails] = useState<boolean>(false);
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState<"summary" | "fx_report" | "contractors" | "dynamics" | "formula" | "rates" | "target">("summary");
  const [contractorSearchQuery, setContractorSearchQuery] = useState<string>("");
  const [contractorSortBy, setContractorSortBy] = useState<"net" | "income" | "expense" | "ops" | "name">("net");
  const [contractorSortOrder, setContractorSortOrder] = useState<"desc" | "asc">("desc");
  const [showUnassignedContractors, setShowUnassignedContractors] = useState<boolean>(true);
  const [opSearchQuery, setOpSearchQuery] = useState<string>("");
  const [dynamicsSubTab, setDynamicsSubTab] = useState<"monthly" | "yearly">("monthly");
  const [fullScreenChart, setFullScreenChart] = useState<"capital30" | "fxChart" | "monthlyBar" | null>(null);
  const [capitalChartDays, setCapitalChartDays] = useState<number>(30);
  const [fxChartCurrency, setFxChartCurrency] = useState<"USD" | "EUR">("USD");
  const [fxChartDays, setFxChartDays] = useState<30 | 60 | 90>(90);
  const [simUsdRate, setSimUsdRate] = useState<string>("");
  const [simUsdSellRate, setSimUsdSellRate] = useState<string>("");
  const [simEurRate, setSimEurRate] = useState<string>("");
  const [simEurSellRate, setSimEurSellRate] = useState<string>("");
  const [isCopiedSummary, setIsCopiedSummary] = useState<boolean>(false);
  const [ratesRev, setRatesRev] = useState<number>(0);
  const [isEditingTargetRates, setIsEditingTargetRates] = useState<boolean>(false);
  const [editRateUsd, setEditRateUsd] = useState<string>("");
  const [editRateEur, setEditRateEur] = useState<string>("");
  const [isFetchingTargetRates, setIsFetchingTargetRates] = useState<boolean>(false);
  const [targetRatesFeedbackMsg, setTargetRatesFeedbackMsg] = useState<string>("");
  const [isFxDetailsExpanded, setIsFxDetailsExpanded] = useState<boolean>(false);
  const [isCombinedCapitalHintOpen, setIsCombinedCapitalHintOpen] = useState<boolean>(false);
  const [comparePeriod, setComparePeriod] = useState<string>("7days");
  const [compareCurrencyFilter, setCompareCurrencyFilter] = useState<"ALL" | "UAH" | "USD" | "EUR">("ALL");
  const [expandedCompareDays, setExpandedCompareDays] = useState<Record<string, boolean>>({});
  const [customCompareStart, setCustomCompareStart] = useState<string>("");
  const [customCompareEnd, setCustomCompareEnd] = useState<string>("");

  // --- FINANCIAL TARGET GOAL STATE ---
  const [financialTargetAmount, setFinancialTargetAmount] = useState<string>(() => {
    return localStorage.getItem("accounting_target_goal_val") || "100000";
  });
  const [financialTargetCurrency, setFinancialTargetCurrency] = useState<"UAH" | "USD" | "EUR">(() => {
    return (localStorage.getItem("accounting_target_goal_cur") as "UAH" | "USD" | "EUR") || "USD";
  });

  // --- SNAPSHOTS STATE & HANDLERS ---
  const [savedSnapshots, setSavedSnapshots] = useState<Array<{
    id: string;
    name: string;
    dateTimeStr: string;
    isoDateTime: string;
    timestamp: number;
    totals: { UAH: number; USD: number; EUR: number };
  }>>(() => {
    try {
      const raw = localStorage.getItem("accounting_custom_snapshots");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  });

  const [isSnapshotModalOpen, setIsSnapshotModalOpen] = useState(() => {
    return typeof window !== "undefined" && window.history.state?.modal === "snapshot";
  });
  const [isAvailableResourcesOpen, setIsAvailableResourcesOpen] = useState(() => {
    return typeof window !== "undefined" && window.history.state?.modal === "availableResources";
  });
  const [isCompareCurrencyModalOpen, setIsCompareCurrencyModalOpen] = useState(() => {
    return typeof window !== "undefined" && window.history.state?.modal === "compareCurrency";
  });

  // ESC key handler to close full screen chart modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullScreenChart) {
        setFullScreenChart(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullScreenChart]);

  const openAvailableResourcesModal = React.useCallback(() => {
    setIsAvailableResourcesOpen(true);
    if (window.history.state?.modal !== "availableResources") {
      const nextIndex = (window.history.state?.index || 0) + 1;
      window.history.pushState(
        { screen: window.history.state?.screen || "main", modal: "availableResources", index: nextIndex },
        "",
        ""
      );
    }
  }, []);

  const closeAvailableResourcesModal = React.useCallback(() => {
    if (window.history.state?.modal === "availableResources") {
      window.history.back();
    } else {
      setIsAvailableResourcesOpen(false);
    }
  }, []);

  const openCompareCurrencyModal = React.useCallback(() => {
    setIsCompareCurrencyModalOpen(true);
    if (window.history.state?.modal !== "compareCurrency") {
      const nextIndex = (window.history.state?.index || 0) + 1;
      window.history.pushState(
        { screen: window.history.state?.screen || "main", modal: "compareCurrency", index: nextIndex },
        "",
        ""
      );
    }
  }, []);

  const closeCompareCurrencyModal = React.useCallback(() => {
    if (window.history.state?.modal === "compareCurrency") {
      window.history.back();
    } else {
      setIsCompareCurrencyModalOpen(false);
    }
  }, []);

  const openSnapshotModal = React.useCallback(() => {
    setIsSnapshotModalOpen(true);
    if (window.history.state?.modal !== "snapshot") {
      const nextIndex = (window.history.state?.index || 0) + 1;
      window.history.pushState(
        { screen: window.history.state?.screen || "main", modal: "snapshot", index: nextIndex },
        "",
        ""
      );
    }
  }, []);

  const closeSnapshotModal = React.useCallback(() => {
    if (window.history.state?.modal === "snapshot") {
      window.history.back();
    } else {
      setIsSnapshotModalOpen(false);
    }
  }, []);

  React.useEffect(() => {
    const handlePopState = () => {
      const state = window.history.state;
      if (state?.modal === "availableResources") {
        setIsAvailableResourcesOpen(true);
        setIsSnapshotModalOpen(false);
        setIsCompareCurrencyModalOpen(false);
      } else if (state?.modal === "snapshot") {
        setIsSnapshotModalOpen(true);
        setIsAvailableResourcesOpen(false);
        setIsCompareCurrencyModalOpen(false);
      } else if (state?.modal === "compareCurrency") {
        setIsCompareCurrencyModalOpen(true);
        setIsAvailableResourcesOpen(false);
        setIsSnapshotModalOpen(false);
      } else {
        setIsAvailableResourcesOpen(false);
        setIsSnapshotModalOpen(false);
        setIsCompareCurrencyModalOpen(false);
      }
    };

    handlePopState();
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);
  const [snapshotDateTime, setSnapshotDateTime] = useState<string>(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [snapshotName, setSnapshotName] = useState<string>("");

  const parseGroupTimestamp = (g: HistoryGroup): number => {
    if (g.timestamp && !isNaN(g.timestamp) && g.timestamp > 1000000000000) {
      return g.timestamp;
    }
    if (g.timestamp && !isNaN(g.timestamp) && g.timestamp > 1000000000) {
      return g.timestamp * 1000;
    }
    if (g.dateStr) {
      const dMatch = g.dateStr.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
      if (dMatch) {
        const day = parseInt(dMatch[1], 10);
        const mo = parseInt(dMatch[2], 10) - 1;
        let yr = dMatch[3] ? parseInt(dMatch[3], 10) : new Date().getFullYear();
        if (yr < 100) yr += 2000;
        let h = 12, mi = 0, sec = 0;
        const tMatch = g.dateStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        if (tMatch) {
          h = parseInt(tMatch[1], 10);
          mi = parseInt(tMatch[2], 10);
          if (tMatch[3]) sec = parseInt(tMatch[3], 10);
        }
        return new Date(yr, mo, day, h, mi, sec).getTime();
      }
    }
    return 0;
  };

  const getEffectiveItemDetails = (item: any, g: HistoryGroup, fallbackCurr: "UAH" | "USD" | "EUR") => {
    const textStr = (item.text || item.fullText || "").trim();
    const bankStr = (item.bank || "").trim();
    const itemOp = (item.operation || g.operation || "").trim();

    // 1. Resolve Currency
    let curr: "UAH" | "USD" | "EUR" = "UAH";
    if (item.curr && ["UAH", "USD", "EUR"].includes(item.curr)) {
      curr = item.curr;
    } else {
      const bankUpper = bankStr.toUpperCase();
      if (bankUpper.includes("USD") || bankUpper.includes("$")) curr = "USD";
      else if (bankUpper.includes("EUR") || bankUpper.includes("€")) curr = "EUR";
      else if (bankUpper.includes("UAH") || bankUpper.includes("₴") || bankUpper.includes("ГРН")) curr = "UAH";
      else if (initData?.allAliases) {
        let found = false;
        for (const c of ["UAH", "USD", "EUR"] as const) {
          const aliasMap = initData.allAliases[c];
          if (aliasMap) {
            for (const [key, name] of Object.entries(aliasMap)) {
              if (name === bankStr) {
                curr = c;
                found = true;
                break;
              }
            }
          }
          if (found) break;
        }
        if (!found) {
          if (g.curr && ["UAH", "USD", "EUR"].includes(g.curr)) curr = g.curr;
          else curr = fallbackCurr;
        }
      } else if (g.curr && ["UAH", "USD", "EUR"].includes(g.curr)) {
        curr = g.curr;
      } else {
        curr = fallbackCurr;
      }
    }

    const fullOpText = (itemOp + " " + (g.operation || "") + " " + textStr + " " + (item.category || "")).toLowerCase();
    
    // Check if operation contains interest/deposit earnings keywords
    const hasInterestKeywords = 
      fullOpText.includes("відсот") ||
      fullOpText.includes("процент") ||
      fullOpText.includes("нарахов") ||
      fullOpText.includes("інтерес") ||
      !!item.isInterestFulfillment ||
      !!g.isInterestFulfillment ||
      (item.interestMode && item.interestMode !== "none");

    // 2. Check if Exchange
    const isExchange = itemOp.includes("Обмін") || itemOp.includes("Крос") || textStr.includes("Обмін") || textStr.includes("Крос");

    // 3. Resolve isIncome
    let isIncome = false;
    if (isExchange) {
      const vidLine = textStr.match(/Віддано:\s*(.*?)(?=\n|📥|│|\||$)/i)?.[1] || "";
      const otrLine = textStr.match(/Отримано:\s*(.*?)(?=\n|💳|│|\||$)/i)?.[1] || "";
      const bankClean = bankStr.replace(/[📥📤]/g, "").trim().toLowerCase();

      if (bankClean && vidLine.toLowerCase().includes(bankClean)) {
        isIncome = false;
      } else if (bankClean && otrLine.toLowerCase().includes(bankClean)) {
        isIncome = true;
      } else if (vidLine.toUpperCase().includes(curr)) {
        isIncome = false;
      } else if (otrLine.toUpperCase().includes(curr)) {
        isIncome = true;
      } else if (bankStr.includes("📤") || textStr.includes("Віддано")) {
        isIncome = false;
      } else if (bankStr.includes("📥") || textStr.includes("Отримано")) {
        isIncome = true;
      } else if (typeof item.isIncome === "boolean") {
        isIncome = item.isIncome;
      } else if (typeof g.isIncome === "boolean") {
        isIncome = g.isIncome;
      } else if (typeof item.sum === "number" && item.sum !== 0) {
        isIncome = item.sum > 0;
      } else {
        isIncome = false;
      }
    } else {
      if (typeof item.isIncome === "boolean") {
        isIncome = item.isIncome;
      } else {
        const itemSpecificOp = (item.operation || "").trim();
        if (
          hasInterestKeywords && 
          !fullOpText.includes("віддати %") && 
          !fullOpText.includes("сплата відсотків") && 
          !fullOpText.includes("покупка") && 
          !fullOpText.includes("витрата") &&
          item.interestMode !== "take"
        ) {
          isIncome = true;
        } else if (itemSpecificOp.includes("Прибуток") || itemSpecificOp.includes("Повернули борг") || itemSpecificOp.includes("Прихід") || itemSpecificOp.includes("Коригування (+)") || itemSpecificOp.includes("Введені початкові залишки (+)") || (itemSpecificOp.includes("Введені початкові залишки") && !itemSpecificOp.includes("(-)")) || itemSpecificOp.includes("Початковий борг (+)")) {
          isIncome = true;
        } else if (itemSpecificOp.includes("Покупка") || itemSpecificOp.includes("Витрата") || itemSpecificOp.includes("Повертаю борг") || itemSpecificOp.includes("Коригування (-)") || itemSpecificOp.includes("Введені початкові залишки (-)") || itemSpecificOp.includes("Початковий борг (-)") || itemSpecificOp.includes("знижкою в борг")) {
          isIncome = false;
        } else if (bankStr.includes("📥") || textStr.includes("Прибуток") || textStr.includes("Повернули борг") || textStr.includes("Отримано")) {
          isIncome = true;
        } else if (bankStr.includes("📤") || textStr.includes("Покупка") || textStr.includes("Витрата") || textStr.includes("Повертаю борг")) {
          isIncome = false;
        } else if (typeof item.sum === "number" && item.sum !== 0) {
          isIncome = item.sum > 0;
        } else if (g.operation && (g.operation.includes("Прибуток") || g.operation.includes("Повернули борг") || g.operation.includes("Прихід") || g.operation.includes("Коригування (+)") || g.operation.includes("Введені початкові залишки (+)") || (g.operation.includes("Введені початкові залишки") && !g.operation.includes("(-)")) || g.operation.includes("Початковий борг (+)"))) {
          isIncome = true;
        } else if (g.operation && (g.operation.includes("Покупка") || g.operation.includes("Витрата") || g.operation.includes("Повертаю борг") || g.operation.includes("Коригування (-)") || g.operation.includes("Введені початкові залишки (-)") || g.operation.includes("Початковий борг (-)") || g.operation.includes("знижкою в борг"))) {
          isIncome = false;
        } else if (typeof g.isIncome === "boolean") {
          isIncome = g.isIncome;
        } else {
          isIncome = false;
        }
      }
    }

    // 4. Resolve Raw Sum
    let rawSum = Math.abs(Number(item.sum) || 0);
    const hasExplicitZeroSum = typeof item.sum === "number" && Math.abs(item.sum) < 0.0001;
    const isCrossOrMulti = textStr.includes("➔") || textStr.includes("Обмін") || textStr.includes("Крос");

    if (rawSum < 0.001) {
      if (isExchange) {
        const mCurr = textStr.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${curr}`, "i"));
        if (mCurr) {
          rawSum = parseFloat(mCurr[1]);
        } else if (!hasExplicitZeroSum) {
          const mTotal = textStr.match(/💰 Сума:\s*([\d.]+)/);
          if (mTotal) rawSum = parseFloat(mTotal[1]);
          else if (g.totalSum) rawSum = g.totalSum;
        }
      } else {
        if (!hasExplicitZeroSum && !isCrossOrMulti) {
          const mTotal = textStr.match(/💰 Сума:\s*([\d.]+)/);
          if (mTotal) rawSum = parseFloat(mTotal[1]);
          else if (g.totalSum) rawSum = g.totalSum;
        }
      }
    }

    const isCapitalTransfer = !hasInterestKeywords && !isExchange && (
      fullOpText.includes("повернули борг") ||
      fullOpText.includes("повернення боргу") ||
      fullOpText.includes("повертаю борг") ||
      fullOpText.includes("позика") ||
      fullOpText.includes("позичаю") ||
      fullOpText.includes("взяв борг") ||
      fullOpText.includes("взяли борг") ||
      fullOpText.includes("переказ") ||
      fullOpText.includes("початковий борг") ||
      fullOpText.includes("введені початкові залишки")
    );

    return { curr, isIncome, rawSum, isCapitalTransfer };
  };

  const calculateCapitalAtMs = (targetMs: number) => {
    if (!initData) return { UAH: 0, USD: 0, EUR: 0 };
    let curUah = initData.globalTotals?.UAH ?? (currentCurrency === "UAH" ? (initData.capital?.total || 0) : 0);
    let curUsd = initData.globalTotals?.USD ?? (currentCurrency === "USD" ? (initData.capital?.total || 0) : 0);
    let curEur = initData.globalTotals?.EUR ?? (currentCurrency === "EUR" ? (initData.capital?.total || 0) : 0);

    if (!curUah) {
      try {
        const c = localStorage.getItem("cached_init_data_UAH");
        if (c) curUah = JSON.parse(c)?.capital?.total || 0;
      } catch (e) {}
    }
    if (!curUsd) {
      try {
        const c = localStorage.getItem("cached_init_data_USD");
        if (c) curUsd = JSON.parse(c)?.capital?.total || 0;
      } catch (e) {}
    }
    if (!curEur) {
      try {
        const c = localStorage.getItem("cached_init_data_EUR");
        if (c) curEur = JSON.parse(c)?.capital?.total || 0;
      } catch (e) {}
    }

    let rollbackUah = 0;
    let rollbackUsd = 0;
    let rollbackEur = 0;

    (historyGroups || []).forEach(g => {
      const txMs = parseGroupTimestamp(g);

      if (txMs > targetMs) {
        g.items.forEach(item => {
          const { curr, isIncome, rawSum, isCapitalTransfer } = getEffectiveItemDetails(item, g, (g.curr as "UAH" | "USD" | "EUR") || "UAH");
          if (rawSum === 0 || isCapitalTransfer) return;
          const delta = isIncome ? rawSum : -rawSum;

          if (curr === "UAH") rollbackUah += delta;
          else if (curr === "USD") rollbackUsd += delta;
          else if (curr === "EUR") rollbackEur += delta;
        });
      }
    });

    return {
      UAH: curUah - rollbackUah,
      USD: curUsd - rollbackUsd,
      EUR: curEur - rollbackEur,
    };
  };

  const handleSaveSnapshot = (calculatedTotals: { UAH: number; USD: number; EUR: number }, targetMs: number) => {
    const dObj = new Date(targetMs);
    const pad = (n: number) => String(n).padStart(2, "0");
    const formattedStr = `${pad(dObj.getDate())}.${pad(dObj.getMonth() + 1)}.${dObj.getFullYear()} ${pad(dObj.getHours())}:${pad(dObj.getMinutes())}`;

    const newSnap = {
      id: `snap_${Date.now()}`,
      name: snapshotName.trim() || `Знімок ${formattedStr}`,
      dateTimeStr: formattedStr,
      isoDateTime: snapshotDateTime,
      timestamp: targetMs,
      totals: calculatedTotals,
    };

    const updated = [newSnap, ...savedSnapshots];
    setSavedSnapshots(updated);
    try {
      localStorage.setItem("accounting_custom_snapshots", JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to save custom snapshots:", e);
    }

    setComparePreset(`snapshot:${newSnap.id}`);
    closeSnapshotModal();
    setSnapshotName("");
  };

  const handleDeleteSnapshot = (id: string) => {
    const updated = savedSnapshots.filter(s => s.id !== id);
    setSavedSnapshots(updated);
    try {
      localStorage.setItem("accounting_custom_snapshots", JSON.stringify(updated));
    } catch (e) {
      console.warn("Failed to remove snapshot:", e);
    }
    if (comparePreset === `snapshot:${id}`) {
      setComparePreset("yesterday");
    }
  };

  const convertAmount = (amount: number, from: string, to: string, customRates?: { usd?: number; usdSell?: number; eur?: number; eurSell?: number }) => {
    if (from === to) return amount;
    const rUsd = customRates?.usd ?? (globalRateUsd || 0);
    const rUsdSell = customRates?.usdSell ?? (customRates?.usd !== undefined ? customRates.usd : (globalRateUsdSell || rUsd));
    const rEur = customRates?.eur ?? (globalRateEur || 0);
    const rEurSell = customRates?.eurSell ?? (customRates?.eur !== undefined ? customRates.eur : (globalRateEurSell || rEur));

    if (amount >= 0) {
      let uahVal = 0;
      if (from === "UAH") uahVal = amount;
      else if (from === "USD") uahVal = amount * rUsd;
      else if (from === "EUR") uahVal = amount * rEur;

      if (to === "UAH") return uahVal;
      if (to === "USD") return rUsdSell > 0 ? uahVal / rUsdSell : 0;
      if (to === "EUR") return rEurSell > 0 ? uahVal / rEurSell : 0;
    } else {
      const absA = Math.abs(amount);
      let uahNeeded = 0;
      if (from === "UAH") uahNeeded = absA;
      else if (from === "USD") uahNeeded = absA * rUsdSell;
      else if (from === "EUR") uahNeeded = absA * rEurSell;

      let toNeeded = 0;
      if (to === "UAH") toNeeded = uahNeeded;
      else if (to === "USD") toNeeded = rUsd > 0 ? uahNeeded / rUsd : 0;
      else if (to === "EUR") toNeeded = rEur > 0 ? uahNeeded / rEur : 0;
      return -toNeeded;
    }
    return 0;
  };

  const getCurrencySymbol = (c: string) => {
    if (c === "UAH") return "₴";
    if (c === "USD") return "$";
    if (c === "EUR") return "€";
    return c;
  };

  // --- CAPITAL COMPARISON LOGIC (Flexible Dates) ---
  const comparisonData = useMemo(() => {
    if (!initData) return null;

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    // Determine target date object & label
    let targetObj = new Date(now);
    let presetLabel = "Вчора";

    if (comparePreset === "yesterday") {
      targetObj.setDate(targetObj.getDate() - 1);
      presetLabel = "Вчора (1 день тому)";
    } else if (/^\d+days?$/.test(comparePreset)) {
      const days = parseInt(comparePreset, 10);
      targetObj.setDate(targetObj.getDate() - days);
      if (days === 1) presetLabel = "1 день тому (Вчора)";
      else presetLabel = `${days} ${getDaysUkrWord(days)} тому`;
    } else if (comparePreset === "month_start") {
      targetObj = new Date(now.getFullYear(), now.getMonth(), 1);
      presetLabel = "1-ше число місяця";
    } else if (comparePreset === "prev_month") {
      targetObj = new Date(now.getFullYear(), now.getMonth(), 0);
      presetLabel = "Кінець минулого місяця";
    } else if (comparePreset === "year_start") {
      targetObj = new Date(now.getFullYear(), 0, 1);
      presetLabel = "Початок року (01.01)";
    } else if (comparePreset === "1year") {
      targetObj = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      presetLabel = "1 рік тому";
    } else if (comparePreset === "custom_month" && customCompareMonth) {
      const parts = customCompareMonth.split("-").map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const [y, m] = parts;
        if (monthOptionType === "start") {
          targetObj = new Date(y, m - 1, 1);
          presetLabel = `Початок ${pad(m)}.${y}`;
        } else {
          targetObj = new Date(y, m, 0); // last day of that month
          presetLabel = `Кінець ${pad(m)}.${y}`;
        }
      }
    } else if (comparePreset === "custom_year" && customCompareYear) {
      const y = parseInt(customCompareYear);
      if (!isNaN(y)) {
        if (yearOptionType === "start") {
          targetObj = new Date(y, 0, 1);
          presetLabel = `Початок ${y} року`;
        } else {
          targetObj = new Date(y, 11, 31);
          presetLabel = `Кінець ${y} року`;
        }
      }
    } else if (comparePreset === "custom" && customCompareDate) {
      const parts = customCompareDate.split("-");
      if (parts.length === 3) {
        targetObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        presetLabel = "Обрана дата";
      }
    }

    const targetISO = `${targetObj.getFullYear()}-${pad(targetObj.getMonth() + 1)}-${pad(targetObj.getDate())}`;
    let targetFormatted = `${pad(targetObj.getDate())}.${pad(targetObj.getMonth() + 1)}.${targetObj.getFullYear()}`;

    // Current totals
    let curUah = initData.globalTotals?.UAH ?? (currentCurrency === "UAH" ? (initData.capital?.total || 0) : 0);
    let curUsd = initData.globalTotals?.USD ?? (currentCurrency === "USD" ? (initData.capital?.total || 0) : 0);
    let curEur = initData.globalTotals?.EUR ?? (currentCurrency === "EUR" ? (initData.capital?.total || 0) : 0);

    if (!curUah) {
      try {
        const c = localStorage.getItem("cached_init_data_UAH");
        if (c) curUah = JSON.parse(c)?.capital?.total || 0;
      } catch (e) {}
    }
    if (!curUsd) {
      try {
        const c = localStorage.getItem("cached_init_data_USD");
        if (c) curUsd = JSON.parse(c)?.capital?.total || 0;
      } catch (e) {}
    }
    if (!curEur) {
      try {
        const c = localStorage.getItem("cached_init_data_EUR");
        if (c) curEur = JSON.parse(c)?.capital?.total || 0;
      } catch (e) {}
    }

    const rUsd = globalRateUsd || 0;
    const rUsdSell = globalRateUsdSell || rUsd;
    const rEur = globalRateEur || 0;
    const rEurSell = globalRateEurSell || rEur;
    const liveRates = { usd: rUsd, usdSell: rUsdSell, eur: rEur, eurSell: rEurSell };

    // Record today's rates in daily ledger
    saveDailyRatesForDate(todayISO, liveRates);

    // Get historical rates for targetISO
    let targetRates = getRatesForDate(targetISO, liveRates);

    const convert = (amount: number, from: string, to: string) => convertAmount(amount, from, to);
    const convertWithRates = (amount: number, from: string, to: string, rates: { usd: number; usdSell: number; eur: number; eurSell: number }) => convertAmount(amount, from, to, rates);

    const currentGlobalCombined = convert(curUah, "UAH", summaryBase) +
                                  convert(curUsd, "USD", summaryBase) +
                                  convert(curEur, "EUR", summaryBase);

    // Snapshot store
    let storedSnapshots: Record<string, {
      currencyTotals: { UAH: number; USD: number; EUR: number };
      globalCombined: { UAH: number; USD: number; EUR: number };
      rates?: { usd: number; usdSell: number; eur: number; eurSell: number };
    }> = {};

    try {
      const raw = localStorage.getItem("accounting_daily_capital_snapshots");
      if (raw) storedSnapshots = JSON.parse(raw);
    } catch (e) {
      console.warn("Failed to parse daily capital snapshots", e);
    }

    // Always keep today's snapshot updated with rates
    const todaySnapshot = {
      currencyTotals: { UAH: curUah, USD: curUsd, EUR: curEur },
      globalCombined: {
        UAH: convert(curUah, "UAH", "UAH") + convert(curUsd, "USD", "UAH") + convert(curEur, "EUR", "UAH"),
        USD: convert(curUah, "UAH", "USD") + convert(curUsd, "USD", "USD") + convert(curEur, "EUR", "USD"),
        EUR: convert(curUah, "UAH", "EUR") + convert(curUsd, "USD", "EUR") + convert(curEur, "EUR", "EUR"),
      },
      rates: liveRates
    };

    if (JSON.stringify(storedSnapshots[todayISO]) !== JSON.stringify(todaySnapshot)) {
      storedSnapshots[todayISO] = todaySnapshot;
      try {
        localStorage.setItem("accounting_daily_capital_snapshots", JSON.stringify(storedSnapshots));
      } catch (e) {
        console.warn("Failed to save daily capital snapshot", e);
      }
    }

    // Rollback net transactions occurring strictly AFTER target date start / end
    const targetStartMs = new Date(targetObj.getFullYear(), targetObj.getMonth(), targetObj.getDate(), 0, 0, 0, 0).getTime();
    const targetEndMs = new Date(targetObj.getFullYear(), targetObj.getMonth(), targetObj.getDate(), 23, 59, 59, 999).getTime();

    let afterNetUAH = 0, afterIncUAH = 0, afterExpUAH = 0;
    let afterNetUSD = 0, afterIncUSD = 0, afterExpUSD = 0;
    let afterNetEUR = 0, afterIncEUR = 0, afterExpEUR = 0;

    let onTargetNetUAH = 0, onTargetIncUAH = 0, onTargetExpUAH = 0;
    let onTargetNetUSD = 0, onTargetIncUSD = 0, onTargetExpUSD = 0;
    let onTargetNetEUR = 0, onTargetIncEUR = 0, onTargetExpEUR = 0;

    const onTargetItems: Array<{
      dateStr: string;
      operation: string;
      sum: number;
      bank: string;
      text: string;
      curr: "UAH" | "USD" | "EUR";
      isIncome: boolean;
    }> = [];

    (historyGroups || []).forEach(g => {
      const txMs = parseGroupTimestamp(g);

      if (txMs > targetEndMs) {
        g.items.forEach(item => {
          const { curr, isIncome, rawSum, isCapitalTransfer } = getEffectiveItemDetails(item, g, (g.curr as "UAH" | "USD" | "EUR") || "UAH");
          if (rawSum === 0 || isCapitalTransfer) return;
          const delta = isIncome ? rawSum : -rawSum;

          if (curr === "UAH") {
            afterNetUAH += delta;
            if (isIncome) afterIncUAH += rawSum; else afterExpUAH += rawSum;
          } else if (curr === "USD") {
            afterNetUSD += delta;
            if (isIncome) afterIncUSD += rawSum; else afterExpUSD += rawSum;
          } else if (curr === "EUR") {
            afterNetEUR += delta;
            if (isIncome) afterIncEUR += rawSum; else afterExpEUR += rawSum;
          }
        });
      } else if (txMs >= targetStartMs && txMs <= targetEndMs) {
        g.items.forEach(item => {
          const { curr, isIncome, rawSum, isCapitalTransfer } = getEffectiveItemDetails(item, g, (g.curr as "UAH" | "USD" | "EUR") || "UAH");
          if (rawSum === 0 || isCapitalTransfer) return;
          const delta = isIncome ? rawSum : -rawSum;

          if (curr === "UAH") {
            onTargetNetUAH += delta;
            if (isIncome) onTargetIncUAH += rawSum; else onTargetExpUAH += rawSum;
          } else if (curr === "USD") {
            onTargetNetUSD += delta;
            if (isIncome) onTargetIncUSD += rawSum; else onTargetExpUSD += rawSum;
          } else if (curr === "EUR") {
            onTargetNetEUR += delta;
            if (isIncome) onTargetIncEUR += rawSum; else onTargetExpEUR += rawSum;
          }

          onTargetItems.push({
            dateStr: g.dateStr || "",
            operation: g.operation || (isIncome ? "Прибуток" : "Витрата"),
            sum: delta,
            bank: item.bank || "",
            text: item.text || item.fullText || "",
            curr,
            isIncome,
          });
        });
      }
    });

    // Capital at start of target date (00:00) = Live balance - operations after start of target date
    const startTargetUah = curUah - (afterNetUAH + onTargetNetUAH);
    const startTargetUsd = curUsd - (afterNetUSD + onTargetNetUSD);
    const startTargetEur = curEur - (afterNetEUR + onTargetNetEUR);

    // Capital at end of target date (23:59) = Live balance - operations strictly after target date
    const endTargetUah = curUah - afterNetUAH;
    const endTargetUsd = curUsd - afterNetUSD;
    const endTargetEur = curEur - afterNetEUR;

    // We determine target capital based on preset type
    let targetUah = endTargetUah;
    let targetUsd = endTargetUsd;
    let targetEur = endTargetEur;

    // For month_start or year_start, the user wants the capital at the START of that period (before transactions of that period)
    if (comparePreset === "month_start" || comparePreset === "year_start") {
      targetUah = startTargetUah;
      targetUsd = startTargetUsd;
      targetEur = startTargetEur;
    }

    // If stored snapshot exists for targetISO, use its exact verified totals
    if (storedSnapshots[targetISO]?.currencyTotals) {
      const snapTotals = storedSnapshots[targetISO].currencyTotals;
      targetUah = snapTotals.UAH;
      targetUsd = snapTotals.USD;
      targetEur = snapTotals.EUR;
      if (storedSnapshots[targetISO].rates) {
        targetRates = {
          usd: storedSnapshots[targetISO].rates.usd,
          usdSell: storedSnapshots[targetISO].rates.usdSell || storedSnapshots[targetISO].rates.usd,
          eur: storedSnapshots[targetISO].rates.eur,
          eurSell: storedSnapshots[targetISO].rates.eurSell || storedSnapshots[targetISO].rates.eur,
          isFallback: false,
          rateDate: targetISO,
          isCarriedForward: false,
          source: "snapshot"
        };
      }
    }

    if (!historyGroups || historyGroups.length === 0) {
      if (!storedSnapshots[targetISO]?.currencyTotals) {
        targetUah = curUah;
        targetUsd = curUsd;
        targetEur = curEur;
      }
    }

    if (comparePreset.startsWith("snapshot:")) {
      const snapId = comparePreset.replace("snapshot:", "");
      const snap = savedSnapshots.find(s => s.id === snapId);
      if (snap) {
        presetLabel = snap.name;
        targetFormatted = snap.dateTimeStr;
        targetUah = snap.totals.UAH;
        targetUsd = snap.totals.USD;
        targetEur = snap.totals.EUR;
      }
    }

    const targetGlobalCombinedTargetRates = convertWithRates(targetUah, "UAH", summaryBase, targetRates) +
                                                  convertWithRates(targetUsd, "USD", summaryBase, targetRates) +
                                                  convertWithRates(targetEur, "EUR", summaryBase, targetRates);

    const targetGlobalCombinedCurrentRates = convert(targetUah, "UAH", summaryBase) +
                                                  convert(targetUsd, "USD", summaryBase) +
                                                  convert(targetEur, "EUR", summaryBase);

    const targetCurrentCurrency = currentCurrency === "USD" ? targetUsd : currentCurrency === "EUR" ? targetEur : targetUah;
    const curCurrentCurrency = currentCurrency === "USD" ? curUsd : currentCurrency === "EUR" ? curEur : curUah;

    const currencyDiff = curCurrentCurrency - targetCurrentCurrency;
    const currencyPercent = (targetCurrentCurrency > 0 && curCurrentCurrency > 0)
      ? (currencyDiff / targetCurrentCurrency) * 100
      : 0;

    const globalDiffTotal = currentGlobalCombined - targetGlobalCombinedTargetRates;
    const globalDiffOps = currentGlobalCombined - targetGlobalCombinedCurrentRates;
    const globalDiffFX = targetGlobalCombinedCurrentRates - targetGlobalCombinedTargetRates;
    const globalPercentTotal = (targetGlobalCombinedTargetRates > 0 && currentGlobalCombined > 0)
      ? (globalDiffTotal / targetGlobalCombinedTargetRates) * 100
      : 0;

    const curAfterNet = currentCurrency === "USD" ? afterNetUSD : currentCurrency === "EUR" ? afterNetEUR : afterNetUAH;
    const curAfterInc = currentCurrency === "USD" ? afterIncUSD : currentCurrency === "EUR" ? afterIncEUR : afterIncUAH;
    const curAfterExp = currentCurrency === "USD" ? afterExpUSD : currentCurrency === "EUR" ? afterExpEUR : afterExpUAH;

    const curOnNet = currentCurrency === "USD" ? onTargetNetUSD : currentCurrency === "EUR" ? onTargetNetEUR : onTargetNetUAH;
    const curOnInc = currentCurrency === "USD" ? onTargetIncUSD : currentCurrency === "EUR" ? onTargetIncEUR : onTargetIncUAH;
    const curOnExp = currentCurrency === "USD" ? onTargetExpUSD : currentCurrency === "EUR" ? onTargetExpEUR : onTargetExpUAH;

    const curStartTarget = currentCurrency === "USD" ? startTargetUsd : currentCurrency === "EUR" ? startTargetEur : startTargetUah;
    const curEndTarget = currentCurrency === "USD" ? endTargetUsd : currentCurrency === "EUR" ? endTargetEur : endTargetUah;

    const startTargetBase = convert(startTargetUah, "UAH", summaryBase) +
                            convert(startTargetUsd, "USD", summaryBase) +
                            convert(startTargetEur, "EUR", summaryBase);

    const endTargetBase = convert(endTargetUah, "UAH", summaryBase) +
                          convert(endTargetUsd, "USD", summaryBase) +
                          convert(endTargetEur, "EUR", summaryBase);

    const onTargetIncBase = convert(onTargetIncUAH, "UAH", summaryBase) +
                            convert(onTargetIncUSD, "USD", summaryBase) +
                            convert(onTargetIncEUR, "EUR", summaryBase);

    const onTargetExpBase = convert(onTargetExpUAH, "UAH", summaryBase) +
                            convert(onTargetExpUSD, "USD", summaryBase) +
                            convert(onTargetExpEUR, "EUR", summaryBase);

    const onTargetNetBase = convert(onTargetNetUAH, "UAH", summaryBase) +
                            convert(onTargetNetUSD, "USD", summaryBase) +
                            convert(onTargetNetEUR, "EUR", summaryBase);

    const fxUah = convert(targetUah, "UAH", summaryBase) - convertWithRates(targetUah, "UAH", summaryBase, targetRates);
    const fxUsd = convert(targetUsd, "USD", summaryBase) - convertWithRates(targetUsd, "USD", summaryBase, targetRates);
    const fxEur = convert(targetEur, "EUR", summaryBase) - convertWithRates(targetEur, "EUR", summaryBase, targetRates);

    const usdRateStart = targetRates.usd || 0;
    const usdRateNow = liveRates.usd || globalRateUsd || 0;
    const usdRateDelta = usdRateNow - usdRateStart;
    const usdRatePct = usdRateStart > 0 ? (usdRateDelta / usdRateStart) * 100 : 0;

    const eurRateStart = targetRates.eur || 0;
    const eurRateNow = liveRates.eur || globalRateEur || 0;
    const eurRateDelta = eurRateNow - eurRateStart;
    const eurRatePct = eurRateStart > 0 ? (eurRateDelta / eurRateStart) * 100 : 0;

    const fxBreakdown = {
      UAH: {
        amountOnTarget: targetUah,
        fxImpactBase: fxUah,
        rateStart: 1,
        rateNow: 1,
        rateDelta: 0,
        ratePct: 0,
      },
      USD: {
        amountOnTarget: targetUsd,
        fxImpactBase: fxUsd,
        rateStart: usdRateStart,
        rateNow: usdRateNow,
        rateDelta: usdRateDelta,
        ratePct: usdRatePct,
      },
      EUR: {
        amountOnTarget: targetEur,
        fxImpactBase: fxEur,
        rateStart: eurRateStart,
        rateNow: eurRateNow,
        rateDelta: eurRateDelta,
        ratePct: eurRatePct,
      },
    };

    return {
      targetISO,
      targetFormatted,
      presetLabel,
      targetRates,
      currentRates: liveRates,
      fxBreakdown,
      currency: {
        target: targetCurrentCurrency,
        today: curCurrentCurrency,
        startTarget: curStartTarget,
        endTarget: curEndTarget,
        diff: currencyDiff,
        percent: currencyPercent,
      },
      global: {
        target: targetGlobalCombinedTargetRates,
        targetAtCurrentRates: targetGlobalCombinedCurrentRates,
        today: currentGlobalCombined,
        diff: globalDiffTotal,
        diffOps: globalDiffOps,
        diffFX: globalDiffFX,
        percent: globalPercentTotal,
      },
      breakdown: {
        UAH: { today: curUah, startTarget: startTargetUah, target: endTargetUah, endTarget: endTargetUah, diff: curUah - endTargetUah },
        USD: { today: curUsd, startTarget: startTargetUsd, target: endTargetUsd, endTarget: endTargetUsd, diff: curUsd - endTargetUsd },
        EUR: { today: curEur, startTarget: startTargetEur, target: endTargetEur, endTarget: endTargetEur, diff: curEur - endTargetEur },
      },
      afterStats: {
        curNet: curAfterNet,
        curInc: curAfterInc,
        curExp: curAfterExp,
      },
      onTargetStats: {
        curNet: curOnNet,
        curInc: curOnInc,
        curExp: curOnExp,
        baseInc: onTargetIncBase,
        baseExp: onTargetExpBase,
        baseNet: onTargetNetBase,
        startTargetBase,
        endTargetBase,
        items: onTargetItems,
      }
    };
  }, [initData, currentCurrency, summaryBase, globalRateUsd, globalRateEur, globalRateUsdSell, globalRateEurSell, historyGroups, comparePreset, customCompareDate, customCompareMonth, customCompareYear, monthOptionType, yearOptionType, savedSnapshots, ratesRev]);

  // Auto-fetch historical rate if current comparison target date has fallback rates or missing rates
  useEffect(() => {
    if (!comparisonData?.targetISO) return;
    const iso = comparisonData.targetISO;
    const nowISO = new Date().toISOString().split("T")[0];
    if (iso === nowISO) return;

    const dailyMap = getDailyRatesMap();
    if (!dailyMap[iso] || !dailyMap[iso].usd) {
      setIsFetchingTargetRates(true);
      fetchHistoricalRatesForDate(iso)
        .then(res => {
          if (res && res.usd > 0) {
            setRatesRev(r => r + 1);
          }
        })
        .catch(err => console.warn("Failed to auto-fetch historical rate:", err))
        .finally(() => setIsFetchingTargetRates(false));
    }
  }, [comparisonData?.targetISO]);

  const handleFetchNbuTargetRates = async () => {
    if (!comparisonData?.targetISO) return;
    setIsFetchingTargetRates(true);
    setTargetRatesFeedbackMsg("");
    try {
      const res = await fetchHistoricalRatesForDate(comparisonData.targetISO, true);
      if (res && res.usd > 0) {
        setRatesRev(r => r + 1);
        setEditRateUsd(String(res.usd));
        setEditRateEur(String(res.eur));
        setTargetRatesFeedbackMsg(`Курси НБУ за ${comparisonData.targetFormatted} успішно завантажено!`);
        setTimeout(() => setTargetRatesFeedbackMsg(""), 3500);
      } else {
        setTargetRatesFeedbackMsg("Не вдалося завантажити курси НБУ на цю дату");
        setTimeout(() => setTargetRatesFeedbackMsg(""), 3500);
      }
    } catch (e) {
      setTargetRatesFeedbackMsg("Помилка зв'язку з сервісом курсів");
      setTimeout(() => setTargetRatesFeedbackMsg(""), 3500);
    } finally {
      setIsFetchingTargetRates(false);
    }
  };

  const handleApplyCustomTargetRates = () => {
    if (!comparisonData?.targetISO) return;
    const u = parseFloat(editRateUsd.replace(",", "."));
    const e = parseFloat(editRateEur.replace(",", "."));
    if (isNaN(u) || u <= 0 || isNaN(e) || e <= 0) {
      setTargetRatesFeedbackMsg("Введіть коректні значення курсів (наприклад 41.50)");
      setTimeout(() => setTargetRatesFeedbackMsg(""), 3500);
      return;
    }
    saveDailyRatesForDate(comparisonData.targetISO, {
      usd: u,
      usdSell: u,
      eur: e,
      eurSell: e,
      source: "Вказано вручну"
    });
    setRatesRev(r => r + 1);
    setIsEditingTargetRates(false);
    setTargetRatesFeedbackMsg(`Курс на ${comparisonData.targetFormatted} збережено!`);
    setTimeout(() => setTargetRatesFeedbackMsg(""), 3500);
  };

  const fxHistoryChartData = useMemo(() => {
    if (activeAnalyticsTab !== "fx_report") return [];

    const curUah = comparisonData?.breakdown.UAH.today || 0;
    const curUsd = comparisonData?.breakdown.USD.today || 0;
    const curEur = comparisonData?.breakdown.EUR.today || 0;

    const today = new Date();
    const points: Array<{
      dateISO: string;
      dateFormatted: string;
      rate: number;
      usdRate?: number;
      usdSellRate?: number;
      eurRate?: number;
      eurSellRate?: number;
      rateDate?: string;
      isCarriedForward?: boolean;
      totalBalance: number;
      curBalance: number;
    }> = [];

    const parsedTxList = (historyGroups || []).map(g => {
      const txMs = parseGroupTimestamp(g);
      const itemDeltas: Array<{ curr: "UAH" | "USD" | "EUR"; delta: number }> = [];
      g.items.forEach(item => {
        const { curr, isIncome, rawSum, isCapitalTransfer } = getEffectiveItemDetails(item, g, (g.curr as "UAH" | "USD" | "EUR") || "UAH");
        if (rawSum === 0 || isCapitalTransfer) return;
        itemDeltas.push({
          curr,
          delta: isIncome ? rawSum : -rawSum
        });
      });
      return { txMs, itemDeltas };
    });

    const liveRates = {
      usd: globalRateUsd || 0,
      usdSell: globalRateUsdSell || globalRateUsd || 0,
      eur: globalRateEur || 0,
      eurSell: globalRateEurSell || globalRateEur || 0
    };

    for (let i = fxChartDays - 1; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      const pad = (n: number) => String(n).padStart(2, "0");
      const dateISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const dateFormatted = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;

      const endOfDayMs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

      let netAfterUah = 0, netAfterUsd = 0, netAfterEur = 0;
      parsedTxList.forEach(tx => {
        if (tx.txMs > endOfDayMs) {
          tx.itemDeltas.forEach(it => {
            if (it.curr === "UAH") netAfterUah += it.delta;
            else if (it.curr === "USD") netAfterUsd += it.delta;
            else if (it.curr === "EUR") netAfterEur += it.delta;
          });
        }
      });

      const dayUah = curUah - netAfterUah;
      const dayUsd = curUsd - netAfterUsd;
      const dayEur = curEur - netAfterEur;

      const ratesOnD = getRatesForDate(dateISO, liveRates);
      const rateVal = fxChartCurrency === "USD" ? (ratesOnD.usd || liveRates.usd) : (ratesOnD.eur || liveRates.eur);

      const totalInBase = convertAmount(dayUah, "UAH", summaryBase, ratesOnD) +
                          convertAmount(dayUsd, "USD", summaryBase, ratesOnD) +
                          convertAmount(dayEur, "EUR", summaryBase, ratesOnD);

      const selectedCurVal = fxChartCurrency === "USD" ? dayUsd : dayEur;

      points.push({
        dateISO,
        dateFormatted,
        rate: Number(rateVal.toFixed(2)),
        usdRate: Number((ratesOnD.usd || liveRates.usd).toFixed(2)),
        usdSellRate: Number((ratesOnD.usdSell || ratesOnD.usd || liveRates.usdSell).toFixed(2)),
        eurRate: Number((ratesOnD.eur || liveRates.eur).toFixed(2)),
        eurSellRate: Number((ratesOnD.eurSell || ratesOnD.eur || liveRates.eurSell).toFixed(2)),
        rateDate: ratesOnD.rateDate,
        isCarriedForward: ratesOnD.isCarriedForward,
        totalBalance: Number(totalInBase.toFixed(2)),
        curBalance: Number(selectedCurVal.toFixed(2))
      });
    }

    return points;
  }, [activeAnalyticsTab, fxChartCurrency, fxChartDays, historyGroups, comparisonData, globalRateUsd, globalRateUsdSell, globalRateEur, globalRateEurSell, summaryBase, ratesRev]);

  const getContractorNameFromItem = (item: any, g: HistoryGroup): string | null => {
    const fullText = item.fullText || item.text || "";
    const parsed = parseTransactionText(fullText);

    if (parsed.contractor && isValidContractorName(parsed.contractor)) {
      return parsed.contractor.trim();
    }
    if (item.contractor && isValidContractorName(item.contractor)) {
      return item.contractor.trim();
    }

    const userMatches = fullText.match(/👤\s*([^|\n📱💳📝📈🔄⚡]+)/g);
    if (userMatches) {
      for (const um of userMatches) {
        let candidate = um.replace(/👤/g, "").trim();
        if (candidate.includes("➔")) {
          const parts = candidate.split("➔").map(p => p.trim());
          for (const p of parts) {
            if (p && p !== "Ми" && p.toLowerCase() !== "ми" && isValidContractorName(p)) {
              return p;
            }
          }
        } else {
          if (candidate && candidate !== "Ми" && candidate.toLowerCase() !== "ми" && isValidContractorName(candidate)) {
            return candidate;
          }
        }
      }
    }

    if (parsed.cardDetails) {
      const lines = parsed.cardDetails.split("\n");
      for (const line of lines) {
        if (line.includes("👤")) {
          const match = line.match(/👤\s*([^|\n➔]+)/);
          if (match) {
            const cand = match[1].trim();
            if (cand && cand !== "Ми" && cand.toLowerCase() !== "ми" && isValidContractorName(cand)) {
              return cand;
            }
          }
        }
      }
    }

    return null;
  };

  const contractorReportData = useMemo(() => {
    if (activeAnalyticsTab !== "contractors") {
      return {
        items: [],
        unassigned: null,
        totalIncomeBase: 0,
        totalExpenseBase: 0,
        totalNetBase: 0,
        totalOpsCount: 0,
        activeContractorsCount: 0,
        periodLabel: ""
      };
    }

    let periodStartMs = 0;
    let periodEndMs = new Date().setHours(23, 59, 59, 999);
    let periodLabel = "всі операції";

    if (comparisonData && comparisonData.targetISO) {
      const parts = comparisonData.targetISO.split("-").map(Number);
      if (parts.length === 3) {
        periodStartMs = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
      }
      periodLabel = `з ${comparisonData.targetFormatted} по сьогодні`;
    }

    if (comparePreset === "prev_month" || (comparePreset === "custom_month" && monthOptionType === "end") || (comparePreset === "custom_year" && yearOptionType === "end")) {
      if (comparisonData && comparisonData.targetISO) {
        const parts = comparisonData.targetISO.split("-").map(Number);
        if (parts.length === 3) {
          periodEndMs = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime();
          periodLabel = `за ${comparisonData.targetFormatted}`;
        }
      }
    }

    const map = new Map<string, {
      name: string;
      incomeBase: number;
      expenseBase: number;
      opsCount: number;
      incomeByCurr: { UAH: number; USD: number; EUR: number };
      expenseByCurr: { UAH: number; USD: number; EUR: number };
    }>();

    let unassignedItem = {
      name: "Без контрагента",
      incomeBase: 0,
      expenseBase: 0,
      opsCount: 0,
      incomeByCurr: { UAH: 0, USD: 0, EUR: 0 },
      expenseByCurr: { UAH: 0, USD: 0, EUR: 0 },
    };

    (historyGroups || []).forEach(g => {
      const txMs = parseGroupTimestamp(g);
      if (txMs >= periodStartMs && txMs <= periodEndMs) {
        g.items.forEach(item => {
          const { curr, isIncome, rawSum, isCapitalTransfer } = getEffectiveItemDetails(item, g, (g.curr as "UAH" | "USD" | "EUR") || "UAH");
          if (rawSum === 0 || isCapitalTransfer) return;

          const sumInBase = convertAmount(rawSum, curr, summaryBase);
          const cName = getContractorNameFromItem(item, g);

          if (cName) {
            const key = cName.toLowerCase();
            if (!map.has(key)) {
              map.set(key, {
                name: cName,
                incomeBase: 0,
                expenseBase: 0,
                opsCount: 0,
                incomeByCurr: { UAH: 0, USD: 0, EUR: 0 },
                expenseByCurr: { UAH: 0, USD: 0, EUR: 0 },
              });
            }
            const entry = map.get(key)!;
            entry.opsCount += 1;
            if (isIncome) {
              entry.incomeBase += sumInBase;
              entry.incomeByCurr[curr] += rawSum;
            } else {
              entry.expenseBase += sumInBase;
              entry.expenseByCurr[curr] += rawSum;
            }
          } else {
            unassignedItem.opsCount += 1;
            if (isIncome) {
              unassignedItem.incomeBase += sumInBase;
              unassignedItem.incomeByCurr[curr] += rawSum;
            } else {
              unassignedItem.expenseBase += sumInBase;
              unassignedItem.expenseByCurr[curr] += rawSum;
            }
          }
        });
      }
    });

    const rawList = Array.from(map.values());

    let totalIncomeBase = 0;
    let totalExpenseBase = 0;
    let totalOpsCount = 0;

    rawList.forEach(item => {
      totalIncomeBase += item.incomeBase;
      totalExpenseBase += item.expenseBase;
      totalOpsCount += item.opsCount;
    });

    if (unassignedItem.opsCount > 0) {
      totalIncomeBase += unassignedItem.incomeBase;
      totalExpenseBase += unassignedItem.expenseBase;
      totalOpsCount += unassignedItem.opsCount;
    }

    const totalNetBase = totalIncomeBase - totalExpenseBase;

    return {
      items: rawList,
      unassigned: unassignedItem.opsCount > 0 ? unassignedItem : null,
      totalIncomeBase,
      totalExpenseBase,
      totalNetBase,
      totalOpsCount,
      activeContractorsCount: rawList.length,
      periodLabel
    };
  }, [
    activeAnalyticsTab,
    historyGroups,
    comparisonData,
    summaryBase,
    comparePreset,
    monthOptionType,
    yearOptionType,
    globalRateUsd,
    globalRateEur,
    globalRateUsdSell,
    globalRateEurSell,
    ratesRev
  ]);

  const monthlyDynamics = useMemo(() => {
    const list: Array<{
      key: string;
      label: string;
      endMs: number;
      cap: { UAH: number; USD: number; EUR: number };
      totalBase: number;
      diffBase: number;
      percentChange: number;
    }> = [];

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];

    const liveRates = {
      usd: globalRateUsd || 0,
      usdSell: globalRateUsdSell || globalRateUsd || 0,
      eur: globalRateEur || 0,
      eurSell: globalRateEurSell || globalRateEur || 0,
    };

    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const isCurrentMonth = i === 0;
      const targetTime = isCurrentMonth ? now.getTime() : d.getTime();
      const dateISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const dRates = isCurrentMonth ? liveRates : getRatesForDate(dateISO, liveRates);

      const cap = calculateCapitalAtMs(targetTime);
      const totalBase = convertAmount(cap.UAH, "UAH", summaryBase, dRates) +
                        convertAmount(cap.USD, "USD", summaryBase, dRates) +
                        convertAmount(cap.EUR, "EUR", summaryBase, dRates);

      const mIdx = d.getMonth();
      const yr = d.getFullYear();
      const label = isCurrentMonth
        ? `Поточний (${monthNames[mIdx]} ${yr})`
        : `${monthNames[mIdx]} ${yr}`;
      const key = `${yr}-${pad(mIdx + 1)}`;

      list.push({
        key,
        label,
        endMs: targetTime,
        cap,
        totalBase,
        diffBase: 0,
        percentChange: 0,
      });
    }

    for (let i = 0; i < list.length - 1; i++) {
      const prevTotal = list[i + 1].totalBase;
      const diff = list[i].totalBase - prevTotal;
      list[i].diffBase = diff;
      list[i].percentChange = prevTotal > 0 ? (diff / prevTotal) * 100 : 0;
    }

    return list;
  }, [initData, summaryBase, globalRateUsd, globalRateEur, globalRateUsdSell, globalRateEurSell, historyGroups, ratesRev]);

  const yearlyDynamics = useMemo(() => {
    const list: Array<{
      year: number;
      label: string;
      endMs: number;
      cap: { UAH: number; USD: number; EUR: number };
      totalBase: number;
      diffBase: number;
      percentChange: number;
    }> = [];

    const now = new Date();
    const curYear = now.getFullYear();

    const liveRates = {
      usd: globalRateUsd || 0,
      usdSell: globalRateUsdSell || globalRateUsd || 0,
      eur: globalRateEur || 0,
      eurSell: globalRateEurSell || globalRateEur || 0,
    };

    for (let i = 0; i < 4; i++) {
      const yr = curYear - i;
      const isCurYear = i === 0;
      const endOfYear = isCurYear ? now.getTime() : new Date(yr, 11, 31, 23, 59, 59, 999).getTime();
      const dateISO = `${yr}-12-31`;
      const dRates = isCurYear ? liveRates : getRatesForDate(dateISO, liveRates);

      const cap = calculateCapitalAtMs(endOfYear);
      const totalBase = convertAmount(cap.UAH, "UAH", summaryBase, dRates) +
                        convertAmount(cap.USD, "USD", summaryBase, dRates) +
                        convertAmount(cap.EUR, "EUR", summaryBase, dRates);

      list.push({
        year: yr,
        label: isCurYear ? `${yr} рік (поточний)` : `${yr} рік (кінець року)`,
        endMs: endOfYear,
        cap,
        totalBase,
        diffBase: 0,
        percentChange: 0,
      });
    }

    for (let i = 0; i < list.length - 1; i++) {
      const prevTotal = list[i + 1].totalBase;
      const diff = list[i].totalBase - prevTotal;
      list[i].diffBase = diff;
      list[i].percentChange = prevTotal > 0 ? (diff / prevTotal) * 100 : 0;
    }

    return list;
  }, [initData, summaryBase, globalRateUsd, globalRateEur, globalRateUsdSell, globalRateEurSell, historyGroups, ratesRev]);

  const last30DaysCapitalData = useMemo(() => {
    const list: Array<{
      date: string;
      fullDate: string;
      timestamp: number;
      total: number;
      uah: number;
      usd: number;
      eur: number;
    }> = [];

    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");

    const liveRates = {
      usd: globalRateUsd || 0,
      usdSell: globalRateUsdSell || globalRateUsd || 0,
      eur: globalRateEur || 0,
      eurSell: globalRateEurSell || globalRateEur || 0,
    };

    const daysCount = capitalChartDays || 30;

    for (let i = daysCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 23, 59, 59, 999);
      const isToday = i === 0;
      const targetTime = isToday ? now.getTime() : d.getTime();
      const dateISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      // Retrieve actual exchange rates on that day to accurately account for currency fluctuations
      const dRates = isToday ? liveRates : getRatesForDate(dateISO, liveRates);

      const cap = calculateCapitalAtMs(targetTime);
      const uahVal = convertAmount(cap.UAH, "UAH", summaryBase, dRates);
      const usdVal = convertAmount(cap.USD, "USD", summaryBase, dRates);
      const eurVal = convertAmount(cap.EUR, "EUR", summaryBase, dRates);
      const totalVal = uahVal + usdVal + eurVal;

      const dateLabel = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
      const fullDateLabel = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;

      list.push({
        date: dateLabel,
        fullDate: fullDateLabel,
        timestamp: targetTime,
        total: Math.round(totalVal * 100) / 100,
        uah: Math.round(uahVal * 100) / 100,
        usd: Math.round(usdVal * 100) / 100,
        eur: Math.round(eurVal * 100) / 100,
      });
    }

    return list;
  }, [initData, summaryBase, globalRateUsd, globalRateEur, globalRateUsdSell, globalRateEurSell, historyGroups, ratesRev, capitalChartDays]);

  const handlePrintComparison = () => {
    if (!comparisonData) return;

    const printWindow = window.open("", "_blank", "width=920,height=900");
    if (!printWindow) {
      alert("Будь ласка, дозвольте спливаючі вікна у вашому браузері для виводу звіту на друк.");
      return;
    }

    const title = `Детальний звіт порівняння капіталу - ${comparisonData.targetFormatted}`;
    const nowStr = new Date().toLocaleString("uk-UA");

    // Calculate currency percentages
    const totalTodayBase = comparisonData.global.today || 1;
    const uahBaseVal = convertAmount(comparisonData.breakdown.UAH.today, "UAH", summaryBase);
    const usdBaseVal = convertAmount(comparisonData.breakdown.USD.today, "USD", summaryBase);
    const eurBaseVal = convertAmount(comparisonData.breakdown.EUR.today, "EUR", summaryBase);

    const uahPct = Math.max(0, Math.min(100, (uahBaseVal / totalTodayBase) * 100));
    const usdPct = Math.max(0, Math.min(100, (usdBaseVal / totalTodayBase) * 100));
    const eurPct = Math.max(0, Math.min(100, (eurBaseVal / totalTodayBase) * 100));

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 24px;
            color: #0f172a;
            background: #ffffff;
            font-size: 13px;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #0284c7;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          h1 {
            font-size: 20px;
            margin: 0 0 4px 0;
            color: #0369a1;
          }
          .meta {
            font-size: 12px;
            color: #64748b;
          }
          .btn-print {
            background: #0284c7;
            color: #ffffff;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: bold;
            cursor: pointer;
            font-size: 12px;
          }
          .summary-card {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 20px;
          }
          .summary-title {
            font-size: 14px;
            font-weight: bold;
            color: #0369a1;
            margin-bottom: 12px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
          }
          .card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 10px 12px;
          }
          .card-label {
            font-size: 11px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
          }
          .card-val {
            font-size: 16px;
            font-weight: 800;
            margin-top: 4px;
          }
          .text-green { color: #15803d; }
          .text-red { color: #b91c1c; }
          .section-title {
            font-size: 14px;
            font-weight: bold;
            margin-top: 24px;
            margin-bottom: 8px;
            color: #1e293b;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
            font-size: 12px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 8px 10px;
            text-align: left;
          }
          th {
            background: #f1f5f9;
            font-weight: bold;
            color: #334155;
          }
          .text-right { text-align: right; }
          .font-mono { font-family: monospace; font-size: 13px; }
          .progress-bar-container {
            display: flex;
            height: 12px;
            border-radius: 6px;
            overflow: hidden;
            background: #e2e8f0;
            margin-top: 10px;
          }
          .bar-uah { background: #0284c7; }
          .bar-usd { background: #16a34a; }
          .bar-eur { background: #9333ea; }
          @media print {
            .btn-print { display: none !important; }
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>📊 Детальний звіт порівняння капіталу</h1>
            <div class="meta">
              Період: <strong>${comparisonData.presetLabel} (${comparisonData.targetFormatted})</strong> | Базова валюта: <strong>${summaryBase}</strong> | Сформовано: ${nowStr}
            </div>
          </div>
          <button class="btn-print" onclick="window.print()">🖨️ Друкувати звіт</button>
        </div>

        <div class="summary-card">
          <div class="summary-title">Загальний капітал у базі ${summaryBase}:</div>
          <div class="grid">
            <div class="card">
              <div class="card-label">Капітал на ${comparisonData.targetFormatted}</div>
              <div class="card-val">${comparisonData.global.target.toFixed(2)} ${getCurrencySymbol(summaryBase)}</div>
            </div>
            <div class="card">
              <div class="card-label">Поточний капітал сьогодні</div>
              <div class="card-val">${comparisonData.global.today.toFixed(2)} ${getCurrencySymbol(summaryBase)}</div>
            </div>
            <div class="card">
              <div class="card-label">Різниця / Динаміка</div>
              <div class="card-val ${comparisonData.global.diff >= 0 ? "text-green" : "text-red"}">
                ${comparisonData.global.diff >= 0 ? "+" : ""}${comparisonData.global.diff.toFixed(2)} ${getCurrencySymbol(summaryBase)}
                ${comparisonData.global.target > 0 && comparisonData.global.today > 0 && Math.abs(comparisonData.global.percent) <= 999
                  ? `(${comparisonData.global.percent >= 0 ? "+" : ""}${comparisonData.global.percent.toFixed(1)}%)`
                  : ""}
              </div>
            </div>
          </div>

          <div style="margin-top: 14px; font-size: 11px; color: #475569; font-weight: 600;">
            Структура поточного капіталу: UAH (${uahPct.toFixed(1)}%), USD (${usdPct.toFixed(1)}%), EUR (${eurPct.toFixed(1)}%)
          </div>
          <div class="progress-bar-container">
            <div class="bar-uah" style="width: ${uahPct}%;" title="UAH ${uahPct.toFixed(1)}%"></div>
            <div class="bar-usd" style="width: ${usdPct}%;" title="USD ${usdPct.toFixed(1)}%"></div>
            <div class="bar-eur" style="width: ${eurPct}%;" title="EUR ${eurPct.toFixed(1)}%"></div>
          </div>
        </div>

        <div class="section-title">Розподіл по валютах</div>
        <table>
          <thead>
            <tr>
              <th>Валюта</th>
              <th class="text-right">Капітал на ${comparisonData.targetFormatted}</th>
              <th class="text-right">Поточний капітал</th>
              <th class="text-right">Зміна</th>
            </tr>
          </thead>
          <tbody>
            ${["UAH", "USD", "EUR"].map(c => {
              const b = comparisonData.breakdown[c as "UAH" | "USD" | "EUR"];
              const sym = getCurrencySymbol(c);
              const diff = b.diff;
              return `
                <tr>
                  <td><strong>${c}</strong></td>
                  <td class="text-right font-mono">${b.target.toFixed(2)} ${sym}</td>
                  <td class="text-right font-mono">${b.today.toFixed(2)} ${sym}</td>
                  <td class="text-right font-mono ${diff >= 0 ? "text-green" : "text-red"}" style="font-weight:bold;">
                    ${diff >= 0 ? "+" : ""}${diff.toFixed(2)} ${sym}
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>

        <div class="section-title">📊 Динаміка по місяцях (останні 6 місяців)</div>
        <table>
          <thead>
            <tr>
              <th>Місяць</th>
              <th class="text-right">Капітал (${getCurrencySymbol(summaryBase)})</th>
              <th class="text-right">Зміна (+/-)</th>
              <th class="text-right">Динаміка %</th>
              <th class="text-right">UAH / USD / EUR</th>
            </tr>
          </thead>
          <tbody>
            ${monthlyDynamics.map(m => `
              <tr>
                <td><strong>${m.label}</strong></td>
                <td class="text-right font-mono"><strong>${m.totalBase.toFixed(2)} ${getCurrencySymbol(summaryBase)}</strong></td>
                <td class="text-right font-mono ${m.diffBase >= 0 ? "text-green" : "text-red"}">
                  ${m.diffBase >= 0 ? "+" : ""}${m.diffBase.toFixed(2)}
                </td>
                <td class="text-right font-mono ${m.percentChange >= 0 ? "text-green" : "text-red"}">
                  ${m.percentChange >= 0 ? "+" : ""}${m.percentChange.toFixed(1)}%
                </td>
                <td class="text-right font-mono" style="font-size: 11px; color: #475569;">
                  ${m.cap.UAH.toFixed(0)}₴ | ${m.cap.USD.toFixed(0)}$ | ${m.cap.EUR.toFixed(0)}€
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div class="section-title">📅 Динаміка по роках</div>
        <table>
          <thead>
            <tr>
              <th>Рік</th>
              <th class="text-right">Капітал (${getCurrencySymbol(summaryBase)})</th>
              <th class="text-right">Зміна (+/-)</th>
              <th class="text-right">Динаміка %</th>
              <th class="text-right">UAH / USD / EUR</th>
            </tr>
          </thead>
          <tbody>
            ${yearlyDynamics.map(y => `
              <tr>
                <td><strong>${y.label}</strong></td>
                <td class="text-right font-mono"><strong>${y.totalBase.toFixed(2)} ${getCurrencySymbol(summaryBase)}</strong></td>
                <td class="text-right font-mono ${y.diffBase >= 0 ? "text-green" : "text-red"}">
                  ${y.diffBase >= 0 ? "+" : ""}${y.diffBase.toFixed(2)}
                </td>
                <td class="text-right font-mono ${y.percentChange >= 0 ? "text-green" : "text-red"}">
                  ${y.percentChange >= 0 ? "+" : ""}${y.percentChange.toFixed(1)}%
                </td>
                <td class="text-right font-mono" style="font-size: 11px; color: #475569;">
                  ${y.cap.UAH.toFixed(0)}₴ | ${y.cap.USD.toFixed(0)}$ | ${y.cap.EUR.toFixed(0)}€
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>

        <div class="section-title">Детальна формула залишку для ${summaryBase}</div>
        <table>
          <tbody>
            <tr>
              <td>1. Капітал до початку дня ${comparisonData.targetFormatted} (00:00)</td>
              <td class="text-right font-mono"><strong>${comparisonData.onTargetStats.startTargetBase.toFixed(2)} ${getCurrencySymbol(summaryBase)}</strong></td>
            </tr>
            <tr>
              <td>2. Рух коштів за день ${comparisonData.targetFormatted} (Прихід: +${comparisonData.onTargetStats.baseInc.toFixed(2)} / Витрата: -${comparisonData.onTargetStats.baseExp.toFixed(2)})</td>
              <td class="text-right font-mono"><strong>${comparisonData.onTargetStats.baseNet >= 0 ? "+" : ""}${comparisonData.onTargetStats.baseNet.toFixed(2)} ${getCurrencySymbol(summaryBase)}</strong></td>
            </tr>
            <tr>
              <td>3. Капітал на кінець дня ${comparisonData.targetFormatted} (23:59)</td>
              <td class="text-right font-mono"><strong>${comparisonData.onTargetStats.endTargetBase.toFixed(2)} ${getCurrencySymbol(summaryBase)}</strong></td>
            </tr>
            <tr>
              <td>4. Поточний капітал сьогодні</td>
              <td class="text-right font-mono"><strong>${comparisonData.global.today.toFixed(2)} ${getCurrencySymbol(summaryBase)}</strong></td>
            </tr>
          </tbody>
        </table>

        ${comparisonData.onTargetStats.items && comparisonData.onTargetStats.items.length > 0 ? `
          <div class="section-title">Операції за ${comparisonData.targetFormatted} (${comparisonData.onTargetStats.items.length} зап.)</div>
          <table>
            <thead>
              <tr>
                <th>Дата / Час</th>
                <th>Тип / Опис</th>
                <th>Банк / Джерело</th>
                <th class="text-right">Сума</th>
              </tr>
            </thead>
            <tbody>
              ${comparisonData.onTargetStats.items.map(it => {
                const converted = convertAmount(it.sum, it.curr, summaryBase);
                return `
                <tr>
                  <td>${it.dateStr}</td>
                  <td><strong>${it.operation}</strong> ${it.text ? `<br><small style="color:#64748b">${it.text}</small>` : ""}</td>
                  <td>${it.bank || "-"}</td>
                  <td class="text-right font-mono ${it.isIncome ? "text-green" : "text-red"}" style="font-weight:bold;">
                    ${it.isIncome ? "+" : ""}${it.sum.toFixed(2)} ${getCurrencySymbol(it.curr)}
                    ${it.curr !== summaryBase ? `<br><small style="color:#64748b">(≈ ${converted >= 0 ? "+" : ""}${converted.toFixed(2)} ${getCurrencySymbol(summaryBase)})</small>` : ""}
                  </td>
                </tr>
              `;
              }).join("")}
            </tbody>
          </table>
        ` : ""}

        ${savedSnapshots.length > 0 ? `
          <div class="section-title">Фіксовані контрольні точки (Знімки)</div>
          <table>
            <thead>
              <tr>
                <th>Назва</th>
                <th>Дата та час</th>
                <th class="text-right">UAH</th>
                <th class="text-right">USD</th>
                <th class="text-right">EUR</th>
              </tr>
            </thead>
            <tbody>
              ${savedSnapshots.map(s => `
                <tr>
                  <td><strong>📸 ${s.name}</strong></td>
                  <td>${s.dateTimeStr}</td>
                  <td class="text-right font-mono">${s.totals.UAH.toFixed(2)} ₴</td>
                  <td class="text-right font-mono">${s.totals.USD.toFixed(2)} $</td>
                  <td class="text-right font-mono">${s.totals.EUR.toFixed(2)} €</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : ""}

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const multiInterestStats = (() => {
    const stats: Record<string, { give: number; take: number; hasAny: boolean }> = {
      UAH: { give: 0, take: 0, hasAny: false },
      USD: { give: 0, take: 0, hasAny: false },
      EUR: { give: 0, take: 0, hasAny: false },
    };
    
    let hasOverallAny = false;

    allPlanned.forEach((it: any) => {
      if (it.isInterest && it.interestStartDate && it.currency) {
        const curr = it.currency;
        if (!stats[curr]) {
          stats[curr] = { give: 0, take: 0, hasAny: false };
        }
        const todayD = new Date();
        const todayStr = todayD.getFullYear() + '-' + String(todayD.getMonth() + 1).padStart(2, '0') + '-' + String(todayD.getDate()).padStart(2, '0');
        const { accrued: newAccrued } = calculateAccruedInterest(
          Number(it.sum) || 0,
          Number(it.interestRate) || 0,
          it.interestPeriod,
          it.interestStartDate || it.date,
          todayStr
        );
        const accrued = Number(((it.accumulatedInterest || 0) + newAccrued).toFixed(2));
        
        if (it.interestMode === "give") {
          stats[curr].give += accrued;
        } else {
          stats[curr].take += accrued;
        }
        
        if (accrued > 0) {
          stats[curr].hasAny = true;
          hasOverallAny = true;
        }
      }
    });

    let totalNetBase = 0;
    Object.entries(stats).forEach(([c, s]) => {
      const net = s.give - s.take;
      totalNetBase += convertAmount(net, c, summaryBase);
    });

    return {
      currencies: stats,
      hasAny: hasOverallAny,
      totalNetBase
    };
  })();

  const availableResourcesSummary = useMemo(() => {
    if (!initData) return 0;
    let grandTotalBase = 0;
    const currenciesList = ["UAH", "USD", "EUR"] as const;

    currenciesList.forEach((c) => {
      const bankMap = initData.allBankDetails?.[c] || (currentCurrency === c ? initData.capital.banks : undefined);
      let cPos = 0;
      if (bankMap) {
        Object.values(bankMap).forEach((v) => {
          const val = Number(v) || 0;
          if (val > 0.001) cPos += val;
        });
      } else {
        const cash = initData.allCashBalances?.[c] || 0;
        if (cash > 0) cPos += cash;
      }
      grandTotalBase += convertAmount(cPos, c, summaryBase);
    });

    return grandTotalBase;
  }, [initData, currentCurrency, summaryBase, globalRateUsd, globalRateEur, globalRateUsdSell, globalRateEurSell]);

  const getCombinedCapitalDisplay = () => {
    if (!initData) return "...";
    const uah = initData.globalTotals.UAH || 0;
    const usd = initData.globalTotals.USD || 0;
    const eur = initData.globalTotals.EUR || 0;
    
    const rUsd = globalRateUsd || 0;
    const rUsdSell = globalRateUsdSell || rUsd;
    const rEur = globalRateEur || 0;
    const rEurSell = globalRateEurSell || rEur;

    const convert = (amount: number, from: string, to: string) => {
      if (from === to) return amount;
      if (amount >= 0) {
        let uahAmount = 0;
        if (from === "UAH") uahAmount = amount;
        else if (from === "USD") uahAmount = amount * rUsd;
        else if (from === "EUR") uahAmount = amount * rEur;

        if (to === "UAH") return uahAmount;
        if (to === "USD") return rUsdSell > 0 ? uahAmount / rUsdSell : 0;
        if (to === "EUR") return rEurSell > 0 ? uahAmount / rEurSell : 0;
      } else {
        const absAmount = Math.abs(amount);
        let uahNeeded = 0;
        if (from === "UAH") uahNeeded = absAmount;
        else if (from === "USD") uahNeeded = absAmount * rUsdSell;
        else if (from === "EUR") uahNeeded = absAmount * rEurSell;

        let toNeeded = 0;
        if (to === "UAH") toNeeded = uahNeeded;
        else if (to === "USD") toNeeded = rUsd > 0 ? uahNeeded / rUsd : 0;
        else if (to === "EUR") toNeeded = rEur > 0 ? uahNeeded / rEur : 0;
        return -toNeeded;
      }
      return 0;
    };

    const targetBase = summaryBase || "UAH";
    const total = convert(uah, "UAH", targetBase) + convert(usd, "USD", targetBase) + convert(eur, "EUR", targetBase);

    if (targetBase === "USD") {
      return `${total.toFixed(2)} $`;
    }
    if (targetBase === "EUR") {
      return `${total.toFixed(2)} €`;
    }
    return `${total.toFixed(2)} ₴`;
  };

  const getSummaryFlag = () => {
    if (summaryBase === "USD") return "🇺🇸";
    if (summaryBase === "EUR") return "🇪🇺";
    return "🇺🇦";
  };

  const getSummaryLabel = () => {
    if (summaryBase === "USD") return "Зведений капітал у USD";
    if (summaryBase === "EUR") return "Зведений капітал у EUR";
    return "Зведений капітал у UAH";
  };

  const getSelectedCurrencyCardStyle = () => {
    if (currentCurrency === "UAH") {
      return {
        card: "border-sky-500/30 bg-sky-950/20 hover:border-sky-500/60 shadow-[0_0_15px_rgba(56,189,248,0.06)] hover:bg-sky-950/30",
        label: "text-sky-400 font-bold",
        amount: "text-white font-black",
        btn: "text-sky-400 hover:text-sky-300"
      };
    }
    if (currentCurrency === "USD") {
      return {
        card: "border-emerald-500/30 bg-emerald-950/20 hover:border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.06)] hover:bg-emerald-950/30",
        label: "text-emerald-400 font-bold",
        amount: "text-white font-black",
        btn: "text-emerald-400 hover:text-emerald-300"
      };
    }
    if (currentCurrency === "EUR") {
      return {
        card: "border-indigo-500/30 bg-indigo-950/20 hover:border-indigo-500/60 shadow-[0_0_15px_rgba(99,102,241,0.06)] hover:bg-indigo-950/30",
        label: "text-indigo-400 font-bold",
        amount: "text-white font-black",
        btn: "text-indigo-400 hover:text-indigo-300"
      };
    }
    return {
      card: "border-slate-800 bg-slate-900 hover:border-slate-700",
      label: "text-slate-400",
      amount: "text-white",
      btn: "text-slate-400 hover:text-sky-400"
    };
  };

  const selectedTheme = getSelectedCurrencyCardStyle();

  return (
    <div className="flex flex-col gap-1.5 sm:gap-2.5">
      {/* 1. Global Combined Capital Card */}
      <div
        onClick={() => onNavigate("global-capital")}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 p-3.5 sm:p-5 shadow-lg shadow-sky-500/10 cursor-pointer transition-all hover:shadow-sky-500/20 hover:scale-[1.005] active:scale-95 text-white"
      >
        <div className="flex items-center justify-between mb-1 gap-2">
          {/* Card Title - Clickable header to switch currency */}
          <div
            onClick={(e) => {
              e.stopPropagation();
              onToggleSummaryBase();
            }}
            className="flex items-center gap-1.5 cursor-pointer group hover:opacity-90 transition-all"
            title="Натисніть для перемикання базової валюти (Гривня / Долар / Євро)"
          >
            <span className="text-xl sm:text-2xl leading-none" role="img" aria-label="flag">{getSummaryFlag()}</span>
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-sky-100 group-hover:text-white flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" /> {getSummaryLabel()}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsCombinedCapitalHintOpen(true);
              }}
              className="p-1 rounded-full text-sky-200 hover:text-white hover:bg-white/20 transition-all cursor-pointer ml-0.5"
              title="Підказка: як розраховується цей баланс?"
            >
              <HelpCircle className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Currency Selector Buttons */}
          <div className="flex items-center gap-1 bg-black/20 p-0.5 rounded-full border border-white/20">
            {(["UAH", "USD", "EUR"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSummaryBase(c);
                }}
                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer ${
                  summaryBase === c
                    ? "bg-white text-sky-700 shadow-sm scale-105"
                    : "text-sky-100 hover:text-white hover:bg-white/20"
                }`}
                title={`Установити базову валюту: ${c}`}
              >
                {getCurrencyFlag(c)} {c}
              </button>
            ))}
          </div>
        </div>

        <h2
          className="text-2xl sm:text-3xl font-extrabold tracking-tight"
          title="Переглянути детальний розділ зведеного капіталу"
        >
          {loading && !initData ? (
            <span className="inline-block animate-pulse w-24 h-7 bg-white/20 rounded-md"></span>
          ) : (
            getCombinedCapitalDisplay()
          )}
        </h2>

        {/* Comparison on Global Card */}
        {comparisonData && (
          <div className="mt-2 pt-2 border-t border-white/20 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
              <div className="flex items-center gap-1 font-medium text-sky-100 text-[11px] sm:text-xs">
                <Calendar className="w-3.5 h-3.5 text-sky-200 flex-shrink-0" />
                <span>
                  {comparisonData.presetLabel} ({comparisonData.targetFormatted.substring(0, 5)}):{" "}
                  <strong className="text-white">
                    {comparisonData.global.target.toFixed(2)}{getCurrencySymbol(summaryBase)}
                  </strong>
                </span>
              </div>

              <div className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[11px] sm:text-xs font-black flex items-center gap-1 shadow-sm border ${
                comparisonData.global.diff > 0.005
                  ? "bg-emerald-500/30 text-emerald-100 border-emerald-300/40"
                  : comparisonData.global.diff < -0.005
                    ? "bg-rose-500/35 text-rose-100 border-rose-300/40"
                    : "bg-white/15 text-white border-white/25"
              }`}>
                {comparisonData.global.diff > 0.005 && <TrendingUp className="w-3.5 h-3.5 text-emerald-300" />}
                {comparisonData.global.diff < -0.005 && <TrendingDown className="w-3.5 h-3.5 text-rose-300" />}
                {(() => {
                  const diff = comparisonData.global.diff;
                  const pct = comparisonData.global.percent;
                  const target = comparisonData.global.target;
                  const today = comparisonData.global.today;
                  const showPct = target > 0 && today > 0 && Math.abs(pct) <= 999;
                  const pctStr = showPct ? ` (${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%)` : "";
                  const sym = getCurrencySymbol(summaryBase);
                  if (diff > 0.005) return `+${diff.toFixed(2)}${sym}${pctStr}`;
                  if (diff < -0.005) return `${diff.toFixed(2)}${sym}${pctStr}`;
                  return `0.00${sym} (без змін)`;
                })()}
              </div>
            </div>

            {/* Clear Cashflow vs FX Revaluation Decomposition Bar */}
            <div 
              onClick={(e) => {
                e.stopPropagation();
                openCompareCurrencyModal();
              }}
              className="flex flex-col sm:flex-row sm:items-center justify-between text-[10.5px] text-sky-100 font-medium bg-black/30 hover:bg-black/45 active:scale-[0.99] transition-all px-2.5 py-1.5 rounded-xl border border-white/15 gap-1.5 cursor-pointer group shadow-inner"
              title="Натисніть для перегляду повного звіту та впливу зміни курсу валют"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-emerald-300 flex items-center gap-1">💸 Рух коштів:</span>
                <strong className={`font-mono ${comparisonData.global.diffOps > 0 ? "text-emerald-200" : comparisonData.global.diffOps < 0 ? "text-rose-200" : "text-white"}`}>
                  {comparisonData.global.diffOps >= 0 ? "+" : ""}{comparisonData.global.diffOps.toFixed(2)}{getCurrencySymbol(summaryBase)}
                </strong>
              </div>
              <div className="flex items-center gap-1.5 sm:ml-auto">
                <span className="text-amber-300 flex items-center gap-1">💱 Зміна курсу:</span>
                <strong className={`font-mono ${comparisonData.global.diffFX > 0 ? "text-emerald-300" : comparisonData.global.diffFX < 0 ? "text-rose-300" : "text-slate-300"}`}>
                  {comparisonData.global.diffFX >= 0 ? "+" : ""}{comparisonData.global.diffFX.toFixed(2)}{getCurrencySymbol(summaryBase)}
                </strong>
                <span className="text-[9px] text-sky-300 underline group-hover:text-white transition-colors ml-1 font-sans">
                  Детальніше ➔
                </span>
              </div>
            </div>

            {/* Per-Currency Breakdown */}
            <div className="grid grid-cols-3 gap-1 sm:gap-1.5 pt-0.5">
              {(["UAH", "USD", "EUR"] as const).map(c => {
                const b = comparisonData.breakdown[c];
                const sym = getCurrencySymbol(c);
                const flag = getCurrencyFlag(c);
                const diff = b.diff;

                return (
                  <div
                    key={c}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onChangeCurrency) {
                        onChangeCurrency(c);
                      }
                      onNavigate("capital");
                    }}
                    className="bg-black/20 backdrop-blur-sm hover:bg-black/40 hover:border-white/30 active:scale-95 transition-all cursor-pointer rounded-xl p-1.5 sm:p-2 border border-white/10 flex flex-col justify-between text-left shadow-sm group"
                    title={`Переглянути деталі рахунків (${c})`}
                  >
                    <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-bold text-sky-100">
                      <span className="flex items-center gap-1 group-hover:text-white transition-colors">
                        <span>{flag}</span> {c}
                      </span>
                    </div>
                    <div className="text-xs sm:text-sm font-black text-white mt-0.5 truncate">
                      {b.today.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{sym}
                    </div>
                    <div className="mt-1 pt-0.5 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between text-[9px] sm:text-[10px] text-sky-100/80 gap-0.5">
                      <span className="truncate">{comparisonData.targetFormatted.substring(0, 5)}: {b.target.toFixed(2)}{sym}</span>
                      <span className={`font-extrabold ${
                        diff > 0.005 ? "text-emerald-300" : diff < -0.005 ? "text-rose-300" : "text-sky-100/70"
                      }`}>
                        {diff > 0.005 ? `+${diff.toFixed(2)}` : diff < -0.005 ? `${diff.toFixed(2)}` : "0.00"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Available Positive Resources Bar & Currency Comparison Button */}
        <div className="mt-3 pt-2.5 border-t border-white/20 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openAvailableResourcesModal();
            }}
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-300/40 text-amber-100 font-extrabold text-[11px] sm:text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer"
            title="Переглянути всі свої власні додатні ресурси"
          >
            <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300" />
            <span>Власні кошти: +{availableResourcesSummary.toFixed(2)}{getCurrencySymbol(summaryBase)}</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openCompareCurrencyModal();
            }}
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-white/20 hover:bg-white/30 border border-white/30 text-white font-extrabold text-[11px] sm:text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ml-auto"
            title="Відкрити інструменти порівняння валют та капіталу"
          >
            <Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-200" />
            <span>Порівняння валют</span>
          </button>
        </div>
      </div>

      {/* 3. Action Grid */}
      <div className="flex flex-col gap-2 mt-0.5">
        {/* Prominent Voice Input Button */}
        <button
          onClick={() => onNavigate("expense-voice")}
          className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950 border border-sky-500/40 hover:border-sky-400 text-sky-200 font-black transition-all hover:scale-[1.01] active:scale-98 shadow-lg shadow-sky-950/40 cursor-pointer group"
        >
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500 text-slate-950 font-black group-hover:scale-110 transition-transform shadow-md shadow-sky-500/30">
              <Mic className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                <span>🎙️ Продиктувати операцію</span>
                <span className="text-[9px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded uppercase tracking-wider font-extrabold">Голос</span>
              </div>
              <div className="text-[11px] text-slate-400 font-medium">
                Продиктуйте суму та категорію (наприклад: «1500 гривень продукти»)
              </div>
            </div>
          </div>
        </button>

        <div className="grid grid-cols-2 gap-1.5 sm:gap-2.5">
          <button
            onClick={() => onNavigate("income")}
            className="flex flex-col items-center justify-center p-2.5 sm:p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15 text-emerald-400 font-bold gap-1 sm:gap-2 transition-all hover:scale-[1.01] active:scale-95 shadow-sm cursor-pointer"
          >
            <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-xs sm:text-base">Дохід</span>
          </button>

          <button
            onClick={() => onNavigate("expense")}
            className="flex flex-col items-center justify-center p-2.5 sm:p-4 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/15 text-red-400 font-bold gap-1 sm:gap-2 transition-all hover:scale-[1.01] active:scale-95 shadow-sm cursor-pointer"
          >
            <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="text-xs sm:text-base">Витрата</span>
          </button>

        <button
          onClick={() => onNavigate("history")}
          className="flex items-center gap-2 sm:gap-2.5 p-2 sm:p-3 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 font-semibold transition-all hover:scale-[1.01] active:scale-95 cursor-pointer shadow-sm"
        >
          <History className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-sky-400 flex-shrink-0" />
          <div className="flex flex-col text-left">
            <span className="text-xs sm:text-sm font-bold text-white">Історія</span>
            <span className="text-[9px] text-slate-400">Аудит операцій</span>
          </div>
        </button>

        <button
          onClick={() => onNavigate("exchange")}
          className="flex items-center gap-2 sm:gap-2.5 p-2 sm:p-3 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-200 font-semibold transition-all hover:scale-[1.01] active:scale-95 cursor-pointer shadow-sm"
        >
          <RefreshCw className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-emerald-400 flex-shrink-0" />
          <div className="flex flex-col text-left">
            <span className="text-xs sm:text-sm font-bold text-white">Обмін / Крос</span>
            <span className="text-[9px] text-slate-400">Конвертація валют</span>
          </div>
        </button>

        <button
          onClick={() => onNavigate("report")}
          className="col-span-2 flex items-center justify-between p-2.5 sm:p-3.5 rounded-xl bg-gradient-to-r from-sky-950 via-slate-900 to-indigo-950 border-2 border-sky-500/40 hover:border-sky-400 text-white font-bold transition-all hover:scale-[1.01] active:scale-95 cursor-pointer shadow-md shadow-sky-950/40"
          title="Єдиний центр усіх фінансових звітів"
        >
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="p-2 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                <span>Всі фінансові звіти</span>
                <span className="text-[9px] px-1.5 py-0.2 bg-sky-400/20 text-sky-300 rounded font-black border border-sky-400/30 uppercase tracking-wider">Єдине меню</span>
              </span>
              <span className="text-[10px] sm:text-[11px] text-slate-400 font-medium">
                Місячні звіти · Категорії · Борги та контрагенти · Рух рахунків
              </span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-sky-400 shrink-0" />
        </button>
      </div>
    </div>

      {/* 4. Undo Last Action Button */}
      {hasLastAction && (
        <button
          onClick={onUndo}
          className="w-full flex items-center justify-center gap-1.5 p-1.5 sm:p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/15 font-bold text-xs transition-all active:scale-95 animate-pulse mt-0"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span>Відмінити останній запис</span>
        </button>
      )}

      {(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const futureItems = allPlanned.filter((p: any) => {
          if (!p.date) return false;
          const parts = p.date.split("-");
          const pDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          pDate.setHours(0, 0, 0, 0);
          const diffDays = Math.ceil((pDate.getTime() - today.getTime()) / 86400000);
          return diffDays > 1; // It is in the future
        }).sort((a: any, b: any) => a.date.localeCompare(b.date));

        if (futureItems.length === 0 && !multiInterestStats.hasAny) return null;

        const getDaysRemainingLabel = (dateStr: string) => {
          const parts = dateStr.split("-");
          const pDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
          pDate.setHours(0, 0, 0, 0);
          const diffTime = pDate.getTime() - today.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          if (diffDays === 0) return "сьогодні";
          if (diffDays === 1) return "завтра";
          if (diffDays === 2) return "післязавтра";
          
          const lastDigit = diffDays % 10;
          const lastTwoDigits = diffDays % 100;
          if (lastDigit === 1 && lastTwoDigits !== 11) {
            return `через ${diffDays} день`;
          }
          if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 10 || lastTwoDigits >= 20)) {
            return `через ${diffDays} дні`;
          }
          return `через ${diffDays} днів`;
        };

        if (!multiInterestStats.hasAny) return null;

        return (
          <div className="flex flex-col gap-0.5 mt-0 text-left">
            <div className="p-1.5 sm:p-2 rounded-xl border border-slate-800 bg-slate-900/80 text-left flex flex-col gap-1 shadow-md backdrop-blur-sm">
              {/* Header */}
              <div className="flex items-center justify-between pb-0.5 border-b border-slate-800/60">
                <span className="text-[10px] sm:text-[11px] font-black text-slate-300 flex items-center gap-1 uppercase tracking-wider">
                  📈 Нараховані відсотки
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-black border transition-all ${
                    multiInterestStats.totalNetBase >= 0
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  }`}
                  title="Сумарний чистий дохід по відсотках у базовій валюті"
                >
                  Всього: {multiInterestStats.totalNetBase >= 0 ? "+" : ""}
                  {multiInterestStats.totalNetBase.toFixed(2)}{getCurrencySymbol(summaryBase)}
                </span>
              </div>

              {/* Currency Blocks */}
              <div className="flex flex-col gap-1">
                {Object.entries(multiInterestStats.currencies)
                  .filter(([_, data]) => data.hasAny)
                  .map(([curr, data]) => {
                    const isExpanded = !!expandedCurrencies[curr];
                    const toggleExpand = (e: React.MouseEvent) => {
                      e.stopPropagation();
                      setExpandedCurrencies((prev) => ({
                        ...prev,
                        [curr]: !prev[curr],
                      }));
                    };

                    return (
                      <div
                        key={curr}
                        className="flex flex-col bg-slate-950/60 p-1 sm:p-1.5 rounded-lg border border-slate-800/60 text-left transition-all"
                      >
                        {/* Currency Header Bar */}
                        <div className="flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onChangeCurrency) {
                                onChangeCurrency(curr as any);
                              }
                              onNavigate("planned");
                            }}
                            className="font-extrabold text-[10px] sm:text-[11px] text-slate-200 px-2 py-0.5 rounded-md bg-slate-800/80 hover:bg-slate-700 hover:text-white transition-all shrink-0 flex items-center gap-1 cursor-pointer active:scale-95 border border-slate-700/50"
                            title="Перейти до планування для цієї валюти"
                          >
                            <span>{getCurrencyFlag(curr)}</span>
                            <span>{curr}</span>
                          </button>

                          <div
                            onClick={toggleExpand}
                            className="flex items-center gap-1.5 sm:gap-2 text-right cursor-pointer select-none grow justify-end hover:opacity-85"
                            title={isExpanded ? "Згорнути деталі" : "Розгорнути деталі"}
                          >
                            <div className="flex items-center gap-1.5">
                              {data.give > 0 && (
                                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold text-[10px] sm:text-[11px]">
                                  +{data.give.toFixed(2)}{getCurrencySymbol(curr)}
                                </span>
                              )}
                              {data.take > 0 && (
                                <span className="px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 font-extrabold text-[10px] sm:text-[11px]">
                                  -{data.take.toFixed(2)}{getCurrencySymbol(curr)}
                                </span>
                              )}
                            </div>
                            <div className="p-0.5 rounded bg-slate-800/50 text-sky-400 hover:bg-slate-800 transition-colors">
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </div>
                          </div>
                        </div>

                        {/* Items detail list */}
                        {isExpanded && (
                          <div className="flex flex-col gap-1 mt-1 pt-1 border-t border-slate-800/50">
                            {allPlanned
                              .filter((it: any) => it.isInterest && it.currency === curr)
                              .map((it: any, subIdx: number) => {
                                const todayD = new Date();
                                const todayStr =
                                  todayD.getFullYear() +
                                  "-" +
                                  String(todayD.getMonth() + 1).padStart(2, "0") +
                                  "-" +
                                  String(todayD.getDate()).padStart(2, "0");
                                const rate = Number(it.interestRate) || 0;
                                const baseSum = Number(it.sum) || 0;
                                const { accrued: newAccrued, elapsedDays, elapsedMonths } = calculateAccruedInterest(
                                  baseSum,
                                  rate,
                                  it.interestPeriod,
                                  it.interestStartDate || it.date,
                                  todayStr
                                );
                                const accrued = Number(((it.accumulatedInterest || 0) + newAccrued).toFixed(2));
                                const remainingLabel = getDaysRemainingLabel(it.date);
                                const isGive = it.interestMode === "give";

                                return (
                                  <div
                                    key={it.id || subIdx}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (onChangeCurrency) {
                                        onChangeCurrency(curr as any);
                                      }
                                      if (onHighlightPlanned) {
                                        onHighlightPlanned(it.id);
                                      }
                                      onNavigate("planned");
                                    }}
                                    className="flex items-center justify-between p-1.5 sm:p-2 rounded-lg bg-slate-900/70 hover:bg-slate-900 border border-slate-800/70 hover:border-slate-700 transition-all text-[10px] sm:text-[11px] cursor-pointer active:scale-99"
                                  >
                                    <div className="flex flex-col gap-0.5 truncate max-w-[62%] text-left">
                                      <span className="font-extrabold text-slate-100 truncate text-[11px] sm:text-xs">{it.name}</span>
                                      <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-slate-400 font-medium">
                                        <span>
                                          {baseSum.toFixed(2)}{getCurrencySymbol(curr)} під {rate}%
                                        </span>
                                        <span>•</span>
                                        <span className="text-sky-400 font-semibold">{remainingLabel}</span>
                                      </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end shrink-0">
                                      <span className={`font-black text-[11px] sm:text-xs ${isGive ? "text-emerald-400" : "text-rose-400"}`}>
                                        {isGive ? "+" : "-"}
                                        {accrued.toFixed(2)}{getCurrencySymbol(curr)}
                                      </span>
                                      <span className="text-[9px] text-slate-500 font-bold">
                                        за {elapsedDays} {getDaysUkrWord(elapsedDays)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* SNAPSHOT MODAL */}
      {isSnapshotModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl flex flex-col gap-4 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-extrabold flex items-center gap-2 text-sky-400">
                <Camera className="w-5 h-5 text-sky-400" />
                Зафіксувати капітал
              </h3>
              <button
                type="button"
                onClick={closeSnapshotModal}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              {/* Quick Presets for Snapshot Date */}
              <div className="flex flex-col gap-1.5">
                <span className="text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                  Швидкий вибір дати:
                </span>
                <div className="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                      setSnapshotDateTime(localIso);
                      if (!snapshotName) setSnapshotName("Поточна контрольна точка");
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-[11px] border border-slate-700 cursor-pointer"
                  >
                    📍 Зараз
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const endPrev = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 0);
                      const localIso = new Date(endPrev.getTime() - endPrev.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                      setSnapshotDateTime(localIso);
                      if (!snapshotName) setSnapshotName("Кінець минулого місяця");
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-[11px] border border-slate-700 cursor-pointer"
                  >
                    🗓️ Кінець минал. місяця
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const startCur = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
                      const localIso = new Date(startCur.getTime() - startCur.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                      setSnapshotDateTime(localIso);
                      if (!snapshotName) setSnapshotName("1-ше число місяця");
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-[11px] border border-slate-700 cursor-pointer"
                  >
                    1️⃣ 1-ше число
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      const startYr = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
                      const localIso = new Date(startYr.getTime() - startYr.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                      setSnapshotDateTime(localIso);
                      if (!snapshotName) setSnapshotName(`Початок ${now.getFullYear()} року`);
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-300 font-bold text-[11px] border border-slate-700 cursor-pointer"
                  >
                    🎆 Початок року
                  </button>
                </div>
              </div>

              {/* Date Time Picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  Дата та час фіксації:
                </label>
                <input
                  type="datetime-local"
                  value={snapshotDateTime}
                  max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  onChange={(e) => setSnapshotDateTime(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:border-sky-500 w-full"
                />
              </div>

              {/* Snapshot Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-slate-300 font-bold flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 text-sky-400" />
                  Назва / Примітка знімку (необов'язково):
                </label>
                <input
                  type="text"
                  placeholder="Напр., Контрольна точка, До покупки"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:border-sky-500 w-full"
                />
              </div>

              {/* Calculated Capital Preview */}
              {(() => {
                const targetMs = snapshotDateTime ? new Date(snapshotDateTime).getTime() : Date.now();
                const targetCap = calculateCapitalAtMs(targetMs);
                const previewGlobal = convertAmount(targetCap.UAH, "UAH", summaryBase) +
                                      convertAmount(targetCap.USD, "USD", summaryBase) +
                                      convertAmount(targetCap.EUR, "EUR", summaryBase);

                const pad = (n: number) => String(n).padStart(2, "0");
                const dObj = new Date(targetMs);
                const formattedDate = `${pad(dObj.getDate())}.${pad(dObj.getMonth() + 1)}.${dObj.getFullYear()} ${pad(dObj.getHours())}:${pad(dObj.getMinutes())}`;

                return (
                  <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col gap-2 mt-1">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      📊 Капітал станом на {formattedDate}:
                    </span>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">🇺🇦 UAH</span>
                        <span className="font-extrabold text-xs text-white">{targetCap.UAH.toFixed(2)} ₴</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">🇺🇸 USD</span>
                        <span className="font-extrabold text-xs text-white">{targetCap.USD.toFixed(2)} $</span>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                        <span className="text-[10px] text-slate-400 block">🇪🇺 EUR</span>
                        <span className="font-extrabold text-xs text-white">{targetCap.EUR.toFixed(2)} €</span>
                      </div>
                    </div>
                    <div className="text-right pt-1 border-t border-slate-800/80 text-xs font-bold text-sky-400">
                      Загалом: {previewGlobal.toFixed(2)} {getCurrencySymbol(summaryBase)}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => handleSaveSnapshot(targetCap, targetMs)}
                        className="flex-1 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold py-2.5 px-4 rounded-xl shadow-lg shadow-sky-500/20 text-xs flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                      >
                        <Camera className="w-4 h-4" /> Зберегти знімок
                      </button>
                      <button
                        type="button"
                        onClick={closeSnapshotModal}
                        className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
                      >
                        Скасувати
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {/* DAY-BY-DAY CURRENCY COMPARISON MODAL */}
      {isCompareCurrencyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 text-white max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  <ArrowLeftRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    Порівняння валют по днях (UAH • USD • EUR)
                  </h3>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Зміна по доходах, витратах та зміні валюти за кожен день
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeCompareCurrencyModal}
                className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800/60 hover:bg-slate-800 transition-colors cursor-pointer"
                title="Закрити вікно"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Calculations Engine for Day-by-Day Currency Comparison */}
            {(() => {
              const now = new Date();
              const pad = (n: number) => String(n).padStart(2, "0");
              const todayISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

              let startDateISO = "";
              let endDateISO = todayISO;
              let periodLabel = "Останні 7 днів";

              if (comparePeriod === "yesterday") {
                const y = new Date(now);
                y.setDate(y.getDate() - 1);
                startDateISO = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
                endDateISO = startDateISO;
                periodLabel = "Вчора";
              } else if (comparePeriod === "7days") {
                const d = new Date(now);
                d.setDate(d.getDate() - 6);
                startDateISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                periodLabel = "Останні 7 днів";
              } else if (comparePeriod === "14days") {
                const d = new Date(now);
                d.setDate(d.getDate() - 13);
                startDateISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                periodLabel = "Останні 14 днів";
              } else if (comparePeriod === "30days") {
                const d = new Date(now);
                d.setDate(d.getDate() - 29);
                startDateISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                periodLabel = "Останні 30 днів";
              } else if (comparePeriod === "this_month") {
                startDateISO = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
                periodLabel = "Поточний місяць";
              } else if (comparePeriod === "prev_month") {
                const prevM = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const lastDayPrevM = new Date(now.getFullYear(), now.getMonth(), 0);
                startDateISO = `${prevM.getFullYear()}-${pad(prevM.getMonth() + 1)}-01`;
                endDateISO = `${lastDayPrevM.getFullYear()}-${pad(lastDayPrevM.getMonth() + 1)}-${pad(lastDayPrevM.getDate())}`;
                periodLabel = "Минулий місяць";
              } else if (comparePeriod === "custom" && customCompareStart) {
                startDateISO = customCompareStart;
                endDateISO = customCompareEnd || todayISO;
                periodLabel = `${startDateISO} — ${endDateISO}`;
              } else if (comparePeriod === "all") {
                startDateISO = "";
                endDateISO = "";
                periodLabel = "За весь час";
              }

              const curUah = initData?.globalTotals?.UAH ?? (currentCurrency === "UAH" ? (initData?.capital?.total || 0) : 0);
              const curUsd = initData?.globalTotals?.USD ?? (currentCurrency === "USD" ? (initData?.capital?.total || 0) : 0);
              const curEur = initData?.globalTotals?.EUR ?? (currentCurrency === "EUR" ? (initData?.capital?.total || 0) : 0);

              const getGroupDay = (g: HistoryGroup): string => {
                if (g.timestamp && g.timestamp > 1000000000000) {
                  const d = new Date(g.timestamp);
                  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                }
                if (g.dateStr) {
                  const m = g.dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
                  if (m) {
                    let yr = m[3];
                    if (yr.length === 2) yr = "20" + yr;
                    return `${yr}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
                  }
                }
                return "";
              };

              // 1. Gather all daily deltas across the entire ledger to accurately track balance transitions
              const allDayDeltas = new Map<string, { uah: number; usd: number; eur: number }>();
              const dayMap = new Map<string, {
                dayISO: string;
                byCurr: Record<"UAH" | "USD" | "EUR", { inc: number; exp: number; net: number; count: number }>;
                exchangeNet: Record<"UAH" | "USD" | "EUR", number>;
                exchanges: Array<{ text: string; outCur: "UAH" | "USD" | "EUR"; outAmt: number; inCur: "UAH" | "USD" | "EUR"; inAmt: number; rate: number }>;
                groups: HistoryGroup[];
              }>();

              (historyGroups || []).forEach(g => {
                const dayISO = getGroupDay(g);
                if (!dayISO) return;

                if (!allDayDeltas.has(dayISO)) {
                  allDayDeltas.set(dayISO, { uah: 0, usd: 0, eur: 0 });
                }
                const dayDelta = allDayDeltas.get(dayISO)!;

                const inPeriod = (!startDateISO || dayISO >= startDateISO) && (!endDateISO || dayISO <= endDateISO);

                if (inPeriod && !dayMap.has(dayISO)) {
                  dayMap.set(dayISO, {
                    dayISO,
                    byCurr: {
                      UAH: { inc: 0, exp: 0, net: 0, count: 0 },
                      USD: { inc: 0, exp: 0, net: 0, count: 0 },
                      EUR: { inc: 0, exp: 0, net: 0, count: 0 }
                    },
                    exchangeNet: { UAH: 0, USD: 0, EUR: 0 },
                    exchanges: [],
                    groups: []
                  });
                }

                const dayObj = inPeriod ? dayMap.get(dayISO)! : null;
                if (dayObj) dayObj.groups.push(g);

                const effItems = getGroupEffectiveItems(g);
                const isExc = g.operation === "Обмін" || g.operation?.includes("Обмін") || effItems.some(it => it.operation === "Обмін" || it.text?.includes("Обмін"));

                if (isExc) {
                  const outIt = effItems.find(it => it.sum < -0.001 || it.text?.includes("Віддано"));
                  const inIt = effItems.find(it => it.sum > 0.001 || it.text?.includes("Отримано"));
                  if (outIt && inIt) {
                    const outAmt = Math.abs(outIt.sum);
                    const inAmt = Math.abs(inIt.sum);
                    const outCur = outIt.curr as "UAH" | "USD" | "EUR";
                    const inCur = inIt.curr as "UAH" | "USD" | "EUR";
                    const rate = outAmt > 0 && inAmt > 0 ? (outCur === "USD" || outCur === "EUR" ? inAmt / outAmt : outAmt / inAmt) : 0;

                    dayDelta[outCur.toLowerCase() as "uah" | "usd" | "eur"] -= outAmt;
                    dayDelta[inCur.toLowerCase() as "uah" | "usd" | "eur"] += inAmt;

                    if (dayObj) {
                      dayObj.exchangeNet[outCur] -= outAmt;
                      dayObj.exchangeNet[inCur] += inAmt;
                      dayObj.exchanges.push({
                        text: g.operation || "Обмін валют",
                        outCur,
                        outAmt,
                        inCur,
                        inAmt,
                        rate
                      });
                    }
                  }
                } else {
                  effItems.forEach(it => {
                    const sum = Math.abs(Number(it.sum) || 0);
                    if (sum < 0.001) return;
                    const itCur = it.curr;
                    const isInc = it.isIncome !== undefined ? it.isIncome : g.isIncome;
                    const delta = isInc ? sum : -sum;

                    dayDelta[itCur.toLowerCase() as "uah" | "usd" | "eur"] += delta;

                    if (dayObj) {
                      if (isInc) {
                        dayObj.byCurr[itCur].inc += sum;
                      } else {
                        dayObj.byCurr[itCur].exp += sum;
                      }
                      dayObj.byCurr[itCur].net = dayObj.byCurr[itCur].inc - dayObj.byCurr[itCur].exp;
                      dayObj.byCurr[itCur].count += 1;
                    }
                  });
                }
              });

              // 2. Track exact daily opening and closing capital balances
              const allDaysSortedDesc = Array.from(allDayDeltas.keys()).sort((a, b) => b.localeCompare(a));
              const dayBalances = new Map<string, {
                start: { UAH: number; USD: number; EUR: number };
                end: { UAH: number; USD: number; EUR: number };
              }>();

              let runUah = curUah;
              let runUsd = curUsd;
              let runEur = curEur;

              allDaysSortedDesc.forEach(dISO => {
                const delta = allDayDeltas.get(dISO) || { uah: 0, usd: 0, eur: 0 };
                const endBal = { UAH: runUah, USD: runUsd, EUR: runEur };
                const startBal = { UAH: runUah - delta.uah, USD: runUsd - delta.usd, EUR: runEur - delta.eur };
                dayBalances.set(dISO, { start: startBal, end: endBal });
                runUah = startBal.UAH;
                runUsd = startBal.USD;
                runEur = startBal.EUR;
              });

              // 3. Process period days from oldest to newest with exact mathematical decomposition
              const sortedDaysOldestToNewest = Array.from(dayMap.values()).sort((a, b) => a.dayISO.localeCompare(b.dayISO));
              const dailyRates = getDailyRatesMap();

              const enrichedDays = sortedDaysOldestToNewest.map((day, idx) => {
                const prevDay = idx > 0 ? sortedDaysOldestToNewest[idx - 1] : null;

                const dRates = dailyRates[day.dayISO] || { usd: globalRateUsd || 41.5, eur: globalRateEur || 45.0 };
                const rateUsd = dRates.usd || globalRateUsd || 41.5;
                const rateEur = dRates.eur || globalRateEur || 45.0;

                const prevRates = prevDay ? (dailyRates[prevDay.dayISO] || { usd: rateUsd, eur: rateEur }) : null;
                const prevRateUsd = prevRates?.usd || rateUsd;
                const prevRateEur = prevRates?.eur || rateEur;

                const rateUsdDiff = prevRates ? rateUsd - prevRateUsd : 0;
                const rateEurDiff = prevRates ? rateEur - prevRateEur : 0;

                const bal = dayBalances.get(day.dayISO) || {
                  start: { UAH: curUah, USD: curUsd, EUR: curEur },
                  end: { UAH: curUah, USD: curUsd, EUR: curEur }
                };

                // A. Pure operational cash flow (Рух коштів від доходів та витрат)
                const opsNetUAH = day.byCurr.UAH.net;
                const opsNetUSD = day.byCurr.USD.net;
                const opsNetEUR = day.byCurr.EUR.net;
                const opsEquivUAH = opsNetUAH + (opsNetUSD * rateUsd) + (opsNetEUR * rateEur);

                // B. FX revaluation change (Курсова різниця на валютні залишки)
                const fxDiffUSD = bal.start.USD * rateUsdDiff;
                const fxDiffEUR = bal.start.EUR * rateEurDiff;
                const fxDiffEquivUAH = fxDiffUSD + fxDiffEUR;

                // C. Currency exchange difference from official rate (spread / margin)
                const exchNetUAH = day.exchangeNet.UAH;
                const exchNetUSD = day.exchangeNet.USD;
                const exchNetEUR = day.exchangeNet.EUR;
                const exchSpreadEquivUAH = exchNetUAH + (exchNetUSD * rateUsd) + (exchNetEUR * rateEur);

                // D. Total day change = Operations + FX change + Exchange spread
                const totalDayEquivUAH = opsEquivUAH + fxDiffEquivUAH + exchSpreadEquivUAH;

                const parts = day.dayISO.split("-").map(Number);
                const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                const daysOfWeek = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
                const dayOfWeek = daysOfWeek[dateObj.getDay()];
                const months = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
                const fullDateStr = `${parts[2]} ${months[parts[1] - 1]} ${parts[0]}`;

                const todayObj = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const diffD = Math.round((todayObj.getTime() - dateObj.getTime()) / (1000 * 60 * 60 * 24));
                let relativeLabel = "";
                if (diffD === 0) relativeLabel = "Сьогодні";
                else if (diffD === 1) relativeLabel = "Вчора";

                return {
                  ...day,
                  header: { fullDateStr, dayOfWeek, relativeLabel },
                  bal,
                  rateUsd,
                  rateEur,
                  prevRateUsd,
                  prevRateEur,
                  rateUsdDiff,
                  rateEurDiff,
                  opsNetUAH,
                  opsNetUSD,
                  opsNetEUR,
                  opsEquivUAH,
                  fxDiffUSD,
                  fxDiffEUR,
                  fxDiffEquivUAH,
                  exchSpreadEquivUAH,
                  totalDayEquivUAH,
                  hasPrev: prevDay !== null
                };
              });

              // 4. Period Totals Aggregator
              const periodTotals = {
                UAH: { inc: 0, exp: 0, net: 0, count: 0 },
                USD: { inc: 0, exp: 0, net: 0, count: 0 },
                EUR: { inc: 0, exp: 0, net: 0, count: 0 },
                opsEquivUAH: 0,
                fxEquivUAH: 0,
                fxUSD: 0,
                fxEUR: 0,
                exchSpreadEquivUAH: 0,
                totalChangeUAH: 0,
                exchangesCount: 0,
                startRateUsd: enrichedDays[0]?.rateUsd || globalRateUsd || 41.5,
                endRateUsd: enrichedDays[enrichedDays.length - 1]?.rateUsd || globalRateUsd || 41.5,
                startRateEur: enrichedDays[0]?.rateEur || globalRateEur || 45.0,
                endRateEur: enrichedDays[enrichedDays.length - 1]?.rateEur || globalRateEur || 45.0,
                startBal: enrichedDays[0]?.bal.start || { UAH: curUah, USD: curUsd, EUR: curEur },
                endBal: enrichedDays[enrichedDays.length - 1]?.bal.end || { UAH: curUah, USD: curUsd, EUR: curEur }
              };

              enrichedDays.forEach(d => {
                (["UAH", "USD", "EUR"] as const).forEach(c => {
                  periodTotals[c].inc += d.byCurr[c].inc;
                  periodTotals[c].exp += d.byCurr[c].exp;
                  periodTotals[c].net += d.byCurr[c].net;
                  periodTotals[c].count += d.byCurr[c].count;
                });
                periodTotals.opsEquivUAH += d.opsEquivUAH;
                periodTotals.fxEquivUAH += d.fxDiffEquivUAH;
                periodTotals.fxUSD += d.fxDiffUSD;
                periodTotals.fxEUR += d.fxDiffEUR;
                periodTotals.exchSpreadEquivUAH += d.exchSpreadEquivUAH;
                periodTotals.totalChangeUAH += d.totalDayEquivUAH;
                periodTotals.exchangesCount += d.exchanges.length;
              });

              const diffUsdTotal = periodTotals.endRateUsd - periodTotals.startRateUsd;
              const diffEurTotal = periodTotals.endRateEur - periodTotals.startRateEur;

              const displayDays = [...enrichedDays].reverse();

              const handleCopyDayReport = () => {
                const lines = [
                  `📅 Порівняння валют по днях (${periodLabel}):`,
                  `-----------------------------------`,
                  `📊 Підсумок за період:`,
                  `• Загальна зміна капіталу: ${periodTotals.totalChangeUAH >= 0 ? "+" : ""}${periodTotals.totalChangeUAH.toFixed(2)} ₴`,
                  `• 💸 Зміна від операцій (Рух коштів): ${periodTotals.opsEquivUAH >= 0 ? "+" : ""}${periodTotals.opsEquivUAH.toFixed(2)} ₴`,
                  `  - UAH: +${periodTotals.UAH.inc.toFixed(2)} ₴ | -${periodTotals.UAH.exp.toFixed(2)} ₴ | = ${periodTotals.UAH.net >= 0 ? "+" : ""}${periodTotals.UAH.net.toFixed(2)} ₴`,
                  `  - USD: +${periodTotals.USD.inc.toFixed(2)} $ | -${periodTotals.USD.exp.toFixed(2)} $ | = ${periodTotals.USD.net >= 0 ? "+" : ""}${periodTotals.USD.net.toFixed(2)} $`,
                  `  - EUR: +${periodTotals.EUR.inc.toFixed(2)} € | -${periodTotals.EUR.exp.toFixed(2)} € | = ${periodTotals.EUR.net >= 0 ? "+" : ""}${periodTotals.EUR.net.toFixed(2)} €`,
                  `• 💱 Зміна від зміни курсів (Курсова різниця): ${periodTotals.fxEquivUAH >= 0 ? "+" : ""}${periodTotals.fxEquivUAH.toFixed(2)} ₴`,
                  `  - USD: курс ${periodTotals.startRateUsd.toFixed(2)} ➔ ${periodTotals.endRateUsd.toFixed(2)} ₴ (${diffUsdTotal >= 0 ? "+" : ""}${diffUsdTotal.toFixed(2)} ₴) • Вплив: ${periodTotals.fxUSD >= 0 ? "+" : ""}${periodTotals.fxUSD.toFixed(2)} ₴`,
                  `  - EUR: курс ${periodTotals.startRateEur.toFixed(2)} ➔ ${periodTotals.endRateEur.toFixed(2)} ₴ (${diffEurTotal >= 0 ? "+" : ""}${diffEurTotal.toFixed(2)} ₴) • Вплив: ${periodTotals.fxEUR >= 0 ? "+" : ""}${periodTotals.fxEUR.toFixed(2)} ₴`,
                  periodTotals.exchangesCount > 0 ? `• 🔄 Обмінів валют: ${periodTotals.exchangesCount} операцій` : "",
                  `-----------------------------------`,
                  `📆 Деталізація по днях:`,
                  ...displayDays.map(d => {
                    const exStr = d.exchanges.map(e => `    🔄 Обмін: ${e.outAmt.toFixed(2)} ${e.outCur} ➔ ${e.inAmt.toFixed(2)} ${e.inCur} (курс ~${e.rate.toFixed(2)})`).join("\n");
                    return [
                      `[${d.header.fullDateStr} (${d.header.dayOfWeek})] За день: ${d.totalDayEquivUAH >= 0 ? "+" : ""}${d.totalDayEquivUAH.toFixed(2)} ₴`,
                      `  💸 Від операцій: ${d.opsEquivUAH >= 0 ? "+" : ""}${d.opsEquivUAH.toFixed(2)} ₴ (UAH: ${d.opsNetUAH >= 0 ? "+" : ""}${d.opsNetUAH.toFixed(2)} ₴ | USD: ${d.opsNetUSD >= 0 ? "+" : ""}${d.opsNetUSD.toFixed(2)} $ | EUR: ${d.opsNetEUR >= 0 ? "+" : ""}${d.opsNetEUR.toFixed(2)} €)`,
                      `  💱 Від курсів: ${d.fxDiffEquivUAH >= 0 ? "+" : ""}${d.fxDiffEquivUAH.toFixed(2)} ₴ (USD: $ ${d.rateUsd.toFixed(2)} [${d.rateUsdDiff >= 0 ? "+" : ""}${d.rateUsdDiff.toFixed(2)}] | EUR: € ${d.rateEur.toFixed(2)} [${d.rateEurDiff >= 0 ? "+" : ""}${d.rateEurDiff.toFixed(2)}])`,
                      exStr
                    ].filter(Boolean).join("\n");
                  })
                ].filter(Boolean);

                navigator.clipboard.writeText(lines.join("\n")).then(() => {
                  setIsCopiedSummary(true);
                  setTimeout(() => setIsCopiedSummary(false), 2000);
                }).catch(() => {});
              };

              return (
                <div className="flex flex-col gap-3.5 animate-fadeIn">
                  {/* 1. Period Selector & Filters */}
                  <div className="flex flex-col gap-2 p-3 rounded-2xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-400">
                      <span className="flex items-center gap-1.5 text-white font-extrabold">
                        <Calendar className="w-3.5 h-3.5 text-sky-400" />
                        <span>Період порівняння:</span>
                      </span>
                      <span className="text-[11px] text-sky-300 font-mono font-bold bg-sky-950/70 px-2 py-0.5 rounded-lg border border-sky-500/30">
                        {periodLabel} ({displayDays.length} {displayDays.length === 1 ? "день" : displayDays.length < 5 ? "дні" : "днів"})
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {[
                        { id: "yesterday", label: "Вчора" },
                        { id: "7days", label: "7 днів" },
                        { id: "14days", label: "14 днів" },
                        { id: "30days", label: "30 днів" },
                        { id: "this_month", label: "Цей місяць" },
                        { id: "prev_month", label: "Минулий місяць" },
                        { id: "all", label: "Всі дні" },
                        { id: "custom", label: "📅 Своя дата" }
                      ].map((p) => {
                        const isActive = comparePeriod === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setComparePeriod(p.id);
                              if (p.id === "custom" && !customCompareStart) {
                                const d = new Date();
                                d.setDate(d.getDate() - 14);
                                setCustomCompareStart(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
                                setCustomCompareEnd(todayISO);
                              }
                            }}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                              isActive
                                ? "bg-sky-500 text-slate-950 border-sky-400 font-black shadow-sm"
                                : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-850 hover:text-white"
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>

                    {comparePeriod === "custom" && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                        <span className="text-slate-400 font-bold">З:</span>
                        <input
                          type="date"
                          value={customCompareStart}
                          max={todayISO}
                          onChange={(e) => setCustomCompareStart(e.target.value)}
                          className="bg-slate-900 border border-slate-700 text-sky-300 rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-sky-400 [color-scheme:dark]"
                        />
                        <span className="text-slate-400 font-bold">По:</span>
                        <input
                          type="date"
                          value={customCompareEnd || todayISO}
                          max={todayISO}
                          onChange={(e) => setCustomCompareEnd(e.target.value)}
                          className="bg-slate-900 border border-slate-700 text-sky-300 rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-sky-400 [color-scheme:dark]"
                        />
                      </div>
                    )}

                    {/* Currency filter toggle */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-900 gap-2 flex-wrap">
                      <span className="text-[11px] font-bold text-slate-400">
                        Фільтр валюти для деталізації:
                      </span>
                      <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                        {[
                          { id: "ALL", label: "Всі валюти разом" },
                          { id: "UAH", label: "🇺🇦 UAH" },
                          { id: "USD", label: "🇺🇸 USD" },
                          { id: "EUR", label: "🇪🇺 EUR" }
                        ].map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setCompareCurrencyFilter(c.id as any)}
                            className={`px-2 py-0.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                              compareCurrencyFilter === c.id
                                ? "bg-sky-500 text-slate-950 shadow-sm"
                                : "text-slate-400 hover:text-white"
                            }`}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 2. CRYSTAL-CLEAR MATHEMATICALLY PRECISE PERIOD SUMMARY CARD */}
                  <div className="p-4 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-sky-500/40 shadow-xl flex flex-col gap-3.5">
                    {/* Main Total Result Banner */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                          <span>📊</span>
                          <span>Загальна зміна капіталу за період ({periodLabel}):</span>
                        </div>
                        <div className="text-xl sm:text-2xl font-black font-mono mt-0.5 flex items-center gap-2">
                          <span className={periodTotals.totalChangeUAH >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {periodTotals.totalChangeUAH >= 0 ? "+" : ""}{periodTotals.totalChangeUAH.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                          </span>
                        </div>
                      </div>

                      <div className="text-right font-mono text-[11px] text-slate-400">
                        <div>Початок: <strong className="text-slate-200">{(periodTotals.startBal.UAH + periodTotals.startBal.USD * periodTotals.startRateUsd + periodTotals.startBal.EUR * periodTotals.startRateEur).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴</strong></div>
                        <div>Кінець: <strong className="text-white">{(periodTotals.endBal.UAH + periodTotals.endBal.USD * periodTotals.endRateUsd + periodTotals.endBal.EUR * periodTotals.endRateEur).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴</strong></div>
                      </div>
                    </div>

                    {/* TWO PRIMARY PILLARS: 1. OPERATIONS vs 2. CURRENCY RATE (FX) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Pillar 1: Зміна від операцій */}
                      <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/30 flex flex-col gap-2 shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-850 pb-1.5">
                          <span className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                            <span>💸</span>
                            <span>1. Зміна від операцій (Рух коштів)</span>
                          </span>
                          <span className={`font-mono text-sm font-black ${periodTotals.opsEquivUAH >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {periodTotals.opsEquivUAH >= 0 ? "+" : ""}{periodTotals.opsEquivUAH.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Чистий фінансовий результат від заробітків та витрат (без курсової переоцінки):
                        </p>
                        <div className="flex flex-col gap-1 text-[11px] font-mono">
                          <div className="flex justify-between items-center py-0.5 border-b border-slate-900">
                            <span className="font-sans text-slate-300 flex items-center gap-1">🇺🇦 Гривня (UAH):</span>
                            <span className={periodTotals.UAH.net >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                              {periodTotals.UAH.net >= 0 ? "+" : ""}{periodTotals.UAH.net.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-0.5 border-b border-slate-900">
                            <span className="font-sans text-slate-300 flex items-center gap-1">🇺🇸 Долар (USD):</span>
                            <span className="flex items-center gap-1">
                              <span className={periodTotals.USD.net >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                {periodTotals.USD.net >= 0 ? "+" : ""}{periodTotals.USD.net.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
                              </span>
                              <span className="text-[10px] text-slate-400 font-sans">
                                (≈ {(periodTotals.USD.net * periodTotals.endRateUsd) >= 0 ? "+" : ""}{(periodTotals.USD.net * periodTotals.endRateUsd).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴)
                              </span>
                            </span>
                          </div>
                          <div className="flex justify-between items-center py-0.5">
                            <span className="font-sans text-slate-300 flex items-center gap-1">🇪🇺 Євро (EUR):</span>
                            <span className="flex items-center gap-1">
                              <span className={periodTotals.EUR.net >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                                {periodTotals.EUR.net >= 0 ? "+" : ""}{periodTotals.EUR.net.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                              </span>
                              <span className="text-[10px] text-slate-400 font-sans">
                                (≈ {(periodTotals.EUR.net * periodTotals.endRateEur) >= 0 ? "+" : ""}{(periodTotals.EUR.net * periodTotals.endRateEur).toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴)
                              </span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Pillar 2: Зміна від зміни курсів */}
                      <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-amber-500/30 flex flex-col gap-2 shadow-sm">
                        <div className="flex items-center justify-between border-b border-slate-850 pb-1.5">
                          <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                            <span>💱</span>
                            <span>2. Зміна від зміни курсів (Курсова різниця)</span>
                          </span>
                          <span className={`font-mono text-sm font-black ${periodTotals.fxEquivUAH >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {periodTotals.fxEquivUAH >= 0 ? "+" : ""}{periodTotals.fxEquivUAH.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Прибуток/збиток від коливання ринкового курсу валют на ваші валютні активи:
                        </p>
                        <div className="flex flex-col gap-1.5 text-[11px] font-mono">
                          <div className="flex flex-col gap-0.5 py-0.5 border-b border-slate-900">
                            <div className="flex justify-between items-center">
                              <span className="font-sans text-slate-300 flex items-center gap-1">🇺🇸 Курс USD:</span>
                              <span className="text-slate-300">
                                {periodTotals.startRateUsd.toFixed(2)} ➔ <strong>{periodTotals.endRateUsd.toFixed(2)} ₴</strong>{" "}
                                <strong className={diffUsdTotal >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                  ({diffUsdTotal >= 0 ? "+" : ""}{diffUsdTotal.toFixed(2)} ₴)
                                </strong>
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="font-sans text-slate-400">Вплив на капітал у доларах:</span>
                              <span className={`font-bold ${periodTotals.fxUSD >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                                {periodTotals.fxUSD >= 0 ? "+" : ""}{periodTotals.fxUSD.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-0.5 py-0.5">
                            <div className="flex justify-between items-center">
                              <span className="font-sans text-slate-300 flex items-center gap-1">🇪🇺 Курс EUR:</span>
                              <span className="text-slate-300">
                                {periodTotals.startRateEur.toFixed(2)} ➔ <strong>{periodTotals.endRateEur.toFixed(2)} ₴</strong>{" "}
                                <strong className={diffEurTotal >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                  ({diffEurTotal >= 0 ? "+" : ""}{diffEurTotal.toFixed(2)} ₴)
                                </strong>
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="font-sans text-slate-400">Вплив на капітал у євро:</span>
                              <span className={`font-bold ${periodTotals.fxEUR >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                                {periodTotals.fxEUR >= 0 ? "+" : ""}{periodTotals.fxEUR.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Exact Mathematical Formula Verification Badge */}
                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2 font-mono">
                      <span className="font-sans font-bold text-sky-400 flex items-center gap-1">
                        <span>⚖️</span>
                        <span>Формула підсумку:</span>
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>
                          Операції: <strong className={periodTotals.opsEquivUAH >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {periodTotals.opsEquivUAH >= 0 ? "+" : ""}{periodTotals.opsEquivUAH.toFixed(2)} ₴
                          </strong>
                        </span>
                        <span className="text-slate-500">+</span>
                        <span>
                          Курси: <strong className={periodTotals.fxEquivUAH >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {periodTotals.fxEquivUAH >= 0 ? "+" : ""}{periodTotals.fxEquivUAH.toFixed(2)} ₴
                          </strong>
                        </span>
                        <span className="text-slate-500">=</span>
                        <span className="px-2 py-0.5 rounded-lg bg-sky-950 text-sky-300 border border-sky-500/30 font-black">
                          Разом: {periodTotals.totalChangeUAH >= 0 ? "+" : ""}{periodTotals.totalChangeUAH.toFixed(2)} ₴
                        </span>
                      </div>
                    </div>

                    {/* 3 Per-Currency Overview Pillars */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono pt-1">
                      {/* UAH */}
                      <div className={`p-2.5 rounded-xl border ${compareCurrencyFilter === "UAH" ? "bg-sky-950/30 border-sky-500/50 ring-1 ring-sky-500/40" : "bg-slate-950/80 border-slate-800"}`}>
                        <div className="flex items-center justify-between font-sans text-xs font-black text-white pb-1 border-b border-slate-850">
                          <span className="flex items-center gap-1">🇺🇦 Гривня (UAH)</span>
                          <span className="text-slate-400 text-[10.5px]">{periodTotals.UAH.count} оп.</span>
                        </div>
                        <div className="flex flex-col gap-1 pt-1.5 text-[11px]">
                          <div className="flex justify-between items-center text-emerald-400">
                            <span className="font-sans text-slate-400">Доходи (+):</span>
                            <span className="font-bold">+{periodTotals.UAH.inc.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</span>
                          </div>
                          <div className="flex justify-between items-center text-rose-400">
                            <span className="font-sans text-slate-400">Витрати (-):</span>
                            <span className="font-bold">-{periodTotals.UAH.exp.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-slate-850 font-black">
                            <span className="font-sans text-slate-300">Сальдо (=):</span>
                            <span className={periodTotals.UAH.net >= 0 ? "text-emerald-300" : "text-rose-300"}>
                              {periodTotals.UAH.net >= 0 ? "+" : ""}{periodTotals.UAH.net.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* USD */}
                      <div className={`p-2.5 rounded-xl border ${compareCurrencyFilter === "USD" ? "bg-sky-950/30 border-sky-500/50 ring-1 ring-sky-500/40" : "bg-slate-950/80 border-slate-800"}`}>
                        <div className="flex items-center justify-between font-sans text-xs font-black text-white pb-1 border-b border-slate-850">
                          <span className="flex items-center gap-1">🇺🇸 Долар (USD)</span>
                          <span className="text-slate-400 text-[10.5px]">{periodTotals.USD.count} оп.</span>
                        </div>
                        <div className="flex flex-col gap-1 pt-1.5 text-[11px]">
                          <div className="flex justify-between items-center text-emerald-400">
                            <span className="font-sans text-slate-400">Доходи (+):</span>
                            <span className="font-bold">+{periodTotals.USD.inc.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</span>
                          </div>
                          <div className="flex justify-between items-center text-rose-400">
                            <span className="font-sans text-slate-400">Витрати (-):</span>
                            <span className="font-bold">-{periodTotals.USD.exp.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-slate-850 font-black">
                            <span className="font-sans text-slate-300">Сальдо (=):</span>
                            <span className={periodTotals.USD.net >= 0 ? "text-emerald-300" : "text-rose-300"}>
                              {periodTotals.USD.net >= 0 ? "+" : ""}{periodTotals.USD.net.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* EUR */}
                      <div className={`p-2.5 rounded-xl border ${compareCurrencyFilter === "EUR" ? "bg-sky-950/30 border-sky-500/50 ring-1 ring-sky-500/40" : "bg-slate-950/80 border-slate-800"}`}>
                        <div className="flex items-center justify-between font-sans text-xs font-black text-white pb-1 border-b border-slate-850">
                          <span className="flex items-center gap-1">🇪🇺 Євро (EUR)</span>
                          <span className="text-slate-400 text-[10.5px]">{periodTotals.EUR.count} оп.</span>
                        </div>
                        <div className="flex flex-col gap-1 pt-1.5 text-[11px]">
                          <div className="flex justify-between items-center text-emerald-400">
                            <span className="font-sans text-slate-400">Доходи (+):</span>
                            <span className="font-bold">+{periodTotals.EUR.inc.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                          </div>
                          <div className="flex justify-between items-center text-rose-400">
                            <span className="font-sans text-slate-400">Витрати (-):</span>
                            <span className="font-bold">-{periodTotals.EUR.exp.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-slate-850 font-black">
                            <span className="font-sans text-slate-300">Сальдо (=):</span>
                            <span className={periodTotals.EUR.net >= 0 ? "text-emerald-300" : "text-rose-300"}>
                              {periodTotals.EUR.net >= 0 ? "+" : ""}{periodTotals.EUR.net.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. Day-by-Day Comparative Feed */}
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-sky-400" />
                        <span>Порівняння по днях ({displayDays.length} днів з операціями):</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const allOpen = displayDays.every(d => expandedCompareDays[d.dayISO]);
                          const next: Record<string, boolean> = {};
                          displayDays.forEach(d => { next[d.dayISO] = !allOpen; });
                          setExpandedCompareDays(next);
                        }}
                        className="text-[10.5px] font-bold text-sky-400 hover:text-sky-300 cursor-pointer"
                      >
                        {displayDays.every(d => expandedCompareDays[d.dayISO]) ? "Згорнути всі 🔼" : "Розгорнути всі 🔽"}
                      </button>
                    </div>

                    {displayDays.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 bg-slate-950/60 rounded-2xl border border-slate-800 text-xs">
                        За обраний період ({periodLabel}) операцій не зафіксовано.
                      </div>
                    ) : (
                      displayDays.map((d) => {
                        const isExpanded = !!expandedCompareDays[d.dayISO];

                        return (
                          <div
                            key={d.dayISO}
                            className="p-3 sm:p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-slate-750 transition-all flex flex-col gap-2.5 shadow-md"
                          >
                            {/* Day Header Row */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-850 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs sm:text-sm font-black text-white">
                                  {d.header.fullDateStr}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                  {d.header.dayOfWeek}
                                </span>
                                {d.header.relativeLabel && (
                                  <span className="text-[9.5px] font-extrabold text-sky-400 bg-sky-500/15 px-1.5 py-0.5 rounded border border-sky-500/30">
                                    {d.header.relativeLabel}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-black text-slate-300 bg-slate-900 px-2 py-0.5 rounded-lg border border-slate-800">
                                  За день: <strong className={d.totalDayEquivUAH >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                    {d.totalDayEquivUAH >= 0 ? "+" : ""}{d.totalDayEquivUAH.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                                  </strong>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setExpandedCompareDays(prev => ({ ...prev, [d.dayISO]: !prev[d.dayISO] }))}
                                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-850 cursor-pointer"
                                  title={isExpanded ? "Згорнути" : "Розгорнути операції дня"}
                                >
                                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* DUAL-DECOMPOSITION BANNER: Operations vs Exchange Rate on this Day */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                              {/* 1. Від операцій дня */}
                              <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                                <span className="text-slate-300 font-sans flex items-center gap-1 font-bold">
                                  <span className="text-emerald-400">💸</span>
                                  <span>Від операцій:</span>
                                </span>
                                <span className={`font-black ${d.opsEquivUAH >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                  {d.opsEquivUAH >= 0 ? "+" : ""}{d.opsEquivUAH.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                                </span>
                              </div>

                              {/* 2. Від зміни курсу дня */}
                              <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
                                <span className="text-slate-300 font-sans flex items-center gap-1 font-bold">
                                  <span className="text-amber-300">💱</span>
                                  <span>Від курсів:</span>
                                </span>
                                <div className="flex items-center gap-1.5 font-bold">
                                  <span className={d.fxDiffEquivUAH > 0.005 ? "text-emerald-400" : d.fxDiffEquivUAH < -0.005 ? "text-rose-400" : "text-slate-400"}>
                                    {d.fxDiffEquivUAH > 0.005 ? `+${d.fxDiffEquivUAH.toFixed(2)} ₴` : d.fxDiffEquivUAH < -0.005 ? `${d.fxDiffEquivUAH.toFixed(2)} ₴` : "без змін"}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-sans font-normal">
                                    ($ {d.rateUsd.toFixed(2)}{Math.abs(d.rateUsdDiff) > 0.001 ? ` [${d.rateUsdDiff >= 0 ? "+" : ""}${d.rateUsdDiff.toFixed(2)}]` : ""})
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* 3 Currency Columns for this day */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono">
                              {/* UAH day */}
                              {(compareCurrencyFilter === "ALL" || compareCurrencyFilter === "UAH") && (
                                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1">
                                  <div className="flex justify-between items-center font-sans font-black text-white text-[11px] pb-1 border-b border-slate-850">
                                    <span>🇺🇦 Гривня (UAH)</span>
                                    <span className={d.byCurr.UAH.net >= 0 ? "text-emerald-400 font-mono" : "text-rose-400 font-mono"}>
                                      {d.byCurr.UAH.net >= 0 ? "+" : ""}{d.byCurr.UAH.net.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-[10.5px] text-emerald-400">
                                    <span className="font-sans text-slate-400">Дохід:</span>
                                    <span className="font-bold">+{d.byCurr.UAH.inc.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</span>
                                  </div>
                                  <div className="flex justify-between items-center text-[10.5px] text-rose-400">
                                    <span className="font-sans text-slate-400">Витрата:</span>
                                    <span className="font-bold">-{d.byCurr.UAH.exp.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</span>
                                  </div>
                                </div>
                              )}

                              {/* USD day */}
                              {(compareCurrencyFilter === "ALL" || compareCurrencyFilter === "USD") && (
                                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1">
                                  <div className="flex justify-between items-center font-sans font-black text-white text-[11px] pb-1 border-b border-slate-850">
                                    <span>🇺🇸 Долар (USD)</span>
                                    <span className={d.byCurr.USD.net >= 0 ? "text-emerald-400 font-mono" : "text-rose-400 font-mono"}>
                                      {d.byCurr.USD.net >= 0 ? "+" : ""}{d.byCurr.USD.net.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-[10.5px] text-emerald-400">
                                    <span className="font-sans text-slate-400">Дохід:</span>
                                    <span className="font-bold">+{d.byCurr.USD.inc.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</span>
                                  </div>
                                  <div className="flex justify-between items-center text-[10.5px] text-rose-400">
                                    <span className="font-sans text-slate-400">Витрата:</span>
                                    <span className="font-bold">-{d.byCurr.USD.exp.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</span>
                                  </div>
                                </div>
                              )}

                              {/* EUR day */}
                              {(compareCurrencyFilter === "ALL" || compareCurrencyFilter === "EUR") && (
                                <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-1">
                                  <div className="flex justify-between items-center font-sans font-black text-white text-[11px] pb-1 border-b border-slate-850">
                                    <span>🇪🇺 Євро (EUR)</span>
                                    <span className={d.byCurr.EUR.net >= 0 ? "text-emerald-400 font-mono" : "text-rose-400 font-mono"}>
                                      {d.byCurr.EUR.net >= 0 ? "+" : ""}{d.byCurr.EUR.net.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                    </span>
                                  </div>
                                  <div className="flex justify-between items-center text-[10.5px] text-emerald-400">
                                    <span className="font-sans text-slate-400">Дохід:</span>
                                    <span className="font-bold">+{d.byCurr.EUR.inc.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                                  </div>
                                  <div className="flex justify-between items-center text-[10.5px] text-rose-400">
                                    <span className="font-sans text-slate-400">Витрата:</span>
                                    <span className="font-bold">-{d.byCurr.EUR.exp.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Currency Exchanges on this Day (Зміна валюти) */}
                            {d.exchanges.length > 0 && (
                              <div className="p-2.5 rounded-xl bg-blue-950/40 border border-blue-500/30 flex flex-col gap-1.5 text-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-blue-300 font-sans flex items-center gap-1">
                                  <span>🔄</span>
                                  <span>Зміна валюти / Обміни за цей день:</span>
                                </span>
                                <div className="flex flex-col gap-1 font-mono text-[11px]">
                                  {d.exchanges.map((exc, eIdx) => {
                                    const outSym = exc.outCur === "USD" ? "$" : exc.outCur === "EUR" ? "€" : "₴";
                                    const inSym = exc.inCur === "USD" ? "$" : exc.inCur === "EUR" ? "€" : "₴";
                                    return (
                                      <div key={eIdx} className="flex flex-wrap items-center justify-between text-blue-200 gap-1 bg-blue-950/60 px-2 py-1 rounded-lg border border-blue-500/20">
                                        <span>• {exc.text}:</span>
                                        <div className="flex items-center gap-1.5 font-bold">
                                          <strong className="text-white">
                                            {exc.outAmt.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {outSym} ➔ {exc.inAmt.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {inSym}
                                          </strong>
                                          {exc.rate > 0 && (
                                            <span className="text-[10px] text-blue-300 font-sans">
                                              (курс ~{exc.rate.toFixed(2)} ₴/{exc.outCur === "UAH" ? exc.inCur : exc.outCur})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Expanded transaction details */}
                            {isExpanded && (
                              <div className="pt-2 border-t border-slate-850 flex flex-col gap-1.5 text-xs animate-fadeIn">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  Операції за цей день ({d.groups.length}):
                                </span>
                                <div className="flex flex-col gap-1">
                                  {d.groups.map((g, gIdx) => {
                                    const isExcOp = g.operation === "Обмін" || g.operation?.includes("Обмін");
                                    const eff = getGroupEffectiveItems(g);
                                    const parsed = parseTransactionText(eff[0]?.fullText || eff[0]?.text);
                                    const cName = parsed.contractor || "";
                                    return (
                                      <div key={gIdx} className="flex items-center justify-between p-1.5 sm:p-2 rounded-lg bg-slate-900 border border-slate-800 text-[11px] gap-2">
                                        <span className="text-slate-300 truncate max-w-sm flex items-center gap-1">
                                          {cName && <span className="font-bold text-sky-300">👤 {cName} •</span>}
                                          <span>{g.operation}</span>
                                          {parsed.comment && <span className="text-slate-400 italic truncate">— {parsed.comment}</span>}
                                        </span>
                                        <div className="font-mono font-bold shrink-0 flex items-center gap-1">
                                          {eff.map((it, itIdx) => {
                                            const sym = it.curr === "USD" ? "$" : it.curr === "EUR" ? "€" : "₴";
                                            const sign = isExcOp ? "🔄" : (it.sum > 0 ? "+" : "-");
                                            const color = isExcOp ? "text-blue-400" : (it.sum > 0 ? "text-emerald-400" : "text-rose-400");
                                            return (
                                              <span key={itIdx} className={color}>
                                                {itIdx > 0 && <span className="text-slate-500 font-sans mx-0.5">•</span>}
                                                {sign}{Math.abs(it.sum).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sym}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Bottom Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 gap-2">
                    <button
                      type="button"
                      onClick={handleCopyDayReport}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                        isCopiedSummary
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750 hover:text-white"
                      }`}
                    >
                      {isCopiedSummary ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-slate-400" />}
                      <span>{isCopiedSummary ? "Скопійовано!" : "Скопіювати звіт"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={closeCompareCurrencyModal}
                      className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs transition-all active:scale-95 cursor-pointer shadow-md"
                    >
                      Закрити
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* COMBINED CAPITAL HINT MODAL */}
      {isCombinedCapitalHintOpen && (
        <div 
          onClick={() => setIsCombinedCapitalHintOpen(false)}
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
                  <Globe className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">
                    Зведений капітал ({summaryBase})
                  </h3>
                  <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider block mt-0.5">
                    Підказка до мультивалютного балансу
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCombinedCapitalHintOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Formula Block */}
            <div className="flex flex-col gap-1.5 p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 text-xs">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-sky-400" />
                Формула об'єднання всіх валют:
              </span>
              <div className="font-mono text-sky-300 font-bold bg-slate-900/90 p-2.5 rounded-xl border border-slate-800/80 text-[11px] leading-relaxed">
                {summaryBase === "UAH" && "Капітал ₴ = UAH + (USD × Курс USD) + (EUR × Курс EUR)"}
                {summaryBase === "USD" && "Капітал $ = USD + (UAH ÷ Курс USD) + (EUR × Курс EUR ÷ Курс USD)"}
                {summaryBase === "EUR" && "Капітал € = EUR + (UAH ÷ Курс EUR) + (USD × Курс USD ÷ Курс EUR)"}
              </div>

              {/* Real numbers breakdown */}
              {initData && (
                <div className="mt-2 pt-2 border-t border-slate-900 grid grid-cols-1 gap-1 text-[11px] text-slate-300 font-medium">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">🇺🇦 Гривня (UAH):</span>
                    <span className="font-mono font-bold text-white">
                      {(initData.globalTotals?.UAH ?? 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">🇺🇸 Долар (USD):</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {(initData.globalTotals?.USD ?? 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
                      <span className="text-[10px] text-slate-500 font-normal ml-1">
                        (курс {(globalRateUsd || 0).toFixed(2)} ₴)
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">🇪🇺 Євро (EUR):</span>
                    <span className="font-mono font-bold text-indigo-400">
                      {(initData.globalTotals?.EUR ?? 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                      <span className="text-[10px] text-slate-500 font-normal ml-1">
                        (курс {(globalRateEur || 0).toFixed(2)} ₴)
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80 font-black text-xs text-white">
                    <span>Разом у базі {summaryBase}:</span>
                    <span className="text-sky-400 font-mono text-sm">
                      {getCombinedCapitalDisplay()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Explanation & Rules */}
            <div className="space-y-2 text-xs text-slate-300 leading-relaxed bg-slate-950/40 p-3 rounded-2xl border border-slate-800/60">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                💡 Чому це важливо:
              </span>
              <p>
                • <strong>Перемикання валюти ({summaryBase}):</strong> дозволяє миттєво оцінити ваш сукупний капітал у стабільній валюті ($, €) або в гривні.
              </p>
              <p>
                • <strong>Ринкове правило:</strong> Додатні залишки оцінюються за курсом купівлі (за скільки ви можете їх здати), а боргові зобов'язання — за курсом продажу (за скільки доведеться купити валюту для віддачі боргу).
              </p>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setIsCombinedCapitalHintOpen(false);
                  onNavigate("global-capital");
                }}
                className="px-3.5 py-2 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-black text-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <span>Детальний розділ зведеного капіталу ➔</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCombinedCapitalHintOpen(false)}
                className="px-5 py-2 rounded-xl bg-sky-500 text-slate-950 font-black text-xs hover:bg-sky-400 transition-all active:scale-95 cursor-pointer shadow-md shadow-sky-500/20 ml-auto"
              >
                Зрозуміло
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AVAILABLE RESOURCES MODAL */}
      <AvailableResourcesModal
        isOpen={isAvailableResourcesOpen}
        onClose={closeAvailableResourcesModal}
        initData={initData}
        currentCurrency={currentCurrency}
        summaryBase={summaryBase}
        onToggleSummaryBase={onToggleSummaryBase}
        globalRateUsd={globalRateUsd}
        globalRateEur={globalRateEur}
        globalRateUsdSell={globalRateUsdSell}
        globalRateEurSell={globalRateEurSell}
        onChangeCurrency={onChangeCurrency}
        onNavigate={onNavigate}
      />

      {/* FULL SCREEN CHART MODAL OVERLAY */}
      {fullScreenChart && (
        <div className="fixed inset-0 z-50 bg-slate-950/98 backdrop-blur-xl text-white p-4 sm:p-6 flex flex-col justify-between overflow-hidden animate-in fade-in duration-200">
          {/* Modal Header */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                {fullScreenChart === "capital30" && <TrendingUp className="w-5 h-5" />}
                {fullScreenChart === "fxChart" && <ArrowLeftRight className="w-5 h-5" />}
                {fullScreenChart === "monthlyBar" && <BarChart2 className="w-5 h-5" />}
              </span>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  {fullScreenChart === "capital30" && "📈 Динаміка сукупного капіталу (з урахуванням курсів)"}
                  {fullScreenChart === "fxChart" && `💱 Динаміка комерційного курсу ${fxChartCurrency} та капіталу`}
                  {fullScreenChart === "monthlyBar" && "📊 Порівняльний графік приросту за місяцями та роками"}
                </h3>
                <p className="text-[11px] text-slate-400 font-medium">
                  Інтерактивний повноекранний аналіз даних із точним врахуванням історичних валютних коливань
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="hidden md:flex items-center gap-1.5 text-[10px] text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 font-bold">
                <RotateCw className="w-3.5 h-3.5 text-amber-400" /> Поверніть пристрій горизонтально для огляду
              </span>

              <button
                type="button"
                onClick={() => setFullScreenChart(null)}
                className="p-2 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Закрити повноекранний режим"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Controls Sub-Bar */}
          <div className="py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 border-b border-slate-900 text-xs">
            {fullScreenChart === "capital30" && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-slate-400 font-extrabold text-[11px]">Період аналізу:</span>
                {[7, 14, 30, 60, 90, 180, 365].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setCapitalChartDays(d)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all border cursor-pointer ${
                      capitalChartDays === d
                        ? "bg-sky-500 text-white border-sky-400 shadow scale-105"
                        : "bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800"
                    }`}
                  >
                    {d} днів
                  </button>
                ))}
              </div>
            )}

            {fullScreenChart === "fxChart" && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-extrabold text-[11px]">Валюта:</span>
                  {(["USD", "EUR"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFxChartCurrency(c)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all border cursor-pointer ${
                        fxChartCurrency === c
                          ? "bg-amber-500 text-slate-950 border-amber-400 shadow scale-105"
                          : "bg-slate-900 text-slate-300 border-slate-800"
                      }`}
                    >
                      {c === "USD" ? "🇺🇸 USD" : "🇪🇺 EUR"}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-slate-400 font-extrabold text-[11px]">Період:</span>
                  {([30, 60, 90] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setFxChartDays(d)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold border ${
                        fxChartDays === d
                          ? "bg-sky-500 text-white border-sky-400"
                          : "bg-slate-900 text-slate-300 border-slate-800"
                      }`}
                    >
                      {d} дн
                    </button>
                  ))}
                </div>
              </div>
            )}

            {fullScreenChart === "monthlyBar" && (
              <div className="flex items-center gap-1">
                <span className="text-slate-400 font-extrabold text-[11px]">Вид:</span>
                {(["monthly", "yearly"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setDynamicsSubTab(mode)}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all border ${
                      dynamicsSubTab === mode
                        ? "bg-sky-500 text-white border-sky-400"
                        : "bg-slate-900 text-slate-300 border-slate-800"
                    }`}
                  >
                    {mode === "monthly" ? "Помісячно (6 міс)" : "Порічно (4 роки)"}
                  </button>
                ))}
              </div>
            )}

            <div className="text-[11px] text-slate-400 font-bold">
              Базова валюта: <strong className="text-white">{summaryBase}</strong>
            </div>
          </div>

          {/* Center Fullscreen Chart Viewport */}
          <div className="flex-1 w-full my-2 relative min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              {fullScreenChart === "capital30" ? (
                <AreaChart data={last30DaysCapitalData} margin={{ top: 15, right: 25, left: 10, bottom: 25 }}>
                  <defs>
                    <linearGradient id="capFullGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.7} />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: "#334155" }} />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
                    axisLine={{ stroke: "#334155" }}
                    domain={['auto', 'auto']}
                    tickFormatter={(val) => {
                      if (Math.abs(val) >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
                      if (Math.abs(val) >= 1000) return `${(val / 1000).toFixed(0)}k`;
                      return `${val}`;
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0]?.payload;
                        if (!data) return null;
                        const sym = getCurrencySymbol(summaryBase);
                        return (
                          <div className="p-3 rounded-2xl bg-slate-950/98 border border-sky-500/40 text-slate-100 shadow-2xl text-xs flex flex-col gap-1.5 min-w-[220px]">
                            <div className="font-extrabold text-sky-400 border-b border-slate-800 pb-1 flex justify-between">
                              <span>📅 {data.fullDate || data.date || ""}</span>
                              <span>(дата {data.date || ""})</span>
                            </div>
                            <div className="flex items-center justify-between text-emerald-400 font-black text-sm pt-0.5">
                              <span>Сукупний капітал:</span>
                              <span>{(data.total ?? 0).toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{sym}</span>
                            </div>
                            <div className="grid grid-cols-1 gap-1 text-[11px] text-slate-300 pt-1 border-t border-slate-900">
                              <div className="flex justify-between">
                                <span>🇺🇦 UAH в еквів.:</span>
                                <span className="font-bold">{(data.uah ?? 0).toLocaleString("uk-UA")}{sym}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>🇺🇸 USD в еквів.:</span>
                                <span className="font-bold">{(data.usd ?? 0).toLocaleString("uk-UA")}{sym}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>🇪🇺 EUR в еквів.:</span>
                                <span className="font-bold">{(data.eur ?? 0).toLocaleString("uk-UA")}{sym}</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area type="monotone" dataKey="total" stroke="#38bdf8" strokeWidth={3} fillOpacity={1} fill="url(#capFullGrad)" dot={{ r: 4, fill: "#0284c7" }} activeDot={{ r: 8, fill: "#38bdf8" }} />
                </AreaChart>
              ) : fullScreenChart === "fxChart" ? (
                <LineChart data={fxHistoryChartData} margin={{ top: 15, right: 25, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.7} />
                  <XAxis dataKey="dateFormatted" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={{ stroke: "#334155" }} />
                  <YAxis yAxisId="left" tick={{ fill: "#f59e0b", fontSize: 11, fontWeight: 700 }} domain={['auto', 'auto']} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: "#38bdf8", fontSize: 11, fontWeight: 700 }} domain={['auto', 'auto']} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0]?.payload;
                        if (!d) return null;
                        const rateVal = d.rate ?? 0;
                        const totalBal = d.totalBalance ?? d.capital ?? 0;
                        return (
                          <div className="p-3 rounded-2xl bg-slate-950/98 border border-amber-500/40 text-xs space-y-1">
                            <div className="font-bold text-slate-400">📅 {d.dateFormatted || d.dateISO || d.fullDate || ""}</div>
                            <div className="text-amber-400 font-extrabold">Курс {fxChartCurrency}: {rateVal.toFixed(2)} ₴</div>
                            <div className="text-sky-400 font-extrabold">Капітал: {totalBal.toLocaleString("uk-UA")} {getCurrencySymbol(summaryBase)}</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="rate" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4 }} name="Курс" />
                  <Line yAxisId="right" type="monotone" dataKey="totalBalance" stroke="#38bdf8" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Капітал" />
                </LineChart>
              ) : (
                <BarChart data={dynamicsSubTab === "monthly" ? monthlyDynamics : yearlyDynamics} margin={{ top: 15, right: 25, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.7} />
                  <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: "#334155" }} />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }}
                    axisLine={{ stroke: "#334155" }}
                    tickFormatter={(v) => {
                      if (Math.abs(v) >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                      if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(0)}k`;
                      return `${v}`;
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0]?.payload;
                        if (!item) return null;
                        const sym = getCurrencySymbol(summaryBase);
                        const diffVal = item.diffBase ?? 0;
                        const isPos = diffVal >= 0;
                        const totVal = item.totalBase ?? 0;
                        const pctVal = item.percentChange ?? 0;
                        return (
                          <div className="p-3 rounded-2xl bg-slate-950/98 border border-emerald-500/40 text-slate-100 shadow-2xl text-xs flex flex-col gap-1.5 min-w-[200px]">
                            <div className="font-extrabold text-emerald-400 border-b border-slate-800 pb-1 flex justify-between">
                              <span>📊 {item.label || item.year || ""}</span>
                            </div>
                            <div className="flex items-center justify-between text-slate-200 font-bold">
                              <span>Капітал:</span>
                              <span>{totVal.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{sym}</span>
                            </div>
                            <div className="flex items-center justify-between font-black border-t border-slate-900 pt-1">
                              <span>Зміна приросту:</span>
                              <span className={isPos ? "text-emerald-400" : "text-rose-400"}>
                                {isPos ? "+" : ""}{diffVal.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{sym} ({isPos ? "+" : ""}{pctVal.toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="totalBase" fill="#38bdf8" radius={[8, 8, 0, 0]} name="Капітал" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Modal Footer Controls */}
          <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400 shrink-0">
            <span>💡 Для повернення до звичайного вікна натисніть <strong>Закрити</strong> або кнопку у верхньому кутку</span>
            <button
              type="button"
              onClick={() => setFullScreenChart(null)}
              className="px-4 py-1.5 rounded-xl bg-sky-500 text-white font-black hover:bg-sky-400 transition-colors cursor-pointer"
            >
              Закрити повноекранний перегляд
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
