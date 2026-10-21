import { isValidContractorName } from "./googleSheetsUtils";
import { parseTransactionText } from "./lib/transactionUtils";
import { PlannedItem, MonthlyReportItem, DebtorsDetails } from "./types";

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retries = 3,
  delay = 800
): Promise<Response> {
  let lastError: any = null;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 401) {
        return res;
      }
      if (res.ok) {
        return res;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new Error(`HTTP ${res.status}: ${res.statusText || 'Error'}`);
        if (i < retries - 1) {
          // For 429 rate limit, wait progressively: ~1.5s, ~3s
          const waitTime = res.status === 429
            ? Math.max(delay * Math.pow(2, i), 1500 * (i + 1)) + Math.random() * 300
            : delay * Math.pow(2, i) + Math.random() * 200;
          console.warn(`[fetchWithRetry] HTTP ${res.status}, waiting ${Math.round(waitTime)}ms before retry ${i + 1}/${retries}...`);
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
      }
      return res;
    } catch (err: any) {
      lastError = err;
      const isFailedFetch = err?.name === "TypeError" || err?.message?.includes("Failed to fetch");
      if (isFailedFetch && i >= 1) {
        // Fast-fail if CORS or network completely blocks fetch
        break;
      }
      if (i < retries - 1) {
        const waitTime = isFailedFetch ? 400 : (delay * Math.pow(2, i) + Math.random() * 200);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }
  throw lastError || new Error("Request failed after retries");
}

export function parseSheetFloat(val: any): number {
  if (val === undefined || val === null) return NaN;
  if (typeof val === "number") return isNaN(val) ? NaN : val;
  let str = val.toString().trim();
  if (str === "") return NaN;

  // Reject date/time strings from being mistakenly parsed as floats (e.g. "12.04.2024" -> NaN instead of 12.04)
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(str)) return NaN;
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(str)) return NaN;

  // Remove currency signs and common currency suffixes/prefixes
  str = str.replace(/[$€₴]/g, "").replace(/\b(?:usd|eur|uah|грн)\b/gi, "").trim();
  // Remove space and non-breaking space
  str = str.replace(/[\s\u00a0]/g, "");

  // Normalize unicode minuses and dashes to standard ASCII minus
  str = str.replace(/[−–—]/g, "-");
  // Check for accounting negative format: (123.45) -> -123.45
  if (/^\(.*\)$/.test(str)) {
    str = "-" + str.slice(1, -1);
  }

  // Handle commas and dots
  const hasComma = str.includes(",");
  const hasDot = str.includes(".");
  if (hasComma && hasDot) {
    if (str.indexOf(",") < str.indexOf(".")) {
      // US format: comma is thousands separator, dot is decimal (e.g. "1,250.50")
      str = str.replace(/,/g, "");
    } else {
      // European format: dot is thousands separator, comma is decimal (e.g. "1.250,50")
      str = str.replace(/\./g, "").replace(/,/g, ".");
    }
  } else if (hasComma) {
    const commaCount = (str.match(/,/g) || []).length;
    if (commaCount > 1) {
      str = str.replace(/,/g, "");
    } else {
      str = str.replace(",", ".");
    }
  } else if (hasDot) {
    const dotCount = (str.match(/\./g) || []).length;
    if (dotCount > 1) {
      // European thousands format with dots: e.g. "1.250.000"
      str = str.replace(/\./g, "");
    }
  }
  return parseFloat(str);
}

export function cleanSpreadsheetId(id: string): string {
  if (!id) return "";
  let clean = id.trim();
  const match = clean.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  clean = clean.split("/")[0].split("?")[0].split("#")[0].trim();
  return clean;
}

export interface SheetConfig {
  title: string;
  sheetId: number;
}

export function getSheetsForCurrency(currency: string, sheetNames: string[]) {
  let c = (currency || "UAH").toUpperCase();
  if (c === "$") c = "USD";
  if (c === "€") c = "EUR";
  if (c === "₴") c = "UAH";
  const lowerNamesNormalized = sheetNames.map(n => n.toLowerCase().trim());
  
  const findBestMatch = (possibleKeys: string[], defaultFallback: string) => {
    // 1. Try exact normalized match (lowercase + trimmed)
    for (const key of possibleKeys) {
      const idx = lowerNamesNormalized.indexOf(key.toLowerCase().trim());
      if (idx !== -1) return sheetNames[idx];
    }
    // 2. Try substring matching (e.g. if sheet name contains the key)
    for (const key of possibleKeys) {
      const target = key.toLowerCase().trim();
      const idx = lowerNamesNormalized.findIndex(n => n.includes(target));
      if (idx !== -1) return sheetNames[idx];
    }
    // 3. Fallback
    return defaultFallback;
  };

  if (c === "UAH") {
    return {
      money: findBestMatch(["кошти", "гроші", "money", "uah", "гривня", "грн"], "кошти"),
      contractors: findBestMatch(["контрагенти", "contractors", "partners"], "контрагенти"),
      debtors: findBestMatch(["боржники", "debtors", "debts"], "боржники")
    };
  }
  
  const suffix = c.toLowerCase(); // "usd", "eur"
  const isUsd = c === "USD";
  
  const findMoneyMatch = () => {
    // 1. Exact matches
    const exactKeys = isUsd 
      ? ["usd", "$", "долар", "долари", "дол", "dollar", "dollars", "кошти usd", "кошти $", "кошти (usd)", "кошти ($)", "гроші usd", "гроші $"]
      : ["eur", "€", "євро", "евро", "euro", "euros", "кошти eur", "кошти €", "кошти (eur)", "кошти (€)", "гроші eur", "гроші €"];

    for (const key of exactKeys) {
      const idx = lowerNamesNormalized.indexOf(key);
      if (idx !== -1) return sheetNames[idx];
    }

    // 2. Substring matches excluding contractors and debtors
    const containsKeys = isUsd
      ? ["usd", "$", "долар", "dollar"]
      : ["eur", "€", "євро", "евро", "euro"];

    for (const key of containsKeys) {
      const idx = lowerNamesNormalized.findIndex(n => 
        n.includes(key) && !n.includes("контрагент") && !n.includes("борж") && !n.includes("partner") && !n.includes("debt")
      );
      if (idx !== -1) return sheetNames[idx];
    }

    return suffix;
  };

  const contractorsKeys = isUsd
    ? [`контрагенти_${suffix}`, `контрагенти ${suffix}`, `контрагенти_$`, `контрагенти $`, `контрагенти (usd)`, `контрагенти ($)`, `contractors_${suffix}`, `contractors ${suffix}`, `partners_${suffix}`]
    : [`контрагенти_${suffix}`, `контрагенти ${suffix}`, `контрагенти_€`, `контрагенти €`, `контрагенти (eur)`, `контрагенти (€)`, `contractors_${suffix}`, `contractors ${suffix}`, `partners_${suffix}`];

  const debtorsKeys = isUsd
    ? [`боржники_${suffix}`, `боржники ${suffix}`, `боржники_$`, `боржники $`, `боржники (usd)`, `боржники ($)`, `debtors_${suffix}`, `debtors ${suffix}`, `debts_${suffix}`]
    : [`боржники_${suffix}`, `боржники ${suffix}`, `боржники_€`, `боржники €`, `боржники (eur)`, `боржники (€)`, `debtors_${suffix}`, `debtors ${suffix}`, `debts_${suffix}`];

  return {
    money: findMoneyMatch(),
    contractors: findBestMatch(contractorsKeys, `контрагенти_${suffix}`),
    debtors: findBestMatch(debtorsKeys, `боржники_${suffix}`)
  };
}

export function getCustomCategories(): string[] {
  const defaultCats = ["Продукти", "Комунальні послуги", "Автомобіль / Паливо", "Будівництво", "Особисті витрати"];
  try {
    const cats = localStorage.getItem("custom_financial_categories");
    if (!cats) {
      localStorage.setItem("custom_financial_categories", JSON.stringify(defaultCats));
      return defaultCats;
    }
    const parsed = JSON.parse(cats);
    return Array.isArray(parsed) ? parsed : defaultCats;
  } catch (e) {
    return defaultCats;
  }
}

export function saveCustomCategory(catName: string): string[] {
  const cats = getCustomCategories();
  const trimmed = (catName || "").trim();
  if (trimmed !== "" && !cats.some(c => c.trim().toLowerCase() === trimmed.toLowerCase())) {
    cats.push(trimmed);
    try {
      localStorage.setItem("custom_financial_categories", JSON.stringify(cats));
    } catch (e) { console.warn("Failed to save custom category:", e); }
  }
  return cats;
}

export function deleteCustomCategory(catName: string): string[] {
  const cats = getCustomCategories();
  const target = (catName || "").trim().toLowerCase();
  const updated = cats.filter(c => (c || "").trim().toLowerCase() !== target);
  try {
    localStorage.setItem("custom_financial_categories", JSON.stringify(updated));
  } catch (e) { console.warn("Failed to delete custom category:", e); }
  return updated;
}

export function getPlannedItems(currency: string, type: string): any[] {
  const c = (currency || "UAH").toLowerCase();
  const key = 'planned' + (type === 'expense' ? 'Exp_' : 'Inc_') + c;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

export function savePlannedItem(item: any, currency: string, type: string): any[] {
  const c = (currency || "UAH").toLowerCase();
  const key = 'planned' + (type === 'expense' ? 'Exp_' : 'Inc_') + c;
  const list = getPlannedItems(c, type);
  if (item.id) {
    for (let i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(item.id)) {
        list[i].name = item.name;
        list[i].sum = item.sum;
        if (item.isRegular) list[i].originalSum = item.sum;
        list[i].date = item.date;
        list[i].isRegular = item.isRegular;
        // Interest fields
        list[i].isInterest = item.isInterest;
        list[i].interestMode = item.interestMode;
        list[i].interestRate = item.interestRate;
        list[i].interestPeriod = item.interestPeriod;
        list[i].interestStartDate = item.interestStartDate;
        list[i].accumulatedInterest = item.accumulatedInterest || 0;
        list[i].dueDate = item.dueDate;
        break;
      }
    }
  } else {
    item.id = new Date().getTime().toString();
    item.originalSum = item.sum;
    // Interest fields for new items
    item.isInterest = item.isInterest || false;
    item.interestMode = item.interestMode || "take";
    item.interestRate = item.interestRate || 0;
    item.interestPeriod = item.interestPeriod || "annual";
    item.interestStartDate = item.interestStartDate || item.date || new Date().toISOString().split('T')[0];
    item.accumulatedInterest = item.accumulatedInterest || 0;
    item.dueDate = item.dueDate || "";
    list.push(item);
  }
  localStorage.setItem(key, JSON.stringify(list));
  return list;
}

export function deletePlannedItem(id: string, currency: string, type: string): any[] {
  const c = (currency || "UAH").toLowerCase();
  const key = 'planned' + (type === 'expense' ? 'Exp_' : 'Inc_') + c;
  let list = getPlannedItems(c, type);
  list = list.filter(i => String(i.id) !== String(id));
  localStorage.setItem(key, JSON.stringify(list));
  return list;
}

export function parseDateString(dateStr: string): [number, number, number] | null {
  if (!dateStr) return null;
  const cleaned = dateStr.trim();
  if (cleaned.includes(".")) {
    const parts = cleaned.split(".").map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      if (parts[0] > 1000) {
        return [parts[0], parts[1], parts[2]];
      }
      return [parts[2], parts[1], parts[0]];
    }
    if (parts.length === 2 && !parts.some(isNaN)) {
      const currentYear = new Date().getFullYear();
      return [currentYear, parts[1], parts[0]];
    }
  }
  if (cleaned.includes("-")) {
    const parts = cleaned.split("-").map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      if (parts[0] > 1000) {
        return [parts[0], parts[1], parts[2]];
      }
      return [parts[2], parts[1], parts[0]];
    }
    if (parts.length === 2 && !parts.some(isNaN)) {
      const currentYear = new Date().getFullYear();
      return [currentYear, parts[1], parts[0]];
    }
  }
  const d = new Date(cleaned);
  if (!isNaN(d.getTime())) {
    return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
  }
  return null;
}

export function formatDateUkr(dateStr: string): string {
  if (!dateStr) return "";
  const parts = parseDateString(dateStr);
  if (parts) {
    const [y, m, d] = parts;
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
  }
  return dateStr;
}

export function getDaysInMonth(year: number, month1Indexed: number): number {
  return new Date(year, month1Indexed, 0).getDate();
}

export function calculateAccruedInterest(
  baseSum: number,
  rate: number,
  period: "monthly" | "annual" | string | undefined,
  startStr: string,
  targetStr: string
): { accrued: number; elapsedDays: number; elapsedMonths: number } {
  const parts1 = parseDateString(startStr);
  const parts2 = parseDateString(targetStr);
  if (!parts1 || !parts2 || rate <= 0 || baseSum <= 0) {
    return { accrued: 0, elapsedDays: 0, elapsedMonths: 0 };
  }

  const [y1, m1, d1] = parts1;
  const [y2, m2, d2] = parts2;

  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const elapsedDays = Math.max(0, Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24)));

  if (period === "monthly") {
    let fullMonths = (y2 - y1) * 12 + (m2 - m1);
    let extraDays = 0;

    if (d2 >= d1) {
      extraDays = d2 - d1;
    } else {
      const daysInTargetMonth = getDaysInMonth(y2, m2);
      if (d2 === daysInTargetMonth && d1 >= daysInTargetMonth) {
        extraDays = 0;
      } else {
        fullMonths -= 1;
        const prevMonthIndex = m1 - 1 + Math.max(0, fullMonths);
        const prevYear = y1 + Math.floor(prevMonthIndex / 12);
        const prevMonth1Ind = (prevMonthIndex % 12) + 1;
        const safeD1 = Math.min(d1, getDaysInMonth(prevYear, prevMonth1Ind));
        
        const lastFullMonthDate = Date.UTC(prevYear, prevMonth1Ind - 1, safeD1);
        extraDays = Math.max(0, Math.floor((utc2 - lastFullMonthDate) / (1000 * 60 * 60 * 24)));
      }
    }

    const elapsedMonths = Math.max(0, fullMonths + extraDays / 30);
    const accrued = Number((baseSum * (rate / 100) * elapsedMonths).toFixed(2));
    return { accrued, elapsedDays, elapsedMonths };
  } else {
    const elapsedMonths = elapsedDays / 30;
    const accrued = Number((baseSum * (rate / 100) * (elapsedDays / 365)).toFixed(2));
    return { accrued, elapsedDays, elapsedMonths };
  }
}

export function parsePlannedRows(rows: string[][]): PlannedItem[] {
  if (!rows || rows.length <= 1) return [];
  const items: PlannedItem[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    items.push({
      id: r[0],
      currency: r[1] || "UAH",
      type: (r[2] as 'income' | 'expense') || "expense",
      name: r[3] || "",
      sum: parseSheetFloat(r[4]) || 0,
      date: r[5] || "",
      isRegular: r[6] === "TRUE",
      isInterest: r[7] === "TRUE",
      interestMode: (r[8] as 'take' | 'give') || "take",
      interestRate: parseSheetFloat(r[9]) || 0,
      interestPeriod: (r[10] as 'annual' | 'monthly') || "annual",
      interestStartDate: r[11] || "",
      originalSum: parseSheetFloat(r[12]) || parseSheetFloat(r[4]) || 0,
      dueDate: r[13] || "",
      accumulatedInterest: parseSheetFloat(r[14]) || 0,
    });
  }
  return items;
}

export async function ensurePlannedSheet(
  rawSpreadsheetId: string,
  token: string,
  sheetNames: string[],
  sheetConfigs: SheetConfig[]
): Promise<string[]> {
  const spreadsheetId = cleanSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId) return sheetNames;
  if (sheetNames.includes("Заплановано")) {
    return sheetNames;
  }
  try {
    const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: "Заплановано"
              }
            }
          }
        ]
      })
    });
    if (res.ok) {
      const data = await res.json();
      const addedProperties = data.replies?.[0]?.addSheet?.properties;
      if (addedProperties) {
        sheetConfigs.push({
          title: addedProperties.title,
          sheetId: addedProperties.sheetId
        });
        sheetNames.push(addedProperties.title);
        
        await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("Заплановано!A1")}?valueInputOption=USER_ENTERED`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            values: [[
              "ID", "Валюта", "Тип", "Назва", "Сума", "Дата", "Регулярний", "Депозит/Кредит", "Режим відсотків", "Ставка відсотків", "Період відсотків", "Дата старту відсотків", "Початкова сума", "Дата сплати", "Накопичені відсотки"
            ]]
          })
        });
      }
    }
  } catch (e) {
    console.error("Failed to create 'Заплановано' sheet:", e);
  }
  return sheetNames;
}

export async function savePlannedListToSheet(rawSpreadsheetId: string, token: string, items: any[]): Promise<boolean> {
  const spreadsheetId = cleanSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId) return false;
  const header = [
    "ID", "Валюта", "Тип", "Назва", "Сума", "Дата", "Регулярний", "Депозит/Кредит", "Режим відсотків", "Ставка відсотків", "Період відсотків", "Дата старту відсотків", "Початкова сума", "Дата сплати", "Накопичені відсотки"
  ];
  const values = [
    header,
    ...items.map(item => [
      item.id || new Date().getTime().toString() + Math.random().toString(36).substr(2, 5),
      (item.currency || "UAH").toUpperCase(),
      item.type || "expense",
      item.name || "",
      item.sum !== undefined ? item.sum : 0,
      item.date || "",
      item.isRegular ? "TRUE" : "FALSE",
      item.isInterest ? "TRUE" : "FALSE",
      item.interestMode || "take",
      item.interestRate !== undefined ? item.interestRate : 0,
      item.interestPeriod || "annual",
      item.interestStartDate || "",
      item.originalSum !== undefined ? item.originalSum : (item.sum !== undefined ? item.sum : 0),
      item.dueDate || "",
      item.accumulatedInterest !== undefined ? item.accumulatedInterest : 0
    ])
  ];
  
  try {
    await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("Заплановано!A1:O1000")}:clear`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (e) {
    console.error("Error clearing planned sheet:", e);
  }

  const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("Заплановано!A1:O1000")}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  });
  return res.ok;
}

