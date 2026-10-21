export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface BankBalances {
  "Готівка": number;
  "Банк 1": number;
  "Банк 2": number;
  "Банк 3": number;
  "Банк 4": number;
  "Банк 5": number;
}

export interface CapitalDetails {
  total: number;
  bankTotal: number;
  debtorsTotal: number;
  banks: BankBalances;
}

export interface DebtorItem {
  name: string;
  sum: number;
}

export interface DebtorsDetails {
  oweUs: DebtorItem[];
  weOwe: DebtorItem[];
  settled: DebtorItem[];
}

export interface InitData {
  names: string[];
  allAliases: {
    UAH: { [key: string]: string };
    USD: { [key: string]: string };
    EUR: { [key: string]: string };
  };
  globalTotals: {
    UAH: number;
    USD: number;
    EUR: number;
  };
  weOweTotals?: {
    UAH: number;
    USD: number;
    EUR: number;
  };
  oweUsTotals?: {
    UAH: number;
    USD: number;
    EUR: number;
  };
  debtorsTotals?: {
    UAH: number;
    USD: number;
    EUR: number;
  };
  allCashBalances: {
    UAH: number;
    USD: number;
    EUR: number;
  };
  allBankDetails?: {
    UAH: BankBalances;
    USD: BankBalances;
    EUR: BankBalances;
  };
  currency?: "UAH" | "USD" | "EUR";
  allDebtorsDetails?: {
    [currency: string]: DebtorsDetails;
  };
  allPlanned: any[];
  categories: string[];
  capital: CapitalDetails;
  debtors: DebtorsDetails;
  sheetConfigs: Array<{ title: string; sheetId: number }>;
  contractorLedger?: {
    [contractorName: string]: Array<{ text: string; sum: number }>;
  };
  rawMoneyRows?: string[][];
  allRawMoneyRows?: { [currency: string]: string[][] };
  allDebtorRows?: { [currency: string]: string[][] };
}

export interface PlannedItem {
  id?: string;
  name: string;
  sum: number;
  originalSum?: number;
  date: string;
  isRegular: boolean;
  currency?: string;
  type?: 'income' | 'expense';
  isInterest?: boolean;
  interestMode?: 'take' | 'give';
  interestRate?: number;
  interestPeriod?: 'annual' | 'monthly';
  interestStartDate?: string;
  accumulatedInterest?: number;
  dueDate?: string;
}

export interface HistoryItem {
  bank: string;
  text: string;
  sum: number;
  fullText: string;
  operation?: string;
  curr?: "UAH" | "USD" | "EUR";
  isIncome?: boolean;
  isInterestFulfillment?: boolean;
}

export interface HistoryGroup {
  timestamp: number;
  dateStr: string;
  operation: string;
  items: HistoryItem[];
  totalSum: number;
  isIncome: boolean;
  curr?: "UAH" | "USD" | "EUR";
  isInterestFulfillment?: boolean;
}

export interface MonthlyReportItem {
  label: string;
  inc: number;
  exp: number;
  sortKey: string;
  currency?: "UAH" | "USD" | "EUR";
  items: Array<{
    type: 'inc' | 'exp';
    sum: number;
    text: string;
    dateStr: string;
    fullText: string;
    curr?: "UAH" | "USD" | "EUR";
  }>;
}
