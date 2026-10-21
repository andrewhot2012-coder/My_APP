export interface ParsedTransaction {
  amount?: string;
  contractor?: string;
  comment?: string;
  cardDetails?: string;
  receiptUrl?: string;
  rate?: string;
  exchangeDetails?: string;
  cleanDescription: string;
}

/**
 * Extracts and parses transaction details from formatted raw string.
 * Format: 💰 Сума: <sum> | 👤 <contractor> | 📝 <comment> | 💳 <details> | 📎 <receiptUrl>
 * Also parses exchange transactions: 🔄 Обмін: <details> | 📈 Курс: <rate> | 📝 <comment>
 */
export function parseTransactionText(text: string): ParsedTransaction {
  if (!text) {
    return { cleanDescription: "" };
  }

  // Strip "⚙️ Реверс запланованого" or "Реверс запланованого" and everything after it!
  let strippedText = text;
  const patterns = [
    "⚙️ Реверс запланованого",
    "⚙️Реверс запланованого",
    "Реверс запланованого"
  ];
  for (const pattern of patterns) {
    const idx = strippedText.indexOf(pattern);
    if (idx !== -1) {
      strippedText = strippedText.substring(0, idx).trim();
    }
  }

  // Remove any bracket prefixes like [02.07.26 13:00:00 | Покупка] or [02.07.26 13:00:00 | Обмін]
  const cleanText = strippedText.replace(/^\[.*?\]\s*/, "").trim();

  // Split by " | " or newlines to parse line-by-line
  const parts = cleanText.split(/\s*(?:\r?\n|\|)\s*/);
  const result: ParsedTransaction = {
    cleanDescription: ""
  };

  const remainingParts: string[] = [];

  parts.forEach(part => {
    let trimmed = part.trim();
    if (!trimmed) return;

    // Check for receipt URL inside line first (📎, http/https, data:image, blob)
    if (trimmed.includes("📎") || trimmed.includes("http://") || trimmed.includes("https://") || trimmed.includes("data:image")) {
      const clipMatch = trimmed.match(/📎\s*(https?:\/\/[^\s]+|data:image\/[^\s]+|[^\s]+)/);
      if (clipMatch) {
        if (!result.receiptUrl) {
          result.receiptUrl = clipMatch[1];
        }
        trimmed = trimmed.replace(clipMatch[0], "").trim();
      } else {
        const httpMatch = trimmed.match(/(https?:\/\/[^\s]+|data:image\/[^\s]+)/);
        if (httpMatch) {
          if (!result.receiptUrl) {
            result.receiptUrl = httpMatch[0];
          }
          trimmed = trimmed.replace(httpMatch[0], "").trim();
        }
      }
      trimmed = trimmed.replace(/^📎\s*/, "").trim();
      if (!trimmed) return;
    }

    if (trimmed.startsWith("💰 Сума:")) {
      result.amount = trimmed.replace("💰 Сума:", "").trim();
    } else if (trimmed.startsWith("👤")) {
      result.contractor = trimmed.replace("👤", "").trim();
    } else if (trimmed.startsWith("📝")) {
      result.comment = trimmed.replace("📝", "").trim();
    } else if (
      trimmed.startsWith("💳") ||
      trimmed.includes("➔") ||
      trimmed.toLowerCase().includes("списано з") ||
      trimmed.toLowerCase().includes("отримано на") ||
      trimmed.toLowerCase().includes("записано в борг") ||
      trimmed.toLowerCase().includes("записалися в борг") ||
      trimmed.toLowerCase().includes("контрагент:")
    ) {
      const card = trimmed.replace(/^💳\s*/, "").trim();
      result.cardDetails = result.cardDetails ? result.cardDetails + "\n" + card : card;
    } else if (trimmed.startsWith("📎")) {
      const rUrl = trimmed.replace("📎", "").trim();
      if (rUrl && !result.receiptUrl) {
        result.receiptUrl = rUrl;
      }
    } else if (trimmed.startsWith("📈 Курс:") || trimmed.includes("Курс:")) {
      result.rate = trimmed.replace(/^📈\s*Курс:\s*/i, "").trim();
    } else if (trimmed.startsWith("🔄 Обмін:") || trimmed.includes("Обмін:")) {
      const ex = trimmed.replace(/^🔄\s*Обмін:\s*/i, "").trim();
      if (ex) {
        result.exchangeDetails = result.exchangeDetails ? result.exchangeDetails + "\n" + ex : ex;
      }
    } else if (trimmed.startsWith("📥 Отримано")) {
      result.exchangeDetails = result.exchangeDetails ? result.exchangeDetails + "\n" + trimmed : trimmed;
    } else if (trimmed.includes("http")) {
      const urlMatch = trimmed.match(/https?:\/\/[^\s]+/);
      if (urlMatch && !result.receiptUrl) {
        result.receiptUrl = urlMatch[0];
      }
    } else {
      remainingParts.push(trimmed);
    }
  });

  // Post-clean cardDetails and comment to remove leftover 📎 or URLs
  if (result.cardDetails) {
    result.cardDetails = result.cardDetails
      .replace(/📎\s*(https?:\/\/[^\s]+|data:image\/[^\s]+|[^\s]+)/g, "")
      .replace(/https?:\/\/[^\s]+/g, "")
      .replace(/📎/g, "")
      .trim();
  }
  if (result.comment) {
    result.comment = result.comment
      .replace(/📎\s*(https?:\/\/[^\s]+|data:image\/[^\s]+|[^\s]+)/g, "")
      .replace(/https?:\/\/[^\s]+/g, "")
      .replace(/📎/g, "")
      .trim();
  }

  // Decide on a clean description
  if (result.comment) {
    result.cleanDescription = result.comment;
  } else if (result.exchangeDetails) {
    result.cleanDescription = result.exchangeDetails;
  } else if (remainingParts.length > 0) {
    result.cleanDescription = remainingParts.filter(Boolean).join("\n");
  } else if (result.cardDetails) {
    result.cleanDescription = result.cardDetails;
  } else {
    result.cleanDescription = "Операція без опису";
  }

  return result;
}