export async function savePlannedItemOnline(
  spreadsheetId: string,
  token: string,
  item: any,
  currency: string,
  type: string,
  allPlanned: any[]
): Promise<boolean> {
  const c = (currency || "UAH").toUpperCase();
  const list = [...allPlanned];
  
  if (item.id) {
    const idx = list.findIndex(i => String(i.id) === String(item.id));
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        name: item.name,
        sum: item.sum,
        date: item.date,
        isRegular: item.isRegular,
        originalSum: item.isRegular ? item.sum : (item.originalSum || item.sum),
        isInterest: item.isInterest || false,
        interestMode: item.interestMode || "take",
        interestRate: item.interestRate || 0,
        interestPeriod: item.interestPeriod || "annual",
        interestStartDate: item.interestStartDate || item.date || new Date().toISOString().split('T')[0],
        accumulatedInterest: item.accumulatedInterest || 0,
        dueDate: item.dueDate || ""
      };
    }
  } else {
    const newItem = {
      id: new Date().getTime().toString() + Math.random().toString(36).substr(2, 5),
      currency: c,
      type: type,
      name: item.name,
      sum: item.sum,
      originalSum: item.sum,
      date: item.date,
      isRegular: item.isRegular || false,
      isInterest: item.isInterest || false,
      interestMode: item.interestMode || "take",
      interestRate: item.interestRate || 0,
      interestPeriod: item.interestPeriod || "annual",
      interestStartDate: item.interestStartDate || item.date || new Date().toISOString().split('T')[0],
      accumulatedInterest: item.accumulatedInterest || 0,
      dueDate: item.dueDate || ""
    };
    list.push(newItem);
  }
  
  return savePlannedListToSheet(spreadsheetId, token, list);
}

export async function deletePlannedItemOnline(
  spreadsheetId: string,
  token: string,
  id: string,
  allPlanned: any[]
): Promise<boolean> {
  const list = allPlanned.filter(i => String(i.id) !== String(id));
  return savePlannedListToSheet(spreadsheetId, token, list);
}

async function fetchSheetValues(rawSpreadsheetId: string, token: string, range: string): Promise<string[][]> {
  const spreadsheetId = cleanSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId) return [];
  let safeRange = range;
  const exclIdx = range.lastIndexOf("!");
  if (exclIdx !== -1) {
    const sheetPart = range.substring(0, exclIdx);
    const cellPart = range.substring(exclIdx + 1);
    if (!sheetPart.startsWith("'") && !sheetPart.endsWith("'")) {
      safeRange = `'${sheetPart.replace(/'/g, "''")}'!${cellPart}`;
    }
  }
  try {
    const res = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(safeRange)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.values || [];
  } catch (e) {
    console.warn(`[fetchSheetValues] Failed to fetch range ${safeRange}:`, e);
    return [];
  }
}

export async function getInitData(rawSpreadsheetId: string, token: string, currency: string) {
  const spreadsheetId = cleanSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId) {
    throw new Error("Не вказано або некоректний ID Google Таблиці.");
  }
  let metaRes: Response;
  try {
    metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title,sheetId))`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (err: any) {
    if (err?.name === "TypeError" || err?.message?.includes("Failed to fetch") || err?.message?.includes("NetworkError")) {
      throw new Error("AUTH_EXPIRED");
    }
    throw err;
  }

  if (!metaRes.ok) {
    if (metaRes.status === 401) {
      throw new Error("AUTH_EXPIRED");
    }
    if (metaRes.status === 429) {
      throw new Error("429: Перевищено ліміт запитів до Google Таблиці (Read requests per minute). Будь ласка, зачекайте кілька секунд або використовуйте кешовані дані.");
    }
    let details = "";
    try {
      const errJson = await metaRes.json();
      if (errJson?.error?.message) {
        details = `: ${errJson.error.message}`;
      }
    } catch (e) {}
    throw new Error(`Failed to fetch spreadsheet metadata: ${metaRes.status}${details}`);
  }
  const meta = await metaRes.json();
  const sheetConfigs: SheetConfig[] = meta.sheets?.map((s: any) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId
  })) || [];
  let sheetNames = sheetConfigs.map(s => s.title);

  sheetNames = await ensurePlannedSheet(spreadsheetId, token, sheetNames, sheetConfigs);
  
  const currList = ["UAH", "USD", "EUR"];
  const requestedRanges: string[] = [];
  const rangeMap: { [key: string]: number } = {};
  
  currList.forEach(c => {
    const sInfo = getSheetsForCurrency(c, sheetNames);
    const moneySheet = sheetNames.find(s => s.toLowerCase().trim() === sInfo.money.toLowerCase().trim());
    if (moneySheet) {
      rangeMap[`${c}_money`] = requestedRanges.length;
      requestedRanges.push(`'${moneySheet.replace(/'/g, "''")}'!A1:L1000`);
    }
    const contractorsSheet = sheetNames.find(s => s.toLowerCase().trim() === sInfo.contractors.toLowerCase().trim());
    if (contractorsSheet) {
      rangeMap[`${c}_contractors`] = requestedRanges.length;
      requestedRanges.push(`'${contractorsSheet.replace(/'/g, "''")}'!A1:C1000`);
    }
    const debtorsSheet = sheetNames.find(s => s.toLowerCase().trim() === sInfo.debtors.toLowerCase().trim());
    if (debtorsSheet) {
      rangeMap[`${c}_debtors`] = requestedRanges.length;
      requestedRanges.push(`'${debtorsSheet.replace(/'/g, "''")}'!A1:D1000`);
    }
  });

  if (sheetNames.includes("Заплановано")) {
    rangeMap["planned_transactions"] = requestedRanges.length;
    requestedRanges.push("'Заплановано'!A1:O1000");
  }
  
  let batchData = { valueRanges: [] };
  if (requestedRanges.length > 0) {
    const urlParams = requestedRanges.map(r => `ranges=${encodeURIComponent(r)}`).join("&");
    let batchRes: Response;
    try {
      batchRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${urlParams}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err: any) {
      if (err?.name === "TypeError" || err?.message?.includes("Failed to fetch") || err?.message?.includes("NetworkError")) {
        throw new Error("AUTH_EXPIRED");
      }
      throw err;
    }
    if (!batchRes.ok) {
      if (batchRes.status === 401) {
        throw new Error("AUTH_EXPIRED");
      }
      throw new Error(`Failed to batch get values: ${batchRes.statusText}`);
    }
    batchData = await batchRes.json();
  }
  const valueRanges = batchData.valueRanges || [];
  
  const getValuesForKey = (key: string): string[][] => {
    const idx = rangeMap[key];
    if (idx === undefined || !valueRanges[idx]) return [];
    return valueRanges[idx].values || [];
  };
  
  const allAliases: any = { UAH: {}, USD: {}, EUR: {} };
  const globalTotals: any = { UAH: 0, USD: 0, EUR: 0 };
  const oweUsTotals: any = { UAH: 0, USD: 0, EUR: 0 };
  const weOweTotals: any = { UAH: 0, USD: 0, EUR: 0 };
  const debtorsTotals: any = { UAH: 0, USD: 0, EUR: 0 };
  const allCashBalances: any = { UAH: 0, USD: 0, EUR: 0 };
  const allBankDetails: any = {
    UAH: { 'Готівка': 0, 'Банк 1': 0, 'Банк 2': 0, 'Банк 3': 0, 'Банк 4': 0, 'Банк 5': 0 },
    USD: { 'Готівка': 0, 'Банк 1': 0, 'Банк 2': 0, 'Банк 3': 0, 'Банк 4': 0, 'Банк 5': 0 },
    EUR: { 'Готівка': 0, 'Банк 1': 0, 'Банк 2': 0, 'Банк 3': 0, 'Банк 4': 0, 'Банк 5': 0 }
  };
  const allNamesObj: any = {};
  
  const categories = getCustomCategories();
  let aggregatedPlanned: any[] = [];
  
  if (sheetNames.includes("Заплановано")) {
    const plannedRows = getValuesForKey("planned_transactions");
    if (plannedRows && plannedRows.length > 1) {
      aggregatedPlanned = parsePlannedRows(plannedRows);
      currList.forEach(c => {
        const cLower = c.toLowerCase();
        const incs = aggregatedPlanned.filter(p => p.currency === c && p.type === 'income');
        const exps = aggregatedPlanned.filter(p => p.currency === c && p.type === 'expense');
        localStorage.setItem('plannedInc_' + cLower, JSON.stringify(incs));
        localStorage.setItem('plannedExp_' + cLower, JSON.stringify(exps));
      });
    } else {
      // Migrate from localStorage
      const localPlanned: any[] = [];
      currList.forEach(curLoop => {
        const incs = getPlannedItems(curLoop, 'income');
        const exps = getPlannedItems(curLoop, 'expense');
        incs.forEach((p: any) => { p.currency = curLoop; p.type = 'income'; localPlanned.push(p); });
        exps.forEach((p: any) => { p.currency = curLoop; p.type = 'expense'; localPlanned.push(p); });
      });
      if (localPlanned.length > 0) {
        await savePlannedListToSheet(spreadsheetId, token, localPlanned);
        aggregatedPlanned = localPlanned;
      }
    }
  }
  
  const allRawMoneyRows: { [currency: string]: string[][] } = {};
  const allDebtorRows: { [currency: string]: string[][] } = {};
  
  const allDebtorsDetails: { [c: string]: DebtorsDetails } = {
    UAH: { oweUs: [], weOwe: [], settled: [] },
    USD: { oweUs: [], weOwe: [], settled: [] },
    EUR: { oweUs: [], weOwe: [], settled: [] }
  };

  for (let k = 0; k < currList.length; k++) {
    const c = currList[k];
    const dataK = getValuesForKey(`${c}_money`);
    allRawMoneyRows[c] = dataK;
    const dataC = getValuesForKey(`${c}_contractors`);
    const dataD = getValuesForKey(`${c}_debtors`);
    allDebtorRows[c] = dataD;
    
    allAliases[c] = { 'Готівка': 'Готівка', 'Банк 1': 'Банк 1', 'Банк 2': 'Банк 2', 'Банк 3': 'Банк 3', 'Банк 4': 'Банк 4', 'Банк 5': 'Банк 5' };
    let cTotal = 0;
    let cCash = 0;
    
    if (dataK.length >= 1) {
      const h = dataK[0];
      if (h && h[0]) allAliases[c]['Готівка'] = h[0].toString().trim();
      if (h && h[2]) allAliases[c]['Банк 1'] = h[2].toString().trim();
      if (h && h[4]) allAliases[c]['Банк 2'] = h[4].toString().trim();
      if (h && h[6]) allAliases[c]['Банк 3'] = h[6].toString().trim();
      if (h && h[8]) allAliases[c]['Банк 4'] = h[8].toString().trim();
      if (h && h[10]) allAliases[c]['Банк 5'] = h[10].toString().trim();
      
      const cols = [1, 3, 5, 7, 9, 11];
      const bankKeys = ['Готівка', 'Банк 1', 'Банк 2', 'Банк 3', 'Банк 4', 'Банк 5'];
      for (let i = 1; i < dataK.length; i++) {
        const row = dataK[i];
        if (row && row.length > 1) {
          const cashVal = parseSheetFloat(row[1]);
          if (!isNaN(cashVal)) cCash += cashVal;
        }
        cols.forEach((colIndex, idx) => {
          if (row && row.length > colIndex) {
            const val = parseSheetFloat(row[colIndex]);
            if (!isNaN(val)) {
              cTotal += val;
              const bKey = bankKeys[idx];
              allBankDetails[c][bKey] = Number((allBankDetails[c][bKey] + val).toFixed(2));
            }
          }
        });
      }
    }
    
    if (dataC.length >= 1) {
      for (let i = 0; i < dataC.length; i++) {
        const row = dataC[i];
        const t = row && row[0] ? row[0].toString().trim() : "";
        if (t && isValidContractorName(t)) {
          allNamesObj[t] = true;
        }
      }
    }
    
    let cWeOwe = 0;
    let cOweUs = 0;
    let cNetDebtors = 0;
    if (dataC.length >= 1) {
      const cNetContractors: any = {};
      let curName: string | null = null;
      for (let i = 0; i < dataC.length; i++) {
        const row = dataC[i];
        const t = row && row[0] ? row[0].toString().trim() : "";
        const s = row && row.length > 1 ? parseSheetFloat(row[1]) : NaN;
        if (t) {
          if (isValidContractorName(t)) {
            curName = t;
            if (cNetContractors[curName] === undefined) cNetContractors[curName] = 0;
          } else if (curName) {
            let val = !isNaN(s) ? s : 0;
            if (t.includes("Початковий борг (+)") || t.includes("нам винні:")) {
              val = Math.abs(val);
            } else if (t.includes("Початковий борг (-)") || t.includes("ми винні:")) {
              val = -Math.abs(val);
            }
            cNetContractors[curName] = Number((cNetContractors[curName] + val).toFixed(2));
          }
        }
      }
      const cOweUsList: any[] = [];
      const cWeOweList: any[] = [];
      const cSettledList: any[] = [];
      for (const name in cNetContractors) {
        const bal = cNetContractors[name];
        cNetDebtors = Number((cNetDebtors + bal).toFixed(2));
        if (bal > 0.01) {
          cOweUs += bal;
          cOweUsList.push({ name: name, sum: bal });
        } else if (bal < -0.01) {
          cWeOwe += Math.abs(bal);
          cWeOweList.push({ name: name, sum: Math.abs(bal) });
        } else {
          cSettledList.push({ name: name, sum: 0 });
        }
      }
      allDebtorsDetails[c] = {
        oweUs: cOweUsList.sort((a, b) => b.sum - a.sum),
        weOwe: cWeOweList.sort((a, b) => b.sum - a.sum),
        settled: cSettledList.sort((a, b) => a.name.localeCompare(b.name))
      };
    }
    weOweTotals[c] = Number(cWeOwe.toFixed(2));
    oweUsTotals[c] = Number(cOweUs.toFixed(2));
    debtorsTotals[c] = Number(cNetDebtors.toFixed(2));

    // Global totals include net debtor balances so if a debtor owes us money, it counts as capital
    globalTotals[c] = Number((cTotal + cNetDebtors).toFixed(2));

    allCashBalances[c] = Number(cCash.toFixed(2));
  }
  
  const fullDataK = getValuesForKey(`${currency}_money`);
  const dataCSelected = getValuesForKey(`${currency}_contractors`);
  
  let bankTotal = 0;
  const banks: any = { 'Готівка': 0, 'Банк 1': 0, 'Банк 2': 0, 'Банк 3': 0, 'Банк 4': 0, 'Банк 5': 0 };
  
  if (fullDataK.length >= 2) {
    const cols = [1, 3, 5, 7, 9, 11];
    const keys = Object.keys(banks);
    for (let i = 1; i < fullDataK.length; i++) {
      const row = fullDataK[i];
      for (let j = 0; j < 6; j++) {
        const colIndex = cols[j];
        if (row && row.length > colIndex) {
          const val = parseSheetFloat(row[colIndex]);
          if (!isNaN(val)) {
            const bKey = keys[j];
            banks[bKey] = Number((banks[bKey] + val).toFixed(2));
            bankTotal = Number((bankTotal + val).toFixed(2));
          }
        }
      }
    }
  }
  
  const netContractors: any = {};
  const contractorLedger: { [contractorName: string]: Array<{ text: string; sum: number }> } = {};
  let debtorsTotal = 0;
  if (dataCSelected.length >= 1) {
    let curName: string | null = null;
    for (let i = 0; i < dataCSelected.length; i++) {
      const row = dataCSelected[i];
      const t = row && row[0] ? row[0].toString().trim() : "";
      const s = row && row.length > 1 ? parseSheetFloat(row[1]) : NaN;
      if (t) {
        if (isValidContractorName(t)) {
          curName = t;
          if (netContractors[curName] === undefined) netContractors[curName] = 0;
          if (!contractorLedger[curName]) contractorLedger[curName] = [];
        } else if (curName) {
          let val = !isNaN(s) ? s : 0;
          if (t.includes("Початковий борг (+)") || t.includes("нам винні:")) {
            val = Math.abs(val);
          } else if (t.includes("Початковий борг (-)") || t.includes("ми винні:")) {
            val = -Math.abs(val);
          }
          netContractors[curName] = Number((netContractors[curName] + val).toFixed(2));
          contractorLedger[curName].push({ text: t, sum: val });
        }
      }
    }
  }
  
  const oweUsList: any[] = [];
  const weOweList: any[] = [];
  const settledList: any[] = [];
  
  for (const name in netContractors) {
    const bal = netContractors[name];
    debtorsTotal = Number((debtorsTotal + bal).toFixed(2));
    if (bal > 0.01) {
      oweUsList.push({ name: name, sum: bal });
    } else if (bal < -0.01) {
      weOweList.push({ name: name, sum: Math.abs(bal) });
    } else {
      settledList.push({ name: name, sum: 0 });
    }
  }
  
  return {
    names: Object.keys(allNamesObj).sort(),
    allAliases: allAliases,
    globalTotals: globalTotals,
    weOweTotals: weOweTotals,
    oweUsTotals: oweUsTotals,
    debtorsTotals: debtorsTotals,
    allCashBalances: allCashBalances,
    allBankDetails: allBankDetails,
    allPlanned: aggregatedPlanned,
    categories: categories,
    currency: currency as "UAH" | "USD" | "EUR",
    allDebtorsDetails: allDebtorsDetails,
    capital: {
      total: Number((bankTotal + debtorsTotal).toFixed(2)),
      bankTotal: bankTotal,
      debtorsTotal: debtorsTotal,
      banks: banks
    },
    debtors: {
      oweUs: oweUsList.sort((a, b) => b.sum - a.sum),
      weOwe: weOweList.sort((a, b) => b.sum - a.sum),
      settled: settledList.sort((a, b) => a.name.localeCompare(b.name))
    },
    sheetConfigs: sheetConfigs,
    contractorLedger: contractorLedger,
    rawMoneyRows: fullDataK,
    allRawMoneyRows: allRawMoneyRows,
    allDebtorRows: allDebtorRows
  };
}

function cleanReversePlannedText(str: string): string {
  if (!str) return "";
  const patterns = [
    "⚙️ Реверс запланованого",
    "⚙️Реверс запланованого",
    "Реверс запланованого"
  ];
  let res = str;
  for (const pattern of patterns) {
    const idx = res.indexOf(pattern);
    if (idx !== -1) {
      res = res.substring(0, idx).trim();
    }
  }
  return res;
}

