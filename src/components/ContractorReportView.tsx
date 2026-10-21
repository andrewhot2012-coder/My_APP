import React, { useState, useMemo, useEffect } from "react";
import { 
  ArrowLeft, 
  User, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  CreditCard, 
  ArrowRightLeft,
  Search,
  X,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Printer
} from "lucide-react";
import { HistoryGroup, InitData } from "../types";
import { 
  parseTransactionText, 
  getDirectImageUrl, 
  replaceBankKeysWithAliases,
  getFulfillmentBreakdown
} from "../lib/transactionUtils";

// Helper to extract category prefix like [Category] and return it along with the cleaned comment
function getTxCategoryAndCleanComment(fullText: string, rawContent: string, parsed: any): { category: string; comment: string } {
  let category = "";
  let comment = parsed.comment || parsed.cleanDescription || "";

  // Try parsing from parsed.comment first
  if (parsed.comment) {
    const matchComment = parsed.comment.match(/^\[(.*?)\]\s*(.*)/);
    if (matchComment) {
      category = matchComment[1].trim();
      comment = matchComment[2].trim();
    }
  } else {
    // Try from raw content / text
    const matchStart = fullText.match(/^\[(.*?)\]\s*(.*)/);
    if (matchStart) {
      const inner = matchStart[1];
      if (inner.includes("|") || inner.match(/\d{2}\.\d{2}\.\d{2}/)) {
        const remaining = matchStart[2].trim();
        const secondMatch = remaining.match(/^\[(.*?)\]\s*(.*)/);
        if (secondMatch) {
          category = secondMatch[1].trim();
          comment = secondMatch[2].trim();
        }
      } else {
        category = inner.trim();
        comment = matchStart[2].trim();
      }
    }
  }

  // Also clean comment if it starts with 📝
  if (comment.startsWith("📝")) {
    comment = comment.replace(/^📝\s*/, "").trim();
  }

  // If comment still contains [category] inside it, let's clean it up
  const bracketMatch = comment.match(/^\[(.*?)\]\s*(.*)/);
  if (bracketMatch) {
    if (!category) {
      category = bracketMatch[1].trim();
    }
    comment = bracketMatch[2].trim();
  }

  return { category, comment };
}

// Extract contractor names from splits inside cardDetails
function isSameContractorName(n1?: string | null, n2?: string | null): boolean {
  if (!n1 || !n2) return false;
  const a = n1.trim().toLowerCase();
  const b = n2.trim().toLowerCase();
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const wordsA = a.split(/\s+/).filter(w => w.length > 2);
  const wordsB = b.split(/\s+/).filter(w => w.length > 2);
  return wordsA.some(w => wordsB.includes(w));
}

function getSplitContractorNames(cardDetails: string | undefined): string[] {
  if (!cardDetails) return [];
  const names: string[] = [];
  const lines = cardDetails.split(/\r?\n/);
  lines.forEach(line => {
    const parts = line.split("➔");
    parts.forEach(part => {
      const trimmed = part.trim();
      if (trimmed.toLowerCase().startsWith("контрагент:")) {
        const name = trimmed.replace(/контрагент:/i, "").replace(/👤/g, "").trim();
        if (name) names.push(name.toLowerCase());
      } else if (trimmed.startsWith("👤")) {
        const name = trimmed.replace("👤", "").trim();
        if (name) names.push(name.toLowerCase());
      }
    });
  });
  return names;
}

interface ContractorReportViewProps {
  contractorName: string;
  historyGroups: HistoryGroup[];
  initData: InitData | null;
  onBack: () => void;
  onNavigateToHistoryWithSearch?: (query: string) => void;
  onSelectContractor?: (name: string) => void;
  currentCurrency?: string;
  onAddIncome?: (operation: string, contractorName: string) => void;
  onAddExpense?: (operation: string, contractorName: string) => void;
}