/**
 * Converts a shareable Google Drive link, base64 data URL, blob, or image link into a direct web image link.
 */
export function getDirectImageUrl(url: string | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Data URLs or Blob URLs
  if (trimmed.startsWith("data:image/") || trimmed.startsWith("blob:")) {
    return trimmed;
  }

  // Extract Google Drive ID from path /d/FILE_ID
  const matchPath = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (matchPath && matchPath[1]) {
    return `https://lh3.googleusercontent.com/d/${matchPath[1]}`;
  }

  // Extract Google Drive ID from query parameter id=FILE_ID
  const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId && matchId[1]) {
    return `https://lh3.googleusercontent.com/d/${matchId[1]}`;
  }

  if (trimmed.includes("googleusercontent.com")) {
    return trimmed;
  }

  // Direct image links
  if (/\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(trimmed)) {
    return trimmed;
  }

  // Any other http/https link
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return null;
}

/**
 * Replaces system bank identifiers (e.g. "Банк 1", "Банк 2", "Готівка") with their custom aliases.
 */
export function replaceBankKeysWithAliases(text: string, initData: any): string {
  if (!text || !initData || !initData.allAliases) return text;
  let result = text;

  // Keys to check
  const keys = ["Банк 1", "Банк 2", "Банк 3", "Банк 4", "Банк 5", "Готівка"];
  const currencies = ["UAH", "USD", "EUR"] as const;

  keys.forEach(key => {
    let alias = "";
    for (const curr of currencies) {
      if (initData.allAliases[curr] && initData.allAliases[curr][key]) {
        alias = initData.allAliases[curr][key];
        break;
      }
    }
    if (alias) {
      // Replace all occurrences of key
      const escapedKey = key.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escapedKey, "g");
      result = result.replace(regex, alias);
    }
  });

  return result;
}

export interface FulfillmentBreakdown {
  isFulfillment: boolean;
  principalSum: number;
  interestSum: number;
  currency: string;
}

