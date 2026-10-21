export interface DailyRates {
  usd: number;
  usdSell: number;
  eur: number;
  eurSell: number;
  source?: string;
}

export interface RatesForDateResult {
  usd: number;
  usdSell: number;
  eur: number;
  eurSell: number;
  isFallback: boolean;
  rateDate: string;
  isCarriedForward: boolean;
  source?: string;
}

export function getDailyRatesMap(): Record<string, DailyRates> {
  try {
    const raw = localStorage.getItem("accounting_daily_rates");
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to parse accounting_daily_rates", e);
  }
  return {};
}

export function saveDailyRatesMap(
  ratesMap: Record<string, { usd: number; usdSell?: number; eur: number; eurSell?: number; source?: string }>
) {
  try {
    const map = getDailyRatesMap();
    let updated = false;
    Object.keys(ratesMap).forEach(d => {
      const item = ratesMap[d];
      if (item && item.usd > 0 && item.eur > 0) {
        map[d] = {
          usd: item.usd,
          usdSell: item.usdSell || item.usd,
          eur: item.eur,
          eurSell: item.eurSell || item.eur,
          source: item.source || "telegram"
        };
        updated = true;
      }
    });
    if (updated) {
      localStorage.setItem("accounting_daily_rates", JSON.stringify(map));
    }
  } catch (e) {
    console.warn("Failed to save daily rates map", e);
  }
}

export function saveDailyRatesForDate(
  dateISO: string,
  rates: { usd: number; usdSell?: number; eur: number; eurSell?: number; source?: string }
) {
  try {
    const map = getDailyRatesMap();
    map[dateISO] = {
      usd: rates.usd,
      usdSell: rates.usdSell || rates.usd,
      eur: rates.eur,
      eurSell: rates.eurSell || rates.eur,
      source: rates.source || "telegram"
    };
    localStorage.setItem("accounting_daily_rates", JSON.stringify(map));
  } catch (e) {
    console.warn("Failed to save daily rates", e);
  }
}

export function getRatesForDate(
  dateISO: string,
  fallbackRates: { usd: number; usdSell?: number; eur: number; eurSell?: number }
): RatesForDateResult {
  const map = getDailyRatesMap();
  
  // 1. Direct match in Telegram / Daily rates map
  if (map[dateISO]) {
    return {
      usd: map[dateISO].usd,
      usdSell: map[dateISO].usdSell || map[dateISO].usd,
      eur: map[dateISO].eur,
      eurSell: map[dateISO].eurSell || map[dateISO].eur,
      isFallback: false,
      rateDate: dateISO,
      isCarriedForward: false,
      source: map[dateISO].source || "telegram"
    };
  }

  // 2. Closest preceding date in Telegram / Daily rates map (Carry Forward)
  const sortedDates = Object.keys(map).filter(d => d <= dateISO).sort().reverse();
  if (sortedDates.length > 0) {
    const closestDate = sortedDates[0];
    const r = map[closestDate];
    return {
      usd: r.usd,
      usdSell: r.usdSell || r.usd,
      eur: r.eur,
      eurSell: r.eurSell || r.eur,
      isFallback: false,
      rateDate: closestDate,
      isCarriedForward: true,
      source: r.source || "telegram"
    };
  }

  // 3. Try stored capital snapshots as backup
  try {
    const rawSnaps = localStorage.getItem("accounting_daily_capital_snapshots");
    if (rawSnaps) {
      const snaps = JSON.parse(rawSnaps);
      if (snaps[dateISO]?.rates) {
        const sr = snaps[dateISO].rates;
        return {
          usd: sr.usd,
          usdSell: sr.usdSell || sr.usd,
          eur: sr.eur,
          eurSell: sr.eurSell || sr.eur,
          isFallback: false,
          rateDate: dateISO,
          isCarriedForward: false
        };
      }
      const sortedSnapDates = Object.keys(snaps).filter(d => d <= dateISO && snaps[d].rates).sort().reverse();
      if (sortedSnapDates.length > 0) {
        const closestSnapDate = sortedSnapDates[0];
        const sr = snaps[closestSnapDate].rates;
        return {
          usd: sr.usd,
          usdSell: sr.usdSell || sr.usd,
          eur: sr.eur,
          eurSell: sr.eurSell || sr.eur,
          isFallback: true,
          rateDate: closestSnapDate,
          isCarriedForward: true
        };
      }
    }
  } catch (e) {
    // ignore
  }

  // 4. Default fallback to current live rates
  return {
    usd: fallbackRates.usd,
    usdSell: fallbackRates.usdSell || fallbackRates.usd,
    eur: fallbackRates.eur,
    eurSell: fallbackRates.eurSell || fallbackRates.eur,
    isFallback: true,
    rateDate: dateISO,
    isCarriedForward: false
  };
}

