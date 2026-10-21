import React, { useState, useMemo } from "react";
import { 
  FileSpreadsheet, 
  Printer, 
  Copy, 
  Check, 
  Coins, 
  Landmark, 
  Users, 
  ShieldCheck, 
  Wallet, 
  Search, 
  Calculator,
  UserCheck,
  Download,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { InitData, HistoryGroup, MonthlyReportItem } from "../types";
import { parseTransactionText } from "../lib/transactionUtils";

interface ComprehensiveReportViewProps {
  initData: InitData | null;
  historyGroups: HistoryGroup[];
  monthlyReports: MonthlyReportItem[];
  rateUsd: string;
  rateUsdSell?: string;
  rateEur: string;
  rateEurSell?: string;
  rateSource: string;
  currentCurrency: "UAH" | "USD" | "EUR";
  onBack: () => void;
  onSelectContractor?: (name: string) => void;
}

export const ComprehensiveReportView: React.FC<ComprehensiveReportViewProps> = ({
  initData,
  historyGroups,
  monthlyReports,
  rateUsd,
  rateUsdSell,
  rateEur,
  rateEurSell,
  rateSource,
  currentCurrency,
  onBack,
  onSelectContractor
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [contractorTabFilter, setContractorTabFilter] = useState<"all" | "oweUs" | "weOwe">("all");
  const [copiedType, setCopiedType] = useState<"short" | "full" | null>(null);
  const [isSection1TableOpen, setIsSection1TableOpen] = useState(false);
  const [isSection2Open, setIsSection2Open] = useState(false);

  // Exact Exchange Rates
  const rUsd = parseFloat(rateUsd) || 0;
  const rEur = parseFloat(rateEur) || 0;
  const rUsdSellCalculated = parseFloat(rateUsdSell || rateUsd) || rUsd;
  const rEurSellCalculated = parseFloat(rateEurSell || rateEur) || rEur;

  // Real-world Kantor conversion logic
  const convertBalance = (amount: number, from: string, to: string): number => {
    if (from === to) return amount;
    if (!amount) return 0;
    
    if (amount >= 0) {
      let uahAmount = 0;
      if (from === "UAH") uahAmount = amount;
      else if (from === "USD") uahAmount = amount * rUsd;
      else if (from === "EUR") uahAmount = amount * rEur;

      if (to === "UAH") return uahAmount;
      else if (to === "USD") return rUsdSellCalculated > 0 ? uahAmount / rUsdSellCalculated : 0;
      else if (to === "EUR") return rEurSellCalculated > 0 ? uahAmount / rEurSellCalculated : 0;
    } else {
      const absAmount = Math.abs(amount);
      let uahNeeded = 0;
      if (from === "UAH") uahNeeded = absAmount;
      else if (from === "USD") uahNeeded = absAmount * rUsdSellCalculated;
      else if (from === "EUR") uahNeeded = absAmount * rEurSellCalculated;

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

  // Memoized reading of cached initData for non-active currencies
  const uahData = React.useMemo(() => {
    if (currentCurrency === "UAH" && initData) return initData;
    try {
      const cached = localStorage.getItem("cached_init_data_UAH");
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn("Failed reading cached_init_data_UAH", e);
    }
    return null;
  }, [currentCurrency, initData]);

  const usdData = React.useMemo(() => {
    if (currentCurrency === "USD" && initData) return initData;
    try {
      const cached = localStorage.getItem("cached_init_data_USD");
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn("Failed reading cached_init_data_USD", e);
    }
    return null;
  }, [currentCurrency, initData]);

  const eurData = React.useMemo(() => {
    if (currentCurrency === "EUR" && initData) return initData;
    try {
      const cached = localStorage.getItem("cached_init_data_EUR");
      if (cached) return JSON.parse(cached);
    } catch (e) {
      console.warn("Failed reading cached_init_data_EUR", e);
    }
    return null;
  }, [currentCurrency, initData]);

  // Helper to resolve custom alias for bank keys
  const getBankAlias = (bankKey: string, currency: "UAH" | "USD" | "EUR") => {
    const aliasMap = initData?.allAliases?.[currency] || uahData?.allAliases?.[currency];
    if (aliasMap && aliasMap[bankKey]) {
      return aliasMap[bankKey];
    }
    return bankKey;
  };

  // 1. Exact mathematical formulas for Net Capital per currency matching the application logic:
  // Capital(C) = Cash(C) + Banks(C) + Debtors(C) - Creditors(C)
  const uahCash = initData?.allCashBalances?.UAH ?? uahData?.allCashBalances?.UAH ?? 0;
  const usdCash = initData?.allCashBalances?.USD ?? usdData?.allCashBalances?.USD ?? 0;
  const eurCash = initData?.allCashBalances?.EUR ?? eurData?.allCashBalances?.EUR ?? 0;

  // Bank balances helper functions
  const getBankVal = (curData: InitData | null, cur: "UAH" | "USD" | "EUR", bankKey: string) => {
    return curData?.allBankDetails?.[cur]?.[bankKey as keyof typeof curData.allBankDetails.UAH] || 0;
  };

  const getBankTotal = (curData: InitData | null, cur: "UAH" | "USD" | "EUR") => {
    const b = curData?.allBankDetails?.[cur];
    if (!b) return 0;
    return (b["Банк 1"] || 0) + (b["Банк 2"] || 0) + (b["Банк 3"] || 0) + (b["Банк 4"] || 0) + (b["Банк 5"] || 0);
  };

  const uahBanksTotal = initData?.allBankDetails?.UAH ? getBankTotal(initData, "UAH") : getBankTotal(uahData, "UAH");
  const usdBanksTotal = initData?.allBankDetails?.USD ? getBankTotal(initData, "USD") : getBankTotal(usdData, "USD");
  const eurBanksTotal = initData?.allBankDetails?.EUR ? getBankTotal(initData, "EUR") : getBankTotal(eurData, "EUR");

  // Debtors (oweUs) and Creditors (weOwe) totals per currency
  const oweUsTotals = initData?.oweUsTotals || { 
    UAH: uahData?.oweUsTotals?.UAH ?? 0, 
    USD: usdData?.oweUsTotals?.USD ?? 0, 
    EUR: eurData?.oweUsTotals?.EUR ?? 0 
  };

  const weOweTotals = initData?.weOweTotals || { 
    UAH: uahData?.weOweTotals?.UAH ?? 0, 
    USD: usdData?.weOweTotals?.USD ?? 0, 
    EUR: eurData?.weOweTotals?.EUR ?? 0 
  };

  const uahOwnFunds = uahCash + uahBanksTotal;
  const usdOwnFunds = usdCash + usdBanksTotal;
  const eurOwnFunds = eurCash + eurBanksTotal;

  const uahCurrencyNetDebts = oweUsTotals.UAH - weOweTotals.UAH;
  const usdCurrencyNetDebts = oweUsTotals.USD - weOweTotals.USD;
  const eurCurrencyNetDebts = oweUsTotals.EUR - weOweTotals.EUR;

  // Strict app formula: Capital = Own Funds (Cash + Banks) + Net Debtors (Debtors - Creditors)
  const uahNetWorth = uahOwnFunds + uahCurrencyNetDebts;
  const usdNetWorth = usdOwnFunds + usdCurrencyNetDebts;
  const eurNetWorth = eurOwnFunds + eurCurrencyNetDebts;

  // Total Combined Net Capital in UAH, USD, EUR simultaneously
  const totalNetWorthInUah = 
    convertBalance(uahNetWorth, "UAH", "UAH") + 
    convertBalance(usdNetWorth, "USD", "UAH") + 
    convertBalance(eurNetWorth, "EUR", "UAH");

  const totalNetWorthInUsd = 
    convertBalance(uahNetWorth, "UAH", "USD") + 
    convertBalance(usdNetWorth, "USD", "USD") + 
    convertBalance(eurNetWorth, "EUR", "USD");

  const totalNetWorthInEur = 
    convertBalance(uahNetWorth, "UAH", "EUR") + 
    convertBalance(usdNetWorth, "USD", "EUR") + 
    convertBalance(eurNetWorth, "EUR", "EUR");

  const totalCashInUah = convertBalance(uahCash, "UAH", "UAH") + convertBalance(usdCash, "USD", "UAH") + convertBalance(eurCash, "EUR", "UAH");
  const totalCashInUsd = convertBalance(uahCash, "UAH", "USD") + convertBalance(usdCash, "USD", "USD") + convertBalance(eurCash, "EUR", "USD");
  const totalCashInEur = convertBalance(uahCash, "UAH", "EUR") + convertBalance(usdCash, "USD", "EUR") + convertBalance(eurCash, "EUR", "EUR");

  const totalBanksInUah = convertBalance(uahBanksTotal, "UAH", "UAH") + convertBalance(usdBanksTotal, "USD", "UAH") + convertBalance(eurBanksTotal, "EUR", "UAH");
  const totalBanksInUsd = convertBalance(uahBanksTotal, "UAH", "USD") + convertBalance(usdBanksTotal, "USD", "USD") + convertBalance(eurBanksTotal, "EUR", "USD");
  const totalBanksInEur = convertBalance(uahBanksTotal, "UAH", "EUR") + convertBalance(usdBanksTotal, "USD", "EUR") + convertBalance(eurBanksTotal, "EUR", "EUR");

  const totalOwnFundsInUah = totalCashInUah + totalBanksInUah;
  const totalOwnFundsInUsd = totalCashInUsd + totalBanksInUsd;
  const totalOwnFundsInEur = totalCashInEur + totalBanksInEur;

  const totalOweUsInUah = convertBalance(oweUsTotals.UAH, "UAH", "UAH") + convertBalance(oweUsTotals.USD, "USD", "UAH") + convertBalance(oweUsTotals.EUR, "EUR", "UAH");
  const totalWeOweInUah = convertBalance(weOweTotals.UAH, "UAH", "UAH") + convertBalance(weOweTotals.USD, "USD", "UAH") + convertBalance(weOweTotals.EUR, "EUR", "UAH");

  const totalOweUsInUsd = convertBalance(oweUsTotals.UAH, "UAH", "USD") + convertBalance(oweUsTotals.USD, "USD", "USD") + convertBalance(oweUsTotals.EUR, "EUR", "USD");
  const totalWeOweInUsd = convertBalance(weOweTotals.UAH, "UAH", "USD") + convertBalance(weOweTotals.USD, "USD", "USD") + convertBalance(weOweTotals.EUR, "EUR", "USD");

  const totalOweUsInEur = convertBalance(oweUsTotals.UAH, "UAH", "EUR") + convertBalance(oweUsTotals.USD, "USD", "EUR") + convertBalance(oweUsTotals.EUR, "EUR", "EUR");
  const totalWeOweInEur = convertBalance(weOweTotals.UAH, "UAH", "EUR") + convertBalance(weOweTotals.USD, "USD", "EUR") + convertBalance(weOweTotals.EUR, "EUR", "EUR");

  const netDebtsUah = totalOweUsInUah - totalWeOweInUah;
  const netDebtsUsd = totalOweUsInUsd - totalWeOweInUsd;
  const netDebtsEur = totalOweUsInEur - totalWeOweInEur;

  // 5. Build Master Multi-Currency Contractor Table (EVERY debtor with debts in UAH, USD, EUR)
  const masterContractorsList = useMemo(() => {
    const map: Record<string, { name: string; uah: number; usd: number; eur: number }> = {};

    const processDebtorsObj = (debtorsObj: any, cur: "UAH" | "USD" | "EUR") => {
      if (!debtorsObj) return;
      
      (debtorsObj.oweUs || []).forEach((item: any) => {
        const name = item.name?.trim();
        if (!name) return;
        if (!map[name]) map[name] = { name, uah: 0, usd: 0, eur: 0 };
        const val = Math.abs(Number(item.sum ?? item.amount ?? 0));
        if (cur === "UAH") map[name].uah = val;
        if (cur === "USD") map[name].usd = val;
        if (cur === "EUR") map[name].eur = val;
      });

      (debtorsObj.weOwe || []).forEach((item: any) => {
        const name = item.name?.trim();
        if (!name) return;
        if (!map[name]) map[name] = { name, uah: 0, usd: 0, eur: 0 };
        const val = Math.abs(Number(item.sum ?? item.amount ?? 0));
        if (cur === "UAH") map[name].uah = -val;
        if (cur === "USD") map[name].usd = -val;
        if (cur === "EUR") map[name].eur = -val;
      });

      (debtorsObj.settled || []).forEach((item: any) => {
        const name = item.name?.trim();
        if (!name) return;
        if (!map[name]) map[name] = { name, uah: 0, usd: 0, eur: 0 };
      });
    };

    if (initData?.allDebtorsDetails) {
      if (initData.allDebtorsDetails.UAH) processDebtorsObj(initData.allDebtorsDetails.UAH, "UAH");
      if (initData.allDebtorsDetails.USD) processDebtorsObj(initData.allDebtorsDetails.USD, "USD");
      if (initData.allDebtorsDetails.EUR) processDebtorsObj(initData.allDebtorsDetails.EUR, "EUR");
    }

    processDebtorsObj(initData?.debtors, currentCurrency);
    processDebtorsObj(uahData?.debtors, "UAH");
    processDebtorsObj(usdData?.debtors, "USD");
    processDebtorsObj(eurData?.debtors, "EUR");

    if (Array.isArray(initData?.names)) {
      initData.names.forEach((n: string) => {
        if (!n) return;
        const k = n.trim();
        if (!map[k]) map[k] = { name: k, uah: 0, usd: 0, eur: 0 };
      });
    }

    if (initData?.contractorLedger) {
      Object.keys(initData.contractorLedger).forEach(n => {
        if (!n) return;
        const k = n.trim();
        if (!map[k]) map[k] = { name: k, uah: 0, usd: 0, eur: 0 };
      });
    }

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
      const netUahEquiv = 
        convertBalance(c.uah, "UAH", "UAH") + 
        convertBalance(c.usd, "USD", "UAH") + 
        convertBalance(c.eur, "EUR", "UAH");

      const netUsdEquiv = 
        convertBalance(c.uah, "UAH", "USD") + 
        convertBalance(c.usd, "USD", "USD") + 
        convertBalance(c.eur, "EUR", "USD");

      const netEurEquiv = 
        convertBalance(c.uah, "UAH", "EUR") + 
        convertBalance(c.usd, "USD", "EUR") + 
        convertBalance(c.eur, "EUR", "EUR");

      return {
        ...c,
        netUahEquiv,
        netUsdEquiv,
        netEurEquiv
      };
    }).sort((a, b) => Math.abs(b.netUahEquiv) - Math.abs(a.netUahEquiv));
  }, [initData, uahData, usdData, eurData, currentCurrency, rUsd, rEur]);

  // Filter contractors by search & tab
  const filteredContractors = useMemo(() => {
    return masterContractorsList.filter(c => {
      const matchesSearch = !searchQuery.trim() || c.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (contractorTabFilter === "oweUs") return c.netUahEquiv > 0.01;
      if (contractorTabFilter === "weOwe") return c.netUahEquiv < -0.01;
      return true;
    });
  }, [masterContractorsList, searchQuery, contractorTabFilter]);

  // Copy helper
  const handleCopy = (mode: "short" | "full") => {
    const todayStr = new Date().toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
    
    let text = "";
    if (mode === "short") {
      text = `🏛️ ПОВНИЙ ЗВЕДЕНИЙ ФІНАНСОВИЙ ЗВІТ (${todayStr})
Курси: USD = ${rUsd.toFixed(2)} / ${rUsdSellCalculated.toFixed(2)} ₴ | EUR = ${rEur.toFixed(2)} / ${rEurSellCalculated.toFixed(2)} ₴

💰 ЗАГАЛЬНИЙ ЧИСТИЙ КАПІТАЛ:
• У Гривнях: ${totalNetWorthInUah.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴
• У Доларах: ${totalNetWorthInUsd.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $
• У Євро: ${totalNetWorthInEur.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} €

🌐 БАЛАНС ЗА ВАЛЮТАМИ:
🇺🇦 Гривня (UAH): ${uahNetWorth.toLocaleString("uk-UA")} ₴
🇺🇸 Долар (USD): ${usdNetWorth.toLocaleString("uk-UA")} $
🇪🇺 Євро (EUR): ${eurNetWorth.toLocaleString("uk-UA")} €

🤝 ЗАГАЛЬНА ДЕБІТОРКА / КРЕДИТОРКА:
• Нам винні: +${totalOweUsInUah.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴ (+${totalOweUsInUsd.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $)
• Ми винні: -${totalWeOweInUah.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴ (-${totalWeOweInUsd.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $)`;
    } else {
      text = `🏛️ ПОВНИЙ ГЕНЕРАЛЬНИЙ ЗВІТ ВСІХ АКТИВІВ ТА БОРЖНИКІВ
Дата: ${todayStr}
Курси купівлі/продажу: USD = ${rUsd.toFixed(2)} / ${rUsdSellCalculated.toFixed(2)} ₴ | EUR = ${rEur.toFixed(2)} / ${rEurSellCalculated.toFixed(2)} ₴

=========================================
1. ГОЛОВНИЙ ФІНАНСОВИЙ БАЛАНС
=========================================
• ЧИСТИЙ КАПІТАЛ у UAH: ${totalNetWorthInUah.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} ₴
• ЧИСТИЙ КАПІТАЛ у USD: ${totalNetWorthInUsd.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} $
• ЧИСТИЙ КАПІТАЛ у EUR: ${totalNetWorthInEur.toLocaleString("uk-UA", { minimumFractionDigits: 2 })} €

├─ Готівка разом: ${totalCashInUah.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴ (${totalCashInUsd.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $)
├─ Банки разом: ${totalBanksInUah.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴ (${totalBanksInUsd.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $)
├─ Нам винні (Дебітори): +${totalOweUsInUah.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴ (+${totalOweUsInUsd.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $)
└─ Ми винні (Кредитори): -${totalWeOweInUah.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴ (-${totalWeOweInUsd.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $)

=========================================
2. ДЕТАЛЬНИЙ РЕЄСТР БОРЖНИКІВ ПО ВСІХ ВАЛЮТАХ
=========================================
${masterContractorsList.map(c => `• ${c.name}:
  UAH: ${c.uah > 0 ? `+${c.uah}` : c.uah < 0 ? c.uah : "0"} ₴
  USD: ${c.usd > 0 ? `+${c.usd}` : c.usd < 0 ? c.usd : "0"} $
  EUR: ${c.eur > 0 ? `+${c.eur}` : c.eur < 0 ? c.eur : "0"} €
  --> Загальний еквівалент: ${c.netUahEquiv > 0 ? `+${c.netUahEquiv.toFixed(2)}` : c.netUahEquiv.toFixed(2)} ₴ (${c.netUsdEquiv.toFixed(2)} $)`).join("\n\n")}`;
    }

    navigator.clipboard.writeText(text);
    setCopiedType(mode);
    setTimeout(() => setCopiedType(null), 2500);
  };

  // Helper function to build standalone clean HTML for print or download
  const generatePrintHTML = () => {
    const todayStr = new Date().toLocaleDateString("uk-UA", { day: "2-digit", month: "long", year: "numeric" });
    return `
      <!DOCTYPE html>
      <html lang="uk">
      <head>
        <meta charset="utf-8">
        <title>Генеральний Зведений Фінансовий Звіт - ${todayStr}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #0f172a;
            background: #ffffff;
            margin: 0;
            padding: 15px;
            font-size: 11px;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .header {
            border-bottom: 2px solid #0f172a;
            padding-bottom: 12px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .header-title {
            font-size: 20px;
            font-weight: 900;
            margin: 0 0 4px 0;
            text-transform: uppercase;
            letter-spacing: -0.5px;
            color: #0f172a;
          }
          .header-subtitle {
            color: #475569;
            font-size: 11px;
            font-weight: 600;
          }
          .rates-box {
            text-align: right;
            font-size: 11px;
            font-weight: 600;
            color: #334155;
          }
          .section-title {
            font-size: 12px;
            font-weight: 800;
            border-bottom: 1.5px solid #cbd5e1;
            padding-bottom: 4px;
            margin: 18px 0 10px 0;
            color: #0f172a;
            text-transform: uppercase;
          }
          .cards-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 15px;
          }
          .card {
            border: 1px solid #cbd5e1;
            background-color: #f8fafc;
            border-radius: 8px;
            padding: 10px 12px;
          }
          .card-title {
            font-size: 10px;
            font-weight: 800;
            color: #475569;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .card-val {
            font-size: 16px;
            font-weight: 900;
            color: #0f172a;
          }
          .card-sub {
            font-size: 10px;
            font-weight: 700;
            color: #0284c7;
            margin-top: 4px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 6px;
            margin-bottom: 15px;
            font-size: 11px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 6px 8px;
            text-align: left;
          }
          th {
            background-color: #f1f5f9;
            font-weight: 800;
            color: #0f172a;
            text-transform: uppercase;
            font-size: 10px;
          }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .font-bold { font-weight: 700; }
          .font-black { font-weight: 900; }
          .text-emerald { color: #15803d; font-weight: 700; }
          .text-red { color: #b91c1c; font-weight: 700; }
          .text-sky { color: #0369a1; font-weight: 700; }
          .badge {
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 9px;
            font-weight: 800;
            display: inline-block;
          }
          .badge-emerald { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
          .badge-red { background: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
          .badge-slate { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }
          .footer {
            margin-top: 25px;
            padding-top: 10px;
            border-top: 1px solid #cbd5e1;
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #64748b;
            font-weight: 600;
          }
          @media print {
            .no-print { display: none !important; }
          }
        </style>
      </head>
      <body>
        <div style="text-align: center; margin-bottom: 15px;" class="no-print">
          <button onclick="window.print()" style="background: #0284c7; color: #ffffff; font-weight: bold; border: none; padding: 10px 20px; font-size: 14px; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            🖨️ Натисніть тут для друку
          </button>
        </div>

        <div class="header">
          <div>
            <div style="font-size: 10px; font-weight: 800; color: #0284c7; text-transform: uppercase; margin-bottom: 2px;">
              Офіційний Повний Аудит Активів та Боргів
            </div>
            <h1 class="header-title">ГЕНЕРАЛЬНИЙ ЗВЕДЕНИЙ ФІНАНСОВИЙ БАЛАНС</h1>
            <div class="header-subtitle">
              Складено: ${todayStr} • Відображення по всіх 3 валютах (UAH, USD, EUR)
            </div>
          </div>
          <div class="rates-box">
            <div>Курс USD: <strong>${rUsd.toFixed(2)} / ${rUsdSellCalculated.toFixed(2)} ₴</strong></div>
            <div>Курс EUR: <strong>${rEur.toFixed(2)} / ${rEurSellCalculated.toFixed(2)} ₴</strong></div>
            <div style="font-size: 9px; color: #64748b; margin-top: 2px;">Джерело: ${rateSource.toUpperCase()}</div>
          </div>
        </div>

        <div class="section-title">1. Загальний чистий капітал у всех валютах одночасно</div>
        <div class="cards-grid">
          <div class="card">
            <div class="card-title">🇺🇦 Гривня (UAH)</div>
            <div class="card-val">${uahNetWorth.toLocaleString("uk-UA")} ₴</div>
            <div class="card-sub">Всього у ₴: ${totalNetWorthInUah.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴</div>
          </div>
          <div class="card">
            <div class="card-title">🇺🇸 Долар США (USD)</div>
            <div class="card-val">${usdNetWorth.toLocaleString("uk-UA")} $</div>
            <div class="card-sub">Всього у $: ${totalNetWorthInUsd.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $</div>
          </div>
          <div class="card">
            <div class="card-title">🇪🇺 Євро (EUR)</div>
            <div class="card-val">${eurNetWorth.toLocaleString("uk-UA")} €</div>
            <div class="card-sub">Всього у €: ${totalNetWorthInEur.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} €</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Валюта капіталу</th>
              <th class="text-right">💵 Готівка</th>
              <th class="text-right">🏦 Банки</th>
              <th class="text-right">🟢 Дебітори (+)</th>
              <th class="text-right">🔴 Кредитори (-)</th>
              <th class="text-right">💼 ЧИСТИЙ КАПІТАЛ</th>
              <th class="text-right">Еквів. UAH (₴)</th>
              <th class="text-right">Еквів. USD ($)</th>
              <th class="text-right">Еквів. EUR (€)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-bold">🇺🇦 Гривня (UAH)</td>
              <td class="text-right">${uahCash.toLocaleString("uk-UA")} ₴</td>
              <td class="text-right">${uahBanksTotal.toLocaleString("uk-UA")} ₴</td>
              <td class="text-right text-emerald">+${oweUsTotals.UAH.toLocaleString("uk-UA")} ₴</td>
              <td class="text-right text-red">-${weOweTotals.UAH.toLocaleString("uk-UA")} ₴</td>
              <td class="text-right font-black">${uahNetWorth.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
              <td class="text-right font-bold">${convertBalance(uahNetWorth, "UAH", "UAH").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
              <td class="text-right">${convertBalance(uahNetWorth, "UAH", "USD").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
              <td class="text-right">${convertBalance(uahNetWorth, "UAH", "EUR").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
            </tr>
            <tr>
              <td class="font-bold">🇺🇸 Долар (USD)</td>
              <td class="text-right">${usdCash.toLocaleString("uk-UA")} $</td>
              <td class="text-right">${usdBanksTotal.toLocaleString("uk-UA")} $</td>
              <td class="text-right text-emerald">+${oweUsTotals.USD.toLocaleString("uk-UA")} $</td>
              <td class="text-right text-red">-${weOweTotals.USD.toLocaleString("uk-UA")} $</td>
              <td class="text-right font-black">${usdNetWorth.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
              <td class="text-right">${convertBalance(usdNetWorth, "USD", "UAH").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
              <td class="text-right font-bold">${convertBalance(usdNetWorth, "USD", "USD").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
              <td class="text-right">${convertBalance(usdNetWorth, "USD", "EUR").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
            </tr>
            <tr>
              <td class="font-bold">🇪🇺 Євро (EUR)</td>
              <td class="text-right">${eurCash.toLocaleString("uk-UA")} €</td>
              <td class="text-right">${eurBanksTotal.toLocaleString("uk-UA")} €</td>
              <td class="text-right text-emerald">+${oweUsTotals.EUR.toLocaleString("uk-UA")} €</td>
              <td class="text-right text-red">-${weOweTotals.EUR.toLocaleString("uk-UA")} €</td>
              <td class="text-right font-black">${eurNetWorth.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
              <td class="text-right">${convertBalance(eurNetWorth, "EUR", "UAH").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
              <td class="text-right">${convertBalance(eurNetWorth, "EUR", "USD").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
              <td class="text-right font-bold">${convertBalance(eurNetWorth, "EUR", "EUR").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
            </tr>
            <tr style="background-color: #f1f5f9; font-weight: 900;">
              <td>ЗАГАЛЬНИЙ КАПІТАЛ:</td>
              <td class="text-right">${totalCashInUah.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴ екв</td>
              <td class="text-right">${totalBanksInUah.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴ екв</td>
              <td class="text-right text-emerald">+${totalOweUsInUah.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴ екв</td>
              <td class="text-right text-red">-${totalWeOweInUah.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴ екв</td>
              <td class="text-right">—</td>
              <td class="text-right text-sky">${totalNetWorthInUah.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
              <td class="text-right text-emerald">${totalNetWorthInUsd.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
              <td class="text-right text-sky">${totalNetWorthInEur.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
            </tr>
          </tbody>
        </table>

        <div class="section-title">2. Детальна розгортка всіх банківських рахунків та готівки</div>
        <table>
          <thead>
            <tr>
              <th>Рахунок / Джерело</th>
              <th class="text-right">🇺🇦 UAH (₴)</th>
              <th class="text-right">🇺🇸 USD ($)</th>
              <th class="text-right">🇪🇺 EUR (€)</th>
              <th class="text-right">Еквівалент UAH (₴)</th>
              <th class="text-right">Еквівалент USD ($)</th>
              <th class="text-right">Еквівалент EUR (€)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="font-bold">💵 Готівка в наявності</td>
              <td class="text-right">${uahCash.toLocaleString("uk-UA")} ₴</td>
              <td class="text-right">${usdCash.toLocaleString("uk-UA")} $</td>
              <td class="text-right">${eurCash.toLocaleString("uk-UA")} €</td>
              <td class="text-right font-black text-emerald">${totalCashInUah.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴</td>
              <td class="text-right font-black text-emerald">${totalCashInUsd.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $</td>
              <td class="text-right font-black text-emerald">${totalCashInEur.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} €</td>
            </tr>
            ${["Банк 1", "Банк 2", "Банк 3", "Банк 4", "Банк 5"].map(bKey => {
              const uVal = getBankVal(initData || uahData, "UAH", bKey);
              const usVal = getBankVal(initData || usdData, "USD", bKey);
              const eVal = getBankVal(initData || eurData, "EUR", bKey);
              const alias = getBankAlias(bKey, "UAH");
              const uahEquiv = convertBalance(uVal, "UAH", "UAH") + convertBalance(usVal, "USD", "UAH") + convertBalance(eVal, "EUR", "UAH");
              const usdEquiv = convertBalance(uVal, "UAH", "USD") + convertBalance(usVal, "USD", "USD") + convertBalance(eVal, "EUR", "USD");
              const eurEquiv = convertBalance(uVal, "UAH", "EUR") + convertBalance(usVal, "USD", "EUR") + convertBalance(eVal, "EUR", "EUR");
              return `
                <tr>
                  <td>🏦 ${alias}</td>
                  <td class="text-right">${uVal.toLocaleString("uk-UA")} ₴</td>
                  <td class="text-right">${usVal.toLocaleString("uk-UA")} $</td>
                  <td class="text-right">${eVal.toLocaleString("uk-UA")} €</td>
                  <td class="text-right font-bold text-sky">${uahEquiv.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴</td>
                  <td class="text-right font-bold text-sky">${usdEquiv.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $</td>
                  <td class="text-right font-bold text-sky">${eurEquiv.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} €</td>
                </tr>
              `;
            }).join("")}
            <tr style="background-color: #f1f5f9; font-weight: 900;">
              <td>РАЗОМ ВЛАСНІ ГРОШІ (Готівка + Банки):</td>
              <td class="text-right text-emerald">${(uahCash + uahBanksTotal).toLocaleString("uk-UA")} ₴</td>
              <td class="text-right text-emerald">${(usdCash + usdBanksTotal).toLocaleString("uk-UA")} $</td>
              <td class="text-right text-emerald">${(eurCash + eurBanksTotal).toLocaleString("uk-UA")} €</td>
              <td class="text-right text-emerald">${totalOwnFundsInUah.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
              <td class="text-right text-emerald">${totalOwnFundsInUsd.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
              <td class="text-right text-emerald">${totalOwnFundsInEur.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
            </tr>
          </tbody>
        </table>

        <div class="section-title">3. Повний реєстр боргів та контрагентів за всіма валютами (${masterContractorsList.length})</div>
        <table>
          <thead>
            <tr>
              <th>Контрагент / Боржник</th>
              <th class="text-right">Борг UAH (₴)</th>
              <th class="text-right">Борг USD ($)</th>
              <th class="text-right">Борг EUR (€)</th>
              <th class="text-right">Еквів. UAH (₴)</th>
              <th class="text-right">Еквів. USD ($)</th>
              <th class="text-right">Еквів. EUR (€)</th>
              <th class="text-center">Статус</th>
            </tr>
          </thead>
          <tbody>
            ${masterContractorsList.map(c => {
              const isOweUs = c.netUahEquiv > 0.01;
              const isWeOwe = c.netUahEquiv < -0.01;
              return `
                <tr>
                  <td class="font-bold">${c.name}</td>
                  <td class="text-right ${c.uah > 0 ? "text-emerald" : c.uah < 0 ? "text-red" : ""}">${c.uah > 0 ? `+${c.uah.toLocaleString("uk-UA")}` : c.uah < 0 ? c.uah.toLocaleString("uk-UA") : "—"}</td>
                  <td class="text-right ${c.usd > 0 ? "text-emerald" : c.usd < 0 ? "text-red" : ""}">${c.usd > 0 ? `+${c.usd.toLocaleString("uk-UA")}` : c.usd < 0 ? c.usd.toLocaleString("uk-UA") : "—"}</td>
                  <td class="text-right ${c.eur > 0 ? "text-emerald" : c.eur < 0 ? "text-red" : ""}">${c.eur > 0 ? `+${c.eur.toLocaleString("uk-UA")}` : c.eur < 0 ? c.eur.toLocaleString("uk-UA") : "—"}</td>
                  <td class="text-right font-black ${isOweUs ? "text-emerald" : isWeOwe ? "text-red" : ""}">${isOweUs ? `+${c.netUahEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴` : `${c.netUahEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`}</td>
                  <td class="text-right font-black ${isOweUs ? "text-emerald" : isWeOwe ? "text-red" : ""}">${isOweUs ? `+${c.netUsdEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $` : `${c.netUsdEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`}</td>
                  <td class="text-right font-black ${isOweUs ? "text-emerald" : isWeOwe ? "text-red" : ""}">${isOweUs ? `+${c.netEurEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : `${c.netEurEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}</td>
                  <td class="text-center">
                    ${isOweUs ? '<span class="badge badge-emerald">Нам винен</span>' : isWeOwe ? '<span class="badge badge-red">Ми винні</span>' : '<span class="badge badge-slate">Розраховано</span>'}
                  </td>
                </tr>
              `;
            }).join("")}
            <tr style="background-color: #f8fafc; font-weight: 800;">
              <td>🟢 НАМ ВИННІ (Дебіторський борг):</td>
              <td class="text-right text-emerald">+${oweUsTotals.UAH.toLocaleString("uk-UA")} ₴</td>
              <td class="text-right text-emerald">+${oweUsTotals.USD.toLocaleString("uk-UA")} $</td>
              <td class="text-right text-emerald">+${oweUsTotals.EUR.toLocaleString("uk-UA")} €</td>
              <td class="text-right text-emerald">+${totalOweUsInUah.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
              <td class="text-right text-emerald">+${totalOweUsInUsd.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
              <td class="text-right text-emerald">+${totalOweUsInEur.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
              <td class="text-center">Дебітори</td>
            </tr>
            <tr style="background-color: #f8fafc; font-weight: 800;">
              <td>🔴 МИ ВИННІ (Кредиторський борг):</td>
              <td class="text-right text-red">-${weOweTotals.UAH.toLocaleString("uk-UA")} ₴</td>
              <td class="text-right text-red">-${weOweTotals.USD.toLocaleString("uk-UA")} $</td>
              <td class="text-right text-red">-${weOweTotals.EUR.toLocaleString("uk-UA")} €</td>
              <td class="text-right text-red">-${totalWeOweInUah.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
              <td class="text-right text-red">-${totalWeOweInUsd.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
              <td class="text-right text-red">-${totalWeOweInEur.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
              <td class="text-center">Кредитори</td>
            </tr>
            <tr style="background-color: #e2e8f0; font-weight: 900; border-top: 2px solid #0f172a;">
              <td>⚖️ ЧИСТА ДЕБІТОРКА (Нам винні − Ми винні):</td>
              <td class="text-right text-sky">${(oweUsTotals.UAH - weOweTotals.UAH) >= 0 ? "+" : ""}${(oweUsTotals.UAH - weOweTotals.UAH).toLocaleString("uk-UA")} ₴</td>
              <td class="text-right text-sky">${(oweUsTotals.USD - weOweTotals.USD) >= 0 ? "+" : ""}${(oweUsTotals.USD - weOweTotals.USD).toLocaleString("uk-UA")} $</td>
              <td class="text-right text-sky">${(oweUsTotals.EUR - weOweTotals.EUR) >= 0 ? "+" : ""}${(oweUsTotals.EUR - weOweTotals.EUR).toLocaleString("uk-UA")} €</td>
              <td class="text-right font-black ${netDebtsUah >= 0 ? "text-emerald" : "text-red"}">${netDebtsUah >= 0 ? "+" : ""}${netDebtsUah.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
              <td class="text-right font-black ${netDebtsUsd >= 0 ? "text-emerald" : "text-red"}">${netDebtsUsd >= 0 ? "+" : ""}${netDebtsUsd.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
              <td class="text-right font-black ${netDebtsEur >= 0 ? "text-emerald" : "text-red"}">${netDebtsEur >= 0 ? "+" : ""}${netDebtsEur.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
              <td class="text-center">Чисте сальдо</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div>Система автоматичного фінансового обліку • Зведений підсумок 360°</div>
          <div>Сформовано автоматично ${todayStr}</div>
        </div>
      </body>
      </html>
    `;
  };

  const handlePrint = () => {
    try {
      const html = generatePrintHTML();
      
      // 1. First attempt: open new window and trigger print
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => {
          try {
            printWindow.focus();
            printWindow.print();
          } catch (e) {
            console.warn("Print window focus error", e);
          }
        }, 300);
        return;
      }

      // 2. Second attempt: dynamic iframe in current document
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0px";
      iframe.style.height = "0px";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(html);
        frameDoc.close();
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
          } catch (e) {
            console.warn("Iframe print error", e);
            window.print();
          } finally {
            setTimeout(() => {
              if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
              }
            }, 3000);
          }
        }, 300);
      } else {
        window.print();
      }
    } catch (err) {
      console.error("Print failed:", err);
      window.print();
    }
  };

  const handleDownloadHTML = () => {
    const html = generatePrintHTML();
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Зведений_Звіт_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const todayFormatted = new Date().toLocaleDateString("uk-UA", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  return (
    <div className="flex flex-col gap-6 text-left animate-fadeIn max-w-6xl mx-auto pb-16">
      {/* Top Controls Header (Hidden during Print) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-indigo-500/20 via-sky-500/20 to-emerald-500/20 rounded-2xl border border-indigo-500/30 text-indigo-400 shadow-lg shadow-indigo-500/10">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              Генеральний Зведений Звіт
              <span className="bg-sky-500/10 border border-sky-500/30 text-sky-400 text-xs font-bold px-2.5 py-0.5 rounded-full">
                Все в одному вікні
              </span>
            </h1>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              Абсолютно всі рахунки, валюти та боржники у деталізованому розписі без переключення
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleCopy("short")}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-xs px-3 py-2 rounded-xl border border-slate-800 transition-all active:scale-95 cursor-pointer"
            title="Скопіювати короткий витяг"
          >
            {copiedType === "short" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-sky-400" />}
            <span>Короткий витяг</span>
          </button>

          <button
            onClick={() => handleCopy("full")}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold text-xs px-3.5 py-2 rounded-xl border border-slate-700 transition-all active:scale-95 cursor-pointer"
            title="Скопіювати повний форматирований текст"
          >
            {copiedType === "full" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-indigo-400" />}
            <span>Скопіювати все</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-gradient-to-r from-sky-500 via-indigo-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-black text-xs px-4 py-2 rounded-xl shadow-lg shadow-sky-500/20 transition-all active:scale-95 cursor-pointer"
            title="Роздрукувати звіт або зберегти як PDF"
          >
            <Printer className="w-4 h-4" />
            <span>Друк / PDF</span>
          </button>

          <button
            onClick={handleDownloadHTML}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-xs px-3 py-2 rounded-xl border border-slate-800 transition-all active:scale-95 cursor-pointer"
            title="Завантажити звіт як окремий HTML документ для друку"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Завантажити HTML</span>
          </button>

          <button
            onClick={onBack}
            className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            Назад
          </button>
        </div>
      </div>

      {/* Exchange Rates Banner */}
      <div className="p-4 bg-gradient-to-r from-sky-950/50 via-indigo-950/30 to-slate-900 border border-sky-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300 print:hidden shadow-lg">
        <div className="flex items-center gap-2.5">
          <Calculator className="w-5 h-5 text-sky-400 shrink-0" />
          <div>
            <span className="font-black text-white">Усі валюти зведені одночасно! </span>
            <span className="text-slate-300 font-semibold">
              Консолідація за актуальним курсом обміну кантору:
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-bold">
          <span className="bg-black/60 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
            USD: <strong className="text-emerald-400">{rUsd.toFixed(2)} / {rUsdSellCalculated.toFixed(2)} ₴</strong>
          </span>
          <span className="bg-black/60 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300">
            EUR: <strong className="text-indigo-400">{rEur.toFixed(2)} / {rEurSellCalculated.toFixed(2)} ₴</strong>
          </span>
        </div>
      </div>

      {/* Main Printable & Visual Master Report Container */}
      <div className="flex flex-col gap-8 bg-slate-950 print:bg-white print:text-black print:p-0 rounded-3xl p-6 md:p-8 border border-slate-800 shadow-2xl">

        {/* Printable Official Header */}
        <div className="border-b-2 border-slate-800 print:border-slate-300 pb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-sky-400 print:text-slate-600 flex items-center gap-1.5 mb-1">
              <ShieldCheck className="w-4.5 h-4.5" />
              Офіційний Повний Аудит Активів та Боргів
            </div>
            <h2 className="text-2xl font-black text-white print:text-black tracking-tight">
              ГЕНЕРАЛЬНИЙ ЗВЕДЕНИЙ ФІНАНСОВИЙ БАЛАНС
            </h2>
            <p className="text-xs text-slate-400 print:text-slate-600 font-bold mt-1">
              Складено: {todayFormatted} • Відображення по всіх 3 валютах (UAH, USD, EUR)
            </p>
          </div>

          <div className="text-right text-xs font-semibold text-slate-400 print:text-slate-700">
            <div>Курс долара: <strong className="text-white print:text-black">{rUsd.toFixed(2)} / {rUsdSellCalculated.toFixed(2)} ₴</strong></div>
            <div>Курс євро: <strong className="text-white print:text-black">{rEur.toFixed(2)} / {rEurSellCalculated.toFixed(2)} ₴</strong></div>
            <div className="text-[10px] text-slate-500 print:text-slate-500 mt-1">Джерело: {rateSource.toUpperCase()}</div>
          </div>
        </div>

        {/* Section 1: Simultaneous Multi-Currency Net Worth Cards */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-black text-white print:text-black flex items-center justify-between border-b border-slate-800 print:border-slate-300 pb-2">
            <span className="flex items-center gap-2">
              <Coins className="w-4.5 h-4.5 text-sky-400 print:text-black" />
              1. Загальний чистий капітал у всіх валютах одночасно
            </span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* UAH Net Worth */}
            <div className="p-4 bg-gradient-to-br from-yellow-950/30 via-slate-900 to-slate-950 print:bg-slate-100 border-2 border-yellow-500/40 print:border-slate-300 rounded-2xl flex flex-col justify-between shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase text-yellow-400 print:text-slate-800 tracking-wider flex items-center gap-1.5">
                  <span>🇺🇦</span> Гривня (UAH)
                </span>
                <Wallet className="w-4 h-4 text-yellow-400 print:text-slate-800" />
              </div>
              <div className="my-2">
                <div className="text-xl font-black text-white print:text-black">
                  {uahNetWorth.toLocaleString("uk-UA")} ₴
                </div>
                <p className="text-[10px] text-yellow-200/80 print:text-slate-700 font-semibold mt-1">
                  Загальний капітал у ₴: <strong className="text-yellow-400 print:text-black">{totalNetWorthInUah.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴</strong>
                </p>
              </div>
            </div>

            {/* USD Net Worth */}
            <div className="p-4 bg-gradient-to-br from-emerald-950/30 via-slate-900 to-slate-950 print:bg-slate-100 border-2 border-emerald-500/40 print:border-slate-300 rounded-2xl flex flex-col justify-between shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase text-emerald-400 print:text-slate-800 tracking-wider flex items-center gap-1.5">
                  <span>🇺🇸</span> Долар США (USD)
                </span>
                <Coins className="w-4 h-4 text-emerald-400 print:text-slate-800" />
              </div>
              <div className="my-2">
                <div className="text-xl font-black text-emerald-400 print:text-black">
                  {usdNetWorth.toLocaleString("uk-UA")} $
                </div>
                <p className="text-[10px] text-emerald-200/80 print:text-slate-700 font-semibold mt-1">
                  Загальний капітал у $: <strong className="text-emerald-400 print:text-black">{totalNetWorthInUsd.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $</strong>
                </p>
              </div>
            </div>

            {/* EUR Net Worth */}
            <div className="p-4 bg-gradient-to-br from-indigo-950/30 via-slate-900 to-slate-950 print:bg-slate-100 border-2 border-indigo-500/40 print:border-slate-300 rounded-2xl flex flex-col justify-between shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase text-indigo-400 print:text-slate-800 tracking-wider flex items-center gap-1.5">
                  <span>🇪🇺</span> Євро (EUR)
                </span>
                <Landmark className="w-4 h-4 text-indigo-400 print:text-slate-800" />
              </div>
              <div className="my-2">
                <div className="text-xl font-black text-indigo-400 print:text-black">
                  {eurNetWorth.toLocaleString("uk-UA")} €
                </div>
                <p className="text-[10px] text-indigo-200/80 print:text-slate-700 font-semibold mt-1">
                  Загальний капітал у €: <strong className="text-indigo-400 print:text-black">{totalNetWorthInEur.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} €</strong>
                </p>
              </div>
            </div>
          </div>

          {/* Section 1 Formula Breakdown Table Toggle */}
          <div className="flex justify-end print:hidden">
            <button
              type="button"
              onClick={() => setIsSection1TableOpen(prev => !prev)}
              className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1.5 py-1 px-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-sky-500/40 transition-all cursor-pointer"
            >
              <span>{isSection1TableOpen ? "Сховати детальну формулу капіталу" : "Показати детальну формулу капіталу (Таблиця)"}</span>
              {isSection1TableOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Section 1 Formula Breakdown Table */}
          <div className={`mt-2 overflow-x-auto print:block ${isSection1TableOpen ? "block" : "hidden"}`}>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 print:bg-slate-200 text-slate-300 print:text-black font-black uppercase border-b border-slate-800 print:border-slate-300">
                  <th className="p-3">Валюта капіталу</th>
                  <th className="p-3 text-right">💵 Готівка</th>
                  <th className="p-3 text-right">🏦 Банки</th>
                  <th className="p-3 text-right">🟢 Дебітори (+)</th>
                  <th className="p-3 text-right">🔴 Кредитори (-)</th>
                  <th className="p-3 text-right">💼 ЧИСТИЙ КАПІТАЛ</th>
                  <th className="p-3 text-right">Еквів. UAH (₴)</th>
                  <th className="p-3 text-right">Еквів. USD ($)</th>
                  <th className="p-3 text-right">Еквів. EUR (€)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 print:divide-slate-300 font-medium">
                {/* UAH Row */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-black text-yellow-400 print:text-black flex items-center gap-1.5">
                    <span>🇺🇦</span> Гривня (UAH)
                  </td>
                  <td className="p-3 text-right font-bold text-slate-200 print:text-black">{uahCash.toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right font-bold text-slate-200 print:text-black">{uahBanksTotal.toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right font-bold text-emerald-400 print:text-black">+{oweUsTotals.UAH.toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right font-bold text-red-400 print:text-black">-{weOweTotals.UAH.toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right font-black text-yellow-400 print:text-black">{uahNetWorth.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
                  <td className="p-3 text-right font-black text-yellow-400 print:text-black">{convertBalance(uahNetWorth, "UAH", "UAH").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
                  <td className="p-3 text-right font-bold text-yellow-200 print:text-black">{convertBalance(uahNetWorth, "UAH", "USD").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
                  <td className="p-3 text-right font-bold text-yellow-200 print:text-black">{convertBalance(uahNetWorth, "UAH", "EUR").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                </tr>

                {/* USD Row */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-black text-emerald-400 print:text-black flex items-center gap-1.5">
                    <span>🇺🇸</span> Долар (USD)
                  </td>
                  <td className="p-3 text-right font-bold text-slate-200 print:text-black">{usdCash.toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right font-bold text-slate-200 print:text-black">{usdBanksTotal.toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right font-bold text-emerald-400 print:text-black">+{oweUsTotals.USD.toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right font-bold text-red-400 print:text-black">-{weOweTotals.USD.toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right font-black text-emerald-400 print:text-black">{usdNetWorth.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
                  <td className="p-3 text-right font-bold text-emerald-200 print:text-black">{convertBalance(usdNetWorth, "USD", "UAH").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
                  <td className="p-3 text-right font-black text-emerald-400 print:text-black">{convertBalance(usdNetWorth, "USD", "USD").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
                  <td className="p-3 text-right font-bold text-emerald-200 print:text-black">{convertBalance(usdNetWorth, "USD", "EUR").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                </tr>

                {/* EUR Row */}
                <tr className="hover:bg-slate-900/40">
                  <td className="p-3 font-black text-indigo-400 print:text-black flex items-center gap-1.5">
                    <span>🇪🇺</span> Євро (EUR)
                  </td>
                  <td className="p-3 text-right font-bold text-slate-200 print:text-black">{eurCash.toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right font-bold text-slate-200 print:text-black">{eurBanksTotal.toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right font-bold text-emerald-400 print:text-black">+{oweUsTotals.EUR.toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right font-bold text-red-400 print:text-black">-{weOweTotals.EUR.toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right font-black text-indigo-400 print:text-black">{eurNetWorth.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                  <td className="p-3 text-right font-bold text-indigo-200 print:text-black">{convertBalance(eurNetWorth, "EUR", "UAH").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
                  <td className="p-3 text-right font-bold text-indigo-200 print:text-black">{convertBalance(eurNetWorth, "EUR", "USD").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
                  <td className="p-3 text-right font-black text-indigo-400 print:text-black">{convertBalance(eurNetWorth, "EUR", "EUR").toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                </tr>

                {/* Summary Total Row */}
                <tr className="bg-slate-900/90 print:bg-slate-200 border-t-2 border-slate-700 font-black">
                  <td className="p-3 text-white print:text-black">ЗАГАЛЬНИЙ КАПІТАЛ:</td>
                  <td className="p-3 text-right text-emerald-400 print:text-black">{totalCashInUah.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴ екв</td>
                  <td className="p-3 text-right text-sky-400 print:text-black">{totalBanksInUah.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴ екв</td>
                  <td className="p-3 text-right text-emerald-400 print:text-black">+{totalOweUsInUah.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴ екв</td>
                  <td className="p-3 text-right text-red-400 print:text-black">-{totalWeOweInUah.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴ екв</td>
                  <td className="p-3 text-right text-sky-300 print:text-black">—</td>
                  <td className="p-3 text-right text-yellow-400 print:text-black">{totalNetWorthInUah.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
                  <td className="p-3 text-right text-emerald-400 print:text-black">{totalNetWorthInUsd.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
                  <td className="p-3 text-right text-indigo-400 print:text-black">{totalNetWorthInEur.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Detailed Multi-Currency Accounts & Banks Breakdown */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-slate-800 print:border-slate-300 pb-2">
            <h3 className="text-sm font-black text-white print:text-black flex items-center gap-2">
              <Landmark className="w-4.5 h-4.5 text-sky-400 print:text-black" />
              2. Детальна розгортка всіх банківських рахунків та готівки
            </h3>
            <button
              type="button"
              onClick={() => setIsSection2Open(prev => !prev)}
              className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1.5 py-1 px-3 rounded-xl bg-slate-900 border border-slate-850 hover:border-sky-500/40 transition-all cursor-pointer print:hidden"
            >
              <span>{isSection2Open ? "Згорнути" : "Розгорнути (Банки та Готівка)"}</span>
              {isSection2Open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          <div className={`overflow-x-auto print:block ${isSection2Open ? "block" : "hidden"}`}>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 print:bg-slate-200 text-slate-300 print:text-black font-black uppercase border-b border-slate-800 print:border-slate-300">
                  <th className="p-3">Рахунок / Джерело</th>
                  <th className="p-3 text-right">🇺🇦 Гривня (UAH ₴)</th>
                  <th className="p-3 text-right">🇺🇸 Долар (USD $)</th>
                  <th className="p-3 text-right">🇪🇺 Євро (EUR €)</th>
                  <th className="p-3 text-right">Еквівалент у UAH (₴)</th>
                  <th className="p-3 text-right">Еквівалент у USD ($)</th>
                  <th className="p-3 text-right">Еквівалент у EUR (€)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 print:divide-slate-300 font-medium">
                {/* Cash Row */}
                <tr className="hover:bg-slate-900/40 print:hover:bg-transparent bg-slate-900/20">
                  <td className="p-3 font-black text-emerald-400 print:text-black flex items-center gap-2">
                    <Wallet className="w-4 h-4" /> 💵 Готівка в наявності
                  </td>
                  <td className="p-3 text-right font-bold text-slate-200 print:text-black">{uahCash.toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right font-bold text-slate-200 print:text-black">{usdCash.toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right font-bold text-slate-200 print:text-black">{eurCash.toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right font-black text-emerald-400 print:text-black">{totalCashInUah.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴</td>
                  <td className="p-3 text-right font-black text-emerald-300 print:text-black">{totalCashInUsd.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $</td>
                  <td className="p-3 text-right font-black text-emerald-300 print:text-black">{totalCashInEur.toLocaleString("uk-UA", { maximumFractionDigits: 2 })} €</td>
                </tr>

                {/* Bank 1 */}
                <tr className="hover:bg-slate-900/40 print:hover:bg-transparent">
                  <td className="p-3 font-bold text-slate-300 print:text-black pl-6">
                    🏦 {getBankAlias("Банк 1", "UAH")}
                  </td>
                  <td className="p-3 text-right">{getBankVal(initData || uahData, "UAH", "Банк 1").toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right">{getBankVal(initData || usdData, "USD", "Банк 1").toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right">{getBankVal(initData || eurData, "EUR", "Банк 1").toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right font-bold text-sky-400 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 1"), "UAH", "UAH") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 1"), "USD", "UAH") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 1"), "EUR", "UAH")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴
                  </td>
                  <td className="p-3 text-right font-bold text-sky-300 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 1"), "UAH", "USD") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 1"), "USD", "USD") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 1"), "EUR", "USD")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $
                  </td>
                  <td className="p-3 text-right font-bold text-sky-300 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 1"), "UAH", "EUR") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 1"), "USD", "EUR") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 1"), "EUR", "EUR")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} €
                  </td>
                </tr>

                {/* Bank 2 */}
                <tr className="hover:bg-slate-900/40 print:hover:bg-transparent">
                  <td className="p-3 font-bold text-slate-300 print:text-black pl-6">
                    🏦 {getBankAlias("Банк 2", "UAH")}
                  </td>
                  <td className="p-3 text-right">{getBankVal(initData || uahData, "UAH", "Банк 2").toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right">{getBankVal(initData || usdData, "USD", "Банк 2").toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right">{getBankVal(initData || eurData, "EUR", "Банк 2").toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right font-bold text-sky-400 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 2"), "UAH", "UAH") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 2"), "USD", "UAH") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 2"), "EUR", "UAH")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴
                  </td>
                  <td className="p-3 text-right font-bold text-sky-300 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 2"), "UAH", "USD") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 2"), "USD", "USD") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 2"), "EUR", "USD")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $
                  </td>
                  <td className="p-3 text-right font-bold text-sky-300 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 2"), "UAH", "EUR") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 2"), "USD", "EUR") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 2"), "EUR", "EUR")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} €
                  </td>
                </tr>

                {/* Bank 3 */}
                <tr className="hover:bg-slate-900/40 print:hover:bg-transparent">
                  <td className="p-3 font-bold text-slate-300 print:text-black pl-6">
                    🏦 {getBankAlias("Банк 3", "UAH")}
                  </td>
                  <td className="p-3 text-right">{getBankVal(initData || uahData, "UAH", "Банк 3").toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right">{getBankVal(initData || usdData, "USD", "Банк 3").toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right">{getBankVal(initData || eurData, "EUR", "Банк 3").toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right font-bold text-sky-400 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 3"), "UAH", "UAH") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 3"), "USD", "UAH") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 3"), "EUR", "UAH")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴
                  </td>
                  <td className="p-3 text-right font-bold text-sky-300 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 3"), "UAH", "USD") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 3"), "USD", "USD") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 3"), "EUR", "USD")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $
                  </td>
                  <td className="p-3 text-right font-bold text-sky-300 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 3"), "UAH", "EUR") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 3"), "USD", "EUR") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 3"), "EUR", "EUR")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} €
                  </td>
                </tr>

                {/* Bank 4 */}
                <tr className="hover:bg-slate-900/40 print:hover:bg-transparent">
                  <td className="p-3 font-bold text-slate-300 print:text-black pl-6">
                    🏦 {getBankAlias("Банк 4", "UAH")}
                  </td>
                  <td className="p-3 text-right">{getBankVal(initData || uahData, "UAH", "Банк 4").toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right">{getBankVal(initData || usdData, "USD", "Банк 4").toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right">{getBankVal(initData || eurData, "EUR", "Банк 4").toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right font-bold text-sky-400 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 4"), "UAH", "UAH") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 4"), "USD", "UAH") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 4"), "EUR", "UAH")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴
                  </td>
                  <td className="p-3 text-right font-bold text-sky-300 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 4"), "UAH", "USD") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 4"), "USD", "USD") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 4"), "EUR", "USD")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $
                  </td>
                  <td className="p-3 text-right font-bold text-sky-300 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 4"), "UAH", "EUR") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 4"), "USD", "EUR") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 4"), "EUR", "EUR")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} €
                  </td>
                </tr>

                {/* Bank 5 */}
                <tr className="hover:bg-slate-900/40 print:hover:bg-transparent">
                  <td className="p-3 font-bold text-slate-300 print:text-black pl-6">
                    🏦 {getBankAlias("Банк 5", "UAH")}
                  </td>
                  <td className="p-3 text-right">{getBankVal(initData || uahData, "UAH", "Банк 5").toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right">{getBankVal(initData || usdData, "USD", "Банк 5").toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right">{getBankVal(initData || eurData, "EUR", "Банк 5").toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right font-bold text-sky-400 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 5"), "UAH", "UAH") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 5"), "USD", "UAH") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 5"), "EUR", "UAH")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴
                  </td>
                  <td className="p-3 text-right font-bold text-sky-300 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 5"), "UAH", "USD") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 5"), "USD", "USD") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 5"), "EUR", "USD")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} $
                  </td>
                  <td className="p-3 text-right font-bold text-sky-300 print:text-black">
                    {(
                      convertBalance(getBankVal(initData || uahData, "UAH", "Банк 5"), "UAH", "EUR") +
                      convertBalance(getBankVal(initData || usdData, "USD", "Банк 5"), "USD", "EUR") +
                      convertBalance(getBankVal(initData || eurData, "EUR", "Банк 5"), "EUR", "EUR")
                    ).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} €
                  </td>
                </tr>

                {/* Totals Summary Row */}
                <tr className="bg-slate-900/90 print:bg-slate-200 border-t-2 border-slate-700 print:border-slate-400 font-black">
                  <td className="p-3 text-white print:text-black">РАЗОМ ВЛАСНІ ГРОШІ (Готівка + Банки):</td>
                  <td className="p-3 text-right text-emerald-400 print:text-black">
                    {(uahCash + uahBanksTotal).toLocaleString("uk-UA")} ₴
                  </td>
                  <td className="p-3 text-right text-emerald-400 print:text-black">
                    {(usdCash + usdBanksTotal).toLocaleString("uk-UA")} $
                  </td>
                  <td className="p-3 text-right text-emerald-400 print:text-black">
                    {(eurCash + eurBanksTotal).toLocaleString("uk-UA")} €
                  </td>
                  <td className="p-3 text-right text-emerald-400 print:text-black">
                    {totalOwnFundsInUah.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                  </td>
                  <td className="p-3 text-right text-emerald-300 print:text-black">
                    {totalOwnFundsInUsd.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
                  </td>
                  <td className="p-3 text-right text-emerald-300 print:text-black">
                    {totalOwnFundsInEur.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: Master Multi-Currency Debtors & Creditors Registry */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 print:border-slate-300 pb-2">
            <div>
              <h3 className="text-sm font-black text-white print:text-black flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-purple-400 print:text-black" />
                3. Повний реєстр боргів та контрагентів за всіма валютами ({masterContractorsList.length})
              </h3>
              <p className="text-xs text-slate-400 print:text-slate-600 font-semibold mt-0.5">
                Відображає суму боргу кожного контрагента окремо у ₴ UAH, $ USD, € EUR та підсумковий еквівалент
              </p>
            </div>

            <div className="flex items-center gap-3 print:hidden">
              {/* Tab selector */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs font-bold">
                <button
                  onClick={() => setContractorTabFilter("all")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    contractorTabFilter === "all" ? "bg-sky-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Усі ({masterContractorsList.length})
                </button>
                <button
                  onClick={() => setContractorTabFilter("oweUs")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    contractorTabFilter === "oweUs" ? "bg-emerald-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Нам винні
                </button>
                <button
                  onClick={() => setContractorTabFilter("weOwe")}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    contractorTabFilter === "weOwe" ? "bg-red-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
                  }`}
                >
                  Ми винні
                </button>
              </div>

              {/* Search Filter */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Пошук контрагента..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-xl text-xs text-white pl-8 pr-3 py-1.5 outline-none focus:border-sky-500 transition-all w-48"
                />
              </div>
            </div>
          </div>

          {/* Master Multi-Currency Contractor Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 print:bg-slate-200 text-slate-300 print:text-black font-black uppercase border-b border-slate-800 print:border-slate-300">
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
              <tbody className="divide-y divide-slate-800/60 print:divide-slate-300 font-medium">
                {filteredContractors.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-slate-500 italic">
                      {searchQuery ? "Контрагентів не знайдено за запитом" : "Записів заборгованостей не знайдено"}
                    </td>
                  </tr>
                ) : (
                  filteredContractors.map((c, idx) => {
                    const isOweUs = c.netUahEquiv > 0.01;
                    const isWeOwe = c.netUahEquiv < -0.01;

                    return (
                      <tr 
                        key={idx} 
                        onClick={() => onSelectContractor?.(c.name)}
                        className="hover:bg-slate-900/60 print:hover:bg-transparent cursor-pointer transition-all"
                      >
                        <td className="p-3 font-black text-white print:text-black flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-sky-400 shrink-0" />
                          <span className="hover:underline">{c.name}</span>
                        </td>

                        {/* UAH debt */}
                        <td className={`p-3 text-right font-bold ${
                          c.uah > 0 ? "text-emerald-400 print:text-black" : c.uah < 0 ? "text-red-400 print:text-black" : "text-slate-500"
                        }`}>
                          {c.uah > 0 ? `+${c.uah.toLocaleString("uk-UA")}` : c.uah < 0 ? c.uah.toLocaleString("uk-UA") : "—"}
                        </td>

                        {/* USD debt */}
                        <td className={`p-3 text-right font-bold ${
                          c.usd > 0 ? "text-emerald-400 print:text-black" : c.usd < 0 ? "text-red-400 print:text-black" : "text-slate-500"
                        }`}>
                          {c.usd > 0 ? `+${c.usd.toLocaleString("uk-UA")}` : c.usd < 0 ? c.usd.toLocaleString("uk-UA") : "—"}
                        </td>

                        {/* EUR debt */}
                        <td className={`p-3 text-right font-bold ${
                          c.eur > 0 ? "text-emerald-400 print:text-black" : c.eur < 0 ? "text-red-400 print:text-black" : "text-slate-500"
                        }`}>
                          {c.eur > 0 ? `+${c.eur.toLocaleString("uk-UA")}` : c.eur < 0 ? c.eur.toLocaleString("uk-UA") : "—"}
                        </td>

                        {/* UAH Equiv */}
                        <td className={`p-3 text-right font-black ${
                          isOweUs ? "text-emerald-400 print:text-black" : isWeOwe ? "text-red-400 print:text-black" : "text-slate-400"
                        }`}>
                          {isOweUs ? `+${c.netUahEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴` : c.netUahEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* USD Equiv */}
                        <td className={`p-3 text-right font-black ${
                          isOweUs ? "text-emerald-300 print:text-black" : isWeOwe ? "text-red-300 print:text-black" : "text-slate-400"
                        }`}>
                          {isOweUs ? `+${c.netUsdEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $` : c.netUsdEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* EUR Equiv */}
                        <td className={`p-3 text-right font-black ${
                          isOweUs ? "text-emerald-300 print:text-black" : isWeOwe ? "text-red-300 print:text-black" : "text-slate-400"
                        }`}>
                          {isOweUs ? `+${c.netEurEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : c.netEurEquiv.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Status Badge */}
                        <td className="p-3 text-center">
                          {isOweUs ? (
                            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-black px-2 py-0.5 rounded-full">
                              Нам винен
                            </span>
                          ) : isWeOwe ? (
                            <span className="bg-red-500/10 text-red-400 border border-red-500/30 text-[10px] font-black px-2 py-0.5 rounded-full">
                              Ми винні
                            </span>
                          ) : (
                            <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                              Розраховано
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}

                {/* 1. Total Owe Us Row */}
                <tr className="bg-slate-900/80 print:bg-slate-100 border-t-2 border-slate-700 font-bold">
                  <td className="p-3 text-emerald-400 print:text-black font-black">
                    🟢 НАМ ВИННІ (Дебіторський борг):
                  </td>
                  <td className="p-3 text-right text-emerald-400 print:text-black font-black">+{oweUsTotals.UAH.toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right text-emerald-400 print:text-black font-black">+{oweUsTotals.USD.toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right text-emerald-400 print:text-black font-black">+{oweUsTotals.EUR.toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right text-emerald-400 print:text-black font-black">+{totalOweUsInUah.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
                  <td className="p-3 text-right text-emerald-300 print:text-black font-black">+{totalOweUsInUsd.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
                  <td className="p-3 text-right text-emerald-300 print:text-black font-black">+{totalOweUsInEur.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                  <td className="p-3 text-center text-slate-400 font-bold">Дебітори</td>
                </tr>

                {/* 2. Total We Owe Row */}
                <tr className="bg-slate-900/80 print:bg-slate-100 border-t border-slate-800 font-bold">
                  <td className="p-3 text-red-400 print:text-black font-black">
                    🔴 МИ ВИННІ (Кредиторський борг):
                  </td>
                  <td className="p-3 text-right text-red-400 print:text-black font-black">-{weOweTotals.UAH.toLocaleString("uk-UA")} ₴</td>
                  <td className="p-3 text-right text-red-400 print:text-black font-black">-{weOweTotals.USD.toLocaleString("uk-UA")} $</td>
                  <td className="p-3 text-right text-red-400 print:text-black font-black">-{weOweTotals.EUR.toLocaleString("uk-UA")} €</td>
                  <td className="p-3 text-right text-red-400 print:text-black font-black">-{totalWeOweInUah.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴</td>
                  <td className="p-3 text-right text-red-300 print:text-black font-black">-{totalWeOweInUsd.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</td>
                  <td className="p-3 text-right text-red-300 print:text-black font-black">-{totalWeOweInEur.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
                  <td className="p-3 text-center text-slate-400 font-bold">Кредитори</td>
                </tr>

                {/* 3. Net Debtors Final Balance Row */}
                <tr className="bg-slate-800/90 print:bg-slate-200 border-t-2 border-slate-600 print:border-slate-400 font-black text-sm">
                  <td className="p-3 text-white print:text-black flex items-center gap-1.5">
                    ⚖️ ЧИСТА ДЕБІТОРКА (Нам винні − Ми винні):
                  </td>
                  <td className="p-3 text-right text-sky-400 print:text-black">
                    {(oweUsTotals.UAH - weOweTotals.UAH) >= 0 ? "+" : ""}{(oweUsTotals.UAH - weOweTotals.UAH).toLocaleString("uk-UA")} ₴
                  </td>
                  <td className="p-3 text-right text-sky-400 print:text-black">
                    {(oweUsTotals.USD - weOweTotals.USD) >= 0 ? "+" : ""}{(oweUsTotals.USD - weOweTotals.USD).toLocaleString("uk-UA")} $
                  </td>
                  <td className="p-3 text-right text-sky-400 print:text-black">
                    {(oweUsTotals.EUR - weOweTotals.EUR) >= 0 ? "+" : ""}{(oweUsTotals.EUR - weOweTotals.EUR).toLocaleString("uk-UA")} €
                  </td>
                  <td className={`p-3 text-right font-black ${netDebtsUah >= 0 ? "text-emerald-400" : "text-red-400"} print:text-black`}>
                    {netDebtsUah >= 0 ? "+" : ""}{netDebtsUah.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                  </td>
                  <td className={`p-3 text-right font-black ${netDebtsUsd >= 0 ? "text-emerald-300" : "text-red-300"} print:text-black`}>
                    {netDebtsUsd >= 0 ? "+" : ""}{netDebtsUsd.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $
                  </td>
                  <td className={`p-3 text-right font-black ${netDebtsEur >= 0 ? "text-indigo-300" : "text-red-300"} print:text-black`}>
                    {netDebtsEur >= 0 ? "+" : ""}{netDebtsEur.toLocaleString("uk-UA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                  </td>
                  <td className="p-3 text-center text-sky-400 font-black">Чисте сальдо</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Explanation Box for Net Debtor/Creditor Balance */}
          <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-2xl text-xs text-slate-300 flex flex-col gap-2 print:bg-slate-50 print:border-slate-300 print:text-slate-800">
            <div className="font-bold text-sky-400 print:text-black flex items-center gap-2">
              💡 Розшифровка показника «Чиста дебіторка»:
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
              <div className="p-2.5 bg-emerald-950/30 print:bg-emerald-50 border border-emerald-500/20 rounded-xl">
                <span className="font-black text-emerald-400 print:text-emerald-800 block mb-0.5">1. Нам винні (Дебіторка)</span>
                Загальна сума коштів, яку боржники мають сплатити нашій компанії (+{totalOweUsInUah.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴ еквів).
              </div>
              <div className="p-2.5 bg-red-950/30 print:bg-red-50 border border-red-500/20 rounded-xl">
                <span className="font-black text-red-400 print:text-red-800 block mb-0.5">2. Ми винні (Кредиторка)</span>
                Загальна сума наших боргів перед постачальниками та контрагентами (-{totalWeOweInUah.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴ еквів).
              </div>
              <div className="p-2.5 bg-sky-950/30 print:bg-sky-50 border border-sky-500/20 rounded-xl">
                <span className="font-black text-sky-400 print:text-sky-800 block mb-0.5">3. Чиста дебіторка (Різниця)</span>
                {netDebtsUah >= 0 ? "Позитивний чистий актив" : "Від'ємний чистий пасив"}: (Нам винні) мінус (Ми винні). {netDebtsUah >= 0 ? "Нам винні більше, ніж ми." : "Ми винні більше, ніж нам."}
              </div>
            </div>
          </div>
        </div>

        {/* Official Sign-off Footer */}
        <div className="border-t-2 border-slate-800 print:border-slate-300 pt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 print:text-slate-800 font-bold">
          <div>
            Система автоматичного фінансового обліку • Зведений підсумок 360°
          </div>
          <div className="flex items-center gap-8">
            <div>Аудитор / Власник: ____________________</div>
            <div>Підпис: ____________________</div>
          </div>
        </div>

      </div>
    </div>
  );
};