export function getFulfillmentBreakdown(itemsOrTx: any, currentCurrency?: string): FulfillmentBreakdown {
  const parseAmountAndCurrency = (t: string) => {
    const match = t.match(/💰\s*Сума:\s*([\d.,]+)\s*([A-Za-z$€₴]*)/i);
    if (match) {
      return {
        amount: parseFloat(match[1].replace(",", ".")),
        curr: match[2].trim()
      };
    }
    return null;
  };

  const getSymbolFromStr = (t: string) => {
    if (t.includes("$")) return "$";
    if (t.includes("€")) return "€";
    if (t.includes("₴")) return "₴";
    return "";
  };

  const parseCardSplits = (text: string) => {
    const splits: { amount: number; curr: string }[] = [];
    const matches = text.matchAll(/💳\s*([\d.,]+)\s*([A-Za-z$€₴]+)\s*➔/g);
    for (const m of matches) {
      splits.push({
        amount: parseFloat(m[1].replace(",", ".")),
        curr: m[2].trim().toUpperCase()
      });
    }
    return splits;
  };

  if (!itemsOrTx) {
    return { isFulfillment: false, principalSum: 0, interestSum: 0, currency: "" };
  }

  // If it's a single transaction object (not a HistoryGroup items array)
  if (!Array.isArray(itemsOrTx) && typeof itemsOrTx === "object") {
    const tx = itemsOrTx;
    
    // Check split items first if they exist
    if (tx.splitItems && Array.isArray(tx.splitItems) && tx.splitItems.length > 0) {
      return getFulfillmentBreakdown(tx.splitItems, currentCurrency);
    }

    const rawText = tx.fullText || tx.text || tx.rawContent || "";
    const cleanText = rawText.toLowerCase();
    const comment = (tx.comment || "").toLowerCase();
    const isInterest = cleanText.includes("відсотки за договором") || cleanText.includes("відсотків") || comment.includes("відсотки за договором") || comment.includes("відсотків");
    const isPrincipal = cleanText.includes("повернення тіла") || cleanText.includes("повернення договору") || cleanText.includes("повне закриття договору");

    if (isInterest || isPrincipal) {
      const parsed = parseAmountAndCurrency(rawText);
      const cardSplits = parseCardSplits(rawText);
      
      // Determine the currency we want to report on
      let reportCurr = currentCurrency || (parsed ? parsed.curr : "") || getSymbolFromStr(rawText) || "$";
      if (reportCurr === "$") reportCurr = "USD";
      if (reportCurr === "€") reportCurr = "EUR";
      if (reportCurr === "₴") reportCurr = "UAH";
      reportCurr = reportCurr.toUpperCase();

      // Find if there's a split in the report currency
      const matchingSplit = cardSplits.find(s => {
        let sc = s.curr;
        if (sc === "$") sc = "USD";
        if (sc === "€") sc = "EUR";
        if (sc === "₴") sc = "UAH";
        return sc === reportCurr;
      });

      // The actual paid sum in the report currency
      let actualPaidSum = Math.abs(tx.sum);
      if (actualPaidSum === 0 && matchingSplit) {
        actualPaidSum = matchingSplit.amount;
      }

      // If still 0, but there are splits in other currencies and we have a stated contract sum
      if (actualPaidSum === 0 && cardSplits.length > 0 && parsed) {
        actualPaidSum = parsed.amount;
      }

      if (isInterest && !isPrincipal) {
        const statedInterestSum = parsed ? parsed.amount : 0;
        let intSum = actualPaidSum;
        if (matchingSplit) {
          intSum = matchingSplit.amount;
        } else if (statedInterestSum > 0 && (reportCurr === "USD" || reportCurr === "EUR")) {
          intSum = statedInterestSum;
        }
        return {
          isFulfillment: true,
          principalSum: 0,
          interestSum: intSum,
          currency: reportCurr
        };
      } else if (isInterest && isPrincipal) {
        const statedInterestSum = parsed ? parsed.amount : 0;
        let pVal = 0;
        const mBodyMatch = rawText.match(/повернення тіла\s*\(\s*([\d.,]+)/i) || rawText.match(/повернення тіла:\s*([\d.,]+)/i);
        if (mBodyMatch) {
          pVal = parseFloat(mBodyMatch[1].replace(",", "."));
        }
        const isSameCurrency = parsed && (parsed.curr.toUpperCase() === reportCurr || 
                             (parsed.curr === "$" && reportCurr === "USD") ||
                             (parsed.curr === "€" && reportCurr === "EUR") ||
                             (parsed.curr === "₴" && reportCurr === "UAH"));
        if (pVal === 0 && isSameCurrency && statedInterestSum > 0 && actualPaidSum > statedInterestSum + 0.01) {
          pVal = Number((actualPaidSum - statedInterestSum).toFixed(2));
        }
        return {
          isFulfillment: true,
          principalSum: pVal,
          interestSum: statedInterestSum > 0 ? statedInterestSum : actualPaidSum,
          currency: reportCurr
        };
      } else if (isPrincipal) {
        let pVal = actualPaidSum;
        const mBodyMatch = rawText.match(/повернення тіла\s*\(\s*([\d.,]+)/i) || rawText.match(/повернення тіла:\s*([\d.,]+)/i);
        if (mBodyMatch) {
          const statedVal = parseFloat(mBodyMatch[1].replace(",", "."));
          if (statedVal > pVal) {
            pVal = statedVal;
          }
        }
        return {
          isFulfillment: true,
          principalSum: pVal,
          interestSum: 0,
          currency: reportCurr
        };
      }
    }
    return { isFulfillment: false, principalSum: 0, interestSum: 0, currency: "" };
  }

  // If it's an array of items (e.g., from HistoryGroup items)
  if (Array.isArray(itemsOrTx)) {
    const items = itemsOrTx;
    
    if (items.length === 1) {
      return getFulfillmentBreakdown(items[0], currentCurrency);
    }

    let hasInterestItem = false;
    let hasPrincipalItem = false;
    let interestItemSum = 0;
    let principalItemSum = 0;
    let currency = currentCurrency || "";

    items.forEach(item => {
      const itemParsed = getFulfillmentBreakdown(item, currentCurrency);
      const rawText = item.fullText || item.text || "";
      
      if (itemParsed.isFulfillment) {
        if (itemParsed.interestSum > 0) {
          hasInterestItem = true;
          interestItemSum += itemParsed.interestSum;
        }
        if (itemParsed.principalSum > 0) {
          hasPrincipalItem = true;
          let pVal = itemParsed.principalSum;
          const mBodyMatch = rawText.match(/повернення тіла\s*\(\s*([\d.,]+)/i) || rawText.match(/повернення тіла:\s*([\d.,]+)/i);
          if (mBodyMatch) {
            const statedVal = parseFloat(mBodyMatch[1].replace(",", "."));
            if (statedVal > pVal) {
              pVal = statedVal;
            }
          }
          principalItemSum += pVal;
        }
        if (!currency && itemParsed.currency) {
          currency = itemParsed.currency;
        }
      } else {
        const cleanText = rawText.toLowerCase();
        const isInterest = cleanText.includes("відсотки за договором") || cleanText.includes("відсотків");
        const isPrincipal = cleanText.includes("повернення тіла") || cleanText.includes("повернення договору") || cleanText.includes("повне закриття договору");
        
        let itemSum = Math.abs(item.sum);
        if (isInterest) {
          hasInterestItem = true;
          interestItemSum += itemSum;
        } else if (isPrincipal) {
          hasPrincipalItem = true;
          principalItemSum += itemSum;
        }
      }
    });

    if (hasInterestItem || hasPrincipalItem) {
      return {
        isFulfillment: true,
        principalSum: Number(principalItemSum.toFixed(2)),
        interestSum: Number(interestItemSum.toFixed(2)),
        currency: currency || "$"
      };
    }
  }

  return {
    isFulfillment: false,
    principalSum: 0,
    interestSum: 0,
    currency: ""
  };
}

/**
 * Determines whether a transaction or category represents a loan (my loan or loan to someone)
 * or principal debt operation that should NOT be displayed or counted as income in financial reports and analytics.
 */
export function isLoanTransaction(
  opName?: string,
  categoryName?: string,
  commentOrText?: string,
  fullText?: string
): boolean {
  const op = (opName || "").toLowerCase();
  const cat = (categoryName || "").toLowerCase();
  const txt = (commentOrText || "").toLowerCase();
  const full = (fullText || "").toLowerCase();
  const combined = `${op} ${cat} ${txt} ${full}`;

  // If this item explicitly contains interest / dividend / coupon profit, that portion is considered income
  const hasInterest = 
    combined.includes("відсот") || 
    combined.includes("процент") || 
    combined.includes("дохід від відсотків") || 
    combined.includes("дохід отриманий від відсотків") || 
    combined.includes("інтерес") || 
    combined.includes("дивіденд") ||
    combined.includes("купон");
  if (hasInterest) return false;

  // Check for loan keywords (covering all Ukrainian inflections):
  // "позик" covers: позика, позики, позику, позикою, позикам, позиках, позика комусь, позика моя, мої позики, позики комусь
  // "позич" covers: позичаю, позичив, позичила, позичили, позичити, позичено, позичати
  const isLoan = combined.includes("позик") || combined.includes("позич");

  // Check for debt / credit operations
  const isDebtOrCredit = 
    combined.includes("борг") ||
    combined.includes("кредит") ||
    combined.includes("займ") ||
    combined.includes("взяв у борг") ||
    combined.includes("взяла в борг") ||
    combined.includes("дав у борг") ||
    combined.includes("дала в борг") ||
    combined.includes("повернули борг") ||
    combined.includes("повертаю борг");

  return isLoan || isDebtOrCredit;
}

/**
 * Accurately determines the true currency of a transaction item,
 * preventing cross-currency split items (e.g. 900 UAH received from a 220 USD interest deal)
 * from being mistakenly classified as USD due to "$" mentioned in the contract/deal text.
 */
export function resolveItemCurrency(
  itemCurr?: string,
  groupCurr?: string,
  text?: string,
  fullText?: string,
  amount?: number
): "UAH" | "USD" | "EUR" {
  const normItem = (itemCurr || "").toUpperCase().trim();
  const combined = `${text || ""} ${fullText || ""}`;
  const combinedUpper = combined.toUpperCase();

  // 1. Direct explicit foreign currency on item takes immediate precedence
  if (normItem === "USD" || normItem === "$") return "USD";
  if (normItem === "EUR" || normItem === "€") return "EUR";

  // 2. Specific amount matched with currency symbol in text/splits (e.g. "25 USD" or "💳 25 $")
  if (amount != null && Math.abs(amount) > 0.001) {
    const amtStr = Math.abs(amount).toFixed(2);
    const amtInt = Math.abs(Math.round(amount)).toString();
    const usdMatch = new RegExp(`(?:${amtStr}|${amtInt})\\s*(?:USD|\\$|ДОЛ)`, "i").test(combined) ||
                     new RegExp(`💳\\s*(?:${amtStr}|${amtInt})\\s*(?:USD|\\$|ДОЛ)`, "i").test(combined);
    const eurMatch = new RegExp(`(?:${amtStr}|${amtInt})\\s*(?:EUR|€|ЄВР)`, "i").test(combined) ||
                     new RegExp(`💳\\s*(?:${amtStr}|${amtInt})\\s*(?:EUR|€|ЄВР)`, "i").test(combined);
    const uahMatch = new RegExp(`(?:${amtStr}|${amtInt})\\s*(?:UAH|₴|ГРН)`, "i").test(combined) ||
                     new RegExp(`💳\\s*(?:${amtStr}|${amtInt})\\s*(?:UAH|₴|ГРН)`, "i").test(combined);

    if (usdMatch && !uahMatch && !eurMatch) return "USD";
    if (eurMatch && !uahMatch && !usdMatch) return "EUR";
    if (uahMatch && !usdMatch && !eurMatch) return "UAH";
  }

  // 3. Split payment lines: e.g. "💳 25 USD ➔" or "💳 25 $ ➔"
  const mCard = combined.match(/💳\s*[\d.,]+\s*([a-zA-Z$€₴]+)/i);
  if (mCard && mCard[1]) {
    const sym = mCard[1].toUpperCase();
    if (sym === "USD" || sym === "$") return "USD";
    if (sym === "EUR" || sym === "€") return "EUR";
    if (sym === "UAH" || sym === "₴" || sym.includes("ГРН")) return "UAH";
  }

  // 4. Text specifically contains foreign bank/currency indicator
  if (combinedUpper.includes("USD") || combinedUpper.includes("$") || combinedUpper.includes("ДОЛ")) return "USD";
  if (combinedUpper.includes("EUR") || combinedUpper.includes("€") || combinedUpper.includes("ЄВР")) return "EUR";

  // 5. Explicit currency on the group or bank sheet
  const normGroup = (groupCurr || "").toUpperCase().trim();
  if (normGroup === "USD" || normGroup === "$") return "USD";
  if (normGroup === "EUR" || normGroup === "€") return "EUR";
  if (normGroup === "UAH" || normGroup === "₴" || normGroup.includes("ГРН")) return "UAH";

  if (normItem === "UAH" || normItem === "₴" || normItem.includes("ГРН")) return "UAH";

  return "UAH";
}

export interface EffectiveHistoryItem {
  bank: string;
  text: string;
  sum: number;
  fullText: string;
  operation?: string;
  curr: "UAH" | "USD" | "EUR";
  isIncome?: boolean;
  isInterestFulfillment?: boolean;
}

/**
 * Returns accurate individual items for a HistoryGroup, decomposing multi-currency
 * split operations, cross-currency payments, or cardDetails flows into precise per-currency items.
 */
export function getGroupEffectiveItems(g: {
  items?: Array<{
    bank?: string;
    text?: string;
    sum: number;
    fullText?: string;
    operation?: string;
    curr?: string;
    isIncome?: boolean;
    isInterestFulfillment?: boolean;
  }>;
  operation?: string;
  curr?: string;
  isIncome?: boolean;
  totalSum?: number;
}): EffectiveHistoryItem[] {
  const rawItems = g.items || [];
  const nonZero = rawItems.filter(it => Math.abs(Number(it.sum) || 0) > 0.001);

  // If already multiple items with values, resolve each currency
  if (nonZero.length > 1) {
    return nonZero.map(it => {
      const s = Number(it.sum) || 0;
      const c = resolveItemCurrency(it.curr, g.curr, it.text, it.fullText, Math.abs(s));
      return {
        bank: it.bank || "",
        text: it.text || "",
        sum: s,
        fullText: it.fullText || it.text || "",
        operation: it.operation || g.operation,
        curr: c,
        isIncome: it.isIncome !== undefined ? it.isIncome : g.isIncome,
        isInterestFulfillment: it.isInterestFulfillment
      };
    });
  }

  // If only 1 item (or 0 non-zero), check whether cardDetails has multiple split lines
  const mainIt = rawItems[0];
  const fullText = mainIt?.fullText || mainIt?.text || "";
  const parsed = parseTransactionText(fullText);

  if (parsed.cardDetails) {
    const lines = parsed.cardDetails.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const splitItems: EffectiveHistoryItem[] = [];

    lines.forEach(line => {
      const arrowIdx = line.indexOf("➔");
      if (arrowIdx !== -1) {
        const amtPart = line.substring(0, arrowIdx).trim();
        const bankPart = line.substring(arrowIdx + 1).trim();
        const m = amtPart.match(/([\d.,]+)\s*([^\d\s]*)/);
        if (m) {
          const val = parseFloat(m[1].replace(/,/g, "."));
          if (val > 0.001) {
            const sym = (m[2] || "").trim();
            const flowCurr = resolveItemCurrency(sym, g.curr, bankPart, amtPart, val);
            const signedVal = g.isIncome ? val : -val;
            splitItems.push({
              bank: bankPart,
              text: line,
              sum: signedVal,
              fullText: fullText,
              operation: g.operation,
              curr: flowCurr,
              isIncome: g.isIncome
            });
          }
        }
      }
    });

    if (splitItems.length > 1) {
      return splitItems;
    }
  }

  // Single item fallback
  if (mainIt) {
    const s = Number(mainIt.sum) || 0;
    const finalSum = s !== 0 ? s : (g.isIncome ? Math.abs(g.totalSum || 0) : -Math.abs(g.totalSum || 0));
    const c = resolveItemCurrency(mainIt.curr, g.curr, mainIt.text, mainIt.fullText, Math.abs(finalSum));
    return [{
      bank: mainIt.bank || "",
      text: mainIt.text || "",
      sum: finalSum,
      fullText: mainIt.fullText || mainIt.text || "",
      operation: mainIt.operation || g.operation,
      curr: c,
      isIncome: mainIt.isIncome !== undefined ? mainIt.isIncome : g.isIncome,
      isInterestFulfillment: mainIt.isInterestFulfillment
    }];
  }

  if (g.totalSum && Math.abs(g.totalSum) > 0.001) {
    const s = g.isIncome ? Math.abs(g.totalSum) : -Math.abs(g.totalSum);
    const c = resolveItemCurrency(g.curr, undefined, undefined, undefined, Math.abs(s));
    return [{
      bank: "",
      text: g.operation || "",
      sum: s,
      fullText: "",
      operation: g.operation,
      curr: c,
      isIncome: g.isIncome
    }];
  }

  return [];
}



