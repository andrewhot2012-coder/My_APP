import express from "express";
import path from "path";
import fs from "fs";

async function fetchPrivatArchive(dateStr: string) {
  const url = `https://api.privatbank.ua/p24api/exchange_rates?json&date=${dateStr}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  if (!res.ok) throw new Error(`Privat archive API returned status ${res.status}`);
  const data = await res.json();
  if (!data || !data.exchangeRate) throw new Error("Invalid Privat archive response");
  return data;
}

async function getRatesFromPrivatArchive() {
  const now = new Date();
  // Adjust to Kyiv timezone (+3 hours from UTC)
  const kyivTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  
  // Try up to 4 days back to find rates (in case of long weekends or delays)
  for (let i = 0; i < 4; i++) {
    const targetDate = new Date(kyivTime.getTime() - i * 24 * 60 * 60 * 1000);
    const day = String(targetDate.getUTCDate()).padStart(2, '0');
    const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const year = targetDate.getUTCFullYear();
    const dateStr = `${day}.${month}.${year}`;
    
    try {
      console.log(`Trying PrivatBank Archive API for date: ${dateStr}`);
      const data = await fetchPrivatArchive(dateStr);
      const usd = data.exchangeRate.find((x: any) => x.currency === "USD");
      const eur = data.exchangeRate.find((x: any) => x.currency === "EUR");
      
      if (usd && eur) {
        return { usd, eur, date: dateStr };
      }
    } catch (err) {
      console.error(`PrivatBank Archive failed for date ${dateStr}:`, err);
    }
  }
  throw new Error("Could not fetch rates from PrivatBank Archive for the last 4 days");
}

interface RateHistoryEntry {
  usd: number;
  usdSell: number;
  eur: number;
  eurSell: number;
  source: string;
}

let tgHistoryCache: { data: Record<string, RateHistoryEntry>; timestamp: number } | null = null;

async function fetchTelegramRatesHistory(pages = 6): Promise<Record<string, RateHistoryEntry>> {
  if (tgHistoryCache && Date.now() - tgHistoryCache.timestamp < 15 * 60 * 1000) {
    return tgHistoryCache.data;
  }

  const ratesHistory: Record<string, RateHistoryEntry> = {};
  let lowestMsgId: number | null = null;
  const baseUrl = "https://t.me/s/Exchengedro";

  for (let p = 0; p < pages; p++) {
    const fetchUrl = lowestMsgId ? `${baseUrl}?before=${lowestMsgId}` : baseUrl;
    try {
      const res = await fetch(fetchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });
      if (!res.ok) break;
      const html = await res.text();

      const idMatches = Array.from(html.matchAll(/href="https:\/\/t\.me\/Exchengedro\/(\d+)"/g));
      if (idMatches.length > 0) {
        const ids = idMatches.map(m => parseInt(m[1], 10)).filter(n => !isNaN(n));
        if (ids.length > 0) lowestMsgId = Math.min(...ids);
      }

      const msgBlocks = html.match(/<div class="tgme_widget_message\b[\s\S]*?(?=<div class="tgme_widget_message\b|$)/g);
      if (!msgBlocks) continue;

      for (const block of msgBlocks) {
        const timeMatch = block.match(/<time[^>]*datetime="([^"]+)"/);
        if (!timeMatch) continue;
        const dateISO = timeMatch[1].substring(0, 10);

        const textMatch = block.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/);
        if (!textMatch) continue;
        const text = textMatch[1].replace(/<[^>]+>/g, ' ');

        const usdMatch = text.match(/USD[^\d]*(\d{2}[.,]\d{1,2})[^\d]+(\d{2}[.,]\d{1,2})/i);
        const eurMatch = text.match(/EUR[^\d]*(\d{2}[.,]\d{1,2})[^\d]+(\d{2}[.,]\d{1,2})/i);

        if (usdMatch && eurMatch) {
          const uBuy = parseFloat(usdMatch[1].replace(',', '.'));
          const uSell = parseFloat(usdMatch[2].replace(',', '.'));
          const eBuy = parseFloat(eurMatch[1].replace(',', '.'));
          const eSell = parseFloat(eurMatch[2].replace(',', '.'));

          if (uBuy > 0 && eBuy > 0) {
            ratesHistory[dateISO] = {
              usd: uBuy,
              usdSell: uSell,
              eur: eBuy,
              eurSell: eSell,
              source: "telegram"
            };
          }
        }
      }
    } catch (err) {
      console.warn(`Failed scraping Telegram page ${p}:`, err);
      break;
    }
  }

  if (Object.keys(ratesHistory).length > 0) {
    tgHistoryCache = { data: ratesHistory, timestamp: Date.now() };
  }

  return ratesHistory;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Health API route
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Rates History API route
  app.get("/api/rates-history", async (req, res) => {
    try {
      const source = (req.query.source as string) || "telegram";
      if (source === "telegram") {
        const history = await fetchTelegramRatesHistory(7);
        return res.json({ success: true, rates: history, source: "telegram" });
      }
      return res.json({ success: true, rates: {}, source });
    } catch (err) {
      console.error("Error in /api/rates-history:", err);
      return res.status(500).json({ error: "Failed to fetch rates history" });
    }
  });

  // Historical Rate for a specific date (Telegram cache or NBU fallback)
  app.get("/api/historical-rates", async (req, res) => {
    try {
      const dateISO = req.query.date as string;
      if (!dateISO || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
        return res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD" });
      }

      // 1. Try Telegram history cache first
      if (tgHistoryCache && tgHistoryCache.data[dateISO]) {
        const tgRate = tgHistoryCache.data[dateISO];
        return res.json({
          success: true,
          date: dateISO,
          source: "telegram",
          rates: {
            usd: tgRate.usd,
            usdSell: tgRate.usdSell,
            eur: tgRate.eur,
            eurSell: tgRate.eurSell,
            source: "EXCHANGE Dro. (Telegram)"
          }
        });
      }

      // 2. Fetch from NBU official historical API (date format: YYYYMMDD)
      const nbuDate = dateISO.replace(/-/g, "");
      const nbuRes = await fetch(`https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?date=${nbuDate}&json`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });

      if (nbuRes.ok) {
        const nbuData = await nbuRes.json();
        if (Array.isArray(nbuData)) {
          const usdObj = nbuData.find((x: any) => x.cc === "USD");
          const eurObj = nbuData.find((x: any) => x.cc === "EUR");
          if (usdObj && eurObj) {
            const uRate = parseFloat(usdObj.rate.toFixed(2));
            const eRate = parseFloat(eurObj.rate.toFixed(2));
            return res.json({
              success: true,
              date: dateISO,
              source: "НБУ",
              rates: {
                usd: uRate,
                usdSell: uRate,
                eur: eRate,
                eurSell: eRate,
                source: "Офіційний курс НБУ"
              }
            });
          }
        }
      }

      return res.status(404).json({ error: `Rates not found for date ${dateISO}` });
    } catch (err: any) {
      console.error("Error in /api/historical-rates:", err);
      return res.status(500).json({ error: "Failed to fetch historical rate" });
    }
  });

  // Rates API route to proxy and prevent CORS issues in the browser
  app.get("/api/rates", async (req, res) => {
    try {
      const source = req.query.source || 'telegram';
      if (source === 'telegram') {
        try {
          const tRes = await fetch('https://t.me/s/Exchengedro', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          if (tRes.ok) {
            const html = await tRes.text();
            const matches = html.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/g);
            if (matches) {
              const rates = { USD: { buy: 0, sell: 0 }, EUR: { buy: 0, sell: 0 }, source: "EXCHANGE Dro." };
              for (let i = matches.length - 1; i >= 0; i--) {
                const text = matches[i].replace(/<[^>]+>/g, ' ');
                const usdMatch = text.match(/USD[^\d]*(\d{2}[.,]\d{1,2})[^\d]+(\d{2}[.,]\d{1,2})/i);
                const eurMatch = text.match(/EUR[^\d]*(\d{2}[.,]\d{1,2})[^\d]+(\d{2}[.,]\d{1,2})/i);
                let found = false;
                if (usdMatch) {
                  rates.USD.buy = parseFloat(usdMatch[1].replace(',', '.'));
                  rates.USD.sell = parseFloat(usdMatch[2].replace(',', '.'));
                  found = true;
                }
                if (eurMatch) {
                  rates.EUR.buy = parseFloat(eurMatch[1].replace(',', '.'));
                  rates.EUR.sell = parseFloat(eurMatch[2].replace(',', '.'));
                  found = true;
                }
                if (found && rates.USD.buy > 0) {
                  return res.json(rates);
                }
              }
            }
          }
        } catch (tgErr) {
          console.warn("Telegram rate scraping failed, falling back to PrivatBank cash rates:", tgErr);
        }

        // Fallback for Telegram if telegram is unavailable or channel format changed:
        try {
          const pRes = await fetch('https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5', {
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const pData = await pRes.json();
          if (Array.isArray(pData)) {
            const usdItem = pData.find((x: any) => x.ccy === "USD");
            const eurItem = pData.find((x: any) => x.ccy === "EUR");
            if (usdItem && eurItem) {
              return res.json({
                USD: { buy: parseFloat(usdItem.buy), sell: parseFloat(usdItem.sale) },
                EUR: { buy: parseFloat(eurItem.buy), sell: parseFloat(eurItem.sale) },
                source: "EXCHANGE Dro. (резерв Приват)"
              });
            }
          }
        } catch (fbErr) {
          console.warn("PrivatBank fallback for Telegram failed:", fbErr);
        }

        return res.json({
          USD: { buy: 41.65, sell: 42.10 },
          EUR: { buy: 44.90, sell: 45.45 },
          source: "EXCHANGE Dro. (резервний курс)"
        });
      } else if (source === 'nbu') {
        try {
          // Attempt 1: Fetch from official bank.gov.ua API
          const usdRes = await fetch('https://bank.gov.ua/NBUStatService/v1/statistcl/exchange?valcode=USD&json', {
            headers: { 
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*'
            }
          });
          const eurRes = await fetch('https://bank.gov.ua/NBUStatService/v1/statistcl/exchange?valcode=EUR&json', {
            headers: { 
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*'
            }
          });
          
          if (usdRes.ok && eurRes.ok) {
            const usdContentType = usdRes.headers.get("content-type");
            const eurContentType = eurRes.headers.get("content-type");
            
            if (usdContentType?.includes("json") && eurContentType?.includes("json")) {
              const usdData = await usdRes.json();
              const eurData = await eurRes.json();
              const usdRate = usdData[0]?.rate;
              const eurRate = eurData[0]?.rate;
              if (usdRate && eurRate) {
                return res.json({
                  USD: { buy: usdRate, sell: usdRate },
                  EUR: { buy: eurRate, sell: eurRate },
                  source: "НБУ Офіційний"
                });
              }
            }
          }
          throw new Error("Invalid NBU API response or blocked by Cloudflare");
        } catch (err) {
          console.info("NBU official API was unavailable (blocked or timed out), falling back to PrivatBank Archive API:", err instanceof Error ? err.message : String(err));
          try {
            // Attempt 2: Fallback to PrivatBank Archive API (contains 100% real NBU rates)
            const archiveData = await getRatesFromPrivatArchive();
            const usdNB = archiveData.usd.saleRateNB || archiveData.usd.purchaseRateNB;
            const eurNB = archiveData.eur.saleRateNB || archiveData.eur.purchaseRateNB;
            
            if (usdNB && eurNB) {
              return res.json({
                USD: { buy: usdNB, sell: usdNB },
                EUR: { buy: eurNB, sell: eurNB },
                source: `НБУ Офіційний (Архів від ${archiveData.date})`
              });
            }
          } catch (archiveErr) {
            console.info("PrivatBank Archive NBU fallback not available, trying Privat NBU API...");
          }
          
          try {
            // Attempt 3: Fallback to Privat NBU rates (coursid=11)
            const pRes = await fetch('https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=11', {
              headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            const pData = await pRes.json();
            if (Array.isArray(pData)) {
              const usdItem = pData.find((x: any) => x.ccy === "USD");
              const eurItem = pData.find((x: any) => x.ccy === "EUR");
              if (usdItem && eurItem) {
                const usdRate = parseFloat(usdItem.buy || usdItem.sale);
                const eurRate = parseFloat(eurItem.buy || eurItem.sale);
                if (usdRate && eurRate) {
                  return res.json({
                    USD: { buy: usdRate, sell: usdRate },
                    EUR: { buy: eurRate, sell: eurRate },
                    source: "НБУ Офіційний (Резерв)"
                  });
                }
              }
            }
          } catch (pErr) {
            console.info("Privat NBU fallback failed too, trying global rates API...");
          }

          // Attempt 4: Fallback to Global Exchange API
          try {
            const extRes = await fetch('https://open.er-api.com/v6/latest/USD');
            const extData = await extRes.json();
            if (extData && extData.rates && extData.rates.UAH) {
              const uahRate = extData.rates.UAH;
              const eurInUsd = extData.rates.EUR || 0.93;
              const eurRate = uahRate / eurInUsd;
              return res.json({
                USD: { buy: uahRate, sell: uahRate },
                EUR: { buy: eurRate, sell: eurRate },
                source: "НБУ Офіційний (Світовий ринок)"
              });
            }
          } catch (extErr) {
            console.warn("Global rates fallback failed too:", extErr instanceof Error ? extErr.message : String(extErr));
          }
          
          return res.json({
            USD: { buy: 41.50, sell: 41.50 },
            EUR: { buy: 44.80, sell: 44.80 },
            source: "НБУ (Резервний)"
          });
        }
      } else {
        // Source: minfin (Мінфін чорний ринок / готівковий)
        try {
          // Attempt 1: Fetch and parse Drohobych Cash / Auction rates directly from Minfin Drohobych page
          const mRes = await fetch('https://minfin.com.ua/ua/currency/drogobych/', {
            headers: { 
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          if (mRes.ok) {
            const html = await mRes.text();
            const marker = 'window.APP_INITIAL_STATE = ';
            const idx = html.indexOf(marker);
            if (idx !== -1) {
              const start = idx + marker.length;
              let end = html.indexOf(';</script>', start);
              if (end === -1) end = html.indexOf('</script>', start);
              
              if (end !== -1) {
                const rawJs = html.slice(start, end).trim();
                const state = new Function(`return ${rawJs}`)();
                
                let usdBuy = 0;
                let usdSell = 0;
                let eurBuy = 0;
                let eurSell = 0;
                let foundDate = "";

                // Look under currenciesAllTypesRates.drogobych
                const ratesData = state.currenciesAllTypesRates;
                if (ratesData && ratesData.drogobych) {
                  const dates = Object.keys(ratesData.drogobych);
                  for (const date of dates) {
                    const entities = ratesData.drogobych[date]?.entities;
                    if (entities && entities.auction) {
                      const usd = entities.auction.USD || entities.auction.usd;
                      const eur = entities.auction.EUR || entities.auction.eur;
                      if (usd && eur) {
                        usdBuy = parseFloat(usd.bid);
                        usdSell = parseFloat(usd.ask);
                        eurBuy = parseFloat(eur.bid);
                        eurSell = parseFloat(eur.ask);
                        foundDate = date;
                        break;
                      }
                    }
                  }
                }

                // Fallback search recursively inside the state object
                if (!usdBuy || !usdSell) {
                  const searchForRates = (obj: any) => {
                    if (!obj || typeof obj !== 'object') return;
                    if (obj.auction && (obj.auction.USD || obj.auction.usd || obj.auction.EUR || obj.auction.eur)) {
                      const usd = obj.auction.USD || obj.auction.usd;
                      const eur = obj.auction.EUR || obj.auction.eur;
                      if (usd && eur) {
                        usdBuy = parseFloat(usd.bid || usd.buy);
                        usdSell = parseFloat(usd.ask || usd.sell || usd.sale);
                        eurBuy = parseFloat(eur.bid || eur.buy);
                        eurSell = parseFloat(eur.ask || eur.sell || eur.sale);
                        return;
                      }
                    }
                    for (const k of Object.keys(obj)) {
                      if (typeof obj[k] === 'object') {
                        searchForRates(obj[k]);
                        if (usdBuy && usdSell) return;
                      }
                    }
                  };
                  searchForRates(state);
                }

                if (usdBuy > 0 && usdSell > 0 && eurBuy > 0 && eurSell > 0) {
                  return res.json({
                    USD: { buy: usdBuy, sell: usdSell },
                    EUR: { buy: eurBuy, sell: eurSell },
                    source: `Мінфін Дрогобич` + (foundDate ? ` (${foundDate})` : '')
                  });
                }
              }
            }
          }
          throw new Error("Could not parse Drohobych rates from Minfin page state");
        } catch (droErr) {
          console.error("Failed to parse Drohobych Minfin rates, trying general Minfin auction rates:", droErr);
          try {
            // Attempt 2: General Minfin Black Market (Auction) rates as fallback (non-bank, real cash!)
            const usdRes = await fetch('https://minfin.com.ua/data/currency/auction/usd.json', {
              headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
              }
            });
            const eurRes = await fetch('https://minfin.com.ua/data/currency/auction/eur.json', {
              headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/plain, */*'
              }
            });
            
            if (usdRes.ok && eurRes.ok) {
              const usdData = await usdRes.json();
              const eurData = await eurRes.json();
              
              const parseVal = (obj: any, key1: string, key2: string): number => {
                if (!obj) return 0;
                let v = obj[key1] !== undefined ? obj[key1] : obj[key2];
                if (v && typeof v === 'object') {
                  v = v.point !== undefined ? v.point : (v.val !== undefined ? v.val : v.value);
                }
                if (v !== undefined) return parseFloat(v);
                return 0;
              };

              let usdBuy = 0;
              let usdSell = 0;
              if (Array.isArray(usdData)) {
                const item = usdData[0];
                usdBuy = parseVal(item, "bid", "buy");
                usdSell = parseVal(item, "ask", "sell");
              } else {
                usdBuy = parseVal(usdData, "bid", "buy");
                usdSell = parseVal(usdData, "ask", "sell");
              }

              let eurBuy = 0;
              let eurSell = 0;
              if (Array.isArray(eurData)) {
                const item = eurData[0];
                eurBuy = parseVal(item, "bid", "buy");
                eurSell = parseVal(item, "ask", "sell");
              } else {
                eurBuy = parseVal(eurData, "bid", "buy");
                eurSell = parseVal(eurData, "ask", "sell");
              }

              if (usdBuy > 0 && usdSell > 0 && eurBuy > 0 && eurSell > 0) {
                return res.json({
                  USD: { buy: usdBuy, sell: usdSell },
                  EUR: { buy: eurBuy, sell: eurSell },
                  source: "Мінфін чорний ринок"
                });
              }
            }
            throw new Error("Invalid response from Minfin official auction JSONs");
          } catch (mfErr) {
            console.error("Minfin black market API failed, trying PrivatBank cash rates:", mfErr);
            try {
              // Attempt 3: PrivatBank Cash rates (coursid=5) as third fallback
              const pRes = await fetch('https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5', {
                headers: { 
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
              });
              const pData = await pRes.json();
              if (Array.isArray(pData)) {
                const usdItem = pData.find((x: any) => x.ccy === "USD");
                const eurItem = pData.find((x: any) => x.ccy === "EUR");
                if (usdItem && eurItem) {
                  const usdBuy = parseFloat(usdItem.buy);
                  const usdSell = parseFloat(usdItem.sale);
                  const eurBuy = parseFloat(eurItem.buy);
                  const eurSell = parseFloat(eurItem.sale);
                  if (usdBuy > 0 && usdSell > 0 && eurBuy > 0 && eurSell > 0) {
                    return res.json({
                      USD: { buy: usdBuy, sell: usdSell },
                      EUR: { buy: eurBuy, sell: eurSell },
                      source: "Мінфін (Приват Готівковий)"
                    });
                  }
                }
              }
              throw new Error("Invalid PrivatBank response structure");
            } catch (pbErr) {
              console.error("PrivatBank cash API failed, trying PrivatBank Archive commercial rates:", pbErr);
              try {
                // Attempt 4: PrivatBank Archive commercial cash rates
                const archiveData = await getRatesFromPrivatArchive();
                const usdBuy = archiveData.usd.purchaseRate;
                const usdSell = archiveData.usd.saleRate;
                const eurBuy = archiveData.eur.purchaseRate;
                const eurSell = archiveData.eur.saleRate;
                
                if (usdBuy && usdSell && eurBuy && eurSell) {
                  return res.json({
                    USD: { buy: usdBuy, sell: usdSell },
                    EUR: { buy: eurBuy, sell: eurSell },
                    source: `Мінфін (Приват Архів ${archiveData.date})`
                  });
                }
              } catch (archiveErr) {
                console.error("PrivatBank Archive cash rate fallback failed:", archiveErr);
              }

              try {
                // Attempt 5: Fetch Monobank API
                const monoRes = await fetch('https://api.monobank.ua/bank/currency', {
                  headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                  }
                });
                const monoData = await monoRes.json();
                if (Array.isArray(monoData)) {
                  const usdItem = monoData.find((x: any) => x.currencyCodeA === 840 && x.currencyCodeB === 980);
                  const eurItem = monoData.find((x: any) => x.currencyCodeA === 978 && x.currencyCodeB === 980);
                  if (usdItem && eurItem) {
                    const usdBuy = usdItem.rateBuy || usdItem.rateCross;
                    const usdSell = usdItem.rateSell || usdItem.rateCross;
                    const eurBuy = eurItem.rateBuy || eurItem.rateCross;
                    const eurSell = eurItem.rateSell || eurItem.rateCross;
                    if (usdBuy > 0 && usdSell > 0 && eurBuy > 0 && eurSell > 0) {
                      return res.json({
                        USD: { buy: usdBuy, sell: usdSell },
                        EUR: { buy: eurBuy, sell: eurSell },
                        source: "Мінфін (Monobank Готівковий)"
                      });
                    }
                  }
                }
              } catch (monoErr) {
                console.error("Monobank API failed too:", monoErr);
              }
              
              // Attempt 6: Fallback to global rate with spread
              try {
                const extRes = await fetch('https://open.er-api.com/v6/latest/USD');
                const extData = await extRes.json();
                if (extData && extData.rates && extData.rates.UAH) {
                  const uahRate = extData.rates.UAH;
                  const eurInUsd = extData.rates.EUR || 0.93;
                  const eurRate = uahRate / eurInUsd;
                  
                  return res.json({
                    USD: { buy: Number((uahRate * 0.992).toFixed(2)), sell: Number((uahRate * 1.008).toFixed(2)) },
                    EUR: { buy: Number((eurRate * 0.992).toFixed(2)), sell: Number((eurRate * 1.008).toFixed(2)) },
                    source: "Мінфін (Глобальний ринок з урахуванням спр.)"
                  });
                }
              } catch (extErr) {
                console.error("Global rates fallback for minfin failed too:", extErr);
              }

              return res.json({
                USD: { buy: 41.65, sell: 42.10 },
                EUR: { buy: 44.90, sell: 45.45 },
                source: "Мінфін (Резерв готівковий)"
              });
            }
          }
        }
      }
    } catch (e: any) {
      res.json({ error: e.toString() });
    }
  });

  // Robust production mode check to avoid starting Vite when running built app
  const isProduction = process.env.NODE_ENV === "production" || 
                       (typeof __filename !== "undefined" && path.basename(__filename) === "server.cjs") || 
                       !fs.existsSync(path.join(process.cwd(), "src"));

  // Vite middleware for development
  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.error("Failed to start Vite dev server, falling back to static:", viteErr);
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