function extractInterestAmountFromText(text: string): number | null {
  if (!text) return null;

  // Extract explicit interest portion from strings like:
  // "та відсотків (1500.00 UAH)", "і відсотків (1500.00", "та % (1500.00", "та відсотків: 1500.00",
  // "відсотків (1500.00 ₴)", "відсотки: 1500.00", "дохід від відсотків: 1500"
  const combinedInterestMatches = [
    /(?:та|і|\+)?\s*(?:відсотків|відсотки|процентів|проценти|відсоток|процент|%)\s*\(\s*([\d\s.,]+)/i,
    /(?:та|і|\+)?\s*(?:відсотків|відсотки|процентів|проценти|відсоток|процент|%)\s*:\s*([\d\s.,]+)/i,
    /(?:та|і|\+)?\s*(?:відсотків|відсотки|процентів|проценти|відсоток|процент|%)\s*-\s*([\d\s.,]+)/i,
    /(?:нараховані|отримані|нараховано|отримано)\s*(?:відсотки|відсотків)\s*:\s*([\d\s.,]+)/i
  ];

  for (const re of combinedInterestMatches) {
    const m = text.match(re);
    if (m && m[1]) {
      const cleanStr = m[1].replace(/[^\d.,]/g, "").replace(/\s+/g, "").replace(",", ".");
      const parsed = parseFloat(cleanStr);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return null;
}

function getReportInterestAmount(fullText: string, rowSum: number, opNameLower: string, commentLower: string): number {
  // If text has an explicit combined interest portion (e.g. "Повернення тіла (10000 UAH) та відсотків (1500 UAH)"),
  // use that extracted interest sum.
  const extractedInterest = extractInterestAmountFromText(fullText);
  if (extractedInterest !== null && extractedInterest > 0) {
    return Math.min(rowSum, extractedInterest);
  }

  // Check if this transaction is strictly principal body return with NO interest
  const isExplicitPrincipalOnly = 
    (commentLower.includes("повернення тіла") ||
     commentLower.includes("тіло депозиту") ||
     commentLower.includes("тіло боргу") ||
     commentLower.includes("тільки тіло")) &&
    !commentLower.includes("відсот") &&
    !commentLower.includes("процент") &&
    !commentLower.includes("%");

  if (isExplicitPrincipalOnly) {
    return 0;
  }

  // Check if transaction indicates interest income/profit
  const hasInterestKeywords = 
    commentLower.includes("відсот") || 
    commentLower.includes("процент") || 
    commentLower.includes("нарахов") || 
    commentLower.includes("інтерес") ||
    commentLower.includes("дохід від відсотків") ||
    commentLower.includes("дохід отриманий від відсотків") ||
    commentLower.includes("відсотки по депозиту") ||
    commentLower.includes("відсотки за договором") ||
    commentLower.includes("купон") ||
    commentLower.includes("дивіденд") ||
    opNameLower.includes("відсот") ||
    opNameLower.includes("процент");

  if (hasInterestKeywords) {
    return rowSum;
  }

  // Debt / Deposit / Credit / Loan operations ("Позика", "Позика моя", "Позика комусь", "Повернули борг", "Повертаю борг", etc.)
  const isDebtOrPrincipalOp = 
    opNameLower.includes("повернули борг") ||
    opNameLower.includes("повертаю борг") ||
    opNameLower.includes("повернення") ||
    opNameLower.includes("позик") ||
    opNameLower.includes("позич") ||
    opNameLower.includes("взяв у борг") ||
    opNameLower.includes("взяла у борг") ||
    opNameLower.includes("дав у борг") ||
    opNameLower.includes("дала у борг") ||
    opNameLower.includes("борг") ||
    opNameLower.includes("кредит") ||
    opNameLower.includes("депозит") ||
    commentLower.includes("повернення") ||
    commentLower.includes("повернули") ||
    commentLower.includes("повертаю") ||
    commentLower.includes("позик") ||
    commentLower.includes("позич") ||
    commentLower.includes("борг") ||
    commentLower.includes("кредит") ||
    commentLower.includes("депозит");

  if (isDebtOrPrincipalOp) {
    // Pure principal loan or debt repayment without interest is excluded from P&L report
    return 0;
  }

  // Standard Income / Profit / Expense / Adjustments
  const isStandardIncomeOrExpenseOp = 
    opNameLower.includes("прибуток") || 
    opNameLower.includes("витрата") || 
    opNameLower.includes("покупка") ||
    opNameLower.includes("прихід") ||
    opNameLower.includes("дохід") ||
    opNameLower.includes("нарахування") ||
    opNameLower.includes("виплата");

  if (isStandardIncomeOrExpenseOp) {
    return rowSum;
  }

  return rowSum;
}

function matchesTargetCurrency(text: string, targetCurrency: "UAH" | "USD" | "EUR", rowSum?: number): boolean {
  if (!text) return true;
  
  const textUpper = text.toUpperCase();

  // 1. If row has an explicit split sum matching this currency, respect it:
  if (rowSum != null && !isNaN(rowSum) && Math.abs(rowSum) > 0.001) {
    const cleanSum = Math.abs(rowSum).toFixed(2);
    const cleanSumInt = Math.abs(Math.round(rowSum)).toString();
    
    // Check if rowSum specifically matches a split: e.g. "900 UAH" or "900 ₴" or "900 грн" or card "💳 900 UAH"
    const hasUahSplit = new RegExp(`(?:${cleanSum}|${cleanSumInt})\\s*(?:UAH|₴|ГРН)`, "i").test(text) ||
                        new RegExp(`💳\\s*(?:${cleanSum}|${cleanSumInt})\\s*(?:UAH|₴|ГРН)`, "i").test(text);
    const hasUsdSplit = new RegExp(`(?:${cleanSum}|${cleanSumInt})\\s*(?:USD|\\$)`, "i").test(text) ||
                        new RegExp(`💳\\s*(?:${cleanSum}|${cleanSumInt})\\s*(?:USD|\\$)`, "i").test(text);
    const hasEurSplit = new RegExp(`(?:${cleanSum}|${cleanSumInt})\\s*(?:EUR|€)`, "i").test(text) ||
                        new RegExp(`💳\\s*(?:${cleanSum}|${cleanSumInt})\\s*(?:EUR|€)`, "i").test(text);

    if (hasUahSplit && !hasUsdSplit && !hasEurSplit) return targetCurrency === "UAH";
    if (hasUsdSplit && !hasUahSplit && !hasEurSplit) return targetCurrency === "USD";
    if (hasEurSplit && !hasUahSplit && !hasUsdSplit) return targetCurrency === "EUR";
  }

  // 2. Check payment distribution cards
  if (text.includes("💳")) {
    const uahCards = textUpper.includes("UAH") || textUpper.includes("₴") || textUpper.includes("ГРН");
    const usdCards = textUpper.includes("USD") || textUpper.includes("$") || textUpper.includes("ДОЛ");
    const eurCards = textUpper.includes("EUR") || textUpper.includes("€") || textUpper.includes("ЄВР");

    if (targetCurrency === "UAH" && uahCards && !usdCards && !eurCards) return true;
    if (targetCurrency === "USD" && usdCards && !uahCards && !eurCards) return true;
    if (targetCurrency === "EUR" && eurCards && !uahCards && !usdCards) return true;
  }

  // 3. Extract currency symbol/code from the string
  const mSum = text.match(/💰\s*Сума:\s*[\d.]+\s*([a-zA-Z$€₴]+)/i);
  if (mSum && mSum[1]) {
    const mainSym = mSum[1].toUpperCase();
    if (mainSym === "USD" || mainSym === "$") {
      return targetCurrency === "USD";
    }
    if (mainSym === "EUR" || mainSym === "€") {
      return targetCurrency === "EUR";
    }
    if (mainSym === "UAH" || mainSym === "₴" || mainSym.includes("ГРН")) {
      return targetCurrency === "UAH";
    }
  }

  // 4. Check text content for explicit currencies
  const hasUsd = textUpper.includes("USD") || textUpper.includes("$") || textUpper.includes("ДОЛ");
  const hasEur = textUpper.includes("EUR") || textUpper.includes("€") || textUpper.includes("ЄВР");

  if (targetCurrency === "USD") return hasUsd && !hasEur;
  if (targetCurrency === "EUR") return hasEur && !hasUsd;
  if (targetCurrency === "UAH") return !hasUsd && !hasEur;

  return true;
}

function determineReportOpType(opNameLower: string, commentLower: string, colSide: "left" | "right"): "inc" | "exp" {
  // 1. Check if this is an interest transaction
  const isInterestOp = 
    opNameLower.includes("відсот") ||
    opNameLower.includes("процент") ||
    commentLower.includes("відсот") ||
    commentLower.includes("процент") ||
    commentLower.includes("дохід від відсотків") ||
    commentLower.includes("дохід отриманий від відсотків") ||
    commentLower.includes("відсотки по депозиту") ||
    commentLower.includes("відсотки за договором");

  if (isInterestOp) {
    // If recorded in the Left column of Debtors (income column), it is definitively INCOME
    if (colSide === "left") {
      return "inc";
    }

    const isExplicitInterestExpense = 
      opNameLower.includes("витрат") ||
      opNameLower.includes("списан") ||
      opNameLower.includes("сплат") ||
      opNameLower.includes("повертаю") ||
      opNameLower.includes("взято") ||
      commentLower.includes("сплата відсотків") ||
      commentLower.includes("виплата відсотків") ||
      commentLower.includes("списано відсотки");
    if (isExplicitInterestExpense) return "exp";
    return "inc"; // Interest received / earned is profit (income)
  }

  // 2. Check bracket operation name first (Primary Authority)
  const isIncName = 
    opNameLower.includes("прибуток") ||
    opNameLower.includes("дохід") ||
    opNameLower.includes("повернули борг") ||
    opNameLower.includes("прихід") ||
    opNameLower.includes("нарахування (+)") ||
    opNameLower.includes("коригування (+)") ||
    opNameLower.includes("початковий борг (+)") ||
    opNameLower.includes("введені початкові залишки (+)");

  const isExpName = 
    opNameLower.includes("витрата") ||
    opNameLower.includes("покупка") ||
    opNameLower.includes("повертаю борг") ||
    opNameLower.includes("списання") ||
    opNameLower.includes("знижк") ||
    opNameLower.includes("коригування (-)") ||
    opNameLower.includes("початковий борг (-)") ||
    opNameLower.includes("введені початкові залишки (-)");

  if (isIncName && !isExpName) return "inc";
  if (isExpName && !isIncName) return "exp";

  // 3. Check comment keywords if operation name wasn't conclusive
  const isIncComment = 
    commentLower.includes("отримано") ||
    commentLower.includes("прибуток") ||
    commentLower.includes("дохід") ||
    commentLower.includes("повернули") ||
    commentLower.includes("зароблено");

  const isExpComment = 
    commentLower.includes("витрата") ||
    commentLower.includes("покупка") ||
    commentLower.includes("оплачено") ||
    commentLower.includes("списано") ||
    commentLower.includes("повертаю") ||
    commentLower.includes("купив");

  if (isIncComment && !isExpComment) return "inc";
  if (isExpComment && !isIncComment) return "exp";

  // 4. Fallback to debtor column side: Left (Col 1 & 2) is Income, Right (Col 3 & 4) is Expense
  return colSide === "left" ? "inc" : "exp";
}

export function parseMonthlyReportFromRows(data: string[][], targetCurrency: "UAH" | "USD" | "EUR" = "UAH"): MonthlyReportItem[] {
  if (!data || data.length === 0) return [];
  const monthsMap: any = {};
  const monthNames = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    let t1 = row[0] ? row[0].toString().trim() : "";
    const s1 = row.length > 1 ? parseSheetFloat(row[1]) : NaN;
    if (t1 && !isNaN(s1) && matchesTargetCurrency(t1, targetCurrency, Math.abs(s1))) {
      t1 = cleanReversePlannedText(t1);
      const m = t1.match(/\[(.*?)\]\s*([\s\S]*)/);
      if (m) {
        const firstPart = m[1].split(" | ")[0];
        const dMatch = firstPart.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
        if (dMatch) {
          const tMatch = firstPart.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
          const timeStr = tMatch ? tMatch[0] : "";
          const monthIdx = Math.min(11, Math.max(0, parseInt(dMatch[2], 10) - 1));
          let yr = parseInt(dMatch[3], 10);
          if (yr < 100) yr += 2000;
          const monthNum = monthIdx + 1;
          const key = yr + "-" + (monthNum < 10 ? '0' + monthNum : monthNum);
          if (!monthsMap[key]) {
            monthsMap[key] = { label: monthNames[monthIdx] + " " + yr, inc: 0, exp: 0, sortKey: key, currency: targetCurrency, items: [] };
          }
          const opNameLower = (m[1].split(" | ")[1] || "").toLowerCase().trim();
          const commentLower = (m[2] || "").toLowerCase().trim();

          const amt = getReportInterestAmount(t1, Math.abs(s1), opNameLower, commentLower);

          if (amt > 0) {
            const opType = determineReportOpType(opNameLower, commentLower, "left");
            if (opType === "inc") {
              monthsMap[key].inc = Number((monthsMap[key].inc + amt).toFixed(2));
              monthsMap[key].items.push({ 
                type: 'inc', 
                sum: Number(amt.toFixed(2)), 
                text: m[2] || t1, 
                dateStr: (dMatch[1].length === 1 ? "0" + dMatch[1] : dMatch[1]) + "." + (monthNum < 10 ? "0" + monthNum : monthNum) + "." + yr, 
                timeStr: timeStr, 
                fullText: t1,
                curr: targetCurrency
              });
            } else {
              monthsMap[key].exp = Number((monthsMap[key].exp + amt).toFixed(2));
              monthsMap[key].items.push({ 
                type: 'exp', 
                sum: Number(amt.toFixed(2)), 
                text: m[2] || t1, 
                dateStr: (dMatch[1].length === 1 ? "0" + dMatch[1] : dMatch[1]) + "." + (monthNum < 10 ? "0" + monthNum : monthNum) + "." + yr, 
                timeStr: timeStr, 
                fullText: t1,
                curr: targetCurrency
              });
            }
          }
        }
      }
    }
    
    let t2 = row[2] ? row[2].toString().trim() : "";
    const s2 = row.length > 3 ? parseSheetFloat(row[3]) : NaN;
    if (t2 && !isNaN(s2) && matchesTargetCurrency(t2, targetCurrency, Math.abs(s2))) {
      t2 = cleanReversePlannedText(t2);
      const m2 = t2.match(/\[(.*?)\]\s*([\s\S]*)/);
      if (m2) {
        const firstPart2 = m2[1].split(" | ")[0];
        const dMatch2 = firstPart2.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
        if (dMatch2) {
          const tMatch2 = firstPart2.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
          const timeStr2 = tMatch2 ? tMatch2[0] : "";
          const monthIdx2 = Math.min(11, Math.max(0, parseInt(dMatch2[2], 10) - 1));
          let yr2 = parseInt(dMatch2[3], 10);
          if (yr2 < 100) yr2 += 2000;
          const monthNum2 = monthIdx2 + 1;
          const key2 = yr2 + "-" + (monthNum2 < 10 ? '0' + monthNum2 : monthNum2);
          if (!monthsMap[key2]) {
            monthsMap[key2] = { label: monthNames[monthIdx2] + " " + yr2, inc: 0, exp: 0, sortKey: key2, currency: targetCurrency, items: [] };
          }
          const opName2Lower = (m2[1].split(" | ")[1] || "").toLowerCase().trim();
          const comment2Lower = (m2[2] || "").toLowerCase().trim();

          const amt2 = getReportInterestAmount(t2, Math.abs(s2), opName2Lower, comment2Lower);

          if (amt2 > 0) {
            const opType2 = determineReportOpType(opName2Lower, comment2Lower, "right");
            if (opType2 === "inc") {
              monthsMap[key2].inc = Number((monthsMap[key2].inc + amt2).toFixed(2));
              monthsMap[key2].items.push({ 
                type: 'inc', 
                sum: Number(amt2.toFixed(2)), 
                text: m2[2] || t2, 
                dateStr: (dMatch2[1].length === 1 ? "0" + dMatch2[1] : dMatch2[1]) + "." + (monthNum2 < 10 ? "0" + monthNum2 : monthNum2) + "." + yr2, 
                timeStr: timeStr2, 
                fullText: t2,
                curr: targetCurrency
              });
            } else {
              monthsMap[key2].exp = Number((monthsMap[key2].exp + amt2).toFixed(2));
              monthsMap[key2].items.push({ 
                type: 'exp', 
                sum: Number(amt2.toFixed(2)), 
                text: m2[2] || t2, 
                dateStr: (dMatch2[1].length === 1 ? "0" + dMatch2[1] : dMatch2[1]) + "." + (monthNum2 < 10 ? "0" + monthNum2 : monthNum2) + "." + yr2, 
                timeStr: timeStr2, 
                fullText: t2,
                curr: targetCurrency
              });
            }
          }
        }
      }
    }
  }
  
  const result: MonthlyReportItem[] = Object.keys(monthsMap).map(k => monthsMap[k]);
  result.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  return result;
}

export async function getMonthlyReport(rawSpreadsheetId: string, token: string, currency: string, sheetNames: string[], cachedRows?: string[][]): Promise<MonthlyReportItem[]> {
  const normCur = (currency || "UAH").toUpperCase() as "UAH" | "USD" | "EUR";
  if (cachedRows && cachedRows.length > 0) {
    return parseMonthlyReportFromRows(cachedRows, normCur);
  }
  const spreadsheetId = cleanSpreadsheetId(rawSpreadsheetId);
  if (!spreadsheetId) return [];
  const sInfo = getSheetsForCurrency(currency, sheetNames);
  if (!sheetNames.includes(sInfo.debtors)) return [];
  
  const data = await fetchSheetValues(spreadsheetId, token, `${sInfo.debtors}!A1:D1000`);
  return parseMonthlyReportFromRows(data, normCur);
}

export function parseAndAddToGroups(text: string, sum: number, bankName: string, rowIdx: string, groups: any, currency: "UAH" | "USD" | "EUR" = "UAH") {
  sum = Number(sum) || 0;
  sum = Number(sum.toFixed(2));
  const fallbackTime = parseInt(rowIdx) || 0;
  let dateStr = "Без дати " + fallbackTime;
  let cleanText = text;
  let timeStamp = fallbackTime;
  let operation = "";
  
  const match = text.match(/^\[(.*?)\]\s*([\s\S]*)/);
  if (match) {
    const bracketData = match[1];
    cleanText = match[2];
    if (bracketData.indexOf(" | ") !== -1) {
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
  
  if (isNaN(timeStamp)) timeStamp = fallbackTime;
  let gId = `${currency}_${dateStr}`;
  if (cleanText.includes("Крос-оплата") || cleanText.includes("crossMulti")) {
    const parentKey = Object.keys(groups).find(k => k.endsWith(`_${dateStr}`) && !k.startsWith(`${currency}_`));
    if (parentKey) {
      gId = parentKey;
    }
  }

  let itemOp = operation;
  if (text.startsWith("[")) {
    const mBracket = text.match(/^\[(.*?)\|\s*(.*?)\]/);
    if (mBracket && mBracket[2]) {
      itemOp = mBracket[2].trim();
    }
  }

  const normOp = itemOp || operation || "";
  const isExpOp = normOp.includes("Покупка") || normOp.includes("Витрата") || normOp.includes("Повертаю борг") || normOp.includes("Коригування (-)") || normOp.includes("знижкою в борг") || normOp.includes("Початковий борг (-)") || normOp.includes("Введені початкові залишки (-)");
  const isIncOp = normOp.includes("Прибуток") || normOp.includes("Повернули борг") || normOp.includes("Прихід") || normOp.includes("Коригування (+)") || normOp.includes("Початковий борг (+)") || normOp.includes("Введені початкові залишки (+)") || (normOp.includes("Введені початкові залишки") && !isExpOp) || (normOp.includes("Початковий борг") && !isExpOp);

  let resolvedIsIncome = false;
  if (isExpOp) {
    resolvedIsIncome = false;
  } else if (isIncOp) {
    resolvedIsIncome = true;
  } else {
    if (bankName.indexOf("📥") !== -1 || cleanText.indexOf("Прибуток") !== -1 || cleanText.indexOf("Повернули борг") !== -1) {
      resolvedIsIncome = true;
    } else if (bankName.indexOf("📤") !== -1 || cleanText.indexOf("Покупка") !== -1 || cleanText.indexOf("Витрата") !== -1 || cleanText.indexOf("Повертаю борг") !== -1) {
      resolvedIsIncome = false;
    } else {
      resolvedIsIncome = sum > 0;
    }
  }

  if (!groups[gId]) {
    groups[gId] = { timestamp: timeStamp, dateStr: dateStr, operation: operation, items: [], totalSum: 0, isIncome: resolvedIsIncome, curr: currency };
  }
  if (operation && !groups[gId].operation) {
    groups[gId].operation = operation;
  }
  let explicitTotal = 0;
  const mTotal = cleanText.match(/💰 Сума:\s*([\d.]+)\s*([a-zA-Z$€₴]*)/);
  if (mTotal) {
    const parsedVal = parseFloat(mTotal[1]);
    const currSym = (mTotal[2] || "").toUpperCase();
    const isMatchingCurr = !currSym || 
      (currency === "UAH" && (currSym === "UAH" || currSym === "₴" || currSym.includes("ГРН"))) ||
      (currency === "USD" && (currSym === "USD" || currSym === "$")) ||
      (currency === "EUR" && (currSym === "EUR" || currSym === "€"));
    if (isMatchingCurr) {
      explicitTotal = parsedVal;
    }
  }

  let finalItemSum = sum;
  if (normOp.includes("Введені початкові залишки (+)") || (normOp.includes("Введені початкові залишки") && !normOp.includes("(-)")) || normOp.includes("Коригування (+)") || normOp.includes("Початковий борг (+)")) {
    finalItemSum = Math.abs(sum);
  } else if (normOp.includes("Введені початкові залишки (-)") || normOp.includes("Коригування (-)") || normOp.includes("Початковий борг (-)")) {
    finalItemSum = -Math.abs(sum);
  }

  // 1. Check if text specifies interest amount
  const mInt = text.match(/відсотків\s*\(\s*([\d.]+)/i) || text.match(/відсотки\s*\(\s*([\d.]+)/i);
  if (mInt && itemOp === "Прибуток") {
    const interestVal = parseFloat(mInt[1]);
    if (interestVal > 0) {
      if (sum < interestVal && Math.abs(interestVal - sum) < 100) {
        finalItemSum = interestVal;
      }
    }
  }

  // 2. Check if text specifies principal body repayment amount
  if (itemOp.includes("Повернули борг") || itemOp.includes("Повертаю борг")) {
    const mBody = text.match(/повернення тіла\s*\(\s*([\d.]+)/i) || text.match(/повернення тіла:\s*([\d.]+)/i);
    if (mBody) {
      const bodyVal = parseFloat(mBody[1]);
      if (bodyVal > 0) {
        if (sum > bodyVal && Math.abs(sum - (bodyVal + (mInt ? parseFloat(mInt[1]) : 0))) < 1) {
          finalItemSum = bodyVal;
        }
      }
    } else if (mInt) {
      const intVal = parseFloat(mInt[1]);
      if (intVal > 0 && sum > intVal) {
        finalItemSum = Number((sum - intVal).toFixed(2));
      }
    }
  }
  
  if (isIncOp) {
    groups[gId].isIncome = true;
  } else if (isExpOp) {
    groups[gId].isIncome = false;
  } else {
    if (bankName.indexOf("📥") !== -1 || cleanText.indexOf("Прибуток") !== -1) groups[gId].isIncome = true;
    if (bankName.indexOf("📤") !== -1 || cleanText.indexOf("Покупка") !== -1) groups[gId].isIncome = false;
  }
  if (cleanText.indexOf("🔄 Обмін") !== -1 || cleanText.indexOf("💱 Крос") !== -1) {
    const vidLine = cleanText.match(/Віддано:\s*(.*?)(?=\n|📥|│|\||$)/i)?.[1] || "";
    const otrLine = cleanText.match(/Отримано:\s*(.*?)(?=\n|💳|│|\||$)/i)?.[1] || "";
    const bClean = bankName.replace(/[📥📤]/g, "").trim().toLowerCase();
    if (bClean && vidLine.toLowerCase().includes(bClean)) {
      resolvedIsIncome = false;
    } else if (bClean && otrLine.toLowerCase().includes(bClean)) {
      resolvedIsIncome = true;
    } else if (vidLine.toUpperCase().includes(currency)) {
      resolvedIsIncome = false;
    } else if (otrLine.toUpperCase().includes(currency)) {
      resolvedIsIncome = true;
    } else if (bankName.indexOf("📤") !== -1 || cleanText.indexOf("Віддано") !== -1) {
      resolvedIsIncome = false;
    } else if (bankName.indexOf("📥") !== -1 || cleanText.indexOf("Отримано") !== -1) {
      resolvedIsIncome = true;
    } else if (sum !== 0) {
      resolvedIsIncome = sum > 0;
    } else {
      resolvedIsIncome = sum > 0;
    }
    groups[gId].isIncome = resolvedIsIncome;
  }

  if (currency === "USD") {
    // If USD sum is 0 or NaN, extract true USD sum from text
    if (isNaN(finalItemSum) || Math.abs(finalItemSum) < 0.001) {
      const usdMatch = text.match(/💰\s*Сума:\s*([\d.,]+)\s*(?:USD|\$)?/i) || text.match(/([\d.,]+)\s*(?:USD|\$)/i) || text.match(/\$\s*([\d.,]+)/i);
      if (usdMatch) {
        const parsedUSD = parseSheetFloat(usdMatch[1]);
        if (!isNaN(parsedUSD) && parsedUSD > 0) {
          finalItemSum = (groups[gId].isIncome ? 1 : -1) * parsedUSD;
        }
      }
    }
  }

  if (currency === "EUR") {
    // If EUR sum is 0 or NaN, extract true EUR sum from text
    if (isNaN(finalItemSum) || Math.abs(finalItemSum) < 0.001) {
      const eurMatch = text.match(/💰\s*Сума:\s*([\d.,]+)\s*(?:EUR|€)?/i) || text.match(/([\d.,]+)\s*(?:EUR|€)/i) || text.match(/€\s*([\d.,]+)/i);
      if (eurMatch) {
        const parsedEUR = parseSheetFloat(eurMatch[1]);
        if (!isNaN(parsedEUR) && parsedEUR > 0) {
          finalItemSum = (groups[gId].isIncome ? 1 : -1) * parsedEUR;
        }
      }
    }
  }

  const isRealExchange = cleanText.includes("Обмін") || cleanText.includes("Крос") || cleanText.includes("crossMulti") || (cleanText.includes("Віддано:") && cleanText.includes("Отримано:"));
  if (Math.abs(finalItemSum) < 0.001 && explicitTotal > 0 && !isRealExchange) {
    finalItemSum = groups[gId].isIncome ? explicitTotal : -explicitTotal;
  }
  
  let resolvedItemCurr: "UAH" | "USD" | "EUR" = currency;
  const bUp = (bankName || "").toUpperCase();
  if (bUp.includes("USD") || bUp.includes("$") || bUp.includes("ДОЛ")) {
    resolvedItemCurr = "USD";
  } else if (bUp.includes("EUR") || bUp.includes("€") || bUp.includes("ЄВР")) {
    resolvedItemCurr = "EUR";
  } else if (bUp.includes("UAH") || bUp.includes("₴") || bUp.includes("ГРН")) {
    resolvedItemCurr = "UAH";
  } else {
    const mCur = cleanText.match(/💳\s*[\d.,]+\s*([a-zA-Z$€₴]+)/i) || cleanText.match(/(?:USD|\$|EUR|€|UAH|₴)/i);
    if (mCur) {
      const sym = (mCur[1] || mCur[0]).toUpperCase();
      if (sym === "USD" || sym === "$") resolvedItemCurr = "USD";
      else if (sym === "EUR" || sym === "€") resolvedItemCurr = "EUR";
      else if (sym === "UAH" || sym === "₴" || sym.includes("ГРН")) resolvedItemCurr = "UAH";
    }
  }

  groups[gId].items.push({ bank: bankName, text: cleanText, sum: finalItemSum, fullText: text, operation: itemOp, curr: resolvedItemCurr, isIncome: resolvedIsIncome });
  
  const allCurrs = groups[gId].items.map((it: any) => it.curr || currency);
  const isMultiCurrency = allCurrs.some((c: string) => c !== allCurrs[0]);

  if (explicitTotal > 0 && !isMultiCurrency) {
    groups[gId].totalSum = explicitTotal;
  } else if (!isMultiCurrency && groups[gId].items.length > 0) {
    const sumOfItems = groups[gId].items.reduce((acc: number, it: any) => acc + Math.abs(Number(it.sum) || 0), 0);
    groups[gId].totalSum = Number(sumOfItems.toFixed(2));
  } else {
    // For multi-currency groups (e.g. split into 2 currencies or exchange), avoid adding mixed currencies directly
    groups[gId].totalSum = 0;
  }
}

export async function uploadReceipt(token: string, base64: string, mimeType: string, filename: string): Promise<string> {
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=name='Чеки_Облік'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` }
  });
  let folderId = "";
  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      folderId = searchData.files[0].id;
    }
  }
  
  if (!folderId) {
    const createFolderRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: "Чеки_Облік",
        mimeType: "application/vnd.google-apps.folder"
      })
    });
    if (createFolderRes.ok) {
      const folderData = await createFolderRes.json();
      folderId = folderData.id;
    } else {
      throw new Error("Failed to create Google Drive folder");
    }
  }
  
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  
  const metadata = {
    name: filename,
    parents: [folderId]
  };
  
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", blob);
  
  const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  
  if (!uploadRes.ok) {
    throw new Error("Failed to upload file to Google Drive");
  }
  
  const uploadData = await uploadRes.json();
  const fileId = uploadData.id;
  
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      role: "reader",
      type: "anyone"
    })
  });
  
  const getLinkRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (getLinkRes.ok) {
    const linkData = await getLinkRes.json();
    return linkData.webViewLink;
  }
  
  return `https://drive.google.com/open?id=${fileId}`;
}

export async function attachReceiptToPast(spreadsheetId: string, token: string, dateStr: string, receipt: { base64: string, mimeType: string, name: string }, currency: string, sheetConfigs: SheetConfig[]) {
  const receiptUrl = await uploadReceipt(token, receipt.base64, receipt.mimeType, "Чек_" + dateStr.replace(/[\/:]/g, "_") + "_" + receipt.name);
  const targetPrefix = "[" + dateStr + " |";
  const sInfo = getSheetsForCurrency(currency, sheetConfigs.map(s => s.title));
  
  const targetSheets = [sInfo.money, sInfo.contractors, sInfo.debtors].filter(title => sheetConfigs.some(s => s.title === title));
  const updates: any[] = [];
  
  for (const title of targetSheets) {
    const grid = await fetchSheetValues(spreadsheetId, token, `${title}!A1:Z1000`);
    if (grid.length === 0) continue;
    
    let changed = false;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const cellVal = grid[r][c] != null ? grid[r][c].toString() : "";
        if (matchesOperationDatePrefix(cellVal, dateStr)) {
          grid[r][c] = cellVal + ((cellVal.indexOf("|") !== -1) ? " | " : " \n📝 ") + "📎 " + receiptUrl;
          changed = true;
          updates.push({
            range: `${title}!${getColumnLetter(c + 1)}${r + 1}`,
            values: [[grid[r][c]]]
          });
        }
      }
    }
  }
  
  if (updates.length > 0) {
    await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updates
      })
    });
  }
  return true;
}

export async function deleteReceipt(spreadsheetId: string, token: string, dateStr: string, currency: string, sheetConfigs: SheetConfig[]) {
  const targetPrefix = "[" + dateStr + " |";
  const sInfo = getSheetsForCurrency(currency, sheetConfigs.map(s => s.title));
  const targetSheets = [sInfo.money, sInfo.contractors, sInfo.debtors].filter(title => sheetConfigs.some(s => s.title === title));
  const updates: any[] = [];
  
  for (const title of targetSheets) {
    const grid = await fetchSheetValues(spreadsheetId, token, `${title}!A1:Z1000`);
    if (grid.length === 0) continue;
    
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const cellVal = grid[r][c] != null ? grid[r][c].toString() : "";
        if (matchesOperationDatePrefix(cellVal, dateStr) && cellVal.indexOf("http") !== -1) {
          let tempVal = cellVal.replace(/\|\s*📎\s*https?:\/\/[^\s]+/g, "").trim();
          tempVal = tempVal.replace(/https?:\/\/[^\s]+/g, "").trim().replace(/\s*\|\s*$/, "").replace(/\s*\n📝\s*$/, "").replace(/\s*📝\s*$/, "");
          if (tempVal !== cellVal) {
            grid[r][c] = tempVal;
            updates.push({
              range: `${title}!${getColumnLetter(c + 1)}${r + 1}`,
              values: [[tempVal]]
            });
          }
        }
      }
    }
  }
  
  if (updates.length > 0) {
    await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updates
      })
    });
    return true;
  }
  return false;
}

