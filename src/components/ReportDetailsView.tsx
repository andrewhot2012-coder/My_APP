import React, { useState, useMemo } from "react";
import { 
  ArrowLeft, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  User, 
  CreditCard, 
  ExternalLink, 
  X, 
  ChevronRight, 
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Fingerprint,
  Printer,
  Layers,
  FileText,
  Search
} from "lucide-react";
import { MonthlyReportItem, InitData } from "../types";
import { 
  parseTransactionText, 
  getDirectImageUrl, 
  replaceBankKeysWithAliases 
} from "../lib/transactionUtils";

interface ReportDetailsViewProps {
  report: MonthlyReportItem | null;
  monthReports?: {
    UAH: MonthlyReportItem | null;
    USD: MonthlyReportItem | null;
    EUR: MonthlyReportItem | null;
  };
  monthSortKey?: string;
  initData: InitData | null;
  currentCurrency: string;
  rateUsd?: string;
  rateUsdSell?: string;
  rateEur?: string;
  rateEurSell?: string;
  onBack: () => void;
  onCurrencyChange?: (currency: "UAH" | "USD" | "EUR") => void;
  onNavigateToHistoryWithSearch?: (searchQuery: string) => void;
  onNavigateToContractorReport?: (name: string) => void;
}

const getCurrencySymbol = (currency: string) => {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "€";
  return "₴";
};