export const ContractorReportView: React.FC<ContractorReportViewProps> = ({
  contractorName,
  historyGroups,
  initData,
  onBack,
  onNavigateToHistoryWithSearch,
  onSelectContractor,
  currentCurrency = "UAH",
  onAddIncome,
  onAddExpense
}) => {
  const activeSymbol = currentCurrency === "UAH" ? "₴" : currentCurrency === "USD" ? "$" : "€";
  const [searchTerm, setSearchTerm] = useState("");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [expandedTxs, setExpandedTxs] = useState<Record<number, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"date-desc" | "date-asc" | "category" | "sum-desc" | "sum-asc">("date-desc");
  const [flowFilter, setFlowFilter] = useState<"all" | "income" | "expense">("all");

  const handleSequentialBack = () => {
    if (lightboxImage) {
      setLightboxImage(null);
    } else if (searchTerm) {
      setSearchTerm("");
    } else if (selectedCategory !== "all") {
      setSelectedCategory("all");
    } else if (flowFilter !== "all") {
      setFlowFilter("all");
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

  const toggleTxExpanded = (idx: number) => {
    setExpandedTxs(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const renderTextWithContractors = (text: string) => {
    if (!text) return null;
    if (!onSelectContractor || !initData?.names || initData.names.length === 0) {
      return <span>{text}</span>;
    }

    const sortedContractors = [...initData.names].sort((a, b) => b.length - a.length);
    const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedNames = sortedContractors.map(name => escapeRegExp(name)).join('|');
    const regex = new RegExp(`(👤?\\s*(?:${escapedNames}))`, 'gi');
    
    const parts = text.split(regex);
    if (parts.length <= 1) {
      return <span>{text}</span>;
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
                const charBefore = startOffset > 0 ? text[startOffset - 1] : "";
                const charAfter = startOffset + part.length < text.length ? text[startOffset + part.length] : "";
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
                  }}
                  className="inline-flex items-center gap-0.5 px-1 py-0.2 bg-sky-950/40 hover:bg-sky-900/60 border border-sky-500/20 hover:border-sky-400 text-sky-300 hover:text-sky-200 rounded text-[11px] font-bold transition-all cursor-pointer align-middle mx-0.5"
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

  const renderContractorLink = (text: string, iconType: "user" | "bank") => {
    if (iconType !== "user" || !onSelectContractor) {
      return <span>{text}</span>;
    }
    
    const clean = text.trim();
    const matched = initData?.names?.find(n => n.toLowerCase() === clean.toLowerCase());
    if (matched) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectContractor(matched);
          }}
          className="text-sky-400 hover:text-sky-300 hover:underline cursor-pointer font-extrabold text-left"
        >
          {clean}
        </button>
      );
    }
    return <span>{text}</span>;
  };

  const isAndriy = useMemo(() => {
    const norm = contractorName.trim().toLowerCase();
    return norm.includes("андрій") || norm.includes("андрей") || norm.includes("кігічак");
  }, [contractorName]);

  // 1. Find debtor status from ledger debtors data
  const debtorStatus = useMemo(() => {
    if (!initData || !initData.debtors) return null;
    const normTarget = contractorName.trim().toLowerCase();
    const isAnd = normTarget.includes("андрій") || normTarget.includes("андрей") || normTarget.includes("кігічак");
    
    const oweUsItem = initData.debtors.oweUs.find(
      i => i.name.trim().toLowerCase() === normTarget
    );
    const weOweItem = initData.debtors.weOwe.find(
      i => i.name.trim().toLowerCase() === normTarget
    );
    const settledItem = initData.debtors.settled.find(
      i => i.name.trim().toLowerCase() === normTarget
    );

    if (oweUsItem) {
      return { type: "oweUs" as const, sum: oweUsItem.sum, label: "Він нам винен" };
    }
    if (weOweItem) {
      return { type: "weOwe" as const, sum: weOweItem.sum, label: "Ми йому винні" };
    }
    if (settledItem) {
      return { type: "settled" as const, sum: settledItem.sum, label: "Борг закрито" };
    }
    return null;
  }, [initData, contractorName]);

  const [totalDisplayCurrency, setTotalDisplayCurrency] = useState<"UAH" | "USD" | "EUR">((currentCurrency as any) || "UAH");
  const [isPrintMode, setIsPrintMode] = useState(false);

  const getDebtImpact = (tx: any) => {
    const isDebt = tx.operation.toLowerCase().includes("борг") || 
                   tx.category?.toLowerCase().includes("борг") ||
                   (tx.comment && tx.comment.toLowerCase().includes("повернення тіла")) ||
                   tx.bank?.toLowerCase().includes("реєстр боргів");

    if (!isDebt) {
      return {
        label: "без змін",
        colorClass: "bg-slate-800 text-slate-400 border-slate-700",
        formattedChange: "0.00",
        isChange: false,
        type: "neutral" as const
      };
    }

    const change = tx.debtChange ?? 0;
    const op = tx.operation.toLowerCase();
    const isRepayment = op.includes("повернули") || op.includes("повертаю") || op.includes("повернення");
    const isIncrease = op.includes("дав у") || op.includes("взяв у") || op.includes("позичив") || op.includes("позика");

    if (isRepayment) {
      return {
        label: "📉 борг ↓",
        colorClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        formattedChange: `-${Math.abs(change).toFixed(2)}`,
        isChange: true,
        type: "decrease" as const
      };
    } else if (isIncrease) {
      return {
        label: "📈 борг ↑",
        colorClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        formattedChange: `+${Math.abs(change).toFixed(2)}`,
        isChange: true,
        type: "increase" as const
      };
    }

    if (change < -0.005) {
      const activeDebt = multiCurrencyDebts[currentCurrency as "UAH" | "USD" | "EUR"];
      if (activeDebt && activeDebt.type === "weOwe") {
        return {
          label: "📈 борг ↑",
          colorClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
          formattedChange: `+${Math.abs(change).toFixed(2)}`,
          isChange: true,
          type: "increase" as const
        };
      } else {
        return {
          label: "📉 борг ↓",
          colorClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
          formattedChange: `-${Math.abs(change).toFixed(2)}`,
          isChange: true,
          type: "decrease" as const
        };
      }
    } else if (change > 0.005) {
      const activeDebt = multiCurrencyDebts[currentCurrency as "UAH" | "USD" | "EUR"];
      if (activeDebt && activeDebt.type === "weOwe") {
        return {
          label: "📉 борг ↓",
          colorClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
          formattedChange: `-${Math.abs(change).toFixed(2)}`,
          isChange: true,
          type: "decrease" as const
        };
      } else {
        return {
          label: "📈 борг ↑",
          colorClass: "bg-rose-500/10 text-rose-400 border-rose-500/20",
          formattedChange: `+${Math.abs(change).toFixed(2)}`,
          isChange: true,
          type: "increase" as const
        };
      }
    }

    return {
      label: "без змін",
      colorClass: "bg-slate-800 text-slate-400 border-slate-700",
      formattedChange: "0.00",
      isChange: false,
      type: "neutral" as const
    };
  };

  const formatDebtChange = (tx: any, symbol: string) => {
    if (!tx) return <span className="text-slate-400 font-bold">—</span>;
    const impact = getDebtImpact(tx);
    const textClass = impact.type === "decrease" ? "text-emerald-600" : impact.type === "increase" ? "text-rose-600" : "text-slate-400";
    return (
      <span className={`${textClass} font-black whitespace-nowrap`}>
        {impact.isChange ? `${impact.formattedChange} ${symbol}` : `0.00 ${symbol}`}
        <span className="text-[10px] font-bold ml-1">({impact.label})</span>
      </span>
    );
  };

  const formatRunningDebt = (balance: number | undefined, symbol: string) => {
    if (balance === undefined) return <span className="text-slate-400 font-bold">—</span>;
    if (balance > 0.005) {
      return (
        <span className="text-emerald-600 font-black whitespace-nowrap">
          +{balance.toFixed(2)} {symbol} <span className="text-[9px] font-bold text-emerald-500">(Він нам)</span>
        </span>
      );
    } else if (balance < -0.005) {
      return (
        <span className="text-rose-600 font-black whitespace-nowrap">
          {balance.toFixed(2)} {symbol} <span className="text-[9px] font-bold text-rose-500">(Ми йому)</span>
        </span>
      );
    } else {
      return <span className="text-slate-600 font-black">0.00 {symbol}</span>;
    }
  };

  useEffect(() => {
    if (currentCurrency) {
      setTotalDisplayCurrency(currentCurrency as any);
    }
  }, [currentCurrency]);

  const multiCurrencyDebts = useMemo(() => {
    const currencies: Array<"UAH" | "USD" | "EUR"> = ["UAH", "USD", "EUR"];
    const debts: Record<"UAH" | "USD" | "EUR", { type: "oweUs" | "weOwe" | "settled" | "none"; sum: number; label: string }> = {
      UAH: { type: "none", sum: 0, label: "Немає боргу" },
      USD: { type: "none", sum: 0, label: "Немає боргу" },
      EUR: { type: "none", sum: 0, label: "Немає боргу" }
    };

    const normTarget = contractorName.trim().toLowerCase();

    currencies.forEach(cur => {
      let curInitData = null;
      if (cur === currentCurrency) {
        curInitData = initData;
      } else {
        try {
          const cached = localStorage.getItem(`cached_init_data_${cur}`);
          if (cached) {
            curInitData = JSON.parse(cached);
          }
        } catch (e) {
          console.error(`Failed to parse cached_init_data_${cur}`, e);
        }
      }

      if (curInitData && curInitData.debtors) {
        const oweUsItem = curInitData.debtors.oweUs?.find(
          (i: any) => i.name.trim().toLowerCase() === normTarget
        );
        const weOweItem = curInitData.debtors.weOwe?.find(
          (i: any) => i.name.trim().toLowerCase() === normTarget
        );
        const settledItem = curInitData.debtors.settled?.find(
          (i: any) => i.name.trim().toLowerCase() === normTarget
        );

        if (oweUsItem) {
          debts[cur] = { type: "oweUs", sum: oweUsItem.sum, label: "Він нам винен" };
        } else if (weOweItem) {
          debts[cur] = { type: "weOwe", sum: weOweItem.sum, label: "Ми йому винні" };
        } else if (settledItem) {
          debts[cur] = { type: "settled", sum: settledItem.sum, label: "Борг закрито" };
        }
      }
    });

    return debts;
  }, [initData, contractorName, currentCurrency]);

  const rates = useMemo(() => {
    const usdBuy = parseFloat(localStorage.getItem("rate_usd_app") || "41.50");
    const usdSell = parseFloat(localStorage.getItem("rate_usd_sell_app") || "41.90");
    const eurBuy = parseFloat(localStorage.getItem("rate_eur_app") || "44.80");
    const eurSell = parseFloat(localStorage.getItem("rate_eur_sell_app") || "45.30");
    return {
      usdBuy,
      usdSell,
      eurBuy,
      eurSell
    };
  }, []);

  const totalSumInSelectedCurrency = useMemo(() => {
    const convert = (amount: number, fromCur: "UAH" | "USD" | "EUR", toCur: "UAH" | "USD" | "EUR", isWeOwe?: boolean): number => {
      if (fromCur === toCur) return amount;

      // Якщо ми йому винні (isWeOwe), конвертуємо за нижчим курсом (купівлі: usdBuy / eurBuy),
      // щоб точно вирахувати, скільки валюти потрібно здати, щоб отримати потрібну суму в гривні.
      if (isWeOwe) {
        if (fromCur === "USD") {
          const uahVal = amount * rates.usdBuy;
          if (toCur === "UAH") return uahVal;
          if (toCur === "EUR") return uahVal / rates.eurBuy;
        }

        if (fromCur === "EUR") {
          const uahVal = amount * rates.eurBuy;
          if (toCur === "UAH") return uahVal;
          if (toCur === "USD") return uahVal / rates.usdBuy;
        }

        if (fromCur === "UAH") {
          if (toCur === "USD") return amount / rates.usdBuy;
          if (toCur === "EUR") return amount / rates.eurBuy;
        }

        return amount;
      }

      if (fromCur === "USD") {
        const uahToBuyUsd = amount * rates.usdSell;
        if (toCur === "UAH") return uahToBuyUsd;
        if (toCur === "EUR") return uahToBuyUsd / rates.eurBuy;
      }

      if (fromCur === "EUR") {
        const uahToBuyEur = amount * rates.eurSell;
        if (toCur === "UAH") return uahToBuyEur;
        if (toCur === "USD") return uahToBuyEur / rates.usdBuy;
      }

      // Якщо він нам винен в гривнях (fromCur === "UAH" і oweUs), то при переключенні на USD/EUR
      // конвертуємо за курсом купівлі (usdBuy / eurBuy), щоб при здачі цієї валюти отримати саме ті гривні, які він винний.
      if (fromCur === "UAH") {
        if (toCur === "USD") return amount / rates.usdBuy;
        if (toCur === "EUR") return amount / rates.eurBuy;
      }

      return amount;
    };

    let total = 0;
    (Object.keys(multiCurrencyDebts) as Array<"UAH" | "USD" | "EUR">).forEach(cur => {
      const debt = multiCurrencyDebts[cur];
      if (debt.type === "oweUs") {
        total += convert(debt.sum, cur, totalDisplayCurrency, false);
      } else if (debt.type === "weOwe") {
        total -= convert(debt.sum, cur, totalDisplayCurrency, true);
      }
    });

    return total;
  }, [multiCurrencyDebts, totalDisplayCurrency, rates]);
  const contractorTransactions = useMemo(() => {
    const txList: Array<{
      dateStr: string;
      operation: string;
      isIncome: boolean;
      sum: number;
      bank: string;
      fullText: string;
      rawContent: string;
      parsed: any;
      category: string;
      comment: string;
      isSplitMerged?: boolean;
      splitDetailsText?: string;
      rawLedgerSum?: number;
      debtChange?: number;
      runningDebtBalance?: number;
      splitItems?: Array<{
        dateStr: string;
        operation: string;
        isIncome: boolean;
        sum: number;
        bank: string;
        fullText: string;
        rawContent: string;
        parsed: any;
        category: string;
        comment: string;
        rawLedgerSum?: number;
      }>;
    }> = [];

    const normTarget = contractorName.trim().toLowerCase();
    if (!normTarget) return [];

    const seenKeys = new Set<string>();

    const addTx = (tx: typeof txList[0]) => {
      const commentSig = (tx.comment || tx.parsed.comment || tx.parsed.cleanDescription || "").trim().toLowerCase();
      // Only filter out exact duplicates of the same split part (same date, operation, bank, sum, and comment)
      const key = `${tx.dateStr.trim()}_${tx.operation.trim()}_${tx.bank.trim()}_${Math.abs(tx.sum).toFixed(2)}_${commentSig.substring(0, 20)}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        txList.push(tx);
      }
    };

    // 1) From direct contractor ledger entries (priority source of truth for contractor balances)
    if (initData?.contractorLedger) {
      const ledger = initData.contractorLedger as Record<string, Array<{ text: string; sum: number }>>;
      Object.entries(ledger).forEach(([ledgerOwner, items]) => {
        const normLedgerOwner = ledgerOwner.trim().toLowerCase();
        
        items.forEach(item => {
          const rawContent = item.text.replace(/^\[.*?\]/, "").trim();
          const parsed = parseTransactionText(item.text);
          
          const cName = (parsed.contractor || "").trim().toLowerCase();
          
          let isMatch = false;
          if (normLedgerOwner === normTarget) {
            isMatch = true;
          } else if (cName) {
            isMatch = cName === normTarget || cName.includes(normTarget) || normTarget.includes(cName);
          } else {
            isMatch = item.text.toLowerCase().includes(normTarget);
          }

          if (isMatch) {
            const datePrefixMatch = item.text.match(/^\[(.*?)\]/);
            let dateStr = "";
            let operation = "";
            let rawContentCleaned = item.text;
            
            if (datePrefixMatch) {
              rawContentCleaned = item.text.replace(datePrefixMatch[0], "").trim();
              const inner = datePrefixMatch[1];
              const innerParts = inner.split("|");
              dateStr = innerParts[0] ? innerParts[0].trim() : "";
              operation = innerParts[1] ? innerParts[1].trim() : "";
            }

            let itemSum = item.sum;
            if (operation.includes("Початковий борг (+)") || item.text.includes("нам винні:")) {
              itemSum = Math.abs(item.sum);
            } else if (operation.includes("Початковий борг (-)") || item.text.includes("ми винні:")) {
              itemSum = -Math.abs(item.sum);
            }

            const resolvedIsInc = operation.includes("Повернули борг") || operation.includes("Прибуток") || operation.includes("Прихід") || operation.includes("Початковий борг (+)") || (!operation.includes("Повертаю борг") && !operation.includes("Покупка") && itemSum < 0);
            const { category, comment } = getTxCategoryAndCleanComment(item.text, rawContentCleaned, parsed);
            
            if (!parsed.cardDetails && dateStr) {
              const commSig = (comment || parsed.comment || "").trim().toLowerCase().substring(0, 20);
              for (const group of historyGroups) {
                const gCurr = group.curr || group.items?.[0]?.curr;
                if (gCurr && gCurr !== currentCurrency) continue;
                if (group.dateStr && group.dateStr.trim() === dateStr.trim()) {
                  for (const hItem of group.items) {
                    const hParsed = parseTransactionText(hItem.fullText || hItem.text);
                    if (hParsed.cardDetails) {
                      const hCommSig = (hParsed.comment || hParsed.cleanDescription || "").trim().toLowerCase().substring(0, 20);
                      if (!commSig || !hCommSig || commSig.includes(hCommSig) || hCommSig.includes(commSig)) {
                        parsed.cardDetails = hParsed.cardDetails;
                        break;
                      }
                    }
                  }
                  if (parsed.cardDetails) break;
                }
              }
            }

            addTx({
              dateStr: dateStr || "Невідома дата",
              operation: operation || (resolvedIsInc ? "Прибуток" : "Витрата"),
              isIncome: resolvedIsInc,
              sum: Math.abs(item.sum),
              bank: normLedgerOwner === normTarget ? "Реєстр боргів" : `Реєстр боргів (${ledgerOwner})`,
              fullText: item.text,
              rawContent: rawContentCleaned,
              parsed,
              category,
              comment,
              rawLedgerSum: itemSum
            });
          }
        });
      });
    }

    // 2) From general history groups (money sheet)
    historyGroups.forEach(group => {
      const gCurr = group.curr || group.items?.[0]?.curr;
      if (gCurr && gCurr !== currentCurrency) return;

      group.items.forEach(item => {
        const itemCurr = item.curr || gCurr;
        if (itemCurr && itemCurr !== currentCurrency) return;

        const rawContent = item.text.replace(/^\[.*?\]/, "").trim();
        const parsed = parseTransactionText(item.fullText || rawContent);
        
        const cName = (parsed.contractor || "").trim().toLowerCase();
        
        let isMatch = false;
        if (cName) {
          isMatch = cName === normTarget || cName.includes(normTarget) || normTarget.includes(cName);
        } else {
          isMatch = (item.fullText || "").toLowerCase().includes(normTarget);
        }

        // Avoid matching from main sheet if this contractor is a split contractor in cardDetails (and not the main contractor),
        // because they already have their specific split amount recorded in their dedicated ledger sheet.
        if (isMatch && parsed.cardDetails && cName !== normTarget) {
          const splitContractors = getSplitContractorNames(parsed.cardDetails);
          if (splitContractors.includes(normTarget)) {
            isMatch = false;
          }
        }

        const cleanAmount = parsed.amount ? parsed.amount.replace(",", ".").replace(/[^\d.]/g, "") : "";
        const parsedSum = cleanAmount ? parseFloat(cleanAmount) : NaN;
        // If it is a split transaction (has cardDetails), we MUST use the actual item.sum of this split part
        // instead of the total parsed.amount, to avoid double/triple counting when summing up split parts.
        const finalSum = (parsed.cardDetails && !isNaN(Math.abs(item.sum)))
          ? Math.abs(item.sum)
          : (!isNaN(parsedSum) ? parsedSum : Math.abs(item.sum));

        if (isMatch && (finalSum > 0.01 || Math.abs(item.sum) > 0.01)) {
          const { category, comment } = getTxCategoryAndCleanComment(item.fullText || item.text, rawContent, parsed);
          
          const isInc = group.isIncome || item.sum > 0;
          const resolvedOp = group.operation || (isInc ? "Прибуток" : "Витрата");

          // Avoid double-counting if we already have the direct ledger entry for this transaction
          if (group.dateStr) {
            const alreadyInLedger = txList.some(
              tx => tx.dateStr.trim() === group.dateStr.trim() && 
                    tx.bank.startsWith("Реєстр боргів")
            );
            if (alreadyInLedger) {
              return;
            }
          }

          addTx({
            dateStr: group.dateStr,
            operation: resolvedOp,
            isIncome: isInc,
            sum: finalSum,
            bank: item.bank,
            fullText: item.fullText || item.text,
            rawContent,
            parsed,
            category,
            comment,
            rawLedgerSum: isInc ? finalSum : -finalSum
          });
        }
      });
    });

    // Deduplicate: If there is a direct ledger entry in our own ledger (bank === "Реєстр боргів"),
    // then discard any matched split entries from other people's ledgers (bank.startsWith("Реєстр боргів ("))
    // for the same transaction (same date, same operation, and same comment signature).
    const deduplicatedTxList: typeof txList = [];
    txList.forEach(tx => {
      if (tx.bank.startsWith("Реєстр боргів (")) {
        const commentSig = (tx.comment || tx.parsed.comment || tx.parsed.cleanDescription || "").trim().toLowerCase().substring(0, 30);
        const hasDirectLedger = txList.some(other => 
          other.dateStr.trim() === tx.dateStr.trim() &&
          other.operation.trim() === tx.operation.trim() &&
          other.bank === "Реєстр боргів" &&
          (other.comment || other.parsed.comment || other.parsed.cleanDescription || "").trim().toLowerCase().substring(0, 30) === commentSig
        );
        if (hasDirectLedger) {
          return; // Skip this split entry since we have the main/direct ledger entry
        }
      }
      deduplicatedTxList.push(tx);
    });

    // Group and merge parts of split transactions (belonging to same operation at same time stamp)
    const mergedList: typeof txList = [];
    const groupsByDateAndOp: Record<string, typeof txList> = {};

    deduplicatedTxList.forEach(tx => {
      const commentSig = (tx.comment || tx.parsed.comment || tx.parsed.cleanDescription || "").trim().toLowerCase();
      const groupKey = `${tx.dateStr.trim()}_${tx.operation.trim()}_${commentSig.substring(0, 30)}`;
      if (tx.dateStr && tx.dateStr !== "Невідома дата") {
        if (!groupsByDateAndOp[groupKey]) {
          groupsByDateAndOp[groupKey] = [];
        }
        groupsByDateAndOp[groupKey].push(tx);
      } else {
        mergedList.push(tx);
      }
    });

    Object.keys(groupsByDateAndOp).forEach(groupKey => {
      const items = groupsByDateAndOp[groupKey];
      if (items.length === 1) {
        mergedList.push(items[0]);
      } else {
        // Merge split parts! Sum up their amounts
        const totalSum = items.reduce((sum, item) => sum + item.sum, 0);
        const totalRawLedgerSum = items.reduce((sum, item) => sum + (item.rawLedgerSum !== undefined ? item.rawLedgerSum : (item.isIncome ? item.sum : -item.sum)), 0);
        
        // Generate details of the splits
        const splitsDetail = items.map(item => {
          const bankName = replaceBankKeysWithAliases(item.bank, initData);
          const alias = bankName === "Реєстр боргів" ? "Борг ⏳" : bankName;
          return `${item.sum.toFixed(2)} ${activeSymbol} (${alias})`;
        }).join(" + ");

        const firstItem = items[0];
        mergedList.push({
          ...firstItem,
          sum: totalSum,
          bank: items.map(item => item.bank).join(" + "),
          isSplitMerged: true,
          splitDetailsText: splitsDetail,
          splitItems: items,
          rawLedgerSum: totalRawLedgerSum
        });
      }
    });

    // Sort by date string descending
    const sortedList = mergedList.sort((a, b) => {
      const parseDate = (dStr: string) => {
        const p = dStr.trim().split(/[\s.:]+/);
        if (p.length < 5) return 0;
        const day = parseInt(p[0]);
        const month = parseInt(p[1]) - 1;
        let year = parseInt(p[2]);
        if (year < 100) year += 2000;
        const hour = parseInt(p[3]);
        const min = parseInt(p[4]);
        const sec = p[5] ? parseInt(p[5]) : 0;
        return new Date(year, month, day, hour, min, sec).getTime();
      };
      return parseDate(b.dateStr) - parseDate(a.dateStr);
    });

    // Compute the running balance of the debt walking backwards (from newest to oldest)
    const activeDebt = multiCurrencyDebts[currentCurrency as "UAH" | "USD" | "EUR"];
    let finalDebt = 0;
    if (activeDebt) {
      if (activeDebt.type === "oweUs") {
        finalDebt = activeDebt.sum;
      } else if (activeDebt.type === "weOwe") {
        finalDebt = -activeDebt.sum;
      }
    }

    let currentBal = finalDebt;
    const enrichedList = sortedList.map((tx) => {
      const txBal = currentBal;
      const txChange = tx.rawLedgerSum !== undefined ? tx.rawLedgerSum : (tx.isIncome ? tx.sum : -tx.sum);
      currentBal = Number((currentBal - txChange).toFixed(2));
      return {
        ...tx,
        debtChange: txChange,
        runningDebtBalance: txBal
      };
    });

    return enrichedList;
  }, [historyGroups, contractorName, initData, multiCurrencyDebts, currentCurrency]);

  // 3. Compute stats ("що і як і звідки взялося, куди пішло")
  const stats = useMemo(() => {
    let totalIn = 0; // Inflow from contractor to us
    let totalOut = 0; // Outflow from us to contractor
    let principalIn = 0; // Principal repaid (reduces debt)
    let interestIn = 0; // Interest / profit / other income (doesn't reduce debt)
    let principalOut = 0; // Money lent / debt created
    let otherOut = 0; // Other expenses

    contractorTransactions.forEach(tx => {
      let splitIsOutflow = false;
      let hasSplitForThisContractor = false;

      if (tx.parsed?.cardDetails) {
        const splitLines = tx.parsed.cardDetails.split(/\r?\n/);
        for (const line of splitLines) {
          const arrowCount = (line.match(/➔/g) || []).length;
          if (arrowCount === 2) {
            const parts = line.split("➔");
            if (parts.length === 3) {
              const mid = parts[1].trim();
              const right = parts[2].trim();
              const fromVal = mid.replace(/^(?:Взаємозалік:|Контрагент:)\s*/i, "").trim();
              const toVal = right.replace("👤", "").trim();

              if (isSameContractorName(toVal, contractorName)) {
                hasSplitForThisContractor = true;
                splitIsOutflow = true; // money went to contractor (Outflow)
                break;
              }
              if (isSameContractorName(fromVal, contractorName)) {
                hasSplitForThisContractor = true;
                splitIsOutflow = false; // money came from contractor (Inflow)
                break;
              }
            }
          }
        }
      }

      const op = (tx.operation || "").toLowerCase();
      const cat = (tx.category || "").toLowerCase();
      const isDebtRepayment = op.includes("повернули борг") || cat.includes("повернення боргу");
      const isProfit = op.includes("прибуток") || cat.includes("прибуток") || cat.includes("відсот");
      const isLending = op.includes("повертаю борг") || op.includes("позичаю") || cat.includes("позика") || op.includes("початковий борг (+)") || op.includes("введені початкові залишки (+)");

      const comm = (tx.comment || tx.parsed?.comment || "").toLowerCase();
      const full = (tx.fullText || tx.rawContent || "").toLowerCase();
      const isBuyingOnCredit = (op.includes("борг") || comm.includes("борг") || full.includes("борг")) && 
                               (op.includes("покупка") || comm.includes("покупка") || full.includes("покупка") ||
                                op.includes("взял") || op.includes("взяти") || op.includes("взяли") ||
                                op.includes("отримал") || op.includes("знижкою"));

      const isInitialDebtOweUs = op.includes("початковий борг (+)") || op.includes("введені початкові залишки (+)");
      const isInflow = (tx.isIncome || isBuyingOnCredit) && !isInitialDebtOweUs;

      if (hasSplitForThisContractor) {
        if (splitIsOutflow) {
          totalOut += tx.sum;
          if (isLending || (tx.debtChange !== undefined && tx.debtChange > 0)) {
            principalOut += tx.sum;
          } else {
            otherOut += tx.sum;
          }
        } else {
          totalIn += tx.sum;
          if (isDebtRepayment || (tx.debtChange !== undefined && tx.debtChange < 0)) {
            principalIn += tx.sum;
          } else {
            interestIn += tx.sum;
          }
        }
      } else {
        if (isInflow) {
          totalIn += tx.sum;
          if (isDebtRepayment || (tx.debtChange !== undefined && tx.debtChange < 0)) {
            principalIn += tx.sum;
          } else if (isProfit) {
            interestIn += tx.sum;
          } else {
            if (tx.debtChange !== undefined && tx.debtChange < 0) {
              principalIn += tx.sum;
            } else {
              interestIn += tx.sum;
            }
          }
        } else {
          totalOut += tx.sum;
          if (isLending || (tx.debtChange !== undefined && tx.debtChange > 0)) {
            principalOut += tx.sum;
          } else {
            otherOut += tx.sum;
          }
        }
      }
    });

    const netFlow = totalIn - totalOut;

    return {
      totalIn,
      totalOut,
      principalIn,
      interestIn,
      principalOut,
      otherOut,
      netFlow,
      count: contractorTransactions.length
    };
  }, [contractorTransactions, contractorName]);

  // Get all unique categories present in this contractor's transactions
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    contractorTransactions.forEach(tx => {
      if (tx.category) {
        cats.add(tx.category);
      }
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b));
  }, [contractorTransactions]);

  // 4. Apply additional local search, category filtering, and sorting inside contractor's history
  const filteredTransactions = useMemo(() => {
    let result = [...contractorTransactions];

    // 0) Filter by flow (income vs expense)
    if (flowFilter === "income") {
      result = result.filter(tx => tx.isIncome);
    } else if (flowFilter === "expense") {
      result = result.filter(tx => !tx.isIncome);
    }

    // 1) Filter by category
    if (selectedCategory !== "all") {
      result = result.filter(tx => (tx.category || "").toLowerCase() === selectedCategory.toLowerCase());
    }

    // 2) Filter by search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(tx => {
        return (
          tx.dateStr.toLowerCase().includes(q) ||
          tx.operation.toLowerCase().includes(q) ||
          tx.bank.toLowerCase().includes(q) ||
          tx.fullText.toLowerCase().includes(q) ||
          (tx.category || "").toLowerCase().includes(q) ||
          (tx.comment || "").toLowerCase().includes(q)
        );
      });
    }

    // 3) Sort results
    result.sort((a, b) => {
      const parseDateToMs = (dStr: string) => {
        const p = dStr.trim().split(/[\s.:]+/);
        if (p.length < 5) return 0;
        const day = parseInt(p[0]);
        const month = parseInt(p[1]) - 1;
        let year = parseInt(p[2]);
        if (year < 100) year += 2000;
        const hour = parseInt(p[3]);
        const min = parseInt(p[4]);
        const sec = p[5] ? parseInt(p[5]) : 0;
        return new Date(year, month, day, hour, min, sec).getTime();
      };

      if (sortBy === "date-desc") {
        return parseDateToMs(b.dateStr) - parseDateToMs(a.dateStr);
      }
      if (sortBy === "date-asc") {
        return parseDateToMs(a.dateStr) - parseDateToMs(b.dateStr);
      }
      if (sortBy === "category") {
        const catA = a.category || "Без категорії";
        const catB = b.category || "Без категорії";
        if (catA === catB) {
          return parseDateToMs(b.dateStr) - parseDateToMs(a.dateStr);
        }
        return catA.localeCompare(catB);
      }
      if (sortBy === "sum-desc") {
        return b.sum - a.sum;
      }
      if (sortBy === "sum-asc") {
        return a.sum - b.sum;
      }
      return 0;
    });

    return result;
  }, [contractorTransactions, selectedCategory, searchTerm, sortBy, flowFilter]);

  if (isPrintMode) {
    return (
      <div className="fixed inset-0 bg-slate-950 z-50 overflow-y-auto p-4 md:p-8 flex flex-col items-center">
        {/* Print Stylesheet */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body {
              background: white !important;
              color: black !important;
            }
            /* Hide the container elements of the main app */
            #root, .no-print, header, footer, button, nav {
              display: none !important;
            }
            /* Show only our print view */
            #printable-contractor-report {
              display: block !important;
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              background: white !important;
              color: black !important;
              padding: 0 !important;
              margin: 0 !important;
              box-shadow: none !important;
              border: none !important;
            }
            /* Style tables cleanly for print */
            table {
              border-collapse: collapse !important;
              width: 100% !important;
            }
            th, td {
              border: 1px solid #cbd5e1 !important;
              color: black !important;
              background: transparent !important;
              padding: 6px 10px !important;
            }
            th {
              background-color: #f1f5f9 !important;
              font-weight: bold !important;
            }
          }
        `}} />

        {/* Top Control Bar (Non-Printable) */}
        <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 no-print shadow-xl">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-sky-500/10 text-sky-400 rounded-xl border border-sky-500/20">
              <Printer className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h2 className="text-sm font-black text-white">Версія звіту для друку</h2>
              <p className="text-xs font-semibold text-slate-400">Контрагент: {contractorName}</p>
            </div>
          </div>
          
          <div className="flex flex-wrap items-center justify-end gap-3.5 w-full sm:w-auto">
            {/* Currency Selector */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-850">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1.5">Валюта:</span>
              {(["UAH", "USD", "EUR"] as const).map(cur => (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setTotalDisplayCurrency(cur)}
                  className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                    totalDisplayCurrency === cur
                      ? "bg-slate-850 text-sky-400 border border-slate-700/60 shadow-sm"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {cur}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-black rounded-xl text-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer shadow-md shadow-sky-500/15"
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
        </div>

        {/* Printable Area - styled as a beautiful, high-contrast, clean document on white paper background */}
        <div 
          id="printable-contractor-report"
          className="w-full max-w-4xl bg-white text-slate-900 p-8 md:p-12 rounded-2xl shadow-2xl border border-slate-200 font-sans print:shadow-none print:border-none print:p-0 print:m-0"
        >
          {/* Document Header */}
          <div className="border-b-2 border-slate-900 pb-6 mb-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
              <div className="text-left">
                <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                  АКТ ЗВІРКИ ВЗАЄМОРОЗРАХУНКІВ
                </h1>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">
                  Реєстр фінансових операцій та стану заборгованості
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs font-bold text-slate-500">ДАТА СТВОРЕННЯ:</p>
                <p className="text-sm font-black text-slate-900">{new Date().toLocaleDateString("uk-UA")}</p>
                <p className="text-xs text-slate-500 font-bold mt-1">Основна валюта звіту: {totalDisplayCurrency}</p>
              </div>
            </div>
          </div>

          {/* Party Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 bg-slate-50 p-5 rounded-2xl border border-slate-100">
            <div className="text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Суб'єкт взаєморозрахунків (Контрагент)</p>
              <p className="text-lg font-black text-slate-900 mt-1">{contractorName}</p>
              <p className="text-xs text-slate-500 mt-1 font-semibold">Акт сформовано на основі транзакцій системи</p>
            </div>
            <div className="text-left">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Сумарне сальдо (у всіх валютах)</p>
              <p className={`text-lg font-black mt-1 ${
                totalSumInSelectedCurrency > 0.005 
                  ? "text-emerald-600" 
                  : totalSumInSelectedCurrency < -0.005 
                    ? "text-rose-600" 
                    : "text-slate-900"
              }`}>
                {totalSumInSelectedCurrency > 0.005 
                  ? `Він винен нам: +${totalSumInSelectedCurrency.toFixed(2)}` 
                  : totalSumInSelectedCurrency < -0.005 
                    ? `Ми винні йому: ${totalSumInSelectedCurrency.toFixed(2)}` 
                    : "Взаєморозрахунки повністю закриті (0.00)"
                } {totalDisplayCurrency === "UAH" ? "₴" : totalDisplayCurrency === "USD" ? "$" : "€"}
              </p>
              <p className="text-xs text-slate-500 mt-1 font-medium">Конвертовано за поточним курсом валют у кабінеті</p>
            </div>
          </div>

          {/* Detailed breakdown by all currencies */}
          <div className="mb-8 text-left">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Стан заборгованості за кожною валютою</h3>
            <div className="grid grid-cols-3 gap-4">
              {(["UAH", "USD", "EUR"] as const).map(cur => {
                const d = multiCurrencyDebts[cur];
                const symbol = cur === "UAH" ? "₴" : cur === "USD" ? "$" : "€";
                const isOweUs = d.type === "oweUs";
                const isWeOwe = d.type === "weOwe";
                
                return (
                  <div key={cur} className="border border-slate-200 p-4 rounded-xl bg-white flex flex-col gap-1 shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{cur}</span>
                    <span className={`text-base font-black ${
                      isOweUs ? "text-emerald-600" : isWeOwe ? "text-rose-600" : "text-slate-600"
                    }`}>
                      {d.type !== "none" && d.type !== "settled" ? `${isOweUs ? "+" : "-"}${d.sum.toFixed(2)}` : "0.00"}
                      <span className="text-xs font-normal text-slate-400 ml-1">{symbol}</span>
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                      {isOweUs ? "Він нам винен" : isWeOwe ? "Ми йому винні" : "Немає боргу"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Core Stats Overview */}
          <div className="mb-8 text-left">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Грошові обороти по контрагенту ({currentCurrency})</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="border border-slate-100 p-3 bg-slate-50/50 rounded-xl">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Всього надійшло (+)</span>
                <p className="text-base font-black text-emerald-600 mt-1">
                  +{stats.totalIn.toFixed(2)} {currentCurrency === "UAH" ? "₴" : currentCurrency === "USD" ? "$" : "€"}
                </p>
              </div>
              <div className="border border-slate-100 p-3 bg-slate-50/50 rounded-xl">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Всього сплачено (-)</span>
                <p className="text-base font-black text-rose-600 mt-1">
                  -{stats.totalOut.toFixed(2)} {currentCurrency === "UAH" ? "₴" : currentCurrency === "USD" ? "$" : "€"}
                </p>
              </div>
              <div className="border border-slate-100 p-3 bg-slate-50/50 rounded-xl">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Грошовий сальдо-потік</span>
                <p className={`text-base font-black mt-1 ${stats.netFlow >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {stats.netFlow >= 0 ? "+" : ""}{stats.netFlow.toFixed(2)} {currentCurrency === "UAH" ? "₴" : currentCurrency === "USD" ? "$" : "€"}
                </p>
              </div>
            </div>
          </div>

          {/* Transaction Register table */}
          <div className="text-left">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3">Реєстр проведених операцій та динаміка боргу ({currentCurrency})</h3>
            <div className="overflow-x-auto border border-slate-200 rounded-2xl shadow-sm">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
                    <th className="py-3 px-4 border-r border-slate-200">Дата</th>
                    <th className="py-3 px-4 border-r border-slate-200">Операція, категорія та коментар</th>
                    <th className="py-3 px-4 border-r border-slate-200 text-right">Сума операції</th>
                    <th className="py-3 px-4 border-r border-slate-200 text-right">Вплив на борг</th>
                    <th className="py-3 px-4 text-right">Залишок боргу</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-slate-850">
                  {contractorTransactions.map((tx, idx) => {
                    const symbol = currentCurrency === "UAH" ? "₴" : currentCurrency === "USD" ? "$" : "€";
                    return (
                      <tr key={idx} className="hover:bg-slate-50/40">
                        <td className="py-2.5 px-4 border-r border-slate-150 font-medium whitespace-nowrap text-slate-600">{tx.dateStr}</td>
                        <td className="py-2.5 px-4 border-r border-slate-150">
                          <div className="font-bold text-slate-900">
                            {tx.operation}
                            {tx.category && <span className="text-[10px] text-slate-400 font-semibold ml-2">[{tx.category}]</span>}
                          </div>
                          <div className="text-[11px] text-slate-500 font-normal italic mt-0.5">
                            {tx.comment || tx.parsed.comment || "—"}
                            {tx.isSplitMerged && (
                              <div className="text-[10px] text-slate-400 not-italic font-bold">
                                Спліт: {tx.splitDetailsText}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 border-r border-slate-150 text-right font-black text-slate-700 whitespace-nowrap">
                          {(() => {
                            const breakdown = getFulfillmentBreakdown(tx, currentCurrency);
                            if (breakdown.isFulfillment) {
                              const getSymbol = (c: string) => {
                                if (c === "USD" || c === "$") return "$";
                                if (c === "EUR" || c === "€") return "€";
                                if (c === "UAH" || c === "₴") return "₴";
                                return c || "";
                              };
                              const sym = getSymbol(breakdown.currency);
                              const sign1 = tx.isIncome ? "+" : "-";
                              const sign2 = tx.isIncome ? "+" : "-";
                              return `${sign1}${breakdown.principalSum.toFixed(2)}${sym} ${sign2} ${breakdown.interestSum.toFixed(2)}${sym} %`;
                            }
                            return `${tx.sum.toFixed(2)} ${symbol}`;
                          })()}
                        </td>
                        <td className="py-2.5 px-4 border-r border-slate-150 text-right whitespace-nowrap">
                          {formatDebtChange(tx, symbol)}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          {formatRunningDebt(tx.runningDebtBalance, symbol)}
                        </td>
                      </tr>
                    );
                  })}

                  {contractorTransactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400 font-bold bg-slate-50/20">
                        Не знайдено жодної транзакції по цьому контрагенту в поточній валюті.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Signatures placeholder block */}
          <div className="mt-16 pt-8 border-t border-dashed border-slate-200">
            <div className="flex justify-between text-xs font-bold text-slate-500">
              <div className="flex flex-col gap-12 w-5/12 text-left">
                <span>Від нашої сторони (Підпис):</span>
                <div className="border-b border-slate-300 w-full h-4" />
                <span className="text-[10px] text-slate-400 uppercase">М.П. / П.І.Б._______________________</span>
              </div>
              <div className="flex flex-col gap-12 w-5/12 text-left">
                <span>Від контрагента {contractorName} (Підпис):</span>
                <div className="border-b border-slate-300 w-full h-4" />
                <span className="text-[10px] text-slate-400 uppercase">М.П. / П.І.Б._______________________</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-scaleIn pb-10">
      {/* Header section */}
      <div className="flex items-center justify-between gap-3 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800/80">
        <div className="flex items-center gap-2">
          <button
            onClick={handleSequentialBack}
            className="p-2.5 bg-slate-950 border border-slate-800 hover:bg-slate-900 rounded-xl transition-all active:scale-95 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsPrintMode(true)}
            className="p-2.5 bg-slate-950 border border-slate-800 hover:bg-slate-900 hover:border-sky-500/30 text-sky-400 hover:text-sky-300 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 text-xs font-black cursor-pointer shadow-sm shadow-slate-950/20"
            title="Версія для друку"
          >
            <Printer className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="hidden sm:inline">Друк звіту</span>
          </button>
        </div>
        <div className="flex items-center gap-2.5 text-right min-w-0">
          <div className="flex flex-col min-w-0">
            <span className="text-lg md:text-xl font-black text-white truncate max-w-[240px] tracking-tight">
              {contractorName}
            </span>
          </div>
          <div className="w-10 h-10 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl flex items-center justify-center shrink-0 shadow-sm shadow-sky-500/5">
            <User className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Debt ledger balance status card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800/80 p-4.5 rounded-2xl flex flex-col gap-3 shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 -translate-y-1/4 translate-x-1/4 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Баланс взаєморозрахунків
          </span>
          {debtorStatus ? (
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
              debtorStatus.type === "oweUs" 
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : debtorStatus.type === "weOwe"
                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                  : "bg-slate-950 text-slate-500 border border-slate-800"
            }`}>
              {debtorStatus.label}
            </span>
          ) : (
            <span className="text-[9px] font-bold text-slate-600 italic">Поза реєстром боргів</span>
          )}
        </div>

        <div className="flex items-baseline gap-1.5 mt-1">
          <span className={`text-2xl font-black tracking-tight ${
            debtorStatus?.type === "oweUs" 
              ? "text-emerald-400" 
              : debtorStatus?.type === "weOwe" 
                ? "text-red-400" 
                : "text-white"
          }`}>
            {debtorStatus && debtorStatus.type !== "settled"
              ? `${debtorStatus.type === "oweUs" ? "" : "-"} ${debtorStatus.sum.toFixed(2)}`
              : "0.00"
            }
          </span>
          <span className="text-xs font-bold text-slate-500">
            {currentCurrency === "UAH" ? "₴" : currentCurrency === "USD" ? "$" : "€"}
          </span>
        </div>

        <p className="text-[11px] font-medium text-slate-400 leading-normal mb-1">
          {debtorStatus?.type === "oweUs" && "Він нам винен кошти за борговими операціями."}
          {debtorStatus?.type === "settled" && "Всі взаєморозрахунки повністю закриті. Баланс нульовий."}
          {!debtorStatus && "Немає активних боргових зобов'язань у таблиці для цього імені."}
        </p>

        {/* Balances by currency */}
        <div className="mt-1 pt-3.5 border-t border-slate-800/60 flex flex-col gap-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Баланси за валютами:
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(["UAH", "USD", "EUR"] as const).map(cur => {
              const d = multiCurrencyDebts[cur];
              const symbol = cur === "UAH" ? "₴" : cur === "USD" ? "$" : "€";
              const isOweUs = d.type === "oweUs";
              const isWeOwe = d.type === "weOwe";
              const isSettled = d.type === "settled";
              
              let valColor = "text-slate-400";
              let prefix = "";
              if (isOweUs) {
                valColor = "text-emerald-400 font-extrabold";
                prefix = "+";
              } else if (isWeOwe) {
                valColor = "text-red-400 font-extrabold";
                prefix = "-";
              }

              return (
                <div key={cur} className="bg-slate-950/45 border border-slate-900/80 p-2 rounded-xl flex flex-col gap-0.5 min-w-0">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex items-center justify-between">
                    <span>{cur}</span>
                    {isOweUs && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />}
                    {isWeOwe && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-sm shadow-red-500/50" />}
                  </span>
                  <span className={`text-xs truncate ${valColor}`} title={`${prefix}${d.sum.toFixed(2)} ${symbol}`}>
                    {d.type !== "none" && d.type !== "settled" ? `${prefix}${d.sum.toFixed(2)}` : "0.00"}
                    <span className="text-[10px] font-normal text-slate-500 ml-0.5">{symbol}</span>
                  </span>
                  <span className="text-[8px] font-medium text-slate-500 truncate">
                    {isOweUs ? "Він винен" : isWeOwe ? "Ми винні" : isSettled ? "Закрито" : "Немає"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Total combined converted debt block */}
        <div className="mt-1.5 pt-3.5 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              Сумарний борг (усі валюти):
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className={`text-xl font-black tracking-tight ${
                totalSumInSelectedCurrency > 0.005 
                  ? "text-emerald-400" 
                  : totalSumInSelectedCurrency < -0.005 
                    ? "text-red-400" 
                    : "text-white"
              }`}>
                {totalSumInSelectedCurrency > 0.005 ? "+" : ""}
                {totalSumInSelectedCurrency.toFixed(2)}
              </span>
              <span className="text-xs font-bold text-slate-400">
                {totalDisplayCurrency === "UAH" ? "₴" : totalDisplayCurrency === "USD" ? "$" : "€"}
              </span>
            </div>
          </div>

          {/* Currency switcher buttons */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/80 self-start sm:self-center gap-1">
            {(["UAH", "USD", "EUR"] as const).map(cur => (
              <button
                key={cur}
                type="button"
                onClick={() => setTotalDisplayCurrency(cur)}
                className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer select-none ${
                  totalDisplayCurrency === cur
                    ? "bg-slate-800 text-sky-400 border border-slate-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-300 border border-transparent"
                }`}
              >
                {cur}
              </button>
            ))}
          </div>
        </div>

        {/* Quick Debt Action Shortcuts */}
        <div className="grid grid-cols-2 gap-2.5 pt-3.5 border-t border-slate-800/60">
          <button
            type="button"
            onClick={() => onAddIncome?.("Повернули борг/позичили мені", contractorName)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm shadow-emerald-950/20"
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Беремо в борг</span>
          </button>
          <button
            type="button"
            onClick={() => onAddExpense?.("Повертаю борг/позичаю комусь", contractorName)}
            className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 text-red-400 rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-sm shadow-red-950/20"
          >
            <TrendingDown className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>Віддаємо борг</span>
          </button>
        </div>
      </div>

      {/* Cash Flow Summary Card ("Звідки взялося, куди пішло") */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            📊 Оборот та розшифровка грошового руху
          </span>
          <span className="text-[10px] font-semibold text-slate-500">
            {contractorTransactions.length} операцій
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Incoming block */}
          <div 
            onClick={() => setFlowFilter(prev => prev === "income" ? "all" : "income")}
            className={`cursor-pointer rounded-xl p-3 flex flex-col gap-1.5 transition-all select-none border ${
              flowFilter === "income"
                ? "bg-emerald-950/20 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.12)] animate-pulseOnce"
                : "bg-slate-900/40 border-slate-800/50 hover:border-slate-700/80 hover:bg-slate-900/60"
            }`}
          >
            <span className="text-[9px] font-bold uppercase tracking-wider flex items-center justify-between gap-1 w-full">
              <span className="flex items-center gap-1 text-slate-400">
                <TrendingUp className="w-3 h-3 text-emerald-400" />
                Прийшло (Звідки)
              </span>
              {flowFilter === "income" && (
                <span className="text-[8px] font-black bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-1 py-0.2 rounded-md scale-95 leading-none">
                  АКТИВНО
                </span>
              )}
            </span>
            <span className="text-base font-black text-emerald-400">
              +{stats.totalIn.toFixed(2)} {activeSymbol}
            </span>
          </div>

          {/* Outgoing block */}
          <div 
            onClick={() => setFlowFilter(prev => prev === "expense" ? "all" : "expense")}
            className={`cursor-pointer rounded-xl p-3 flex flex-col gap-1.5 transition-all select-none border ${
              flowFilter === "expense"
                ? "bg-red-950/20 border-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.12)] animate-pulseOnce"
                : "bg-slate-900/40 border-slate-800/50 hover:border-slate-700/80 hover:bg-slate-900/60"
            }`}
          >
            <span className="text-[9px] font-bold uppercase tracking-wider flex items-center justify-between gap-1 w-full">
              <span className="flex items-center gap-1 text-slate-400">
                <TrendingDown className="w-3 h-3 text-red-400" />
                Пішло (Куди)
              </span>
              {flowFilter === "expense" && (
                <span className="text-[8px] font-black bg-red-500/20 border border-red-500/30 text-red-400 px-1 py-0.2 rounded-md scale-95 leading-none">
                  АКТИВНО
                </span>
              )}
            </span>
            <span className="text-base font-black text-red-400">
              -{stats.totalOut.toFixed(2)} {activeSymbol}
            </span>
          </div>
        </div>
      </div>

      {/* Transaction Feed Search Panel */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center px-1">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
            Історія операцій ({filteredTransactions.length})
          </h3>
        </div>

        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Шукати в історії цього контрагента..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3.5 pl-10 text-xs font-bold text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-all"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="p-1 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white absolute right-3 top-1/2 -translate-y-1/2 transition-all"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-1">
          {/* Фільтр по категоріях */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider pl-1">
              Фільтр категорій
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800/80 rounded-xl py-2 px-2.5 text-[11px] font-bold text-slate-300 focus:outline-none focus:border-sky-500/50 transition-all cursor-pointer"
            >
              <option value="all">🏷️ Всі категорії</option>
              {uniqueCategories.map(cat => (
                <option key={cat} value={cat}>
                  🏷️ {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Сортування */}
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider pl-1">
              Сортування
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800/80 rounded-xl py-2 px-2.5 text-[11px] font-bold text-slate-300 focus:outline-none focus:border-sky-500/50 transition-all cursor-pointer"
            >
              <option value="date-desc">📅 Нові спочатку</option>
              <option value="date-asc">📅 Старі спочатку</option>
              <option value="category">🏷️ За категоріями</option>
              <option value="sum-desc">💰 Більші суми</option>
              <option value="sum-asc">💰 Менші суми</option>
            </select>
          </div>
        </div>
      </div>

      {/* Transaction List */}
      <div className="flex flex-col gap-4 sm:gap-4.5">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-10 text-slate-300 font-semibold bg-slate-900/80 rounded-2xl border border-dashed border-slate-600/80">
            {searchTerm ? "Нічого не знайдено за запитом" : "Не знайдено жодної транзакції з цим ім'ям"}
          </div>
        ) : (
          filteredTransactions.map((tx, idx) => {
            const directImg = getDirectImageUrl(tx.parsed.receiptUrl);
            const resolvedText = replaceBankKeysWithAliases(tx.rawContent, initData);
            const lines = resolvedText.split(/\s*(?:\r?\n|\|)\s*/).map(l => l.trim()).filter(Boolean);
            const isExpanded = !!expandedTxs[idx];

            return (
              <div
                key={idx}
                id={`tx-card-${idx}`}
                onClick={() => toggleTxExpanded(idx)}
                className={`p-4 flex flex-col gap-3 cursor-pointer transition-all rounded-2xl shadow-xl shadow-black/70 border-t border-r border-b ring-1 ring-white/10 ${
                  tx.isSplitMerged
                    ? "bg-[#181f33] border-l-[7px] border-l-indigo-400 border-slate-600 hover:border-indigo-400 hover:bg-[#1d263f] hover:ring-indigo-400/30"
                    : (tx.operation || "").includes("знижк") || (tx.operation || "").includes("борг")
                      ? "bg-[#1f2230] border-l-[7px] border-l-amber-400 border-slate-600 hover:border-amber-400 hover:bg-[#262a3a] hover:ring-amber-400/30"
                      : tx.isIncome
                        ? "bg-[#15231e] border-l-[7px] border-l-emerald-400 border-slate-600 hover:border-emerald-400 hover:bg-[#1b2d27] hover:ring-emerald-400/30"
                        : "bg-[#211a1d] border-l-[7px] border-l-rose-500 border-slate-600 hover:border-rose-400 hover:bg-[#2b2125] hover:ring-rose-400/30"
                }`}
              >
                {/* Header/Collapsed View */}
                <div className="flex justify-between items-start gap-3">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {(() => {
                        const op = tx.operation || "";
                        let badgeStyle = tx.isIncome 
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40" 
                          : "bg-red-500/20 text-red-300 border-red-400/40";
                        let label = op;

                        if (op.includes("Покупка зі знижкою в борг комусь")) {
                          badgeStyle = "bg-violet-500/25 text-violet-200 border-violet-400/40";
                          label = "📉 Покупка зі знижкою в борг комусь";
                        } else if (op.includes("Покупка зі знижкою в борг")) {
                          badgeStyle = "bg-rose-500/25 text-rose-200 border-rose-400/40";
                          label = "📉 Покупка зі знижкою в борг";
                        } else if (op.includes("Покупка") || op.includes("Витрата")) {
                          badgeStyle = "bg-red-500/20 text-red-300 border-red-400/40";
                          label = `🛍️ ${op}`;
                        } else if (op.includes("Повернули борг")) {
                          badgeStyle = "bg-emerald-500/20 text-emerald-300 border-emerald-400/40";
                          label = `💵 ${op}`;
                        } else if (op.includes("Повертаю борг")) {
                          badgeStyle = "bg-amber-500/25 text-amber-200 border-amber-400/40";
                          label = `💸 ${op}`;
                        } else if (tx.isIncome) {
                          label = `💰 ${op}`;
                        }

                        return (
                          <span className={`text-[9.5px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 border shadow-sm ${badgeStyle}`}>
                            {label}
                          </span>
                        );
                      })()}
                      <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-sky-400" /> {tx.dateStr}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3">
                    <div className="flex flex-col items-end text-right">
                      {/* Transaction amount */}
                      <span className={`text-base font-black whitespace-nowrap ${tx.isIncome ? "text-emerald-400" : "text-rose-400"}`}>
                        {(() => {
                          const breakdown = getFulfillmentBreakdown(tx, currentCurrency);
                          if (breakdown.isFulfillment) {
                            const getSymbol = (c: string) => {
                              if (c === "USD" || c === "$") return "$";
                              if (c === "EUR" || c === "€") return "€";
                              if (c === "UAH" || c === "₴") return "₴";
                              return c || "";
                            };
                            const sym = getSymbol(breakdown.currency);
                            const sign1 = tx.isIncome ? "+" : "-";
                            const sign2 = tx.isIncome ? "+" : "-";
                            return `${sign1}${breakdown.principalSum.toFixed(2)}${sym} ${sign2} ${breakdown.interestSum.toFixed(2)}${sym} %`;
                          }
                          const mainSign = tx.isIncome ? "+" : "-";
                          return `${mainSign}${tx.sum.toFixed(2)} ${activeSymbol}`;
                        })()}
                      </span>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-300 flex-shrink-0 mt-1" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
                    )}
                  </div>
                </div>

                {/* Always visible category & brief comment when collapsed */}
                {!isExpanded && (() => {
                  const cat = tx.category;
                  const rawComm = (tx.comment || tx.parsed?.comment || tx.parsed?.cleanDescription || "").trim();
                  let cleanComm = rawComm;
                  if (cat && cleanComm) {
                    const escapedCat = cat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    cleanComm = cleanComm.replace(new RegExp('^\\[?' + escapedCat + '\\]?\\s*', 'i'), '').trim();
                  }

                  if (!cat && !cleanComm) return null;

                  return (
                    <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[11px]">
                      {cat && (
                        <span className="text-[10px] font-black text-sky-300 bg-sky-950/80 border border-sky-600/50 px-2.5 py-0.5 rounded-md inline-flex items-center gap-1 shrink-0 shadow-sm">
                          🏷️ {cat}
                        </span>
                      )}
                      {cleanComm && (
                        <span className="text-[11px] text-slate-200 font-semibold break-words whitespace-normal bg-slate-850/80 px-2.5 py-1 rounded border border-slate-700/60 leading-tight">
                          {cleanComm}
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Expanded Detailed View */}
                {isExpanded && (() => {
                  const parsedMainContr = (tx.parsed?.contractor || "").trim();
                  const isReportContractorMain = parsedMainContr && isSameContractorName(parsedMainContr, contractorName);
                  
                  const cardDetails = tx.parsed?.cardDetails || "";
                  const parsedSplits: Array<{ sum: number; currency: string; target: string; isContractor: boolean; from?: string; to?: string }> = [];
                  if (cardDetails) {
                    const splitLines = cardDetails.split(/\r?\n/);
                    splitLines.forEach((sLine: string) => {
                      const arrowCount = (sLine.match(/➔/g) || []).length;
                      if (arrowCount === 1) {
                        const parts = sLine.split("➔");
                        if (parts.length === 2) {
                          const left = parts[0].trim();
                          const right = parts[1].trim();
                          
                          const leftParts = left.split(/\s+/);
                          const sumVal = parseFloat(leftParts[0].replace(",", ".")) || 0;
                          const currVal = leftParts[1] || "";
                          
                          let targetVal = right;
                          let isContrVal = false;
                          if (right.startsWith("👤")) {
                            targetVal = right.replace("👤", "").trim();
                            isContrVal = true;
                          } else if (right.startsWith("⏳")) {
                            targetVal = right.replace("⏳", "").trim();
                          }
                          parsedSplits.push({ sum: sumVal, currency: currVal, target: targetVal, isContractor: isContrVal });
                        }
                      } else if (arrowCount === 2) {
                        const parts = sLine.split("➔");
                        if (parts.length === 3) {
                          const left = parts[0].trim();
                          const mid = parts[1].trim();
                          const right = parts[2].trim();
                          
                          const leftParts = left.split(/\s+/);
                          const sumVal = parseFloat(leftParts[0].replace(",", ".")) || 0;
                          const currVal = leftParts[1] || "";
                          
                          const fromVal = mid.replace(/^(?:Взаємозалік:|Контрагент:)\s*/i, "").trim();
                          const toVal = right.replace("👤", "").trim();
                          
                          parsedSplits.push({ 
                            sum: sumVal, 
                            currency: currVal, 
                            target: toVal, 
                            isContractor: true,
                            from: fromVal,
                            to: toVal
                          });
                        }
                      }
                    });
                  }

                  const findOtherContractor = (txItem: any) => {
                    if (!initData || !initData.names) return null;
                    const textToSearch = (
                      (txItem.fullText || "") + " " + 
                      (txItem.comment || "") + " " + 
                      (txItem.parsed?.comment || "") + " " + 
                      (txItem.parsed?.cleanDescription || "") + " " + 
                      (txItem.rawContent || "")
                    ).toLowerCase();

                    // Sort names by length desc to prevent sub-name collisions
                    const sortedNames = [...initData.names].sort((a, b) => b.length - a.length);

                    for (const name of sortedNames) {
                      if (name.toLowerCase() === contractorName.toLowerCase()) continue;
                      
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

                  let sourceText = "";
                  let sourceIconType: "user" | "bank" = "user";
                  let destText = "";
                  let destIconType: "user" | "bank" = "user";

                  const opLower = (tx.operation || "").toLowerCase();
                  const commLower = (tx.comment || tx.rawContent || "").toLowerCase();
                  const fullLower = (tx.fullText || "").toLowerCase();
                  const cardDetailsLower = (tx.parsed?.cardDetails || "").toLowerCase();

                  const hasDebtSplit = 
                    (tx.splits && tx.splits.some((s: any) => s.bank && (s.bank.toLowerCase().includes("борг") || s.bank.includes("Реєстр боргів")))) ||
                    cardDetailsLower.includes("борг") ||
                    (tx.bank && tx.bank.toLowerCase().includes("борг"));

                  const isValidContractorName = (name: string | null | undefined): boolean => {
                    if (!name) return false;
                    const n = name.trim().toLowerCase();
                    if (!n) return false;
                    if (n === "ми" || n.includes("борг") || n.includes("реєстр")) return false;
                    if (/^\d+/.test(n) || /^\d+(?:[.,]\d+)?\s*(?:uah|usd|eur|грн|₴|\$|€)?$/i.test(n)) return false;
                    if (n.includes("банк") || n.includes("готівка") || n.includes("карта") || n.includes("счет") || n.includes("рахунок")) return false;
                    return true;
                  };

                  const getDebtContractorName = (txItem: any) => {
                    const cleanPart = (p: string) => p.replace(/👤/g, "").replace(/⏳/g, "").replace(/^(?:Взаємозалік:|Контрагент:|Борг:)\s*/i, "").trim();

                    if (txItem.parsed?.cardDetails) {
                      const lines = txItem.parsed.cardDetails.split("\n");
                      for (const line of lines) {
                        if (line.toLowerCase().includes("борг")) {
                          const parts = line.split("➔");
                          if (parts.length > 1) {
                            const lastPart = cleanPart(parts[parts.length - 1]);
                            if (isValidContractorName(lastPart)) {
                              return lastPart;
                            }
                            const firstPart = cleanPart(parts[0]);
                            if (isValidContractorName(firstPart)) {
                              return firstPart;
                            }
                          }
                        }
                      }
                    }

                    const checkSplits = (arr: any[]) => {
                      if (!arr || !Array.isArray(arr)) return null;
                      for (const s of arr) {
                        if (s.bank && (s.bank.includes("Реєстр боргів") || s.bank.toLowerCase().includes("борг"))) {
                          if (s.bank.startsWith("Реєстр боргів (")) {
                            const match = s.bank.match(/Реєстр боргів \(([^)]+)\)/);
                            if (match && isValidContractorName(match[1])) return match[1].trim();
                          }
                          if (isValidContractorName(s.to)) return s.to.trim();
                          if (isValidContractorName(s.target)) return s.target.trim();
                          if (isValidContractorName(s.contractor)) return s.contractor.trim();
                          if (isValidContractorName(s.from)) return s.from.trim();
                        }
                      }
                      return null;
                    };

                    const splitTarget = checkSplits(txItem.splits) || checkSplits(txItem.splitItems);
                    if (splitTarget) return splitTarget;

                    if (txItem.bank) {
                      if (txItem.bank.startsWith("Реєстр боргів (")) {
                        const match = txItem.bank.match(/Реєстр боргів \(([^)]+)\)/);
                        if (match && isValidContractorName(match[1])) return match[1].trim();
                      }
                    }

                    if (txItem.parsed?.cardDetails) {
                      const lines = txItem.parsed.cardDetails.split("\n");
                      for (const line of lines) {
                        const parts = line.split("➔");
                        if (parts.length > 1) {
                          const lastPart = cleanPart(parts[parts.length - 1]);
                          if (isValidContractorName(lastPart)) {
                            return lastPart;
                          }
                        }
                      }
                    }

                    return null;
                  };

                  let debtSplitFound = false;
                  let borrowedSum = Math.abs(tx.sum);

                  const txItemSum = Math.abs(tx.sum);
                  const debtContractorName = getDebtContractorName(tx);
                  const isContractorMatch = debtContractorName !== null 
                    ? isSameContractorName(debtContractorName, contractorName)
                    : (isReportContractorMain || (parsedSplits && parsedSplits.some(s => s.isContractor && isSameContractorName(s.target, contractorName))));

                  if (tx.splitItems && Array.isArray(tx.splitItems) && tx.splitItems.length > 0) {
                    const dSplit = tx.splitItems.find((s: any) => 
                      s.bank && (s.bank.includes("Реєстр боргів") || s.bank.toLowerCase().includes("борг")) &&
                      typeof s.sum === "number" && Math.abs(Math.abs(s.sum) - txItemSum) < 0.05
                    );
                    if (dSplit) {
                      debtSplitFound = true;
                      borrowedSum = Math.abs(dSplit.sum);
                    }
                  } else if (tx.splits && Array.isArray(tx.splits) && tx.splits.length > 0) {
                    const dSplit = tx.splits.find((s: any) => 
                      s.bank && (s.bank.includes("Реєстр боргів") || s.bank.toLowerCase().includes("борг")) &&
                      typeof s.sum === "number" && Math.abs(Math.abs(s.sum) - txItemSum) < 0.05
                    );
                    if (dSplit) {
                      debtSplitFound = true;
                      borrowedSum = Math.abs(dSplit.sum);
                    }
                  } else if (tx.parsed?.cardDetails) {
                    const lines = tx.parsed.cardDetails.split("\n");
                    for (const line of lines) {
                      const lineLower = line.toLowerCase();
                      if (lineLower.includes("борг") || lineLower.includes("реєстр боргів")) {
                        const match = line.match(/(-?\d+(?:[.,]\d+)?)\s*(?:UAH|USD|EUR|₴|\$|€)?/i);
                        if (match) {
                          const val = parseFloat(match[1].replace(",", "."));
                          if (!isNaN(val) && Math.abs(Math.abs(val) - txItemSum) < 0.05) {
                            debtSplitFound = true;
                            borrowedSum = Math.abs(val);
                            break;
                          }
                        }
                      }
                    }
                  } else {
                    const isRepaymentOrReturn = 
                      opLower.includes("повернули") || 
                      opLower.includes("повернення") || 
                      opLower.includes("повертаю") ||
                      commLower.includes("повернули") ||
                      commLower.includes("повернення") ||
                      commLower.includes("повертаю") ||
                      commLower.includes("скинула") ||
                      commLower.includes("аванс");

                    const isBorrowingOp = 
                      opLower.includes("беремо в борг") || 
                      opLower.includes("взяв в борг") || 
                      opLower.includes("взяли в борг") ||
                      (opLower.includes("позичили мені") && !isRepaymentOrReturn);

                    if (
                      (isBorrowingOp || (tx.bank && (tx.bank.includes("Реєстр боргів") || tx.bank.toLowerCase().includes("борг")))) &&
                      !isRepaymentOrReturn &&
                      isContractorMatch
                    ) {
                      debtSplitFound = true;
                      borrowedSum = txItemSum;
                    }
                  }

                  const showBorrowingInfo = debtSplitFound && borrowedSum > 0 && isContractorMatch;

                  const otherContractor = findOtherContractor(tx);

                  if (isReportContractorMain) {
                    if (tx.isIncome) {
                      sourceText = contractorName;
                      sourceIconType = "user";

                      if (otherContractor) {
                        destText = otherContractor;
                        destIconType = "user";
                      } else if (parsedSplits.length > 0) {
                        destText = parsedSplits.map(s => s.isContractor ? `👤 ${s.target}` : replaceBankKeysWithAliases(s.target, initData)).join(" + ");
                        destIconType = parsedSplits.some(s => s.isContractor) ? "user" : "bank";
                      } else {
                        const bankName = replaceBankKeysWithAliases(tx.bank, initData);
                        if (bankName === "Реєстр боргів") {
                          destText = "Ми";
                          destIconType = "user";
                        } else {
                          destText = bankName;
                          destIconType = "bank";
                        }
                      }
                    } else {
                      if (otherContractor) {
                        sourceText = otherContractor;
                        sourceIconType = "user";
                      } else if (parsedSplits.length > 0) {
                        sourceText = parsedSplits.map(s => s.isContractor ? `👤 ${s.target}` : replaceBankKeysWithAliases(s.target, initData)).join(" + ");
                        sourceIconType = parsedSplits.some(s => s.isContractor) ? "user" : "bank";
                      } else {
                        const bankName = replaceBankKeysWithAliases(tx.bank, initData);
                        if (bankName === "Реєстр боргів") {
                          sourceText = "Ми";
                          sourceIconType = "user";
                        } else {
                          sourceText = bankName;
                          sourceIconType = "bank";
                        }
                      }

                      destText = contractorName;
                      destIconType = "user";
                    }
                  } else {
                    // This contractor is a split recipient or sender! Let's find their split
                    const foundSplit = parsedSplits.find(s => 
                      s.isContractor && 
                      ((s.from && isSameContractorName(s.from, contractorName)) || 
                       (s.to && isSameContractorName(s.to, contractorName)))
                    );

                    if (foundSplit) {
                      sourceText = foundSplit.from || "—";
                      sourceIconType = "user";

                      destText = foundSplit.to || "—";
                      destIconType = "user";
                    } else {
                      if (tx.isIncome) {
                        sourceText = parsedMainContr || "—";
                        sourceIconType = "user";

                        destText = contractorName;
                        destIconType = "user";
                      } else {
                        sourceText = contractorName;
                        sourceIconType = "user";

                        destText = parsedMainContr || "—";
                        destIconType = "user";
                      }
                    }
                  }

                  // borrowedSum is already computed above

                  return (
                    <div 
                      id={`tx-details-${idx}`}
                      onClick={(e) => e.stopPropagation()} // prevent row toggle when clicking inside details
                      className="mt-2 pt-2.5 border-t border-slate-800/80 flex flex-col gap-2 text-xs text-slate-300 animate-fadeIn"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 shadow-inner">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Сума</span>
                          <span className={`font-black text-sm ${tx.isIncome ? "text-emerald-400" : "text-red-400"} whitespace-nowrap`}>
                            {(() => {
                              const breakdown = getFulfillmentBreakdown(tx, currentCurrency);
                              if (breakdown.isFulfillment) {
                                const getSymbol = (c: string) => {
                                  if (c === "USD" || c === "$") return "$";
                                  if (c === "EUR" || c === "€") return "€";
                                  if (c === "UAH" || c === "₴") return "₴";
                                  return c || "";
                                };
                                const sym = getSymbol(breakdown.currency);
                                const sign1 = tx.isIncome ? "+" : "-";
                                const sign2 = tx.isIncome ? "+" : "-";
                                return `${sign1}${breakdown.principalSum.toFixed(2)}${sym} ${sign2} ${breakdown.interestSum.toFixed(2)}${sym} %`;
                              }
                              return `${tx.sum.toFixed(2)} ${activeSymbol}`;
                            })()}
                          </span>
                        </div>

                        {showBorrowingInfo ? (
                          <div className="sm:col-span-2 flex flex-col gap-0.5 justify-center">
                            <span className="text-[9px] font-bold text-amber-500/80 uppercase tracking-wider">Інформація</span>
                            <div className="flex items-center gap-1.5 font-bold text-amber-300 text-xs">
                              <User className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                              <span>
                                Я взяв в борг {borrowedSum.toFixed(2)} {activeSymbol}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Звідки пришли</span>
                              <div className="flex items-center gap-1 font-bold text-slate-300">
                                {sourceIconType === "user" ? (
                                  <User className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                ) : (
                                  <CreditCard className="w-3 h-3 text-sky-400 flex-shrink-0" />
                                )}
                                <span>{renderContractorLink(sourceText, sourceIconType)}</span>
                              </div>
                            </div>

                            <div className="flex flex-col gap-0.5">
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Куди пішли</span>
                              <div className="flex items-center gap-1 font-bold text-slate-300">
                                {destIconType === "user" ? (
                                  <User className="w-3 h-3 text-red-400 flex-shrink-0" />
                                ) : (
                                  <CreditCard className="w-3 h-3 text-sky-400 flex-shrink-0" />
                                )}
                                <span>{renderContractorLink(destText, destIconType)}</span>
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Category and Comment combined */}
                      <div className="bg-slate-900/10 p-2 rounded-lg border border-slate-900/40 flex flex-col gap-1.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Категорія</span>
                          <span className="font-bold text-sky-400 text-xs">
                            🏷️ {tx.category || "Без категорії"}
                          </span>
                        </div>
                        <div className="border-t border-slate-800/20 pt-1.5 flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Коментар</span>
                          <p className="text-xs font-semibold text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
                            {renderTextWithContractors(tx.comment || tx.parsed.comment || tx.parsed.cleanDescription || "Коментар відсутній")}
                          </p>
                        </div>
                      </div>

                      {/* Split Breakdown details if merged or has cardDetails */}
                      {((tx.isSplitMerged && tx.splitDetailsText) || tx.parsed?.cardDetails) && (
                        <div className="bg-[#1a1b36] p-3 rounded-xl border border-indigo-500/60 shadow-lg shadow-black/60 ring-1 ring-indigo-400/30 flex flex-col gap-2 my-1.5">
                          <span className="text-[9.5px] font-black text-indigo-200 uppercase tracking-wider flex items-center gap-1.5 bg-indigo-950/90 border border-indigo-500/50 px-2.5 py-1 rounded-md w-fit shadow-sm">
                            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                            Розподіл платежу за цією операцією
                          </span>
                          <div className="text-xs font-semibold text-indigo-200 flex flex-col gap-1.5">
                            {tx.isSplitMerged && tx.splitItems ? (
                              tx.splitItems.map((sItem, sIdx) => {
                                const arrowElem = <span className="text-slate-600 font-extrabold text-[10px] mx-0.5 select-none">➔</span>;
                                
                                let fromNode = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800/80 border border-slate-700/60 text-slate-300 rounded text-[10px] font-bold">Ми</span>;
                                let toNode = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800/80 border border-slate-700/60 text-slate-300 rounded text-[10px] font-bold">Ми</span>;

                                // Extract the contractor for this split item sItem
                                let sContractor: string | null = null;
                                if (sItem.bank && sItem.bank.startsWith("Реєстр боргів (")) {
                                  const match = sItem.bank.match(/Реєстр боргів \(([^)]+)\)/);
                                  if (match) {
                                    sContractor = match[1].trim();
                                  }
                                } else if (sItem.bank && (sItem.bank.includes("Реєстр боргів") || sItem.bank.toLowerCase().includes("борг"))) {
                                  sContractor = sItem.to || sItem.target || sItem.contractor || tx.contractor || null;
                                }

                                const isLedgerSplit = sContractor !== null;
                                const rowSum = Math.abs(sItem.sum);
                                const txSum = Math.abs(tx.sum);
                                const isAmountMatched = txSum > 0 && Math.abs(rowSum - txSum) < 0.01;
                                const isSingleSplit = tx.splitItems ? tx.splitItems.length === 1 : false;

                                const isRowMatched = isSingleSplit || (isAmountMatched && (
                                  (isLedgerSplit && isSameContractorName(sContractor, contractorName)) ||
                                  sItem.bank.includes("Реєстр боргів") ||
                                  isReportContractorMain ||
                                  !sContractor
                                ));
                                const isFromMatched = isLedgerSplit && isSameContractorName(sContractor, contractorName) && sItem.isIncome;
                                const isToMatched = isLedgerSplit && isSameContractorName(sContractor, contractorName) && !sItem.isIncome;

                                const highlightStyle = "bg-amber-500/30 border-amber-400 text-white ring-2 ring-amber-400/40 font-black";

                                if (isLedgerSplit) {
                                  if (sItem.isIncome) {
                                    fromNode = <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 ${isFromMatched ? highlightStyle : 'bg-sky-950/70 border border-sky-500/40 text-sky-300'} rounded text-[10px] font-bold transition-all`}>👤 {sContractor}</span>;
                                    toNode = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-950/40 border border-amber-500/20 text-amber-300 rounded text-[10px] font-bold">👤 Ми</span>;
                                  } else {
                                    fromNode = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-950/40 border border-amber-500/20 text-amber-300 rounded text-[10px] font-bold">👤 Ми</span>;
                                    toNode = <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 ${isToMatched ? highlightStyle : 'bg-sky-950/70 border border-sky-500/40 text-sky-300'} rounded text-[10px] font-bold transition-all`}>👤 {sContractor}</span>;
                                  }
                                } else {
                                  fromNode = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-950/40 border border-amber-500/20 text-amber-300 rounded text-[10px] font-bold">👤 Ми</span>;
                                  toNode = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-950/40 border border-amber-500/20 text-amber-300 rounded text-[10px] font-bold">👤 Ми</span>;
                                }

                                const displayBName = replaceBankKeysWithAliases(sItem.bank, initData);
                                const isDebt = sItem.bank.includes("Реєстр боргів");
                                const colorClass = isDebt ? "text-indigo-400" : (sItem.isIncome ? "text-emerald-400" : "text-red-400");
                                const cleanAmtText = sItem.isIncome ? `+${sItem.sum.toFixed(2)}` : `-${sItem.sum.toFixed(2)}`;

                                const splitRowBg = isRowMatched
                                  ? "bg-amber-500/20 border-2 border-amber-400/80 rounded-xl px-2 py-1.5 shadow-md shadow-amber-500/20 ring-2 ring-amber-400/50 scale-[1.02]"
                                  : "py-1 border-b border-indigo-500/10 last:border-0";

                                return (
                                  <div key={sIdx} className={`flex flex-wrap items-center gap-1 md:gap-1.5 min-w-0 transition-all duration-300 ${splitRowBg}`}>
                                    {fromNode}
                                    {arrowElem}
                                    <div className="flex flex-col items-center justify-center px-1.5 py-0.5 bg-slate-900/90 border border-slate-800 rounded min-w-[65px] text-center select-none">
                                      <span className={`text-[9px] md:text-[10px] font-black tracking-wide ${colorClass}`}>
                                        {cleanAmtText}
                                      </span>
                                      <span className="text-[7px] md:text-[8px] text-slate-400 font-extrabold uppercase tracking-wider whitespace-nowrap">
                                        {isDebt ? "Борг ⏳" : displayBName}
                                      </span>
                                    </div>
                                    {arrowElem}
                                    {toNode}
                                  </div>
                                );
                              })
                            ) : tx.isSplitMerged && tx.splitDetailsText ? (
                              <span>{tx.splitDetailsText}</span>
                            ) : (() => {
                              const cardLines = tx.parsed?.cardDetails?.split("\n") || [];
                              const cardArrowLines = cardLines.filter(l => l.includes("➔"));
                              const isSingleLine = cardArrowLines.length <= 1;

                              return cardLines.map((line, lIdx) => {
                                const arrowIdx = line.indexOf("➔");
                                if (arrowIdx === -1) {
                                  const isReversePlanned = line.includes("Реверс запланованого");
                                  if (isReversePlanned) {
                                    let label = "⚙️ Реверс запланованого";
                                    try {
                                      const jsonMatch = line.match(/\{.*\}/);
                                      if (jsonMatch) {
                                        const backupItem = JSON.parse(jsonMatch[0]);
                                        if (backupItem && backupItem.name) {
                                          label = `⚙️ Реверс запланованого: "${backupItem.name}"`;
                                        }
                                      }
                                    } catch (e) {
                                      console.error("Error parsing reverse planned item", e);
                                    }
                                    return (
                                      <div key={lIdx} className="flex items-center gap-1.5 py-1 text-slate-400 font-semibold">
                                        <span>⚙️</span>
                                        <span>{label.replace(/^⚙️\s*/, "")}</span>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div key={lIdx} className="flex items-center gap-1.5">
                                      <span>💳</span>
                                      <span>{replaceBankKeysWithAliases(line, initData)}</span>
                                    </div>
                                  );
                                }

                                const amountPart = line.substring(0, arrowIdx).trim();
                                const actionPart = line.substring(arrowIdx + 1).trim();

                                let accountLabel = actionPart;
                                let isDebt = false;
                                let isContractorSplit = false;
                                let contractorFrom = "";
                                let contractorTo = "";

                                if (
                                  line.toLowerCase().includes("записано в борг") || 
                                  line.toLowerCase().includes("записалися в борг") ||
                                  amountPart.toLowerCase().includes("борг") ||
                                  actionPart.toLowerCase().includes("борг")
                                ) {
                                  isDebt = true;
                                  accountLabel = "Борг ⏳";
                                } else if (line.toLowerCase().includes("взаємозалік") || line.toLowerCase().includes("контрагент")) {
                                  isContractorSplit = true;
                                  const fullMatch = line.match(/(?:Взаємозалік|Контрагент):\s*([^\n➔]+)\s*➔\s*👤?\s*([^\n👤➔\n|]+)/i);
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
                                
                                let fromNode = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800/80 border border-slate-700/60 text-slate-300 rounded text-[10px] font-bold">Ми</span>;
                                let toNode = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-800/80 border border-slate-700/60 text-slate-300 rounded text-[10px] font-bold">Ми</span>;

                                let displayBName = replaceBankKeysWithAliases(accountLabel, initData);
                                let colorClass = tx.isIncome ? "text-emerald-400" : "text-red-400";

                                if (isDebt) {
                                  displayBName = "Борг ⏳";
                                  colorClass = "text-indigo-400";
                                } else if (isContractorSplit && contractorFrom && contractorTo) {
                                  displayBName = replaceBankKeysWithAliases(accountLabel, initData);
                                }

                                const isFromMatched = isContractorSplit
                                  ? (contractorFrom && isSameContractorName(contractorFrom, contractorName))
                                  : (tx.isIncome && isReportContractorMain);

                                const isToMatched = isContractorSplit
                                  ? (contractorTo && isSameContractorName(contractorTo, contractorName))
                                  : (!tx.isIncome && isReportContractorMain);

                                const cleanAmtVal = parseFloat(amountPart.replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
                                const txSum = Math.abs(tx.sum);
                                const isAmountMatched = cleanAmtVal > 0 && txSum > 0 && Math.abs(cleanAmtVal - txSum) < 0.01;

                                const isContractorMatched = isContractorSplit
                                  ? ((contractorFrom && isSameContractorName(contractorFrom, contractorName)) ||
                                     (contractorTo && isSameContractorName(contractorTo, contractorName)))
                                  : (isDebt || isReportContractorMain);

                                const isRowMatched = isSingleLine || (isAmountMatched && isContractorMatched);

                                const highlightStyle = "bg-amber-500/30 border-amber-400 text-white ring-2 ring-amber-400/40 font-black";

                                if (tx.isIncome) {
                                  fromNode = <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 ${isFromMatched ? highlightStyle : 'bg-sky-950/70 border border-sky-500/40 text-sky-300'} rounded text-[10px] font-bold transition-all`}>👤 {parsedMainContr || "—"}</span>;
                                  toNode = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-950/40 border border-amber-500/20 text-amber-300 rounded text-[10px] font-bold">👤 Ми</span>;
                                } else {
                                  fromNode = <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-950/40 border border-amber-500/20 text-amber-300 rounded text-[10px] font-bold">👤 Ми</span>;
                                  toNode = <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 ${isToMatched ? highlightStyle : 'bg-sky-950/70 border border-sky-500/40 text-sky-300'} rounded text-[10px] font-bold transition-all`}>👤 {parsedMainContr || "—"}</span>;
                                }

                                if (isContractorSplit && contractorFrom && contractorTo) {
                                  const isFromMe = contractorFrom.toLowerCase() === "ми";
                                  const isToMe = contractorTo.toLowerCase() === "ми";
                                  fromNode = isFromMe ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-950/40 border border-amber-500/20 text-amber-300 rounded text-[10px] font-bold">👤 Ми</span>
                                  ) : (
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 ${isFromMatched ? highlightStyle : 'bg-sky-950/70 border border-sky-500/40 text-sky-300'} rounded text-[10px] font-bold transition-all`}>👤 {contractorFrom}</span>
                                  );
                                  toNode = isToMe ? (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-950/40 border border-amber-500/20 text-amber-300 rounded text-[10px] font-bold">👤 Ми</span>
                                  ) : (
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 ${isToMatched ? highlightStyle : 'bg-sky-950/70 border border-sky-500/40 text-sky-300'} rounded text-[10px] font-bold transition-all`}>👤 {contractorTo}</span>
                                  );
                                }

                                const cleanAmtText = tx.isIncome 
                                  ? (amountPart.startsWith("+") ? amountPart : "+" + amountPart)
                                  : (amountPart.startsWith("-") ? amountPart : "-" + amountPart);

                                const splitRowBg = isRowMatched
                                  ? "bg-amber-500/20 border-2 border-amber-400/80 rounded-xl px-2 py-1.5 shadow-md shadow-amber-500/20 ring-2 ring-amber-400/50 scale-[1.02]"
                                  : "py-1 border-b border-indigo-500/10 last:border-0";

                                return (
                                  <div key={lIdx} className={`flex flex-wrap items-center gap-1 md:gap-1.5 min-w-0 transition-all duration-300 ${splitRowBg}`}>
                                    {fromNode}
                                    {arrowElem}
                                    <div className={`flex flex-col items-center justify-center px-1.5 py-0.5 bg-slate-900/90 border border-slate-800 rounded min-w-[65px] text-center select-none`}>
                                      <span className={`text-[9px] md:text-[10px] font-black tracking-wide ${colorClass}`}>
                                        {cleanAmtText}
                                      </span>
                                      <span className="text-[7px] md:text-[8px] text-slate-400 font-extrabold uppercase tracking-wider whitespace-nowrap">
                                        {replaceBankKeysWithAliases(displayBName, initData)}
                                      </span>
                                    </div>
                                    {arrowElem}
                                    {toNode}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Attached Image Thumbnail */}
                      {directImg && (
                        <div className="relative mt-1 rounded-xl overflow-hidden border border-slate-800 w-full max-h-56 bg-slate-950 flex items-center justify-center group">
                          <img
                            src={directImg}
                            alt="Чек"
                            className="w-full h-auto max-h-56 object-cover cursor-pointer hover:scale-[1.01] transition-transform"
                            referrerPolicy="no-referrer"
                            onClick={() => setLightboxImage(directImg)}
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <span className="text-[10px] font-black text-white uppercase tracking-wider bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800">
                              🔍 Відкрити чек
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}

      </div>

      {/* Full-screen lightbox for image attachments */}
      {lightboxImage && (
        <div className="fixed inset-0 bg-black/95 z-50 flex flex-col items-center justify-center p-4">
          <button
            onClick={() => setLightboxImage(null)}
            className="absolute top-4 right-4 p-3 bg-slate-900 hover:bg-slate-800 text-white rounded-full transition-all border border-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxImage}
            alt="Повний чек"
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </div>
  );
};