export async function fetchSheetConfigs(spreadsheetId: string, token: string): Promise<SheetConfig[]> {
  const cleanId = cleanSpreadsheetId(spreadsheetId);
  const metaRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${cleanId}?fields=sheets.properties`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!metaRes.ok) return [];
  const meta = await metaRes.json();
  return meta.sheets?.map((s: any) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId
  })) || [];
}

export async function undoLastAction(spreadsheetId: string, token: string, actionData: any, sheetConfigs: SheetConfig[] = []) {
  if (!actionData) return false;

  let configs = sheetConfigs;
  if (!configs || configs.length === 0) {
    try {
      configs = await fetchSheetConfigs(spreadsheetId, token);
    } catch (e) {
      console.error("Error fetching sheet configs in undoLastAction:", e);
      configs = [];
    }
  }

  let performedUndo = false;

  // 1. Direct cell reverts / row deletions from actionData.changes array if present
  if (actionData.changes && actionData.changes.length > 0) {
    const updates: any[] = [];
    const batchRequests: any[] = [];

    for (let i = actionData.changes.length - 1; i >= 0; i--) {
      const ch = actionData.changes[i];
      if (!ch) continue;

      const sheetName = ch.sheetName;
      const sheetCfg = configs.find(s => s.title === sheetName);
      const sheetId = ch.sheetId ?? sheetCfg?.sheetId;

      if (ch.isInsert && sheetId !== undefined && sheetId !== null && ch.row > 0) {
        batchRequests.push({
          deleteRange: {
            range: {
              sheetId: Number(sheetId),
              startRowIndex: ch.row - 1,
              endRowIndex: ch.row
            },
            shiftDimension: "ROWS"
          }
        });
        performedUndo = true;
      } else if (sheetName && ch.row > 0) {
        const col1 = ch.col1 || 1;
        const col2 = ch.col2 || col1;
        const colCount = Math.max(1, col2 - col1 + 1);
        const rowValues = Array(colCount).fill("");
        const safeSheetName = `'${sheetName.replace(/'/g, "''")}'`;
        updates.push({
          range: `${safeSheetName}!${getColumnLetter(col1)}${ch.row}:${getColumnLetter(col2)}${ch.row}`,
          values: [rowValues]
        });
        performedUndo = true;
      }
    }

    if (batchRequests.length > 0) {
      const batchRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ requests: batchRequests })
      });
      if (!batchRes.ok) {
        const errText = await batchRes.text();
        console.error("Batch update deleteRange failed in undoLastAction:", errText);
        if (batchRes.status === 401 || errText.includes("UNAUTHENTICATED") || errText.includes("401")) {
          throw new Error("AUTH_EXPIRED");
        }
        throw new Error(`Batch update deleteRange failed: ${errText}`);
      }
    }

    if (updates.length > 0) {
      const valRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: updates
        })
      });
      if (!valRes.ok) {
        const errText = await valRes.text();
        console.error("Values batchUpdate failed in undoLastAction:", errText);
        if (valRes.status === 401 || errText.includes("UNAUTHENTICATED") || errText.includes("401")) {
          throw new Error("AUTH_EXPIRED");
        }
        throw new Error(`Values batchUpdate failed: ${errText}`);
      }
    }
  }

  // 2. Also search and clear all cells matching this operation's date prefix
  if (actionData.dateStr) {
    try {
      const curr = actionData.currency || "UAH";
      await deletePastOperation(spreadsheetId, token, actionData.dateStr, curr, configs);
      performedUndo = true;
    } catch (err: any) {
      if (err?.message === "AUTH_EXPIRED" || err?.message?.includes("401") || err?.message?.includes("UNAUTHENTICATED")) {
        throw new Error("AUTH_EXPIRED");
      }
      console.error("deletePastOperation in undoLastAction failed:", err);
    }
  }

  // 3. Restore original planned list if it was altered
  if (actionData.originalPlannedList) {
    try {
      await savePlannedListToSheet(spreadsheetId, token, actionData.originalPlannedList);
      const currList = ["UAH", "USD", "EUR"];
      currList.forEach(c => {
        const cLower = c.toLowerCase();
        const incs = actionData.originalPlannedList.filter((pItem: any) => pItem.currency === c && pItem.type === 'income');
        const exps = actionData.originalPlannedList.filter((pItem: any) => pItem.currency === c && pItem.type === 'expense');
        localStorage.setItem('plannedInc_' + cLower, JSON.stringify(incs));
        localStorage.setItem('plannedExp_' + cLower, JSON.stringify(exps));
      });
      performedUndo = true;
    } catch (err) {
      console.error("Error restoring planned items during undoLastAction:", err);
    }
  }

  return performedUndo;
}

