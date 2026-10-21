var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
async function fetchPrivatArchive(dateStr) {
  const url = `https://api.privatbank.ua/p24api/exchange_rates?json&date=${dateStr}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  if (!res.ok) throw new Error(`Privat archive API returned status ${res.status}`);
  const data = await res.json();
  if (!data || !data.exchangeRate) throw new Error("Invalid Privat archive response");
  return data;
}
async function getRatesFromPrivatArchive() {
  const now = /* @__PURE__ */ new Date();
  const kyivTime = new Date(now.getTime() + 3 * 60 * 60 * 1e3);
  for (let i = 0; i < 4; i++) {
    const targetDate = new Date(kyivTime.getTime() - i * 24 * 60 * 60 * 1e3);
    const day = String(targetDate.getUTCDate()).padStart(2, "0");
    const month = String(targetDate.getUTCMonth() + 1).padStart(2, "0");
    const year = targetDate.getUTCFullYear();
    const dateStr = `${day}.${month}.${year}`;
    try {
      console.log(`Trying PrivatBank Archive API for date: ${dateStr}`);
      const data = await fetchPrivatArchive(dateStr);
      const usd = data.exchangeRate.find((x) => x.currency === "USD");
      const eur = data.exchangeRate.find((x) => x.currency === "EUR");
      if (usd && eur) {
        return { usd, eur, date: dateStr };
      }
    } catch (err) {
      console.error(`PrivatBank Archive failed for date ${dateStr}:`, err);
    }
  }
  throw new Error("Could not fetch rates from PrivatBank Archive for the last 4 days");
}
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/api/rates", async (req, res) => {
    try {
      const source = req.query.source || "telegram";
      if (source === "telegram") {
        const tRes = await fetch("https://t.me/s/Exchengedro", {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        });
        const html = await tRes.text();
        const matches = html.match(/<div class="tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/g);
        if (!matches) {
          return res.json({ error: "No messages found" });
        }
        const rates = { USD: { buy: 0, sell: 0 }, EUR: { buy: 0, sell: 0 }, source: "EXCHANGE Dro." };
        for (let i = matches.length - 1; i >= 0; i--) {
          const text = matches[i].replace(/<[^>]+>/g, " ");
          const usdMatch = text.match(/USD[^\d]*(\d{2}[.,]\d{1,2})[^\d]+(\d{2}[.,]\d{1,2})/i);
          const eurMatch = text.match(/EUR[^\d]*(\d{2}[.,]\d{1,2})[^\d]+(\d{2}[.,]\d{1,2})/i);
          let found = false;
          if (usdMatch) {
            rates.USD.buy = parseFloat(usdMatch[1].replace(",", "."));
            rates.USD.sell = parseFloat(usdMatch[2].replace(",", "."));
            found = true;
          }
          if (eurMatch) {
            rates.EUR.buy = parseFloat(eurMatch[1].replace(",", "."));
            rates.EUR.sell = parseFloat(eurMatch[2].replace(",", "."));
            found = true;
          }
          if (found && rates.USD.buy > 0) {
            return res.json(rates);
          }
        }
        return res.json({ error: "Rates not found in channel" });
      } else if (source === "nbu") {
        try {
          const usdRes = await fetch("https://bank.gov.ua/NBUStatService/v1/statistcl/exchange?valcode=USD&json", {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "application/json, text/plain, */*"
            }
          });
          const eurRes = await fetch("https://bank.gov.ua/NBUStatService/v1/statistcl/exchange?valcode=EUR&json", {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "application/json, text/plain, */*"
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
                  source: "\u041D\u0411\u0423 \u041E\u0444\u0456\u0446\u0456\u0439\u043D\u0438\u0439"
                });
              }
            }
          }
          throw new Error("Invalid NBU API response or blocked by Cloudflare");
        } catch (err) {
          console.info("NBU official API was unavailable (blocked or timed out), falling back to PrivatBank Archive API:", err instanceof Error ? err.message : String(err));
          try {
            const archiveData = await getRatesFromPrivatArchive();
            const usdNB = archiveData.usd.saleRateNB || archiveData.usd.purchaseRateNB;
            const eurNB = archiveData.eur.saleRateNB || archiveData.eur.purchaseRateNB;
            if (usdNB && eurNB) {
              return res.json({
                USD: { buy: usdNB, sell: usdNB },
                EUR: { buy: eurNB, sell: eurNB },
                source: `\u041D\u0411\u0423 \u041E\u0444\u0456\u0446\u0456\u0439\u043D\u0438\u0439 (\u0410\u0440\u0445\u0456\u0432 \u0432\u0456\u0434 ${archiveData.date})`
              });
            }
          } catch (archiveErr) {
            console.info("PrivatBank Archive NBU fallback not available, trying Privat NBU API...");
          }
          try {
            const pRes = await fetch("https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=11", {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              }
            });
            const pData = await pRes.json();
            if (Array.isArray(pData)) {
              const usdItem = pData.find((x) => x.ccy === "USD");
              const eurItem = pData.find((x) => x.ccy === "EUR");
              if (usdItem && eurItem) {
                const usdRate = parseFloat(usdItem.buy || usdItem.sale);
                const eurRate = parseFloat(eurItem.buy || eurItem.sale);
                if (usdRate && eurRate) {
                  return res.json({
                    USD: { buy: usdRate, sell: usdRate },
                    EUR: { buy: eurRate, sell: eurRate },
                    source: "\u041D\u0411\u0423 \u041E\u0444\u0456\u0446\u0456\u0439\u043D\u0438\u0439 (\u0420\u0435\u0437\u0435\u0440\u0432)"
                  });
                }
              }
            }
          } catch (pErr) {
            console.info("Privat NBU fallback failed too, trying global rates API...");
          }
          try {
            const extRes = await fetch("https://open.er-api.com/v6/latest/USD");
            const extData = await extRes.json();
            if (extData && extData.rates && extData.rates.UAH) {
              const uahRate = extData.rates.UAH;
              const eurInUsd = extData.rates.EUR || 0.93;
              const eurRate = uahRate / eurInUsd;
              return res.json({
                USD: { buy: uahRate, sell: uahRate },
                EUR: { buy: eurRate, sell: eurRate },
                source: "\u041D\u0411\u0423 \u041E\u0444\u0456\u0446\u0456\u0439\u043D\u0438\u0439 (\u0421\u0432\u0456\u0442\u043E\u0432\u0438\u0439 \u0440\u0438\u043D\u043E\u043A)"
              });
            }
          } catch (extErr) {
            console.warn("Global rates fallback failed too:", extErr instanceof Error ? extErr.message : String(extErr));
          }
          return res.json({
            USD: { buy: 41.5, sell: 41.5 },
            EUR: { buy: 44.8, sell: 44.8 },
            source: "\u041D\u0411\u0423 (\u0420\u0435\u0437\u0435\u0440\u0432\u043D\u0438\u0439)"
          });
        }
      } else {
        try {
          const mRes = await fetch("https://minfin.com.ua/ua/currency/drogobych/", {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
          });
          if (mRes.ok) {
            const html = await mRes.text();
            const marker = "window.APP_INITIAL_STATE = ";
            const idx = html.indexOf(marker);
            if (idx !== -1) {
              const start = idx + marker.length;
              let end = html.indexOf(";</script>", start);
              if (end === -1) end = html.indexOf("</script>", start);
              if (end !== -1) {
                const rawJs = html.slice(start, end).trim();
                const state = new Function(`return ${rawJs}`)();
                let usdBuy = 0;
                let usdSell = 0;
                let eurBuy = 0;
                let eurSell = 0;
                let foundDate = "";
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
                if (!usdBuy || !usdSell) {
                  const searchForRates = (obj) => {
                    if (!obj || typeof obj !== "object") return;
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
                      if (typeof obj[k] === "object") {
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
                    source: `\u041C\u0456\u043D\u0444\u0456\u043D \u0414\u0440\u043E\u0433\u043E\u0431\u0438\u0447` + (foundDate ? ` (${foundDate})` : "")
                  });
                }
              }
            }
          }
          throw new Error("Could not parse Drohobych rates from Minfin page state");
        } catch (droErr) {
          console.error("Failed to parse Drohobych Minfin rates, trying general Minfin auction rates:", droErr);
          try {
            const usdRes = await fetch("https://minfin.com.ua/data/currency/auction/usd.json", {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*"
              }
            });
            const eurRes = await fetch("https://minfin.com.ua/data/currency/auction/eur.json", {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*"
              }
            });
            if (usdRes.ok && eurRes.ok) {
              const usdData = await usdRes.json();
              const eurData = await eurRes.json();
              const parseVal = (obj, key1, key2) => {
                if (!obj) return 0;
                let v = obj[key1] !== void 0 ? obj[key1] : obj[key2];
                if (v && typeof v === "object") {
                  v = v.point !== void 0 ? v.point : v.val !== void 0 ? v.val : v.value;
                }
                if (v !== void 0) return parseFloat(v);
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
                  source: "\u041C\u0456\u043D\u0444\u0456\u043D \u0447\u043E\u0440\u043D\u0438\u0439 \u0440\u0438\u043D\u043E\u043A"
                });
              }
            }
            throw new Error("Invalid response from Minfin official auction JSONs");
          } catch (mfErr) {
            console.error("Minfin black market API failed, trying PrivatBank cash rates:", mfErr);
            try {
              const pRes = await fetch("https://api.privatbank.ua/p24api/pubinfo?json&exchange&coursid=5", {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
              });
              const pData = await pRes.json();
              if (Array.isArray(pData)) {
                const usdItem = pData.find((x) => x.ccy === "USD");
                const eurItem = pData.find((x) => x.ccy === "EUR");
                if (usdItem && eurItem) {
                  const usdBuy = parseFloat(usdItem.buy);
                  const usdSell = parseFloat(usdItem.sale);
                  const eurBuy = parseFloat(eurItem.buy);
                  const eurSell = parseFloat(eurItem.sale);
                  if (usdBuy > 0 && usdSell > 0 && eurBuy > 0 && eurSell > 0) {
                    return res.json({
                      USD: { buy: usdBuy, sell: usdSell },
                      EUR: { buy: eurBuy, sell: eurSell },
                      source: "\u041C\u0456\u043D\u0444\u0456\u043D (\u041F\u0440\u0438\u0432\u0430\u0442 \u0413\u043E\u0442\u0456\u0432\u043A\u043E\u0432\u0438\u0439)"
                    });
                  }
                }
              }
              throw new Error("Invalid PrivatBank response structure");
            } catch (pbErr) {
              console.error("PrivatBank cash API failed, trying PrivatBank Archive commercial rates:", pbErr);
              try {
                const archiveData = await getRatesFromPrivatArchive();
                const usdBuy = archiveData.usd.purchaseRate;
                const usdSell = archiveData.usd.saleRate;
                const eurBuy = archiveData.eur.purchaseRate;
                const eurSell = archiveData.eur.saleRate;
                if (usdBuy && usdSell && eurBuy && eurSell) {
                  return res.json({
                    USD: { buy: usdBuy, sell: usdSell },
                    EUR: { buy: eurBuy, sell: eurSell },
                    source: `\u041C\u0456\u043D\u0444\u0456\u043D (\u041F\u0440\u0438\u0432\u0430\u0442 \u0410\u0440\u0445\u0456\u0432 ${archiveData.date})`
                  });
                }
              } catch (archiveErr) {
                console.error("PrivatBank Archive cash rate fallback failed:", archiveErr);
              }
              try {
                const monoRes = await fetch("https://api.monobank.ua/bank/currency", {
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                  }
                });
                const monoData = await monoRes.json();
                if (Array.isArray(monoData)) {
                  const usdItem = monoData.find((x) => x.currencyCodeA === 840 && x.currencyCodeB === 980);
                  const eurItem = monoData.find((x) => x.currencyCodeA === 978 && x.currencyCodeB === 980);
                  if (usdItem && eurItem) {
                    const usdBuy = usdItem.rateBuy || usdItem.rateCross;
                    const usdSell = usdItem.rateSell || usdItem.rateCross;
                    const eurBuy = eurItem.rateBuy || eurItem.rateCross;
                    const eurSell = eurItem.rateSell || eurItem.rateCross;
                    if (usdBuy > 0 && usdSell > 0 && eurBuy > 0 && eurSell > 0) {
                      return res.json({
                        USD: { buy: usdBuy, sell: usdSell },
                        EUR: { buy: eurBuy, sell: eurSell },
                        source: "\u041C\u0456\u043D\u0444\u0456\u043D (Monobank \u0413\u043E\u0442\u0456\u0432\u043A\u043E\u0432\u0438\u0439)"
                      });
                    }
                  }
                }
              } catch (monoErr) {
                console.error("Monobank API failed too:", monoErr);
              }
              try {
                const extRes = await fetch("https://open.er-api.com/v6/latest/USD");
                const extData = await extRes.json();
                if (extData && extData.rates && extData.rates.UAH) {
                  const uahRate = extData.rates.UAH;
                  const eurInUsd = extData.rates.EUR || 0.93;
                  const eurRate = uahRate / eurInUsd;
                  return res.json({
                    USD: { buy: Number((uahRate * 0.992).toFixed(2)), sell: Number((uahRate * 1.008).toFixed(2)) },
                    EUR: { buy: Number((eurRate * 0.992).toFixed(2)), sell: Number((eurRate * 1.008).toFixed(2)) },
                    source: "\u041C\u0456\u043D\u0444\u0456\u043D (\u0413\u043B\u043E\u0431\u0430\u043B\u044C\u043D\u0438\u0439 \u0440\u0438\u043D\u043E\u043A \u0437 \u0443\u0440\u0430\u0445\u0443\u0432\u0430\u043D\u043D\u044F\u043C \u0441\u043F\u0440.)"
                  });
                }
              } catch (extErr) {
                console.error("Global rates fallback for minfin failed too:", extErr);
              }
              return res.json({
                USD: { buy: 41.65, sell: 42.1 },
                EUR: { buy: 44.9, sell: 45.45 },
                source: "\u041C\u0456\u043D\u0444\u0456\u043D (\u0420\u0435\u0437\u0435\u0440\u0432 \u0433\u043E\u0442\u0456\u0432\u043A\u043E\u0432\u0438\u0439)"
              });
            }
          }
        }
      }
    } catch (e) {
      res.json({ error: e.toString() });
    }
  });
  const isProduction = process.env.NODE_ENV === "production" || typeof __filename !== "undefined" && import_path.default.basename(__filename) === "server.cjs" || !import_fs.default.existsSync(import_path.default.join(process.cwd(), "src"));
  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } catch (viteErr) {
      console.error("Failed to start Vite dev server, falling back to static:", viteErr);
      const distPath = import_path.default.join(process.cwd(), "dist");
      app.use(import_express.default.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(import_path.default.join(distPath, "index.html"));
      });
    }
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
