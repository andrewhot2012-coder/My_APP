import React, { useState, useMemo, useEffect } from "react";
import { ChevronRight, FileText, Search, X, Calendar, BarChart3, TrendingUp, TrendingDown, Coins, ArrowUpRight, ArrowDownRight, Layers, Percent, Tag, ChevronDown, ChevronUp, Clock, RotateCcw, CreditCard, Printer, Download, Check, Users, UserCheck, Copy } from "lucide-react";
import { MonthlyReportItem, HistoryGroup, InitData } from "../types";
import { isLoanTransaction, resolveItemCurrency, parseTransactionText, replaceBankKeysWithAliases } from "../lib/transactionUtils";

function parseReportItemDetails(it: { text: string; fullText?: string; dateStr: string; monthLabel?: string; bank?: string }) {
  let rawDate = (it.dateStr || "").trim();
  // Strip outer brackets like "[15.10.2026 14:30 | Дохід]"
  const bMatch = rawDate.match(/^\[(.*?)(?:\|.*?)?\]/);
  if (bMatch) {
    rawDate = bMatch[1].trim();
  }
  
  let cleanDate = rawDate;
  if (!cleanDate) {
    cleanDate = (it.monthLabel && it.monthLabel !== it.dateStr) ? it.monthLabel : "Без дати";
  }

  const raw = it.fullText || it.text || "";
  const parsed = parseTransactionText(raw);

  const contractor = parsed.contractor || (raw.match(/👤\s*([^|\n]+)/)?.[1]?.trim());
  const bank = it.bank || (parsed.cardDetails ? parsed.cardDetails.split("\n")[0].trim() : (raw.match(/💳\s*([^|\n]+)/)?.[1]?.trim()));

  // Extract clean comment without category prefix [Категорія]
  let comment = parsed.comment || "";
  if (!comment && it.text) {
    const cleanT = (it.text || "").replace(/^\[.*?\]\s*/, "").trim();
    const mCom = cleanT.match(/(?:📝\s*|^)([^|💰👤💳]+)/);
    if (mCom) {
      comment = mCom[1].trim();
    } else {
      comment = cleanT;
    }
  }
  comment = comment.replace(/^\[.*?\]\s*/, "").trim();
  // Strip redundant payment metadata from comment
  comment = comment
    .replace(/💰\s*Сума:[^|\n]*(\||$)/gi, "")
    .replace(/👤\s*[^|\n]*(\||$)/gi, "")
    .replace(/💳\s*[^|\n]*(\||$)/gi, "")
    .replace(/^[|;\s]+|[|;\s]+$/g, "")
    .trim();

  let cleanDescription = "";
  if (!comment) {
    cleanDescription = (it.text || raw)
      .replace(/^\[.*?\]\s*/, "")
      .replace(/💰\s*Сума:[^|\n]*(\||$)/gi, "")
      .replace(/👤\s*[^|\n]*(\||$)/gi, "")
      .replace(/💳\s*[^|\n]*(\||$)/gi, "")
      .replace(/^[|;\s]+|[|;\s]+$/g, "")
      .trim();
  }

  return {
    cleanDate,
    contractor,
    bank,
    comment,
    cleanDescription
  };
}

interface ReportViewProps {
  reports: MonthlyReportItem[];
  allMonthlyReports?: {
    UAH: MonthlyReportItem[];
    USD: MonthlyReportItem[];
    EUR: MonthlyReportItem[];
  };
  historyGroups?: HistoryGroup[];
  initData?: InitData | null;
  initialMonthKey?: string;
  initialViewMode?: "categories" | "monthly" | "yearly" | "accounts" | "debtors";
  loading: boolean;
  currentCurrency: string;
  rateUsd?: string;
  rateUsdSell?: string;
  rateEur?: string;
  rateEurSell?: string;
  onBack: () => void;
  onSelectReport?: (report: MonthlyReportItem, monthKey?: string) => void;
  onOpenComprehensiveReport?: () => void;
  onNavigateToContractorReport?: (name: string) => void;
}

const getCurrencySymbol = (currency: string) => {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  return "₴";
};

interface CombinedMonth {
  sortKey: string;
  label: string;
  year: string;
  uah?: MonthlyReportItem;
  usd?: MonthlyReportItem;
  eur?: MonthlyReportItem;
}