export async function saveExchange(spreadsheetId: string, token: string, data: any, sheetConfigs: SheetConfig[]) {
  const sheetNames = sheetConfigs.map(s => s.title);
  const now = new Date();
  
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "Europe/Kiev"
  };
  const dateStr = new Intl.DateTimeFormat("uk-UA", options).format(now).replace(",", "");
  const actionLog: any = { changes: [], dateStr, currency: data.fromCurr };
  const datePrefix = "[" + dateStr + " | Обмін] ";
  
  const fromSheets = getSheetsForCurrency(data.fromCurr, sheetNames);
  const toSheets = getSheetsForCurrency(data.toCurr, sheetNames);
  
  const fromSheetCfg = sheetConfigs.find(s => s.title === fromSheets.money);
  const toSheetCfg = sheetConfigs.find(s => s.title === toSheets.money);
  if (!fromSheetCfg || !toSheetCfg) {
    throw new Error("Missing sheets for exchange");
  }
  
  const colMap: any = { "Готівка": 1, "Банк 1": 3, "Банк 2": 5, "Банк 3": 7, "Банк 4": 9, "Банк 5": 11 };
  const fromCol = colMap[data.fromAcc];
  const toCol = colMap[data.toAcc];
  
  const commText = (data.comment || "").trim();

  // Fetch grids first to get row numbers and extract custom bank headers
  const fromGrid = await fetchSheetValues(spreadsheetId, token, `${fromSheets.money}!A1:L1000`);
  const toGrid = await fetchSheetValues(spreadsheetId, token, `${toSheets.money}!A1:L1000`);

  // Extract custom bank aliases
  const fromAliases: any = { 'Готівка': 'Готівка', 'Банк 1': 'Банк 1', 'Банк 2': 'Банк 2', 'Банк 3': 'Банк 3', 'Банк 4': 'Банк 4', 'Банк 5': 'Банк 5' };
  if (fromGrid.length >= 1) {
    const headers = fromGrid[0];
    if (headers[0]) fromAliases['Готівка'] = headers[0].toString().trim();
    if (headers[2]) fromAliases['Банк 1'] = headers[2].toString().trim();
    if (headers[4]) fromAliases['Банк 2'] = headers[4].toString().trim();
    if (headers[6]) fromAliases['Банк 3'] = headers[6].toString().trim();
    if (headers[8]) fromAliases['Банк 4'] = headers[8].toString().trim();
    if (headers[10]) fromAliases['Банк 5'] = headers[10].toString().trim();
  }

  const toAliases: any = { 'Готівка': 'Готівка', 'Банк 1': 'Банк 1', 'Банк 2': 'Банк 2', 'Банк 3': 'Банк 3', 'Банк 4': 'Банк 4', 'Банк 5': 'Банк 5' };
  if (toGrid.length >= 1) {
    const headers = toGrid[0];
    if (headers[0]) toAliases['Готівка'] = headers[0].toString().trim();
    if (headers[2]) toAliases['Банк 1'] = headers[2].toString().trim();
    if (headers[4]) toAliases['Банк 2'] = headers[4].toString().trim();
    if (headers[6]) toAliases['Банк 3'] = headers[6].toString().trim();
    if (headers[8]) toAliases['Банк 4'] = headers[8].toString().trim();
    if (headers[10]) toAliases['Банк 5'] = headers[10].toString().trim();
  }

  const fromAccName = fromAliases[data.fromAcc] || data.fromAcc;
  const toAccName = toAliases[data.toAcc] || data.toAcc;
  
  // Calculate a human-friendly (conventional) exchange rate
  let humanRate = parseFloat(data.rate) || 0;
  let rateUnit = "";
  if (data.fromCurr === "UAH" && (data.toCurr === "USD" || data.toCurr === "EUR")) {
    rateUnit = ` UAH/${data.toCurr}`;
    if (humanRate <= 0 && data.toSum > 0) {
      humanRate = data.fromSum / data.toSum;
    }
  } else if ((data.fromCurr === "USD" || data.fromCurr === "EUR") && data.toCurr === "UAH") {
    rateUnit = ` UAH/${data.fromCurr}`;
    if (humanRate <= 0 && data.fromSum > 0) {
      humanRate = data.toSum / data.fromSum;
    }
  } else if (data.fromCurr === "EUR" && data.toCurr === "USD") {
    rateUnit = ` USD/EUR`;
    if (humanRate <= 0 && data.fromSum > 0) {
      humanRate = data.toSum / data.fromSum;
    }
  } else if (data.fromCurr === "USD" && data.toCurr === "EUR") {
    rateUnit = ` USD/EUR`;
    if (humanRate <= 0 && data.toSum > 0) {
      humanRate = data.fromSum / data.toSum;
    }
  }
  
  const formattedRate = humanRate ? Number(humanRate.toFixed(4)).toString() : "";
  const rateStr = formattedRate ? "\n📈 Курс: " + formattedRate + rateUnit : "";
  const cText = commText ? "\n📝 " + commText : "";
  const excStr = `💳 Віддано: ${data.fromSum} ${data.fromCurr} ➔ ${fromAccName}\n📥 Отримано: ${data.toSum} ${data.toCurr} ➔ ${toAccName}`;
  const fromText = datePrefix + "🔄 Обмін:\n" + excStr + rateStr + cText;
  
  let fRow = fromGrid.length + 1;
  if (fromGrid.length >= 2) {
    for (let i = 1; i < fromGrid.length; i++) {
      if (!fromGrid[i][fromCol - 1]) {
        fRow = i + 1;
        break;
      }
    }
  } else if (fromGrid.length === 1) {
    fRow = 2;
  }
  
  const toText = fromText;
  let tRow = toGrid.length + 1;
  if (toGrid.length >= 2) {
    for (let j = 0; j < toGrid.length; j++) {
      if (!toGrid[j] || !toGrid[j][toCol - 1]) {
        tRow = j + 1;
        break;
      }
    }
  } else if (toGrid.length === 1) {
    tRow = 2;
  }
  
  const valueUpdates = [
    {
      range: `${fromSheets.money}!${getColumnLetter(fromCol)}${fRow}:${getColumnLetter(fromCol + 1)}${fRow}`,
      values: [[fromText, -Number(data.fromSum.toFixed(2))]]
    },
    {
      range: `${toSheets.money}!${getColumnLetter(toCol)}${tRow}:${getColumnLetter(toCol + 1)}${tRow}`,
      values: [[toText, Number(data.toSum.toFixed(2))]]
    }
  ];
  
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      valueInputOption: "USER_ENTERED",
      data: valueUpdates
    })
  });
  
  actionLog.changes.push({
    sheetName: fromSheets.money,
    sheetId: fromSheetCfg.sheetId,
    row: fRow,
    col1: fromCol,
    col2: fromCol + 1,
    isInsert: false
  });
  actionLog.changes.push({
    sheetName: toSheets.money,
    sheetId: toSheetCfg.sheetId,
    row: tRow,
    col1: toCol,
    col2: toCol + 1,
    isInsert: false
  });
  
  return actionLog;
}

