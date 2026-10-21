import React, { useState, useEffect, useMemo } from "react";
import { 
  Search, 
  Calendar, 
  Trash2, 
  Paperclip, 
  ExternalLink, 
  X, 
  FileText, 
  CheckCircle2, 
  RefreshCw, 
  Edit3, 
  ArrowLeft, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Info, 
  Wallet, 
  Tag, 
  User, 
  Save,
  ChevronDown,
  ChevronUp,
  Copy,
  CreditCard,
  Clock,
  MessageSquare
} from "lucide-react";
import { HistoryGroup, InitData } from "../types";
import { getDirectImageUrl, parseTransactionText, replaceBankKeysWithAliases, getFulfillmentBreakdown, isLoanTransaction, resolveItemCurrency, getGroupEffectiveItems } from "../lib/transactionUtils";

interface SplitFlow {
  amountText: string;
  accountLabel: string;
  isDebt: boolean;
  isContractorSplit?: boolean;
  contractorFrom?: string;
  contractorTo?: string;
}

function parseSplitFlows(fullText: string): SplitFlow[] {
  const parsed = parseTransactionText(fullText);
  if (!parsed.cardDetails) return [];

  const lines = parsed.cardDetails.split("\n");
  const flows: SplitFlow[] = [];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const arrowIdx = trimmed.indexOf("➔");
    if (arrowIdx === -1) return;

    const amountPart = trimmed.substring(0, arrowIdx).trim();
    const actionPart = trimmed.substring(arrowIdx + 1).trim();

    let accountLabel = actionPart;
    let isDebt = false;
    let isContractorSplit = false;
    let contractorFrom = "";
    let contractorTo = "";

    if (
      actionPart.toLowerCase().includes("записано в борг") || 
      actionPart.toLowerCase().includes("записалися в борг") ||
      actionPart.toLowerCase().includes("борг")
    ) {
      isDebt = true;
      accountLabel = "Борг ⏳";
    } else if (actionPart.toLowerCase().includes("взаємозалік") || actionPart.toLowerCase().includes("контрагент")) {
      isContractorSplit = true;
      const match = actionPart.match(/(?:Взаємозалік|Контрагент):\s*([^\n➔]+)\s*➔\s*👤?\s*([^\n👤➔\n|]+)/i);
      if (match) {
        contractorFrom = match[1].trim();
        contractorTo = match[2].trim();
        accountLabel = "Контрагент";
      } else {
        accountLabel = actionPart
          .replace(/^(?:Взаємозалік:|взаємозалік:|Взаємозалік|взаємозалік|Контрагент:|контрагент:|Контрагент|контрагент)\s*/gi, "")
          .replace(/👤/g, "")
          .trim();
      }
    } else {
      // Remove prefixes like "списано з", "отримано на", etc.
      accountLabel = actionPart
        .replace(/^(?:списано з|отримано на|списано|отримано)\s+/i, "")
        .trim();
    }

    flows.push({
      amountText: amountPart,
      accountLabel: accountLabel,
      isDebt,
      isContractorSplit,
      contractorFrom,
      contractorTo
    });
  });

  return flows;
}