export const ReportDetailsView: React.FC<ReportDetailsViewProps> = ({
  report,
  monthReports,
  monthSortKey,
  initData,
  currentCurrency,
  rateUsd,
  rateUsdSell,
  rateEur,
  rateEurSell,
  onBack,
  onCurrencyChange,
  onNavigateToHistoryWithSearch,
  onNavigateToContractorReport
}) => {
  const [selectedCurrencyTab, setSelectedCurrencyTab] = useState<"ALL" | "UAH" | "USD" | "EUR">("ALL");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<"all" | "inc" | "exp">("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("all");
  const [expandedCategories, setExpandedCategories] = useState<{ [key: string]: boolean }>({});
  const [expandedTransactions, setExpandedTransactions] = useState<{ [key: string]: boolean }>({});
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"detailing" | "accounts">("detailing");
  const [expandedAccounts, setExpandedAccounts] = useState<{ [key: string]: boolean }>({});

  const toggleFilter = (type: "inc" | "exp") => {
    setFilterType(prev => prev === type ? "all" : type);
  };

  const handleExportCSV = () => {
    if (!filteredSortedDetails || filteredSortedDetails.length === 0) return;
    const headers = ["Дата", "Час", "Тип", "Сума", "Валюта", "Опис / Коментар"];
    const rows = filteredSortedDetails.map(it => [
      `"${it.dateStr || ""}"`,
      `"${it.timeStr || ""}"`,
      `"${it.type === "inc" ? "Дохід" : "Витрата"}"`,
      `"${it.sum.toFixed(2)}"`,
      `"${it.curr || currentCurrency}"`,
      `"${(it.text || "").replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `report_${displayLabel.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSequentialBack = () => {
    if (lightboxImage) {
      setLightboxImage(null);
    } else {
      onBack();
    }
  };

  React.useEffect(() => {
    const handleIntercept = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (lightboxImage) {
        customEvent.detail.preventScreenTransition();
        setLightboxImage(null);
      }
    };
    window.addEventListener("app-back-intercept", handleIntercept);
    return () => window.removeEventListener("app-back-intercept", handleIntercept);
  }, [lightboxImage]);

  // Currency-specific reports strictly separated by currency to prevent cross-contamination
  const uahReport = (monthReports?.UAH && (!monthReports.UAH.currency || monthReports.UAH.currency === "UAH"))
    ? monthReports.UAH
    : (report && (!report.currency || report.currency === "UAH") ? report : null);

  const usdReport = (monthReports?.USD && monthReports.USD.currency === "USD")
    ? monthReports.USD
    : (report && report.currency === "USD" ? report : null);

  const eurReport = (monthReports?.EUR && monthReports.EUR.currency === "EUR")
    ? monthReports.EUR
    : (report && report.currency === "EUR" ? report : null);

  const activeReport = 
    selectedCurrencyTab === "UAH" ? uahReport :
    selectedCurrencyTab === "USD" ? usdReport :
    selectedCurrencyTab === "EUR" ? eurReport :
    (report || uahReport || usdReport || eurReport);

  const displayLabel = 
    activeReport?.label || 
    report?.label || 
    uahReport?.label || 
    usdReport?.label || 
    eurReport?.label || 
    "Звіт місяця";

  const hasAnyReport = !!(report || uahReport || usdReport || eurReport);

  // Helper to parse date string like "02.07.26 13:00:00" for chronological sorting
  const parseDateString = (dateStr: string): number => {
    if (!dateStr) return 0;
    const parts = dateStr.trim().split(/\s+/);
    if (parts.length === 0) return 0;
    const dateParts = parts[0].split(".");
    if (dateParts.length < 3) return 0;
    
    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    let year = parseInt(dateParts[2], 10);
    if (year < 100) year += 2000;
    
    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    if (parts.length > 1) {
      const timeParts = parts[1].split(":");
      if (timeParts.length > 0) hours = parseInt(timeParts[0], 10);
      if (timeParts.length > 1) minutes = parseInt(timeParts[1], 10);
      if (timeParts.length > 2) seconds = parseInt(timeParts[2], 10);
    }
    
    return new Date(year, month, day, hours, minutes, seconds).getTime();
  };

  // Compile items with their designated currency
  const uahItems = (uahReport?.items || []).map(it => ({ ...it, curr: "UAH" as const, timeStr: (it as any).timeStr || "" }));
  const usdItems = (usdReport?.items || []).map(it => ({ ...it, curr: "USD" as const, timeStr: (it as any).timeStr || "" }));
  const eurItems = (eurReport?.items || []).map(it => ({ ...it, curr: "EUR" as const, timeStr: (it as any).timeStr || "" }));

  const rawReportFallback = (!uahItems.length && !usdItems.length && !eurItems.length && report?.items?.length)
    ? (report.items || []).map(it => ({ ...it, curr: (it.curr || report.currency || currentCurrency || "UAH") as "UAH" | "USD" | "EUR", timeStr: (it as any).timeStr || "" }))
    : [];

  const activeItems = 
    rawReportFallback.length > 0 ? rawReportFallback :
    selectedCurrencyTab === "ALL" ? [...uahItems, ...usdItems, ...eurItems] :
    selectedCurrencyTab === "UAH" ? uahItems :
    selectedCurrencyTab === "USD" ? usdItems :
    eurItems;

  const seenDetailKeys = new Set<string>();
  const deduplicatedDetails = activeItems.filter(it => {
    const k = `${it.curr}_${it.dateStr}_${it.timeStr || ""}_${it.type}_${it.sum.toFixed(2)}_${(it.text || "").replace(/[^a-zA-Zа-яА-Я0-9]/g, "").slice(0, 30)}`;
    if (seenDetailKeys.has(k)) return false;
    seenDetailKeys.add(k);
    return true;
  });

  const sortedDetails = [...deduplicatedDetails].sort((a, b) => {
    const timeA = parseDateString(a.dateStr + " " + (a.timeStr || "00:00:00"));
    const timeB = parseDateString(b.dateStr + " " + (b.timeStr || "00:00:00"));
    if (timeA !== timeB) {
      return timeB - timeA;
    }
    return b.sum - a.sum;
  });

  const extractDetailCategory = (item: typeof sortedDetails[0]): string => {
    const raw = item.fullText || item.text || "";
    const stripped = raw.replace(/^\[.*?\]\s*/, "").trim();
    const match = stripped.match(/\[([^\]|]+)\]/);
    if (match) {
      const val = match[1].trim();
      if (!val.includes("|") && !val.match(/^\d{1,2}\.\d{1,2}/)) {
        return val;
      }
    }
    return "Без категорії";
  };

  const uniqueCategoriesInDetails = useMemo(() => {
    const set = new Set<string>();
    sortedDetails.forEach(it => {
      set.add(extractDetailCategory(it));
    });
    return Array.from(set).sort();
  }, [sortedDetails]);

  const filteredSortedDetails = sortedDetails.filter(item => {
    if (filterType === "inc" && item.type !== "inc") return false;
    if (filterType === "exp" && item.type !== "exp") return false;

    if (selectedCategoryFilter !== "all") {
      const cat = extractDetailCategory(item);
      if (cat.toLowerCase() !== selectedCategoryFilter.toLowerCase()) return false;
    }

    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase().trim();
    const rawText = (item.text || "").toLowerCase();
    const fullText = (item.fullText || "").toLowerCase();
    const dateStr = (item.dateStr || "").toLowerCase();
    const timeStr = (item.timeStr || "").toLowerCase();
    const sumStr = item.sum.toString();
    const currStr = (item.curr || "").toLowerCase();

    return (
      rawText.includes(q) ||
      fullText.includes(q) ||
      dateStr.includes(q) ||
      timeStr.includes(q) ||
      sumStr.includes(q) ||
      currStr.includes(q)
    );
  });

  const filteredSearchSum = useMemo(() => {
    let inc = 0;
    let exp = 0;
    filteredSortedDetails.forEach(it => {
      if (it.type === "inc") inc += it.sum;
      else exp += it.sum;
    });
    return { inc, exp, net: inc - exp };
  }, [filteredSortedDetails]);

  // Group details by category and type
  const categoryGroups: { 
    [key: string]: { 
      name: string; 
      type: "inc" | "exp"; 
      items: typeof sortedDetails;
      sumUAH: number;
      sumUSD: number;
      sumEUR: number;
    } 
  } = {};

  filteredSortedDetails.forEach(item => {
    const cat = extractDetailCategory(item);
    const groupKey = `${cat}:::${item.type}`;
    if (!categoryGroups[groupKey]) {
      categoryGroups[groupKey] = {
        name: cat,
        type: item.type,
        items: [],
        sumUAH: 0,
        sumUSD: 0,
        sumEUR: 0
      };
    }
    categoryGroups[groupKey].items.push(item);
    if (item.curr === "UAH") categoryGroups[groupKey].sumUAH += item.sum;
    else if (item.curr === "USD") categoryGroups[groupKey].sumUSD += item.sum;
    else if (item.curr === "EUR") categoryGroups[groupKey].sumEUR += item.sum;
  });

  const filteredCategoryKeys = Object.keys(categoryGroups).sort((keyA, keyB) => {
    const groupA = categoryGroups[keyA];
    const groupB = categoryGroups[keyB];
    
    // Sort by type: Incomes first, then Expenses
    if (groupA.type !== groupB.type) {
      return groupA.type === "inc" ? -1 : 1;
    }
    
    // Within same type, sort by total items count or sum
    const sumA = groupA.items.reduce((acc, i) => acc + i.sum, 0);
    const sumB = groupB.items.reduce((acc, i) => acc + i.sum, 0);
    return sumB - sumA;
  });

  const toggleCategoryExpand = (groupKey: string) => {
    setExpandedCategories(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  // Auto-expand categories by default so user sees all payments immediately
  React.useEffect(() => {
    if (filteredCategoryKeys.length > 0 && Object.keys(expandedCategories).length === 0) {
      const initialMap: { [key: string]: boolean } = {};
      filteredCategoryKeys.forEach((key) => {
        initialMap[key] = true;
      });
      setExpandedCategories(initialMap);
    }
  }, [filteredCategoryKeys]);

  const allExpanded = filteredCategoryKeys.length > 0 && filteredCategoryKeys.every(key => !!expandedCategories[key]);

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedCategories({});
    } else {
      const next: { [key: string]: boolean } = {};
      filteredCategoryKeys.forEach(key => {
        next[key] = true;
      });
      setExpandedCategories(next);
    }
  };

  if (!hasAnyReport) {
    return (
      <div className="flex flex-col gap-4 text-center py-12 animate-fadeIn">
        <p className="text-slate-400">Звіт не вибрано</p>
        <button
          onClick={handleSequentialBack}
          className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 bg-slate-800 px-3 py-1.5 rounded-xl self-center"
        >
          <ArrowLeft className="w-4 h-4" /> Повернутися
        </button>
      </div>
    );
  }

  // Render a beautiful expandable transaction item
  const renderTransactionItem = (item: typeof sortedDetails[0], iIdx: number, parentGroupKey: string) => {
    const isInc = item.type === "inc";
    const itemCurrency = item.curr || currentCurrency;
    const curSym = getCurrencySymbol(itemCurrency);
    
    // Parse transaction string into fields
    const rawContent = item.text.replace(/^\[.*?\]/, "").trim();
    const parsed = parseTransactionText(item.fullText || rawContent);
    const directImg = getDirectImageUrl(parsed.receiptUrl);

    // Extract operation type
    const matchOp = item.fullText ? item.fullText.match(/^\[(.*?)\s*\|\s*(.*?)\]/) : null;
    const operation = matchOp ? matchOp[2] : (item.type === "inc" ? "Прибуток" : "Витрата");

    // Split the raw content into lines for detailed display (filtering out duplicated fields)
    const resolvedText = replaceBankKeysWithAliases(rawContent, initData);
    const lines = resolvedText.split(/\s*(?:\r?\n|\|)\s*/).map(l => l.trim()).filter(Boolean)
      .filter(line => {
        const isRcpt = line.startsWith("📎") || line.includes("http");
        const isSum = line.startsWith("💰") || /^сума[:\s]/i.test(line);
        const isCat = line.startsWith("📁") || line.startsWith("📂") || /^категорія[:\s]/i.test(line);
        const isOp = line.startsWith("📥") || line.startsWith("📤") || /^(прибуток|витрата|дохід|тип|операція)[:\s]/i.test(line);
        const isDate = line.startsWith("📅") || line.startsWith("⏰") || /^(дата|час)[:\s]/i.test(line);
        return !isRcpt && !isSum && !isCat && !isOp && !isDate;
      });

    const fallbackSnippet = rawContent
      .replace(/^💰\s*Сума:[^|\n]*(\||$)/i, "")
      .replace(/^[|;\s]+/, "")
      .trim();

    const txKey = `${item.dateStr || "nodate"}_${item.timeStr || "notime"}_${item.type}_${item.sum}_${itemCurrency}_${iIdx}`;
    const isTxExpanded = !!expandedTransactions[txKey];

    const toggleTx = (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpandedTransactions(prev => ({
        ...prev,
        [txKey]: !isTxExpanded
      }));
    };

    return (
      <div
        key={iIdx}
        className="bg-slate-950 border border-slate-800/90 hover:border-slate-700 rounded-xl p-2.5 flex flex-col gap-2 transition-all shadow-sm text-left"
      >
        {/* Operation type & Date Header */}
        <div className="flex justify-between items-center gap-1.5 border-b border-slate-850 pb-1.5 w-full min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0 flex-1">
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
              isInc 
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" 
                : operation.includes("знижк")
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                : "bg-red-500/15 text-red-400 border border-red-500/30"
            } shrink-0`}>
              {operation.includes("знижк") && <span className="mr-0.5">📉</span>}
              <span>{operation}</span>
            </span>

            {/* Currency Badge */}
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${
              itemCurrency === "UAH" ? "bg-sky-500/10 text-sky-400 border-sky-500/30" :
              itemCurrency === "USD" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
              "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
            }`}>
              {itemCurrency === "UAH" ? "🇺🇦 UAH" : itemCurrency === "USD" ? "🇺🇸 USD" : "🇪🇺 EUR"}
            </span>

            <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 shrink-0 ml-auto sm:ml-0">
              <Calendar className="w-3 h-3 text-sky-400 shrink-0" />
              {item.dateStr}
              {item.timeStr && !item.dateStr?.includes(item.timeStr) && (
                <span className="text-amber-400">({item.timeStr})</span>
              )}
            </span>
          </div>

          <span className={`text-xs font-black px-2 py-0.5 rounded-lg shrink-0 ${
            isInc ? "bg-emerald-950 text-emerald-300 border border-emerald-500/30" : "bg-red-950 text-red-300 border border-red-500/30"
          }`}>
            {isInc ? "+" : "-"} {item.sum.toFixed(2)} {curSym}
          </span>
        </div>

        {/* Immediate Direct Display of Payment Breakdown Lines */}
        <div className="flex flex-col gap-1">
          {lines.length === 0 ? (
            <p className="text-[11px] text-slate-300 font-medium">{fallbackSnippet || "Операція"}</p>
          ) : (
            lines.map((line, lIdx) => {
              const isContractor = line.startsWith("👤") || line.toLowerCase().includes("контрагент");
              const isCard = line.startsWith("💳");
              const isReceived = line.startsWith("📥");
              const isSent = line.startsWith("📤");
              const isExchange = line.startsWith("🔄");
              const isRate = line.startsWith("📈");
              const isComment = line.startsWith("📝");
              const isSum = line.startsWith("💰");

              const handleLineClick = (e: React.MouseEvent) => {
                e.stopPropagation();

                if (isContractor) {
                  const matchName = line.replace("👤", "").trim();
                  const cleanName = matchName.includes("(") ? matchName.split("(")[0].trim() : matchName;
                  if (cleanName && onNavigateToContractorReport) {
                    onNavigateToContractorReport(cleanName);
                    return;
                  }
                }

                let query = line;
                if (isContractor) {
                  query = line.replace("👤", "").trim();
                } else if (isRate) {
                  query = line.replace(/^📈\s*Курс:\s*/i, "").trim();
                } else if (isCard || isReceived) {
                  const cleanCard = line.replace(/^[💳📥]\s*/, "").trim();
                  query = cleanCard.includes("➔") ? cleanCard.split("➔")[1].trim() : cleanCard;
                  if (!cleanCard.includes("➔")) {
                    if (cleanCard.includes(":")) {
                      query = cleanCard.split(":")[1].trim();
                    }
                  }
                } else if (isComment) {
                  query = line.replace("📝", "").trim();
                } else if (isExchange) {
                  query = line.replace(/^🔄\s*Обмін:\s*/i, "").trim();
                } else if (isSum) {
                  query = line.replace(/^💰\s*Сума:\s*/i, "").trim();
                } else {
                  query = line.replace(/^[👤💳📥📤🔄📈📝💰📎📁]\s*/, "").trim();
                }

                if (query.includes(":")) {
                  const parts = query.split(":");
                  query = parts.slice(1).join(":").trim();
                }

                if (isRate) {
                  query = query.replace(/\s*[A-Z]{3}\/[A-Z]{3}$/i, "").trim();
                }

                onNavigateToHistoryWithSearch?.(query);
              };

              if (isComment) {
                const commentText = line.replace(/^📝\s*(?:Коментар:)?\s*/i, "").trim();
                return (
                  <div
                    key={lIdx}
                    onClick={handleLineClick}
                    className="w-full text-xs text-amber-200/95 font-medium italic break-words whitespace-pre-wrap bg-amber-500/10 border border-amber-500/25 px-3 py-2 rounded-xl flex items-start gap-2 shadow-inner cursor-pointer hover:border-amber-400/50 transition-all leading-relaxed select-text"
                    title="Натисніть для пошуку в історії"
                  >
                    <span className="text-amber-400 shrink-0 mt-0.5 text-xs">💬</span>
                    <div className="flex-1 break-words">
                      <span className="font-bold text-[10px] text-amber-400 uppercase tracking-wider block not-italic mb-0.5">Коментар:</span>
                      <span>{commentText || line}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-amber-500/70 shrink-0 mt-1 self-start" />
                  </div>
                );
              }

              return (
                <div
                  key={lIdx}
                  onClick={handleLineClick}
                  className="flex items-center justify-between text-[11px] py-1 px-2 rounded-lg bg-slate-900/60 border border-slate-800/50 group cursor-pointer hover:bg-slate-800/80 hover:border-sky-500/40 text-slate-200 transition-all"
                  title="Натисніть для знаходження в історії"
                >
                  <span className="break-words leading-tight">{line}</span>
                  <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-sky-400 shrink-0 ml-1 transition-colors" />
                </div>
              );
            })
          )}
        </div>

        {/* Display attachment image if exists */}
        {parsed.receiptUrl && (
          <div className="pt-1 border-t border-slate-900 flex items-center gap-2">
            {directImg ? (
              <div className="relative group overflow-hidden rounded-lg border border-slate-800 bg-slate-900 max-w-[100px] max-h-[60px]">
                <img
                  src={directImg}
                  alt="Чек"
                  referrerPolicy="no-referrer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxImage(directImg);
                  }}
                  className="w-full h-auto object-cover max-h-[60px] cursor-pointer hover:opacity-85 transition-opacity"
                />
              </div>
            ) : (
              <div 
                onClick={(e) => {
                  e.stopPropagation();
                  if (parsed.receiptUrl) setLightboxImage(parsed.receiptUrl);
                }}
                className="text-[10px] font-bold text-slate-400 hover:text-sky-400 flex items-center gap-1 bg-slate-900 border border-slate-800 px-2 py-1 rounded cursor-pointer transition-all"
              >
                <span>🖼️ Чек</span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Compute breakdown by banks and cash
  const getAccountBreakdown = () => {
    const breakdown: { 
      [key: string]: { 
        name: string; 
        curr: "UAH" | "USD" | "EUR"; 
        inc: number; 
        exp: number; 
      } 
    } = {};

    const currenciesToProcess: Array<"UAH" | "USD" | "EUR"> = 
      selectedCurrencyTab === "ALL" ? ["UAH", "USD", "EUR"] : [selectedCurrencyTab];

    currenciesToProcess.forEach(curr => {
      const aliases = initData?.allAliases[curr] || {};
      const accountKeys = ["Готівка", "Банк 1", "Банк 2", "Банк 3", "Банк 4", "Банк 5"];
      
      const keyToAlias: { [key: string]: string } = {};
      accountKeys.forEach(key => {
        keyToAlias[key] = aliases[key] || key;
      });

      const defaultAccountName = aliases["Готівка"] || "Готівка";

      const currItems = filteredSortedDetails.filter(it => (it.curr || currentCurrency) === curr);

      currItems.forEach(item => {
        if (!item.sum || item.sum <= 0) return;

        const rawContent = item.text.replace(/^\[.*?\]/, "").trim();
        const resolvedText = replaceBankKeysWithAliases(item.fullText || rawContent, initData);
        const textLower = resolvedText.toLowerCase();

        // Find best matching account in transaction text
        let matchedAccount = "";
        let maxMatchLength = 0;

        Object.values(keyToAlias).forEach(alias => {
          if (alias && textLower.includes(alias.toLowerCase()) && alias.length > maxMatchLength) {
            matchedAccount = alias;
            maxMatchLength = alias.length;
          }
        });

        if (!matchedAccount) {
          accountKeys.forEach(key => {
            if (textLower.includes(key.toLowerCase()) && key.length > maxMatchLength) {
              matchedAccount = aliases[key] || key;
              maxMatchLength = key.length;
            }
          });
        }

        // Fallback if no specific account mentioned
        if (!matchedAccount) {
          matchedAccount = defaultAccountName;
        }

        const mapKey = `${curr}:::${matchedAccount}`;
        if (!breakdown[mapKey]) {
          breakdown[mapKey] = { name: matchedAccount, curr, inc: 0, exp: 0 };
        }

        if (item.type === "inc") {
          breakdown[mapKey].inc = Number((breakdown[mapKey].inc + item.sum).toFixed(2));
        } else {
          breakdown[mapKey].exp = Number((breakdown[mapKey].exp + item.sum).toFixed(2));
        }
      });
    });
    
    return Object.values(breakdown).map(acc => ({
      name: acc.name,
      curr: acc.curr,
      inc: acc.inc,
      exp: acc.exp,
      net: acc.inc - acc.exp
    })).sort((a, b) => (b.inc + b.exp) - (a.inc + a.exp));
  };

  const getTransactionsForAccount = (accountName: string, accountCurr: string) => {
    const list: typeof sortedDetails = [];
    const aliases = initData?.allAliases[accountCurr as "UAH" | "USD" | "EUR"] || {};
    const accountKeys = ["Готівка", "Банк 1", "Банк 2", "Банк 3", "Банк 4", "Банк 5"];
    
    const keyToAlias: { [key: string]: string } = {};
    accountKeys.forEach(key => {
      keyToAlias[key] = aliases[key] || key;
    });

    const defaultAccountName = aliases["Готівка"] || "Готівка";

    const candidateItems = sortedDetails.filter(it => (it.curr || currentCurrency) === accountCurr);

    candidateItems.forEach(item => {
      if (!item.sum || item.sum <= 0) return;

      const rawContent = item.text.replace(/^\[.*?\]/, "").trim();
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

      if (matchedAccount === accountName) {
        list.push(item);
      }
    });
    
    const seenAccTxKeys = new Set<string>();
    const deduplicatedAccTx: typeof sortedDetails = [];
    list.forEach(it => {
      const k = `${it.curr}_${it.dateStr}_${it.timeStr || ""}_${it.type}_${it.sum.toFixed(2)}_${(it.text || "").replace(/[^a-zA-Zа-яА-Я0-9]/g, "").slice(0, 30)}`;
      if (seenAccTxKeys.has(k)) return;
      seenAccTxKeys.add(k);
      deduplicatedAccTx.push(it);
    });
    return deduplicatedAccTx;
  };

  // Currency specific aggregates
  const uahInc = uahReport?.inc || 0;
  const uahExp = uahReport?.exp || 0;
  const uahNet = uahInc - uahExp;

  const usdInc = usdReport?.inc || 0;
  const usdExp = usdReport?.exp || 0;
  const usdNet = usdInc - usdExp;

  const eurInc = eurReport?.inc || 0;
  const eurExp = eurReport?.exp || 0;
  const eurNet = eurInc - eurExp;

  const currentInc = activeReport?.inc || 0;
  const currentExp = activeReport?.exp || 0;
  const currentNet = currentInc - currentExp;

  // FULL PRINT MODE OVERLAY
  if (isPrintMode) {
    const accountsData = getAccountBreakdown();
    const incGroups = filteredCategoryKeys.map(k => categoryGroups[k]).filter(g => g.type === "inc");
    const expGroups = filteredCategoryKeys.map(k => categoryGroups[k]).filter(g => g.type === "exp");

    return (
      <div className="min-h-screen bg-white text-black p-8 font-sans flex flex-col gap-6 select-text">
        {/* Print Controls */}
        <div className="no-print flex items-center justify-between gap-4 border-b-2 border-slate-200 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-600">
              🖨️ Передперегляд друку звіту за {displayLabel} ({selectedCurrencyTab === "ALL" ? "Всі валюти" : selectedCurrencyTab})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs px-4 py-2 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span>🖨️ Надіслати на друк</span>
            </button>
            <button
              onClick={() => setIsPrintMode(false)}
              className="bg-slate-800 hover:bg-slate-700 text-white font-black text-xs px-4 py-2 rounded-xl shadow-md transition-all active:scale-95"
            >
              Закрити
            </button>
          </div>
        </div>

        {/* Report Content */}
        <div className="flex flex-col gap-8">
          <div className="border-b-4 border-black pb-4 text-center">
            <h1 className="text-3xl font-black tracking-tight mb-1">ФІНАНСОВИЙ ЗВІТ ЗА МІСЯЦЬ</h1>
            <p className="text-lg font-bold uppercase tracking-wider text-slate-700">{displayLabel}</p>
            <p className="text-xs text-slate-500 mt-1">
              Згенеровано: {new Date().toLocaleDateString("uk-UA")} | Режим: {selectedCurrencyTab === "ALL" ? "Всі валюти (UAH, USD, EUR)" : selectedCurrencyTab}
            </p>
          </div>

          {/* Section 1: Summary Table */}
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider border-b-2 border-black pb-1 mb-3">1. Загальні Фінансові Підсумки</h2>
            {selectedCurrencyTab === "ALL" ? (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-black">
                    <th className="text-left py-2 px-3 font-bold">Валюта</th>
                    <th className="text-right py-2 px-3 font-bold">Загальні доходи (+)</th>
                    <th className="text-right py-2 px-3 font-bold">Загальні витрати (-)</th>
                    <th className="text-right py-2 px-3 font-bold">Чистий результат (=)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="py-2 px-3 font-bold">🇺🇦 Гривня (UAH)</td>
                    <td className="text-right py-2 px-3 text-emerald-600 font-bold">+{uahInc.toFixed(2)} ₴</td>
                    <td className="text-right py-2 px-3 text-red-600 font-bold">-{uahExp.toFixed(2)} ₴</td>
                    <td className={`text-right py-2 px-3 font-black ${uahNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {uahNet >= 0 ? "+" : ""}{uahNet.toFixed(2)} ₴
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-2 px-3 font-bold">🇺🇸 Долар (USD)</td>
                    <td className="text-right py-2 px-3 text-emerald-600 font-bold">+{usdInc.toFixed(2)} $</td>
                    <td className="text-right py-2 px-3 text-red-600 font-bold">-{usdExp.toFixed(2)} $</td>
                    <td className={`text-right py-2 px-3 font-black ${usdNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {usdNet >= 0 ? "+" : ""}{usdNet.toFixed(2)} $
                    </td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-2 px-3 font-bold">🇪🇺 Євро (EUR)</td>
                    <td className="text-right py-2 px-3 text-emerald-600 font-bold">+{eurInc.toFixed(2)} €</td>
                    <td className="text-right py-2 px-3 text-red-600 font-bold">-{eurExp.toFixed(2)} €</td>
                    <td className={`text-right py-2 px-3 font-black ${eurNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {eurNet >= 0 ? "+" : ""}{eurNet.toFixed(2)} €
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-black">
                    <th className="text-left py-2 px-3 font-bold">Показник</th>
                    <th className="text-right py-2 px-3 font-bold">Сума ({getCurrencySymbol(selectedCurrencyTab)})</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="py-2 px-3">Загальні доходи (Прихід)</td>
                    <td className="text-right py-2 px-3 text-emerald-600 font-bold">+{currentInc.toFixed(2)}</td>
                  </tr>
                  <tr className="border-b border-slate-200">
                    <td className="py-2 px-3">Загальні витрати (Покупки / Списання)</td>
                    <td className="text-right py-2 px-3 text-red-600 font-bold">-{currentExp.toFixed(2)}</td>
                  </tr>
                  <tr className="bg-slate-50 border-b-2 border-black font-black">
                    <td className="py-2 px-3">Чистий фінансовий результат</td>
                    <td className={`text-right py-2 px-3 ${currentNet >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {currentNet >= 0 ? "+" : ""}{currentNet.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

          {/* Section 2: Account details */}
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider border-b-2 border-black pb-1 mb-3">2. Деталізація по рахунках (Банках та Готівці)</h2>
            {accountsData.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Операцій по рахунках за цей період не знайдено.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-black">
                    <th className="text-left py-2 px-3 font-bold">Назва рахунку / капіталу</th>
                    <th className="text-center py-2 px-3 font-bold">Валюта</th>
                    <th className="text-right py-2 px-3 font-bold">Надходження (+)</th>
                    <th className="text-right py-2 px-3 font-bold">Списання (-)</th>
                    <th className="text-right py-2 px-3 font-bold">Чистий рух (=)</th>
                  </tr>
                </thead>
                <tbody>
                  {accountsData.map((acc, aIdx) => (
                    <tr key={aIdx} className="border-b border-slate-200">
                      <td className="py-2 px-3 font-bold">💳 {acc.name}</td>
                      <td className="py-2 px-3 text-center text-xs font-bold text-slate-600">{acc.curr}</td>
                      <td className="text-right py-2 px-3 text-emerald-600 font-semibold">+{acc.inc.toFixed(2)}</td>
                      <td className="text-right py-2 px-3 text-red-600 font-semibold">-{acc.exp.toFixed(2)}</td>
                      <td className={`text-right py-2 px-3 font-black ${acc.net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {acc.net >= 0 ? "+" : ""}{acc.net.toFixed(2)} {getCurrencySymbol(acc.curr)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Section 3: Categories Summary */}
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider border-b-2 border-black pb-1 mb-3">3. Структура за Категоріями</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Income Categories */}
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-emerald-700 border-b border-emerald-300 pb-1 mb-2">🟢 Доходи за категоріями</h3>
                {incGroups.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Немає категорій доходів.</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-emerald-50 border-b border-emerald-300 font-bold">
                        <th className="text-left py-1.5 px-2">Категорія</th>
                        <th className="text-center py-1.5 px-2">Кількість</th>
                        <th className="text-right py-1.5 px-2">Сума</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incGroups.map((g, gIdx) => {
                        const totSum = g.sumUAH + g.sumUSD + g.sumEUR;
                        return (
                          <tr key={gIdx} className="border-b border-slate-200">
                            <td className="py-1.5 px-2 font-bold">{g.name}</td>
                            <td className="py-1.5 px-2 text-center text-slate-600">{g.items.length}</td>
                            <td className="py-1.5 px-2 text-right font-black text-emerald-700">
                              {g.sumUAH > 0 && <span>+{g.sumUAH.toFixed(2)} ₴ </span>}
                              {g.sumUSD > 0 && <span>+{g.sumUSD.toFixed(2)} $ </span>}
                              {g.sumEUR > 0 && <span>+{g.sumEUR.toFixed(2)} €</span>}
                              {totSum === 0 && <span>0.00</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Expense Categories */}
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-red-700 border-b border-red-300 pb-1 mb-2">🔴 Витрати за категоріями</h3>
                {expGroups.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Немає категорій витрат.</p>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-red-50 border-b border-red-300 font-bold">
                        <th className="text-left py-1.5 px-2">Категорія</th>
                        <th className="text-center py-1.5 px-2">Кількість</th>
                        <th className="text-right py-1.5 px-2">Сума</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expGroups.map((g, gIdx) => {
                        const totSum = g.sumUAH + g.sumUSD + g.sumEUR;
                        return (
                          <tr key={gIdx} className="border-b border-slate-200">
                            <td className="py-1.5 px-2 font-bold">{g.name}</td>
                            <td className="py-1.5 px-2 text-center text-slate-600">{g.items.length}</td>
                            <td className="py-1.5 px-2 text-right font-black text-red-700">
                              {g.sumUAH > 0 && <span>-{g.sumUAH.toFixed(2)} ₴ </span>}
                              {g.sumUSD > 0 && <span>-{g.sumUSD.toFixed(2)} $ </span>}
                              {g.sumEUR > 0 && <span>-{g.sumEUR.toFixed(2)} €</span>}
                              {totSum === 0 && <span>0.00</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Detailed Transaction List */}
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider border-b-2 border-black pb-1 mb-3">
              4. Детальний Список Операцій ({filteredSortedDetails.length})
            </h2>
            {filteredSortedDetails.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Операцій не знайдено.</p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-black font-bold">
                    <th className="text-left py-2 px-2">Дата / Час</th>
                    <th className="text-center py-2 px-2">Тип</th>
                    <th className="text-left py-2 px-2">Деталі / Коментар</th>
                    <th className="text-right py-2 px-2">Сума</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSortedDetails.map((it, idx) => {
                    const isInc = it.type === "inc";
                    return (
                      <tr key={idx} className="border-b border-slate-200">
                        <td className="py-2 px-2 font-mono whitespace-nowrap text-slate-700">
                          {it.dateStr} {it.timeStr && !it.dateStr?.includes(it.timeStr) && <span className="text-slate-500 text-[10px]">({it.timeStr})</span>}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded font-black text-[10px] ${isInc ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
                            {isInc ? "ДОХІД" : "ВИПЛАТА"}
                          </span>
                        </td>
                        <td className="py-2 px-2 break-words max-w-md font-medium text-slate-800">
                          {it.text.replace(/^\[.*?\]/, "").trim()}
                        </td>
                        <td className={`py-2 px-2 text-right font-black whitespace-nowrap ${isInc ? "text-emerald-700" : "text-red-700"}`}>
                          {isInc ? "+" : "-"}{it.sum.toFixed(2)} {getCurrencySymbol(it.curr || currentCurrency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 text-left">
      {/* Sticky Top Header & Period Indicator Bar pinned cleanly under main Header */}
      <div className="sticky top-[53px] sm:top-[61px] z-40 bg-black border-b-2 border-sky-400 shadow-2xl py-0.5 px-1.5 -mx-1.5 flex items-center justify-between gap-1 backdrop-blur-md">
        {/* Combined Back & Prominent Month Label Button */}
        <button
          onClick={handleSequentialBack}
          className="flex items-center gap-1 bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-400 px-1.5 py-0.5 rounded-md text-[10px] font-black transition-all active:scale-95 shadow-md cursor-pointer shrink-0"
          title="Натисніть для повернення до списку звітів"
        >
          <ArrowLeft className="w-3 h-3 text-sky-400 shrink-0" />
          <span className="uppercase tracking-tight truncate max-w-[130px] sm:max-w-none text-white font-extrabold">
            📅 {displayLabel}
          </span>
        </button>

        {/* Currency Switcher Pills & Print Button in single compact row */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-0.5 p-0.5 bg-slate-950 border border-slate-700 rounded-md">
            <button
              type="button"
              onClick={() => setSelectedCurrencyTab("ALL")}
              className={`py-0.5 px-1 rounded text-[9px] font-black transition-all cursor-pointer ${
                selectedCurrencyTab === "ALL"
                  ? "bg-sky-400 text-black font-black shadow-md"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              🌐 Всі
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCurrencyTab("UAH");
                onCurrencyChange?.("UAH");
              }}
              className={`py-0.5 px-1 rounded text-[9px] font-black transition-all cursor-pointer ${
                selectedCurrencyTab === "UAH"
                  ? "bg-sky-400 text-black font-black shadow-md"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              🇺🇦 ₴
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCurrencyTab("USD");
                onCurrencyChange?.("USD");
              }}
              className={`py-0.5 px-1 rounded text-[9px] font-black transition-all cursor-pointer ${
                selectedCurrencyTab === "USD"
                  ? "bg-sky-400 text-black font-black shadow-md"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              🇺🇸 $
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedCurrencyTab("EUR");
                onCurrencyChange?.("EUR");
              }}
              className={`py-0.5 px-1 rounded text-[9px] font-black transition-all cursor-pointer ${
                selectedCurrencyTab === "EUR"
                  ? "bg-sky-400 text-black font-black shadow-md"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              🇪🇺 €
            </button>
          </div>

          <button
            onClick={() => setIsPrintMode(true)}
            className="p-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-md text-amber-400 hover:text-amber-300 transition-all cursor-pointer shadow-sm"
            title="Версія для друку"
          >
            <Printer className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Multi-Currency Aggregated Monthly Result Card */}
      {(() => {
        const rUsdVal = parseFloat(rateUsd || "41.5") || 41.5;
        const rEurVal = parseFloat(rateEur || "45.2") || 45.2;

        const convertM = (val: number, from: string, to: string): number => {
          if (from === to) return val;
          if (!val) return 0;
          let uah = val;
          if (from === "USD") uah = val * rUsdVal;
          else if (from === "EUR") uah = val * rEurVal;

          if (to === "UAH") return uah;
          if (to === "USD") return rUsdVal > 0 ? uah / rUsdVal : 0;
          if (to === "EUR") return rEurVal > 0 ? uah / rEurVal : 0;
          return uah;
        };

        const incU = uahReport ? uahReport.inc : 0;
        const expU = uahReport ? uahReport.exp : 0;
        const incUs = usdReport ? usdReport.inc : 0;
        const expUs = usdReport ? usdReport.exp : 0;
        const incE = eurReport ? eurReport.inc : 0;
        const expE = eurReport ? eurReport.exp : 0;

        if (selectedCurrencyTab === "ALL") {
          const targetCurMonth = currentCurrency;
          const totalIncEquiv = 
            convertM(incU, "UAH", targetCurMonth) +
            convertM(incUs, "USD", targetCurMonth) +
            convertM(incE, "EUR", targetCurMonth);

          const totalExpEquiv = 
            convertM(expU, "UAH", targetCurMonth) +
            convertM(expUs, "USD", targetCurMonth) +
            convertM(expE, "EUR", targetCurMonth);

          const netEquiv = totalIncEquiv - totalExpEquiv;

          const renderMultiCurSub = (u: number, us: number, e: number) => {
            const parts: string[] = [];
            if (u !== 0) parts.push(`🇺🇦 ${u.toFixed(2)} ₴`);
            if (us !== 0) parts.push(`🇺🇸 ${us.toFixed(2)} $`);
            if (e !== 0) parts.push(`🇪🇺 ${e.toFixed(2)} €`);
            if (parts.length <= 1) return null; // Don't repeat single currency if it matches or is zero
            return (
              <span className="text-[9px] text-slate-300 font-extrabold mt-0.5">
                {parts.join(" | ")}
              </span>
            );
          };

          return (
            <div className="bg-black border-2 border-slate-700 p-2.5 rounded-2xl flex flex-col gap-2 shadow-xl">
              <div className="flex items-center justify-between text-[11px] font-black uppercase text-slate-200 border-b border-slate-800 pb-1.5">
                <span>🌐 Зведений підсумок місяця ({displayLabel})</span>
                <span className="text-[10px] text-sky-300 bg-sky-950 px-2 py-0.5 rounded border border-sky-500/50 font-extrabold">
                  Еквівалент: {targetCurMonth} ({getCurrencySymbol(targetCurMonth)})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-xs">
                <div className="bg-emerald-950/70 border-2 border-emerald-500/50 p-2 rounded-xl flex flex-col shadow-inner">
                  <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">Дохід</span>
                  <span className="text-xs sm:text-sm font-black text-emerald-300">+{totalIncEquiv.toFixed(2)} {getCurrencySymbol(targetCurMonth)}</span>
                  {renderMultiCurSub(incU, incUs, incE)}
                </div>
                <div className="bg-rose-950/70 border-2 border-rose-500/50 p-2 rounded-xl flex flex-col shadow-inner">
                  <span className="text-[9px] font-black uppercase tracking-wider text-rose-400">Витрати</span>
                  <span className="text-xs sm:text-sm font-black text-rose-300">-{totalExpEquiv.toFixed(2)} {getCurrencySymbol(targetCurMonth)}</span>
                  {renderMultiCurSub(expU, expUs, expE)}
                </div>
                <div className={`p-2 rounded-xl border-2 flex flex-col shadow-inner ${
                  netEquiv >= 0 ? "bg-sky-950/70 border-sky-500/50 text-sky-200" : "bg-rose-950/70 border-rose-500/50 text-rose-200"
                }`}>
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-300">Чисте сальдо</span>
                  <span className={`text-xs sm:text-sm font-black ${netEquiv >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                    {netEquiv >= 0 ? "+" : ""}{netEquiv.toFixed(2)} {getCurrencySymbol(targetCurMonth)}
                  </span>
                  {renderMultiCurSub(incU - expU, incUs - expUs, incE - expE)}
                </div>
              </div>
            </div>
          );
        }

        // Pure single currency mode (UAH / USD / EUR)
        const cur = selectedCurrencyTab;
        const sym = getCurrencySymbol(cur);
        const inc = cur === "UAH" ? incU : cur === "USD" ? incUs : incE;
        const exp = cur === "UAH" ? expU : cur === "USD" ? expUs : expE;
        const net = inc - exp;
        const curName = cur === "UAH" ? "Гривні (UAH)" : cur === "USD" ? "Доларах (USD)" : "Євро (EUR)";

        return (
          <div className="bg-black border-2 border-slate-700 p-2.5 rounded-2xl flex flex-col gap-2 shadow-xl">
            <div className="flex items-center justify-between text-[11px] font-black uppercase text-slate-200 border-b border-slate-800 pb-1.5">
              <span>Підсумок за місяць в {curName}</span>
              <span className="text-[10px] text-sky-300 bg-sky-950 px-2 py-0.5 rounded border border-sky-500/50 font-extrabold">
                Валюта: {cur} ({sym})
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-xs">
              <div className="bg-emerald-950/70 border-2 border-emerald-500/50 p-2 rounded-xl flex flex-col shadow-inner">
                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">Дохід {cur} за {displayLabel}</span>
                <span className="text-xs sm:text-sm font-black text-emerald-300">+{inc.toFixed(2)} {sym}</span>
              </div>
              <div className="bg-rose-950/70 border-2 border-rose-500/50 p-2 rounded-xl flex flex-col shadow-inner">
                <span className="text-[9px] font-black uppercase tracking-wider text-rose-400">Витрати {cur} за {displayLabel}</span>
                <span className="text-xs sm:text-sm font-black text-rose-300">-{exp.toFixed(2)} {sym}</span>
              </div>
              <div className={`p-2 rounded-xl border-2 flex flex-col shadow-inner ${
                net >= 0 ? "bg-sky-950/70 border-sky-500/50 text-sky-200" : "bg-rose-950/70 border-rose-500/50 text-rose-200"
              }`}>
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-300">Чисте сальдо за {displayLabel}</span>
                <span className={`text-xs sm:text-sm font-black ${net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {net >= 0 ? "+" : ""}{net.toFixed(2)} {sym}
                </span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Live Search Bar, Category Dropdown & CSV Export Controls */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between bg-slate-950 p-2 rounded-xl border border-slate-850">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Пошук операції, категорії, коментаря, суми..."
            className="w-full bg-slate-900 text-white placeholder-slate-500 text-xs pl-9 pr-8 py-2 rounded-lg border border-slate-800 focus:outline-none focus:border-sky-500 transition-all font-medium"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
              title="Очистити пошук"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Filter Selector */}
        <div className="shrink-0">
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="w-full sm:w-auto bg-slate-900 border border-slate-800 text-white rounded-lg px-2.5 py-2 text-xs font-bold focus:outline-none focus:border-sky-500"
          >
            <option value="all">Усі категорії ({uniqueCategoriesInDetails.length})</option>
            {uniqueCategoriesInDetails.map(cat => (
              <option key={cat} value={cat}>📁 {cat}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 justify-end shrink-0">
          <button
            onClick={handleExportCSV}
            className="text-xs font-bold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-750 border border-slate-700 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
            title="Завантажити звіт у форматі CSV"
          >
            <span>📥 CSV</span>
          </button>
          <button
            onClick={() => setIsPrintMode(true)}
            className="text-xs font-black text-amber-300 hover:text-amber-200 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0"
            title="Версія для друку"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" />
            <span>Друк</span>
          </button>
        </div>
      </div>

      {/* Prominent Filtered Sum Banner */}
      {(selectedCategoryFilter !== "all" || searchTerm || filterType !== "all") && (
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 border-2 border-sky-500/50 p-3 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-black text-white flex items-center gap-1.5">
              <span>📊</span>
              <span>{selectedCategoryFilter !== "all" ? `Підсумок за категорією «${selectedCategoryFilter}»:` : "Загальна сума відфільтрованих операцій:"}</span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              Знайдено {filteredSortedDetails.length} операцій
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
            {filteredSearchSum.inc > 0 && (
              <div className="bg-emerald-950/50 border border-emerald-500/30 px-2.5 py-1.5 rounded-xl text-emerald-300 font-bold">
                +{filteredSearchSum.inc.toFixed(2)} {currentCurrency === "USD" ? "$" : currentCurrency === "EUR" ? "€" : "₴"}
              </div>
            )}
            {filteredSearchSum.exp > 0 && (
              <div className="bg-rose-950/50 border border-rose-500/30 px-2.5 py-1.5 rounded-xl text-rose-300 font-bold">
                -{filteredSearchSum.exp.toFixed(2)} {currentCurrency === "USD" ? "$" : currentCurrency === "EUR" ? "€" : "₴"}
              </div>
            )}
            {(filteredSearchSum.inc > 0 && filteredSearchSum.exp > 0) && (
              <div className="bg-slate-900 border border-slate-800 px-2 py-1.5 rounded-xl text-slate-300 font-bold">
                Сальдо: <span className={filteredSearchSum.net >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {filteredSearchSum.net >= 0 ? "+" : ""}{filteredSearchSum.net.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Monthly Summary Cards */}
      {selectedCurrencyTab === "ALL" ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* UAH Summary Card */}
          <div 
            onClick={() => {
              setSelectedCurrencyTab("UAH");
              onCurrencyChange?.("UAH");
            }}
            className="p-4 bg-black border-2 border-slate-800 hover:border-sky-500/50 rounded-2xl flex flex-col gap-2 transition-all cursor-pointer shadow-lg hover:scale-[1.01] active:scale-95"
            title="Натисніть для переходу до UAH"
          >
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                🇺🇦 Гривня (UAH)
              </span>
              <span className="bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] px-1.5 py-0.5 rounded font-black">
                ₴
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-slate-400 font-bold">Дохід:</span>
              <span className="text-emerald-400 font-black">+{uahInc.toFixed(2)} ₴</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold">Витрата:</span>
              <span className="text-red-400 font-black">-{uahExp.toFixed(2)} ₴</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/80">
              <span className="text-slate-400 font-black">Сальдо:</span>
              <span className={`font-black ${uahNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {uahNet >= 0 ? "+" : ""}{uahNet.toFixed(2)} ₴
              </span>
            </div>
          </div>

          {/* USD Summary Card */}
          <div 
            onClick={() => {
              setSelectedCurrencyTab("USD");
              onCurrencyChange?.("USD");
            }}
            className="p-4 bg-black border-2 border-slate-800 hover:border-emerald-500/50 rounded-2xl flex flex-col gap-2 transition-all cursor-pointer shadow-lg hover:scale-[1.01] active:scale-95"
            title="Натисніть для переходу до USD"
          >
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                🇺🇸 Долар (USD)
              </span>
              <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] px-1.5 py-0.5 rounded font-black">
                $
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-slate-400 font-bold">Дохід:</span>
              <span className="text-emerald-400 font-black">+{usdInc.toFixed(2)} $</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold">Витрата:</span>
              <span className="text-red-400 font-black">-{usdExp.toFixed(2)} $</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/80">
              <span className="text-slate-400 font-black">Сальдо:</span>
              <span className={`font-black ${usdNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {usdNet >= 0 ? "+" : ""}{usdNet.toFixed(2)} $
              </span>
            </div>
          </div>

          {/* EUR Summary Card */}
          <div 
            onClick={() => {
              setSelectedCurrencyTab("EUR");
              onCurrencyChange?.("EUR");
            }}
            className="p-4 bg-black border-2 border-slate-800 hover:border-indigo-500/50 rounded-2xl flex flex-col gap-2 transition-all cursor-pointer shadow-lg hover:scale-[1.01] active:scale-95"
            title="Натисніть для переходу до EUR"
          >
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <span className="text-xs font-black text-white flex items-center gap-1.5">
                🇪🇺 Євро (EUR)
              </span>
              <span className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] px-1.5 py-0.5 rounded font-black">
                €
              </span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-slate-400 font-bold">Дохід:</span>
              <span className="text-emerald-400 font-black">+{eurInc.toFixed(2)} €</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-bold">Витрата:</span>
              <span className="text-red-400 font-black">-{eurExp.toFixed(2)} €</span>
            </div>
            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/80">
              <span className="text-slate-400 font-black">Сальдо:</span>
              <span className={`font-black ${eurNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {eurNet >= 0 ? "+" : ""}{eurNet.toFixed(2)} €
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-black border-2 border-slate-800 p-4 rounded-2xl grid grid-cols-2 gap-3.5 shadow-2xl">
          <div 
            onClick={() => toggleFilter("inc")}
            className={`flex flex-col p-4 rounded-xl bg-black border-2 transition-all cursor-pointer select-none hover:scale-[1.01] active:scale-95 ${
              filterType === "inc" 
                ? "border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-500/30 font-black" 
                : filterType === "exp"
                  ? "border-slate-900 text-emerald-400/30 opacity-40 hover:opacity-60"
                  : "border-emerald-500/50 text-emerald-400/90 shadow-md shadow-emerald-500/5 hover:border-emerald-500"
            }`}
            title="Натисніть, щоб фільтрувати за доходами"
          >
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" /> Дохід {filterType === "inc" && "✓"}
            </span>
            <span className="text-xl font-black mt-2 leading-none flex items-center gap-1.5">
              +{currentInc.toFixed(2)}
              <span className="bg-emerald-500 text-black px-1.5 py-0.5 rounded font-black text-[10px] select-none">
                {getCurrencySymbol(selectedCurrencyTab)}
              </span>
            </span>
          </div>

          <div 
            onClick={() => toggleFilter("exp")}
            className={`flex flex-col p-4 rounded-xl bg-black border-2 transition-all cursor-pointer select-none hover:scale-[1.01] active:scale-95 ${
              filterType === "exp" 
                ? "border-red-500 text-red-400 shadow-lg shadow-red-500/20 ring-1 ring-red-500/30 font-black" 
                : filterType === "inc"
                  ? "border-slate-900 text-red-400/30 opacity-40 hover:opacity-60"
                  : "border-red-500/50 text-red-400/90 shadow-md shadow-red-500/5 hover:border-red-500"
            }`}
            title="Натисніть, щоб фільтрувати за витратами"
          >
            <span className="text-[10px] font-black uppercase tracking-wider text-red-400 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5" /> Витрата {filterType === "exp" && "✓"}
            </span>
            <span className="text-xl font-black mt-2 leading-none flex items-center gap-1.5">
              -{currentExp.toFixed(2)}
              <span className="bg-red-500 text-black px-1.5 py-0.5 rounded font-black text-[10px] select-none">
                {getCurrencySymbol(selectedCurrencyTab)}
              </span>
            </span>
          </div>

          <div 
            onClick={() => setFilterType("all")}
            className={`col-span-2 p-3.5 bg-black border-2 transition-all rounded-xl select-none cursor-pointer flex flex-col items-center justify-center ${
              filterType === "all"
                ? "border-slate-800 bg-slate-950/25 text-slate-100"
                : "border-slate-900 opacity-60 hover:opacity-90 text-slate-400"
            }`}
            title="Скинути фільтр"
          >
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Чистий Фінансовий Результат ({selectedCurrencyTab})</div>
            <div className={`text-lg font-black mt-1.5 flex items-center justify-center gap-2 ${currentNet >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {currentNet >= 0 ? "+" : ""}{currentNet.toFixed(2)}
              <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                currentNet >= 0 ? "bg-emerald-500 text-black" : "bg-red-500 text-black"
              }`}>
                {getCurrencySymbol(selectedCurrencyTab)}
              </span>
            </div>
            {filterType !== "all" && (
              <div className="text-[9px] font-extrabold text-sky-400 mt-1 uppercase tracking-wider select-none">Показати все</div>
            )}
          </div>
        </div>
      )}

      {/* Tab Switcher */}
      <div className="grid grid-cols-2 gap-1 bg-black p-1 rounded-xl border border-slate-700 mt-1">
        <button
          type="button"
          onClick={() => setActiveTab("detailing")}
          className={`py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "detailing"
              ? "bg-sky-400 text-slate-950 shadow-md font-black"
              : "text-slate-400 hover:bg-slate-900/40 hover:text-slate-200"
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Деталізація</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("accounts")}
          className={`py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === "accounts"
              ? "bg-sky-400 text-slate-950 shadow-md font-black"
              : "text-slate-400 hover:bg-slate-900/40 hover:text-slate-200"
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Рахунки</span>
        </button>
      </div>

      {/* Tab: Accounts */}
      {activeTab === "accounts" && (
        <div className="flex flex-col gap-4 mt-1 animate-fadeIn">
          <div className="px-1">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Деталізація руху коштів по рахунках (Банки та Готівка)
            </span>
          </div>

          {getAccountBreakdown().length === 0 ? (
            <div className="text-center py-8 text-slate-500 font-semibold bg-black border-2 border-slate-800 rounded-2xl">
              За звітний період немає операцій по рахунках
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {getAccountBreakdown().map((acc, aIdx) => {
                const totalFlow = acc.inc + acc.exp;
                const incPercent = totalFlow > 0 ? (acc.inc / totalFlow) * 100 : 0;
                const expPercent = totalFlow > 0 ? (acc.exp / totalFlow) * 100 : 0;
                const accTxList = getTransactionsForAccount(acc.name, acc.curr);
                const isExpanded = !!expandedAccounts[`${acc.curr}:::${acc.name}`];

                return (
                  <div key={aIdx} className="bg-black border-2 border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col gap-3 animate-fadeIn">
                    <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-white flex items-center gap-1.5">
                          💳 {acc.name}
                        </span>
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${
                          acc.curr === "UAH" ? "bg-sky-500/10 text-sky-400 border-sky-500/30" :
                          acc.curr === "USD" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                          "bg-indigo-500/10 text-indigo-400 border-indigo-500/30"
                        }`}>
                          {acc.curr}
                        </span>
                      </div>
                      <span className={`text-xs font-black px-2 py-1 rounded-lg ${acc.net >= 0 ? "bg-emerald-950/50 text-emerald-400 border border-emerald-500/10" : "bg-red-950/50 text-red-400 border border-red-500/10"}`}>
                        {acc.net >= 0 ? "+" : ""}{acc.net.toFixed(2)} {getCurrencySymbol(acc.curr)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex flex-col p-2 rounded-xl bg-slate-950/40 border border-slate-900 text-left">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Надходження (+)</span>
                        <span className="text-emerald-400 font-black mt-1 text-sm">+{acc.inc.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-col p-2 rounded-xl bg-slate-950/40 border border-slate-900 text-left">
                        <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Списання (-)</span>
                        <span className="text-red-400 font-black mt-1 text-sm">-{acc.exp.toFixed(2)}</span>
                      </div>
                    </div>

                    {totalFlow > 0 && (
                      <div className="flex flex-col gap-1 mt-1">
                        <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden flex">
                          <div style={{ width: `${incPercent}%` }} className="h-full bg-emerald-500" />
                          <div style={{ width: `${expPercent}%` }} className="h-full bg-red-500" />
                        </div>
                        <div className="flex justify-between text-[9px] font-black text-slate-500 uppercase tracking-wider">
                          <span>Вхідні: {incPercent.toFixed(0)}%</span>
                          <span>Вихідні: {expPercent.toFixed(0)}%</span>
                        </div>
                      </div>
                    )}

                    {accTxList.length > 0 && (
                      <div className="flex flex-col gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => {
                            const accKey = `${acc.curr}:::${acc.name}`;
                            setExpandedAccounts(prev => ({
                              ...prev,
                              [accKey]: !isExpanded
                            }));
                          }}
                          className="w-full flex items-center justify-between text-[11px] font-black text-sky-400 hover:text-sky-300 bg-slate-950/60 hover:bg-slate-900 border border-slate-900 hover:border-sky-500/30 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            📂 {isExpanded ? "Приховати операції" : "Показати операції"} рахунку ({accTxList.length})
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-sky-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-sky-400" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="flex flex-col gap-3 mt-2 pt-2 border-t border-slate-900 animate-fadeIn">
                            {accTxList.map((item, idx) => renderTransactionItem(item, idx, `account-tx-${acc.curr}-${acc.name}`))}
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
      )}

      {/* Tab: Detailing */}
      {activeTab === "detailing" && (
        <div className="flex flex-col gap-6 mt-1 animate-fadeIn">
          {/* Income block */}
          <div className="flex flex-col gap-3">
            <div className="px-1 border-b border-slate-900 pb-1.5 flex justify-between items-center">
              <span className="text-xs font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> Доходи за категоріями
              </span>
            </div>
            
            {filteredCategoryKeys.map(k => categoryGroups[k]).filter(g => g.type === "inc").length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 text-center bg-black border border-slate-900 rounded-xl">Немає зареєстрованих доходів за обраним типом</p>
            ) : (
              <div className="flex flex-col gap-3.5 animate-fadeIn">
                {filteredCategoryKeys.map(k => categoryGroups[k]).filter(g => g.type === "inc").map((group, gIdx) => {
                  return (
                    <div key={gIdx} className="bg-black/40 border border-slate-850 p-3.5 rounded-2xl flex flex-col gap-2.5">
                      <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                        <span className="font-bold text-xs text-emerald-400">🏷️ {group.name}</span>
                        <div className="flex items-center gap-1.5">
                          {group.sumUAH > 0 && <span className="text-xs font-black text-sky-300">+{group.sumUAH.toFixed(2)} ₴</span>}
                          {group.sumUSD > 0 && <span className="text-xs font-black text-emerald-300">+{group.sumUSD.toFixed(2)} $</span>}
                          {group.sumEUR > 0 && <span className="text-xs font-black text-indigo-300">+{group.sumEUR.toFixed(2)} €</span>}
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        {group.items.map((tx, txIdx) => renderTransactionItem(tx, txIdx, `detailing-inc-${group.name}`))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Expense block */}
          <div className="flex flex-col gap-3">
            <div className="px-1 border-b border-slate-900 pb-1.5 flex justify-between items-center">
              <span className="text-xs font-black text-red-400 uppercase tracking-wider flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" /> Витрати за категоріями
              </span>
            </div>
            
            {filteredCategoryKeys.map(k => categoryGroups[k]).filter(g => g.type === "exp").length === 0 ? (
              <p className="text-xs text-slate-500 italic p-3 text-center bg-black border border-slate-900 rounded-xl">Немає зареєстрованих витрат за обраним типом</p>
            ) : (
              <div className="flex flex-col gap-3.5 animate-fadeIn">
                {filteredCategoryKeys.map(k => categoryGroups[k]).filter(g => g.type === "exp").map((group, gIdx) => {
                  return (
                    <div key={gIdx} className="bg-black/40 border border-slate-850 p-3.5 rounded-2xl flex flex-col gap-2.5">
                      <div className="flex justify-between items-center border-b border-slate-900 pb-2">
                        <span className="font-bold text-xs text-red-400">🏷️ {group.name}</span>
                        <div className="flex items-center gap-1.5">
                          {group.sumUAH > 0 && <span className="text-xs font-black text-sky-300">-{group.sumUAH.toFixed(2)} ₴</span>}
                          {group.sumUSD > 0 && <span className="text-xs font-black text-emerald-300">-{group.sumUSD.toFixed(2)} $</span>}
                          {group.sumEUR > 0 && <span className="text-xs font-black text-indigo-300">-{group.sumEUR.toFixed(2)} €</span>}
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-3">
                        {group.items.map((tx, txIdx) => renderTransactionItem(tx, txIdx, `detailing-exp-${group.name}`))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div 
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[9999] flex flex-col items-center justify-center p-4 cursor-zoom-out animate-fadeIn"
        >
          <button 
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-full z-[10000]"
          >
            <X className="w-5 h-5" />
          </button>
          
          <img
            src={lightboxImage}
            alt="Повний чек"
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl"
          />
          <p className="text-slate-400 text-xs font-semibold mt-4 bg-slate-900/60 px-3 py-1.5 rounded-full">
            Натисніть у будь-якому місці для закриття
          </p>
        </div>
      )}
    </div>
  );
};