export async function saveDataFromApp(spreadsheetId: string, token: string, data: any, sheetConfigs: SheetConfig[]) {
  const sheetNames = sheetConfigs.map(s => s.title);
  const now = new Date();
  
  const options: Intl.DateTimeFormatOptions = {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: "Europe/Kiev"
  };
  const dateStr = new Intl.DateTimeFormat("uk-UA", options).format(now).replace(",", "");
  const actionLog: any = { changes: [], dateStr, currency: data.currency };
  const datePrefix = "[" + dateStr + " | " + data.operation + "] ";
  
  let plannedBackupText = "";
  let originalPlannedList: any[] | null = null;
  let workingPlannedList: any[] | null = null;
  let isOnlinePlannedList = false;

  if (data.plannedId || data.createPlannedInterest) {
    let pList: any[] = [];
    if (spreadsheetId && token) {
      try {
        const plannedRes = await fetchWithRetry(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("Заплановано!A1:O1000")}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (plannedRes.ok) {
          const plannedData = await plannedRes.json();
          const rows = plannedData ? (plannedData.values || []) : [];
          pList = parsePlannedRows(rows);
          isOnlinePlannedList = true;
        }
      } catch (err) {
        console.warn("Could not fetch planned list online for backup, using local list:", err);
      }
    }
    if (!isOnlinePlannedList) {
      pList = getPlannedItems(data.currency, data.plannedType || 'income');
    }
    originalPlannedList = JSON.parse(JSON.stringify(pList));
    actionLog.originalPlannedList = JSON.parse(JSON.stringify(pList));
    workingPlannedList = JSON.parse(JSON.stringify(pList));

    if (data.plannedId) {
      const found = pList.find(i => String(i.id) === String(data.plannedId));
      if (found) {
        plannedBackupText = "\n⚙️ Реверс запланованого: " + JSON.stringify(found);
      }
    }
  }

  let receiptUrl = "";
  if (data.receipt && data.receipt.base64) {
    try {
      receiptUrl = await uploadReceipt(token, data.receipt.base64, data.receipt.mimeType, "Чек_" + dateStr.replace(/[\/:]/g, "_") + "_" + data.receipt.name);
    } catch (e) {
      console.error("Receipt upload error:", e);
    }
  }
  
  const colMap: any = { "Готівка": 1, "Банк 1": 3, "Банк 2": 5, "Банк 3": 7, "Банк 4": 9, "Банк 5": 11 };
  const sInfo = getSheetsForCurrency(data.currency, sheetNames);
  
  const moneySheetCfg = sheetConfigs.find(s => s.title === sInfo.money);
  const contrSheetCfg = sheetConfigs.find(s => s.title === sInfo.contractors);
  const debtSheetCfg = sheetConfigs.find(s => s.title === sInfo.debtors);
  
  const mainSheetGrid = moneySheetCfg ? await fetchSheetValues(spreadsheetId, token, `${sInfo.money}!A1:L1000`) : [];
  const contrSheetGrid = contrSheetCfg ? await fetchSheetValues(spreadsheetId, token, `${sInfo.contractors}!A1:C1000`) : [];
  const debtSheetGrid = debtSheetCfg ? await fetchSheetValues(spreadsheetId, token, `${sInfo.debtors}!A1:E1000`) : [];
  
  const bankAliases: any = { 'Готівка': 'Готівка', 'Банк 1': 'Банк 1', 'Банк 2': 'Банк 2', 'Банк 3': 'Банк 3', 'Банк 4': 'Банк 4', 'Банк 5': 'Банк 5' };
  if (mainSheetGrid.length >= 1) {
    const headers = mainSheetGrid[0];
    if (headers[0]) bankAliases['Готівка'] = headers[0].toString().trim();
    if (headers[2]) bankAliases['Банк 1'] = headers[2].toString().trim();
    if (headers[4]) bankAliases['Банк 2'] = headers[4].toString().trim();
    if (headers[6]) bankAliases['Банк 3'] = headers[6].toString().trim();
    if (headers[8]) bankAliases['Банк 4'] = headers[8].toString().trim();
    if (headers[10]) bankAliases['Банк 5'] = headers[10].toString().trim();
  }

  const contrName = (data.contractor || "").trim();
  let commText = (data.comment || "").trim();
  let mainTotalAmount = Number(Number(data.total_sum).toFixed(2));
  let mainSplits = data.splits || [];

  const principalAction = data.interestPrincipalAction || "none";
  const principalWithdrawSum = Number(data.interestPrincipalWithdrawSum) || 0;
  const isInterestFulfillment = !!data.isInterestFulfillment;

  let calculatedInterest = 0;
  if (isInterestFulfillment && (principalAction === "all" || principalAction === "part") && principalWithdrawSum > 0) {
    if (data.interestFulfillmentCalculatedAccrued != null && Number(data.interestFulfillmentCalculatedAccrued) > 0) {
      calculatedInterest = Number(Number(data.interestFulfillmentCalculatedAccrued).toFixed(2));
    } else if (mainTotalAmount > principalWithdrawSum) {
      calculatedInterest = Number((mainTotalAmount - principalWithdrawSum).toFixed(2));
    }
    const combinedTotal = Number((principalWithdrawSum + calculatedInterest).toFixed(2));
    if (mainTotalAmount < combinedTotal) {
      mainTotalAmount = combinedTotal;
    }
  }

  let crossEqTotal = 0;
  if (data.crossMulti && data.crossMulti.length > 0) {
    for (const cData of data.crossMulti) {
      let eq = Number(cData.eq) || 0;
      if (!eq && cData.sum && cData.rate) {
        const r = Number(cData.rate) || 1;
        eq = Number((cData.sum / r).toFixed(2));
      }
      crossEqTotal += eq;
    }
  }

  const targetMainSplitsSum = Math.max(0, Number((mainTotalAmount - crossEqTotal).toFixed(2)));

  const splitsSum = mainSplits.reduce((acc: number, s: any) => acc + (Number(s.sum) || 0), 0);
  if (mainSplits.length === 0) {
    if (targetMainSplitsSum > 0) {
      mainSplits = [{ acc: "Готівка", sum: targetMainSplitsSum }];
    } else {
      mainSplits = [];
    }
  } else if (mainSplits.length === 1 && Math.abs(splitsSum - targetMainSplitsSum) > 0.01) {
    mainSplits = [{ ...mainSplits[0], sum: targetMainSplitsSum }];
  } else if (splitsSum > 0 && Math.abs(splitsSum - targetMainSplitsSum) > 0.01) {
    if (isInterestFulfillment && Math.abs(splitsSum - (principalWithdrawSum + calculatedInterest)) < 0.05 && crossEqTotal === 0) {
      mainTotalAmount = splitsSum;
    } else if (targetMainSplitsSum > 0) {
      // If there is an erroneous/redundant НеоплаченийБорг split when crossEqTotal > 0,
      // eliminate or reduce it before scaling real money splits!
      const debtIdx = mainSplits.findIndex((s: any) => s.acc === "НеоплаченийБорг");
      const excess = Number((splitsSum - targetMainSplitsSum).toFixed(2));
      if (debtIdx !== -1 && excess > 0 && crossEqTotal > 0) {
        const debtSum = Number(mainSplits[debtIdx].sum) || 0;
        if (Math.abs(debtSum - excess) < 0.05) {
          mainSplits = mainSplits.filter((_: any, idx: number) => idx !== debtIdx);
        } else if (debtSum > excess) {
          mainSplits[debtIdx] = { ...mainSplits[debtIdx], sum: Number((debtSum - excess).toFixed(2)) };
        }
      }

      const newSplitsSum = mainSplits.reduce((acc: number, s: any) => acc + (Number(s.sum) || 0), 0);
      if (Math.abs(newSplitsSum - targetMainSplitsSum) > 0.01 && newSplitsSum > 0) {
        const normRatio = targetMainSplitsSum / newSplitsSum;
        mainSplits = mainSplits.map((s: any) => ({ ...s, sum: Number((s.sum * normRatio).toFixed(2)) }));
      }
    } else {
      mainSplits = mainSplits.map((s: any) => ({ ...s, sum: 0 }));
    }
  }

  const allocateFulfillmentSplits = (
    sls: Array<{ acc: string; sum: number; text?: string }>,
    interestSum: number,
    principalSum: number
  ) => {
    if (interestSum <= 0) {
      return { interestSplits: [], principalSplits: sls };
    }
    if (principalSum <= 0) {
      return { interestSplits: sls, principalSplits: [] };
    }

    const splitsCopy = sls.map(s => ({
      acc: s.acc,
      text: s.text,
      remaining: Number(s.sum.toFixed(2))
    }));

    const isRealMoney = (acc: string) => acc !== "Контрагент" && acc !== "НеоплаченийБорг";

    const orderedIndices = splitsCopy.map((s, idx) => ({ idx, isReal: isRealMoney(s.acc) }));
    orderedIndices.sort((a, b) => (b.isReal ? 1 : 0) - (a.isReal ? 1 : 0));

    let interestNeeded = Number(interestSum.toFixed(2));
    const interestSplitsMap: { [idx: number]: number } = {};

    for (const item of orderedIndices) {
      if (interestNeeded <= 0) break;
      const s = splitsCopy[item.idx];
      const take = Number(Math.min(s.remaining, interestNeeded).toFixed(2));
      if (take > 0) {
        interestSplitsMap[item.idx] = take;
        s.remaining = Number((s.remaining - take).toFixed(2));
        interestNeeded = Number((interestNeeded - take).toFixed(2));
      }
    }

    const interestSplits: Array<{ acc: string; sum: number; text?: string }> = [];
    sls.forEach((s, idx) => {
      const take = interestSplitsMap[idx] || 0;
      if (take > 0) {
        interestSplits.push({ acc: s.acc, sum: take, text: s.text });
      }
    });

    const principalSplits: Array<{ acc: string; sum: number; text?: string }> = [];
    splitsCopy.forEach((s) => {
      if (s.remaining > 0) {
        principalSplits.push({ acc: s.acc, sum: s.remaining, text: s.text });
      }
    });

    return { interestSplits, principalSplits };
  };

  const splitPaymentSplits = (
    sls: Array<{ acc: string; sum: number; text?: string }>,
    tot: number,
    subS: number
  ) => {
    if (tot <= 0 || subS <= 0) return [];
    const ratio = subS / tot;
    let runningSum = 0;
    return sls.map((s, idx) => {
      if (idx === sls.length - 1) {
        const currentSum = Number((subS - runningSum).toFixed(2));
        return { ...s, sum: currentSum };
      }
      const currentSum = Number((s.sum * ratio).toFixed(2));
      runningSum += currentSum;
      return { ...s, sum: currentSum };
    }).filter(s => s.sum > 0);
  };

  let subTransactions: Array<{
    operation: string;
    total_sum: number;
    comment: string;
    splits: Array<{ acc: string; sum: number; text?: string }>;
  }> = [];

  if (isInterestFulfillment && (principalAction === "all" || principalAction === "part") && principalWithdrawSum > 0) {
    const isLentMoney = data.plannedType === "income";
    const interestSum = Number((mainTotalAmount - principalWithdrawSum).toFixed(2));
    
    const { interestSplits, principalSplits } = allocateFulfillmentSplits(mainSplits, interestSum, principalWithdrawSum);

    const actualInterestSum = interestSplits.reduce((acc, s) => acc + (Number(s.sum) || 0), 0);
    const actualPrincipalSum = principalSplits.reduce((acc, s) => acc + (Number(s.sum) || 0), 0);

    const finalInterestSum = actualInterestSum > 0 ? actualInterestSum : interestSum;
    const finalPrincipalSum = actualPrincipalSum > 0 ? actualPrincipalSum : principalWithdrawSum;

    if (finalPrincipalSum > principalWithdrawSum && commText) {
      const oldStr = principalWithdrawSum.toFixed(2);
      const newStr = finalPrincipalSum.toFixed(2);
      commText = commText.replace(oldStr, newStr);
    }

    const getCurrencySymbolLocal = (curr?: string) => {
      if (curr === "USD") return "$";
      if (curr === "EUR") return "€";
      return "₴";
    };
    const currencySymbol = getCurrencySymbolLocal(data.currency);

    // 1. Interest portion (pure income/expense, does not affect debtor card balance)
    if (finalInterestSum > 0) {
      const periodStr = data.interestFulfillmentPeriod ? ` за період: ${data.interestFulfillmentPeriod}` : " за розрахунковий період";
      const baseSum = data.interestFulfillmentBaseSum || "";
      const rate = data.interestFulfillmentRate || "";
      const rateStr = rate ? ` під ${rate}%` : "";
      const baseSumStr = baseSum ? ` (нараховано з суми ${Number(baseSum).toFixed(2)} ${currencySymbol}${rateStr})` : "";

      subTransactions.push({
        operation: isLentMoney ? "Прибуток" : "Покупка",
        total_sum: finalInterestSum,
        comment: commText || (isLentMoney 
          ? `[Прибуток] Відсотки за договором: "${contrName}"${baseSumStr}${periodStr}`
          : `[Витрати] Відсотки за договором: "${contrName}"${baseSumStr}${periodStr}`),
        splits: interestSplits.length > 0 ? interestSplits : splitPaymentSplits(mainSplits, mainTotalAmount, finalInterestSum)
      });
    }
    
    // 2. Principal portion (debt repayment/payment, updates debtor card balance)
    subTransactions.push({
      operation: isLentMoney ? "Повернули борг" : "Повертаю борг",
      total_sum: finalPrincipalSum,
      comment: isLentMoney
        ? `[Повернення боргу] ${principalAction === "all" ? "Повне" : "Часткове"} повернення тіла (${finalPrincipalSum.toFixed(2)} ${currencySymbol}) за договором: "${contrName}"`
        : `[Повернення боргу] ${principalAction === "all" ? "Повне" : "Часткове"} повернення тіла (${finalPrincipalSum.toFixed(2)} ${currencySymbol}) за договором: "${contrName}"`,
      splits: principalSplits.length > 0 ? principalSplits : splitPaymentSplits(mainSplits, mainTotalAmount, finalPrincipalSum)
    });
  } else {
    subTransactions.push({
      operation: data.operation,
      total_sum: mainTotalAmount,
      comment: commText,
      splits: mainSplits
    });
  }

  const batchRequests: any[] = [];
  const valueUpdates: any[] = [];
  const pendingGridUpdates: Array<{
    grid: string[][];
    sheetCfg: SheetConfig;
    rowObj: string[];
    textCol: number;
    sumCol: number;
    values: any[][];
    changeLog?: {
      sheetName: string;
      sheetId: number;
      col1: number;
      col2: number;
      isInsert: boolean;
    }
  }> = [];

  const recordContractorHelper = (
    grid: string[][],
    sheetCfg: SheetConfig,
    searchName: string,
    textCol: number,
    sumCol: number,
    entryText: string,
    amount: number
  ) => {
    if (!sheetCfg || !isValidContractorName(searchName)) return;
    
    let foundRow = -1;
    for (let k = 0; k < grid.length; k++) {
      if (grid[k] && grid[k][textCol - 1]?.toString().trim().toLowerCase() === searchName.trim().toLowerCase()) {
        foundRow = k;
        break;
      }
    }
    
    let targetRow = -1;
    let wasInserted = false;
    let newlyCreated = false;
    
    if (foundRow !== -1) {
      targetRow = foundRow + 1;
      const transRow: string[] = [];
      transRow[textCol - 1] = entryText;
      transRow[sumCol - 1] = amount.toFixed(2);
      grid.splice(targetRow, 0, transRow);
      
      batchRequests.push({
        insertRange: {
          range: {
            sheetId: sheetCfg.sheetId,
            startRowIndex: targetRow,
            endRowIndex: targetRow + 1,
            startColumnIndex: Math.min(textCol, sumCol) - 1,
            endColumnIndex: Math.max(textCol, sumCol)
          },
          shiftDimension: "ROWS"
        }
      });
      wasInserted = true;

      pendingGridUpdates.push({
        grid,
        sheetCfg,
        rowObj: transRow,
        textCol,
        sumCol,
        values: [[entryText, Number(amount.toFixed(2))]],
        changeLog: {
          sheetName: sheetCfg.title,
          sheetId: sheetCfg.sheetId,
          col1: textCol,
          col2: sumCol,
          isInsert: true
        }
      });
    } else {
      let lastContentRow = -1;
      for (let r = grid.length - 1; r >= 0; r--) {
        if (grid[r] && grid[r].some(cell => cell && cell.toString().trim() !== "")) {
          lastContentRow = r;
          break;
        }
      }
      targetRow = lastContentRow === -1 ? 0 : lastContentRow + 2;
      newlyCreated = true;
    }
    
    if (newlyCreated) {
      const headerRow: string[] = [];
      headerRow[textCol - 1] = searchName;
      while (grid.length <= targetRow) grid.push([]);
      grid[targetRow] = headerRow;
      
      pendingGridUpdates.push({
        grid,
        sheetCfg,
        rowObj: headerRow,
        textCol,
        sumCol: textCol,
        values: [[searchName]],
        changeLog: {
          sheetName: sheetCfg.title,
          sheetId: sheetCfg.sheetId,
          col1: textCol,
          col2: textCol,
          isInsert: false
        }
      });
      
      targetRow++;
      
      const transRow: string[] = [];
      transRow[textCol - 1] = entryText;
      transRow[sumCol - 1] = amount.toFixed(2);
      while (grid.length <= targetRow) grid.push([]);
      grid[targetRow] = transRow;
      
      pendingGridUpdates.push({
        grid,
        sheetCfg,
        rowObj: transRow,
        textCol,
        sumCol,
        values: [[entryText, Number(amount.toFixed(2))]],
        changeLog: {
          sheetName: sheetCfg.title,
          sheetId: sheetCfg.sheetId,
          col1: textCol,
          col2: sumCol,
          isInsert: false
        }
      });
    }
  };

  const crossGrids: { [sheetName: string]: any[][] } = {};

  for (const sub of subTransactions) {
    const subDatePrefix = "[" + dateStr + " | " + sub.operation + "] ";
    const splits = sub.splits;
    const totalAmount = sub.total_sum;
    let offsetSum = 0;
    splits.forEach((split: any) => {
      if (split.acc === "НеоплаченийБорг" || split.acc === "Контрагент") {
        offsetSum += Math.abs(Number(split.sum.toFixed(2)));
      }
    });
    const mainContractorAmount = Math.max(0, Number((totalAmount - offsetSum).toFixed(2)));
    const isDiscountSomeone = (sub.operation === 'Покупка зі знижкою в борг комусь');
    const isIncome = (sub.operation === "Прибуток" || sub.operation.includes("Повернули борг") || sub.operation.includes("Прихід") || sub.operation.includes("Коригування (+)") || sub.operation.includes("Початковий борг (+)") || sub.operation.includes("Введені початкові залишки (+)") || (sub.operation.includes("Введені початкові залишки") && !sub.operation.includes("(-)")));
    const bankSign = isIncome ? 1 : -1;
    const sym = data.currency === "UAH" ? "UAH" : (data.currency === "USD" ? "USD" : "EUR");

    const paymentDetails: string[] = [];
    splits.forEach((split: any) => {
      const amount = Math.abs(Number(split.sum.toFixed(2)));
      if (amount <= 0) return;
      
      if (split.acc === "Контрагент") {
        let fromName = "";
        let toName = "";
        if (sub.operation.includes("Повертаю борг")) {
          fromName = (split.text || "").trim();
          toName = (contrName || "").trim() || "—";
        } else if (sub.operation.includes("Повернули борг")) {
          fromName = (contrName || "").trim() || "—";
          toName = (split.text || "").trim();
        } else {
          if (isIncome) {
            fromName = (contrName || "").trim() || "—";
            toName = (split.text || "").trim();
          } else {
            fromName = (split.text || "").trim();
            toName = (contrName || "").trim() || "—";
          }
        }
        paymentDetails.push(amount + " " + sym + " ➔ Контрагент: " + (fromName || "Ми") + " ➔ 👤 " + (toName || "Контрагент"));
      } else if (split.acc === "НеоплаченийБорг") {
        paymentDetails.push(amount + " " + sym + " ➔ записано в борг ⏳");
      } else {
        const directionWord = isIncome ? "отримано на" : "списано з";
        paymentDetails.push(amount + " " + sym + " ➔ " + directionWord + " " + (bankAliases[split.acc] || split.acc));
      }
    });

    let crossRateStr = "";
    if (data.crossMulti && data.crossMulti.length > 0) {
      const subRatio = sub.total_sum / mainTotalAmount;
      for (const cData of data.crossMulti) {
        const cSheets = getSheetsForCurrency(cData.curr, sheetNames);
        const cGrid = await fetchSheetValues(spreadsheetId, token, `${cSheets.money}!A1:L1`);
        const cAliases: any = { 'Готівка': 'Готівка', 'Банк 1': 'Банк 1', 'Банк 2': 'Банк 2', 'Банк 3': 'Банк 3', 'Банк 4': 'Банк 4', 'Банк 5': 'Банк 5' };
        if (cGrid.length >= 1) {
          const cHed = cGrid[0];
          if (cHed[0]) cAliases['Готівка'] = cHed[0].toString().trim();
          if (cHed[2]) cAliases['Банк 1'] = cHed[2].toString().trim();
          if (cHed[4]) cAliases['Банк 2'] = cHed[4].toString().trim();
          if (cHed[6]) cAliases['Банк 3'] = cHed[6].toString().trim();
          if (cHed[8]) cAliases['Банк 4'] = cHed[8].toString().trim();
          if (cHed[10]) cAliases['Банк 5'] = cHed[10].toString().trim();
        }
        const cSum = Number((cData.sum * subRatio).toFixed(2));
        if (cSum > 0) {
          paymentDetails.push(cSum + " " + cData.curr + " ➔ " + (cAliases[cData.acc] || cData.acc));
          if (cData.rate) crossRateStr = "\n📈 Курс: " + cData.rate;
        }
      }
    }

    const fullDistStr = paymentDetails.map(d => "💳 " + d).join("\n");
    let mainFormattedText = "💰 Сума: " + totalAmount + " " + sym;
    if (contrName) mainFormattedText += "\n👤 " + contrName;
    if (sub.comment) mainFormattedText += "\n📝 " + sub.comment;
    if (fullDistStr) mainFormattedText += "\n" + fullDistStr;
    if (crossRateStr) mainFormattedText += crossRateStr;
    if (receiptUrl) mainFormattedText += "\n📎 " + receiptUrl;
    if (plannedBackupText) mainFormattedText += plannedBackupText;
  
  if (debtSheetCfg) {
    if (isDiscountSomeone) {
      const margin = Number((Number(data.contractor2_sum) - totalAmount).toFixed(2));
      if (margin > 0) {
        const bTextCol = 1, bSumCol = 2;
        const bText = subDatePrefix + "💰 Сума: " + margin + " " + sym + " | 👤 " + (data.contractor2 || "Клієнт") + " | 📝 Маржа з покупки | 💳 " + margin + " " + sym + " ➔ 📈 Прибуток";
        if (data.contractor2 && isValidContractorName(data.contractor2)) {
          recordContractorHelper(debtSheetGrid, debtSheetCfg, data.contractor2, bTextCol, bSumCol, bText, margin);
        } else {
          let rowIdx = debtSheetGrid.length + 1;
          if (debtSheetGrid.length >= 2) {
            for (let i = 1; i < debtSheetGrid.length; i++) {
              if (!debtSheetGrid[i][bTextCol - 1] && !debtSheetGrid[i][bSumCol - 1]) {
                rowIdx = i + 1;
                break;
              }
            }
          } else if (debtSheetGrid.length === 1) {
            rowIdx = 2;
          }
          while (debtSheetGrid.length <= rowIdx - 1) debtSheetGrid.push([]);
          debtSheetGrid[rowIdx - 1][bTextCol - 1] = bText;
          debtSheetGrid[rowIdx - 1][bSumCol - 1] = margin.toFixed(2);
          
          valueUpdates.push({
            range: `${sInfo.debtors}!${getColumnLetter(bTextCol)}${rowIdx}:${getColumnLetter(bSumCol)}${rowIdx}`,
            values: [[bText, margin]]
          });
          actionLog.changes.push({
            sheetName: sInfo.debtors,
            sheetId: debtSheetCfg.sheetId,
            row: rowIdx,
            col1: bTextCol,
            col2: bSumCol,
            isInsert: false
          });
        }
      }
    }
    if (
      sub.operation === "Прибуток" ||
      sub.operation === "Покупка" ||
      sub.operation === "Повернули борг" ||
      sub.operation === "Повертаю борг" ||
      sub.operation === "Покупка зі знижкою в борг" ||
      sub.operation === "Покупка зі знижкою в борг комусь" ||
      sub.operation === "Коригування (+)" ||
      sub.operation === "Коригування (-)"
    ) {
      const mainRatio = mainTotalAmount > 0 ? Math.min(1, Math.max(0, targetMainSplitsSum / mainTotalAmount)) : 1;
      const isIncomeOp = sub.operation === "Прибуток" || sub.operation === "Коригування (+)" || sub.operation === "Повернули борг";
      const bTextCol = isIncomeOp ? 1 : 3;
      const bSumCol = isIncomeOp ? 2 : 4;
      
      let baseSignedSum = 0;
      if (sub.operation === "Прибуток" || sub.operation === "Повернули борг") {
        baseSignedSum = mainContractorAmount;
      } else if (sub.operation === "Коригування (+)") {
        baseSignedSum = totalAmount;
      } else if (sub.operation === "Коригування (-)") {
        baseSignedSum = -totalAmount;
      } else {
        baseSignedSum = -totalAmount;
      }
      
      const bSignedSum = Number((baseSignedSum * mainRatio).toFixed(2));
      
      if (Math.abs(bSignedSum) > 0.001) {
        const bText = subDatePrefix + mainFormattedText;
        if (contrName && isValidContractorName(contrName)) {
          recordContractorHelper(debtSheetGrid, debtSheetCfg, contrName, bTextCol, bSumCol, bText, bSignedSum);
        } else {
          let rowIdx = debtSheetGrid.length + 1;
          if (debtSheetGrid.length >= 2) {
            for (let i = 1; i < debtSheetGrid.length; i++) {
              if (!debtSheetGrid[i] || (!debtSheetGrid[i][bTextCol - 1] && !debtSheetGrid[i][bSumCol - 1])) {
                rowIdx = i + 1;
                break;
              }
            }
          } else if (debtSheetGrid.length === 1) {
            rowIdx = 2;
          }
          while (debtSheetGrid.length <= rowIdx - 1) debtSheetGrid.push([]);
          debtSheetGrid[rowIdx - 1][bTextCol - 1] = bText;
          debtSheetGrid[rowIdx - 1][bSumCol - 1] = bSignedSum.toFixed(2);
          
          valueUpdates.push({
            range: `${sInfo.debtors}!${getColumnLetter(bTextCol)}${rowIdx}:${getColumnLetter(bSumCol)}${rowIdx}`,
            values: [[bText, bSignedSum]]
          });
          actionLog.changes.push({
            sheetName: sInfo.debtors,
            sheetId: debtSheetCfg.sheetId,
            row: rowIdx,
            col1: bTextCol,
            col2: bSumCol,
            isInsert: false
          });
        }
      }
    }
  }
  
  if (contrSheetCfg && contrName && isValidContractorName(contrName) && (sub.operation.includes("Повернули борг") || sub.operation.includes("Повертаю борг"))) {
    const personSign = sub.operation.includes("Повернули борг") ? -1 : 1;
    const entryText = subDatePrefix + mainFormattedText;
    recordContractorHelper(contrSheetGrid, contrSheetCfg, contrName, 1, 2, entryText, totalAmount * personSign);
  }
  
  const hasBankSplits = splits.some((split: any) => split.acc !== "НеоплаченийБорг" && split.acc !== "Контрагент");
  if (!hasBankSplits && moneySheetCfg) {
    const col = 1; // "Готівка"
    let mRow = mainSheetGrid.length + 1;
    if (mainSheetGrid.length >= 2) {
      for (let i = 1; i < mainSheetGrid.length; i++) {
        if (!mainSheetGrid[i] || !mainSheetGrid[i][col - 1]) {
          mRow = i + 1;
          break;
        }
      }
    } else if (mainSheetGrid.length === 1) {
      mRow = 2;
    }
    while (mainSheetGrid.length <= mRow - 1) mainSheetGrid.push([]);
    mainSheetGrid[mRow - 1][col - 1] = subDatePrefix + mainFormattedText;
    mainSheetGrid[mRow - 1][col] = "0.00";
    
    valueUpdates.push({
      range: `${sInfo.money}!${getColumnLetter(col)}${mRow}:${getColumnLetter(col + 1)}${mRow}`,
      values: [[subDatePrefix + mainFormattedText, 0]]
    });
    actionLog.changes.push({
      sheetName: sInfo.money,
      sheetId: moneySheetCfg.sheetId,
      row: mRow,
      col1: col,
      col2: col + 1,
      isInsert: false
    });
  }
  
  for (const split of splits) {
    const amount = Math.abs(Number(split.sum.toFixed(2)));
    if (amount <= 0) continue;
    
    if (split.acc === "НеоплаченийБорг" || split.acc === "Контрагент") {
      const splitName = (split.text || "").trim();
      if (splitName && isValidContractorName(splitName) && contrSheetCfg) {
        let personSign = 1;
        const normOp = sub.operation || "";
        if (normOp.includes("Повернули борг") || normOp.includes("Повернення боргу")) {
          personSign = -1;
        } else if (normOp.includes("Повертаю борг") || normOp.includes("Повернув борг")) {
          personSign = 1;
        } else if (normOp.includes("Початковий борг (+)") || normOp.includes("Введені початкові залишки (+)")) {
          personSign = 1;
        } else if (normOp.includes("Початковий борг (-)") || normOp.includes("Введені початкові залишки (-)")) {
          personSign = -1;
        } else if (normOp.includes("Дав у борг") || normOp.includes("Позичив")) {
          personSign = 1;
        } else if (normOp.includes("Взяв у борг") || normOp.includes("Позичив у")) {
          personSign = -1;
        } else {
          personSign = isIncome ? 1 : -1;
        }
        const entryText = subDatePrefix + mainFormattedText;
        recordContractorHelper(contrSheetGrid, contrSheetCfg, splitName, 1, 2, entryText, amount * personSign);
      }
    } else {
      const col = colMap[split.acc];
      if (col && moneySheetCfg) {
        let mRow = mainSheetGrid.length + 1;
        if (mainSheetGrid.length >= 2) {
          for (let i = 1; i < mainSheetGrid.length; i++) {
            if (!mainSheetGrid[i] || !mainSheetGrid[i][col - 1]) {
              mRow = i + 1;
              break;
            }
          }
        } else if (mainSheetGrid.length === 1) {
          mRow = 2;
        }
        while (mainSheetGrid.length <= mRow - 1) mainSheetGrid.push([]);
        mainSheetGrid[mRow - 1][col - 1] = subDatePrefix + mainFormattedText;
        mainSheetGrid[mRow - 1][col] = (amount * bankSign).toFixed(2);
        
        valueUpdates.push({
          range: `${sInfo.money}!${getColumnLetter(col)}${mRow}:${getColumnLetter(col + 1)}${mRow}`,
          values: [[subDatePrefix + mainFormattedText, Number((amount * bankSign).toFixed(2))]]
        });
        actionLog.changes.push({
          sheetName: sInfo.money,
          sheetId: moneySheetCfg.sheetId,
          row: mRow,
          col1: col,
          col2: col + 1,
          isInsert: false
        });
      }
    }
  }
  
  if (data.crossMulti && data.crossMulti.length > 0) {
    const subRatio = sub.total_sum / mainTotalAmount;
    for (const cData of data.crossMulti) {
      const cSum = Number((cData.sum * subRatio).toFixed(2));
      if (cSum <= 0) continue;

      const cSheets = getSheetsForCurrency(cData.curr, sheetNames);
      const cMoneySheetCfg = sheetConfigs.find(s => s.title === cSheets.money);
      const cCol = colMap[cData.acc] || 1;
      if (cMoneySheetCfg && cCol) {
        if (!crossGrids[cSheets.money]) {
          if (cSheets.money === sInfo.money) {
            crossGrids[cSheets.money] = mainSheetGrid;
          } else {
            crossGrids[cSheets.money] = await fetchSheetValues(spreadsheetId, token, `${cSheets.money}!A1:L1000`);
          }
        }
        const cGrid = crossGrids[cSheets.money];
        let cRow = cGrid.length + 1;
        if (cGrid.length >= 2) {
          for (let i = 1; i < cGrid.length; i++) {
            if (!cGrid[i] || !cGrid[i][cCol - 1]) {
              cRow = i + 1;
              break;
            }
          }
        } else if (cGrid.length === 1) {
          cRow = 2;
        }
        while (cGrid.length <= cRow - 1) cGrid.push([]);
        cGrid[cRow - 1][cCol - 1] = subDatePrefix + "💱 Крос-оплата: " + mainFormattedText;
        cGrid[cRow - 1][cCol] = (cSum * bankSign).toFixed(2);

        valueUpdates.push({
          range: `${cSheets.money}!${getColumnLetter(cCol)}${cRow}:${getColumnLetter(cCol + 1)}${cRow}`,
          values: [[subDatePrefix + "💱 Крос-оплата: " + mainFormattedText, Number((cSum * bankSign).toFixed(2))]]
        });
        actionLog.changes.push({
          sheetName: cSheets.money,
          sheetId: cMoneySheetCfg.sheetId,
          row: cRow,
          col1: cCol,
          col2: cCol + 1,
          isInsert: false
        });
      }

      if (
        cSheets.debtors &&
        (
          sub.operation === "Прибуток" ||
          sub.operation === "Покупка" ||
          sub.operation === "Повернули борг" ||
          sub.operation === "Повертаю борг" ||
          sub.operation === "Покупка зі знижкою в борг" ||
          sub.operation === "Покупка зі знижкою в борг комусь" ||
          sub.operation === "Коригування (+)" ||
          sub.operation === "Коригування (-)"
        )
      ) {
        const cDebtSheetCfg = sheetConfigs.find(s => s.title === cSheets.debtors);
        if (cDebtSheetCfg) {
          if (!crossGrids[cSheets.debtors]) {
            crossGrids[cSheets.debtors] = await fetchSheetValues(spreadsheetId, token, `${cSheets.debtors}!A1:E1000`);
          }
          const cDebtGrid = crossGrids[cSheets.debtors];
          const isIncomeOp = sub.operation === "Прибуток" || sub.operation === "Коригування (+)" || sub.operation === "Повернули борг";
          const bTextCol = isIncomeOp ? 1 : 3;
          const bSumCol = isIncomeOp ? 2 : 4;

          let bSignedSum = 0;
          if (sub.operation === "Прибуток" || sub.operation === "Повернули борг") {
            bSignedSum = cSum;
          } else if (sub.operation === "Коригування (+)") {
            bSignedSum = cSum;
          } else if (sub.operation === "Коригування (-)") {
            bSignedSum = -cSum;
          } else {
            bSignedSum = -cSum;
          }

          const cText = subDatePrefix + mainFormattedText;

          if (contrName && isValidContractorName(contrName)) {
            recordContractorHelper(cDebtGrid, cDebtSheetCfg, contrName, bTextCol, bSumCol, cText, bSignedSum);
          } else {
            let rowIdx = cDebtGrid.length + 1;
            if (cDebtGrid.length >= 2) {
              for (let i = 1; i < cDebtGrid.length; i++) {
                if (!cDebtGrid[i] || (!cDebtGrid[i][bTextCol - 1] && !cDebtGrid[i][bSumCol - 1])) {
                  rowIdx = i + 1;
                  break;
                }
              }
            } else if (cDebtGrid.length === 1) {
              rowIdx = 2;
            }
            while (cDebtGrid.length <= rowIdx - 1) cDebtGrid.push([]);
            cDebtGrid[rowIdx - 1][bTextCol - 1] = cText;
            cDebtGrid[rowIdx - 1][bSumCol - 1] = bSignedSum.toFixed(2);

            valueUpdates.push({
              range: `${cSheets.debtors}!${getColumnLetter(bTextCol)}${rowIdx}:${getColumnLetter(bSumCol)}${rowIdx}`,
              values: [[cText, bSignedSum]]
            });
            actionLog.changes.push({
              sheetName: cSheets.debtors,
              sheetId: cDebtSheetCfg.sheetId,
              row: rowIdx,
              col1: bTextCol,
              col2: bSumCol,
              isInsert: false
            });
          }
        }
      }


    }
  }
  
  if (isDiscountSomeone) {
    const contr2Name = (data.contractor2 || "").trim();
    const contr2Sum = Number(Number(data.contractor2_sum).toFixed(2));
    if (contr2Name && contr2Sum > 0 && isValidContractorName(contr2Name) && contrSheetCfg) {
      recordContractorHelper(contrSheetGrid, contrSheetCfg, contr2Name, 1, 2, subDatePrefix + mainFormattedText, contr2Sum);
    }
  }
  }
  
  if (data.plannedId && workingPlannedList) {
    let changed = false;
    for (let p = 0; p < workingPlannedList.length; p++) {
      if (String(workingPlannedList[p].id) === String(data.plannedId)) {
        if (data.isInterestFulfillment) {
          const pItem = workingPlannedList[p];
          const todayD = new Date();
          const todayStr = todayD.getFullYear() + '-' + String(todayD.getMonth() + 1).padStart(2, '0') + '-' + String(todayD.getDate()).padStart(2, '0');
          const targetDateStr = data.interestFulfillmentUpToDate || data.date || todayStr;
          
          const principalAction = data.interestPrincipalAction || "none";
          const principalWithdrawSum = Number(data.interestPrincipalWithdrawSum) || 0;
          let removeContract = false;

          const originalPrincipal = Number(pItem.sum) || 0;

          if (principalAction === "all") {
            removeContract = true;
          } else if (principalAction === "part") {
            pItem.sum = Number((pItem.sum - principalWithdrawSum).toFixed(2));
            if (pItem.sum <= 0.01) {
              removeContract = true;
            }
          }

          if (removeContract) {
            workingPlannedList.splice(p, 1);
            p--;
          } else {
            const startStr = pItem.interestStartDate || pItem.date;
            let totalAccruedForPeriod = Number(data.interestFulfillmentCalculatedAccrued) || 0;

            if (!totalAccruedForPeriod && startStr) {
              const rate = Number(pItem.interestRate) || 0;
              const oldAccumulated = Number(pItem.accumulatedInterest) || 0;
              const { accrued: newAccrued } = calculateAccruedInterest(originalPrincipal, rate, pItem.interestPeriod, startStr, targetDateStr);
              totalAccruedForPeriod = Number((oldAccumulated + newAccrued).toFixed(2));
            }

            const interestPaid = data.isInterestFulfillment ? Math.max(0, Number((mainTotalAmount - principalWithdrawSum).toFixed(2))) : mainTotalAmount;
            const remainingInterestAtTarget = Number((totalAccruedForPeriod - interestPaid).toFixed(2));

            const transDateStr = data.date || todayStr;
            let accruedGap = 0;
            if (targetDateStr && transDateStr && transDateStr > targetDateStr) {
              const rate = Number(pItem.interestRate) || 0;
              const { accrued: gapAccrued } = calculateAccruedInterest(originalPrincipal, rate, pItem.interestPeriod, targetDateStr, transDateStr);
              accruedGap = gapAccrued;
            }

            const totalNewAccumulated = Number((Math.max(0, remainingInterestAtTarget) + accruedGap).toFixed(2));

            pItem.interestStartDate = transDateStr;
            if (totalNewAccumulated > 0 && pItem.sum > 0) {
              pItem.accumulatedInterest = totalNewAccumulated;
            } else {
              pItem.accumulatedInterest = 0;
            }

            // Auto-prolong contract term (dueDate and date) to the next period after interest fulfillment
            const baseTermDateStr = targetDateStr || pItem.dueDate || pItem.date || transDateStr;
            const termParts = baseTermDateStr.split('-');
            if (termParts.length === 3) {
              const ty = parseInt(termParts[0], 10);
              const tm = parseInt(termParts[1], 10) - 1;
              const td = parseInt(termParts[2], 10);
              const nextTermObj = new Date(ty, tm, td);
              if (pItem.interestPeriod === "annual") {
                nextTermObj.setFullYear(nextTermObj.getFullYear() + 1);
              } else {
                nextTermObj.setMonth(nextTermObj.getMonth() + 1);
              }
              const nextTermStr = nextTermObj.getFullYear() + '-' + String(nextTermObj.getMonth() + 1).padStart(2, '0') + '-' + String(nextTermObj.getDate()).padStart(2, '0');
              pItem.dueDate = nextTermStr;
              pItem.date = nextTermStr;
            }
          }
        } else {
          workingPlannedList[p].sum = Number((workingPlannedList[p].sum - mainTotalAmount).toFixed(2));
          if (workingPlannedList[p].sum <= 0.01) {
            if (workingPlannedList[p].isRegular) {
              workingPlannedList[p].sum = workingPlannedList[p].originalSum || workingPlannedList[p].sum;
              const parts = workingPlannedList[p].date.split('-');
              const oldDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
              oldDate.setMonth(oldDate.getMonth() + 1);
              const nextRegDate = oldDate.getFullYear() + '-' + String(oldDate.getMonth() + 1).padStart(2, '0') + '-' + String(oldDate.getDate()).padStart(2, '0');
              workingPlannedList[p].date = nextRegDate;
              workingPlannedList[p].dueDate = nextRegDate;
            } else {
              workingPlannedList.splice(p, 1);
              p--;
            }
          }
        }
        changed = true;
        break;
      }
    }
    if (changed) {
      if (isOnlinePlannedList) {
        await savePlannedListToSheet(spreadsheetId!, token!, workingPlannedList);
        // Sync online list back to local storage caches as well
        const currList = ["UAH", "USD", "EUR"];
        currList.forEach(c => {
          const cLower = c.toLowerCase();
          const incs = workingPlannedList!.filter(pItem => pItem.currency === c && pItem.type === 'income');
          const exps = workingPlannedList!.filter(pItem => pItem.currency === c && pItem.type === 'expense');
          localStorage.setItem('plannedInc_' + cLower, JSON.stringify(incs));
          localStorage.setItem('plannedExp_' + cLower, JSON.stringify(exps));
        });
      } else {
        const c = (data.currency || "UAH").toLowerCase();
        const key = 'planned' + (data.plannedType === 'expense' ? 'Exp_' : 'Inc_') + c;
        localStorage.setItem(key, JSON.stringify(workingPlannedList));
      }
    }
  }

  if (data.createPlannedInterest && workingPlannedList) {
    const type: "income" | "expense" = data.plannedInterestMode === "give" ? "income" : "expense";
    const plannedKey = 'planned' + (type === 'expense' ? 'Exp_' : 'Inc_') + (data.currency || "UAH").toLowerCase();
    
    const newItem = {
      id: new Date().getTime().toString() + "_interest",
      currency: (data.currency || "UAH").toUpperCase(),
      type: type,
      name: `Нараховані відсотки: ${contrName || "Контрагент"}`,
      sum: mainTotalAmount,
      category: "Відсотки",
      date: new Date().toISOString().split('T')[0],
      isRegular: true,
      isInterest: true,
      interestMode: data.plannedInterestMode,
      interestRate: data.plannedInterestRate || 10,
      interestPeriod: data.plannedInterestPeriod || "monthly",
      interestStartDate: data.plannedInterestStartDate || new Date().toISOString().split('T')[0],
      dueDate: data.plannedInterestDueDate || "",
      originalSum: mainTotalAmount
    };
    
    workingPlannedList.push(newItem);
    
    // Update local storage for all types and currencies
    const currList = ["UAH", "USD", "EUR"];
    currList.forEach(c => {
      const cLower = c.toLowerCase();
      const incs = workingPlannedList!.filter(pItem => pItem.currency === c && pItem.type === 'income');
      const exps = workingPlannedList!.filter(pItem => pItem.currency === c && pItem.type === 'expense');
      localStorage.setItem('plannedInc_' + cLower, JSON.stringify(incs));
      localStorage.setItem('plannedExp_' + cLower, JSON.stringify(exps));
    });
    
    if (spreadsheetId && token && isOnlinePlannedList) {
      try {
        await savePlannedListToSheet(spreadsheetId, token, workingPlannedList);
      } catch (err) {
        console.error("Error auto-creating and syncing planned interest item to Google Sheets:", err);
      }
    }
  }
  
  // Resolve pending grid updates using their final row index in the grid
  for (const w of pendingGridUpdates) {
    const finalRowIndex = w.grid.indexOf(w.rowObj);
    if (finalRowIndex === -1) {
      console.error("Failed to find row object in grid", w.rowObj);
      continue;
    }
    const rowNum = finalRowIndex + 1;
    const startColLetter = getColumnLetter(Math.min(w.textCol, w.sumCol));
    const endColLetter = getColumnLetter(Math.max(w.textCol, w.sumCol));
    
    valueUpdates.push({
      range: `${w.sheetCfg.title}!${startColLetter}${rowNum}:${endColLetter}${rowNum}`,
      values: w.values
    });
    
    if (w.changeLog) {
      actionLog.changes.push({
        sheetName: w.changeLog.sheetName,
        sheetId: w.changeLog.sheetId,
        row: rowNum,
        col1: w.changeLog.col1,
        col2: w.changeLog.col2,
        isInsert: w.changeLog.isInsert
      });
    }
  }
  
  if (batchRequests.length > 0) {
    const batchRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requests: batchRequests })
    });
    if (!batchRes.ok) {
      throw new Error(`Failed to batch update layout: ${batchRes.statusText}`);
    }
  }
  
  if (valueUpdates.length > 0) {
    const valuesRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: valueUpdates
      })
    });
    if (!valuesRes.ok) {
      throw new Error(`Failed to update values: ${valuesRes.statusText}`);
    }
  }
  
  return actionLog;
}