export async function fetchHistoricalRatesForDate(
  dateISO: string,
  forceRefresh = false
): Promise<RatesForDateResult | null> {
  const map = getDailyRatesMap();
  if (!forceRefresh && map[dateISO] && map[dateISO].usd > 0 && map[dateISO].eur > 0) {
    return {
      usd: map[dateISO].usd,
      usdSell: map[dateISO].usdSell || map[dateISO].usd,
      eur: map[dateISO].eur,
      eurSell: map[dateISO].eurSell || map[dateISO].eur,
      isFallback: false,
      rateDate: dateISO,
      isCarriedForward: false,
      source: map[dateISO].source || "кеш"
    };
  }

  // 1. Try our backend route /api/historical-rates
  try {
    const res = await fetch(`/api/historical-rates?date=${dateISO}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.rates) {
        saveDailyRatesForDate(dateISO, {
          usd: data.rates.usd,
          usdSell: data.rates.usdSell || data.rates.usd,
          eur: data.rates.eur,
          eurSell: data.rates.eurSell || data.rates.eur,
          source: data.rates.source || data.source || "НБУ"
        });
        return {
          usd: data.rates.usd,
          usdSell: data.rates.usdSell || data.rates.usd,
          eur: data.rates.eur,
          eurSell: data.rates.eurSell || data.rates.eur,
          isFallback: false,
          rateDate: dateISO,
          isCarriedForward: false,
          source: data.rates.source || data.source || "НБУ"
        };
      }
    }
  } catch (e) {
    console.warn("Backend historical rates failed, trying direct NBU:", e);
  }

  // 2. Client-side direct fallback to NBU
  try {
    const nbuDate = dateISO.replace(/-/g, "");
    const res = await fetch(`https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?date=${nbuDate}&json`);
    if (res.ok) {
      const list = await res.json();
      if (Array.isArray(list)) {
        const uObj = list.find((x: any) => x.cc === "USD");
        const eObj = list.find((x: any) => x.cc === "EUR");
        if (uObj && eObj) {
          const uRate = parseFloat(uObj.rate.toFixed(2));
          const eRate = parseFloat(eObj.rate.toFixed(2));
          saveDailyRatesForDate(dateISO, {
            usd: uRate,
            usdSell: uRate,
            eur: eRate,
            eurSell: eRate,
            source: "НБУ (прямий запит)"
          });
          return {
            usd: uRate,
            usdSell: uRate,
            eur: eRate,
            eurSell: eRate,
            isFallback: false,
            rateDate: dateISO,
            isCarriedForward: false,
            source: "НБУ"
          };
        }
      }
    }
  } catch (e) {
    console.warn("Direct NBU historical fetch failed:", e);
  }

  return null;
}

export function formatRatesLastUpdated(ts: string | number | null | undefined): string {
  if (!ts) return "Курси ще не синхронізовані";
  const num = typeof ts === "string" ? parseInt(ts, 10) : ts;
  if (isNaN(num) || num <= 0) return "Курси ще не синхронізовані";
  
  const d = new Date(num);
  const now = new Date();
  
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
  
  if (isToday) {
    return `Курси актуальні на: ${timeStr}`;
  } else {
    const dateStr = d.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
    return `Курси актуальні на: ${dateStr} ${timeStr}`;
  }
}