export const ReportView: React.FC<ReportViewProps> = ({
  reports,
  allMonthlyReports,
  historyGroups,
  initData,
  initialMonthKey,
  initialViewMode,
  loading,
  currentCurrency,
  rateUsd,
  rateEur,
  onBack,
  onSelectReport,
  onOpenComprehensiveReport,
  onNavigateToContractorReport
}) => {
  const [viewMode, setViewMode] = useState<"monthly" | "yearly" | "categories" | "accounts" | "debtors">(
    initialViewMode || "monthly"
  );
  const [expandedAccounts, setExpandedAccounts] = useState<{ [key: string]: boolean }>({});
  const [currencyFilter, setCurrencyFilter] = useState<"ALL" | "UAH" | "USD" | "EUR">("ALL");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedYearFilter, setSelectedYearFilter] = useState<string>("ALL");
  const [periodType, setPeriodType] = useState<"all" | "this_month" | "prev_month" | "month" | "year" | "custom">(
    initialMonthKey ? "month" : "this_month"
  );
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonthKey || "");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [expandedYears, setExpandedYears] = useState<{ [key: string]: boolean }>({});
  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({});
  const [categoryTypeFilter, setCategoryTypeFilter] = useState<"all" | "inc" | "exp">("all");
  const [categorySearch, setCategorySearch] = useState<string>("");
  const [categorySelectFilter, setCategorySelectFilter] = useState<string>("all");

  // Multi-Currency Debtors & Contractors Registry (Block 3)
  const [contractorTabFilter, setContractorTabFilter] = useState<"all" | "oweUs" | "weOwe">("all");
  const [contractorSearch, setContractorSearch] = useState<string>("");
  const [isCopiedContractors, setIsCopiedContractors] = useState<boolean>(false);

  const rUsd = parseFloat(rateUsd || "41.5") || 41.5;
  const rEur = parseFloat(rateEur || "45.2") || 45.2;

  // Master Multi-Currency Contractor Table (Block 3)
  const masterContractorsList = useMemo(() => {
    const map: Record<string, { name: string; uah: number; usd: number; eur: number }> = {};

    const processDebtorsObj = (debtorsObj: any, cur: "UAH" | "USD" | "EUR") => {
      if (!debtorsObj) return;
      if (Array.isArray(debtorsObj.oweUs)) {
        debtorsObj.oweUs.forEach((d: any) => {
          if (!d.name) return;
          const k = d.name.trim();
          if (!map[k]) map[k] = { name: k, uah: 0, usd: 0, eur: 0 };
          const s = Math.abs(Number(d.sum ?? d.amount ?? 0));
          if (cur === "UAH") map[k].uah = s;
          if (cur === "USD") map[k].usd = s;
          if (cur === "EUR") map[k].eur = s;
        });
      }
      if (Array.isArray(debtorsObj.weOwe)) {
        debtorsObj.weOwe.forEach((d: any) => {
          if (!d.name) return;
          const k = d.name.trim();
          if (!map[k]) map[k] = { name: k, uah: 0, usd: 0, eur: 0 };
          const s = Math.abs(Number(d.sum ?? d.amount ?? 0));
          if (cur === "UAH") map[k].uah = -s;
          if (cur === "USD") map[k].usd = -s;
          if (cur === "EUR") map[k].eur = -s;
        });
      }
      if (Array.isArray(debtorsObj.settled)) {
        debtorsObj.settled.forEach((d: any) => {
          if (!d.name) return;
          const k = d.name.trim();
          if (!map[k]) map[k] = { name: k, uah: 0, usd: 0, eur: 0 };
        });
      }
    };

    // 1. Process from initData.allDebtorsDetails if present
    if (initData?.allDebtorsDetails) {
      if (initData.allDebtorsDetails.UAH) processDebtorsObj(initData.allDebtorsDetails.UAH, "UAH");
      if (initData.allDebtorsDetails.USD) processDebtorsObj(initData.allDebtorsDetails.USD, "USD");
      if (initData.allDebtorsDetails.EUR) processDebtorsObj(initData.allDebtorsDetails.EUR, "EUR");
    }

    // 2. Process current currency initData.debtors
    if (initData?.debtors) {
      processDebtorsObj(initData.debtors, (currentCurrency as "UAH" | "USD" | "EUR") || "UAH");
    }

    // 3. Process cached localStorage initData for all currencies to guarantee multi-currency coverage
    try {
      (["UAH", "USD", "EUR"] as const).forEach(c => {
        const cachedStr = localStorage.getItem(`cached_init_data_${c}`);
        if (cachedStr) {
          const parsed = JSON.parse(cachedStr);
          if (parsed?.debtors) {
            processDebtorsObj(parsed.debtors, c);
          }
          if (parsed?.allDebtorsDetails?.[c]) {
            processDebtorsObj(parsed.allDebtorsDetails[c], c);
          }
        }
      });
    } catch (e) {
      console.warn("Failed reading cached debtors data:", e);
    }

    // 4. Ensure all registered contractors from initData.names are present in the list
    if (Array.isArray(initData?.names)) {
      initData.names.forEach((n: string) => {
        if (!n) return;
        const k = n.trim();
        if (!map[k]) map[k] = { name: k, uah: 0, usd: 0, eur: 0 };
      });
    }

    // 5. Ensure all contractors from contractorLedger are present
    if (initData?.contractorLedger) {
      Object.keys(initData.contractorLedger).forEach(n => {
        if (!n) return;
        const k = n.trim();
        if (!map[k]) map[k] = { name: k, uah: 0, usd: 0, eur: 0 };
      });
    }

    // 6. Ensure contractors from transaction history are registered
    if (Array.isArray(historyGroups)) {
      historyGroups.forEach(g => {
        (g.items || []).forEach(it => {
          const parsed = parseTransactionText(it.fullText || it.text);
          const cName = parsed.contractor?.trim();
          if (cName && !map[cName]) {
            map[cName] = { name: cName, uah: 0, usd: 0, eur: 0 };
          }
        });
      });
    }

    return Object.values(map).map(c => {
      const netUahEquiv = c.uah + (c.usd * rUsd) + (c.eur * rEur);
      const netUsdEquiv = rUsd > 0 ? netUahEquiv / rUsd : 0;
      const netEurEquiv = rEur > 0 ? netUahEquiv / rEur : 0;
      return {
        ...c,
        netUahEquiv,
        netUsdEquiv,
        netEurEquiv
      };
    }).sort((a, b) => Math.abs(b.netUahEquiv) - Math.abs(a.netUahEquiv));
  }, [initData, currentCurrency, historyGroups, rUsd, rEur]);

  const filteredContractors = useMemo(() => {
    return masterContractorsList.filter(c => {
      const matchesSearch = !contractorSearch.trim() || c.name.toLowerCase().includes(contractorSearch.toLowerCase());
      if (!matchesSearch) return false;
      if (contractorTabFilter === "oweUs") return c.netUahEquiv > 0.01;
      if (contractorTabFilter === "weOwe") return c.netUahEquiv < -0.01;
      return true;
    });
  }, [masterContractorsList, contractorSearch, contractorTabFilter]);

  const debtorTotals = useMemo(() => {
    let oweUsUah = 0;
    let oweUsUsd = 0;
    let oweUsEur = 0;
    let weOweUah = 0;
    let weOweUsd = 0;
    let weOweEur = 0;

    masterContractorsList.forEach(c => {
      if (c.uah > 0) oweUsUah += c.uah; else if (c.uah < 0) weOweUah += Math.abs(c.uah);
      if (c.usd > 0) oweUsUsd += c.usd; else if (c.usd < 0) weOweUsd += Math.abs(c.usd);
      if (c.eur > 0) oweUsEur += c.eur; else if (c.eur < 0) weOweEur += Math.abs(c.eur);
    });

    const totalOweUsEquiv = oweUsUah + (oweUsUsd * rUsd) + (oweUsEur * rEur);
    const totalWeOweEquiv = weOweUah + (weOweUsd * rUsd) + (weOweEur * rEur);
    const netBalanceEquiv = totalOweUsEquiv - totalWeOweEquiv;

    return {
      oweUsUah,
      oweUsUsd,
      oweUsEur,
      weOweUah,
      weOweUsd,
      weOweEur,
      totalOweUsEquiv,
      totalWeOweEquiv,
      netBalanceEquiv
    };
  }, [masterContractorsList, rUsd, rEur]);

  // Currency converter helper
  const convertAmount = (val: number, from: string, to: string): number => {
    if (from === to) return val;
    if (!val) return 0;
    let uah = val;
    if (from === "USD") uah = val * rUsd;
    else if (from === "EUR") uah = val * rEur;

    if (to === "UAH") return uah;
    if (to === "USD") return rUsd > 0 ? uah / rUsd : 0;
    if (to === "EUR") return rEur > 0 ? uah / rEur : 0;
    return uah;
  };

  const targetEquivCurrency = currencyFilter === "ALL" ? currentCurrency : currencyFilter;

  // Helper to sanitize report items so loans are not included in income, and items with mismatched currency are excluded
  const sanitizeReportItem = (r: MonthlyReportItem): MonthlyReportItem => {
    if (!r.items || r.items.length === 0) return r;
    let hasChanges = false;
    const cleanItems = r.items.map(it => {
      if (it.type === "inc" && isLoanTransaction(r.label, "", it.text, it.fullText)) {
        hasChanges = true;
        return { ...it, type: "loan" as any };
      }
      if (r.currency) {
        const trueCur = resolveItemCurrency(it.curr, r.currency, it.text, it.fullText, it.sum);
        if (trueCur !== r.currency) {
          hasChanges = true;
          return { ...it, curr: trueCur, type: "wrong_curr" as any };
        }
      }
      return it;
    });

    if (!hasChanges) return r;

    const newInc = cleanItems
      .filter(it => it.type === "inc")
      .reduce((acc, it) => acc + (it.sum || 0), 0);

    return {
      ...r,
      inc: Number(newInc.toFixed(2)),
      items: cleanItems.filter(it => (it as any).type !== "wrong_curr")
    };
  };

  // Aggregate months across all 3 currencies
  const monthsMap = useMemo(() => {
    const map: {
      [key: string]: {
        sortKey: string;
        label: string;
        year: string;
        uah?: MonthlyReportItem;
        usd?: MonthlyReportItem;
        eur?: MonthlyReportItem;
      };
    } = {};

    const allUAH = (allMonthlyReports?.UAH || (currentCurrency === "UAH" ? reports : [])).filter(r => !r.currency || r.currency === "UAH");
    const allUSD = (allMonthlyReports?.USD || (currentCurrency === "USD" ? reports : [])).filter(r => r.currency === "USD");
    const allEUR = (allMonthlyReports?.EUR || (currentCurrency === "EUR" ? reports : [])).filter(r => r.currency === "EUR");

    allUAH.forEach((rawR) => {
      const r = sanitizeReportItem(rawR);
      const yr = r.sortKey ? r.sortKey.split("-")[0] : "2026";
      if (!map[r.sortKey]) map[r.sortKey] = { sortKey: r.sortKey, label: r.label, year: yr };
      map[r.sortKey].uah = r;
    });

    allUSD.forEach((rawR) => {
      const r = sanitizeReportItem(rawR);
      const yr = r.sortKey ? r.sortKey.split("-")[0] : "2026";
      if (!map[r.sortKey]) map[r.sortKey] = { sortKey: r.sortKey, label: r.label, year: yr };
      map[r.sortKey].usd = r;
    });

    allEUR.forEach((rawR) => {
      const r = sanitizeReportItem(rawR);
      const yr = r.sortKey ? r.sortKey.split("-")[0] : "2026";
      if (!map[r.sortKey]) map[r.sortKey] = { sortKey: r.sortKey, label: r.label, year: yr };
      map[r.sortKey].eur = r;
    });

    // Fallback
    reports.forEach((rawR) => {
      const r = sanitizeReportItem(rawR);
      const yr = r.sortKey ? r.sortKey.split("-")[0] : "2026";
      if (!map[r.sortKey]) {
        map[r.sortKey] = { sortKey: r.sortKey, label: r.label, year: yr };
      }
      const rCur = r.currency || currentCurrency;
      if (rCur === "UAH" && !map[r.sortKey].uah) map[r.sortKey].uah = r;
      if (rCur === "USD" && !map[r.sortKey].usd) map[r.sortKey].usd = r;
      if (rCur === "EUR" && !map[r.sortKey].eur) map[r.sortKey].eur = r;
    });

    return map;
  }, [allMonthlyReports, reports, currentCurrency]);

  const allCombinedMonths = useMemo(() => {
    return (Object.values(monthsMap) as CombinedMonth[]).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [monthsMap]);

  // Unique available years
  const availableYears = useMemo(() => {
    const yearsSet = new Set<string>();
    allCombinedMonths.forEach((m) => {
      if (m.year) yearsSet.add(m.year);
    });
    return Array.from(yearsSet).sort((a, b) => b.localeCompare(a));
  }, [allCombinedMonths]);

  // Helper to check whether an operation's date falls within the selected period
  const isDateInSelectedPeriod = (dateStr: string, timestamp?: number): boolean => {
    if (periodType === "all") {
      if (selectedYearFilter !== "ALL") {
        let yr = "";
        if (dateStr) {
          const parts = dateStr.split(" ")[0].split(".");
          if (parts.length >= 3) yr = parts[2];
          else {
            const dM = dateStr.match(/(\d{4})/);
            if (dM) yr = dM[1];
          }
        }
        if (yr) {
          if (yr.length === 2) yr = "20" + yr;
          if (yr !== selectedYearFilter) return false;
        }
      }
      return true;
    }

    let d: Date | null = null;
    if (timestamp && timestamp > 10000000) {
      d = new Date(timestamp);
    } else if (dateStr) {
      const dMatch = dateStr.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
      if (dMatch) {
        const day = parseInt(dMatch[1], 10);
        const month = parseInt(dMatch[2], 10) - 1;
        let yr = parseInt(dMatch[3], 10);
        if (yr < 100) yr += 2000;
        const tMatch = dateStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
        const h = tMatch ? parseInt(tMatch[1], 10) : 12;
        const min = tMatch ? parseInt(tMatch[2], 10) : 0;
        const s = tMatch && tMatch[3] ? parseInt(tMatch[3], 10) : 0;
        d = new Date(yr, month, day, h, min, s);
      }
    }

    if (!d || isNaN(d.getTime())) return true;

    const now = new Date();

    if (periodType === "this_month") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }

    if (periodType === "prev_month") {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.getFullYear() === prevDate.getFullYear() && d.getMonth() === prevDate.getMonth();
    }

    if (periodType === "month") {
      if (!selectedMonth || selectedMonth === "all") return true;
      const [yStr, mStr] = selectedMonth.split("-");
      const targetYear = parseInt(yStr, 10);
      const targetMonth = parseInt(mStr, 10) - 1;
      return d.getFullYear() === targetYear && d.getMonth() === targetMonth;
    }

    if (periodType === "year") {
      if (selectedYearFilter === "ALL") return true;
      return d.getFullYear() === parseInt(selectedYearFilter, 10);
    }

    if (periodType === "custom") {
      if (customStartDate) {
        const start = new Date(customStartDate + "T00:00:00");
        if (d < start) return false;
      }
      if (customEndDate) {
        const end = new Date(customEndDate + "T23:59:59");
        if (d > end) return false;
      }
      return true;
    }

    return true;
  };

  // Filter months
  const visibleMonths = useMemo(() => {
    const now = new Date();
    const thisSortKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevSortKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

    return allCombinedMonths.filter((m) => {
      // Period filter checks
      if (periodType === "this_month" && m.sortKey !== thisSortKey) return false;
      if (periodType === "prev_month" && m.sortKey !== prevSortKey) return false;
      if (periodType === "month" && selectedMonth && selectedMonth !== "all" && m.sortKey !== selectedMonth) return false;
      if ((periodType === "year" || periodType === "all") && selectedYearFilter !== "ALL" && m.year !== selectedYearFilter) return false;
      if (periodType === "custom") {
        if (customStartDate) {
          const [sY, sM] = customStartDate.split("-");
          const startMonthKey = `${sY}-${sM}`;
          if (m.sortKey < startMonthKey) return false;
        }
        if (customEndDate) {
          const [eY, eM] = customEndDate.split("-");
          const endMonthKey = `${eY}-${eM}`;
          if (m.sortKey > endMonthKey) return false;
        }
      }

      let matchesCurrency = true;
      if (currencyFilter === "UAH") matchesCurrency = !!m.uah && (m.uah.inc > 0 || m.uah.exp > 0 || m.uah.items.length > 0);
      else if (currencyFilter === "USD") matchesCurrency = !!m.usd && (m.usd.inc > 0 || m.usd.exp > 0 || m.usd.items.length > 0);
      else if (currencyFilter === "EUR") matchesCurrency = !!m.eur && (m.eur.inc > 0 || m.eur.exp > 0 || m.eur.items.length > 0);

      if (!matchesCurrency) return false;

      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase().trim();
      const labelLower = (m.label || "").toLowerCase();
      const sortKeyLower = (m.sortKey || "").toLowerCase();
      return labelLower.includes(q) || sortKeyLower.includes(q);
    });
  }, [allCombinedMonths, currencyFilter, searchTerm, selectedYearFilter, periodType, selectedMonth, customStartDate, customEndDate]);

  // Overall Totals
  const overallTotals = useMemo(() => {
    let incUAH = 0, expUAH = 0;
    let incUSD = 0, expUSD = 0;
    let incEUR = 0, expEUR = 0;

    visibleMonths.forEach((m) => {
      if (m.uah) { incUAH += m.uah.inc; expUAH += m.uah.exp; }
      if (m.usd) { incUSD += m.usd.inc; expUSD += m.usd.exp; }
      if (m.eur) { incEUR += m.eur.inc; expEUR += m.eur.exp; }
    });

    const netUAH = incUAH - expUAH;
    const netUSD = incUSD - expUSD;
    const netEUR = incEUR - expEUR;

    const totalIncEquiv = 
      convertAmount(incUAH, "UAH", currentCurrency) +
      convertAmount(incUSD, "USD", currentCurrency) +
      convertAmount(incEUR, "EUR", currentCurrency);

    const totalExpEquiv = 
      convertAmount(expUAH, "UAH", currentCurrency) +
      convertAmount(expUSD, "USD", currentCurrency) +
      convertAmount(expEUR, "EUR", currentCurrency);

    const netEquiv = totalIncEquiv - totalExpEquiv;

    return {
      incUAH, expUAH, netUAH,
      incUSD, expUSD, netUSD,
      incEUR, expEUR, netEUR,
      totalIncEquiv,
      totalExpEquiv,
      netEquiv
    };
  }, [visibleMonths, currentCurrency, rUsd, rEur]);

  // Yearly Data
  const yearlyData = useMemo(() => {
    const yearsMap: {
      [year: string]: {
        year: string;
        months: typeof allCombinedMonths;
        incUAH: number; expUAH: number; netUAH: number;
        incUSD: number; expUSD: number; netUSD: number;
        incEUR: number; expEUR: number; netEUR: number;
        totalIncEquiv: number;
        totalExpEquiv: number;
        netEquiv: number;
      };
    } = {};

    allCombinedMonths.forEach((m) => {
      const yr = m.year || "2026";
      if (!yearsMap[yr]) {
        yearsMap[yr] = {
          year: yr,
          months: [],
          incUAH: 0, expUAH: 0, netUAH: 0,
          incUSD: 0, expUSD: 0, netUSD: 0,
          incEUR: 0, expEUR: 0, netEUR: 0,
          totalIncEquiv: 0,
          totalExpEquiv: 0,
          netEquiv: 0
        };
      }
      yearsMap[yr].months.push(m);
      if (m.uah) { yearsMap[yr].incUAH += m.uah.inc; yearsMap[yr].expUAH += m.uah.exp; }
      if (m.usd) { yearsMap[yr].incUSD += m.usd.inc; yearsMap[yr].expUSD += m.usd.exp; }
      if (m.eur) { yearsMap[yr].incEUR += m.eur.inc; yearsMap[yr].expEUR += m.eur.exp; }
    });

    Object.values(yearsMap).forEach((y) => {
      y.netUAH = y.incUAH - y.expUAH;
      y.netUSD = y.incUSD - y.expUSD;
      y.netEUR = y.incEUR - y.expEUR;

      y.totalIncEquiv = 
        convertAmount(y.incUAH, "UAH", currentCurrency) +
        convertAmount(y.incUSD, "USD", currentCurrency) +
        convertAmount(y.incEUR, "EUR", currentCurrency);

      y.totalExpEquiv = 
        convertAmount(y.expUAH, "UAH", currentCurrency) +
        convertAmount(y.expUSD, "USD", currentCurrency) +
        convertAmount(y.expEUR, "EUR", currentCurrency);

      y.netEquiv = y.totalIncEquiv - y.totalExpEquiv;
    });

    return Object.values(yearsMap).sort((a, b) => b.year.localeCompare(a.year));
  }, [allCombinedMonths, currentCurrency, rUsd, rEur]);

  // Effective history groups: use provided historyGroups or fallback to cached all groups if multiple currencies are present
  const effectiveHistoryGroups = useMemo(() => {
    if (historyGroups && historyGroups.length > 0) {
      const hasEur = historyGroups.some(g => (g.curr === "EUR" || g.items?.some(it => it.curr === "EUR" || (it.fullText || "").includes("€") || (it.fullText || "").toUpperCase().includes("EUR"))));
      if (hasEur) return historyGroups;
    }
    try {
      const allCached = localStorage.getItem("cached_history_groups_ALL");
      if (allCached) {
        const parsed = JSON.parse(allCached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return historyGroups || [];
  }, [historyGroups]);

  // Category-based aggregation
  const allCategoryData = useMemo(() => {
    const catsMap: {
      [catName: string]: {
        name: string;
        incUAH: number; expUAH: number;
        incUSD: number; expUSD: number;
        incEUR: number; expEUR: number;
        incEquiv: number; expEquiv: number;
        totalTurnoverEquiv: number;
        items: Array<{
          type: "inc" | "exp" | "loan";
          sum: number;
          text: string;
          fullText: string;
          curr?: string;
          dateStr: string;
          monthLabel: string;
          bank?: string;
        }>;
      };
    } = {};

    const seenItemKeys = new Set<string>();
    const historySignatures = new Set<string>();
    const coveredMonthsByCurr = {
      UAH: new Set<string>(),
      USD: new Set<string>(),
      EUR: new Set<string>()
    };

    const extractCleanCategory = (text: string, fullText?: string): string => {
      const raw = fullText || text || "";
      // Strip date/time header bracket like [13.10.2026 14:00 | Прибуток]
      const stripped = raw.replace(/^\[.*?\]\s*/, "").trim();
      const commMatch = raw.match(/📝\s*\[([^\]|]+)\]/);
      if (commMatch) {
        const val = commMatch[1].trim();
        if (!val.includes("|") && !val.match(/^\d{1,2}\.\d{1,2}/)) {
          return val;
        }
      }
      const match = stripped.match(/\[([^\]|]+)\]/);
      if (match) {
        const val = match[1].trim();
        if (!val.includes("|") && !val.match(/^\d{1,2}\.\d{1,2}/)) {
          return val;
        }
      }
      return "Без категорії";
    };

    const addItem = (it: {
      type: "inc" | "exp" | "loan";
      sum: number;
      text: string;
      fullText: string;
      curr?: string;
      dateStr: string;
      monthLabel: string;
      bank?: string;
    }, catName: string) => {
      const c: "UAH" | "USD" | "EUR" = resolveItemCurrency(it.curr, undefined, it.text, it.fullText, it.sum);

      const cleanTxt = (it.text || it.fullText || "").replace(/\s+/g, " ").trim();
      const itemKey = `${it.dateStr}_${it.bank || ""}_${it.sum.toFixed(2)}_${c}_${cleanTxt.slice(0, 40)}`;
      if (seenItemKeys.has(itemKey)) return;
      seenItemKeys.add(itemKey);

      const cat = catName || "Без категорії";
      if (!catsMap[cat]) {
        catsMap[cat] = {
          name: cat,
          incUAH: 0, expUAH: 0,
          incUSD: 0, expUSD: 0,
          incEUR: 0, expEUR: 0,
          incEquiv: 0, expEquiv: 0,
          totalTurnoverEquiv: 0,
          items: []
        };
      }

      catsMap[cat].items.push({ ...it, curr: c });

      const s = it.sum || 0;
      const equiv = convertAmount(s, c, currentCurrency);

      if (it.type === "inc") {
        if (c === "USD") catsMap[cat].incUSD += s;
        else if (c === "EUR") catsMap[cat].incEUR += s;
        else catsMap[cat].incUAH += s;
        catsMap[cat].incEquiv += equiv;
        catsMap[cat].totalTurnoverEquiv += equiv;
      } else if (it.type === "exp") {
        if (c === "USD") catsMap[cat].expUSD += s;
        else if (c === "EUR") catsMap[cat].expEUR += s;
        else catsMap[cat].expUAH += s;
        catsMap[cat].expEquiv += equiv;
        catsMap[cat].totalTurnoverEquiv += equiv;
      }
    };

    // 1. Process from effectiveHistoryGroups if available (contains all bank operations with their split parts)
    if (effectiveHistoryGroups && effectiveHistoryGroups.length > 0) {
      effectiveHistoryGroups.forEach(g => {
        if (g.operation === "Обмін") return;

        let gCurrRaw = (g.curr || g.items?.[0]?.curr || "UAH").toUpperCase();
        let gCurr: "UAH" | "USD" | "EUR" = "UAH";
        if (gCurrRaw.includes("USD") || gCurrRaw === "$") gCurr = "USD";
        else if (gCurrRaw.includes("EUR") || gCurrRaw === "€") gCurr = "EUR";

        // Track which months are covered by historyGroups for this specific currency
        if (g.dateStr) {
          const parts = g.dateStr.split(" ")[0].split(".");
          if (parts.length >= 3) {
            let yr = parts[2];
            if (yr.length === 2) yr = "20" + yr;
            const mo = parts[1].padStart(2, "0");
            coveredMonthsByCurr[gCurr].add(`${yr}-${mo}`);
          }
        }

        if (!isDateInSelectedPeriod(g.dateStr, g.timestamp)) return;

        // Register signatures to avoid duplicate addition of total summary from visibleMonths
        if (g.dateStr) {
          historySignatures.add(g.dateStr.trim());
          const dtM = g.dateStr.match(/(\d{1,2}\.\d{1,2}\.\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?)/);
          if (dtM) historySignatures.add(dtM[1].trim());
        }
        for (const it of g.items) {
          const brM = (it.fullText || "").match(/^\[(.*?)\]/);
          if (brM) historySignatures.add(brM[1].trim());
          const dtM = (it.fullText || "").match(/(\d{1,2}\.\d{1,2}\.\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?)/);
          if (dtM) historySignatures.add(dtM[1].trim());
        }

        let cat = "Без категорії";
        for (const it of g.items) {
          const c = extractCleanCategory(it.text, it.fullText);
          if (c !== "Без категорії") {
            cat = c;
            break;
          }
        }

        const isGroupLoan = isLoanTransaction(g.operation, cat);

        g.items.forEach(it => {
          const s = Math.abs(it.sum || 0);
          if (s <= 0.001) return;
          const isItemLoan = isGroupLoan || isLoanTransaction(g.operation, cat, it.text, it.fullText);
          const rawIsInc = it.isIncome !== undefined ? it.isIncome : g.isIncome;
          const isInc = rawIsInc && !isItemLoan;
          const itemType: "inc" | "exp" | "loan" = isInc ? "inc" : (isItemLoan ? "loan" : "exp");

          const itCurr: "UAH" | "USD" | "EUR" = resolveItemCurrency(it.curr, g.curr, it.text, it.fullText, s);

          let cleanMonth = "";
          if (g.dateStr) {
            const dp = g.dateStr.split(" ")[0].split(".");
            if (dp.length >= 3) {
              const mIdx = parseInt(dp[1], 10) - 1;
              let yr = parseInt(dp[2], 10);
              if (yr < 100) yr += 2000;
              const mNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
              if (mIdx >= 0 && mIdx < 12) cleanMonth = `${mNames[mIdx]} ${yr}`;
            }
          }

          addItem({
            type: itemType,
            sum: s,
            text: it.text,
            fullText: it.fullText,
            curr: itCurr,
            dateStr: g.dateStr,
            monthLabel: cleanMonth,
            bank: it.bank
          }, cat);
        });
      });
    }

    // 2. Process from allCombinedMonths (for historical/archived months not present in historyGroups)
    allCombinedMonths.forEach(m => {
      const monthItems: Array<{
        type: "inc" | "exp" | "loan";
        sum: number;
        text: string;
        fullText: string;
        curr?: string;
        dateStr: string;
        monthLabel: string;
      }> = [];

      if (m.uah?.items && !coveredMonthsByCurr.UAH.has(m.sortKey)) {
        m.uah.items.forEach(it => monthItems.push({ ...it, curr: "UAH", monthLabel: m.label }));
      }
      if (m.usd?.items && !coveredMonthsByCurr.USD.has(m.sortKey)) {
        m.usd.items.forEach(it => monthItems.push({ ...it, curr: "USD", monthLabel: m.label }));
      }
      if (m.eur?.items && !coveredMonthsByCurr.EUR.has(m.sortKey)) {
        m.eur.items.forEach(it => monthItems.push({ ...it, curr: "EUR", monthLabel: m.label }));
      }

      monthItems.forEach(it => {
        if (!isDateInSelectedPeriod(it.dateStr)) return;

        // Skip if this transaction was already processed from historyGroups
        if (effectiveHistoryGroups && effectiveHistoryGroups.length > 0) {
          if (it.dateStr && historySignatures.has(it.dateStr.trim())) return;

          const brM = (it.fullText || "").match(/^\[(.*?)\]/);
          if (brM && historySignatures.has(brM[1].trim())) return;

          const dtM = (it.fullText || "").match(/(\d{1,2}\.\d{1,2}\.\d{2,4}\s+\d{1,2}:\d{2}(?::\d{2})?)/);
          if (dtM && historySignatures.has(dtM[1].trim())) return;

          let isMatch = false;
          for (const sig of historySignatures) {
            if (sig.length >= 10 && it.fullText && it.fullText.includes(sig)) {
              isMatch = true;
              break;
            }
          }
          if (isMatch) return;
        }

        const catCurr: "UAH" | "USD" | "EUR" = resolveItemCurrency(it.curr, undefined, it.text, it.fullText, it.sum);

        const cat = extractCleanCategory(it.text, it.fullText);
        const isItemLoan = isLoanTransaction("", cat, it.text, it.fullText);
        const itemType: "inc" | "exp" | "loan" = (it.type === "inc" && isItemLoan) ? "loan" : it.type;

        addItem({ ...it, type: itemType, curr: catCurr }, cat);
      });
    });

    return Object.values(catsMap).sort((a, b) => b.totalTurnoverEquiv - a.totalTurnoverEquiv);
  }, [effectiveHistoryGroups, allCombinedMonths, selectedYearFilter, periodType, selectedMonth, customStartDate, customEndDate, currentCurrency, rUsd, rEur]);

  const categoryReportData = useMemo(() => {
    let result = allCategoryData;

    if (categorySelectFilter !== "all") {
      result = result.filter(c => c.name.toLowerCase() === categorySelectFilter.toLowerCase());
    }

    if (categorySearch.trim()) {
      const q = categorySearch.toLowerCase().trim();
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.items.some(it => (it.text || it.fullText || "").toLowerCase().includes(q)));
    }

    return result;
  }, [allCategoryData, categorySelectFilter, categorySearch]);

  // Explicit human-readable period label
  const periodLabelText = useMemo(() => {
    const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
    if (periodType === "this_month") {
      const now = new Date();
      return `за поточний місяць (${monthNames[now.getMonth()]} ${now.getFullYear()})`;
    }
    if (periodType === "prev_month") {
      const prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      return `за минулий місяць (${monthNames[prev.getMonth()]} ${prev.getFullYear()})`;
    }
    if (periodType === "month") {
      if (selectedMonth && selectedMonth !== "all") {
        const mObj = allCombinedMonths.find(m => m.sortKey === selectedMonth);
        return mObj ? `за ${mObj.label}` : `за ${selectedMonth}`;
      }
    }
    if (periodType === "year" || (periodType === "all" && selectedYearFilter !== "ALL")) {
      return `за ${selectedYearFilter} рік`;
    }
    if (periodType === "custom") {
      if (customStartDate && customEndDate) {
        return `за ${customStartDate} – ${customEndDate}`;
      } else if (customStartDate) {
        return `з ${customStartDate}`;
      } else if (customEndDate) {
        return `до ${customEndDate}`;
      }
    }
    if (availableYears.length > 0) {
      const minYr = availableYears[availableYears.length - 1];
      const maxYr = availableYears[0];
      return minYr === maxYr ? `за ${minYr} рік` : `за ${minYr}–${maxYr} рр.`;
    }
    return "за весь період";
  }, [periodType, selectedMonth, selectedYearFilter, customStartDate, customEndDate, allCombinedMonths, availableYears]);

  const toggleYearExpanded = (yr: string) => {
    setExpandedYears(prev => ({ ...prev, [yr]: !prev[yr] }));
  };

  const handleCardClick = (m: typeof allCombinedMonths[0]) => {
    setPeriodType("month");
    setSelectedMonth(m.sortKey);
    setViewMode("categories");
  };

  const handleExportCSV = () => {
    const rows: string[][] = [];
    allCategoryData.forEach(cat => {
      cat.items.forEach(it => {
        const itemCurr: "UAH" | "USD" | "EUR" = (it.curr || currentCurrency || "UAH") as any;
        if (currencyFilter === "ALL" || itemCurr === currencyFilter) {
          const d = parseReportItemDetails(it);
          rows.push([
            `"${d.cleanDate}"`,
            `"${cat.name}"`,
            `"${it.type === "inc" ? "Дохід" : "Витрата"}"`,
            `"${it.sum.toFixed(2)}"`,
            `"${itemCurr}"`,
            `"${(d.contractor || "").replace(/"/g, '""')}"`,
            `"${(d.bank || "").replace(/"/g, '""')}"`,
            `"${(d.comment || d.cleanDescription || "").replace(/"/g, '""')}"`
          ]);
        }
      });
    });

    if (rows.length === 0) return;
    const headers = ["Дата/Час", "Категорія", "Тип", "Сума", "Валюта", "Контрагент", "Рахунок", "Коментар"];
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `report_${periodLabelText.replace(/[\s\/:*?"<>|]+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const getAccountBreakdown = () => {
    const breakdown: {
      [key: string]: {
        name: string;
        curr: "UAH" | "USD" | "EUR";
        inc: number;
        exp: number;
        items: Array<any>;
      };
    } = {};

    const currenciesToProcess: Array<"UAH" | "USD" | "EUR"> = 
      currencyFilter === "ALL" ? ["UAH", "USD", "EUR"] : [currencyFilter];

    const activeItems: Array<any> = [];
    allCategoryData.forEach(cat => {
      cat.items.forEach(it => {
        const itemCurr: "UAH" | "USD" | "EUR" = (it.curr || currentCurrency || "UAH") as any;
        if (currencyFilter === "ALL" || itemCurr === currencyFilter) {
          activeItems.push(it);
        }
      });
    });

    currenciesToProcess.forEach(curr => {
      const aliases = initData?.allAliases?.[curr] || {};
      const accountKeys = ["Готівка", "Банк 1", "Банк 2", "Банк 3", "Банк 4", "Банк 5"];
      
      const keyToAlias: { [key: string]: string } = {};
      accountKeys.forEach(key => {
        keyToAlias[key] = aliases[key] || key;
      });

      const defaultAccountName = aliases["Готівка"] || "Готівка";
      const currItems = activeItems.filter(it => (it.curr || currentCurrency) === curr);

      currItems.forEach(item => {
        if (!item.sum || item.sum <= 0) return;

        const rawContent = (item.text || "").replace(/^\[.*?\]/, "").trim();
        const resolvedText = replaceBankKeysWithAliases(item.fullText || rawContent, initData);
        const textLower = resolvedText.toLowerCase();

        let matchedAccount = "";
        let maxMatchLength = 0;

        Object.values(keyToAlias).forEach(alias => {
          if (alias && textLower.includes(alias.toLowerCase()) && alias.length > maxMatchLength) {
            matchedAccount = alias;
            maxMatchLength = alias.length;
          }
        });

        if (!matchedAccount && item.bank) {
          const bResolved = replaceBankKeysWithAliases(item.bank, initData);
          if (bResolved) matchedAccount = bResolved;
        }

        if (!matchedAccount) {
          accountKeys.forEach(key => {
            if (textLower.includes(key.toLowerCase()) && key.length > maxMatchLength) {
              matchedAccount = aliases[key] || key;
              maxMatchLength = key.length;
            }
          });
        }

        if (!matchedAccount) {
          matchedAccount = defaultAccountName;
        }

        const mapKey = `${curr}:::${matchedAccount}`;
        if (!breakdown[mapKey]) {
          breakdown[mapKey] = { name: matchedAccount, curr, inc: 0, exp: 0, items: [] };
        }

        if (item.type === "inc") {
          breakdown[mapKey].inc = Number((breakdown[mapKey].inc + item.sum).toFixed(2));
        } else {
          breakdown[mapKey].exp = Number((breakdown[mapKey].exp + item.sum).toFixed(2));
        }
        breakdown[mapKey].items.push(item);
      });
    });

    return Object.values(breakdown).map(acc => ({
      name: acc.name,
      curr: acc.curr,
      inc: acc.inc,
      exp: acc.exp,
      net: acc.inc - acc.exp,
      items: acc.items
    })).sort((a, b) => (b.inc + b.exp) - (a.inc + a.exp));
  };

  return (
    <div className="flex flex-col gap-4 text-left">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-slate-800 pb-3 gap-2">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-sky-400 shrink-0" />
          <h2 className="text-xl font-black text-white">Фінансовий Звіт та Аналітика</h2>
        </div>
        <div className="flex items-center gap-2 justify-end flex-wrap">
          <button
            type="button"
            onClick={handleExportCSV}
            className="text-xs font-bold text-sky-300 hover:text-sky-200 bg-sky-950/60 hover:bg-sky-900/80 border border-sky-500/30 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
            title="Експорт операцій у CSV"
          >
            <Download className="w-3.5 h-3.5 text-sky-400" />
            <span>CSV</span>
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
            title="Версія для друку / PDF"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" />
            <span>Друк</span>
          </button>
          {onOpenComprehensiveReport && (
            <button
              type="button"
              onClick={onOpenComprehensiveReport}
              className="text-xs font-black text-amber-300 hover:text-amber-200 bg-amber-950/50 hover:bg-amber-900/60 border border-amber-500/30 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
            >
              <Coins className="w-3.5 h-3.5 text-amber-400" />
              <span>Зведений Капітал</span>
            </button>
          )}
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-bold text-slate-300 hover:text-white transition-all bg-slate-800 hover:bg-slate-700 px-3.5 py-1.5 rounded-xl active:scale-95 cursor-pointer"
          >
            Назад
          </button>
        </div>
      </div>

      {/* Sticky Navigation Controls Container pinned under main Header */}
      <div className="sticky top-[53px] sm:top-[61px] z-40 bg-slate-950 border-b-2 border-sky-400 shadow-2xl py-1 px-2 -mx-2 flex flex-col gap-1.5 backdrop-blur-md">
        <div className="flex items-center justify-between gap-1.5 overflow-x-auto">
          {/* Mode Tabs */}
          <div className="flex items-center gap-0.5 bg-slate-900 p-0.5 border border-slate-700 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setViewMode("monthly")}
              className={`py-1 px-2.5 rounded-lg text-[10.5px] font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === "monthly"
                  ? "bg-sky-400 text-slate-950 shadow-md font-black"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Calendar className="w-3 h-3" />
              <span>По місяцях</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("categories")}
              className={`py-1 px-2.5 rounded-lg text-[10.5px] font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === "categories"
                  ? "bg-violet-400 text-slate-950 shadow-md font-black"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Tag className="w-3 h-3" />
              <span>По категоріях</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("debtors")}
              className={`py-1 px-2.5 rounded-lg text-[10.5px] font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === "debtors"
                  ? "bg-purple-400 text-slate-950 shadow-md font-black"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Users className="w-3 h-3" />
              <span>Борги та контрагенти ({masterContractorsList.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("accounts")}
              className={`py-1 px-2.5 rounded-lg text-[10.5px] font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === "accounts"
                  ? "bg-emerald-400 text-slate-950 shadow-md font-black"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <CreditCard className="w-3 h-3" />
              <span>По рахунках</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("yearly")}
              className={`py-1 px-2.5 rounded-lg text-[10.5px] font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === "yearly"
                  ? "bg-amber-400 text-slate-950 shadow-md font-black"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <BarChart3 className="w-3 h-3" />
              <span>За роки</span>
            </button>
          </div>

          {/* Currency Filter Tabs */}
          <div className="flex items-center gap-0.5 p-0.5 bg-slate-900 border border-slate-700 rounded-lg shrink-0">
            <button
              type="button"
              onClick={() => setCurrencyFilter("ALL")}
              className={`py-0.5 px-1.5 rounded text-[10px] font-black transition-all cursor-pointer ${
                currencyFilter === "ALL" ? "bg-sky-400 text-slate-950 font-black shadow-md" : "text-slate-300 hover:text-white"
              }`}
            >
              🌐 Всі
            </button>
            <button
              type="button"
              onClick={() => setCurrencyFilter("UAH")}
              className={`py-0.5 px-1.5 rounded text-[10px] font-black transition-all cursor-pointer ${
                currencyFilter === "UAH" ? "bg-sky-400 text-slate-950 font-black shadow-md" : "text-slate-300 hover:text-white"
              }`}
            >
              🇺🇦 ₴
            </button>
            <button
              type="button"
              onClick={() => setCurrencyFilter("USD")}
              className={`py-0.5 px-1.5 rounded text-[10px] font-black transition-all cursor-pointer ${
                currencyFilter === "USD" ? "bg-sky-400 text-slate-950 font-black shadow-md" : "text-slate-300 hover:text-white"
              }`}
            >
              🇺🇸 $
            </button>
            <button
              type="button"
              onClick={() => setCurrencyFilter("EUR")}
              className={`py-0.5 px-1.5 rounded text-[10px] font-black transition-all cursor-pointer ${
                currencyFilter === "EUR" ? "bg-sky-400 text-slate-950 font-black shadow-md" : "text-slate-300 hover:text-white"
              }`}
            >
              🇪🇺 €
            </button>
          </div>
        </div>
      </div>

      {/* Period Filter Card */}
      <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-2xl shadow-md flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-black text-slate-300">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>Період:</span>
            <span className="text-[11px] font-bold text-sky-300 bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 rounded-lg">
              {periodLabelText}
            </span>
          </div>

          {/* Quick period presets */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => { setPeriodType("all"); setSelectedYearFilter("ALL"); setSelectedMonth(""); }}
              className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                periodType === "all" && selectedYearFilter === "ALL"
                  ? "bg-sky-400 text-slate-950 shadow-sm"
                  : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              🌐 Весь час
            </button>
            <button
              type="button"
              onClick={() => setPeriodType("this_month")}
              className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                periodType === "this_month"
                  ? "bg-sky-400 text-slate-950 shadow-sm"
                  : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              📅 Цей місяць
            </button>
            <button
              type="button"
              onClick={() => setPeriodType("prev_month")}
              className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                periodType === "prev_month"
                  ? "bg-sky-400 text-slate-950 shadow-sm"
                  : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              ⏳ Минулий місяць
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriodType("month");
                if (!selectedMonth && allCombinedMonths.length > 0) {
                  setSelectedMonth(allCombinedMonths[0].sortKey);
                }
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                periodType === "month"
                  ? "bg-sky-400 text-slate-950 shadow-sm"
                  : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              📆 За місяцем
            </button>
            <button
              type="button"
              onClick={() => {
                setPeriodType("year");
                if (selectedYearFilter === "ALL" && availableYears.length > 0) {
                  setSelectedYearFilter(availableYears[0]);
                }
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                periodType === "year"
                  ? "bg-amber-400 text-slate-950 shadow-sm"
                  : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              🗓️ За роком
            </button>
            <button
              type="button"
              onClick={() => setPeriodType("custom")}
              className={`px-2 py-1 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                periodType === "custom"
                  ? "bg-violet-400 text-slate-950 shadow-sm"
                  : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              ⏱️ Період 📅
            </button>

            {(periodType !== "all" || selectedYearFilter !== "ALL") && (
              <button
                type="button"
                onClick={() => {
                  setPeriodType("all");
                  setSelectedYearFilter("ALL");
                  setSelectedMonth("");
                  setCustomStartDate("");
                  setCustomEndDate("");
                }}
                className="px-2 py-1 rounded-lg text-[10px] font-bold text-rose-400 hover:text-rose-300 bg-rose-950/40 border border-rose-500/20 transition-all cursor-pointer flex items-center gap-1"
                title="Скинути період"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Скинути
              </button>
            )}
          </div>
        </div>

        {/* Detailed inputs depending on periodType */}
        {periodType === "month" && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-800 animate-fadeIn">
            <span className="text-[11px] font-bold text-slate-400">Оберіть місяць:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-950 text-white border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-sky-500"
            >
              {allCombinedMonths.map((m) => (
                <option key={m.sortKey} value={m.sortKey}>
                  {m.label} ({m.sortKey})
                </option>
              ))}
            </select>
          </div>
        )}

        {periodType === "year" && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-800 animate-fadeIn">
            <span className="text-[11px] font-bold text-slate-400">Оберіть рік:</span>
            <select
              value={selectedYearFilter}
              onChange={(e) => setSelectedYearFilter(e.target.value)}
              className="bg-slate-950 text-white border border-slate-800 rounded-xl px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-amber-500"
            >
              {availableYears.map((yr) => (
                <option key={yr} value={yr}>
                  {yr} рік
                </option>
              ))}
            </select>
          </div>
        )}

        {periodType === "custom" && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800 animate-fadeIn">
            <span className="text-[11px] font-bold text-slate-400">З:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="bg-slate-950 text-white border border-slate-800 rounded-xl px-2 py-1 text-xs font-bold focus:outline-none focus:border-violet-500"
            />
            <span className="text-[11px] font-bold text-slate-400">По:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="bg-slate-950 text-white border border-slate-800 rounded-xl px-2 py-1 text-xs font-bold focus:outline-none focus:border-violet-500"
            />
          </div>
        )}
      </div>

      {/* Logical KPI Summary Header Cards (Displayed in Monthly view to avoid duplicating yearly analytics) */}
      {viewMode === "monthly" && (
        currencyFilter === "ALL" ? (
          /* MODE 1: ALL CURRENCIES COMBINED EQUIVALENT */
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Income KPI Card */}
            <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 p-3.5 rounded-2xl shadow-lg flex flex-col gap-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                Всього Зароблено {periodLabelText}
              </span>
              <div className="text-xl font-black text-emerald-300 tracking-tight mt-0.5">
                +{overallTotals.totalIncEquiv.toFixed(2)} <span className="text-sm font-bold text-emerald-400">{getCurrencySymbol(currentCurrency)}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-extrabold text-slate-400 border-t border-emerald-500/20 pt-1.5 mt-0.5">
                <span>🇺🇦 +{overallTotals.incUAH.toFixed(0)} ₴</span>
                {overallTotals.incUSD > 0 && <span>🇺🇸 +{overallTotals.incUSD.toFixed(0)} $</span>}
                {overallTotals.incEUR > 0 && <span>🇪🇺 +{overallTotals.incEUR.toFixed(0)} €</span>}
              </div>
            </div>

            {/* Expense KPI Card */}
            <div className="bg-gradient-to-br from-red-950/40 via-slate-900 to-slate-950 border border-red-500/30 p-3.5 rounded-2xl shadow-lg flex flex-col gap-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                Всього Витрачено {periodLabelText}
              </span>
              <div className="text-xl font-black text-red-300 tracking-tight mt-0.5">
                -{overallTotals.totalExpEquiv.toFixed(2)} <span className="text-sm font-bold text-red-400">{getCurrencySymbol(currentCurrency)}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-extrabold text-slate-400 border-t border-red-500/20 pt-1.5 mt-0.5">
                <span>🇺🇦 -{overallTotals.expUAH.toFixed(0)} ₴</span>
                {overallTotals.expUSD > 0 && <span>🇺🇸 -{overallTotals.expUSD.toFixed(0)} $</span>}
                {overallTotals.expEUR > 0 && <span>🇪🇺 -{overallTotals.expEUR.toFixed(0)} €</span>}
              </div>
            </div>

            {/* Net Profit KPI Card */}
            <div className={`p-3.5 rounded-2xl shadow-lg flex flex-col gap-1 border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 ${
              overallTotals.netEquiv >= 0 ? "border-sky-500/40" : "border-rose-500/40"
            }`}>
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">
                Чистий Прибуток {periodLabelText}
              </span>
              <div className={`text-xl font-black tracking-tight mt-0.5 ${overallTotals.netEquiv >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {overallTotals.netEquiv >= 0 ? "+" : ""}{overallTotals.netEquiv.toFixed(2)} <span className="text-sm font-bold">{getCurrencySymbol(currentCurrency)}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-extrabold border-t border-slate-800 pt-1.5 mt-0.5">
                <span className={overallTotals.netUAH >= 0 ? "text-emerald-400" : "text-red-400"}>🇺🇦 {overallTotals.netUAH >= 0 ? "+" : ""}{overallTotals.netUAH.toFixed(0)} ₴</span>
                {overallTotals.netUSD !== 0 && <span className={overallTotals.netUSD >= 0 ? "text-emerald-400" : "text-red-400"}>🇺🇸 {overallTotals.netUSD >= 0 ? "+" : ""}{overallTotals.netUSD.toFixed(0)} $</span>}
                {overallTotals.netEUR !== 0 && <span className={overallTotals.netEUR >= 0 ? "text-emerald-400" : "text-red-400"}>🇪🇺 {overallTotals.netEUR >= 0 ? "+" : ""}{overallTotals.netEUR.toFixed(0)} €</span>}
              </div>
            </div>
          </div>
        ) : (
          /* MODE 2: PURE NATIVE SINGLE CURRENCY MODE (UAH / USD / EUR) */
          (() => {
            const isUah = currencyFilter === "UAH";
            const isUsd = currencyFilter === "USD";
            const isEur = currencyFilter === "EUR";

            const curName = isUah ? "Гривні (UAH)" : isUsd ? "Доларах (USD)" : "Євро (EUR)";
            const sym = getCurrencySymbol(currencyFilter);

            const incVal = isUah ? overallTotals.incUAH : isUsd ? overallTotals.incUSD : overallTotals.incEUR;
            const expVal = isUah ? overallTotals.expUAH : isUsd ? overallTotals.expUSD : overallTotals.expEUR;
            const netVal = isUah ? overallTotals.netUAH : isUsd ? overallTotals.netUSD : overallTotals.netEUR;

            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Income */}
                <div className="bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 p-3.5 rounded-2xl shadow-lg flex flex-col gap-1">
                  <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    Зароблено в {curName} {periodLabelText}
                  </span>
                  <div className="text-xl font-black text-emerald-300 tracking-tight mt-0.5">
                    +{incVal.toFixed(2)} <span className="text-sm font-bold text-emerald-400">{sym}</span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 border-t border-emerald-500/20 pt-1.5 mt-0.5">
                    Сума доходів у {sym} {periodLabelText}
                  </div>
                </div>

                {/* Expense */}
                <div className="bg-gradient-to-br from-red-950/40 via-slate-900 to-slate-950 border border-red-500/30 p-3.5 rounded-2xl shadow-lg flex flex-col gap-1">
                  <span className="text-[11px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    Витрачено в {curName} {periodLabelText}
                  </span>
                  <div className="text-xl font-black text-red-300 tracking-tight mt-0.5">
                    -{expVal.toFixed(2)} <span className="text-sm font-bold text-red-400">{sym}</span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 border-t border-red-500/20 pt-1.5 mt-0.5">
                    Сума витрат у {sym} {periodLabelText}
                  </div>
                </div>

                {/* Net Profit */}
                <div className={`p-3.5 rounded-2xl shadow-lg flex flex-col gap-1 border bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 ${
                  netVal >= 0 ? "border-sky-500/40" : "border-rose-500/40"
                }`}>
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-300">
                    Чисте Сальдо в {curName} {periodLabelText}
                  </span>
                  <div className={`text-xl font-black tracking-tight mt-0.5 ${netVal >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {netVal >= 0 ? "+" : ""}{netVal.toFixed(2)} <span className="text-sm font-bold">{sym}</span>
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 border-t border-slate-800 pt-1.5 mt-0.5">
                    Різниця доходів та витрат у {sym} {periodLabelText}
                  </div>
                </div>
              </div>
            );
          })()
        )
      )}

      {/* Year Filter Pills & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        {/* Year Pills */}
        {availableYears.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedYearFilter("ALL")}
              className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer shrink-0 ${
                selectedYearFilter === "ALL"
                  ? "bg-sky-500 text-slate-950 shadow-sm"
                  : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
              }`}
            >
              Всі роки ({availableYears.length})
            </button>
            {availableYears.map((yr) => (
              <button
                key={yr}
                onClick={() => setSelectedYearFilter(yr)}
                className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer shrink-0 ${
                  selectedYearFilter === yr
                    ? "bg-sky-500 text-slate-950 shadow-sm"
                    : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                {yr} р.
              </button>
            ))}
          </div>
        )}

        {/* Live Search Input */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Пошук місяця за назвою..."
            className="w-full bg-slate-950 text-white placeholder-slate-500 text-xs pl-8 pr-7 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-sky-500 transition-all font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* VIEW MODE 1: MONTHLY VIEW */}
      {viewMode === "monthly" && (
        <div className="flex flex-col gap-3 pr-1">
          {loading && (
            <div className="text-center py-6 text-slate-500 font-semibold animate-pulse">
              Завантаження фінансових звітів...
            </div>
          )}

          {!loading && visibleMonths.length === 0 && (
            <div className="text-center py-8 text-slate-500 font-semibold bg-black/40 border border-slate-800 rounded-2xl">
              Звітів за вибраними параметрами не знайдено
            </div>
          )}

          {!loading &&
            visibleMonths.map((m) => {
              const uahNet = m.uah ? m.uah.inc - m.uah.exp : 0;
              const usdNet = m.usd ? m.usd.inc - m.usd.exp : 0;
              const eurNet = m.eur ? m.eur.inc - m.eur.exp : 0;

              const monthIncEquiv = 
                convertAmount(m.uah ? m.uah.inc : 0, "UAH", currentCurrency) +
                convertAmount(m.usd ? m.usd.inc : 0, "USD", currentCurrency) +
                convertAmount(m.eur ? m.eur.inc : 0, "EUR", currentCurrency);

              const monthExpEquiv = 
                convertAmount(m.uah ? m.uah.exp : 0, "UAH", currentCurrency) +
                convertAmount(m.usd ? m.usd.exp : 0, "USD", currentCurrency) +
                convertAmount(m.eur ? m.eur.exp : 0, "EUR", currentCurrency);

              const monthNetEquiv = monthIncEquiv - monthExpEquiv;

              if (currencyFilter === "ALL") {
                return (
                  <button
                    key={m.sortKey}
                    onClick={() => handleCardClick(m)}
                    className="p-4 bg-black border-2 border-slate-800 hover:border-sky-500/50 rounded-2xl flex flex-col gap-2.5 transition-all hover:scale-[1.005] active:scale-[0.99] text-left w-full shadow-md group cursor-pointer"
                  >
                    <div className="flex items-center justify-between border-b border-slate-900 pb-2 w-full">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-black text-white group-hover:text-sky-300 transition-colors">
                          {m.label}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded-md border border-slate-800">
                          {m.sortKey}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 text-[11px] font-black bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                          <span className="text-slate-400">Зведено:</span>
                          <span className={monthNetEquiv >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {monthNetEquiv >= 0 ? "+" : ""}{monthNetEquiv.toFixed(2)} {getCurrencySymbol(currentCurrency)}
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-sky-400 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>

                    {/* 3-Currency Breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full text-xs">
                      {/* UAH Card */}
                      <div className={`p-2 rounded-xl border flex flex-col gap-0.5 ${
                        m.uah && (m.uah.inc > 0 || m.uah.exp > 0)
                          ? "bg-slate-900/80 border-slate-800 text-slate-100"
                          : "bg-slate-950/40 border-slate-900 text-slate-500 opacity-60"
                      }`}>
                        <div className="flex items-center justify-between font-black">
                          <span>🇺🇦 UAH (₴)</span>
                          <span className={uahNet >= 0 ? "text-emerald-400 font-extrabold" : "text-red-400 font-extrabold"}>
                            {uahNet >= 0 ? "+" : ""}{uahNet.toFixed(2)} ₴
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                          <span className="text-emerald-400">+{m.uah ? m.uah.inc.toFixed(2) : "0"}</span>
                          <span className="text-red-400">-{m.uah ? m.uah.exp.toFixed(2) : "0"}</span>
                        </div>
                      </div>

                      {/* USD Card */}
                      <div className={`p-2 rounded-xl border flex flex-col gap-0.5 ${
                        m.usd && (m.usd.inc > 0 || m.usd.exp > 0)
                          ? "bg-slate-900/80 border-slate-800 text-slate-100"
                          : "bg-slate-950/40 border-slate-900 text-slate-500 opacity-60"
                      }`}>
                        <div className="flex items-center justify-between font-black">
                          <span>🇺🇸 USD ($)</span>
                          <span className={usdNet >= 0 ? "text-emerald-400 font-extrabold" : "text-red-400 font-extrabold"}>
                            {usdNet >= 0 ? "+" : ""}{usdNet.toFixed(2)} $
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                          <span className="text-emerald-400">+{m.usd ? m.usd.inc.toFixed(2) : "0"}</span>
                          <span className="text-red-400">-{m.usd ? m.usd.exp.toFixed(2) : "0"}</span>
                        </div>
                      </div>

                      {/* EUR Card */}
                      <div className={`p-2 rounded-xl border flex flex-col gap-0.5 ${
                        m.eur && (m.eur.inc > 0 || m.eur.exp > 0)
                          ? "bg-slate-900/80 border-slate-800 text-slate-100"
                          : "bg-slate-950/40 border-slate-900 text-slate-500 opacity-60"
                      }`}>
                        <div className="flex items-center justify-between font-black">
                          <span>🇪🇺 EUR (€)</span>
                          <span className={eurNet >= 0 ? "text-emerald-400 font-extrabold" : "text-red-400 font-extrabold"}>
                            {eurNet >= 0 ? "+" : ""}{eurNet.toFixed(2)} €
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                          <span className="text-emerald-400">+{m.eur ? m.eur.inc.toFixed(2) : "0"}</span>
                          <span className="text-red-400">-{m.eur ? m.eur.exp.toFixed(2) : "0"}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              }

              // Single native currency mode
              const rep = currencyFilter === "UAH" ? m.uah : currencyFilter === "USD" ? m.usd : m.eur;
              const incVal = rep ? rep.inc : 0;
              const expVal = rep ? rep.exp : 0;
              const netVal = incVal - expVal;
              const sym = getCurrencySymbol(currencyFilter);

              return (
                <button
                  key={m.sortKey}
                  onClick={() => handleCardClick(m)}
                  className="p-4 bg-black border-2 border-slate-800 hover:border-sky-500/50 rounded-2xl flex items-center justify-between gap-4 transition-all hover:scale-[1.005] active:scale-95 text-left w-full shadow-md group cursor-pointer"
                >
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="text-base font-black text-white group-hover:text-sky-300">
                      {m.label}
                    </span>
                    <div className="flex items-center gap-2 text-xs font-extrabold">
                      <span className="text-emerald-400">+{incVal.toFixed(2)} {sym}</span>
                      <span className="text-red-400">-{expVal.toFixed(2)} {sym}</span>
                      <span className={`px-2 py-0.5 rounded font-black border ${
                        netVal >= 0 ? "bg-emerald-950 border-emerald-500/30 text-emerald-300" : "bg-red-950 border-red-500/30 text-red-300"
                      }`}>
                        Сальдо: {netVal >= 0 ? "+" : ""}{netVal.toFixed(2)} {sym}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-sky-400 group-hover:translate-x-1 transition-transform" />
                </button>
              );
            })}
        </div>
      )}

      {/* VIEW MODE 2: HIGHLY VISUAL & CLEAR YEARLY COMPARATIVE ANALYTICS */}
      {viewMode === "yearly" && (
        <div className="flex flex-col gap-4 pr-1">
          {/* Explanation Header */}
          <div className="p-3 bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-950 border border-amber-500/30 rounded-2xl text-xs flex flex-col gap-1">
            <div className="flex items-center gap-2 text-amber-300 font-black text-sm">
              <BarChart3 className="w-4 h-4 text-amber-400" />
              <span>📊 Порівняльний аналіз доходів та витрат за всі роки</span>
            </div>
            <p className="text-slate-400 font-medium text-[11px] leading-relaxed">
              {currencyFilter === "ALL"
                ? `Підсумки сформовано по всіх 3 валютах у перерахунку в еквівалент ${currentCurrency} (${getCurrencySymbol(currentCurrency)}) за поточним курсом.`
                : `Відображено тільки суми операцій у валюті ${currencyFilter} (${getCurrencySymbol(currencyFilter)}).`
              }
            </p>
          </div>

          {/* Clean & Instructively Visual Year Cards */}
          <div className="flex flex-col gap-3">
            {yearlyData.map((y) => {
              const isExpanded = !!expandedYears[y.year];
              const curSym = getCurrencySymbol(currencyFilter === "ALL" ? currentCurrency : currencyFilter);

              const dispInc = currencyFilter === "UAH" ? y.incUAH : currencyFilter === "USD" ? y.incUSD : currencyFilter === "EUR" ? y.incEUR : y.totalIncEquiv;
              const dispExp = currencyFilter === "UAH" ? y.expUAH : currencyFilter === "USD" ? y.expUSD : currencyFilter === "EUR" ? y.expEUR : y.totalExpEquiv;
              const dispNet = dispInc - dispExp;

              const totalVolume = dispInc + dispExp;
              const incPercent = totalVolume > 0 ? Math.round((dispInc / totalVolume) * 100) : 50;
              const expPercent = totalVolume > 0 ? 100 - incPercent : 50;
              const isProfitable = dispNet >= 0;

              return (
                <div key={y.year} className="bg-slate-950 border-2 border-slate-800 hover:border-amber-500/40 rounded-2xl overflow-hidden shadow-xl transition-all">
                  {/* Top Bar for Year Card */}
                  <div className="p-4 bg-slate-900/90 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-500 text-slate-950 px-3 py-1.5 rounded-xl text-base font-black shadow-md">
                        {y.year} рік
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-black text-base">
                            Підсумок {y.year} року
                          </span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded border ${
                            isProfitable ? "bg-emerald-950 text-emerald-300 border-emerald-500/40" : "bg-rose-950 text-rose-300 border-rose-500/40"
                          }`}>
                            {isProfitable ? "🟢 Прибутковий" : "🔴 Збитковий"}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-semibold mt-0.5">
                          Активних місяців: {y.months.length} з 12
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Чистий Прибуток (Сальдо)</span>
                        <span className={`text-base font-black ${isProfitable ? "text-emerald-400" : "text-rose-400"}`}>
                          {isProfitable ? "+" : ""}{dispNet.toFixed(2)} {curSym}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleYearExpanded(y.year)}
                        className="text-xs font-black text-sky-400 hover:text-sky-300 bg-sky-950 hover:bg-sky-900 border border-sky-500/30 px-3 py-1.5 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
                      >
                        {isExpanded ? "Сховати місяці ▲" : "Місяці року ▾"}
                      </button>
                    </div>
                  </div>

                  {/* 3 Main KPIs for Year */}
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-black/60">
                    {/* Annual Income */}
                    <div className="p-3 bg-slate-900/80 border border-emerald-500/20 rounded-xl flex flex-col gap-0.5">
                      <div className="text-[10px] font-black uppercase text-emerald-400 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        Доходи за {y.year} рік
                      </div>
                      <div className="text-lg font-black text-emerald-300 mt-0.5">
                        +{dispInc.toFixed(2)} <span className="text-xs font-bold">{curSym}</span>
                      </div>
                      {currencyFilter === "ALL" && (
                        <div className="text-[10px] font-bold text-slate-400 mt-1 border-t border-slate-800 pt-1 flex flex-wrap gap-x-2">
                          <span>🇺🇦 {y.incUAH.toFixed(0)} ₴</span>
                          {y.incUSD > 0 && <span>🇺🇸 ${y.incUSD.toFixed(0)}</span>}
                          {y.incEUR > 0 && <span>🇪🇺 €{y.incEUR.toFixed(0)}</span>}
                        </div>
                      )}
                    </div>

                    {/* Annual Expense */}
                    <div className="p-3 bg-slate-900/80 border border-red-500/20 rounded-xl flex flex-col gap-0.5">
                      <div className="text-[10px] font-black uppercase text-red-400 flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                        Витрати за {y.year} рік
                      </div>
                      <div className="text-lg font-black text-red-300 mt-0.5">
                        -{dispExp.toFixed(2)} <span className="text-xs font-bold">{curSym}</span>
                      </div>
                      {currencyFilter === "ALL" && (
                        <div className="text-[10px] font-bold text-slate-400 mt-1 border-t border-slate-800 pt-1 flex flex-wrap gap-x-2">
                          <span>🇺🇦 {y.expUAH.toFixed(0)} ₴</span>
                          {y.expUSD > 0 && <span>🇺🇸 ${y.expUSD.toFixed(0)}</span>}
                          {y.expEUR > 0 && <span>🇪🇺 €{y.expEUR.toFixed(0)}</span>}
                        </div>
                      )}
                    </div>

                    {/* Annual Net Profit */}
                    <div className={`p-3 border rounded-xl flex flex-col gap-0.5 bg-slate-900/80 ${
                      isProfitable ? "border-sky-500/30" : "border-rose-500/30"
                    }`}>
                      <div className="text-[10px] font-black uppercase text-slate-300 flex items-center gap-1">
                        <Percent className="w-3.5 h-3.5 text-sky-400" />
                        Чисте сальдо за {y.year}
                      </div>
                      <div className={`text-lg font-black mt-0.5 ${isProfitable ? "text-emerald-400" : "text-rose-400"}`}>
                        {isProfitable ? "+" : ""}{dispNet.toFixed(2)} <span className="text-xs font-bold">{curSym}</span>
                      </div>
                      <div className="text-[10px] font-bold text-slate-400 mt-1 border-t border-slate-800 pt-1">
                        {dispInc > 0 ? `Рентабельність: ${((dispNet / dispInc) * 100).toFixed(1)}%` : "Ні операцій"}
                      </div>
                    </div>
                  </div>

                  {/* Visual Income vs Expense Ratio Progress Bar */}
                  {totalVolume > 0 && (
                    <div className="px-4 pb-3 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-400">
                        <span className="text-emerald-400">🟢 Доходи: {incPercent}%</span>
                        <span className="text-red-400">🔴 Витрати: {expPercent}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
                        <div
                          style={{ width: `${incPercent}%` }}
                          className="h-full bg-emerald-500 transition-all duration-500"
                          title={`Доходи: ${incPercent}%`}
                        />
                        <div
                          style={{ width: `${expPercent}%` }}
                          className="h-full bg-red-500 transition-all duration-500"
                          title={`Витрати: ${expPercent}%`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Expanded Months List */}
                  {isExpanded && (
                    <div className="p-3 border-t border-slate-800 flex flex-col gap-2 bg-slate-950">
                      <div className="text-xs font-black uppercase tracking-wider text-slate-300 mb-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-sky-400" />
                        <span>Місяці {y.year} року ({y.months.length}):</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {y.months.map((m) => {
                          const rep = currencyFilter === "UAH" ? m.uah : currencyFilter === "USD" ? m.usd : currencyFilter === "EUR" ? m.eur : (m.uah || m.usd || m.eur);
                          const inc = rep ? rep.inc : 0;
                          const exp = rep ? rep.exp : 0;
                          const net = inc - exp;

                          return (
                            <button
                              key={m.sortKey}
                              onClick={() => handleCardClick(m)}
                              className="p-3 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl flex items-center justify-between text-left transition-all cursor-pointer group shadow-sm"
                            >
                              <div className="flex flex-col gap-0.5">
                                <span className="text-xs font-black text-white group-hover:text-sky-300">
                                  {m.label}
                                </span>
                                <div className="flex items-center gap-2 text-[11px] font-bold">
                                  <span className="text-emerald-400">+{inc.toFixed(0)} {curSym}</span>
                                  <span className="text-red-400">-{exp.toFixed(0)} {curSym}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className={`text-xs font-black px-2 py-0.5 rounded border ${
                                  net >= 0 ? "bg-emerald-950 border-emerald-500/30 text-emerald-400" : "bg-red-950 border-red-500/30 text-red-400"
                                }`}>
                                  {net >= 0 ? "+" : ""}{net.toFixed(0)} {curSym}
                                </span>
                                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-sky-300 group-hover:translate-x-0.5 transition-transform" />
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Clean Summary Table at Bottom */}
          <div className="bg-slate-950 border-2 border-slate-800 p-3.5 rounded-2xl flex flex-col gap-2 shadow-xl">
            <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <span>Зведена порівняльна таблиця за всі роки</span>
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse min-w-[450px]">
                <thead>
                  <tr className="bg-slate-900 text-slate-300 font-black border-b border-slate-800">
                    <th className="py-2 px-3">Рік</th>
                    <th className="py-2 px-3 text-emerald-400">Всього Доходів</th>
                    <th className="py-2 px-3 text-red-400">Всього Витрат</th>
                    <th className="py-2 px-3 text-sky-400">Чисте Сальдо</th>
                    <th className="py-2 px-3 text-right text-amber-300">Рентабельність</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-850">
                  {yearlyData.map((y) => {
                    const curSym = getCurrencySymbol(currencyFilter === "ALL" ? currentCurrency : currencyFilter);
                    const dispInc = currencyFilter === "UAH" ? y.incUAH : currencyFilter === "USD" ? y.incUSD : currencyFilter === "EUR" ? y.incEUR : y.totalIncEquiv;
                    const dispExp = currencyFilter === "UAH" ? y.expUAH : currencyFilter === "USD" ? y.expUSD : currencyFilter === "EUR" ? y.expEUR : y.totalExpEquiv;
                    const dispNet = dispInc - dispExp;
                    const margin = dispInc > 0 ? ((dispNet / dispInc) * 100).toFixed(1) : "0.0";

                    return (
                      <tr key={y.year} className="hover:bg-slate-900/60 transition-colors font-medium">
                        <td className="py-2.5 px-3 font-black text-white text-sm">
                          {y.year} рік
                        </td>
                        <td className="py-2.5 px-3 font-bold text-emerald-400">
                          +{dispInc.toFixed(2)} {curSym}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-red-400">
                          -{dispExp.toFixed(2)} {curSym}
                        </td>
                        <td className={`py-2.5 px-3 font-black ${dispNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {dispNet >= 0 ? "+" : ""}{dispNet.toFixed(2)} {curSym}
                        </td>
                        <td className="py-2.5 px-3 text-right font-black text-slate-300">
                          {margin}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 3: DETAILED CATEGORY REPORT WITH TOTAL SUMS & DRILL-DOWN */}
      {viewMode === "categories" && (() => {
        const curSym = getCurrencySymbol(currencyFilter === "ALL" ? currentCurrency : currencyFilter);

        const incCats = categoryReportData.filter(c => {
          if (currencyFilter === "UAH") return c.incUAH > 0;
          if (currencyFilter === "USD") return c.incUSD > 0;
          if (currencyFilter === "EUR") return c.incEUR > 0;
          return c.incEquiv > 0;
        }).sort((a, b) => {
          const sA = currencyFilter === "UAH" ? a.incUAH : currencyFilter === "USD" ? a.incUSD : currencyFilter === "EUR" ? a.incEUR : a.incEquiv;
          const sB = currencyFilter === "UAH" ? b.incUAH : currencyFilter === "USD" ? b.incUSD : currencyFilter === "EUR" ? b.incEUR : b.incEquiv;
          return sB - sA;
        });

        const expCats = categoryReportData.filter(c => {
          if (currencyFilter === "UAH") return c.expUAH > 0;
          if (currencyFilter === "USD") return c.expUSD > 0;
          if (currencyFilter === "EUR") return c.expEUR > 0;
          return c.expEquiv > 0;
        }).sort((a, b) => {
          const sA = currencyFilter === "UAH" ? a.expUAH : currencyFilter === "USD" ? a.expUSD : currencyFilter === "EUR" ? a.expEUR : a.expEquiv;
          const sB = currencyFilter === "UAH" ? b.expUAH : currencyFilter === "USD" ? b.expUSD : currencyFilter === "EUR" ? b.expEUR : b.expEquiv;
          return sB - sA;
        });

        const totalFilteredInc = incCats.reduce((acc, c) => {
          const val = currencyFilter === "UAH" ? c.incUAH : currencyFilter === "USD" ? c.incUSD : currencyFilter === "EUR" ? c.incEUR : c.incEquiv;
          return acc + val;
        }, 0);

        const totalFilteredExp = expCats.reduce((acc, c) => {
          const val = currencyFilter === "UAH" ? c.expUAH : currencyFilter === "USD" ? c.expUSD : currencyFilter === "EUR" ? c.expEUR : c.expEquiv;
          return acc + val;
        }, 0);

        const totalIncUAH = incCats.reduce((acc, c) => acc + c.incUAH, 0);
        const totalIncUSD = incCats.reduce((acc, c) => acc + c.incUSD, 0);
        const totalIncEUR = incCats.reduce((acc, c) => acc + c.incEUR, 0);

        const totalExpUAH = expCats.reduce((acc, c) => acc + c.expUAH, 0);
        const totalExpUSD = expCats.reduce((acc, c) => acc + c.expUSD, 0);
        const totalExpEUR = expCats.reduce((acc, c) => acc + c.expEUR, 0);

        const totalTurnoverUAH = totalIncUAH + totalExpUAH;
        const totalTurnoverUSD = totalIncUSD + totalExpUSD;
        const totalTurnoverEUR = totalIncEUR + totalExpEUR;

        const totalNetUAH = totalIncUAH - totalExpUAH;
        const totalNetUSD = totalIncUSD - totalExpUSD;
        const totalNetEUR = totalIncEUR - totalExpEUR;

        const totalFilteredNet = totalFilteredInc - totalFilteredExp;
        const totalFilteredTurnover = totalFilteredInc + totalFilteredExp;
        const totalFilteredCount = categoryReportData.reduce((acc, c) => {
          const matching = c.items.filter(it => currencyFilter === "ALL" || (it.curr || "UAH") === currencyFilter);
          return acc + matching.length;
        }, 0);

        return (
          <div className="flex flex-col gap-4 pr-1 animate-fadeIn">
            {periodType === "month" && selectedMonth && (
              <div className="flex items-center justify-between p-3 bg-sky-950/60 border border-sky-500/40 rounded-2xl text-xs text-sky-200 shadow-md animate-fadeIn">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>Обраний місяць: <strong className="text-white font-extrabold">{periodLabelText}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPeriodType("all");
                    setSelectedMonth("all");
                    setViewMode("monthly");
                  }}
                  className="text-xs font-bold text-sky-300 hover:text-white bg-sky-900/60 hover:bg-sky-800 px-3 py-1.5 rounded-xl border border-sky-500/40 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                >
                  <span>← Всі місяці</span>
                </button>
              </div>
            )}
            {/* Filter controls row */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-slate-900 border border-slate-800 p-2.5 rounded-2xl shadow-md">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Шукати статтю або операцію..."
                  className="w-full bg-slate-950 text-white placeholder-slate-500 text-xs pl-9 pr-8 py-2 rounded-xl border border-slate-800 focus:outline-none focus:border-violet-500 font-medium"
                />
                {categorySearch && (
                  <button
                    onClick={() => setCategorySearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category Dropdown Filter */}
              <div className="shrink-0">
                <select
                  value={categorySelectFilter}
                  onChange={(e) => setCategorySelectFilter(e.target.value)}
                  className="w-full sm:w-auto bg-slate-950 text-white border border-slate-800 rounded-xl px-2.5 py-2 text-xs font-bold focus:outline-none focus:border-violet-500"
                >
                  <option value="all">Усі категорії ({allCategoryData.length})</option>
                  {allCategoryData.map(c => (
                    <option key={c.name} value={c.name}>🏷️ {c.name} ({c.items.length})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setCategoryTypeFilter("all")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    categoryTypeFilter === "all" ? "bg-violet-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Всі
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryTypeFilter("inc")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    categoryTypeFilter === "inc" ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  🟢 Доходи
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryTypeFilter("exp")}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ${
                    categoryTypeFilter === "exp" ? "bg-rose-600 text-white shadow-sm" : "text-slate-400 hover:text-white"
                  }`}
                >
                  🔴 Витрати
                </button>
              </div>
            </div>

            {/* Prominent Total Sum Dashboard Card */}
            <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-2 border-violet-500/50 p-4 rounded-2xl shadow-xl flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs font-black uppercase tracking-wider text-slate-300 border-b border-slate-800/80 pb-2">
                <span className="flex items-center gap-1.5 text-violet-300">
                  <Tag className="w-4 h-4 text-violet-400" />
                  {categorySelectFilter !== "all" 
                    ? `Сума за категорією «${categorySelectFilter}» ${periodLabelText}:` 
                    : `Загальна сума за категоріями ${periodLabelText}:`}
                </span>
                <span className="text-[11px] text-violet-300 font-mono font-bold">
                  {totalFilteredCount} операцій • {categoryReportData.length} категорій
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div className="bg-emerald-950/30 border border-emerald-500/20 p-3 rounded-xl flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">Всього доходів:</span>
                  <span className="text-base sm:text-lg font-black text-emerald-300 font-mono">
                    +{totalFilteredInc.toFixed(2)} {curSym}
                  </span>
                  {currencyFilter === "ALL" && (totalIncUSD > 0 || totalIncEUR > 0) && (
                    <div className="text-[10px] font-bold text-emerald-400/80 flex flex-wrap gap-x-1.5 pt-0.5 border-t border-emerald-500/20">
                      <span>🇺🇦 {totalIncUAH.toFixed(0)} ₴</span>
                      {totalIncUSD > 0 && <span>🇺🇸 ${totalIncUSD.toFixed(0)}</span>}
                      {totalIncEUR > 0 && <span className="text-sky-300 font-black">🇪🇺 €{totalIncEUR.toFixed(0)}</span>}
                    </div>
                  )}
                </div>
                <div className="bg-rose-950/30 border border-rose-500/20 p-3 rounded-xl flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-rose-400">Всього витрат:</span>
                  <span className="text-base sm:text-lg font-black text-rose-300 font-mono">
                    -{totalFilteredExp.toFixed(2)} {curSym}
                  </span>
                  {currencyFilter === "ALL" && (totalExpUSD > 0 || totalExpEUR > 0) && (
                    <div className="text-[10px] font-bold text-rose-400/80 flex flex-wrap gap-x-1.5 pt-0.5 border-t border-rose-500/20">
                      <span>🇺🇦 {totalExpUAH.toFixed(0)} ₴</span>
                      {totalExpUSD > 0 && <span>🇺🇸 ${totalExpUSD.toFixed(0)}</span>}
                      {totalExpEUR > 0 && <span className="text-sky-300 font-black">🇪🇺 €{totalExpEUR.toFixed(0)}</span>}
                    </div>
                  )}
                </div>
                <div className="bg-slate-900 border border-slate-800 p-3 rounded-xl flex flex-col gap-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Чисте сальдо:</span>
                  <span className={`text-base sm:text-lg font-black font-mono ${totalFilteredNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {totalFilteredNet >= 0 ? "+" : ""}{totalFilteredNet.toFixed(2)} {curSym}
                  </span>
                  {currencyFilter === "ALL" && (totalIncUSD > 0 || totalExpUSD > 0 || totalIncEUR > 0 || totalExpEUR > 0) && (
                    <div className="text-[10px] font-bold text-slate-400 flex flex-wrap gap-x-1.5 pt-0.5 border-t border-slate-800">
                      <span>🇺🇦 {totalNetUAH.toFixed(0)} ₴</span>
                      {(totalIncUSD > 0 || totalExpUSD > 0) && <span>🇺🇸 ${totalNetUSD.toFixed(0)}</span>}
                      {(totalIncEUR > 0 || totalExpEUR > 0) && <span className="text-sky-300 font-black">🇪🇺 €{totalNetEUR.toFixed(0)}</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Income Categories Section */}
            {(categoryTypeFilter === "all" || categoryTypeFilter === "inc") && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4" /> Доходи за категоріями ({incCats.length}):
                  </span>
                  <span className="text-xs font-black text-emerald-400 font-mono">
                    +{totalFilteredInc.toFixed(2)} {curSym}
                  </span>
                </div>

                {incCats.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs bg-slate-900/30 border border-dashed border-slate-800 rounded-xl">
                    Немає доходів за обраними критеріями
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {incCats.map(cat => {
                      const sum = currencyFilter === "UAH" ? cat.incUAH : currencyFilter === "USD" ? cat.incUSD : currencyFilter === "EUR" ? cat.incEUR : cat.incEquiv;
                      const percent = totalFilteredInc > 0 ? ((sum / totalFilteredInc) * 100).toFixed(1) : "0.0";
                      const isExpanded = !!expandedCategories[`inc-${cat.name}`];
                      const incItems = cat.items.filter(it => it.type === "inc" && (currencyFilter === "ALL" || (it.curr || "UAH") === currencyFilter));

                      return (
                        <div key={`inc-${cat.name}`} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-all hover:border-slate-700">
                          <div 
                            onClick={() => setExpandedCategories(prev => ({ ...prev, [`inc-${cat.name}`]: !prev[`inc-${cat.name}`] }))}
                            className="p-3.5 flex items-center justify-between cursor-pointer gap-2"
                          >
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-xs font-extrabold text-white flex items-center gap-1.5 truncate">
                                <span>🏷️ {cat.name}</span>
                                <span className="text-[10px] text-slate-500 font-normal">({incItems.length} оп.)</span>
                              </span>
                              <div className="w-36 bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                                <div style={{ width: `${percent}%` }} className="bg-emerald-500 h-full rounded-full" />
                              </div>
                              {currencyFilter === "ALL" && (cat.incUSD > 0 || cat.incEUR > 0) && (
                                <div className="text-[10px] font-bold text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
                                  {cat.incUAH > 0 && <span>🇺🇦 {cat.incUAH.toFixed(2)} ₴</span>}
                                  {cat.incUSD > 0 && <span>🇺🇸 ${cat.incUSD.toFixed(2)}</span>}
                                  {cat.incEUR > 0 && <span className="text-sky-300 font-black">🇪🇺 €{cat.incEUR.toFixed(2)}</span>}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <div className="text-right">
                                <div className="text-xs font-black text-emerald-400 font-mono">
                                  +{sum.toFixed(2)} {curSym}
                                </div>
                                <div className="text-[10px] text-slate-500 font-semibold font-mono">
                                  {percent}% від доходів
                                </div>
                              </div>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="bg-slate-950 p-3 border-t border-slate-800/80 flex flex-col gap-2">
                              {incItems.map((it, idx) => {
                                const itSym = it.curr === "USD" ? "$" : it.curr === "EUR" ? "€" : "₴";
                                const details = parseReportItemDetails(it);
                                return (
                                  <div key={idx} className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 flex flex-col gap-2 hover:border-slate-700 transition-all shadow-sm">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[11px] font-mono font-bold text-slate-300 flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                                          <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                          {details.cleanDate}
                                        </span>
                                        {details.contractor && (
                                          <span className="text-[10px] font-black text-sky-300 bg-sky-950/70 border border-sky-600/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                                            👤 {details.contractor}
                                          </span>
                                        )}
                                        {details.bank && (
                                          <span className="text-[10px] font-bold text-slate-300 bg-slate-950/90 border border-slate-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                                            💳 {details.bank}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-xs sm:text-sm font-black text-emerald-400 font-mono shrink-0 ml-auto">
                                        +{it.sum.toFixed(2)} {itSym}
                                      </span>
                                    </div>

                                    {details.comment ? (
                                      <div className="text-xs text-amber-200/95 bg-amber-500/10 border border-amber-500/25 px-3 py-2 rounded-lg leading-relaxed break-words whitespace-pre-wrap flex items-start gap-2 shadow-inner">
                                        <span className="text-amber-400 shrink-0 mt-0.5 text-xs">💬</span>
                                        <span className="flex-1 font-medium select-text">{details.comment}</span>
                                      </div>
                                    ) : details.cleanDescription ? (
                                      <div className="text-[11px] text-slate-300 bg-slate-950/60 border border-slate-850 px-2.5 py-1.5 rounded-lg leading-relaxed break-words whitespace-pre-wrap">
                                        {details.cleanDescription}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Expense Categories Section */}
            {(categoryTypeFilter === "all" || categoryTypeFilter === "exp") && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4" /> Витрати за категоріями ({expCats.length}):
                  </span>
                  <span className="text-xs font-black text-rose-400 font-mono">
                    -{totalFilteredExp.toFixed(2)} {curSym}
                  </span>
                </div>

                {expCats.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-xs bg-slate-900/30 border border-dashed border-slate-800 rounded-xl">
                    Немає витрат за обраними критеріями
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {expCats.map(cat => {
                      const sum = currencyFilter === "UAH" ? cat.expUAH : currencyFilter === "USD" ? cat.expUSD : currencyFilter === "EUR" ? cat.expEUR : cat.expEquiv;
                      const percent = totalFilteredExp > 0 ? ((sum / totalFilteredExp) * 100).toFixed(1) : "0.0";
                      const isExpanded = !!expandedCategories[`exp-${cat.name}`];
                      const expItems = cat.items.filter(it => it.type === "exp" && (currencyFilter === "ALL" || (it.curr || "UAH") === currencyFilter));

                      return (
                        <div key={`exp-${cat.name}`} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-all hover:border-slate-700">
                          <div 
                            onClick={() => setExpandedCategories(prev => ({ ...prev, [`exp-${cat.name}`]: !prev[`exp-${cat.name}`] }))}
                            className="p-3.5 flex items-center justify-between cursor-pointer gap-2"
                          >
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-xs font-extrabold text-white flex items-center gap-1.5 truncate">
                                <span>🏷️ {cat.name}</span>
                                <span className="text-[10px] text-slate-500 font-normal">({expItems.length} оп.)</span>
                              </span>
                              <div className="w-36 bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                                <div style={{ width: `${percent}%` }} className="bg-rose-500 h-full rounded-full" />
                              </div>
                              {currencyFilter === "ALL" && (cat.expUSD > 0 || cat.expEUR > 0) && (
                                <div className="text-[10px] font-bold text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
                                  {cat.expUAH > 0 && <span>🇺🇦 {cat.expUAH.toFixed(2)} ₴</span>}
                                  {cat.expUSD > 0 && <span>🇺🇸 ${cat.expUSD.toFixed(2)}</span>}
                                  {cat.expEUR > 0 && <span className="text-sky-300 font-black">🇪🇺 €{cat.expEUR.toFixed(2)}</span>}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              <div className="text-right">
                                <div className="text-xs font-black text-rose-400 font-mono">
                                  -{sum.toFixed(2)} {curSym}
                                </div>
                                <div className="text-[10px] text-slate-500 font-semibold font-mono">
                                  {percent}% від витрат
                                </div>
                              </div>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="bg-slate-950 p-3 border-t border-slate-800/80 flex flex-col gap-2">
                              {expItems.map((it, idx) => {
                                const itSym = it.curr === "USD" ? "$" : it.curr === "EUR" ? "€" : "₴";
                                const details = parseReportItemDetails(it);
                                return (
                                  <div key={idx} className="bg-slate-900/90 rounded-xl p-3 border border-slate-800 flex flex-col gap-2 hover:border-slate-700 transition-all shadow-sm">
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-[11px] font-mono font-bold text-slate-300 flex items-center gap-1 bg-slate-950 px-2 py-0.5 rounded-md border border-slate-800">
                                          <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                          {details.cleanDate}
                                        </span>
                                        {details.contractor && (
                                          <span className="text-[10px] font-black text-sky-300 bg-sky-950/70 border border-sky-600/40 px-2 py-0.5 rounded-md flex items-center gap-1">
                                            👤 {details.contractor}
                                          </span>
                                        )}
                                        {details.bank && (
                                          <span className="text-[10px] font-bold text-slate-300 bg-slate-950/90 border border-slate-800 px-2 py-0.5 rounded-md flex items-center gap-1">
                                            💳 {details.bank}
                                          </span>
                                        )}
                                      </div>
                                      <span className="text-xs sm:text-sm font-black text-rose-400 font-mono shrink-0 ml-auto">
                                        -{it.sum.toFixed(2)} {itSym}
                                      </span>
                                    </div>

                                    {details.comment ? (
                                      <div className="text-xs text-amber-200/95 bg-amber-500/10 border border-amber-500/25 px-3 py-2 rounded-lg leading-relaxed break-words whitespace-pre-wrap flex items-start gap-2 shadow-inner">
                                        <span className="text-amber-400 shrink-0 mt-0.5 text-xs">💬</span>
                                        <span className="flex-1 font-medium select-text">{details.comment}</span>
                                      </div>
                                    ) : details.cleanDescription ? (
                                      <div className="text-[11px] text-slate-300 bg-slate-950/60 border border-slate-850 px-2.5 py-1.5 rounded-lg leading-relaxed break-words whitespace-pre-wrap">
                                        {details.cleanDescription}
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* 4. DEBTORS & CONTRACTORS REGISTRY (BLOCK 3 - MULTI-CURRENCY) */}
      {viewMode === "debtors" && (
        <div className="flex flex-col gap-4 animate-fadeIn">
          {/* Header & Copy */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 sm:p-4 rounded-2xl border border-slate-800">
            <div>
              <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-purple-400" />
                Реєстр боргів та контрагентів ({masterContractorsList.length})
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Повний облік заборгованостей у ₴ UAH, $ USD, € EUR з розрахунком підсумкового еквіваленту
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const text = `👥 Реєстр боргів та контрагентів:\n` +
                    `🟢 Нам винні: +${debtorTotals.totalOweUsEquiv.toFixed(2)} ₴ екв (+${debtorTotals.oweUsUah.toFixed(2)} ₴, +${debtorTotals.oweUsUsd.toFixed(2)} $, +${debtorTotals.oweUsEur.toFixed(2)} €)\n` +
                    `🔴 Ми винні: -${debtorTotals.totalWeOweEquiv.toFixed(2)} ₴ екв (-${debtorTotals.weOweUah.toFixed(2)} ₴, -${debtorTotals.weOweUsd.toFixed(2)} $, -${debtorTotals.weOweEur.toFixed(2)} €)\n` +
                    `💼 Чисте сальдо боргів: ${debtorTotals.netBalanceEquiv >= 0 ? "+" : ""}${debtorTotals.netBalanceEquiv.toFixed(2)} ₴ екв\n\n` +
                    masterContractorsList.map(c => `• ${c.name}: UAH: ${c.uah.toFixed(2)} ₴ | USD: ${c.usd.toFixed(2)} $ | EUR: ${c.eur.toFixed(2)} € => Еквів: ${c.netUahEquiv.toFixed(2)} ₴`).join("\n");
                  navigator.clipboard.writeText(text).then(() => {
                    setIsCopiedContractors(true);
                    setTimeout(() => setIsCopiedContractors(false), 2000);
                  });
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all border border-slate-700 flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
              >
                {isCopiedContractors ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{isCopiedContractors ? "Скопійовано!" : "Скопіювати"}</span>
              </button>
            </div>
          </div>

          {/* 3 KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Owe Us */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/30 flex flex-col gap-1 shadow-md">
              <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider flex items-center gap-1">
                <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400" />
                Нам винні (Дебітори)
              </span>
              <div className="text-lg font-black text-emerald-300 font-mono mt-0.5">
                +{debtorTotals.totalOweUsEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold border-t border-emerald-500/20 pt-1 mt-0.5">
                <span>🇺🇦 +{debtorTotals.oweUsUah.toLocaleString("uk-UA")} ₴</span>
                {debtorTotals.oweUsUsd > 0 && <span>🇺🇸 +{debtorTotals.oweUsUsd.toLocaleString("uk-UA")} $</span>}
                {debtorTotals.oweUsEur > 0 && <span>🇪🇺 +{debtorTotals.oweUsEur.toLocaleString("uk-UA")} €</span>}
              </div>
            </div>

            {/* We Owe */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 border border-rose-500/30 flex flex-col gap-1 shadow-md">
              <span className="text-[10px] font-black uppercase text-rose-400 tracking-wider flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
                Ми винні (Кредитори)
              </span>
              <div className="text-lg font-black text-rose-300 font-mono mt-0.5">
                -{debtorTotals.totalWeOweEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold border-t border-rose-500/20 pt-1 mt-0.5">
                <span>🇺🇦 -{debtorTotals.weOweUah.toLocaleString("uk-UA")} ₴</span>
                {debtorTotals.weOweUsd > 0 && <span>🇺🇸 -{debtorTotals.weOweUsd.toLocaleString("uk-UA")} $</span>}
                {debtorTotals.weOweEur > 0 && <span>🇪🇺 -{debtorTotals.weOweEur.toLocaleString("uk-UA")} €</span>}
              </div>
            </div>

            {/* Net Debts */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col gap-1 shadow-md">
              <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-sky-400" />
                Чистий баланс боргів
              </span>
              <div className={`text-lg font-black font-mono mt-0.5 ${debtorTotals.netBalanceEquiv >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {debtorTotals.netBalanceEquiv >= 0 ? "+" : ""}{debtorTotals.netBalanceEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
              </div>
              <div className="text-[10px] text-slate-400 font-bold border-t border-slate-800 pt-1 mt-0.5">
                {debtorTotals.netBalanceEquiv >= 0 ? "🟢 Позитивне сальдо (нам винні більше)" : "🔴 Негативне сальдо (ми винні більше)"}
              </div>
            </div>
          </div>

          {/* Filter Bar & Search */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-950 p-2.5 rounded-2xl border border-slate-850">
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-bold">
              <button
                type="button"
                onClick={() => setContractorTabFilter("all")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  contractorTabFilter === "all" ? "bg-sky-500 text-slate-950 font-black shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Усі ({masterContractorsList.length})
              </button>
              <button
                type="button"
                onClick={() => setContractorTabFilter("oweUs")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  contractorTabFilter === "oweUs" ? "bg-emerald-500 text-slate-950 font-black shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Нам винні
              </button>
              <button
                type="button"
                onClick={() => setContractorTabFilter("weOwe")}
                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                  contractorTabFilter === "weOwe" ? "bg-rose-500 text-slate-950 font-black shadow-sm" : "text-slate-400 hover:text-white"
                }`}
              >
                Ми винні
              </button>
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Пошук контрагента..."
                value={contractorSearch}
                onChange={(e) => setContractorSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl text-xs text-white pl-8 pr-8 py-2 outline-none focus:border-sky-500 transition-all font-bold"
              />
              {contractorSearch && (
                <button
                  type="button"
                  onClick={() => setContractorSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Master Multi-Currency Contractor Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-950 text-slate-400 font-black uppercase text-[10px] tracking-wider border-b border-slate-800">
                    <th className="p-3">Контрагент / Боржник</th>
                    <th className="p-3 text-right">Борг в UAH (₴)</th>
                    <th className="p-3 text-right">Борг в USD ($)</th>
                    <th className="p-3 text-right">Борг в EUR (€)</th>
                    <th className="p-3 text-right">Еквів. UAH (₴)</th>
                    <th className="p-3 text-right">Еквів. USD ($)</th>
                    <th className="p-3 text-right">Еквів. EUR (€)</th>
                    <th className="p-3 text-center">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium">
                  {filteredContractors.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-500 italic">
                        {contractorSearch ? "Контрагентів не знайдено за пошуковим запитом" : "Записів заборгованостей не знайдено"}
                      </td>
                    </tr>
                  ) : (
                    filteredContractors.map((c, idx) => {
                      const isOweUs = c.netUahEquiv > 0.01;
                      const isWeOwe = c.netUahEquiv < -0.01;

                      return (
                        <tr 
                          key={idx} 
                          onClick={() => onNavigateToContractorReport?.(c.name)}
                          className="hover:bg-slate-800/60 cursor-pointer transition-all group"
                          title={`Відкрити детальний звіт для "${c.name}"`}
                        >
                          <td className="p-3 font-black text-white flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-sky-400 shrink-0 group-hover:scale-110 transition-transform" />
                            <span className="group-hover:underline text-xs sm:text-sm">{c.name}</span>
                          </td>

                          {/* UAH debt */}
                          <td className={`p-3 text-right font-mono font-bold ${
                            c.uah > 0 ? "text-emerald-400" : c.uah < 0 ? "text-rose-400" : "text-slate-500"
                          }`}>
                            {c.uah > 0 ? `+${c.uah.toLocaleString("uk-UA")}` : c.uah < 0 ? c.uah.toLocaleString("uk-UA") : "—"}
                          </td>

                          {/* USD debt */}
                          <td className={`p-3 text-right font-mono font-bold ${
                            c.usd > 0 ? "text-emerald-400" : c.usd < 0 ? "text-rose-400" : "text-slate-500"
                          }`}>
                            {c.usd > 0 ? `+${c.usd.toLocaleString("uk-UA")}` : c.usd < 0 ? c.usd.toLocaleString("uk-UA") : "—"}
                          </td>

                          {/* EUR debt */}
                          <td className={`p-3 text-right font-mono font-bold ${
                            c.eur > 0 ? "text-emerald-400" : c.eur < 0 ? "text-rose-400" : "text-slate-500"
                          }`}>
                            {c.eur > 0 ? `+${c.eur.toLocaleString("uk-UA")}` : c.eur < 0 ? c.eur.toLocaleString("uk-UA") : "—"}
                          </td>

                          {/* UAH Equiv */}
                          <td className={`p-3 text-right font-mono font-black ${
                            isOweUs ? "text-emerald-400" : isWeOwe ? "text-rose-400" : "text-slate-400"
                          }`}>
                            {isOweUs ? `+${c.netUahEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴` : c.netUahEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* USD Equiv */}
                          <td className={`p-3 text-right font-mono font-black ${
                            isOweUs ? "text-emerald-300" : isWeOwe ? "text-rose-300" : "text-slate-400"
                          }`}>
                            {isOweUs ? `+${c.netUsdEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $` : c.netUsdEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* EUR Equiv */}
                          <td className={`p-3 text-right font-mono font-black ${
                            isOweUs ? "text-emerald-300" : isWeOwe ? "text-rose-300" : "text-slate-400"
                          }`}>
                            {isOweUs ? `+${c.netEurEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : c.netEurEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          {/* Status Badge */}
                          <td className="p-3 text-center">
                            {isOweUs ? (
                              <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-black px-2.5 py-1 rounded-lg">
                                Нам винен
                              </span>
                            ) : isWeOwe ? (
                              <span className="bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-black px-2.5 py-1 rounded-lg">
                                Ми винні
                              </span>
                            ) : (
                              <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-lg">
                                Розраховано
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 5. ACCOUNTS & CASH DYNAMICS */}
      {viewMode === "accounts" && (() => {
        const banksMap = initData?.allBankDetails?.[(currencyFilter === "ALL" ? currentCurrency : currencyFilter) as "UAH" | "USD" | "EUR"] || initData?.capital?.banks || {};
        const aliases = initData?.allAliases?.[(currencyFilter === "ALL" ? currentCurrency : currencyFilter) as "UAH" | "USD" | "EUR"] || {};
        const curSym = getCurrencySymbol(currencyFilter === "ALL" ? currentCurrency : currencyFilter);

        const accountEntries = Object.entries(banksMap).map(([rawKey, val]) => {
          const alias = aliases[rawKey] || rawKey;
          const numVal = Number(val) || 0;
          return { rawKey, alias, val: numVal };
        });

        const totalAccountsVal = accountEntries.reduce((sum, a) => sum + a.val, 0);

        return (
          <div className="flex flex-col gap-4 animate-fadeIn">
            <div className="bg-slate-900/60 p-3 sm:p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-black text-white flex items-center gap-2">
                  <CreditCard className="w-4.5 h-4.5 text-emerald-400" />
                  Рух коштів по банківських рахунках та готівці
                </h2>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Баланси та операції за кожним окремим рахунком у {currencyFilter === "ALL" ? currentCurrency : currencyFilter}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">Загальний залишок:</span>
                <span className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                  {totalAccountsVal.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {curSym}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {accountEntries.map((acc, aIdx) => (
                <div key={aIdx} className="p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 flex flex-col justify-between gap-3 shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-white flex items-center gap-2">
                      <span className="text-base">{acc.alias.includes("Готівка") ? "💵" : "🏦"}</span>
                      <span>{acc.alias}</span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 font-bold">{acc.rawKey}</span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Поточний баланс:</span>
                    <span className={`text-xl font-black font-mono ${acc.val >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {acc.val.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {curSym}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