export async function clearContractorData(
  spreadsheetId: string,
  token: string,
  name: string,
  currency: string,
  sheetConfigs: SheetConfig[],
  mode: "all" | "keep_balance" = "all"
) {
  const sheetNames = sheetConfigs.map(s => s.title);
  const sInfo = getSheetsForCurrency(currency, sheetNames);
  const contrSheetCfg = sheetConfigs.find(s => s.title === sInfo.contractors);
  if (!contrSheetCfg) return false;
  
  const dataC = await fetchSheetValues(spreadsheetId, token, `${sInfo.contractors}!A1:B1000`);
  if (dataC.length < 1) return false;
  
  // Calculate current contractor balance before clearing
  let currentBalance = 0;
  let trackCBalance = false;
  for (const row of dataC) {
    if (!row) continue;
    const t = row[0] ? row[0].toString().trim() : "";
    const s = row.length > 1 ? parseSheetFloat(row[1]) : NaN;
    if (t && isValidContractorName(t)) {
      trackCBalance = (t.toLowerCase() === name.toLowerCase());
    } else if (trackCBalance && (!t || t.indexOf("[") === 0 || !isNaN(s))) {
      if (!isNaN(s)) {
        currentBalance += s;
      }
    }
  }
  
  // 1. Collect all contractor names on the sheet before deletion to determine other active contractors
  const allContractors = new Set<string>();
  for (const row of dataC) {
    if (!row) continue;
    const t = row[0] ? row[0].toString().trim() : "";
    if (t && isValidContractorName(t)) {
      allContractors.add(t.toLowerCase());
    }
  }
  
  const otherActiveContractors = Array.from(allContractors).filter(c => c !== name.toLowerCase());
  
  // Helper to check word boundaries for Cyrillic/Latin characters in description cells
  const cellMentionsContractor = (cellVal: string, targetName: string): boolean => {
    if (!cellVal) return false;
    const val = cellVal.toLowerCase();
    const n = targetName.toLowerCase().trim();
    if (!n) return false;
    
    let pos = val.indexOf(n);
    const isLetter = (ch: string) => {
      return /[a-zA-Zа-яА-ЯёЁіІїЇєЄґҐ]/.test(ch);
    };
    
    while (pos !== -1) {
      const charBefore = pos > 0 ? val[pos - 1] : "";
      const charAfter = pos + n.length < val.length ? val[pos + n.length] : "";
      
      if (!isLetter(charBefore) && !isLetter(charAfter)) {
        return true;
      }
      pos = val.indexOf(n, pos + 1);
    }
    return false;
  };

  const rowsToDelete: number[] = [];
  let trackC = false;
  
  for (let i = 0; i < dataC.length; i++) {
    const row = dataC[i];
    if (!row) continue;
    const t = row[0] ? row[0].toString().trim() : "";
    const s = row.length > 1 ? parseSheetFloat(row[1]) : NaN;
    if (t && isValidContractorName(t)) {
      trackC = (t.toLowerCase() === name.toLowerCase());
      if (trackC) {
        if (mode === "all") {
          rowsToDelete.push(i + 1);
        }
      }
    } else if (trackC && (!t || t.indexOf("[") === 0 || !isNaN(s))) {
      rowsToDelete.push(i + 1);
    }
  }
  
  if (rowsToDelete.length > 0) {
    const requests = rowsToDelete.reverse().map(row => ({
      deleteDimension: {
        range: {
          sheetId: contrSheetCfg.sheetId,
          dimension: "ROWS",
          startIndex: row - 1,
          endIndex: row
        }
      }
    }));
    
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ requests })
    });
    
    if (!res.ok) return false;
  }

  // 2. Scan and clear history operations from Money and Debtors sheets
  const valueUpdates: any[] = [];
  
  const scanAndClearSheet = async (sheetName: string) => {
    const grid = await fetchSheetValues(spreadsheetId, token, `${sheetName}!A1:Z1000`);
    if (grid.length === 0) return;
    
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r];
      if (!row) continue;
      // Check even-indexed columns (0, 2, 4, 6, 8, etc.) which store descriptions
      for (let c = 0; c < row.length; c += 2) {
        const cellVal = row[c] != null ? row[c].toString() : "";
        if (!cellVal) continue;
        
        if (cellMentionsContractor(cellVal, name)) {
          const hasOtherContractor = otherActiveContractors.some(otherC => 
            cellMentionsContractor(cellVal, otherC)
          );
          
          if (!hasOtherContractor) {
            const qSheet = `'${sheetName.replace(/'/g, "''")}'`;
            // Clear description cell (col c) and its adjacent amount cell (col c+1)
            valueUpdates.push({
              range: `${qSheet}!${getColumnLetter(c + 1)}${r + 1}`,
              values: [[""]]
            });
            valueUpdates.push({
              range: `${qSheet}!${getColumnLetter(c + 2)}${r + 1}`,
              values: [[""]]
            });
          }
        }
      }
    }
  };

  // We do NOT scan and clear the Money (cash flow) sheet, because that represents 
  // immutable physical bank/card flow records. Wiping them would break bank card balances!
  // Instead, we only clear active debt records from the Debtors sheet.
  if (sheetNames.includes(sInfo.debtors)) {
    await scanAndClearSheet(sInfo.debtors);
  }

  if (valueUpdates.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: valueUpdates
      })
    });
  }

  // 3. If mode === "keep_balance", append a starting balance row right below contractor's header
  if (mode === "keep_balance") {
    const refetchedGrid = await fetchSheetValues(spreadsheetId, token, `${sInfo.contractors}!A1:B1000`);
    let contrRowIdx = -1;
    for (let i = 0; i < refetchedGrid.length; i++) {
      if (refetchedGrid[i] && refetchedGrid[i][0]?.toString().trim().toLowerCase() === name.trim().toLowerCase()) {
        contrRowIdx = i; // 0-based index
        break;
      }
    }

    if (contrRowIdx !== -1) {
      const targetRow = contrRowIdx + 1;
      
      const options: Intl.DateTimeFormatOptions = {
        day: "2-digit", month: "2-digit", year: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false, timeZone: "Europe/Kiev"
      };
      const dateStr = new Intl.DateTimeFormat("uk-UA", options).format(new Date()).replace(",", "");
      const entryText = `[${dateStr} | Борг] Початковий баланс (історію очищено)`;
      
      const insertReq = {
        insertRange: {
          range: {
            sheetId: contrSheetCfg.sheetId,
            startRowIndex: targetRow,
            endRowIndex: targetRow + 1,
            startColumnIndex: 0,
            endColumnIndex: 2
          },
          shiftDimension: "ROWS"
        }
      };

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ requests: [insertReq] })
      });

      const qContr = `'${sInfo.contractors.replace(/'/g, "''")}'`;
      const writeUpdate = {
        range: `${qContr}!A${targetRow + 1}:B${targetRow + 1}`,
        values: [[entryText, Number(currentBalance.toFixed(2))]]
      };

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: [writeUpdate]
        })
      });
    }
  }
  
  return true;
}