interface HistoryViewProps {
  groups: HistoryGroup[];
  allGroups?: HistoryGroup[];
  loading: boolean;
  initData: InitData | null;
  onBack: () => void;
  onAttachReceipt: (dateStr: string, file: any) => Promise<void>;
  onDeleteReceipt: (dateStr: string) => Promise<void>;
  initialSearch?: string;
  onClearSearch?: () => void;
  onSelectContractor?: (name: string) => void;
  onEditOperation?: (
    dateStr: string, 
    updatedData: { sum: number; contractor: string; comment: string }
  ) => Promise<void>;
  onDeleteOperation?: (dateStr: string, mode?: "all" | "history_only") => Promise<void>;
  currentCurrency?: string;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  groups,
  allGroups,
  loading,
  initData,
  onBack,
  onAttachReceipt,
  onDeleteReceipt,
  initialSearch,
  onClearSearch,
  onSelectContractor,
  onEditOperation,
  onDeleteOperation,
  currentCurrency = "UAH"
}) => {
  const [search, setSearch] = useState(initialSearch || "");
  const [historyCurrency, setHistoryCurrency] = useState<"ALL" | "UAH" | "USD" | "EUR">("ALL");
  const [selectedDate, setSelectedDate] = useState<string>(""); // YYYY-MM-DD
  const [datePreset, setDatePreset] = useState<"all" | "today" | "yesterday" | "7days" | "30days" | "this_month">("all");
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped");
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<"all" | "inc" | "exp" | "exc" | "debt">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAccount, setSelectedAccount] = useState<string>("all");
  const [isCopiedHistory, setIsCopiedHistory] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<"date-new" | "date-old" | "category" | "sum-desc" | "sum-asc">("date-new");
  const [isAttaching, setIsAttaching] = useState(false);
  const [deletingTransaction, setDeletingTransaction] = useState<HistoryGroup | null>(null);
  const [confirmFullDelete, setConfirmFullDelete] = useState(false);
  
  // Collapse / Expand list states
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [allExpanded, setAllExpanded] = useState(false);

  // Dedicated expandable comments state
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});

  const toggleCommentExpand = (dateStr: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedComments(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  const formatCompactDateTime = (dateStr: string): string => {
    if (!dateStr) return "";
    const trimmed = dateStr.trim();
    // Match DD.MM.YYYY or DD.MM.YY followed by time HH:mm:ss or HH:mm
    const m = trimmed.match(/^(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)[,\s]+(\d{1,2}:\d{2})(?::\d{2})?/);
    if (m) {
      return `${m[1]} • ${m[2]}`;
    }
    return trimmed;
  };

  const toggleGroupExpand = (dateStr: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [dateStr]: !prev[dateStr]
    }));
  };

  const getGroupDayISO = (g: HistoryGroup): string => {
    if (g.timestamp && g.timestamp > 1000000000000) {
      const d = new Date(g.timestamp);
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${yr}-${mo}-${day}`;
    }
    if (g.dateStr) {
      const match = g.dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
      if (match) {
        const day = match[1].padStart(2, "0");
        const mo = match[2].padStart(2, "0");
        let yr = match[3];
        if (yr.length === 2) yr = "20" + yr;
        return `${yr}-${mo}-${day}`;
      }
    }
    return "";
  };

  const formatDayHeader = (dayISO: string) => {
    if (!dayISO || dayISO === "no-date") return { fullDateStr: "Без дати", dayOfWeek: "", relativeLabel: "" };
    const parts = dayISO.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return { fullDateStr: dayISO, dayOfWeek: "", relativeLabel: "" };
    }
    const [yr, mo, da] = parts;
    const d = new Date(yr, mo - 1, da);
    const daysOfWeek = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"];
    const monthsNames = [
      "січня", "лютого", "березня", "квітня", "травня", "червня",
      "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"
    ];
    const dayOfWeek = daysOfWeek[d.getDay()] || "";
    const monthName = monthsNames[d.getMonth()] || "";
    const fullDateStr = `${da} ${monthName} ${yr}`;

    const today = new Date();
    const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    let relativeLabel = "";
    if (dayISO === todayISO) relativeLabel = "Сьогодні";
    else if (dayISO === yesterdayISO) relativeLabel = "Вчора";

    return { fullDateStr, dayOfWeek, relativeLabel };
  };

  const getTodayISO = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  };

  const getYesterdayISO = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  };

  const getGroupReadableSummary = (g: HistoryGroup) => {
    const isExc = g.operation === "Обмін";
    
    // Extract unique contractors
    const contractors = Array.from(new Set(g.items.map(item => {
      const parsed = parseTransactionText(item.fullText || item.text);
      return parsed.contractor?.trim();
    }).filter(Boolean)));

    // Extract unique banks
    const banks = Array.from(new Set(g.items.map(item => item.bank.trim())));
    const banksStr = banks.map(b => b).join(", ");

    // Extract comment, category, and amount details
    let firstComment = "";
    let firstCategory = "";
    let currencySymbol = "UAH"; // Default fallback
    
    if (g.items.length > 0) {
      const parsed = parseTransactionText(g.items[0].fullText || g.items[0].text);
      
      const amountText = parsed.amount || "";
      const currencyMatch = amountText.match(/[a-zA-Z$€₴]+/);
      if (currencyMatch) {
        currencySymbol = currencyMatch[0].toUpperCase();
      } else {
        const textMatch = (g.items[0].text || "").match(/(UAH|USD|EUR|грн|\$|€)/i);
        if (textMatch) {
          currencySymbol = textMatch[0].toUpperCase();
          if (currencySymbol === "ГРН") currencySymbol = "UAH";
        }
      }

      if (parsed.comment) {
        const catMatch = parsed.comment.match(/^\[(.*?)\]\s*([\s\S]*)/);
        firstCategory = catMatch ? catMatch[1] : "";
        firstComment = catMatch ? catMatch[2] : parsed.comment;
      }
    }

    const contractorText = contractors.length > 0 ? contractors.join(", ") : "";
    let amountFormatted = `${g.totalSum.toFixed(2)} ${currencySymbol}`;
    const breakdown = getFulfillmentBreakdown(g.items, currentCurrency);
    if (breakdown.isFulfillment) {
      const getSymbol = (c: string) => {
        if (c === "USD" || c === "$") return "$";
        if (c === "EUR" || c === "€") return "€";
        if (c === "UAH" || c === "₴") return "₴";
        return c || "";
      };
      const sym = getSymbol(breakdown.currency);
      amountFormatted = `${breakdown.principalSum.toFixed(2)} ${sym} + ${breakdown.interestSum.toFixed(2)} ${sym} %`;
    }

    if (g.operation.includes("Повернули борг")) {
      return {
        title: contractorText ? `👤 ${contractorText} повернув борг` : "👤 Контрагент повернув борг",
        subtitle: `Сума: ${amountFormatted} | Зараховано на: 🏦 ${banksStr || "рахунок"}`,
        icon: "🟢",
        badgeColor: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      };
    }
    
    if (g.operation.includes("Повертаю борг")) {
      return {
        title: contractorText ? `👤 Повернуто борг для ${contractorText}` : "👤 Повернуто борг контрагенту",
        subtitle: `Сума: ${amountFormatted} | Списано з: 🏦 ${banksStr || "рахунку"}`,
        icon: "🔴",
        badgeColor: "bg-red-500/10 text-red-400 border border-red-500/20"
      };
    }

    if (g.operation.includes("Покупка зі знижкою в борг комусь")) {
      return {
        title: contractorText ? `📉 Покупка зі знижкою в борг для 👤 ${contractorText}` : "📉 Покупка зі знижкою в борг комусь",
        subtitle: `Сума: ${amountFormatted} | Списано з: 🏦 ${banksStr || "рахунку"}`,
        icon: "📉",
        badgeColor: "bg-violet-500/10 text-violet-400 border border-violet-500/20"
      };
    }

    if (g.operation.includes("Покупка зі знижкою в борг")) {
      return {
        title: contractorText ? `📉 Покупка зі знижкою в борг для 👤 ${contractorText}` : "📉 Покупка зі знижкою в борг",
        subtitle: `Сума: ${amountFormatted} | Списано з: 🏦 ${banksStr || "рахунку"}`,
        icon: "📉",
        badgeColor: "bg-rose-500/10 text-rose-400 border border-rose-500/20"
      };
    }

    if (isExc) {
      return {
        title: `🔄 Обмін валюти`,
        subtitle: `Сума: ${amountFormatted} | Рахунки: 🏦 ${banksStr}`,
        icon: "🔵",
        badgeColor: "bg-blue-500/10 text-blue-400 border border-blue-500/20"
      };
    }

    if (g.isIncome) {
      const title = contractorText 
        ? `📥 Отримано від 👤 ${contractorText}` 
        : (firstCategory ? `📥 Надходження [${firstCategory}]` : "📥 Надходження коштів");
      
      const subtitle = `Сума: ${amountFormatted} | На рахунок: 🏦 ${banksStr}` + (firstComment ? ` (${firstComment})` : "");
      return {
        title,
        subtitle,
        icon: "📥",
        badgeColor: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
      };
    } else {
      const title = contractorText 
        ? `📤 Оплачено для 👤 ${contractorText}` 
        : (firstCategory ? `📤 Витрата [${firstCategory}]` : "📤 Списання коштів");

      const subtitle = `Сума: ${amountFormatted} | З рахунку: 🏦 ${banksStr}` + (firstComment ? ` (${firstComment})` : "");
      return {
        title,
        subtitle,
        icon: "📤",
        badgeColor: "bg-red-500/10 text-red-400 border border-red-500/20"
      };
    }
  };
  
  // Selected item for attachment
  const [selectedGroupDate, setSelectedGroupDate] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Detail Modal & Editing States
  const [selectedGroupForDetail, setSelectedGroupForDetail] = useState<HistoryGroup | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Form Fields for Editing
  const [editSum, setEditSum] = useState<string>("");
  const [editContractor, setEditContractor] = useState<string>("");
  const [editCategoryType, setEditCategoryType] = useState<"standard" | "custom">("standard");
  const [editCategorySelect, setEditCategorySelect] = useState<string>("");
  const [editCategoryCustom, setEditCategoryCustom] = useState<string>("");
  const [editCommentOnly, setEditCommentOnly] = useState<string>("");
  const [contractorSuggestions, setContractorSuggestions] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(50);
  const [showCategoryReportModal, setShowCategoryReportModal] = useState<boolean>(false);
  const [categoryModalSearch, setCategoryModalSearch] = useState<string>("");
  const [categoryModalScope, setCategoryModalScope] = useState<"all" | "filtered" | "this_month" | "prev_month">("all");
  const [categoryModalCurrency, setCategoryModalCurrency] = useState<"ALL" | "UAH" | "USD" | "EUR">("ALL");

  useEffect(() => {
    setSearch(initialSearch || "");
  }, [initialSearch]);

  useEffect(() => {
    setVisibleCount(50);
  }, [search, filter, selectedCategory, selectedDate, currentCurrency]);

  const handleSequentialBack = () => {
    if (lightboxImage) {
      setLightboxImage(null);
    } else if (selectedGroupForDetail) {
      setSelectedGroupForDetail(null);
    } else if (search) {
      setSearch("");
      if (onClearSearch) onClearSearch();
    } else if (selectedCategory !== "all") {
      setSelectedCategory("all");
    } else if (filter !== "all") {
      setFilter("all");
    } else {
      onBack();
    }
  };

  useEffect(() => {
    const handleIntercept = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (lightboxImage) {
        customEvent.detail.preventScreenTransition();
        setLightboxImage(null);
      } else if (isEditing) {
        customEvent.detail.preventScreenTransition();
        setIsEditing(false);
      } else if (selectedGroupForDetail) {
        customEvent.detail.preventScreenTransition();
        setSelectedGroupForDetail(null);
      } else if (isAttaching) {
        customEvent.detail.preventScreenTransition();
        setIsAttaching(false);
      }
    };
    window.addEventListener("app-back-intercept", handleIntercept);
    return () => window.removeEventListener("app-back-intercept", handleIntercept);
  }, [lightboxImage, isEditing, selectedGroupForDetail, isAttaching]);

  const renderTextWithContractors = (text: string, mainContractor?: string) => {
    if (!text) return null;

    let processedText = text;
    const mc = (mainContractor || "").trim() || "Ми";
    
    processedText = processedText.replace(
      /➔\s*взаємозаліком\s*зараховано\s*контрагенту\s*👤?\s*([^\n|👤➔]+)/gi,
      (match, name) => `➔ Контрагент: ${mc} ➔ 👤 ${name.trim()}`
    );
    
    processedText = processedText.replace(
      /➔\s*за\s*нас\s*повернув\s*контрагент\s*👤?\s*([^\n|👤➔]+)/gi,
      (match, name) => `➔ Контрагент: ${name.trim()} ➔ 👤 ${mc}`
    );

    processedText = processedText.replace(
      /➔\s*зараховано\s*контрагенту\s*👤?\s*([^\n|👤➔]+)/gi,
      (match, name) => `➔ Контрагент: ${mc} ➔ 👤 ${name.trim()}`
    );

    if (!onSelectContractor || !initData?.names || initData.names.length === 0) {
      return <span>{processedText}</span>;
    }

    const sortedContractors = [...initData.names].sort((a, b) => b.length - a.length);
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedNames = sortedContractors.map(name => escapeRegExp(name)).join('|');
    
    // Match optional 👤 icon followed by any of the contractor names
    const regex = new RegExp(`(👤?\\s*(?:${escapedNames}))`, 'gi');
    
    const parts = processedText.split(regex);
    if (parts.length <= 1) {
      return <span>{processedText}</span>;
    }

    let currentOffset = 0;
    const isLetter = (ch: string) => /[a-zA-Zа-яА-ЯёЁіІїЇєЄґҐ0-9]/.test(ch);

    return (
      <span>
        {parts.map((part, idx) => {
          const startOffset = currentOffset;
          currentOffset += part.length;

          if (idx % 2 === 1) {
            const trimmedPart = part.trim();
            const cleanName = trimmedPart.replace(/^👤\s*/, "").trim();
            const matchedContractor = sortedContractors.find(
              c => c.toLowerCase() === cleanName.toLowerCase()
            );

            if (matchedContractor) {
              const hasIcon = trimmedPart.startsWith("👤");
              
              if (!hasIcon) {
                const charBefore = startOffset > 0 ? processedText[startOffset - 1] : "";
                const charAfter = startOffset + part.length < processedText.length ? processedText[startOffset + part.length] : "";
                if (isLetter(charBefore) || isLetter(charAfter)) {
                  return <span key={idx}>{part}</span>;
                }
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectContractor(matchedContractor);
                    setSelectedGroupForDetail(null); // Close detail modal
                  }}
                  className="custom-click-guard inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-950/60 hover:bg-sky-900/80 border border-sky-500/30 hover:border-sky-400 text-sky-300 hover:text-sky-200 rounded-lg text-xs md:text-[13px] font-extrabold transition-all active:scale-95 cursor-pointer align-middle shadow-md mx-1"
                  title={`Перейти до картки контрагента "${matchedContractor}"`}
                >
                  👤 {matchedContractor}
                </button>
              );
            }
          }

          return <span key={idx}>{part}</span>;
        })}
      </span>
    );
  };

  const handleFileAttachLocal = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedGroupDate) return;

    setIsAttaching(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        await onAttachReceipt(selectedGroupDate, {
          base64,
          mimeType: file.type,
          name: file.name
        });
        
        // Update selected detailed group if it matches the current updated one
        if (selectedGroupForDetail && selectedGroupForDetail.dateStr === selectedGroupDate) {
          const directUrl = `📎 https://drive.google.com/open?id=temp_uploaded_receipt`; // placeholder to force local react state update
          setSelectedGroupForDetail(prev => {
            if (!prev) return null;
            return {
              ...prev,
              items: prev.items.map(it => ({
                ...it,
                fullText: it.fullText + "\n" + directUrl,
                text: it.text + "\n" + directUrl
              }))
            };
          });
        }
        
        alert("Чек успішно завантажено та прикріплено!");
      } catch (err) {
        alert("Помилка завантаження чеку.");
      } finally {
        setIsAttaching(false);
        setSelectedGroupDate(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleReceiptDeleteLocal = async (dateStr: string) => {
    try {
      await onDeleteReceipt(dateStr);
      
      // Update selected detailed group if open
      if (selectedGroupForDetail && selectedGroupForDetail.dateStr === dateStr) {
        setSelectedGroupForDetail(prev => {
          if (!prev) return null;
          return {
            ...prev,
            items: prev.items.map(it => {
              const cleanedText = it.text.replace(/\|\s*📎\s*https?:\/\/[^\s]+/g, "").replace(/https?:\/\/[^\s]+/g, "").trim();
              const cleanedFull = it.fullText.replace(/\|\s*📎\s*https?:\/\/[^\s]+/g, "").replace(/https?:\/\/[^\s]+/g, "").trim();
              return {
                ...it,
                text: cleanedText,
                fullText: cleanedFull
              };
            })
          };
        });
      }
    } catch (err) {
      console.error("Error deleting receipt:", err);
    }
  };

  // Extract category name helper
  const getGroupCategory = (g: HistoryGroup): string => {
    for (const item of g.items) {
      const parsed = parseTransactionText(item.fullText || item.text);
      if (parsed.comment) {
        const matchComment = parsed.comment.match(/\[(.*?)\]/);
        if (matchComment) {
          return matchComment[1].trim();
        }
      }
      const matchStart = item.text.match(/^\[(.*?)\]/);
      if (matchStart) {
        return matchStart[1].trim();
      }
    }
    return "";
  };

  // Get all unique categories present in the full history list
  const uniqueCategoriesInHistory = useMemo(() => {
    const catsSet = new Set<string>();
    const pool = (allGroups && allGroups.length > 0) ? allGroups : groups;
    pool.forEach(g => {
      const cat = getGroupCategory(g);
      if (cat) catsSet.add(cat);
    });
    return Array.from(catsSet).sort();
  }, [groups, allGroups]);

  // Get all unique accounts/banks present in history
  const uniqueAccountsInHistory = useMemo(() => {
    const accSet = new Set<string>();
    const pool = (allGroups && allGroups.length > 0) ? allGroups : groups;
    pool.forEach(g => {
      g.items.forEach(it => {
        if (it.bank && it.bank.trim() && it.bank.trim() !== "Реєстр боргів") {
          accSet.add(replaceBankKeysWithAliases(it.bank.trim(), initData));
        }
      });
    });
    return Array.from(accSet).sort();
  }, [groups, allGroups, initData]);

  // Combined standard + dynamic categories for editing dropdown
  const categoriesList = useMemo(() => {
    const standard = initData?.categories || [];
    const merged = new Set([...standard, ...uniqueCategoriesInHistory]);
    return Array.from(merged).filter(Boolean);
  }, [initData, uniqueCategoriesInHistory]);

  // Handle autocomplete matching for Contractor name
  const handleContractorChange = (val: string) => {
    setEditContractor(val);
    if (!val.trim()) {
      setContractorSuggestions([]);
      return;
    }
    const names = initData?.names || [];
    const filtered = names.filter(n => 
      n.toLowerCase().includes(val.toLowerCase()) && 
      n.toLowerCase() !== val.toLowerCase()
    );
    setContractorSuggestions(filtered.slice(0, 5));
  };

  // Prepare editing form inputs when entering Edit Mode
  const startEditing = (g: HistoryGroup) => {
    setSelectedGroupForDetail(g);
    const representative = g.items[0];
    const parsed = parseTransactionText(representative.fullText || representative.text);
    
    const activeCurr = representative?.curr || currentCurrency || "UAH";
    let itemSum = representative ? Math.abs(representative.sum) : 0;
    if (representative?.fullText) {
      if (activeCurr === "UAH") {
        const uahMatch = representative.fullText.match(/([\d.]+)\s*(?:UAH|₴|грн)/i);
        if (uahMatch) {
          const uahVal = parseFloat(uahMatch[1]);
          if (uahVal > 0) itemSum = uahVal;
        }
      } else if (activeCurr === "USD") {
        const usdInCard = (parsed.cardDetails || "").match(/([\d.]+)\s*(?:USD|\$)/i);
        if (usdInCard && parseFloat(usdInCard[1]) > 0) {
          itemSum = parseFloat(usdInCard[1]);
        } else {
          const usdMatch = representative.fullText.match(/([\d.]+)\s*(?:USD|\$|долар)/i);
          if (usdMatch) {
            const usdVal = parseFloat(usdMatch[1]);
            if (usdVal > 0) itemSum = usdVal;
          }
        }
        if (itemSum > 2000) {
          const cardValMatch = representative.fullText.match(/💳\s*([\d.]+)\s*(?:USD|\$)/i);
          if (cardValMatch && parseFloat(cardValMatch[1]) > 0 && parseFloat(cardValMatch[1]) < 2000) {
            itemSum = parseFloat(cardValMatch[1]);
          }
        }
      } else if (activeCurr === "EUR") {
        const eurMatch = representative.fullText.match(/([\d.]+)\s*(?:EUR|€|євро)/i);
        if (eurMatch) {
          const eurVal = parseFloat(eurMatch[1]);
          if (eurVal > 0) itemSum = eurVal;
        }
      }
    }
    const finalSum = itemSum > 0 ? itemSum : Math.abs(g.totalSum);
    setEditSum(finalSum.toString());
    
    // Find contractor if present across items
    let contractorName = parsed.contractor || "";
    if (!contractorName) {
      for (const item of g.items) {
        const itemParsed = parseTransactionText(item.fullText || item.text);
        if (itemParsed.contractor) {
          contractorName = itemParsed.contractor;
          break;
        }
        const matchCredit = item.text.match(/зараховано\s*контрагенту\s*👤?\s*([^\n|👤➔]+)/i) || item.text.match(/повернув\s*контрагент\s*👤?\s*([^\n|👤➔]+)/i);
        if (matchCredit && matchCredit[1]) {
          contractorName = matchCredit[1].trim();
          break;
        }
      }
    }
    setEditContractor(contractorName);
    
    // Parse category and clean comment text
    let catName = "";
    let commOnly = parsed.comment || "";
    if (parsed.comment) {
      const catMatch = parsed.comment.match(/^\[(.*?)\]\s*([\s\S]*)/);
      if (catMatch) {
        catName = catMatch[1].trim();
        commOnly = catMatch[2].trim();
      }
    }
    
    if (catName) {
      if (categoriesList.includes(catName)) {
        setEditCategoryType("standard");
        setEditCategorySelect(catName);
      } else {
        setEditCategoryType("custom");
        setEditCategoryCustom(catName);
      }
    } else {
      setEditCategoryType("standard");
      setEditCategorySelect("");
    }
    
    setEditCommentOnly(commOnly);
    setContractorSuggestions([]);
    setIsEditing(true);
  };

  // Save the Edited operation
  const saveEditLocal = async () => {
    if (!selectedGroupForDetail || !onEditOperation) return;
    
    const sumNum = parseFloat(editSum);
    if (isNaN(sumNum) || sumNum <= 0) {
      alert("Введіть коректну суму!");
      return;
    }

    setIsSavingEdit(true);
    try {
      const finalCategory = editCategoryType === "standard" ? editCategorySelect : editCategoryCustom;
      const finalComment = finalCategory.trim() 
        ? `[${finalCategory.trim()}] ${editCommentOnly.trim()}`.trim() 
        : editCommentOnly.trim();

      const hasSplits = !!selectedGroupForDetail.items.find(item => parseTransactionText(item.fullText || item.text).cardDetails) || selectedGroupForDetail.items.length > 1;

      await onEditOperation(selectedGroupForDetail.dateStr, {
        sum: sumNum,
        contractor: editContractor.trim(),
        comment: finalComment,
        isSplit: hasSplits
      });

      alert("Запис успішно оновлено!");
      setIsEditing(false);
      setSelectedGroupForDetail(null); // Close modal and force refresh
    } catch (err: any) {
      alert("Помилка збереження змін: " + err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filter and sort history
  const filteredGroups = useMemo(() => {
    const pool = (allGroups && allGroups.length > 0) ? allGroups : groups;
    return pool
      .filter(g => {
        // 0. Filter currency
        if (historyCurrency !== "ALL") {
          const effItems = getGroupEffectiveItems(g);
          const hasMatchingItem = effItems.some(it => it.curr === historyCurrency);
          if (!hasMatchingItem) return false;
        }

        // 0b. Filter selected date or date preset
        if (selectedDate) {
          const gDay = getGroupDayISO(g);
          if (gDay !== selectedDate) return false;
        } else if (datePreset !== "all") {
          const gDay = getGroupDayISO(g);
          if (!gDay) return false;
          const now = new Date();
          const pad = (n: number) => String(n).padStart(2, "0");
          const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

          if (datePreset === "today" && gDay !== todayStr) return false;
          if (datePreset === "yesterday") {
            const y = new Date(now);
            y.setDate(y.getDate() - 1);
            const yStr = `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`;
            if (gDay !== yStr) return false;
          }
          if (datePreset === "7days") {
            const d7 = new Date(now);
            d7.setDate(d7.getDate() - 7);
            const d7Str = `${d7.getFullYear()}-${pad(d7.getMonth() + 1)}-${pad(d7.getDate())}`;
            if (gDay < d7Str || gDay > todayStr) return false;
          }
          if (datePreset === "30days") {
            const d30 = new Date(now);
            d30.setDate(d30.getDate() - 30);
            const d30Str = `${d30.getFullYear()}-${pad(d30.getMonth() + 1)}-${pad(d30.getDate())}`;
            if (gDay < d30Str || gDay > todayStr) return false;
          }
          if (datePreset === "this_month") {
            const mPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
            if (!gDay.startsWith(mPrefix)) return false;
          }
        }

        // 1. Filter type
        const isExc = g.operation === "Обмін" || g.operation?.includes("Обмін") || g.items?.some(it => it.operation === "Обмін" || it.text?.includes("Обмін"));
        const isDebt = g.operation?.includes("борг") || g.items?.some(it => (it.bank && it.bank.includes("борг")) || (it.text && it.text.includes("борг")));
        if (filter === "inc" && (g.isIncome === false || isExc)) return false;
        if (filter === "exp" && (g.isIncome === true || isExc)) return false;
        if (filter === "exc" && !isExc) return false;
        if (filter === "debt" && !isDebt) return false;

        // 2. Filter category
        if (selectedCategory !== "all") {
          const cat = getGroupCategory(g);
          const hasMatchingItem = g.items?.some(it => {
            const parsed = parseTransactionText(it.fullText || it.text);
            const itemCat = parsed.comment?.match(/\[(.*?)\]/)?.[1]?.trim() || it.text.match(/^\[(.*?)\]/)?.[1]?.trim();
            return itemCat && itemCat.toLowerCase() === selectedCategory.toLowerCase();
          });
          if (cat.toLowerCase() !== selectedCategory.toLowerCase() && !hasMatchingItem) return false;
        }

        // 2b. Filter account / bank
        if (selectedAccount !== "all") {
          const hasAccount = g.items.some(it => {
            const alias = replaceBankKeysWithAliases(it.bank || "", initData);
            return alias.toLowerCase() === selectedAccount.toLowerCase() || (it.bank && it.bank.toLowerCase() === selectedAccount.toLowerCase());
          });
          if (!hasAccount) return false;
        }

        // 3. Filter text
        if (!search) return true;
        const q = search.toLowerCase();
        const matchesOp = g.operation.toLowerCase().includes(q);
        const matchesDate = g.dateStr.toLowerCase().includes(q);
        const matchesItems = g.items.some(it =>
          it.text.toLowerCase().includes(q) || it.bank.toLowerCase().includes(q)
        );
        return matchesOp || matchesDate || matchesItems;
      })
      .sort((a, b) => {
        const getGroupTime = (group: HistoryGroup) => {
          if (group.timestamp && !isNaN(group.timestamp) && group.timestamp > 0) return group.timestamp;
          if (group.dateStr) {
            const m = group.dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2}))?/);
            if (m) {
              const da = parseInt(m[1], 10);
              const mo = parseInt(m[2], 10) - 1;
              let yr = parseInt(m[3], 10);
              if (yr < 100) yr = 2000 + yr;
              const hr = m[4] ? parseInt(m[4], 10) : 0;
              const mi = m[5] ? parseInt(m[5], 10) : 0;
              return new Date(yr, mo, da, hr, mi).getTime();
            }
          }
          return 0;
        };

        if (sortBy === "date-new") {
          return getGroupTime(b) - getGroupTime(a);
        }
        if (sortBy === "date-old") {
          return getGroupTime(a) - getGroupTime(b);
        }
        if (sortBy === "category") {
          return getGroupCategory(a).localeCompare(getGroupCategory(b));
        }
        if (sortBy === "sum-desc") {
          return b.totalSum - a.totalSum;
        }
        if (sortBy === "sum-asc") {
          return a.totalSum - b.totalSum;
        }
        return 0;
      });
  }, [groups, allGroups, historyCurrency, filter, selectedCategory, selectedAccount, datePreset, search, sortBy, selectedDate, initData]);

  const filteredTotals = useMemo(() => {
    let incomeSum = 0;
    let expenseSum = 0;
    let exchangeTurnover = 0;
    let exchangeCount = 0;
    let debtIncomeSum = 0;
    let debtExpenseSum = 0;
    let debtCount = 0;

    const byCurr: Record<"UAH" | "USD" | "EUR", { 
      inc: number; 
      exp: number; 
      exc: number; 
      debtInc: number;
      debtExp: number;
      total: number; 
      net: number; 
      count: number 
    }> = {
      UAH: { inc: 0, exp: 0, exc: 0, debtInc: 0, debtExp: 0, total: 0, net: 0, count: 0 },
      USD: { inc: 0, exp: 0, exc: 0, debtInc: 0, debtExp: 0, total: 0, net: 0, count: 0 },
      EUR: { inc: 0, exp: 0, exc: 0, debtInc: 0, debtExp: 0, total: 0, net: 0, count: 0 }
    };

    filteredGroups.forEach(g => {
      const effItems = getGroupEffectiveItems(g);
      const isExc = g.operation === "Обмін" || g.operation?.includes("Обмін") || effItems.some(it => it.operation === "Обмін" || it.text?.includes("Обмін"));
      const isDebt = g.operation?.includes("борг") || effItems.some(it => (it.bank && it.bank.includes("борг")) || (it.text && it.text.includes("борг")));

      if (isExc) {
        exchangeCount += 1;
        effItems.forEach(it => {
          const itemSum = Math.abs(Number(it.sum) || 0);
          if (itemSum < 0.001) return;
          if (historyCurrency !== "ALL" && it.curr !== historyCurrency) return;
          exchangeTurnover += itemSum;
          byCurr[it.curr].exc += itemSum;
          byCurr[it.curr].count += 1;
        });
      } else {
        let hasItemCounted = false;
        effItems.forEach(it => {
          const itemSum = Math.abs(Number(it.sum) || 0);
          if (itemSum < 0.001) return;
          if (historyCurrency !== "ALL" && it.curr !== historyCurrency) return;

          // If filtering by category, verify item matches category
          if (selectedCategory !== "all") {
            const parsed = parseTransactionText(it.fullText || it.text);
            const itemCat = parsed.comment?.match(/\[(.*?)\]/)?.[1]?.trim() || it.text.match(/^\[(.*?)\]/)?.[1]?.trim() || getGroupCategory(g);
            if (itemCat && itemCat.toLowerCase() !== selectedCategory.toLowerCase()) return;
          }

          // If filtering by account, verify item matches account
          if (selectedAccount !== "all") {
            const alias = replaceBankKeysWithAliases(it.bank || "", initData);
            if (alias.toLowerCase() !== selectedAccount.toLowerCase() && (!it.bank || it.bank.toLowerCase() !== selectedAccount.toLowerCase())) return;
          }

          hasItemCounted = true;
          const itemIsInc = it.isIncome !== undefined ? it.isIncome : g.isIncome;
          if (itemIsInc) {
            incomeSum += itemSum;
            byCurr[it.curr].inc += itemSum;
            if (isDebt) {
              debtIncomeSum += itemSum;
              byCurr[it.curr].debtInc += itemSum;
            }
          } else {
            expenseSum += itemSum;
            byCurr[it.curr].exp += itemSum;
            if (isDebt) {
              debtExpenseSum += itemSum;
              byCurr[it.curr].debtExp += itemSum;
            }
          }
          byCurr[it.curr].total += itemSum;
          byCurr[it.curr].net = byCurr[it.curr].inc - byCurr[it.curr].exp;
          byCurr[it.curr].count += 1;
        });
        if (hasItemCounted && isDebt) debtCount += 1;
      }
    });

    const activeCurrs = historyCurrency !== "ALL"
      ? [historyCurrency as "UAH" | "USD" | "EUR"]
      : (["UAH", "USD", "EUR"] as const).filter(
          c => byCurr[c].total > 0.001 || byCurr[c].exc > 0.001
        );

    const rUsd = parseFloat(localStorage.getItem("rate_usd_app") || "41.50") || 41.5;
    const rEur = parseFloat(localStorage.getItem("rate_eur_app") || "45.00") || 45.0;

    const equivIncomeUAH = byCurr.UAH.inc + (byCurr.USD.inc * rUsd) + (byCurr.EUR.inc * rEur);
    const equivExpenseUAH = byCurr.UAH.exp + (byCurr.USD.exp * rUsd) + (byCurr.EUR.exp * rEur);
    const equivNetUAH = equivIncomeUAH - equivExpenseUAH;
    const equivExchangeUAH = byCurr.UAH.exc + (byCurr.USD.exc * rUsd) + (byCurr.EUR.exc * rEur);

    // If a specific currency is filtered or only one currency is present, use strictly that currency's figures; otherwise equivalent UAH
    const singleCurKey = (historyCurrency !== "ALL" ? historyCurrency : (activeCurrs.length === 1 ? activeCurrs[0] : null));
    const activeIncome = singleCurKey ? byCurr[singleCurKey as "UAH" | "USD" | "EUR"].inc : equivIncomeUAH;
    const activeExpense = singleCurKey ? byCurr[singleCurKey as "UAH" | "USD" | "EUR"].exp : equivExpenseUAH;
    const activeNet = activeIncome - activeExpense;
    const activeDebtInc = singleCurKey ? byCurr[singleCurKey as "UAH" | "USD" | "EUR"].debtInc : debtIncomeSum;
    const activeDebtExp = singleCurKey ? byCurr[singleCurKey as "UAH" | "USD" | "EUR"].debtExp : debtExpenseSum;

    return {
      incomeSum: activeIncome,
      expenseSum: activeExpense,
      exchangeTurnover,
      exchangeCount,
      debtIncomeSum: activeDebtInc,
      debtExpenseSum: activeDebtExp,
      debtCount,
      netSum: activeNet,
      totalSum: activeIncome + activeExpense,
      byCurr,
      activeCurrs,
      equivIncomeUAH,
      equivExpenseUAH,
      equivNetUAH,
      equivExchangeUAH,
      rUsd,
      rEur
    };
  }, [filteredGroups, historyCurrency]);

  // Full summary breakdown across all categories (with period, filter scope, and currency support)
  const allCategoriesSummary = useMemo(() => {
    let poolGroups = (allGroups && allGroups.length > 0) ? allGroups : groups;
    if ((!allGroups || allGroups.length === 0 || !allGroups.some(g => g.curr === "EUR")) && (categoryModalCurrency === "EUR" || categoryModalCurrency === "USD" || categoryModalCurrency === "ALL")) {
      try {
        const cachedAll = localStorage.getItem("cached_history_groups_ALL");
        if (cachedAll) {
          const parsed = JSON.parse(cachedAll);
          if (Array.isArray(parsed) && parsed.length > 0) poolGroups = parsed;
        }
      } catch {}
    }

    let sourceGroups = poolGroups;
    if (categoryModalScope === "filtered") {
      sourceGroups = filteredGroups;
    } else if (categoryModalScope === "this_month") {
      const now = new Date();
      sourceGroups = poolGroups.filter(g => {
        const d = new Date(g.timestamp);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
    } else if (categoryModalScope === "prev_month") {
      const prev = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
      sourceGroups = poolGroups.filter(g => {
        const d = new Date(g.timestamp);
        return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
      });
    }

    if (categoryModalCurrency !== "ALL") {
      sourceGroups = sourceGroups.filter(g => {
        const gItem = g.items?.[0];
        const s = Math.abs(Number(g.totalSum) || (gItem?.sum ? Math.abs(gItem.sum) : 0));
        const trueC = resolveItemCurrency(gItem?.curr, g.curr, gItem?.text, gItem?.fullText, s);
        return trueC === categoryModalCurrency;
      });
    }

    const map: {
      [cat: string]: {
        name: string;
        count: number;
        totalSum: number;
        incSum: number;
        expSum: number;
        netSum: number;
        uah: number;
        usd: number;
        eur: number;
      };
    } = {};

    sourceGroups.forEach(g => {
      if (g.operation === "Обмін") return;
      const cat = getGroupCategory(g) || "Без категорії";
      const s = Math.abs(Number(g.totalSum) || 0);
      if (!map[cat]) {
        map[cat] = { name: cat, count: 0, totalSum: 0, incSum: 0, expSum: 0, netSum: 0, uah: 0, usd: 0, eur: 0 };
      }
      map[cat].count += 1;
      map[cat].totalSum += s;
      const isLoan = isLoanTransaction(g.operation, cat, g.items?.[0]?.text, g.items?.[0]?.fullText);
      if (g.isIncome) {
        if (!isLoan) {
          map[cat].incSum += s;
        }
      } else {
        map[cat].expSum += s;
      }
      map[cat].netSum = map[cat].incSum - map[cat].expSum;

      const gItem = g.items?.[0];
      const trueC = resolveItemCurrency(gItem?.curr, g.curr, gItem?.text, gItem?.fullText, s);
      if (trueC === "USD") map[cat].usd += s;
      else if (trueC === "EUR") map[cat].eur += s;
      else map[cat].uah += s;
    });

    return Object.values(map).sort((a, b) => {
      const equivA = a.uah + a.usd * 41.5 + a.eur * 45.2;
      const equivB = b.uah + b.usd * 41.5 + b.eur * 45.2;
      return equivB - equivA;
    });
  }, [groups, filteredGroups, allGroups, categoryModalScope, categoryModalCurrency]);

  const dayGroups = useMemo(() => {
    const map = new Map<string, HistoryGroup[]>();
    const order: string[] = [];

    filteredGroups.forEach(g => {
      const dayISO = getGroupDayISO(g) || "no-date";
      if (!map.has(dayISO)) {
        map.set(dayISO, []);
        order.push(dayISO);
      }
      map.get(dayISO)!.push(g);
    });

    return order.map(dayISO => {
      const items = map.get(dayISO)!;
      let incomeTotal = 0;
      let expenseTotal = 0;
      let excTotal = 0;
      const byCurr: Record<"UAH" | "USD" | "EUR", { inc: number; exp: number; exc: number; total: number }> = {
        UAH: { inc: 0, exp: 0, exc: 0, total: 0 },
        USD: { inc: 0, exp: 0, exc: 0, total: 0 },
        EUR: { inc: 0, exp: 0, exc: 0, total: 0 }
      };

      items.forEach(g => {
        const effItems = getGroupEffectiveItems(g);
        const isExc = g.operation === "Обмін" || g.operation?.includes("Обмін") || effItems.some(it => it.operation === "Обмін" || it.text?.includes("Обмін"));

        if (isExc) {
          effItems.forEach(it => {
            const itemSum = Math.abs(Number(it.sum) || 0);
            if (itemSum < 0.001) return;
            if (historyCurrency !== "ALL" && it.curr !== historyCurrency) return;
            excTotal += itemSum;
            byCurr[it.curr].exc += itemSum;
          });
        } else {
          effItems.forEach(it => {
            const itemSum = Math.abs(Number(it.sum) || 0);
            if (itemSum < 0.001) return;
            if (historyCurrency !== "ALL" && it.curr !== historyCurrency) return;

            if (selectedCategory !== "all") {
              const parsed = parseTransactionText(it.fullText || it.text);
              const itemCat = parsed.comment?.match(/\[(.*?)\]/)?.[1]?.trim() || it.text.match(/^\[(.*?)\]/)?.[1]?.trim() || getGroupCategory(g);
              if (itemCat && itemCat.toLowerCase() !== selectedCategory.toLowerCase()) return;
            }

            if (selectedAccount !== "all") {
              const alias = replaceBankKeysWithAliases(it.bank || "", initData);
              if (alias.toLowerCase() !== selectedAccount.toLowerCase() && (!it.bank || it.bank.toLowerCase() !== selectedAccount.toLowerCase())) return;
            }

            const itemIsInc = it.isIncome !== undefined ? it.isIncome : g.isIncome;
            if (itemIsInc) {
              incomeTotal += itemSum;
              byCurr[it.curr].inc += itemSum;
            } else {
              expenseTotal += itemSum;
              byCurr[it.curr].exp += itemSum;
            }
            byCurr[it.curr].total += itemSum;
          });
        }
      });

      const dayActiveCurrs = (["UAH", "USD", "EUR"] as const).filter(
        c => byCurr[c].total > 0.001 || byCurr[c].exc > 0.001
      );

      const rUsd = parseFloat(localStorage.getItem("rate_usd_app") || "41.50") || 41.5;
      const rEur = parseFloat(localStorage.getItem("rate_eur_app") || "45.00") || 45.0;

      const finalInc = historyCurrency !== "ALL" 
        ? byCurr[historyCurrency as "UAH" | "USD" | "EUR"].inc 
        : byCurr.UAH.inc + (byCurr.USD.inc * rUsd) + (byCurr.EUR.inc * rEur);
      const finalExp = historyCurrency !== "ALL" 
        ? byCurr[historyCurrency as "UAH" | "USD" | "EUR"].exp 
        : byCurr.UAH.exp + (byCurr.USD.exp * rUsd) + (byCurr.EUR.exp * rEur);

      return {
        dayISO,
        headerInfo: formatDayHeader(dayISO),
        groups: items,
        incomeTotal: finalInc,
        expenseTotal: finalExp,
        excTotal,
        netBalance: finalInc - finalExp,
        byCurr,
        activeCurrs: dayActiveCurrs,
        opCount: items.length
      };
    });
  }, [filteredGroups, historyCurrency]);

  const toggleExpandAll = () => {
    const nextVal = !allExpanded;
    setAllExpanded(nextVal);
    const updated: Record<string, boolean> = {};
    if (nextVal) {
      filteredGroups.forEach(g => {
        updated[g.dateStr] = true;
      });
    }
    setExpandedGroups(updated);
  };

  // Shared helper to render styled contractor button
  const renderContractorButton = (name: string, forceHighlight = false) => {
    const isMe = name.toLowerCase() === "ми";
    const searchNormalized = (search || "").trim().toLowerCase();
    const isMatched = name && searchNormalized && !isMe && name.toLowerCase().includes(searchNormalized);
    const highlight = forceHighlight || isMatched;
    
    if (isMe) {
      return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${highlight ? 'bg-amber-500/25 border-amber-400 text-amber-200 ring-2 ring-amber-400/40' : 'bg-amber-950/40 border border-amber-500/20 text-amber-300'} rounded-lg text-[11px] md:text-xs font-black shadow-sm select-none transition-all`}>
          👤 Ми
        </span>
      );
    }
    return (
      <button
        key={name}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectContractor?.(name);
          setSelectedGroupForDetail(null); // Close detail modal
        }}
        className={`custom-click-guard inline-flex items-center gap-1 px-2 py-0.5 ${highlight ? 'bg-sky-400/30 border-sky-400 text-white ring-2 ring-sky-400/40 font-black' : 'bg-sky-950/70 hover:bg-sky-900/90 border border-sky-500/40 hover:border-sky-400 text-sky-300 hover:text-white'} rounded-lg text-[11px] md:text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm align-middle`}
        title={`Перейти до картки контрагента "${name}"`}
      >
        👤 {name}
      </button>
    );
  };

  const renderSummaryFlow = (g: HistoryGroup) => {
    const isExc = g.operation === "Обмін";
    
    // Extract unique contractors
    const contractors = Array.from(new Set(g.items.map(item => {
      const parsed = parseTransactionText(item.fullText || item.text);
      return parsed.contractor?.trim();
    }).filter(Boolean))) as string[];

    // Extract unique banks
    const banks = Array.from(new Set(g.items.map(item => item.bank.trim()))) as string[];
    const banksStr = banks.join(", ");

    // Extract currency symbol
    let currencySymbol = "UAH";
    if (g.items.length > 0) {
      const parsed = parseTransactionText(g.items[0].fullText || g.items[0].text);
      const amountText = parsed.amount || "";
      const currencyMatch = amountText.match(/[a-zA-Z$€₴]+/);
      if (currencyMatch) {
        currencySymbol = currencyMatch[0].toUpperCase();
      } else {
        const textMatch = (g.items[0].text || "").match(/(UAH|USD|EUR|грн|\$|€)/i);
        if (textMatch) {
          currencySymbol = textMatch[0].toUpperCase();
          if (currencySymbol === "ГРН") currencySymbol = "UAH";
        }
      }
    }

    let amountFormatted = `${g.totalSum.toFixed(2)} ${currencySymbol}`;
    const breakdown = getFulfillmentBreakdown(g.items, currentCurrency);
    if (breakdown.isFulfillment) {
      const getSymbol = (c: string) => {
        if (c === "USD" || c === "$") return "$";
        if (c === "EUR" || c === "€") return "€";
        if (c === "UAH" || c === "₴") return "₴";
        return c || "";
      };
      const sym = getSymbol(breakdown.currency);
      amountFormatted = `${breakdown.principalSum.toFixed(2)} ${sym} + ${breakdown.interestSum.toFixed(2)} ${sym} %`;
    }

    // Try to get split flows from description text
    let displayFlows: SplitFlow[] = [];
    const parsedFlows = parseSplitFlows(g.items[0]?.fullText || g.items[0]?.text || "");
    
    if (parsedFlows.length > 1) {
      displayFlows = parsedFlows;
    } else if (g.items.length > 1) {
      displayFlows = g.items.map(item => {
        const bName = replaceBankKeysWithAliases(item.bank, initData);
        return {
          amountText: `${Math.abs(item.sum).toFixed(2)} ${currencySymbol}`,
          accountLabel: bName,
          isDebt: bName === "Реєстр боргів"
        };
      });
    }

    // Helper to render bank badge
    const renderBankBadge = (bName: string) => {
      const searchNormalized = (search || "").trim().toLowerCase();
      const bNameClean = replaceBankKeysWithAliases(bName, initData).toLowerCase();
      const rawBName = bName.toLowerCase();
      const isMatched = searchNormalized && (bNameClean.includes(searchNormalized) || rawBName.includes(searchNormalized));
      
      return (
        <span className={`inline-flex items-center gap-1 px-3 py-1 ${isMatched ? 'bg-sky-500/20 border-sky-400 text-white ring-2 ring-sky-400/40 font-black scale-[1.02]' : 'bg-slate-800/80 border border-slate-700/60 text-slate-300'} rounded-xl text-xs md:text-sm font-bold shadow-sm align-middle select-none transition-all`}>
          🏦 {replaceBankKeysWithAliases(bName, initData)}
        </span>
      );
    };

    const renderCategoryBadge = (catName: string, isIncomeFlow = false) => {
      if (isIncomeFlow) {
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 rounded-xl text-xs md:text-sm font-black shadow-sm align-middle">
            📥 {catName || "Надходження"}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-violet-950/40 border border-violet-500/20 text-violet-300 rounded-xl text-xs md:text-sm font-black shadow-sm align-middle">
          📁 {catName || "Витрата"}
        </span>
      );
    };

    const renderFlowArrowBox = (amountText: string, subLabel: string, colorClass: string) => {
      const searchNormalized = (search || "").trim().toLowerCase();
      const bNameClean = replaceBankKeysWithAliases(subLabel, initData).toLowerCase();
      const rawBName = subLabel.toLowerCase();
      const isMatched = searchNormalized && (bNameClean.includes(searchNormalized) || rawBName.includes(searchNormalized));

      return (
        <div className={`flex flex-col items-center justify-center px-2 py-0.5 ${isMatched ? 'bg-sky-500/10 border-sky-400 ring-2 ring-sky-400/40 scale-[1.01]' : 'bg-slate-900 border border-slate-800/80'} rounded-lg min-w-[75px] shadow-sm text-center mx-0.5 select-none transition-all`}>
          <span className={`text-[10px] md:text-xs font-black tracking-wide ${colorClass}`}>
            {amountText}
          </span>
          <span className={`text-[7.5px] md:text-[8.5px] ${isMatched ? 'text-sky-300 font-black' : 'text-slate-400 font-extrabold'} mt-0.5 uppercase tracking-wider whitespace-nowrap`}>
            {replaceBankKeysWithAliases(subLabel, initData)}
          </span>
        </div>
      );
    };

    const arrowIcon = (
      <span className="text-slate-600 font-extrabold text-[10px] md:text-xs mx-0.5 select-none animate-pulse">
        ➔
      </span>
    );

    const findOtherContractor = () => {
      if (!initData || !initData.names) return null;
      let textToSearch = "";
      for (const item of g.items) {
        const parsed = parseTransactionText(item.fullText || item.text);
        textToSearch += " " + (item.fullText || "") + " " + (item.text || "") + " " + (parsed.comment || "") + " " + (parsed.cleanDescription || "");
      }
      textToSearch = textToSearch.toLowerCase();

      const sortedNames = [...initData.names].sort((a, b) => b.length - a.length);
      const excludeNames = contractors.map(c => c.toLowerCase());

      for (const name of sortedNames) {
        if (excludeNames.includes(name.toLowerCase())) continue;
        
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:👤\\s*)?(${escapedName})`, 'gi');
        
        let match;
        let matched = false;
        while ((match = regex.exec(textToSearch)) !== null) {
          const index = match.index;
          const actualNameMatch = match[1];
          const nameStart = index + match[0].indexOf(actualNameMatch);
          const nameEnd = nameStart + actualNameMatch.length;

          const charBefore = nameStart > 0 ? textToSearch[nameStart - 1] : "";
          const charAfter = nameEnd < textToSearch.length ? textToSearch[nameEnd] : "";

          const isLetter = (ch: string) => /[a-zA-Z0-9а-яА-ЯёЁіІїЇєЄґҐ]/.test(ch);

          if (!isLetter(charBefore) && !isLetter(charAfter)) {
            matched = true;
            break;
          }
        }
        if (matched) {
          return name;
        }
      }
      return null;
    };

    // Helper to dynamically extract the flow's real bank/account/cash name
    const getFlowBankName = () => {
      const nonDebtBank = g.items.map(item => item.bank.trim()).find(b => b && b !== "Реєстр боргів");
      if (nonDebtBank) return nonDebtBank;

      for (const item of g.items) {
        const text = (item.fullText || item.text || "").toLowerCase();
        if (text.includes("готівк") || text.includes("кеш") || text.includes("cash") || text.includes("руки") || text.includes("руках")) {
          return "Готівка";
        }
        if (text.includes("моно") || text.includes("mono")) return "Монобанк";
        if (text.includes("приват") || text.includes("p24") || text.includes("pb")) return "ПриватБанк";
        if (text.includes("payoneer")) return "Payoneer";
        if (text.includes("wise")) return "Wise";
      }

      const firstBank = g.items[0]?.bank?.trim() || "";
      if (!firstBank || firstBank === "Реєстр боргів") {
        return "Готівка";
      }
      return firstBank;
    };

    const displayBankName = getFlowBankName();

    // Check if any sub-item has a mutual settlement ("Взаємозалік") in its text
    let mutualSettlementFlow: React.ReactNode = null;
    for (const item of g.items) {
      const parsed = parseTransactionText(item.fullText || item.text);
      const comment = parsed.comment || "";
      const mc = (parsed.contractor || "").trim() || "Ми";
      
      let testText = comment;
      testText = testText.replace(
        /➔\s*взаємозаліком\s*зараховано\s*контрагенту\s*👤?\s*([^\n|👤➔]+)/gi,
        (match, name) => `➔ Контрагент: ${mc} ➔ 👤 ${name.trim()}`
      );
      testText = testText.replace(
        /➔\s*за\s*нас\s*повернув\s*контрагент\s*👤?\s*([^\n|👤➔]+)/gi,
        (match, name) => `➔ Контрагент: ${name.trim()} ➔ 👤 ${mc}`
      );
      testText = testText.replace(
        /➔\s*зараховано\s*контрагенту\s*👤?\s*([^\n|👤➔]+)/gi,
        (match, name) => `➔ Контрагент: ${mc} ➔ 👤 ${name.trim()}`
      );

      let match = testText.match(/➔\s*(?:Взаємозалік|Контрагент):\s*([^\n➔]+)\s*➔\s*👤?\s*([^\n👤]+)/i);
      
      if (!match && parsed.cardDetails) {
        const cdLines = parsed.cardDetails.split("\n");
        for (const line of cdLines) {
          const m = line.match(/(?:Взаємозалік|Контрагент):\s*([^\n➔]+)\s*➔\s*👤?\s*([^\n👤➔\n|]+)/i);
          if (m) {
            match = m as any;
            break;
          }
        }
      }

      if (match) {
        const fromName = match[1].trim();
        const toName = match[2].trim();
        
        const isFromValid = initData?.names?.some(n => n.toLowerCase() === fromName.toLowerCase()) || fromName === "Ми";
        const isToValid = initData?.names?.some(n => n.toLowerCase() === toName.toLowerCase()) || toName === "Ми";
        
        if (isFromValid || isToValid) {
          mutualSettlementFlow = (
            <div className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 py-0.5 min-w-0">
              {renderContractorButton(fromName)}
              {arrowIcon}
              {renderFlowArrowBox(amountFormatted, "Контрагент", "text-sky-300")}
              {arrowIcon}
              {renderContractorButton(toName)}
            </div>
          );
          break;
        }
      }
    }

    if (mutualSettlementFlow) {
      return mutualSettlementFlow;
    }

    // Otherwise, render standard operations flows
    if (g.operation.includes("Повернули борг")) {
      const contractorName = contractors[0] || "Контрагент";
      const otherContr = findOtherContractor();

      if (otherContr) {
        return (
          <div className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 py-0.5 min-w-0">
            {renderContractorButton(contractorName)}
            {arrowIcon}
            {renderFlowArrowBox("+" + amountFormatted, displayBankName, "text-sky-300")}
            {arrowIcon}
            {renderContractorButton(otherContr)}
          </div>
        );
      }

      return (
        <div className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 py-0.5 min-w-0">
          {renderContractorButton(contractorName)}
          {arrowIcon}
          {renderFlowArrowBox("+" + amountFormatted, displayBankName, "text-emerald-400")}
          {arrowIcon}
          {renderContractorButton("Ми")}
        </div>
      );
    }

    if (g.operation.includes("Повертаю борг")) {
      const contractorName = contractors[0] || "Контрагент";
      const otherContr = findOtherContractor();

      if (otherContr) {
        return (
          <div className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 py-0.5 min-w-0">
            {renderContractorButton(otherContr)}
            {arrowIcon}
            {renderFlowArrowBox("-" + amountFormatted, displayBankName, "text-sky-300")}
            {arrowIcon}
            {renderContractorButton(contractorName)}
          </div>
        );
      }

      return (
        <div className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 py-0.5 min-w-0">
          {renderContractorButton("Ми")}
          {arrowIcon}
          {renderFlowArrowBox("-" + amountFormatted, displayBankName, "text-red-400")}
          {arrowIcon}
          {renderContractorButton(contractorName)}
        </div>
      );
    }

    if (isExc) {
      const bank1 = banks[0] || "Рахунок 1";
      const bank2 = banks[1] || "Рахунок 2";
      return (
        <div className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 py-0.5 min-w-0">
          {renderBankBadge(bank1)}
          {arrowIcon}
          {renderFlowArrowBox(amountFormatted, "🔄 Обмін", "text-sky-400")}
          {arrowIcon}
          {renderBankBadge(bank2)}
        </div>
      );
    }

    // Default incomes and expenses with contractors
    if (g.isIncome) {
      if (contractors.length > 0) {
        if (displayFlows.length > 1) {
          return (
            <div className="flex flex-col gap-1.5 py-0.5 min-w-0">
              {displayFlows.map((flow, i) => {
                let fromName = contractors[0];
                let toName = "Ми";
                let displayBName = replaceBankKeysWithAliases(flow.accountLabel, initData);
                let colorClass = "text-emerald-400";

                if (flow.isDebt) {
                  displayBName = "Борг ⏳";
                  colorClass = "text-indigo-400";
                } else if (flow.isContractorSplit && flow.contractorFrom && flow.contractorTo) {
                  fromName = flow.contractorFrom;
                  toName = flow.contractorTo;
                  displayBName = replaceBankKeysWithAliases(flow.accountLabel, initData);
                }

                const cleanAmtText = flow.amountText.startsWith("+") ? flow.amountText : "+" + flow.amountText;

                return (
                  <div key={i} className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 min-w-0">
                    {renderContractorButton(fromName)}
                    {arrowIcon}
                    {renderFlowArrowBox(cleanAmtText, displayBName, colorClass)}
                    {arrowIcon}
                    {renderContractorButton(toName)}
                  </div>
                );
              })}
            </div>
          );
        }
        return (
          <div className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 py-0.5 min-w-0">
            {renderContractorButton(contractors[0])}
            {arrowIcon}
            {renderFlowArrowBox("+" + amountFormatted, displayBankName, "text-emerald-400")}
            {arrowIcon}
            {renderContractorButton("Ми")}
          </div>
        );
      } else {
        if (displayFlows.length > 1) {
          return (
            <div className="flex flex-col gap-1.5 py-0.5 min-w-0">
              {displayFlows.map((flow, i) => {
                let fromNode = renderCategoryBadge(getGroupCategory(g), true);
                let toName = "Ми";
                let displayBName = replaceBankKeysWithAliases(flow.accountLabel, initData);
                let colorClass = "text-emerald-400";

                if (flow.isDebt) {
                  displayBName = "Борг ⏳";
                  colorClass = "text-indigo-400";
                } else if (flow.isContractorSplit && flow.contractorFrom && flow.contractorTo) {
                  fromNode = renderContractorButton(flow.contractorFrom);
                  toName = flow.contractorTo;
                  displayBName = replaceBankKeysWithAliases(flow.accountLabel, initData);
                }

                const cleanAmtText = flow.amountText.startsWith("+") ? flow.amountText : "+" + flow.amountText;

                return (
                  <div key={i} className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 min-w-0">
                    {flow.isContractorSplit && flow.contractorFrom && flow.contractorTo ? fromNode : renderCategoryBadge(getGroupCategory(g), true)}
                    {arrowIcon}
                    {renderFlowArrowBox(cleanAmtText, displayBName, colorClass)}
                    {arrowIcon}
                    {renderContractorButton(toName)}
                  </div>
                );
              })}
            </div>
          );
        }
        return (
          <div className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 py-0.5 min-w-0">
            {renderCategoryBadge(getGroupCategory(g), true)}
            {arrowIcon}
            {renderFlowArrowBox("+" + amountFormatted, displayBankName, "text-emerald-400")}
            {arrowIcon}
            {renderContractorButton("Ми")}
          </div>
        );
      }
    } else {
      if (contractors.length > 0) {
        if (displayFlows.length > 1) {
          return (
            <div className="flex flex-col gap-1.5 py-0.5 min-w-0">
              {displayFlows.map((flow, i) => {
                let fromName = "Ми";
                let toName = contractors[0];
                let displayBName = replaceBankKeysWithAliases(flow.accountLabel, initData);
                let colorClass = "text-red-400";

                if (flow.isDebt) {
                  displayBName = "Борг ⏳";
                  colorClass = "text-indigo-400";
                } else if (flow.isContractorSplit && flow.contractorFrom && flow.contractorTo) {
                  fromName = flow.contractorFrom;
                  toName = flow.contractorTo;
                  displayBName = replaceBankKeysWithAliases(flow.accountLabel, initData);
                }

                const cleanAmtText = flow.amountText.startsWith("-") ? flow.amountText : "-" + flow.amountText;

                return (
                  <div key={i} className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 min-w-0">
                    {renderContractorButton(fromName)}
                    {arrowIcon}
                    {renderFlowArrowBox(cleanAmtText, displayBName, colorClass)}
                    {arrowIcon}
                    {renderContractorButton(toName)}
                  </div>
                );
              })}
            </div>
          );
        }
        return (
          <div className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 py-0.5 min-w-0">
            {renderContractorButton("Ми")}
            {arrowIcon}
            {renderFlowArrowBox("-" + amountFormatted, displayBankName, "text-red-400")}
            {arrowIcon}
            {renderContractorButton(contractors[0])}
          </div>
        );
      } else {
        if (displayFlows.length > 1) {
          return (
            <div className="flex flex-col gap-1.5 py-0.5 min-w-0">
              {displayFlows.map((flow, i) => {
                let fromName = "Ми";
                let toNode = renderCategoryBadge(getGroupCategory(g), false);
                let displayBName = replaceBankKeysWithAliases(flow.accountLabel, initData);
                let colorClass = "text-red-400";

                if (flow.isDebt) {
                  displayBName = "Борг ⏳";
                  colorClass = "text-indigo-400";
                } else if (flow.isContractorSplit && flow.contractorFrom && flow.contractorTo) {
                  fromName = flow.contractorFrom;
                  toNode = renderContractorButton(flow.contractorTo);
                  displayBName = replaceBankKeysWithAliases(flow.accountLabel, initData);
                }

                const cleanAmtText = flow.amountText.startsWith("-") ? flow.amountText : "-" + flow.amountText;

                return (
                  <div key={i} className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 min-w-0">
                    {renderContractorButton(fromName)}
                    {arrowIcon}
                    {renderFlowArrowBox(cleanAmtText, displayBName, colorClass)}
                    {arrowIcon}
                    {flow.isContractorSplit && flow.contractorFrom && flow.contractorTo ? toNode : renderCategoryBadge(getGroupCategory(g), false)}
                  </div>
                );
              })}
            </div>
          );
        }
        return (
          <div className="flex flex-wrap items-center justify-start gap-1 md:gap-1.5 py-0.5 min-w-0">
            {renderContractorButton("Ми")}
            {arrowIcon}
            {renderFlowArrowBox("-" + amountFormatted, displayBankName, "text-red-400")}
            {arrowIcon}
            {renderCategoryBadge(getGroupCategory(g), false)}
          </div>
        );
      }
    }
  };

  const renderGroupCard = (g: HistoryGroup, key: string | number) => {
    const isExc = g.operation === "Обмін";
    const sumColor = isExc 
      ? "text-blue-400" 
      : g.isIncome 
        ? "text-emerald-400" 
        : "text-red-400";
    
    const sumSign = isExc 
      ? "🔄" 
      : g.isIncome 
        ? "+" 
        : "-";

    const effectiveItems = getGroupEffectiveItems(g);

    const summary = getGroupReadableSummary({ ...g, items: effectiveItems });

    // Find if any item in this group has a receipt attachment link
    let receiptUrl = "";
    for (const item of effectiveItems) {
      const parsed = parseTransactionText(item.fullText || item.text);
      if (parsed.receiptUrl) {
        receiptUrl = parsed.receiptUrl;
        break;
      }
    }

    const isExpanded = !!expandedGroups[g.dateStr];

    const mainItem = effectiveItems[0];
    const parsedMain = mainItem ? parseTransactionText(mainItem.fullText || mainItem.text) : null;
    let comment = parsedMain?.comment || "";
    if (!comment) {
      for (const item of effectiveItems) {
        const p = parseTransactionText(item.fullText || item.text);
        if (p.comment) {
          comment = p.comment;
          break;
        }
      }
    }
    const catMatch = comment ? comment.match(/^\[(.*?)\]\s*([\s\S]*)/) : null;
    const commentOnly = catMatch ? catMatch[2] : comment;

    // Extract unique contractor names for this group
    const groupContractors = Array.from(new Set(effectiveItems.map(item => {
      const parsed = parseTransactionText(item.fullText || item.text);
      return parsed.contractor?.trim();
    }).filter(Boolean))) as string[];

    return (
      <div
        key={key}
        className={`rounded-2xl flex flex-col overflow-hidden transition-all shadow-xl shadow-black/70 border-t border-r border-b ring-1 ring-white/10 ${
          isExc
            ? "bg-[#181f33] border-l-[7px] border-l-blue-400 border-slate-600 hover:border-blue-400 hover:bg-[#1d263f] hover:ring-blue-400/30"
            : g.operation?.includes("знижк") || g.operation?.includes("борг")
              ? "bg-[#1f2230] border-l-[7px] border-l-amber-400 border-slate-600 hover:border-amber-400 hover:bg-[#262a3a] hover:ring-amber-400/30"
              : g.isIncome
                ? "bg-[#15231e] border-l-[7px] border-l-emerald-400 border-slate-600 hover:border-emerald-400 hover:bg-[#1b2d27] hover:ring-emerald-400/30"
                : "bg-[#211a1d] border-l-[7px] border-l-rose-500 border-slate-600 hover:border-rose-400 hover:bg-[#2b2125] hover:ring-rose-400/30"
        }`}
      >
        {/* Header card row: Date, operation name, sum */}
        <div
          onClick={() => toggleGroupExpand(g.dateStr)}
          className={`p-2.5 sm:p-3.5 bg-slate-900/60 flex justify-between items-center gap-2.5 cursor-pointer select-none transition-all hover:bg-slate-900/90 ${
            isExpanded ? "border-b border-slate-700/80" : ""
          }`}
        >
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span 
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950/80 border border-slate-700/80 text-slate-300 text-[10.5px] sm:text-[11px] font-mono font-bold shrink-0 tracking-tight shadow-sm"
                title={g.dateStr}
              >
                <Clock className="w-3 h-3 text-sky-400 shrink-0" />
                <span>{formatCompactDateTime(g.dateStr)}</span>
              </span>
              {g.operation && (effectiveItems.length === 1 || isExpanded) && (
                <span className={`px-2.5 py-0.5 rounded-md flex items-center gap-1 font-black border break-words ${
                  isExc 
                    ? "bg-blue-500/20 text-blue-300 border-blue-400/40 text-[9px]" 
                    : g.operation.includes("знижк")
                      ? "bg-amber-500/25 text-amber-200 border-amber-400/50 text-[10px] shadow-sm tracking-wide uppercase"
                    : g.isIncome 
                      ? "bg-emerald-500/25 text-emerald-200 border-emerald-400/50 text-[11px] shadow-sm tracking-wide uppercase" 
                      : "bg-rose-500/20 text-rose-300 border-rose-400/40 text-[9px]"
                }`}>
                  {isExc && <RefreshCw className="w-2.5 h-2.5 animate-spin-slow" />}
                  {g.operation.includes("знижк") && <span>📉</span>}
                  {g.operation}
                </span>
              )}
            </div>
            {!isExpanded && (
              <div className="flex flex-col gap-1 mt-0.5">
                {(groupContractors.length > 0 || commentOnly) && (
                  <div className="flex flex-col gap-1.5">
                    {groupContractors.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {groupContractors.map((c, cIdx) => (
                          <span 
                            key={cIdx} 
                            className="text-[10px] font-extrabold text-sky-300 bg-sky-950/80 border border-sky-600/50 px-2.5 py-0.5 rounded-md flex items-center gap-1 shadow-sm uppercase tracking-wider"
                          >
                            <span className="opacity-90">👤</span>
                            <span>{c}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    {commentOnly && (
                      <div
                        onClick={(e) => toggleCommentExpand(g.dateStr, e)}
                        className="w-full rounded-lg transition-all cursor-pointer select-text overflow-hidden"
                      >
                        {!expandedComments[g.dateStr] ? (
                          <div 
                            className="w-full text-[11px] text-amber-200/90 hover:text-amber-100 font-medium italic bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 px-2.5 py-1 rounded-lg flex items-center justify-between gap-2 shadow-sm transition-all group/cmt"
                            title="Натисніть, щоб розгорнути повний коментар"
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1 truncate">
                              <MessageSquare className="w-3 h-3 text-amber-400 shrink-0" />
                              <span className="truncate select-none">{commentOnly}</span>
                            </div>
                            <span className="text-[10px] text-amber-400 font-bold shrink-0 flex items-center gap-0.5 opacity-80 group-hover/cmt:opacity-100 transition-opacity">
                              <span>Розгорнути</span>
                              <ChevronDown className="w-3 h-3" />
                            </span>
                          </div>
                        ) : (
                          <div 
                            className="w-full text-xs text-amber-200/95 font-medium italic bg-amber-500/15 border border-amber-500/35 px-3 py-2 rounded-lg flex flex-col gap-1.5 shadow-sm leading-relaxed transition-all group/cmt"
                            title="Натисніть, щоб згорнути коментар"
                          >
                            <div className="flex items-center justify-between gap-2 pb-1 border-b border-amber-500/20 text-amber-300 text-[10px] font-bold select-none">
                              <span className="flex items-center gap-1">
                                <MessageSquare className="w-3 h-3 text-amber-400" />
                                <span>Коментар</span>
                              </span>
                              <span className="flex items-center gap-0.5 text-amber-400 hover:text-amber-200">
                                <span>Згорнути</span>
                                <ChevronUp className="w-3 h-3" />
                              </span>
                            </div>
                            <div className="break-words whitespace-pre-wrap select-text leading-relaxed">
                              {commentOnly}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(() => {
                  if (effectiveItems.length <= 1) return null;

                  return (
                    <div className="flex flex-col gap-1 mt-0.5 w-full">
                      {effectiveItems.map((item, itIdx) => {
                        let opName = item.operation || "Складова";
                        let badgeColor = "bg-slate-800/80 text-slate-300 border-slate-700/80";
                        
                        if (opName.includes("Введені початкові залишки") || opName.includes("Початковий борг")) {
                          badgeColor = item.sum >= 0 ? "bg-amber-500/15 text-amber-300 border-amber-500/30" : "bg-orange-500/15 text-orange-300 border-orange-500/30";
                        } else if (opName.includes("Коригування")) {
                          badgeColor = item.sum >= 0 ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" : "bg-violet-500/15 text-violet-300 border-violet-500/30";
                        } else if (opName.includes("Прибуток")) {
                          badgeColor = "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
                        } else if (opName.includes("Повернули борг")) {
                          badgeColor = "bg-sky-500/15 text-sky-300 border-sky-500/30";
                        } else if (opName.includes("Повертаю борг")) {
                          badgeColor = "bg-amber-500/15 text-amber-300 border-amber-500/30";
                        } else if (opName.includes("Покупка зі знижкою в борг комусь")) {
                          badgeColor = "bg-violet-500/15 text-violet-300 border-violet-500/30";
                        } else if (opName.includes("Покупка зі знижкою в борг")) {
                          badgeColor = "bg-rose-500/15 text-rose-300 border-rose-500/30";
                        } else if (opName.includes("Покупка") || opName.includes("Витрата")) {
                          badgeColor = "bg-rose-500/15 text-rose-300 border-rose-500/30";
                        }

                        const itemCur = resolveItemCurrency(item.curr, g.curr, item.text, item.fullText, item.sum);
                        const currSym = itemCur === "USD" ? "$" : itemCur === "EUR" ? "€" : "₴";
                        const sign = item.sum > 0 ? "+" : "";

                        return (
                          <div key={itIdx} className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md border ${badgeColor} flex items-center justify-between gap-2 shadow-sm w-full`}>
                            <span className="break-words font-extrabold">{opName}</span>
                            <span className="font-mono font-black shrink-0 whitespace-nowrap text-xs">{sign}{item.sum.toFixed(2)} {currSym}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {(() => {
              if (effectiveItems.length === 1) {
                const breakdown = getFulfillmentBreakdown(effectiveItems, currentCurrency);
                if (breakdown.isFulfillment) {
                  const getSymbol = (c: string) => {
                    if (c === "USD" || c === "$") return "$";
                    if (c === "EUR" || c === "€") return "€";
                    if (c === "UAH" || c === "₴") return "₴";
                    return c || "";
                  };
                  const sym = getSymbol(breakdown.currency);
                  const sign1 = g.isIncome ? "+" : "-";
                  const sign2 = g.isIncome ? "+" : "-";
                  return (
                    <span className="text-xs sm:text-sm font-black font-mono text-emerald-400 whitespace-nowrap tracking-tight">
                      {sign1}{breakdown.principalSum.toFixed(2)}{sym} {sign2} {breakdown.interestSum.toFixed(2)}{sym} %
                    </span>
                  );
                }
              }

              if (isExc) {
                const outItem = effectiveItems.find(it => (it.sum < -0.001) || (it.text && it.text.includes("Віддано")));
                const inItem = effectiveItems.find(it => (it.sum > 0.001) || (it.text && it.text.includes("Отримано")));
                if (outItem && inItem) {
                  const outCur = resolveItemCurrency(outItem.curr, g.curr, outItem.text, outItem.fullText, outItem.sum);
                  const inCur = resolveItemCurrency(inItem.curr, g.curr, inItem.text, inItem.fullText, inItem.sum);
                  const outSym = outCur === "USD" ? "$" : outCur === "EUR" ? "€" : "₴";
                  const inSym = inCur === "USD" ? "$" : inCur === "EUR" ? "€" : "₴";
                  const outAmt = Math.abs(outItem.sum);
                  const inAmt = Math.abs(inItem.sum);
                  return (
                    <span className="text-xs sm:text-sm font-black font-mono tracking-tight text-blue-400 whitespace-nowrap">
                      {outAmt.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} {outSym} ➔ {inAmt.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} {inSym}
                    </span>
                  );
                }
              }

              const primaryItem = effectiveItems[0];
              const itemCur = resolveItemCurrency(primaryItem?.curr, g.curr, primaryItem?.text, primaryItem?.fullText, Math.abs(primaryItem?.sum || g.totalSum));
              const currSym = itemCur === "USD" ? "$" : itemCur === "EUR" ? "€" : "₴";
              
              if (effectiveItems.length > 1 && !isExc) {
                const allCurrs = effectiveItems.map(it => resolveItemCurrency(it.curr, g.curr, it.text, it.fullText, it.sum));
                const allSameCur = allCurrs.every(c => c === allCurrs[0]);
                if (allSameCur) {
                  const displaySum = effectiveItems.reduce((acc, it) => acc + (Math.abs(Number(it.sum)) || 0), 0);
                  return (
                    <span className={`text-sm sm:text-base font-black font-mono tracking-tight ${sumColor}`}>
                      {sumSign} {Math.abs(displaySum).toFixed(2)} {currSym}
                    </span>
                  );
                } else {
                  // Split across multiple currencies: calculate and display each currency separately
                  const curSums: Record<string, number> = {};
                  effectiveItems.forEach(it => {
                    const c = resolveItemCurrency(it.curr, g.curr, it.text, it.fullText, it.sum);
                    const s = Math.abs(Number(it.sum) || 0);
                    if (s > 0.001) curSums[c] = (curSums[c] || 0) + s;
                  });

                  return (
                    <div className="flex flex-wrap items-center justify-end gap-1 font-mono text-xs sm:text-sm font-black">
                      {Object.entries(curSums).map(([c, val], cIdx) => {
                        const s = c === "USD" ? "$" : c === "EUR" ? "€" : "₴";
                        return (
                          <span key={c} className={`whitespace-nowrap ${sumColor}`}>
                            {cIdx > 0 && <span className="text-slate-500 font-sans mx-0.5">•</span>}
                            {sumSign}{val.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s}
                          </span>
                        );
                      })}
                    </div>
                  );
                }
              }

              const displaySum = (g.totalSum !== undefined && g.totalSum !== null && !isNaN(g.totalSum) && Math.abs(g.totalSum) > 0.001)
                ? g.totalSum
                : (effectiveItems[0]?.sum || 0);

              return (
                <span className={`text-sm sm:text-base font-black font-mono tracking-tight ${sumColor}`}>
                  {sumSign} {Math.abs(displaySum).toFixed(2)} {currSym}
                </span>
              );
            })()}
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </div>
        </div>

        {isExpanded && (
          <>
            {/* Body row: Arrow Flow and Details */}
            <div className="p-2.5 sm:p-3 flex flex-col gap-2">
              {/* Visual Arrow Flow */}
              {(() => {
                const mainItem = effectiveItems[0];
                const parsedMain = mainItem ? parseTransactionText(mainItem.fullText || mainItem.text) : null;
                const hasSplits = !!parsedMain?.cardDetails;
                if (hasSplits) return null;
                return (
                  <div className="min-w-0">
                    {renderSummaryFlow({ ...g, items: effectiveItems })}
                  </div>
                );
              })()}

              {/* Category and Comment Details */}
              {(() => {
                const mainItem = effectiveItems[0];
                const parsedMain = mainItem ? parseTransactionText(mainItem.fullText || mainItem.text) : null;

                const category = getGroupCategory(g);
                let comment = parsedMain?.comment || "";
                if (!comment) {
                  for (const item of effectiveItems) {
                    const p = parseTransactionText(item.fullText || item.text);
                    if (p.comment) {
                      comment = p.comment;
                      break;
                    }
                  }
                }
                const catMatch = comment ? comment.match(/^\[(.*?)\]\s*([\s\S]*)/) : null;
                const expCommentOnly = catMatch ? catMatch[2] : comment;

                if (!category && !expCommentOnly) return null;

                return (
                  <div className="flex flex-col gap-1 text-[11px] bg-slate-900/80 p-2 sm:p-2.5 rounded-xl border border-slate-800/80 shadow-inner">
                    {category && (
                      <div className="flex items-center justify-between text-slate-400 font-bold">
                        <span className="flex items-center gap-1.5 text-slate-300">
                          <Tag className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                          <span className="text-slate-400">Категорія:</span>
                          <span className="text-sky-300 font-extrabold">{category}</span>
                        </span>
                      </div>
                    )}

                    {expCommentOnly && (
                      <div className="flex items-start gap-2 text-slate-300 mt-1.5 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 shadow-inner">
                        <span className="text-amber-400 shrink-0 mt-0.5 text-xs">💬</span>
                        <div className="flex-1 font-medium text-amber-200/95 leading-relaxed break-words whitespace-pre-wrap select-text text-xs">
                          {expCommentOnly}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Split Items List inside Expanded Card */}
              {effectiveItems.length > 0 && (
                <div className="flex flex-col gap-2 mt-1">
                  <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1 flex items-center justify-between">
                    <span>Деталізація складу операції ({effectiveItems.length}):</span>
                    {effectiveItems.length > 1 && (
                      <span className="text-slate-500 font-mono text-[9px]">Мульти-операція</span>
                    )}
                  </div>

                  {effectiveItems.map((item, idx) => {
                    const parsed = parseTransactionText(item.fullText || item.text);
                    const isDebt = item.bank?.includes("Борг") || item.text?.includes("в борг") || item.operation?.includes("борг");
                    const isContractorSplit = item.text?.includes("зараховано контрагенту") || item.text?.includes("повернув контрагент");

                    let itemSplitsLines: string[] = [];
                    if (parsed?.cardDetails) {
                      itemSplitsLines = parsed.cardDetails.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                    } else {
                      const allGroupLines: string[] = [];
                      g.items.forEach(it => {
                        const p = parseTransactionText(it.fullText || it.text);
                        if (p?.cardDetails) {
                          p.cardDetails.split(/\r?\n/).forEach(s => {
                            const tr = s.trim();
                            if (tr && !allGroupLines.includes(tr)) allGroupLines.push(tr);
                          });
                        }
                      });

                      if (g.items.length === 1) {
                        itemSplitsLines = allGroupLines;
                      } else {
                        let itemDisplaySum = item.sum;
                        const rawText = item.fullText || item.text || commentOnly || "";
                        const op = item.operation || "";
                        if (op.includes("Повернули борг") || op.includes("Повертаю борг")) {
                          const mBodyVal = rawText.match(/повернення тіла\s*\(\s*([\d.,]+)/i) || rawText.match(/повернення тіла:\s*([\d.,]+)/i);
                          if (mBodyVal) {
                            const parsedBodyVal = parseFloat(mBodyVal[1].replace(",", "."));
                            if (parsedBodyVal > 0) itemDisplaySum = parsedBodyVal;
                          }
                        } else if (op.includes("Прибуток") || op.includes("Покупка")) {
                          const mIntVal = rawText.match(/відсотків\s*\(\s*([\d.,]+)/i) || rawText.match(/відсотки\s*\(\s*([\d.,]+)/i);
                          if (mIntVal) {
                            const parsedIntVal = parseFloat(mIntVal[1].replace(",", "."));
                            if (parsedIntVal > 0) itemDisplaySum = parsedIntVal;
                          }
                        }

                        itemSplitsLines = allGroupLines.filter(line => {
                          const arrowIdx = line.indexOf("➔");
                          const leftPart = arrowIdx !== -1 ? line.substring(0, arrowIdx) : line;
                          const lineSum = parseFloat(leftPart) || 0;
                          return Math.abs(lineSum - itemDisplaySum) < 0.5 || Math.abs(lineSum - item.sum) < 0.5 || (item.fullText || item.text || "").includes(line);
                        });
                      }
                    }

                    const itemContr = parsed.contractor?.trim();

                    return (
                      <div key={idx} className="bg-slate-900/90 rounded-xl p-2.5 border border-slate-800 flex flex-col gap-1.5 shadow-md">
                        <div className="flex items-center justify-between text-xs font-bold gap-2">
                          <span className="text-slate-200 font-extrabold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                            {item.operation || g.operation}
                          </span>
                          <span className={`font-mono font-black ${item.sum >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {(() => {
                              const itemCur = resolveItemCurrency(item.curr, g.curr, item.text, item.fullText, item.sum);
                              const currSym = itemCur === "USD" ? "$" : itemCur === "EUR" ? "€" : "₴";
                              return `${item.sum >= 0 ? "+" : ""}${item.sum.toFixed(2)} ${currSym}`;
                            })()}
                          </span>
                        </div>

                        {/* Multi-line flow or bank detail */}
                        {itemSplitsLines.length > 0 ? (
                          <div className="flex flex-col gap-1 mt-1 pt-1 border-t border-slate-800/80">
                            {itemSplitsLines.map((sLine, sIdx) => {
                              const arrowIndex = sLine.indexOf("➔");
                              let amountPart = sLine;
                              let actionPart = "";
                              if (arrowIndex !== -1) {
                                amountPart = sLine.substring(0, arrowIndex).trim();
                                actionPart = sLine.substring(arrowIndex + 1).trim();
                              }

                              let contractorFrom = "";
                              let contractorTo = "";
                              let accountLabel = actionPart;

                              if (isContractorSplit) {
                                const fullMatch = sLine.match(/(?:Взаємозалік|Контрагент):\s*([^\n➔]+)\s*➔\s*👤?\s*([^\n👤➔\n|]+)/i);
                                const partMatch = amountPart.match(/(?:Взаємозалік|Контрагент):\s*([^\n➔]+)/i) || amountPart.match(/(?:Взаємозалік|Контрагент)\s*\(?([^\n➔\d()]+)\)?/i);

                                if (fullMatch) {
                                  contractorFrom = fullMatch[1].replace(/👤/g, "").trim();
                                  contractorTo = fullMatch[2].replace(/👤/g, "").trim();
                                } else if (partMatch) {
                                  contractorFrom = partMatch[1].replace(/👤/g, "").trim();
                                  contractorTo = actionPart.replace(/👤/g, "").trim();
                                } else {
                                  const cleanedFrom = amountPart
                                    .replace(/^(?:[+-]?[\d.\s]+(?:UAH|USD|EUR)?)?\s*(?:Взаємозалік:|Контрагент:|Взаємозалік|Контрагент)\s*/gi, "")
                                    .replace(/👤/g, "")
                                    .trim();
                                  contractorFrom = cleanedFrom || "Контрагент";
                                  contractorTo = actionPart.replace(/👤/g, "").trim();
                                }
                                accountLabel = "Контрагент";
                              } else {
                                accountLabel = actionPart
                                  .replace(/^(?:списано з|отримано на|списано|отримано)\s+/i, "")
                                  .trim();
                              }

                              const arrowElem = <span className="text-slate-600 font-extrabold text-[10px] mx-0.5 select-none">➔</span>;
                              
                              let displayBName = replaceBankKeysWithAliases(accountLabel, initData);
                              let colorClass = g.isIncome ? "text-emerald-400" : "text-red-400";
                              if (isDebt) {
                                displayBName = "Борг ⏳";
                                colorClass = "text-indigo-400";
                              }

                              let fromNode = renderContractorButton("Ми", false);
                              let toNode = renderContractorButton("Ми", false);

                              if (isContractorSplit && contractorFrom && contractorTo) {
                                fromNode = renderContractorButton(contractorFrom, false);
                                toNode = renderContractorButton(contractorTo, false);
                              } else if (g.isIncome) {
                                fromNode = renderContractorButton(itemContr || groupContractors[0] || "—", false);
                              } else {
                                toNode = renderContractorButton(itemContr || groupContractors[0] || "—", false);
                              }

                              return (
                                <div key={sIdx} className="text-[11px] font-bold text-slate-300 flex items-center gap-1 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800/80">
                                  {fromNode}
                                  {arrowElem}
                                  <span className={`px-2 py-0.5 rounded border border-slate-700/80 font-mono font-black ${colorClass} bg-slate-900`}>
                                    {amountPart} ({displayBName})
                                  </span>
                                  {arrowElem}
                                  {toNode}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/50">
                            <span>Рахунок: <span className="text-slate-200 font-bold">{replaceBankKeysWithAliases(item.bank || "—", initData)}</span></span>
                            {itemContr && (
                              <span className="text-sky-300 font-bold bg-sky-950/60 border border-sky-600/40 px-2 py-0.5 rounded">👤 {itemContr}</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Action Buttons: Attach Receipt & Edit / Delete */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 mt-1">
                {/* Left: Receipt Attachment Actions */}
                <div className="flex items-center gap-1.5">
                  {receiptUrl ? (
                    <div className="flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">
                      {getDirectImageUrl(receiptUrl) ? (
                        <img
                          src={getDirectImageUrl(receiptUrl)!}
                          alt="Чек"
                          referrerPolicy="no-referrer"
                          onClick={() => setLightboxImage(getDirectImageUrl(receiptUrl))}
                          className="w-5 h-5 object-cover rounded cursor-pointer border border-emerald-500/30 hover:opacity-85"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setLightboxImage(receiptUrl)}
                          className="text-[10px] font-extrabold text-emerald-400 flex items-center gap-1"
                        >
                          🔎 Чек
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleReceiptDeleteLocal(g.dateStr)}
                        className="p-0.5 hover:bg-red-500/20 text-red-400 rounded transition-all ml-1"
                        title="Видалити чек"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedGroupDate(g.dateStr)}
                      className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:text-sky-300 bg-sky-950/30 hover:bg-sky-950/60 border border-sky-500/10 px-2.5 py-1.5 rounded-lg active:scale-95 transition-all font-bold"
                    >
                      <Paperclip className="w-3 h-3" />
                      Чек
                    </button>
                  )}
                </div>

                {/* Right: Edit & Delete Buttons */}
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => startEditing(g)}
                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg active:scale-95 transition-all flex items-center gap-1 text-[10px] font-bold shadow cursor-pointer"
                  >
                    ✏️ Ред
                  </button>
                  {onDeleteOperation && (
                    <button
                      type="button"
                      onClick={() => { setDeletingTransaction(g); setConfirmFullDelete(false); }}
                      className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900 text-rose-400 hover:text-white border border-rose-900/30 rounded-lg active:scale-95 transition-all flex items-center gap-1 text-[10px] font-bold shadow cursor-pointer"
                      title="Видалити запис"
                    >
                      <Trash2 className="w-3 h-3" />
                      Вид
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 animate-scaleIn pb-10">
      {/* Header Panel */}
      <div className="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800/80">
        <button
          onClick={handleSequentialBack}
          className="p-2.5 bg-slate-950 border border-slate-800 hover:bg-slate-900 rounded-xl transition-all active:scale-95 text-slate-400 hover:text-white flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex flex-col text-right">
          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">
            Огляд та аудит
          </span>
          <span className="text-sm font-black text-white">Історія операцій</span>
        </div>
      </div>

      {/* Control filters & search panel */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Шукати суму, банк, коментар або дату..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl py-2 px-3.5 pl-10 text-xs font-bold text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-all"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                if (onClearSearch) onClearSearch();
              }}
              className="p-1 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white absolute right-3 top-1/2 -translate-y-1/2 transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Toggle buttons for transaction types */}
        <div className="grid grid-cols-5 gap-1 bg-slate-900/60 p-1 rounded-xl border border-slate-900">
          <button
            onClick={() => setFilter("all")}
            className={`py-1.5 text-[10px] font-extrabold rounded-lg transition-all ${
              filter === "all" ? "bg-slate-800 text-white shadow-sm font-black" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Всі
          </button>
          <button
            onClick={() => setFilter("inc")}
            className={`py-1.5 text-[10px] font-extrabold rounded-lg transition-all ${
              filter === "inc" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Доходи
          </button>
          <button
            onClick={() => setFilter("exp")}
            className={`py-1.5 text-[10px] font-extrabold rounded-lg transition-all ${
              filter === "exp" ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 font-black" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Витрати
          </button>
          <button
            onClick={() => setFilter("exc")}
            className={`py-1.5 text-[10px] font-extrabold rounded-lg transition-all ${
              filter === "exc" ? "bg-blue-500/20 text-blue-300 border border-blue-500/40 font-black" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Обмін
          </button>
          <button
            onClick={() => setFilter("debt")}
            className={`py-1.5 text-[10px] font-extrabold rounded-lg transition-all ${
              filter === "debt" ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 font-black" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Борги
          </button>
        </div>

        {/* Currency Switcher Filter */}
        <div className="flex items-center justify-between gap-2 pt-1 text-xs">
          <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
            Валюта:
          </span>
          <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-xl border border-slate-800">
            {[
              { id: "ALL", label: "🌐 Всі" },
              { id: "UAH", label: "🇺🇦 UAH" },
              { id: "USD", label: "🇺🇸 USD" },
              { id: "EUR", label: "🇪🇺 EUR" }
            ].map(c => {
              const active = historyCurrency === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setHistoryCurrency(c.id as any)}
                  className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${
                    active
                      ? "bg-sky-500 text-slate-950 shadow-md font-black"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Dropdowns for Categories, Accounts, and Sorting */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Categories */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[8.5px] font-black uppercase text-slate-500 tracking-wider">Категорія</span>
              <button
                type="button"
                onClick={() => setShowCategoryReportModal(true)}
                className="text-[9px] font-black text-sky-400 hover:text-sky-300 flex items-center gap-0.5 active:scale-95 transition-all cursor-pointer underline"
                title="Відкрити звіт за всіма категоріями"
              >
                📊 Звіт
              </button>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-white focus:outline-none focus:border-sky-500/50"
            >
              <option value="all">Усі статті ({uniqueCategoriesInHistory.length})</option>
              {uniqueCategoriesInHistory.map((cat, idx) => (
                <option key={idx} value={cat}>📁 {cat}</option>
              ))}
            </select>
          </div>

          {/* Accounts / Bank */}
          <div className="flex flex-col gap-1">
            <span className="text-[8.5px] font-black uppercase text-slate-500 tracking-wider">Рахунок / Банк</span>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-white focus:outline-none focus:border-sky-500/50"
            >
              <option value="all">Усі рахунки ({uniqueAccountsInHistory.length})</option>
              {uniqueAccountsInHistory.map((acc, idx) => (
                <option key={idx} value={acc}>💳 {acc}</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className="flex flex-col gap-1">
            <span className="text-[8.5px] font-black uppercase text-slate-500 tracking-wider">Сортування</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-white focus:outline-none focus:border-sky-500/50"
            >
              <option value="date-new">Спочатку нові</option>
              <option value="date-old">Спочатку старі</option>
              <option value="sum-desc">Сума спадання</option>
              <option value="sum-asc">Сума зростання</option>
              <option value="category">За категоріями</option>
            </select>
          </div>
        </div>

        {/* Date Selector & Quick Filters */}
        <div className="flex flex-col gap-2 pt-2 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-[8.5px] font-black uppercase text-slate-400 tracking-wider">
            <span className="flex items-center gap-1"><Calendar className="w-2.5 h-2.5 text-sky-400" /> Період операцій</span>
            {(selectedDate || datePreset !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSelectedDate("");
                  setDatePreset("all");
                }}
                className="text-[9px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 active:scale-95 transition-all"
              >
                <X className="w-2.5 h-2.5" /> Скинути фільтр дати
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "Всі дні" },
              { id: "today", label: "Сьогодні" },
              { id: "yesterday", label: "Вчора" },
              { id: "7days", label: "7 днів" },
              { id: "30days", label: "30 днів" },
              { id: "this_month", label: "Цей місяць" },
            ].map(p => {
              const isSelected = !selectedDate && datePreset === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedDate("");
                    setDatePreset(p.id as any);
                  }}
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-sky-500/20 text-sky-300 border-sky-500/40 font-black shadow-sm"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}

            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setDatePreset("all");
              }}
              className="bg-slate-900 border border-slate-800 rounded-xl px-2 py-1 text-[11px] font-bold text-white focus:outline-none focus:border-sky-500/50 [color-scheme:dark] ml-auto"
              title="Обрати конкретний день"
            />

            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-800 text-[10px] font-bold ml-1">
              <button
                type="button"
                onClick={() => setViewMode("grouped")}
                className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === "grouped" ? "bg-slate-800 text-sky-400 shadow-sm font-black" : "text-slate-500 hover:text-slate-300"
                }`}
                title="Групувати операції за днями"
              >
                За днями
              </button>
              <button
                type="button"
                onClick={() => setViewMode("flat")}
                className={`px-2 py-0.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === "flat" ? "bg-slate-800 text-sky-400 shadow-sm font-black" : "text-slate-500 hover:text-slate-300"
                }`}
                title="Відображати суцільним списком"
              >
                Списком
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction List Feed */}
      <div className="flex flex-col gap-2">
        {loading ? (
          <div className="text-center py-10 font-bold text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-sky-400" /> Завантаження історії...
          </div>
        ) : filteredGroups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-400 font-semibold bg-slate-900/30 rounded-2xl border border-dashed border-slate-800 p-4 text-center">
            <span className="text-sm">
              {selectedCategory !== "all" 
                ? `Записів не знайдено за категорією «${selectedCategory}»` 
                : "Записів не знайдено за поточними фільтрами"}
            </span>
            {selectedCategory !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className="mt-1 text-xs text-sky-400 hover:text-sky-300 font-black underline cursor-pointer"
              >
                Показати всі категорії
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Stats summary of filtered groups */}
            <div className="flex flex-col gap-2 px-1 pb-1">
              {/* Active Filter Badges Bar */}
              {(() => {
                const hasActiveFilters = 
                  search.trim() !== "" || 
                  filter !== "all" || 
                  historyCurrency !== "ALL" || 
                  selectedCategory !== "all" || 
                  selectedAccount !== "all" || 
                  selectedDate !== "" || 
                  datePreset !== "all";

                if (!hasActiveFilters) return null;

                const resetAllFilters = () => {
                  setSearch("");
                  if (onClearSearch) onClearSearch();
                  setFilter("all");
                  setHistoryCurrency("ALL");
                  setSelectedCategory("all");
                  setSelectedAccount("all");
                  setSelectedDate("");
                  setDatePreset("all");
                };

                return (
                  <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-[10.5px]">
                    <span className="text-slate-400 font-bold text-[10px] flex items-center gap-1">
                      <span>Активні фільтри:</span>
                    </span>

                    {search.trim() !== "" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-950/70 border border-sky-500/40 text-sky-300 font-bold">
                        <span>🔍 «{search}»</span>
                        <button type="button" onClick={() => { setSearch(""); if (onClearSearch) onClearSearch(); }} className="hover:text-white ml-0.5 cursor-pointer">×</button>
                      </span>
                    )}

                    {filter !== "all" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 font-bold">
                        <span>Тип: {filter === "inc" ? "Доходи" : filter === "exp" ? "Витрати" : filter === "exc" ? "Обмін" : "Борги"}</span>
                        <button type="button" onClick={() => setFilter("all")} className="hover:text-white ml-0.5 cursor-pointer">×</button>
                      </span>
                    )}

                    {historyCurrency !== "ALL" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-sky-950/80 border border-sky-500/40 text-sky-300 font-bold">
                        <span>💱 {historyCurrency}</span>
                        <button type="button" onClick={() => setHistoryCurrency("ALL")} className="hover:text-white ml-0.5 cursor-pointer">×</button>
                      </span>
                    )}

                    {selectedCategory !== "all" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-950/60 border border-amber-500/40 text-amber-300 font-bold">
                        <span>📁 {selectedCategory}</span>
                        <button type="button" onClick={() => setSelectedCategory("all")} className="hover:text-white ml-0.5 cursor-pointer">×</button>
                      </span>
                    )}

                    {selectedAccount !== "all" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-bold">
                        <span>💳 {selectedAccount}</span>
                        <button type="button" onClick={() => setSelectedAccount("all")} className="hover:text-white ml-0.5 cursor-pointer">×</button>
                      </span>
                    )}

                    {(selectedDate || datePreset !== "all") && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 font-bold">
                        <span>📅 {selectedDate ? selectedDate : datePreset === "today" ? "Сьогодні" : datePreset === "yesterday" ? "Вчора" : datePreset === "7days" ? "7 днів" : datePreset === "30days" ? "30 днів" : "Цей місяць"}</span>
                        <button type="button" onClick={() => { setSelectedDate(""); setDatePreset("all"); }} className="hover:text-white ml-0.5 cursor-pointer">×</button>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="ml-auto text-[10px] font-black text-rose-400 hover:text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                    >
                      Скинути все ✕
                    </button>
                  </div>
                );
              })()}

              <div className="flex flex-wrap items-center justify-between text-[10px] gap-2">
                <span className="text-slate-400 font-bold flex items-center gap-1 flex-wrap">
                  <span>Знайдено: <strong className="text-white font-mono">{filteredGroups.length}</strong> записів</span>
                  {selectedCategory !== "all" && (
                    <span className="ml-1 text-sky-400 font-black bg-sky-950 px-2 py-0.5 rounded border border-sky-500/30">
                      🏷️ {selectedCategory}
                    </span>
                  )}
                  {selectedDate && (
                    <span className="ml-1 text-sky-400 font-bold">
                      за {formatDayHeader(selectedDate).fullDateStr}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCategoryReportModal(true)}
                    className="text-[10px] font-black text-amber-300 hover:text-amber-200 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/30 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-sm"
                  >
                    📊 Звіт по категоріях
                  </button>
                  <button
                    type="button"
                    onClick={toggleExpandAll}
                    className="text-[10px] font-black text-sky-400 hover:text-sky-300 bg-sky-950/35 hover:bg-sky-950/60 border border-sky-500/20 px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 active:scale-95"
                  >
                    {allExpanded ? "Згорнути 🔼" : "Розгорнути 🔽"}
                  </button>
                </div>
              </div>

              {/* Prominent Total Sum Card of Filtered Transactions */}
              {(() => {
                const singleCur = filteredTotals.activeCurrs.length === 1 
                  ? filteredTotals.activeCurrs[0] 
                  : (historyCurrency !== "ALL" ? historyCurrency : "UAH");
                const singleSym = singleCur === "USD" ? "$" : singleCur === "EUR" ? "€" : "₴";

                const cardTitle = 
                  filter === "exc"
                    ? "🔄 Обмін валют:"
                    : filter === "debt"
                      ? "⏳ Підсумок операцій з боргами:"
                      : filter === "inc"
                        ? "🟢 Загальні доходи (відфільтровано):"
                        : filter === "exp"
                          ? "🔴 Загальні витрати (відфільтровано):"
                          : selectedCategory !== "all"
                            ? `📁 Підсумок категорії «${selectedCategory}»:`
                            : "📊 Загальна сума відфільтрованих операцій:";

                const handleCopySummary = () => {
                  const curHeader = historyCurrency === "ALL" ? "Всі валюти" : historyCurrency;
                  const lines = [
                    `📊 Звіт історії операцій (${curHeader}):`,
                    `• Знайдено: ${filteredGroups.length} операцій`,
                    filter !== "all" ? `• Фільтр: ${filter}` : "",
                    selectedCategory !== "all" ? `• Категорія: ${selectedCategory}` : "",
                    selectedAccount !== "all" ? `• Рахунок: ${selectedAccount}` : "",
                    selectedDate ? `• Дата: ${selectedDate}` : datePreset !== "all" ? `• Період: ${datePreset}` : "",
                    `-----------------------------------`,
                    ...filteredTotals.activeCurrs.map(c => {
                      const d = filteredTotals.byCurr[c];
                      const s = c === "USD" ? "$" : c === "EUR" ? "€" : "₴";
                      const parts: string[] = [];
                      if (d.inc > 0.001) parts.push(`  🟢 Доходи (+): +${d.inc.toFixed(2)} ${s}`);
                      if (d.exp > 0.001) parts.push(`  🔴 Витрати (-): -${d.exp.toFixed(2)} ${s}`);
                      if (d.inc > 0.001 || d.exp > 0.001) parts.push(`  💼 Сальдо (=): ${d.net >= 0 ? "+" : ""}${d.net.toFixed(2)} ${s}`);
                      return `[${c}]\n` + parts.join("\n");
                    }),
                    filteredTotals.activeCurrs.length > 1 ? `≈ Еквівалент за курсом: Сальдо ${filteredTotals.equivNetUAH >= 0 ? "+" : ""}${filteredTotals.equivNetUAH.toFixed(2)} ₴` : ""
                  ].filter(Boolean).join("\n");

                  navigator.clipboard.writeText(lines).then(() => {
                    setIsCopiedHistory(true);
                    setTimeout(() => setIsCopiedHistory(false), 2000);
                  });
                };

                return (
                  <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border-2 border-sky-500/50 rounded-2xl p-3.5 shadow-xl flex flex-col gap-2.5 animate-fadeIn">
                    <div className="flex flex-wrap items-center justify-between text-xs border-b border-slate-800 pb-2 gap-2">
                      <span className="text-white font-black flex items-center gap-1.5">
                        <span className="text-base">{filter === "exc" ? "🔄" : filter === "debt" ? "⏳" : filter === "inc" ? "🟢" : filter === "exp" ? "🔴" : "📊"}</span>
                        <span>{cardTitle}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCopySummary}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10.5px] font-bold border border-slate-700 flex items-center gap-1 active:scale-95 cursor-pointer shadow-sm transition-all"
                        >
                          {isCopiedHistory ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                          <span>{isCopiedHistory ? "Скопійовано!" : "Скопіювати підсумок"}</span>
                        </button>
                        <span className="text-sky-300 font-mono font-bold text-[11px] bg-sky-950 px-2.5 py-0.5 rounded-lg border border-sky-500/30">
                          {filteredGroups.length} оп.
                        </span>
                      </div>
                    </div>

                    {/* Mode: Exchange specific view without turnover */}
                    {filter === "exc" ? (
                      <div className="bg-blue-950/30 border border-blue-500/30 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-inner">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl">🔄</span>
                          <div>
                            <span className="text-xs sm:text-sm font-black text-blue-200 block">
                              Знайдено {filteredGroups.length} операцій обміну валют
                            </span>
                            <span className="text-[10px] text-slate-400 font-sans">
                              Обмін переміщує кошти між рахунками без зміни загального капіталу
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : filter === "debt" ? (
                      /* Mode: Debt specific view */
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono">
                        {/* Debt Repaid to us */}
                        <div className="bg-emerald-950/30 border border-emerald-500/30 p-2.5 rounded-xl flex flex-col justify-between gap-1 shadow-inner">
                          <span className="text-[9px] font-black uppercase text-emerald-400 font-sans tracking-wider">Повернено нам (+):</span>
                          {filteredTotals.activeCurrs.length <= 1 ? (
                            <span className="text-sm sm:text-base font-black text-emerald-300">
                              +{filteredTotals.debtIncomeSum.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {singleSym}
                            </span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {filteredTotals.activeCurrs.map(c => {
                                const val = filteredTotals.byCurr[c].debtInc;
                                if (val <= 0.001) return null;
                                const s = c === "USD" ? "$" : c === "EUR" ? "€" : "₴";
                                return (
                                  <div key={c} className="flex justify-between items-center text-xs sm:text-sm font-black text-emerald-300">
                                    <span className="text-[10px] text-emerald-400/80 font-sans">{c}:</span>
                                    <span>+{val.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Debt Given / Recorded */}
                        <div className="bg-rose-950/30 border border-rose-500/30 p-2.5 rounded-xl flex flex-col justify-between gap-1 shadow-inner">
                          <span className="text-[9px] font-black uppercase text-rose-400 font-sans tracking-wider">Видано / наші борги (-):</span>
                          {filteredTotals.activeCurrs.length <= 1 ? (
                            <span className="text-sm sm:text-base font-black text-rose-300">
                              -{filteredTotals.debtExpenseSum.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {singleSym}
                            </span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {filteredTotals.activeCurrs.map(c => {
                                const val = filteredTotals.byCurr[c].debtExp;
                                if (val <= 0.001) return null;
                                const s = c === "USD" ? "$" : c === "EUR" ? "€" : "₴";
                                return (
                                  <div key={c} className="flex justify-between items-center text-xs sm:text-sm font-black text-rose-300">
                                    <span className="text-[10px] text-rose-400/80 font-sans">{c}:</span>
                                    <span>-{val.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Debt Net */}
                        <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl flex flex-col justify-between gap-1 shadow-inner">
                          <span className="text-[9px] font-black uppercase text-slate-400 font-sans tracking-wider">Боргове сальдо (=):</span>
                          {(() => {
                            const dNet = filteredTotals.debtIncomeSum - filteredTotals.debtExpenseSum;
                            return filteredTotals.activeCurrs.length <= 1 ? (
                              <span className={`text-sm sm:text-base font-black ${dNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                {dNet >= 0 ? "+" : ""}{dNet.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {singleSym}
                              </span>
                            ) : (
                              <div className="flex flex-col gap-0.5">
                                {filteredTotals.activeCurrs.map(c => {
                                  const cNet = filteredTotals.byCurr[c].debtInc - filteredTotals.byCurr[c].debtExp;
                                  const s = c === "USD" ? "$" : c === "EUR" ? "€" : "₴";
                                  return (
                                    <div key={c} className={`flex justify-between items-center text-xs sm:text-sm font-black ${cNet >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                      <span className="text-[10px] text-slate-400 font-sans">{c}:</span>
                                      <span>{cNet >= 0 ? "+" : ""}{cNet.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    ) : filter === "inc" ? (
                      /* Mode: Income Only view */
                      <div className="bg-emerald-950/30 border border-emerald-500/30 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner font-mono">
                        <div>
                          <span className="text-[9px] font-black uppercase text-emerald-400 font-sans tracking-wider block">
                            Загальна сума надходжень (+):
                          </span>
                          {filteredTotals.activeCurrs.length <= 1 ? (
                            <span className="text-xl sm:text-2xl font-black text-emerald-300">
                              +{filteredTotals.incomeSum.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {singleSym}
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-3 mt-1">
                              {filteredTotals.activeCurrs.map(c => {
                                const inc = filteredTotals.byCurr[c].inc;
                                if (inc <= 0.001) return null;
                                const s = c === "USD" ? "$" : c === "EUR" ? "€" : "₴";
                                return (
                                  <span key={c} className="text-sm sm:text-base font-black text-emerald-300 bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                                    <span className="text-[10.5px] text-emerald-400/80 font-sans mr-1">{c}:</span>
                                    +{inc.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        {filteredTotals.activeCurrs.length > 1 && (
                          <div className="text-right text-[11px] text-emerald-400 font-bold bg-emerald-950/50 p-2 rounded-xl border border-emerald-500/20">
                            ≈ Загальний еквівалент: ~{filteredTotals.equivIncomeUAH.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                          </div>
                        )}
                      </div>
                    ) : filter === "exp" ? (
                      /* Mode: Expense Only view */
                      <div className="bg-rose-950/30 border border-rose-500/30 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner font-mono">
                        <div>
                          <span className="text-[9px] font-black uppercase text-rose-400 font-sans tracking-wider block">
                            Загальна сума витрат (-):
                          </span>
                          {filteredTotals.activeCurrs.length <= 1 ? (
                            <span className="text-xl sm:text-2xl font-black text-rose-300">
                              -{filteredTotals.expenseSum.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {singleSym}
                            </span>
                          ) : (
                            <div className="flex flex-wrap items-center gap-3 mt-1">
                              {filteredTotals.activeCurrs.map(c => {
                                const exp = filteredTotals.byCurr[c].exp;
                                if (exp <= 0.001) return null;
                                const s = c === "USD" ? "$" : c === "EUR" ? "€" : "₴";
                                return (
                                  <span key={c} className="text-sm sm:text-base font-black text-rose-300 bg-rose-950/80 px-2.5 py-1 rounded-lg border border-rose-500/30">
                                    <span className="text-[10.5px] text-rose-400/80 font-sans mr-1">{c}:</span>
                                    -{exp.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        {filteredTotals.activeCurrs.length > 1 && (
                          <div className="text-right text-[11px] text-rose-400 font-bold bg-rose-950/50 p-2 rounded-xl border border-rose-500/20">
                            ≈ Загальний еквівалент: ~{filteredTotals.equivExpenseUAH.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Mode: All (Income, Expense, Net) */
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono">
                        {/* Income */}
                        <div className="bg-emerald-950/30 border border-emerald-500/30 p-2.5 rounded-xl flex flex-col justify-between gap-1 shadow-inner">
                          <span className="text-[9px] font-black uppercase text-emerald-400 font-sans tracking-wider">Доходи (+):</span>
                          {filteredTotals.activeCurrs.length <= 1 ? (
                            <span className="text-sm sm:text-base font-black text-emerald-300">
                              +{filteredTotals.incomeSum.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {singleSym}
                            </span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {filteredTotals.activeCurrs.filter(c => filteredTotals.byCurr[c].inc > 0.001).length === 0 ? (
                                <span className="text-xs sm:text-sm font-black text-slate-400">0.00 ₴</span>
                              ) : (
                                filteredTotals.activeCurrs.map(c => {
                                  const inc = filteredTotals.byCurr[c].inc;
                                  if (inc <= 0.001) return null;
                                  const s = c === "USD" ? "$" : c === "EUR" ? "€" : "₴";
                                  return (
                                    <div key={c} className="flex justify-between items-center text-xs sm:text-sm font-black text-emerald-300">
                                      <span className="text-[10px] text-emerald-400/80 font-sans">{c}:</span>
                                      <span>+{inc.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s}</span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>

                        {/* Expense */}
                        <div className="bg-rose-950/30 border border-rose-500/30 p-2.5 rounded-xl flex flex-col justify-between gap-1 shadow-inner">
                          <span className="text-[9px] font-black uppercase text-rose-400 font-sans tracking-wider">Витрати (-):</span>
                          {filteredTotals.activeCurrs.length <= 1 ? (
                            <span className="text-sm sm:text-base font-black text-rose-300">
                              -{filteredTotals.expenseSum.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {singleSym}
                            </span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {filteredTotals.activeCurrs.filter(c => filteredTotals.byCurr[c].exp > 0.001).length === 0 ? (
                                <span className="text-xs sm:text-sm font-black text-slate-400">0.00 ₴</span>
                              ) : (
                                filteredTotals.activeCurrs.map(c => {
                                  const exp = filteredTotals.byCurr[c].exp;
                                  if (exp <= 0.001) return null;
                                  const s = c === "USD" ? "$" : c === "EUR" ? "€" : "₴";
                                  return (
                                    <div key={c} className="flex justify-between items-center text-xs sm:text-sm font-black text-rose-300">
                                      <span className="text-[10px] text-rose-400/80 font-sans">{c}:</span>
                                      <span>-{exp.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s}</span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>

                        {/* Saldo */}
                        <div className="bg-slate-900 border border-slate-800 p-2.5 rounded-xl flex flex-col justify-between gap-1 shadow-inner">
                          <span className="text-[9px] font-black uppercase text-slate-400 font-sans tracking-wider">Чисте сальдо (=):</span>
                          {filteredTotals.activeCurrs.length <= 1 ? (
                            <span className={`text-sm sm:text-base font-black ${filteredTotals.netSum >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {filteredTotals.netSum >= 0 ? "+" : ""}{filteredTotals.netSum.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {singleSym}
                            </span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {filteredTotals.activeCurrs.filter(c => filteredTotals.byCurr[c].total > 0.001).length === 0 ? (
                                <span className="text-xs sm:text-sm font-black text-slate-400">0.00 ₴</span>
                              ) : (
                                filteredTotals.activeCurrs.map(c => {
                                  const curData = filteredTotals.byCurr[c];
                                  if (curData.total <= 0.001) return null;
                                  const s = c === "USD" ? "$" : c === "EUR" ? "€" : "₴";
                                  return (
                                    <div key={c} className={`flex justify-between items-center text-xs sm:text-sm font-black ${curData.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                                      <span className="text-[10px] text-slate-400 font-sans">{c}:</span>
                                      <span>{curData.net >= 0 ? "+" : ""}{curData.net.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {s}</span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Multi-currency consolidated breakdown */}
                    {filter === "all" && filteredTotals.activeCurrs.length > 1 && (
                      <div className="flex flex-col gap-1.5 pt-1.5 border-t border-slate-800/80 text-[10px]">
                        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-sky-950/40 border border-sky-500/30 text-sky-300 font-mono text-[10.5px]">
                          <span className="font-sans font-bold text-sky-400">≈ Зведене сальдо за курсом:</span>
                          <span className="font-black text-sm">
                            {filteredTotals.equivNetUAH >= 0 ? "+" : ""}{filteredTotals.equivNetUAH.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {viewMode === "grouped" ? (
              <div className="space-y-4">
                {(() => {
                  let accumulated = 0;
                  const visibleDayGroups = dayGroups.filter(dg => {
                    if (accumulated >= visibleCount) return false;
                    accumulated += dg.groups.length;
                    return true;
                  });

                  return visibleDayGroups.map((dg) => {
                    const isDayCollapsed = !!collapsedDays[dg.dayISO];
                    const dayCur = dg.activeCurrs.length === 1 
                      ? dg.activeCurrs[0] 
                      : (historyCurrency !== "ALL" ? historyCurrency : "UAH");
                    const sym = dayCur === "USD" ? "$" : dayCur === "EUR" ? "€" : "₴";

                    return (
                      <div key={dg.dayISO} className="space-y-2">
                        {/* Day Header Banner */}
                        <div
                          onClick={() => setCollapsedDays(prev => ({ ...prev, [dg.dayISO]: !prev[dg.dayISO] }))}
                          className="cursor-pointer bg-slate-950/95 border border-slate-800/90 hover:border-slate-700 rounded-2xl p-2.5 shadow-lg flex flex-wrap items-center justify-between gap-2 transition-all group"
                        >
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
                              <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-white">
                                  {dg.headerInfo.fullDateStr}
                                </span>
                                {dg.headerInfo.dayOfWeek && (
                                  <span className="text-[10px] font-bold text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                                    {dg.headerInfo.dayOfWeek}
                                  </span>
                                )}
                                {dg.headerInfo.relativeLabel && (
                                  <span className="text-[9px] font-extrabold text-sky-400 bg-sky-500/15 px-1.5 py-0.5 rounded border border-sky-500/30">
                                    {dg.headerInfo.relativeLabel}
                                  </span>
                                )}
                              </div>
                              <div className="text-[9.5px] text-slate-500 font-bold">
                                {dg.opCount} {dg.opCount === 1 ? "операція" : dg.opCount < 5 ? "операції" : "операцій"} за цей день
                              </div>
                            </div>
                          </div>

                          {/* Daily totals summary without turnover */}
                          <div className="flex items-center gap-1.5 text-[10px] font-black shrink-0 flex-wrap">
                            {dg.activeCurrs.length <= 1 ? (
                              <>
                                {dg.incomeTotal > 0 && (
                                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    +{dg.incomeTotal.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sym}
                                  </span>
                                )}
                                {dg.expenseTotal > 0 && (
                                  <span className="px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20">
                                    -{dg.expenseTotal.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sym}
                                  </span>
                                )}
                                {dg.incomeTotal === 0 && dg.expenseTotal === 0 && dg.excTotal > 0 ? (
                                  <span className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-300 border border-blue-500/20 font-bold">
                                    🔄 Обмін ({dg.opCount} оп.)
                                  </span>
                                ) : (
                                  <span className={`px-2 py-0.5 rounded-lg border ${
                                    dg.netBalance >= 0 
                                      ? "bg-sky-500/10 text-sky-300 border-sky-500/20" 
                                      : "bg-rose-500/10 text-rose-300 border-rose-500/20"
                                  }`}>
                                    Разом: {dg.netBalance >= 0 ? "+" : ""}{dg.netBalance.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {sym}
                                  </span>
                                )}
                              </>
                            ) : (
                              dg.activeCurrs.map(c => {
                                const curData = dg.byCurr[c];
                                const cSym = c === "USD" ? "$" : c === "EUR" ? "€" : "₴";
                                const net = curData.inc - curData.exp;
                                const hasIncExp = curData.inc > 0 || curData.exp > 0;
                                return (
                                  <span key={c} className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 font-bold flex items-center gap-1">
                                    <span>{c}:</span>
                                    {curData.inc > 0 && <span className="text-emerald-400">+{curData.inc.toLocaleString("uk-UA", { maximumFractionDigits: 2 })}{cSym}</span>}
                                    {curData.exp > 0 && <span className="text-rose-400">-{curData.exp.toLocaleString("uk-UA", { maximumFractionDigits: 2 })}{cSym}</span>}
                                    {hasIncExp ? (
                                      <span className={net >= 0 ? "text-sky-300 font-extrabold" : "text-rose-300 font-extrabold"}>
                                        (= {net >= 0 ? "+" : ""}{net.toLocaleString("uk-UA", { maximumFractionDigits: 2 })}{cSym})
                                      </span>
                                    ) : curData.exc > 0 ? (
                                      <span className="text-blue-400 font-bold text-[9.5px]">
                                        🔄 Обмін
                                      </span>
                                    ) : null}
                                  </span>
                                );
                              })
                            )}
                            <button
                              type="button"
                              className="p-1 text-slate-400 group-hover:text-white"
                            >
                              {isDayCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>

                        {/* Day's operations */}
                        {!isDayCollapsed && (
                          <div className="flex flex-col gap-2 pl-1 sm:pl-2 border-l-2 border-slate-800/60 ml-3">
                            {dg.groups.map((g, gIdx) => renderGroupCard(g, `${dg.dayISO}_${gIdx}`))}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filteredGroups.slice(0, visibleCount).map((g, gIdx) => renderGroupCard(g, `flat_${gIdx}`))}
              </div>
            )}

            {filteredGroups.length > visibleCount && (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-2 py-4 mt-2">
                <button
                  type="button"
                  onClick={() => setVisibleCount(prev => prev + 50)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                >
                  Показати ще (+50)
                </button>
                <button
                  type="button"
                  onClick={() => setVisibleCount(filteredGroups.length)}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-400 font-semibold text-xs rounded-xl border border-slate-800 transition-all active:scale-95 cursor-pointer"
                >
                  Показати всі ({filteredGroups.length})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Hidden upload prompt */}
      <input
        type="file"
        id="inp-history-receipt"
        accept="image/*"
        onChange={handleFileAttachLocal}
        className="hidden"
      />

      {/* Upload Modal Overlay */}
      {selectedGroupDate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 w-full max-w-[340px] text-center shadow-2xl">
            <h3 className="font-bold text-sky-400 mb-3 text-base">Завантажити чек для запису</h3>
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Виберіть фото чеку для запису від <span className="font-mono text-slate-200">{selectedGroupDate}</span>
            </p>
            
            {isAttaching ? (
              <div className="py-4 text-sm font-bold text-sky-400 animate-pulse flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Завантаження у хмару...
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById("inp-history-receipt")?.click()}
                  className="flex-1 py-3 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl text-sm"
                >
                  Вибрати файл
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGroupDate(null)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm"
                >
                  Скасувати
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LIGHTBOX MODAL */}
      {lightboxImage && (
        <div 
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 bg-black/90 backdrop-blur-md z-[10000] flex flex-col items-center justify-center p-4 cursor-zoom-out animate-fadeIn"
        >
          <button 
            type="button"
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-full z-[10001]"
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

      {/* EDIT MODAL IN PLACE */}
      {selectedGroupForDetail && isEditing && (() => {
        const hasSplits = !!selectedGroupForDetail.items.find(item => parseTransactionText(item.fullText || item.text).cardDetails) || selectedGroupForDetail.items.length > 1;
        return (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[9995] flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-[450px] p-5 shadow-2xl my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase text-sky-400 tracking-wider">Режим Редагування</span>
                <span className="text-xs text-slate-400 font-mono mt-0.5">ID: {selectedGroupForDetail.dateStr}</span>
              </div>
              <button 
                onClick={() => setIsEditing(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Informative notice for split operations */}
            {hasSplits && (
              <div className="mb-4 bg-indigo-950/45 border border-indigo-500/30 rounded-xl p-3 text-[11px] text-indigo-200 leading-relaxed font-medium shadow-inner">
                ℹ️ <span className="font-bold text-indigo-300">Розподілений платіж.</span> Ви можете відредагувати суму, контрагента, категорію та коментар для цієї операції.
              </div>
            )}

            {/* Form Fields */}
            <div className="flex flex-col gap-4 mb-5">
              {/* 1. Sum Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Wallet className="w-3 h-3 text-sky-400" /> Сума транзакції
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={editSum}
                  onChange={(e) => setEditSum(e.target.value)}
                  placeholder="Введіть суму"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-black text-white focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-all"
                />
              </div>

              {/* 2. Contractor input with suggestions */}
              <div className="flex flex-col gap-1 relative">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <User className="w-3 h-3 text-sky-400" /> Контрагент
                </label>
                <input
                  type="text"
                  value={editContractor}
                  onChange={(e) => handleContractorChange(e.target.value)}
                  placeholder="Ім'я контрагента"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-all"
                />
                
                {/* Suggestions overlay */}
                {contractorSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden z-50 shadow-2xl">
                    {contractorSuggestions.map((sug, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        onClick={() => {
                          setEditContractor(sug);
                          setContractorSuggestions([]);
                        }}
                        className="w-full text-left p-2.5 text-xs text-slate-300 hover:bg-slate-900 font-semibold border-b border-slate-900/60 last:border-0"
                      >
                        👤 {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 3. Category Dropdown / Selector */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Tag className="w-3 h-3 text-sky-400" /> Стаття витрат / прибутку
                  </label>
                  
                  {/* Category type toggle buttons */}
                  <div className="flex gap-1.5 bg-slate-950 p-0.5 rounded-lg border border-slate-900">
                    <button
                      type="button"
                      onClick={() => setEditCategoryType("standard")}
                      className={`px-2 py-0.5 text-[8px] font-black uppercase rounded ${
                        editCategoryType === "standard" ? "bg-slate-800 text-white" : "text-slate-500"
                      }`}
                    >
                      Стандартна
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditCategoryType("custom")}
                      className={`px-2 py-0.5 text-[8px] font-black uppercase rounded ${
                        editCategoryType === "custom" ? "bg-slate-800 text-white" : "text-slate-500"
                      }`}
                    >
                      Власна
                    </button>
                  </div>
                </div>

                {editCategoryType === "standard" ? (
                  <select
                    value={editCategorySelect}
                    onChange={(e) => setEditCategorySelect(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white focus:outline-none focus:border-sky-500/50"
                  >
                    <option value="">Без категорії</option>
                    {categoriesList.map((cat, cIdx) => (
                      <option key={cIdx} value={cat}>📁 {cat}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editCategoryCustom}
                    onChange={(e) => setEditCategoryCustom(e.target.value)}
                    placeholder="Введіть власну назву категорії"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50"
                  />
                )}
              </div>

              {/* 4. Description Comment Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-sky-400" /> Опис / Детальний коментар
                </label>
                <input
                  type="text"
                  value={editCommentOnly}
                  onChange={(e) => setEditCommentOnly(e.target.value)}
                  placeholder="Опис операції"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-bold text-white focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50"
                />
              </div>
            </div>

            {/* Form Actions */}
            {isSavingEdit ? (
              <div className="py-4 text-sm font-bold text-sky-400 animate-pulse flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" /> Оновлення Google Таблиці...
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={saveEditLocal}
                    className="flex-1 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95"
                  >
                    <Save className="w-4 h-4" />
                    Зберегти зміни
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-5 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold rounded-xl text-xs transition-all active:scale-95"
                  >
                    Скасувати
                  </button>
                </div>
                {onDeleteOperation && selectedGroupForDetail && (
                  <button
                    onClick={() => {
                      setDeletingTransaction(selectedGroupForDetail);
                      setConfirmFullDelete(false);
                      setIsEditing(false);
                      setSelectedGroupForDetail(null);
                    }}
                    className="w-full py-3 bg-rose-950/60 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-900/40 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Видалити цей запис
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )})()}

      {deletingTransaction && (() => {
        const representative = deletingTransaction.items[0];
        const parsed = representative ? parseTransactionText(representative.fullText || representative.text) : null;
        const contractorName = parsed?.contractor || "";
        const displaySum = deletingTransaction.totalSum;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-5 text-left">
              {!confirmFullDelete ? (
                <>
                  <div>
                    <h3 className="text-lg font-black text-white">Видалення операції</h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Виберіть варіант видалення для операції від {deletingTransaction.dateStr} (<b>{displaySum.toFixed(2)} ₴</b>, {contractorName || "Невідомий"}):
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={async () => {
                        const target = deletingTransaction;
                        setDeletingTransaction(null);
                        setConfirmFullDelete(false);
                        try {
                          if (onDeleteOperation) {
                            await onDeleteOperation(target.dateStr, "history_only");
                          }
                        } catch (err: any) {
                          alert("Помилка видалення історії: " + err.message);
                        }
                      }}
                      className="group p-3.5 bg-slate-950 border border-slate-800 hover:border-sky-500/50 rounded-2xl flex flex-col gap-1 transition-all active:scale-98 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2 font-extrabold text-xs text-sky-400 group-hover:text-white transition-colors">
                        🧹 Видалити ТІЛЬКИ історію (Зберегти суму)
                      </div>
                      <div className="text-[10px] text-slate-400 group-hover:text-slate-300 leading-normal">
                        Очистить коментар/опис операції, але збереже її суму (<b>{displaySum.toFixed(2)} ₴</b>) в розрахунках, щоб поточний баланс та статистика не змінилися.
                      </div>
                    </button>

                    <button
                      onClick={() => setConfirmFullDelete(true)}
                      className="group p-3.5 bg-slate-950 border border-slate-800 hover:border-rose-500/50 rounded-2xl flex flex-col gap-1 transition-all active:scale-98 text-left cursor-pointer"
                    >
                      <div className="flex items-center gap-2 font-extrabold text-xs text-rose-400 group-hover:text-white transition-colors">
                        🔥 Повністю видалити все разом (Оновити баланси)
                      </div>
                      <div className="text-[10px] text-slate-400 group-hover:text-slate-300 leading-normal">
                        Повністю видалить запис та суму (<b>{displaySum.toFixed(2)} ₴</b>) з таблиці. Баланси та рахунки оновляться (повернуться до стану до здійснення цієї операції).
                      </div>
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setDeletingTransaction(null);
                      setConfirmFullDelete(false);
                    }}
                    className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold rounded-2xl text-xs transition-all active:scale-95 text-center cursor-pointer"
                  >
                    Скасувати
                  </button>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    <div className="text-3xl">🚨</div>
                    <h3 className="text-lg font-black text-rose-400">Підтвердження повного видалення</h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Ви дійсно хочете <b>ПОВНІСТЮ видалити</b> цей запис від <b>{deletingTransaction.dateStr}</b> на суму <b>{displaySum.toFixed(2)} ₴</b>?
                    </p>
                    <p className="text-[11px] text-slate-400 bg-rose-950/40 border border-rose-900/50 p-2.5 rounded-xl">
                      ⚠️ Запис повністю зникне з Google Таблиці, а баланси рахунків та контрагентів повернуться до стану до здійснення цієї операції.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2.5 mt-1">
                    <button
                      onClick={async () => {
                        const target = deletingTransaction;
                        setDeletingTransaction(null);
                        setConfirmFullDelete(false);
                        try {
                          if (onDeleteOperation) {
                            await onDeleteOperation(target.dateStr, "all");
                          }
                        } catch (err: any) {
                          alert("Помилка повного видалення: " + err.message);
                        }
                      }}
                      className="py-3.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl text-xs transition-all active:scale-98 text-center cursor-pointer shadow-lg shadow-rose-950/50"
                    >
                      🔥 Так, видалити повністю
                    </button>

                    <button
                      onClick={() => setConfirmFullDelete(false)}
                      className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold rounded-2xl text-xs transition-all active:scale-95 text-center cursor-pointer"
                    >
                      Назад / Скасувати
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Category Summary Modal */}
      {showCategoryReportModal && (() => {
        const sym = categoryModalCurrency === "USD" ? "$" : categoryModalCurrency === "EUR" ? "€" : categoryModalCurrency === "UAH" ? "₴" : (currentCurrency === "USD" ? "$" : currentCurrency === "EUR" ? "€" : "₴");
        const filteredList = allCategoriesSummary.filter(c => {
          if (!categoryModalSearch.trim()) return true;
          return c.name.toLowerCase().includes(categoryModalSearch.toLowerCase().trim());
        });
        const grandTotal = allCategoriesSummary.reduce((acc, c) => acc + c.totalSum, 0);
        const grandExp = allCategoriesSummary.reduce((acc, c) => acc + c.expSum, 0);
        const grandInc = allCategoriesSummary.reduce((acc, c) => acc + c.incSum, 0);
        const grandUah = allCategoriesSummary.reduce((acc, c) => acc + c.uah, 0);
        const grandUsd = allCategoriesSummary.reduce((acc, c) => acc + c.usd, 0);
        const grandEur = allCategoriesSummary.reduce((acc, c) => acc + c.eur, 0);

        return (
          <div 
            onClick={() => setShowCategoryReportModal(false)}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[999] flex items-center justify-center p-3 animate-fadeIn"
          >
            <div 
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-950 border-2 border-sky-500/40 rounded-3xl max-w-xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
                <div className="flex items-center gap-2">
                  <span className="text-xl">📊</span>
                  <div>
                    <h3 className="text-sm font-black text-white">Звіт за всіма категоріями</h3>
                    <p className="text-[10px] text-slate-400 font-medium">Суми та кількість операцій за кожною статтею ({allCategoriesSummary.length} категорій)</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCategoryReportModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scope / Period & Currency Selector */}
              <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[10px] font-bold text-slate-400 mr-0.5">Період:</span>
                  <button
                    type="button"
                    onClick={() => setCategoryModalScope("all")}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      categoryModalScope === "all" ? "bg-sky-400 text-slate-950 shadow-sm" : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                    }`}
                  >
                    🌐 Всі
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryModalScope("filtered")}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      categoryModalScope === "filtered" ? "bg-sky-400 text-slate-950 shadow-sm" : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                    }`}
                    title="Тільки операції, які зараз відфільтровано в історії"
                  >
                    🔍 Відфільтровані ({filteredGroups.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryModalScope("this_month")}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      categoryModalScope === "this_month" ? "bg-sky-400 text-slate-950 shadow-sm" : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                    }`}
                  >
                    📅 Цей місяць
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryModalScope("prev_month")}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black transition-all cursor-pointer ${
                      categoryModalScope === "prev_month" ? "bg-sky-400 text-slate-950 shadow-sm" : "bg-slate-950 text-slate-400 hover:text-white border border-slate-800"
                    }`}
                  >
                    ⏳ Минулий місяць
                  </button>
                </div>

                {/* Currency Filter Tabs */}
                <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCategoryModalCurrency("ALL")}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-black transition-all cursor-pointer ${
                      categoryModalCurrency === "ALL" ? "bg-sky-400 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🌐 Всі
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryModalCurrency("UAH")}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-black transition-all cursor-pointer ${
                      categoryModalCurrency === "UAH" ? "bg-sky-400 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🇺🇦 ₴
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryModalCurrency("USD")}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-black transition-all cursor-pointer ${
                      categoryModalCurrency === "USD" ? "bg-sky-400 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🇺🇸 $
                  </button>
                  <button
                    type="button"
                    onClick={() => setCategoryModalCurrency("EUR")}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-black transition-all cursor-pointer ${
                      categoryModalCurrency === "EUR" ? "bg-sky-400 text-slate-950 shadow-sm" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    🇪🇺 €
                  </button>
                </div>
              </div>

              {/* Summary KPIs */}
              <div className="p-3 bg-slate-900/40 border-b border-slate-850 grid grid-cols-3 gap-2 text-center font-mono">
                <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800 flex flex-col">
                  <span className="text-[9px] font-sans font-bold text-slate-400 uppercase">Разом:</span>
                  <span className="text-xs sm:text-sm font-black text-white">{grandTotal.toFixed(2)} {sym}</span>
                  {categoryModalCurrency === "ALL" && (grandEur > 0 || grandUsd > 0) && (
                    <div className="text-[9px] font-bold text-slate-400 mt-1 flex flex-wrap gap-x-1.5 justify-center border-t border-slate-800 pt-0.5">
                      <span>₴{grandUah.toFixed(0)}</span>
                      {grandUsd > 0 && <span>${grandUsd.toFixed(0)}</span>}
                      {grandEur > 0 && <span className="text-sky-300 font-bold">€{grandEur.toFixed(0)}</span>}
                    </div>
                  )}
                </div>
                <div className="bg-emerald-950/30 p-2 rounded-xl border border-emerald-500/20 flex flex-col">
                  <span className="text-[9px] font-sans font-bold text-emerald-400 uppercase">Доходи:</span>
                  <span className="text-xs sm:text-sm font-black text-emerald-300">+{grandInc.toFixed(2)} {sym}</span>
                </div>
                <div className="bg-rose-950/30 p-2 rounded-xl border border-rose-500/20 flex flex-col">
                  <span className="text-[9px] font-sans font-bold text-rose-400 uppercase">Витрати:</span>
                  <span className="text-xs sm:text-sm font-black text-rose-300">-{grandExp.toFixed(2)} {sym}</span>
                </div>
              </div>

              {/* Search */}
              <div className="p-3 border-b border-slate-850">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={categoryModalSearch}
                    onChange={(e) => setCategoryModalSearch(e.target.value)}
                    placeholder="Шукати категорію..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 font-medium"
                  />
                  {categoryModalSearch && (
                    <button
                      onClick={() => setCategoryModalSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Category List */}
              <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 divide-y divide-slate-850">
                {filteredList.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-500 font-semibold">Категорій не знайдено</div>
                ) : (
                  filteredList.map((c) => {
                    const percent = grandTotal > 0 ? ((c.totalSum / grandTotal) * 100).toFixed(1) : "0.0";
                    return (
                      <div 
                        key={c.name}
                        onClick={() => {
                          setSelectedCategory(c.name);
                          setShowCategoryReportModal(false);
                        }}
                        className="pt-2 first:pt-0 flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-slate-900/80 transition-all cursor-pointer group"
                      >
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs font-black text-white group-hover:text-sky-300 flex items-center gap-1.5 truncate">
                            <span>🏷️ {c.name}</span>
                            <span className="text-[10px] text-slate-500 font-normal">({c.count} оп.)</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {percent}% від витрат
                          </span>
                          {categoryModalCurrency === "ALL" && (c.usd > 0 || c.eur > 0) && (
                            <div className="flex items-center gap-1.5 text-[9px] font-mono text-slate-400 mt-0.5">
                              {c.uah > 0 && <span>🇺🇦 {c.uah.toFixed(0)} ₴</span>}
                              {c.usd > 0 && <span>🇺🇸 ${c.usd.toFixed(0)}</span>}
                              {c.eur > 0 && <span className="text-sky-300 font-bold">🇪🇺 €{c.eur.toFixed(0)}</span>}
                            </div>
                          )}
                        </div>

                        <div className="text-right font-mono shrink-0 flex flex-col items-end">
                          <span className="text-xs font-black text-white">
                            {c.totalSum.toFixed(2)} {sym}
                          </span>
                          <div className="flex items-center gap-1.5 text-[10px]">
                            {c.incSum > 0 && <span className="text-emerald-400 font-bold">+{c.incSum.toFixed(2)}</span>}
                            {c.expSum > 0 && <span className="text-rose-400 font-bold">-{c.expSum.toFixed(2)}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-slate-800 bg-slate-900/40 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowCategoryReportModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Закрити
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