function getColumnLetter(col: number): string {
  let temp = "";
  while (col > 0) {
    const t = (col - 1) % 26;
    temp = String.fromCharCode(65 + t) + temp;
    col = Math.floor((col - t) / 26);
  }
  return temp || "A";
}

export async function updatePastOperation(
  spreadsheetId: string,
  token: string,
  dateStr: string,
  updatedData: { sum: number; contractor: string; comment: string; operation?: string; isSplit?: boolean },
  currency: string,
  sheetConfigs: SheetConfig[]
) {
  const currList = ["UAH", "USD", "EUR"];
  const updates: any[] = [];

  for (const cCurr of currList) {
    const sInfo = getSheetsForCurrency(cCurr, sheetConfigs.map(s => s.title));
    const targetSheets = [sInfo.money, sInfo.contractors, sInfo.debtors].filter(title => sheetConfigs.some(s => s.title === title));
    const sym = cCurr === "UAH" ? "UAH" : (cCurr === "USD" ? "USD" : "EUR");

    for (const title of targetSheets) {
      const grid = await fetchSheetValues(spreadsheetId, token, `${title}!A1:Z1000`);
      if (grid.length === 0) continue;

      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const cellVal = grid[r][c] != null ? grid[r][c].toString() : "";
          if (matchesOperationDatePrefix(cellVal, dateStr)) {
            // Found matching description cell! Rebuild cell value keeping the receipt if present
            const parsed = parseTransactionText(cellVal);
            const receiptUrl = parsed.receiptUrl || "";

            const rawSum = grid[r] && grid[r][c + 1] != null ? grid[r][c + 1].toString() : "";
            const originalSumVal = parseSheetFloat(rawSum);
            const origAbsSum = !isNaN(originalSumVal) ? Math.abs(originalSumVal) : 0;

            let targetSheetSum = origAbsSum;

            if (cCurr === currency) {
              // The active currency sheet being edited by user -> use updatedData.sum
              targetSheetSum = updatedData.sum;
            } else {
              // Cross-currency sheet: extract explicit amount for cCurr from description text if present
              let textCurrMatch: RegExpMatchArray | null = null;
              if (cCurr === "USD") {
                textCurrMatch = (parsed.cardDetails || cellVal).match(/([\d.]+)\s*(?:USD|\$)/i) || cellVal.match(/([\d.]+)\s*(?:USD|\$)/i);
              } else if (cCurr === "UAH") {
                textCurrMatch = (parsed.cardDetails || cellVal).match(/([\d.]+)\s*(?:UAH|₴|грн)/i) || cellVal.match(/([\d.]+)\s*(?:UAH|₴|грн)/i);
              } else if (cCurr === "EUR") {
                textCurrMatch = (parsed.cardDetails || cellVal).match(/([\d.]+)\s*(?:EUR|€)/i) || cellVal.match(/([\d.]+)\s*(?:EUR|€)/i);
              }

              if (textCurrMatch) {
                const parsedVal = parseFloat(textCurrMatch[1]);
                if (parsedVal > 0) {
                  if (cCurr === "USD" && parsedVal > 2000) {
                    const cardMatch = (parsed.cardDetails || "").match(/([\d.]+)\s*(?:USD|\$)/i);
                    if (cardMatch && parseFloat(cardMatch[1]) > 0 && parseFloat(cardMatch[1]) < 2000) {
                      targetSheetSum = parseFloat(cardMatch[1]);
                    } else if (origAbsSum > 0 && origAbsSum < 2000) {
                      targetSheetSum = origAbsSum;
                    } else {
                      targetSheetSum = parsedVal;
                    }
                  } else {
                    targetSheetSum = parsedVal;
                  }
                }
              } else if (origAbsSum > 0) {
                if (cCurr === "USD" && origAbsSum > 2000) {
                  const cardMatch = (parsed.cardDetails || "").match(/([\d.]+)\s*(?:USD|\$)/i);
                  if (cardMatch && parseFloat(cardMatch[1]) > 0 && parseFloat(cardMatch[1]) < 2000) {
                    targetSheetSum = parseFloat(cardMatch[1]);
                  }
                } else {
                  targetSheetSum = origAbsSum;
                }
              }
            }

            let rowContractor = updatedData.contractor.trim();
            if (!rowContractor && parsed.contractor) {
              rowContractor = parsed.contractor.trim();
            }

            let amountLine = "💰 Сума: " + targetSheetSum + " " + sym;

            let mainFormattedText = amountLine;
            if (rowContractor) {
              mainFormattedText += "\n👤 " + rowContractor;
            }
            if (updatedData.comment.trim()) {
              mainFormattedText += "\n📝 " + updatedData.comment.trim();
            }

            if (parsed.cardDetails) {
              mainFormattedText += "\n💳 " + parsed.cardDetails;
            }
            if (parsed.exchangeDetails) {
              mainFormattedText += "\n" + parsed.exchangeDetails.split("\n").map(d => d.startsWith("💳") ? d : "💳 " + d).join("\n");
            }
            if (parsed.rate) {
              mainFormattedText += "\n📈 Курс: " + parsed.rate;
            }
            if (receiptUrl) {
              mainFormattedText += "\n📎 " + receiptUrl;
            }

            const bracketMatch = cellVal.match(/^\[(.*?)\]/);
            const bracketHeader = bracketMatch ? bracketMatch[0] : `[${dateStr}]`;

            const newCellVal = bracketHeader + " " + mainFormattedText;

            updates.push({
              range: `${title}!${getColumnLetter(c + 1)}${r + 1}`,
              values: [[newCellVal]]
            });

            if (grid[r] && grid[r][c + 1] != null) {
              const originalSumVal = parseSheetFloat(grid[r][c + 1].toString());
              if (!isNaN(originalSumVal)) {
                const sign = originalSumVal < 0 ? -1 : 1;
                const newSumVal = Number((Math.abs(targetSheetSum) * sign).toFixed(2));
                updates.push({
                  range: `${title}!${getColumnLetter(c + 2)}${r + 1}`,
                  values: [[newSumVal]]
                });
              }
            }
          }
        }
      }
    }
  }

  if (updates.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updates
      })
    });
    return true;
  }
  return false;
}

function matchesOperationDatePrefix(cellVal: string, dateStr: string): boolean {
  if (!cellVal || !dateStr) return false;
  
  const cleanStr = (s: string) => 
    s.replace(/[\u202F\u00A0]/g, " ")
     .replace(/,/g, " ")
     .replace(/\s+/g, " ")
     .trim();

  const trimmedCell = cleanStr(cellVal);
  const cleanDateStr = cleanStr(dateStr);

  if (!trimmedCell || !cleanDateStr) return false;

  if (cleanDateStr.startsWith("Без дати")) {
    return trimmedCell.includes(cleanDateStr);
  }

  // Direct substring check
  if (trimmedCell.includes(cleanDateStr)) return true;

  // Extract the header inside [ ... ] from cellVal
  const bracketMatch = cellVal.match(/\[(.*?)\]/);
  const cellHeader = bracketMatch ? cleanStr(bracketMatch[1]) : trimmedCell;
  const cellDatePart = cellHeader.split("|")[0].trim();

  const parseDateTime = (str: string) => {
    const s = cleanStr(str);
    const m = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (!m) return null;
    let yr = parseInt(m[3], 10);
    if (yr > 100) yr = yr % 100;
    return {
      day: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      year: yr,
      hour: m[4] !== undefined ? parseInt(m[4], 10) : null,
      min: m[5] !== undefined ? parseInt(m[5], 10) : null,
      sec: m[6] !== undefined ? parseInt(m[6], 10) : null
    };
  };

  const targetDt = parseDateTime(cleanDateStr);
  const cellDt = parseDateTime(cellDatePart);

  if (!targetDt || !cellDt) return false;

  if (targetDt.day !== cellDt.day || targetDt.month !== cellDt.month || targetDt.year !== cellDt.year) {
    return false;
  }

  if (targetDt.hour !== null && cellDt.hour !== null) {
    if (targetDt.hour !== cellDt.hour || targetDt.min !== cellDt.min) {
      return false;
    }
  }

  // CRITICAL: If both target and cell specify seconds, they MUST match!
  if (targetDt.sec !== null && cellDt.sec !== null) {
    if (targetDt.sec !== cellDt.sec) {
      return false;
    }
  }

  return true;
}

export async function deletePastOperation(
  spreadsheetId: string,
  token: string,
  dateStr: string,
  currency: string,
  sheetConfigs: SheetConfig[],
  mode: "all" | "history_only" = "all"
) {
  // Search ALL sheets in sheetConfigs except "Заплановано"
  const targetSheets = Array.from(new Set(sheetConfigs.map(s => s.title))).filter(t => t !== "Заплановано");
  if (targetSheets.length === 0) return true;

  const updates: any[] = [];
  const restoredItemIds = new Set<string>();
  const itemsToRestore: any[] = [];

  const urlParams = targetSheets.map(t => `ranges=${encodeURIComponent(`'${t.replace(/'/g, "''")}'!A1:Z`)}`).join("&");
  const batchGetRes = await fetchWithRetry(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${urlParams}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!batchGetRes.ok) {
    const errText = await batchGetRes.text();
    console.error("batchGet failed in deletePastOperation:", errText);
    if (batchGetRes.status === 401 || errText.includes("UNAUTHENTICATED") || errText.includes("401")) {
      throw new Error("AUTH_EXPIRED");
    }
    throw new Error(`Google Sheets error: ${errText}`);
  }

  const batchData = await batchGetRes.json();
  const valueRanges = batchData.valueRanges || [];

  for (let i = 0; i < targetSheets.length; i++) {
    const title = targetSheets[i];
    const vr = valueRanges[i];
    const grid = vr?.values || [];
    if (!grid || grid.length === 0) continue;

    const isDebtorsSheet = title.includes("боржники") || title.includes("debtors") || title.includes("debts");

    for (let r = 0; r < grid.length; r++) {
      if (!grid[r]) continue;
      for (let c = 0; c < grid[r].length; c++) {
        const cellVal = grid[r][c] != null ? grid[r][c].toString() : "";
        if (matchesOperationDatePrefix(cellVal, dateStr)) {
          const match = cellVal.match(/⚙️ Реверс запланованого:\s*(\{.*\})/);
          if (match) {
            try {
              const backupItem = JSON.parse(match[1]);
              if (backupItem && backupItem.id && !restoredItemIds.has(backupItem.id)) {
                restoredItemIds.add(backupItem.id);
                itemsToRestore.push(backupItem);
              }
            } catch (err) {
              console.error("Error parsing backup planned item from cell:", err);
            }
          }

          const qTitle = `'${title.replace(/'/g, "''")}'`;
          if (mode === "all" || isDebtorsSheet) {
            updates.push({
              range: `${qTitle}!${getColumnLetter(c + 1)}${r + 1}:${getColumnLetter(c + 2)}${r + 1}`,
              values: [["", ""]]
            });
          } else {
            updates.push({
              range: `${qTitle}!${getColumnLetter(c + 1)}${r + 1}`,
              values: [[""]]
            });
          }
        }
      }
    }
  }

  if (updates.length > 0) {
    const batchRes = await fetchWithRetry(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          valueInputOption: "USER_ENTERED",
          data: updates
        })
      }
    );

    if (!batchRes.ok) {
      const errText = await batchRes.text();
      console.error("Batch update error deleting operation:", errText);
      if (batchRes.status === 401 || errText.includes("UNAUTHENTICATED") || errText.includes("401")) {
        throw new Error("AUTH_EXPIRED");
      }
      throw new Error(`Google Sheets error: ${errText}`);
    }
  }

  if (itemsToRestore.length > 0) {
    let pList: any[] = [];
    let hasOnlinePlanned = false;
    try {
      const plannedRes = await fetchWithRetry(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent("Заплановано!A1:O1000")}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (plannedRes.ok) {
        const plannedData = await plannedRes.json();
        const rows = plannedData.values || [];
        pList = parsePlannedRows(rows);
        hasOnlinePlanned = true;
      }
    } catch (err) {
      console.error("Error fetching planned list for restoration:", err);
    }

    if (hasOnlinePlanned) {
      let changed = false;
      for (const backupItem of itemsToRestore) {
        const idx = pList.findIndex(i => String(i.id) === String(backupItem.id));
        if (idx !== -1) {
          pList[idx] = { ...pList[idx], ...backupItem };
          changed = true;
        } else {
          pList.push(backupItem);
          changed = true;
        }
      }
      if (changed) {
        await savePlannedListToSheet(spreadsheetId, token, pList);
        const currList = ["UAH", "USD", "EUR"];
        currList.forEach(c => {
          const cLower = c.toLowerCase();
          const incs = pList.filter(pItem => pItem.currency === c && pItem.type === 'income');
          const exps = pList.filter(pItem => pItem.currency === c && pItem.type === 'expense');
          localStorage.setItem('plannedInc_' + cLower, JSON.stringify(incs));
          localStorage.setItem('plannedExp_' + cLower, JSON.stringify(exps));
        });
      }
    }
  }

  return true;
}

export async function deleteBankSpecificOperation(
  spreadsheetId: string,
  token: string,
  dateStr: string,
  bankKey: string,
  currency: string,
  sheetConfigs: any[]
) {
  const sheetNames = sheetConfigs.map(s => s.title);
  const sInfo = getSheetsForCurrency(currency, sheetNames);
  
  // Find column pair based on bankKey
  const keys = ["Готівка", "Банк 1", "Банк 2", "Банк 3", "Банк 4", "Банк 5"];
  const cols = [1, 3, 5, 7, 9, 11];
  const bIndex = keys.indexOf(bankKey);
  if (bIndex === -1) {
    return false;
  }
  
  const textColIdx = cols[bIndex] - 1; // 0-based col index
  const sumColIdx = cols[bIndex];     // 0-based col index
  
  const updates: any[] = [];

  // 1. Clear in selected money sheet (selected currency only)
  const moneySheet = sInfo.money;
  if (moneySheet && sheetNames.includes(moneySheet)) {
    const grid = await fetchSheetValues(spreadsheetId, token, `${moneySheet}!A1:Z`);
    if (grid && grid.length > 0) {
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        if (!row) continue;
        const cellVal = row[textColIdx] != null ? row[textColIdx].toString() : "";
        if (matchesOperationDatePrefix(cellVal, dateStr)) {
          const qSheet = `'${moneySheet.replace(/'/g, "''")}'`;
          updates.push({
            range: `${qSheet}!${getColumnLetter(textColIdx + 1)}${r + 1}:${getColumnLetter(sumColIdx + 1)}${r + 1}`,
            values: [["", ""]]
          });
        }
      }
    }
  }

  // 2. Clear in contractors and debtors sheets for ALL currencies (to keep reports perfectly synchronized)
  const currencies = ["UAH", "USD", "EUR"];
  const secondarySheetsSet = new Set<string>();
  for (const curr of currencies) {
    const info = getSheetsForCurrency(curr, sheetNames);
    if (info.contractors && sheetNames.includes(info.contractors)) secondarySheetsSet.add(info.contractors);
    if (info.debtors && sheetNames.includes(info.debtors)) secondarySheetsSet.add(info.debtors);
  }

  for (const title of secondarySheetsSet) {
    const grid = await fetchSheetValues(spreadsheetId, token, `${title}!A1:Z`);
    if (grid && grid.length > 0) {
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const cellVal = grid[r][c] != null ? grid[r][c].toString() : "";
          if (matchesOperationDatePrefix(cellVal, dateStr)) {
            const qTitle = `'${title.replace(/'/g, "''")}'`;
            updates.push({
              range: `${qTitle}!${getColumnLetter(c + 1)}${r + 1}:${getColumnLetter(c + 2)}${r + 1}`,
              values: [["", ""]]
            });
          }
        }
      }
    }
  }
  
  if (updates.length > 0) {
    const batchRes = await fetchWithRetry(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: updates
      })
    });
    if (!batchRes.ok) {
      const errText = await batchRes.text();
      console.error("Batch update error deleting bank operation:", errText);
      throw new Error(`Google Sheets error: ${errText}`);
    }
    return true;
  }
  return false;
}
