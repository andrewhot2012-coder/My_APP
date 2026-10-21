import React, { useState, useEffect, useRef } from "react";
import { AutocompleteInput } from "./AutocompleteInput";
import { Info, Settings, Paperclip, ChevronDown, ChevronUp, UserPlus, X, Coins, Trash2, Mic, MicOff, Volume2, Sparkles, CheckCircle2, ExternalLink, RotateCcw, Hourglass } from "lucide-react";
import { InitData } from "../types";
import {
  parseVoiceTransaction,
  cleanAndNormalizeUkrainianSpeech,
  parseUkrainianSpokenNumber,
  COMMENT_ACTION_WORDS,
  normalizeUkrainianName,
  COMMON_BUSINESS_NAMES,
  UKRAINIAN_COMMON_GIVEN_NAMES,
  isUkrainianSurnamePattern
} from "../lib/voiceParser";

interface FormViewProps {
  operation: string; // e.g. "Прибуток", "Повернули борг", "Покупка", "Повертаю борг", etc.
  initData: InitData | null;
  currentCurrency: string;
  onBack: () => void;
  onSubmit: (formData: any) => void;
  onNavigateToCategories: () => void;
  prefilledContractor?: string;
  prefilledPlanned?: any | null;
  autoStartVoice?: boolean;
  onChangeCurrency?: (currency: string) => void;
  onChangeOperation?: (operation: string, targetScreen?: "income" | "expense") => void;
}

const CURRENCY_INFOS: { [key: string]: { flag: string; symbol: string; name: string } } = {
  UAH: { flag: "🇺🇦", symbol: "₴", name: "Гривня (UAH)" },
  USD: { flag: "🇺🇸", symbol: "$", name: "Долар (USD)" },
  EUR: { flag: "🇪🇺", symbol: "€", name: "Євро (EUR)" }
};

const getRank = (c: string) => {
  if (c === "EUR") return 3;
  if (c === "USD") return 2;
  return 1; // UAH
};

const getRateLabel = (fC: string, tC: string) => {
  if (!fC || !tC || fC === tC) return "";
  const hVal = getRank(fC) > getRank(tC) ? fC : tC;
  const sVal = getRank(fC) > getRank(tC) ? tC : fC;
  
  const fInfo = CURRENCY_INFOS[fC] || { flag: "" };
  const tInfo = CURRENCY_INFOS[tC] || { flag: "" };
  
  return `${fInfo.flag} 1 ${fC} = ${tInfo.flag} ... ${tC}`;
};

const getRateLabelDetailed = (fC: string, tC: string, rateVal: number) => {
  if (!fC || !tC || fC === tC) return "";
  const fInfo = CURRENCY_INFOS[fC] || { flag: "" };
  const tInfo = CURRENCY_INFOS[tC] || { flag: "" };
  
  // Format based on rank. We show how many of the "weaker" currency equals 1 of the "stronger" currency.
  const isFromSoft = getRank(fC) < getRank(tC);
  if (isFromSoft) {
    // e.g. 1 USD = 41.50 UAH. Since rateVal is e.g. 41.50 (UAH/USD), 
    // 1 tC = rateVal fC
    return `📈 Курс: 1 ${tInfo.flag} ${tC} = ${rateVal.toFixed(2)} ${fInfo.flag} ${fC}`;
  } else {
    // e.g. 1 EUR = 1.08 USD. rateVal is e.g. 1.08 (USD/EUR)
    // 1 fC = rateVal tC
    const decimals = (fC === "UAH" || tC === "UAH") ? 2 : 4;
    return `📈 Курс: 1 ${fInfo.flag} ${fC} = ${rateVal.toFixed(decimals)} ${tInfo.flag} ${tC}`;
  }
};

const getConventionalRate = (fC: string, tC: string, rates: any, isInc: boolean, mode: string) => {
  if (fC === tC) return 1;
  const hVal = getRank(fC) > getRank(tC) ? fC : tC;
  const sVal = getRank(fC) > getRank(tC) ? tC : fC;

  if (sVal === "UAH") {
    const rateData = rates[hVal];
    if (!rateData) return 1;
    
    // For cross-rate (official/base rate), we use the buy rate as the standard cross-rate reference
    if (mode === "cross") {
      return rateData.buy;
    }
    
    // Symmetrical real-world exchange rates:
    if (tC === hVal) {
      // Base currency is USD/EUR (strong), paid/received in UAH.
      // To buy USD/EUR with UAH, the bank sells USD/EUR to us at the Sell rate (higher rate).
      return rateData.sell;
    } else {
      // Base currency is UAH (soft), paid/received in USD/EUR.
      // To get UAH, we sell USD/EUR to the bank, which buys USD/EUR at the Buy rate (lower rate).
      return rateData.buy;
    }
  } else {
    if (!rates.EUR || !rates.USD) return 1;
    if (mode === "kantor") {
      return isInc ? (rates.EUR.buy / rates.USD.sell) : (rates.EUR.sell / rates.USD.buy);
    } else {
      return rates.EUR.buy / rates.USD.buy;
    }
  }
};

export const FormView: React.FC<FormViewProps> = ({
  operation,
  initData,
  currentCurrency,
  onBack,
  onSubmit,
  onNavigateToCategories,
  prefilledContractor,
  prefilledPlanned,
  autoStartVoice,
  onChangeCurrency,
  onChangeOperation
}) => {
  const isIncome = operation.includes("Прибуток") || operation.includes("Повернули");
  const isDiscountSomeone = operation === "Покупка зі знижкою в борг комусь";
  const isDiscount = operation === "Покупка зі знижкою в борг" || isDiscountSomeone;

  const draftKey = isIncome ? "accounting_form_draft_income" : "accounting_form_draft_expense";

  const getDraftField = (fieldName: string, fallback: any) => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed[fieldName] !== undefined) return parsed[fieldName];
      }
    } catch (e) {}
    return fallback;
  };

  // Form Fields State
  const [category, setCategory] = useState<string>(() => {
    if (prefilledPlanned && prefilledPlanned.category !== undefined) {
      return prefilledPlanned.category || "";
    }
    return getDraftField("category", "");
  });
  const [contractor, setContractor] = useState<string>(() => {
    if (prefilledPlanned) {
      return prefilledPlanned.isInterestFulfillment
        ? (prefilledPlanned.contractor || prefilledPlanned.name || "")
        : (prefilledPlanned.contractor || "");
    }
    return prefilledContractor || getDraftField("contractor", "");
  });

  useEffect(() => {
    if (prefilledContractor) {
      setContractor(prefilledContractor);
    }
  }, [prefilledContractor]);
  const [contractor2, setContractor2] = useState<string>(() => getDraftField("contractor2", ""));
  const [totalSum, setTotalSum] = useState<string>(() => {
    if (prefilledPlanned) {
      return String(prefilledPlanned.sum || "");
    }
    return getDraftField("totalSum", "");
  });
  const [discountPercent, setDiscountSum] = useState<string>(() => getDraftField("discountPercent", ""));
  const [clientGetsDiscount, setClientGetsDiscount] = useState<boolean>(() => getDraftField("clientGetsDiscount", true));
  const [comment, setComment] = useState<string>(() => {
    if (prefilledPlanned) {
      return prefilledPlanned.comment || prefilledPlanned.name || "";
    }
    return getDraftField("comment", "");
  });

  useEffect(() => {
    if (prefilledPlanned) {
      if (prefilledPlanned.category !== undefined) {
        setCategory(prefilledPlanned.category || "");
      }
      setTotalSum(String(prefilledPlanned.sum || ""));
      setComment(prefilledPlanned.comment || prefilledPlanned.name || "");
      setContractor(
        prefilledPlanned.isInterestFulfillment
          ? (prefilledPlanned.contractor || prefilledPlanned.name || "")
          : (prefilledPlanned.contractor || "")
      );
    }
  }, [prefilledPlanned]);

  const [receipt, setReceipt] = useState<{ base64: string; mimeType: string; name: string } | null>(() => getDraftField("receipt", null));
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // Payment splits state
  const [showSplits, setShowSplits] = useState<boolean>(() => getDraftField("showSplits", false));
  const [bankSplits, setBankSplits] = useState<{ [key: string]: number }>(() => getDraftField("bankSplits", {
    "Готівка": 0, "Банк 1": 0, "Банк 2": 0, "Банк 3": 0, "Банк 4": 0, "Банк 5": 0
  }));
  const [offsetSplits, setOffsetSplits] = useState<any[]>(() => getDraftField("offsetSplits", []));

  // Web Speech API Voice Input State
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceTranscript, setVoiceTranscript] = useState<string>("");
  const [voiceFeedback, setVoiceFeedback] = useState<{
    text: string;
    details?: string;
    fields?: { label: string; value: string; icon: string }[];
  } | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [showVoiceHelp, setShowVoiceHelp] = useState<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const accumulatedTranscriptRef = useRef<string>("");
  const savedPreviousTranscriptRef = useRef<string>("");
  const isUserListeningActiveRef = useRef<boolean>(false);
  const hasBeepedForCommentRef = useRef<boolean>(false);
  const lastSpeechTimeRef = useRef<number>(0);

  const playAudioBeep = (type: "start" | "comment" | "done" = "start") => {
    try {
      const AudioCtx = typeof window !== "undefined" && (window.AudioContext || (window as any).webkitAudioContext);
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === "start") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(650, ctx.currentTime);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === "comment") {
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = "sine";
        osc1.frequency.setValueAtTime(880, now);
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1175, now + 0.08);

        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc1.stop(now + 0.08);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.22);
      } else if (type === "done") {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(987, now);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
      }
    } catch (e) {
      console.warn("Audio beep warning:", e);
    }
  };

  const processVoiceInput = (rawText: string) => {
    if (!rawText || !rawText.trim()) return;

    const categoriesList = initData?.categories || [];
    const contractorsList = initData?.names || [];
    const bankAliases = initData?.allAliases[currentCurrency as "UAH" | "USD" | "EUR"] || {};

    const result = parseVoiceTransaction(
      rawText,
      categoriesList,
      contractorsList,
      bankAliases,
      isDiscountSomeone,
      currentCurrency as "UAH" | "USD" | "EUR"
    );

    if (result.detectedCurrency && onChangeCurrency) {
      onChangeCurrency(result.detectedCurrency);
    }

    if (result.detectedOperation) {
      const targetScreen = result.detectedScreen || (result.detectedOperation.includes("Прибуток") || result.detectedOperation.includes("Повернули") ? "income" : "expense");
      if (onChangeOperation) {
        onChangeOperation(result.detectedOperation, targetScreen);
      }
    }

    // Reset/clear all form fields before setting newly parsed values from voice input
    const newSum = result.detectedSum || "";
    const newCategory = result.detectedCategory || "";
    const newContractor = result.detectedContractor || "";
    const newContractor2 = result.detectedContractor2 || "";
    const newDiscount = result.detectedDiscount || "";
    const newComment = result.detectedComment || "";

    setTotalSum(newSum);
    setCategory(newCategory);
    setContractor(newContractor);
    setContractor2(newContractor2);
    setDiscountSum(newDiscount);
    setComment(newComment);
    setReceipt(null);
    setOffsetSplits([]);
    setIsCrossCurrency(false);

    let updatedBankSplits: { [key: string]: number } = {
      "Готівка": 0, "Банк 1": 0, "Банк 2": 0, "Банк 3": 0, "Банк 4": 0, "Банк 5": 0
    };
    if (result.detectedBankKey) {
      const sumVal = parseFloat(newSum) || 0;
      updatedBankSplits[result.detectedBankKey] = sumVal;
      setBankSplits(updatedBankSplits);
      setShowSplits(true);
    } else {
      setBankSplits(updatedBankSplits);
      setShowSplits(false);
    }

    const draftContent = {
      category: newCategory,
      contractor: newContractor,
      contractor2: newContractor2,
      totalSum: newSum,
      discountPercent: newDiscount,
      comment: newComment,
      receipt: null,
      bankSplits: updatedBankSplits,
      showSplits: !!result.detectedBankKey,
      offsetSplits: [],
      isCrossCurrency: false
    };

    try {
      localStorage.setItem("accounting_form_draft_income", JSON.stringify(draftContent));
      localStorage.setItem("accounting_form_draft_expense", JSON.stringify(draftContent));
    } catch (e) {}

    setVoiceFeedback({
      text: `Розпізнано: "${result.normalizedText}"`,
      fields: result.populatedFields
    });
  };

  const combineSpeechResults = (results: any): string => {
    let combined = "";

    for (let i = 0; i < results.length; i++) {
      const rawChunk = (results[i][0]?.transcript || "").trim();
      if (!rawChunk) continue;

      if (!combined) {
        combined = rawChunk;
        continue;
      }

      const normCombined = combined.toLowerCase().trim();
      const normChunk = rawChunk.toLowerCase().trim();

      // 1. If rawChunk already starts with combined (Android Chrome cumulative behavior)
      if (normChunk.startsWith(normCombined)) {
        combined = rawChunk;
        continue;
      }

      // 2. If combined already ends with or contains rawChunk (duplicate chunk)
      if (normCombined.endsWith(normChunk) || normCombined === normChunk) {
        continue;
      }

      // 3. Check for partial overlap at boundary
      const combinedWords = combined.split(/\s+/);
      const chunkWords = rawChunk.split(/\s+/);

      let overlapCount = 0;
      const maxOverlap = Math.min(combinedWords.length, chunkWords.length);
      for (let o = maxOverlap; o >= 1; o--) {
        const combinedTail = combinedWords.slice(-o).join(" ").toLowerCase();
        const chunkHead = chunkWords.slice(0, o).join(" ").toLowerCase();
        if (combinedTail === chunkHead) {
          overlapCount = o;
          break;
        }
      }

      if (overlapCount > 0) {
        const newWords = chunkWords.slice(overlapCount).join(" ");
        if (newWords) {
          combined += " " + newWords;
        }
      } else {
        combined += " " + rawChunk;
      }
    }

    // Deduplicate adjacent repeated words and 2-3 word phrases
    let text = combined.trim().replace(/\s+/g, " ");
    text = text.replace(/(?<!\p{L})(\p{L}+)(?:\s+\1)+(?!\p{L})/giu, "$1");
    text = text.replace(/(?<!\p{L})(\p{L}+\s+\p{L}+)(?:\s+\1)+(?!\p{L})/giu, "$1");
    text = text.replace(/(?<!\p{L})(\p{L}+\s+\p{L}+\s+\p{L}+)(?:\s+\1)+(?!\p{L})/giu, "$1");

    return text.trim();
  };

  const stopVoiceInput = () => {
    isUserListeningActiveRef.current = false;
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsListening(false);
  };

  const startVoiceInput = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    isUserListeningActiveRef.current = true;
    savedPreviousTranscriptRef.current = "";
    accumulatedTranscriptRef.current = "";
    hasBeepedForCommentRef.current = false;
    lastSpeechTimeRef.current = Date.now();

    setVoiceError(null);
    setVoiceFeedback(null);
    setVoiceTranscript("");

    const SpeechRecognition =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setVoiceError("⚠️ Голосове введення через Web Speech API не підтримується у цьому браузері. Використовуйте Chrome, Edge або Safari.");
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "uk-UA";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        if (!savedPreviousTranscriptRef.current) {
          playAudioBeep("start"); // Initial start chime 🔔
        }
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (!accumulatedTranscriptRef.current.trim()) {
            stopVoiceInput();
          }
        }, 12000);
      };

      recognition.onresult = (event: any) => {
        const sessionText = combineSpeechResults(event.results);
        const rawFullText = (savedPreviousTranscriptRef.current + " " + sessionText).trim().replace(/\s+/g, " ");
        const fullText = cleanAndNormalizeUkrainianSpeech(rawFullText);
        accumulatedTranscriptRef.current = fullText;
        setVoiceTranscript(fullText);
        lastSpeechTimeRef.current = Date.now();

        const lowerText = fullText.toLowerCase();
        const isCommentModeActive = /(?<!\p{L})(?:коментар|призначення|примітка|деталі|опис)(?!\p{L})/giu.test(lowerText);
        if (!hasBeepedForCommentRef.current && isCommentModeActive) {
          hasBeepedForCommentRef.current = true;
          playAudioBeep("comment");
        }

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        // Auto-stop recording 1.6s after user finishes speaking (2.2s if in comment mode)
        const autoStopDelayMs = isCommentModeActive ? 2200 : 1600;
        silenceTimerRef.current = setTimeout(() => {
          stopVoiceInput();
        }, autoStopDelayMs);
      };

      recognition.onerror = (event: any) => {
        if (event.error === "no-speech") {
          return;
        }
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          isUserListeningActiveRef.current = false;
          setIsListening(false);
          setVoiceError("⚠️ Доступ до мікрофона відхилено у налаштуваннях браузера.");
        }
      };

      recognition.onend = () => {
        const silentMs = Date.now() - lastSpeechTimeRef.current;
        const hasText = accumulatedTranscriptRef.current.trim().length > 0;

        if (isUserListeningActiveRef.current) {
          if (hasText) {
            // User finished speaking text and recognition stopped -> complete voice input!
            isUserListeningActiveRef.current = false;
          } else if (silentMs >= 6000) {
            // No speech detected for 6s -> stop mic
            isUserListeningActiveRef.current = false;
          } else {
            // No text yet, brief pause -> restart stream
            savedPreviousTranscriptRef.current = accumulatedTranscriptRef.current;
            try {
              recognition.start();
              return;
            } catch (e) {}
          }
        }

        setIsListening(false);
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }

        const textToProcess = accumulatedTranscriptRef.current.trim();
        accumulatedTranscriptRef.current = "";
        savedPreviousTranscriptRef.current = "";

        if (textToProcess) {
          playAudioBeep("done");
          processVoiceInput(textToProcess);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      isUserListeningActiveRef.current = false;
      setIsListening(false);
      setVoiceError("⚠️ Не вдалося запустити мікрофон.");
    }
  };

  const startCommentOnlyVoiceInput = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    isUserListeningActiveRef.current = true;
    savedPreviousTranscriptRef.current = "";
    accumulatedTranscriptRef.current = "";
    lastSpeechTimeRef.current = Date.now();

    setVoiceError(null);
    setVoiceFeedback(null);
    setVoiceTranscript("");

    const SpeechRecognition =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    if (!SpeechRecognition) {
      setVoiceError("⚠️ Голосове введення через Web Speech API не підтримується у цьому браузері.");
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }

      const recognition = new SpeechRecognition();
      recognition.lang = "uk-UA";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        if (!savedPreviousTranscriptRef.current) {
          playAudioBeep("comment"); // Double chime 🔔🔔
        }
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          stopVoiceInput();
        }, 12000);
      };

      recognition.onresult = (event: any) => {
        const sessionText = combineSpeechResults(event.results);
        const rawFullText = (savedPreviousTranscriptRef.current + " " + sessionText).trim().replace(/\s+/g, " ");
        const fullText = cleanAndNormalizeUkrainianSpeech(rawFullText);
        accumulatedTranscriptRef.current = fullText;
        setVoiceTranscript(fullText);
        setComment(fullText);
        lastSpeechTimeRef.current = Date.now();

        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
        silenceTimerRef.current = setTimeout(() => {
          stopVoiceInput();
        }, 1800);
      };

      recognition.onerror = () => {};

      recognition.onend = () => {
        const silentMs = Date.now() - lastSpeechTimeRef.current;
        const hasText = accumulatedTranscriptRef.current.trim().length > 0;

        if (isUserListeningActiveRef.current) {
          if (hasText) {
            isUserListeningActiveRef.current = false;
          } else if (silentMs >= 6000) {
            isUserListeningActiveRef.current = false;
          } else {
            savedPreviousTranscriptRef.current = accumulatedTranscriptRef.current;
            try {
              recognition.start();
              return;
            } catch (e) {}
          }
        }

        isUserListeningActiveRef.current = false;
        setIsListening(false);
        const textToProcess = accumulatedTranscriptRef.current.trim();
        accumulatedTranscriptRef.current = "";
        savedPreviousTranscriptRef.current = "";

        if (textToProcess) {
          playAudioBeep("done");
          setComment(textToProcess);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      isUserListeningActiveRef.current = false;
      setIsListening(false);
    }
  };

  useEffect(() => {
    if (autoStartVoice) {
      const timer = setTimeout(() => {
        startVoiceInput();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoStartVoice]);

  // Planned interest state for debt transactions
  const [createPlannedInterest, setCreatePlannedInterest] = useState(false);
  const [plannedInterestMode, setPlannedInterestMode] = useState<"give" | "take">("give");
  const [plannedInterestRate, setPlannedInterestRate] = useState("10");
  const [plannedInterestPeriod, setPlannedInterestPeriod] = useState<"annual" | "monthly">("monthly");
  const [plannedInterestStartDate, setPlannedInterestStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [plannedInterestDueDate, setPlannedInterestDueDate] = useState("");

  // Sync default planned interest mode based on isIncome
  useEffect(() => {
    setPlannedInterestMode(isIncome ? "take" : "give");
  }, [isIncome]);

  // Cross currency payment state
  const [isCustomCash, setIsCustomCash] = useState<boolean>(() => getDraftField("isCustomCash", false));
  const [isCrossCurrency, setIsCrossCurrency] = useState<boolean>(() => getDraftField("isCrossCurrency", false));
  const [crossRateSource, setCrossRateSource] = useState<string>(() => getDraftField("crossRateSource", "telegram"));
  const [crossBaseSumOverride, setCrossBaseSumOverride] = useState<string>(() => getDraftField("crossBaseSumOverride", ""));
  const [crossBlocks, setCrossBlocks] = useState<any[]>(() => {
    const defaultCurr = currentCurrency === "USD" ? "UAH" : "USD";
    return getDraftField("crossBlocks", [
      { active: true, curr: defaultCurr, acc: "Готівка", sum: "", rate: "", eq: "" }
    ]);
  });

  // Math calculations
  const rawSum = parseFloat(totalSum) || 0;
  const discountVal = parseFloat(discountPercent) || 0;
  const targetTotal = isDiscount ? Number((rawSum * (1 - discountVal / 100)).toFixed(2)) : rawSum;

  const clientDiscountSum = targetTotal;
  const clientFullSum = rawSum;

  let distributedExcludeCash = 0;
  Object.keys(bankSplits).forEach(b => {
    if (b !== "Готівка" || isCustomCash) {
      distributedExcludeCash += bankSplits[b] || 0;
    }
  });
  
  offsetSplits.forEach(o => {
    distributedExcludeCash += o.sum || 0;
  });

  const crossBaseSum = crossBaseSumOverride !== "" ? (parseFloat(crossBaseSumOverride) || 0) : Math.max(0, Number((targetTotal - distributedExcludeCash).toFixed(2)));

  useEffect(() => {
    const timer = setTimeout(() => {
      const draft = {
        category,
        contractor,
        contractor2,
        totalSum,
        discountPercent,
        clientGetsDiscount,
        comment,
        receipt,
        isCrossCurrency,
        crossRateSource,
        crossBaseSumOverride,
        crossBlocks,
        showSplits,
        isCustomCash,
        bankSplits,
        offsetSplits
      };
      try {
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch (e) {}
    }, 250);

    return () => clearTimeout(timer);
  }, [
    draftKey,
    category,
    contractor,
    contractor2,
    totalSum,
    discountPercent,
    clientGetsDiscount,
    comment,
    receipt,
    isCrossCurrency,
    crossRateSource,
    crossBaseSumOverride,
    crossBlocks,
    showSplits,
    isCustomCash,
    bankSplits,
    offsetSplits
  ]);

  const setCrossBlocksWithBalance = (newBlocks: any[], editedIndex: number) => {
    if (newBlocks.length > 1 && editedIndex < newBlocks.length - 1) {
      // Calculate the sum of eq of all blocks except the last one
      let otherEqs = 0;
      for (let i = 0; i < newBlocks.length - 1; i++) {
        otherEqs += parseFloat(newBlocks[i].eq) || 0;
      }
      
      const lastIndex = newBlocks.length - 1;
      const lastBlock = { ...newBlocks[lastIndex] };
      const remaining = Number((crossBaseSum - otherEqs).toFixed(2));
      
      // Update the last block's eq with the remainder
      lastBlock.eq = remaining > 0 ? remaining.toFixed(2) : "";
      
      // Recalculate the last block's sum based on its rate and new eq
      const r = parseFloat(lastBlock.rate) || 0;
      if (r > 0) {
        const fC = lastBlock.curr;
        const tC = currentCurrency;
        const isFromSoft = getRank(fC) < getRank(tC);
        
        const eqVal = remaining > 0 ? remaining : 0;
        lastBlock.sum = (isFromSoft ? (eqVal * r) : (eqVal / r)).toFixed(2);
      } else {
        lastBlock.sum = "";
      }
      
      newBlocks[lastIndex] = lastBlock;
    }
    setCrossBlocks(newBlocks);
  };

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const defaultCurr = currentCurrency === "USD" ? "UAH" : "USD";
    setCrossBlocks([
      { active: true, curr: defaultCurr, acc: "Готівка", sum: "", rate: "", eq: "" }
    ]);
  }, [currentCurrency]);

  // Dynamic automatic rate-fetching and pre-population
  useEffect(() => {
    if (!isCrossCurrency) return;

    const fetchRates = async () => {
      try {
        const res = await fetch(`/api/rates?source=${crossRateSource}`);
        const rates = await res.json();
        if (rates && !rates.error) {
          setCrossBlocks(prev => {
            let changed = false;
            const updated = prev.map(block => {
              if (block.curr === currentCurrency) {
                if (block.rate !== "1") {
                  changed = true;
                  return { ...block, rate: "1", eq: block.sum || "" };
                }
                return block;
              }
              
              const fC = block.curr;
              const tC = currentCurrency;
              const rateVal = getConventionalRate(fC, tC, rates, isIncome, "kantor");
              const formattedRate = (fC === "UAH" || tC === "UAH") ? rateVal.toFixed(2) : rateVal.toFixed(4);
              
              // Overwrite if rate is empty, 0, or equal to 1 (when it shouldn't be)
              if (!block.rate || parseFloat(block.rate) === 0 || block.rate === "1") {
                changed = true;
                
                let s = block.sum;
                let eq = block.eq;
                const isFromSoft = getRank(fC) < getRank(tC);
                
                const lastEdited = block.lastEdited || "eq";
                
                if (!s && !eq && crossBaseSum > 0 && prev.length === 1) {
                  eq = String(crossBaseSum);
                  s = (isFromSoft ? (crossBaseSum * rateVal) : (crossBaseSum / rateVal)).toFixed(2);
                } else if (lastEdited === "sum" && s) {
                  const sNum = parseFloat(s) || 0;
                  eq = (isFromSoft ? (sNum / rateVal) : (sNum * rateVal)).toFixed(2);
                } else if (eq) {
                  const eqNum = parseFloat(eq) || 0;
                  s = (isFromSoft ? (eqNum * rateVal) : (eqNum / rateVal)).toFixed(2);
                } else if (s) {
                  const sNum = parseFloat(s) || 0;
                  eq = (isFromSoft ? (sNum / rateVal) : (sNum * rateVal)).toFixed(2);
                }
                
                return {
                  ...block,
                  rate: formattedRate,
                  sum: s,
                  eq: eq
                };
              }
              return block;
            });
            return changed ? updated : prev;
          });
        }
      } catch (err) {
        console.warn("Auto-fetch rates failed", err);
      }
    };

    fetchRates();
  }, [isCrossCurrency, crossRateSource, currentCurrency, isIncome, crossBaseSum]);

  // Modals state
  const [modalType, setModalType] = useState<"bank" | "offset" | null>(null);
  const [activeModalBank, setActiveModalBank] = useState("");
  const [modalSum, setModalSum] = useState("");
  const [modalOffsetName, setModalOffsetName] = useState("");
  const [editingOffsetIndex, setEditingOffsetIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleIntercept = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (modalType) {
        customEvent.detail.preventScreenTransition();
        setModalType(null);
      }
    };
    window.addEventListener("app-back-intercept", handleIntercept);
    return () => window.removeEventListener("app-back-intercept", handleIntercept);
  }, [modalType]);

  const getCurrencySymbol = (c: string) => {
    if (c === "UAH") return "₴"; if (c === "USD") return "$"; if (c === "EUR") return "€"; return c;
  };

  let crossEqTotal = 0;
  if (isCrossCurrency) {
    crossBlocks.forEach(b => {
      crossEqTotal += parseFloat(b.eq) || 0;
    });
  }

  const remainderToDistribute = Number((targetTotal - crossEqTotal).toFixed(2));
  const cashRemainder = Number((remainderToDistribute - distributedExcludeCash).toFixed(2));

  let paidSum = 0;
  Object.keys(bankSplits).forEach(acc => {
    paidSum += bankSplits[acc] || 0;
  });
  offsetSplits.forEach(o => {
    paidSum += o.sum || 0;
  });

  const overallRemainder = Number((targetTotal - paidSum - (isCrossCurrency ? crossEqTotal : 0)).toFixed(2));
  const crossRemainder = crossBaseSumOverride !== "" 
    ? Number((parseFloat(crossBaseSumOverride) - crossEqTotal).toFixed(2)) 
    : overallRemainder;

  const unpaidPart = Math.max(0, overallRemainder);

  // Auto-fill cash remainder if not custom cash and not discount
  useEffect(() => {
    if (!isDiscount && !isCustomCash) {
      setBankSplits(prev => ({
        ...prev,
        "Готівка": cashRemainder > 0 ? cashRemainder : 0
      }));
    }
  }, [cashRemainder, isDiscount, isCustomCash]);

  const isIncomeOp = operation.includes("Прибуток") || operation.includes("Повернули") || operation.includes("Прихід") || operation.includes("(+)");

  const getAccountBalance = React.useCallback((bankKey: string): number => {
    if (!initData) return 0;
    const curr = currentCurrency || "UAH";
    const banksForCurr = initData.allBankDetails?.[curr];
    if (banksForCurr && banksForCurr[bankKey] !== undefined) {
      return Number(banksForCurr[bankKey]) || 0;
    }
    if (curr === (initData.currency || "UAH") && initData.capital?.banks?.[bankKey] !== undefined) {
      return Number(initData.capital.banks[bankKey]) || 0;
    }
    return 0;
  }, [initData, currentCurrency]);

  const aliases = React.useMemo(() => {
    return initData?.allAliases[currentCurrency as "UAH" | "USD" | "EUR"] || {};
  }, [initData, currentCurrency]);

  const activeSplitsSummary = React.useMemo(() => {
    const list: string[] = [];
    Object.keys(bankSplits).forEach(acc => {
      const val = bankSplits[acc] || 0;
      if (val > 0) {
        const name = aliases[acc] || acc;
        const bal = getAccountBalance(acc);
        list.push(`${name}: ${val.toFixed(2)} (зал. ${bal.toFixed(2)})`);
      }
    });
    offsetSplits.forEach(o => {
      if (o.sum > 0) {
        list.push(`👤 ${o.name}: ${Number(o.sum).toFixed(2)}`);
      }
    });
    if (isCrossCurrency) {
      crossBlocks.forEach(b => {
        const s = parseFloat(b.sum) || 0;
        const eq = parseFloat(b.eq) || 0;
        if (s > 0) {
          list.push(`💱 ${b.curr}: ${s.toFixed(2)} (${eq.toFixed(2)} ${currentCurrency})`);
        }
      });
    }
    if (unpaidPart > 0.01) {
      list.push(`⏳ В борг: ${unpaidPart.toFixed(2)}`);
    }
    return list.join(" • ");
  }, [bankSplits, offsetSplits, unpaidPart, aliases, getAccountBalance, isCrossCurrency, crossBlocks, currentCurrency]);

  const contractorBalanceInfo = React.useMemo(() => {
    if (!contractor || !contractor.trim() || !initData) return null;
    const cName = contractor.trim().toLowerCase();
    const curr = currentCurrency || "UAH";
    const debtors = initData.allDebtorsDetails?.[curr] || initData.debtors;
    if (!debtors) return null;
    
    const oweUsItem = debtors.oweUs?.find(i => i.name.trim().toLowerCase() === cName);
    if (oweUsItem && oweUsItem.sum > 0.01) {
      return { type: "oweUs", sum: oweUsItem.sum, label: "Винен нам" };
    }
    const weOweItem = debtors.weOwe?.find(i => i.name.trim().toLowerCase() === cName);
    if (weOweItem && weOweItem.sum > 0.01) {
      return { type: "weOwe", sum: weOweItem.sum, label: "Ми винні" };
    }
    const settledItem = debtors.settled?.find(i => i.name.trim().toLowerCase() === cName);
    if (settledItem) {
      return { type: "settled", sum: 0, label: "Розраховано (боргу немає)" };
    }
    return null;
  }, [contractor, initData, currentCurrency]);

  const updateCrossBlockMath = (index: number, field: "sum" | "rate" | "eq", val: string) => {
    const updated = [...crossBlocks];
    const b = { ...updated[index] };
    if (field === "sum") {
      b.sum = val;
      b.lastEdited = "sum";
    } else if (field === "rate") {
      b.rate = val;
    } else if (field === "eq") {
      b.eq = val;
      b.lastEdited = "eq";
    }

    const s = parseFloat(b.sum) || 0;
    const r = parseFloat(b.rate) || 0;
    const eq = parseFloat(b.eq) || 0;

    const fC = b.curr;
    const tC = currentCurrency;

    if (fC === tC) {
      b.rate = "1";
      if (field === "sum") {
        b.eq = b.sum;
      } else {
        b.sum = b.eq;
      }
    } else {
      const isFromSoft = getRank(fC) < getRank(tC);
      if (field === "sum") {
        if (r > 0 && s > 0) {
          b.eq = (isFromSoft ? (s / r) : (s * r)).toFixed(2);
        }
      } else if (field === "rate") {
        const lastEdited = b.lastEdited || "eq";
        if (lastEdited === "sum" && s > 0) {
          if (r > 0) {
            b.eq = (isFromSoft ? (s / r) : (s * r)).toFixed(2);
          }
        } else if (eq > 0) {
          if (r > 0) {
            b.sum = (isFromSoft ? (eq * r) : (eq / r)).toFixed(2);
          }
        } else if (s > 0) {
          if (r > 0) {
            b.eq = (isFromSoft ? (s / r) : (s * r)).toFixed(2);
          }
        }
      } else if (field === "eq") {
        if (r > 0 && eq > 0) {
          b.sum = (isFromSoft ? (eq * r) : (eq / r)).toFixed(2);
        }
      }
    }
    updated[index] = b;
    setCrossBlocksWithBalance(updated, index);
  };

  const handleFetchFormRate = async (index: number, mode: "kantor" | "cross") => {
    const b = crossBlocks[index];
    if (b.curr === currentCurrency) {
      alert("⚠️ Виберіть різні валюти!");
      return;
    }
    try {
      const res = await fetch(`/api/rates?source=${crossRateSource}`);
      const rates = await res.json();
      if (rates && !rates.error) {
        const fC = b.curr;
        const tC = currentCurrency;
        const rateVal = getConventionalRate(fC, tC, rates, isIncome, mode);
        
        const formattedRate = (fC === "UAH" || tC === "UAH") ? rateVal.toFixed(2) : rateVal.toFixed(4);
        
        const updated = [...crossBlocks];
        updated[index] = {
          ...b,
          rate: formattedRate
        };
        // Recalculate sum/equivalent based on prioritization of eq or user manually editing sum
        const s = parseFloat(b.sum) || 0;
        const eqVal = parseFloat(b.eq) || 0;
        const isFromSoft = getRank(fC) < getRank(tC);
        const lastEdited = b.lastEdited || "eq";
        
        if (lastEdited === "sum" && s > 0) {
          updated[index].eq = (isFromSoft ? (s / rateVal) : (s * rateVal)).toFixed(2);
        } else if (eqVal > 0) {
          updated[index].sum = (isFromSoft ? (eqVal * rateVal) : (eqVal / rateVal)).toFixed(2);
        } else if (s > 0) {
          updated[index].eq = (isFromSoft ? (s / rateVal) : (s * rateVal)).toFixed(2);
        }
        setCrossBlocksWithBalance(updated, index);
      }
    } catch (err) {
      alert("Помилка завантаження курсів з сервера.");
    }
  };

  const getHypotheticalRecalculation = (index: number) => {
    if (crossBlocks.length === 0) return null;
    const b = crossBlocks[index];
    if (!b) return null;
    const sumVal = parseFloat(b.sum) || 0;
    if (sumVal <= 0) return null;

    const fC = b.curr;
    const tC = currentCurrency;
    if (fC === tC) return null;

    const currentEq = parseFloat(b.eq) || 0;
    const targetEqForBlock = Number((currentEq + crossRemainder).toFixed(2));
    if (targetEqForBlock <= 0) return null;

    const isFromSoft = getRank(fC) < getRank(tC);
    const newRate = isFromSoft ? (sumVal / targetEqForBlock) : (targetEqForBlock / sumVal);
    const decimals = (fC === "UAH" || tC === "UAH") ? 2 : 4;
    
    return {
      oldRate: parseFloat(b.rate) || 0,
      newRate: Number(newRate.toFixed(decimals)),
      fC,
      tC,
      isFromSoft,
      targetEq: targetEqForBlock
    };
  };

  const handleApproveDiscrepancyForBlock = (index: number) => {
    if (crossBlocks.length === 0) return;
    const recalc = getHypotheticalRecalculation(index);
    if (!recalc) {
      alert("⚠️ Неможливо автоматично перерахувати курс для цієї валюти.");
      return;
    }

    const updated = [...crossBlocks];
    const b = { ...updated[index] };
    b.rate = String(recalc.newRate);
    b.eq = recalc.targetEq.toFixed(2);

    updated[index] = b;
    setCrossBlocks(updated);
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const resultStr = reader.result as string;
      const base64 = resultStr.split(",")[1];
      setReceipt({
        base64: base64,
        mimeType: file.type,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFormSubmit = () => {
    setAttemptedSubmit(true);
    if (!totalSum) { alert("⚠️ Введіть Суму!"); return; }
    if (!comment) { alert("⚠️ Введіть коментар!"); return; }
    if ((operation.includes("борг") || isDiscount) && !contractor) {
      alert("⚠️ Вкажіть Продавця/Контрагента!");
      return;
    }
    if (isDiscountSomeone && !contractor2) {
      alert("⚠️ Вкажіть Клієнта!");
      return;
    }

    if (isCrossCurrency && crossRemainder !== 0) {
      const isOver = crossRemainder < 0;
      const word = isOver ? "переплачено/отримано більше" : "недоплачено/отримано менше";
      const confirmApprove = confirm(
        `⚠️ Є розбіжність у сумах: фактично ${word} на ${Math.abs(crossRemainder).toFixed(2)} ${currentCurrency}.\n\nБажаєте ОДОБРИТИ фактично внесену суму та автоматично скоригувати курс обміну?`
      );
      if (confirmApprove) {
        // Approve by adjusting the first available foreign block with sum
        const targetIdx = crossBlocks.findIndex(b => b.curr !== currentCurrency && (parseFloat(b.sum) || 0) > 0);
        const blockIdx = targetIdx !== -1 ? targetIdx : (crossBlocks.findIndex(b => (parseFloat(b.sum) || 0) > 0) !== -1 ? crossBlocks.findIndex(b => (parseFloat(b.sum) || 0) > 0) : 0);
        handleApproveDiscrepancyForBlock(blockIdx);
        return; // Return so they can review the new rate and click save again
      } else {
        return;
      }
    }

    const finalComment = category ? `[${category}] ${comment}` : comment;

    const data: any = {
      operation,
      total_sum: targetTotal,
      contractor: contractor,
      comment: finalComment,
      splits: [],
      receipt
    };

    if (prefilledPlanned?.isInterestFulfillment) {
      data.isInterestFulfillment = true;
      data.interestFulfillmentPeriod = prefilledPlanned.interestFulfillmentPeriod;
      data.interestFulfillmentBaseSum = prefilledPlanned.interestFulfillmentBaseSum;
      data.interestFulfillmentRate = prefilledPlanned.interestFulfillmentRate;
      data.interestFulfillmentUpToDate = prefilledPlanned.interestFulfillmentUpToDate;
      data.interestFulfillmentCalculatedAccrued = prefilledPlanned.interestFulfillmentCalculatedAccrued;
      data.interestPrincipalAction = prefilledPlanned.interestPrincipalAction;
      data.interestPrincipalWithdrawSum = prefilledPlanned.interestPrincipalWithdrawSum;
      data.plannedType = prefilledPlanned.type;
      data.currency = currentCurrency;
    }

    if (operation.includes("борг") && createPlannedInterest) {
      data.createPlannedInterest = true;
      data.plannedInterestMode = plannedInterestMode;
      data.plannedInterestRate = parseFloat(plannedInterestRate) || 0;
      data.plannedInterestPeriod = plannedInterestPeriod;
      data.plannedInterestStartDate = plannedInterestStartDate;
      data.plannedInterestDueDate = plannedInterestDueDate;
    }

    if (isDiscountSomeone) {
      data.contractor2 = contractor2;
      data.contractor2_sum = clientGetsDiscount ? targetTotal : rawSum;
    }

    if (isCrossCurrency) {
      data.crossMulti = crossBlocks.filter(b => parseFloat(b.sum) > 0 && parseFloat(b.eq) > 0);
    }

    Object.keys(bankSplits).forEach(acc => {
      const val = bankSplits[acc];
      if (val > 0) {
        data.splits.push({ acc, sum: val, text: "" });
      }
    });

    offsetSplits.forEach(o => {
      data.splits.push({ acc: "Контрагент", sum: o.sum, text: o.name });
    });

    // Auto-record unpaid remainder as debt to the seller (contractor)
    let totalBaseDistributedSubmit = 0;
    Object.keys(bankSplits).forEach(acc => {
      totalBaseDistributedSubmit += bankSplits[acc] || 0;
    });
    offsetSplits.forEach(o => {
      totalBaseDistributedSubmit += o.sum || 0;
    });
    const effectiveCrossEqSubmit = isCrossCurrency 
      ? crossBlocks.reduce((acc, b) => acc + (parseFloat(b.eq) || 0), 0) 
      : 0;
    const unpaidPartSubmit = Math.max(0, Number((targetTotal - totalBaseDistributedSubmit - effectiveCrossEqSubmit).toFixed(2)));
    if (unpaidPartSubmit > 0.01) {
      data.splits.push({ acc: "НеоплаченийБорг", sum: unpaidPartSubmit, text: contractor });
    }

    // Check budget limits for Gothivka (cash)
    const pureCashSpent = bankSplits["Готівка"] || 0;
    if (!isIncome && pureCashSpent > (initData?.allCashBalances[currentCurrency as "UAH" | "USD" | "EUR"] || 0) + 0.01) {
      alert(`⚠️ Недостатньо коштів на Готівці (${currentCurrency})! Доступно: ${initData?.allCashBalances[currentCurrency as "UAH" | "USD" | "EUR"]}`);
      return;
    }

    onSubmit(data);
  };

  return (
    <div className="flex flex-col gap-4 text-left">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <Coins className={`w-5 h-5 ${isIncome ? "text-emerald-400" : "text-red-400"}`} />
          {operation.replace(" (Прихід)", "").replace(" (Витрата)", "")}
        </h2>
        <span className="text-[10px] uppercase font-bold tracking-wider px-3 py-1 bg-slate-800 rounded-full text-slate-400">
          Форма
        </span>
      </div>

      {/* === Голосове введення (Web Speech API) === */}
      <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className={`p-2.5 rounded-xl transition-all ${
              isListening
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse"
                : "bg-sky-500/10 text-sky-400 border border-sky-500/20"
            }`}>
              <Mic className={`w-5 h-5 ${isListening ? "animate-bounce text-rose-400" : "text-sky-400"}`} />
            </div>
            <div>
              <div className="text-xs font-black text-slate-100 flex items-center gap-1.5">
                <span>Голосовий помічник</span>
                <span className="text-[9px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                  Web Speech API
                </span>
              </div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                Продиктуйте суму, категорію або коментар (наприклад: <span className="text-amber-300 font-bold">«1500 гривень продукти»</span>)
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={isListening ? stopVoiceInput : startVoiceInput}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shadow-md ${
              isListening
                ? "bg-rose-600 hover:bg-rose-500 text-white animate-pulse shadow-rose-900/50"
                : "bg-sky-500 hover:bg-sky-400 text-slate-950 font-black shadow-sky-900/30"
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-4 h-4" />
                <span>Зупинити</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span>Диктувати</span>
              </>
            )}
          </button>
        </div>

        {/* Live Listening Status & Realtime Transcript */}
        {isListening && (
          <div className="p-2.5 rounded-xl bg-slate-950 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2 animate-pulse shadow-inner">
            <Volume2 className="w-4 h-4 text-rose-400 shrink-0 animate-bounce" />
            <div className="flex-1 truncate">
              <span className="font-bold text-rose-200">Слухаю: </span>
              <span className="font-mono text-white italic">{voiceTranscript || "Говоріть суму та призначення..."}</span>
            </div>
          </div>
        )}

        {/* Voice Feedback Message */}
        {voiceFeedback && !isListening && (
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-xs text-emerald-200 space-y-2 animate-fadeIn shadow-lg relative">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-black text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{voiceFeedback.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setVoiceFeedback(null)}
                className="text-emerald-400 hover:text-white p-1 rounded-md hover:bg-emerald-900/50 transition-colors"
                title="Закрити сповіщення"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {voiceFeedback.fields && voiceFeedback.fields.length > 0 && (
              <div className="space-y-1.5 pt-1.5 border-t border-emerald-500/25">
                <div className="text-[10px] uppercase font-black text-emerald-400 tracking-wider">
                  ✨ Розподілено по комірках:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {voiceFeedback.fields.map((f, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-900/60 border border-emerald-500/30 text-emerald-100 font-bold text-[11px]"
                    >
                      <span>{f.icon}</span>
                      <span className="text-emerald-300/80 font-medium">{f.label}:</span>
                      <span className="text-white font-black">{f.value}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {voiceFeedback.details && !voiceFeedback.fields && (
              <div className="text-[11px] text-emerald-300/90 font-medium pl-6">
                Заповнено ➔ {voiceFeedback.details}
              </div>
            )}
          </div>
        )}

        {/* Voice Error Message */}
        {voiceError && !isListening && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 space-y-2 animate-fadeIn shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-rose-300">{voiceError}</span>
              <button
                type="button"
                onClick={() => setVoiceError(null)}
                className="text-rose-400 hover:text-white p-1 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {voiceError.includes("відхилено") && (
              <div className="pt-2 border-t border-rose-500/30 text-[11px] text-slate-300 space-y-2">
                <p className="font-medium text-amber-200">
                  💡 Як увімкнути мікрофон:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 pl-1">
                  <li>Натисніть на значок 🔒 <b>Замок / Налаштування</b> у значку адресної стрічки браузера.</li>
                  <li>Знайдіть пункт <b>Мікрофон (Microphone)</b> та переключіть у стан <b>«Дозволити» (Allow)</b>.</li>
                  <li>Якщо ви переглядаєте застосунок у вбудованому кадрі (iframe), відкрийте його у окремому вікні.</li>
                </ol>

                <div className="pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.open(window.location.href, "_blank")}
                    className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-black flex items-center gap-1.5 transition-all cursor-pointer text-[11px]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Відкрити в новій вкладці</span>
                  </button>
                  <button
                    type="button"
                    onClick={startVoiceInput}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-200 font-bold flex items-center gap-1.5 transition-all cursor-pointer text-[11px] border border-rose-500/30"
                  >
                    <Mic className="w-3.5 h-3.5 text-rose-400" />
                    <span>Спробувати знову</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Voice Command Cheat Sheet Toggle */}
        <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowVoiceHelp(!showVoiceHelp)}
            className="text-[11px] font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1.5 transition-all cursor-pointer py-0.5"
          >
            <span>💡 {showVoiceHelp ? "Сховати довідку" : "Усі голосові команди та підказки"}</span>
          </button>
          <span className="text-[10px] text-slate-500">Авто-розпізнавання Web Speech</span>
        </div>

        {/* Voice Command Cheat Sheet Drawer */}
        {showVoiceHelp && (
          <div className="p-3 rounded-xl bg-slate-950 border border-sky-500/30 text-xs space-y-3 animate-fadeIn text-slate-200 shadow-inner">
            <div className="font-extrabold text-sky-300 text-xs flex items-center gap-1.5 border-b border-sky-500/20 pb-1.5">
              <span>🎤 Інструкція та шпаргалка з голосового керування:</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
              {/* Box 1: New Contractor */}
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-bold text-amber-300 flex items-center gap-1">
                  <span>👤 Нові та існуючі контрагенти</span>
                </div>
                <p className="text-slate-400 text-[10.5px]">Скажіть ім'я або назву компанії після слів:</p>
                <div className="font-mono text-emerald-300 text-[10px]">
                  «контрагент...», «боржник...», «новий контрагент...», «для...», «від...», «клієнт...», «фірма...», «ТОВ...»
                </div>
                <div className="text-[10px] text-slate-300 italic pt-0.5">
                  Приклад: <span className="text-white font-semibold">«боржник Петро»</span> чи <span className="text-white font-semibold">«контрагент Петро»</span> ➔ запише тільки <b className="text-emerald-300">«Петро»</b>
                </div>
              </div>

              {/* Box 2: Operations & Tabs */}
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-bold text-sky-300 flex items-center gap-1">
                  <span>🔄 Вкладки та тип операції</span>
                </div>
                <p className="text-slate-400 text-[10.5px]">Автоматично перемикає форму:</p>
                <ul className="text-[10px] text-slate-300 space-y-0.5">
                  <li>• <span className="text-emerald-400 font-bold">Прибуток:</span> «прибуток...», «дохід...», «зарплата...»</li>
                  <li>• <span className="text-rose-400 font-bold">Витрата:</span> «витрата...», «покупка...», «купив...»</li>
                  <li>• <span className="text-amber-400 font-bold">Борг:</span> «повернули борг...», «повертаю борг...»</li>
                </ul>
              </div>

              {/* Box 3: Currency */}
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-bold text-emerald-300 flex items-center gap-1">
                  <span>💱 Авто-перемикання валюти</span>
                </div>
                <p className="text-slate-400 text-[10.5px]">Визначить та переключить валюту:</p>
                <div className="text-[10px] text-slate-300 space-y-0.5">
                  <div>🇺🇦 <span className="text-white font-semibold">«гривень / грн»</span> ➔ UAH</div>
                  <div>🇺🇸 <span className="text-white font-semibold">«доларів / дол»</span> ➔ USD</div>
                  <div>🇪🇺 <span className="text-white font-semibold">«євро»</span> ➔ EUR</div>
                </div>
              </div>

              {/* Box 4: Multi-Bank Splits */}
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                <div className="font-bold text-purple-300 flex items-center gap-1">
                  <span>🥞 Розподіл між банками</span>
                </div>
                <p className="text-slate-400 text-[10.5px]">Розбиває суму по рахунках:</p>
                <div className="font-mono text-purple-200 text-[10px] italic">
                  «600 з монобанку і 400 готівкою»
                </div>
                <p className="text-[10px] text-slate-400">Автоматично заповнить комірки кількох рахунків!</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* === Обов'язкові поля === */}
      
      {/* 4. Total Sum Input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-400 text-center flex flex-col items-center justify-center gap-1.5">
          <span className="flex items-center gap-1.5 text-amber-400 font-bold">
            💰 Загальна Сума <span className="text-red-500 font-extrabold">*</span> 
            <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider">
              обов'язково
            </span>
          </span>
          <span className="text-white font-bold bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 flex items-center gap-1 text-[11px]">
            {CURRENCY_INFOS[currentCurrency]?.flag || ""} {currentCurrency} ({CURRENCY_INFOS[currentCurrency]?.symbol || ""})
          </span>
        </label>
        <div className="relative flex items-center">
          <input
            type="number"
            value={totalSum}
            onChange={(e) => setTotalSum(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className={`w-full bg-slate-800 border-2 ${
              attemptedSubmit && !totalSum
                ? "border-red-500 bg-red-950/15 focus:border-red-500 focus:ring-2 focus:ring-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.25)]"
                : !totalSum
                  ? "border-amber-500/50 bg-amber-500/5 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                  : "border-emerald-500/40 bg-emerald-500/5 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.08)]"
            } p-4 pr-12 rounded-xl text-white text-3xl font-extrabold text-center outline-none transition-all placeholder-slate-600`}
          />
          <button
            type="button"
            onClick={isListening ? stopVoiceInput : startVoiceInput}
            title="Продиктувати суму та коментар"
            className={`absolute right-3 p-2.5 rounded-xl transition-all cursor-pointer ${
              isListening
                ? "bg-rose-500 text-white animate-pulse"
                : "bg-slate-700/80 hover:bg-sky-500 text-slate-300 hover:text-slate-950"
            }`}
          >
            <Mic className="w-5 h-5" />
          </button>
        </div>
        {attemptedSubmit && !totalSum && (
          <span className="text-[10px] text-red-400 font-bold text-center animate-fadeIn">⚠️ Будь ласка, вкажіть суму!</span>
        )}
      </div>

      {/* 2. Contractor Autocomplete (Moved higher, right under the Sum) */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
          <span className="font-bold flex items-center gap-1">
            {isDiscountSomeone
              ? "👤 Продавець"
              : isDiscount || operation === "Покупка"
              ? "👤 В кого купляємо"
              : operation === "Прибуток"
              ? "👤 Хто дав заробити"
              : "👤/🏢 Контрагент"}
            {(operation.includes("борг") || isDiscount) && <span className="text-red-500 font-extrabold ml-1">*</span>}
          </span>
          {(operation.includes("борг") || isDiscount) && (
            <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider">
              обов'язково
            </span>
          )}
        </label>
        <AutocompleteInput
          value={contractor}
          onChange={setContractor}
          suggestions={initData?.names || []}
          placeholder="Введіть ім'я..."
          required={operation.includes("борг") || isDiscount}
          error={attemptedSubmit && (operation.includes("борг") || isDiscount) && !contractor.trim()}
        />
        {contractorBalanceInfo && (
          <div className="flex flex-wrap items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800 text-xs mt-1 animate-fadeIn gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Баланс контрагента:</span>
              <span className={`font-black font-mono ${
                contractorBalanceInfo.type === "oweUs" ? "text-emerald-400" :
                contractorBalanceInfo.type === "weOwe" ? "text-rose-400" :
                "text-slate-400"
              }`}>
                {contractorBalanceInfo.type === "oweUs" ? `+${contractorBalanceInfo.sum.toFixed(2)}` :
                 contractorBalanceInfo.type === "weOwe" ? `-${contractorBalanceInfo.sum.toFixed(2)}` : "0.00"}{" "}
                {getCurrencySymbol(currentCurrency)} ({contractorBalanceInfo.label})
              </span>
            </div>
            {contractorBalanceInfo.sum > 0 && !totalSum && (
              <button
                type="button"
                onClick={() => setTotalSum(contractorBalanceInfo.sum.toFixed(2))}
                className="px-2 py-0.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-bold text-[10px] rounded-lg border border-sky-500/30 transition-all cursor-pointer active:scale-95"
                title="Підставити суму боргу в поле"
              >
                Вставити {contractorBalanceInfo.sum.toFixed(2)}
              </button>
            )}
          </div>
        )}
        {attemptedSubmit && (operation.includes("борг") || isDiscount) && !contractor.trim() && (
          <span className="text-[10px] text-red-400 font-bold animate-fadeIn">⚠️ Будь ласка, вкажіть контрагента!</span>
        )}
      </div>

      {/* 8. Comment Field (Moved below the Contractor) */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1 font-bold">
            📝 Коментар <span className="text-red-500 font-extrabold">*</span>
          </span>
          <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider">
            обов'язково
          </span>
        </label>
        <div className="relative flex items-center">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Деталі операції..."
            required
            className={`bg-slate-800 border-2 ${
              attemptedSubmit && !comment.trim()
                ? "border-red-500 bg-red-950/15 focus:border-red-500 focus:ring-2 focus:ring-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.25)]"
                : !comment.trim()
                  ? "border-amber-500 bg-amber-500/5 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                  : "border-emerald-500/40 bg-emerald-500/5 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.08)]"
            } p-3.5 pr-11 rounded-xl text-white outline-none w-full text-base transition-all`}
          />
          <button
            type="button"
            onClick={isListening ? stopVoiceInput : startCommentOnlyVoiceInput}
            title="Надиктувати тільки коментар 🎙️"
            className={`absolute right-2 p-2 rounded-lg transition-all cursor-pointer ${
              isListening
                ? "bg-rose-500 text-white animate-pulse"
                : "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 hover:scale-105"
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>
        {attemptedSubmit && !comment.trim() && (
          <span className="text-[10px] text-red-400 font-bold animate-fadeIn">⚠️ Будь ласка, введіть коментар до операції!</span>
        )}
      </div>

      {/* 3. Contractor 2 for Client in Discount Someone */}
      {isDiscountSomeone && (
        <div className="flex flex-col gap-2.5 bg-black border-2 border-violet-500 p-5 rounded-2xl shadow-xl shadow-violet-500/15 animate-fadeIn">
          <label className="text-xs font-black uppercase tracking-wider text-violet-400 flex items-center justify-between">
            <span>👤 Клієнт (Хто буде винен нам) <span className="text-red-500 font-extrabold">*</span></span>
            <span className="text-[9px] bg-violet-500/20 text-violet-300 border border-violet-500/30 px-2 py-0.5 rounded-lg font-black uppercase tracking-wider">
              обов'язково
            </span>
          </label>
          <AutocompleteInput
            value={contractor2}
            onChange={setContractor2}
            suggestions={initData?.names || []}
            placeholder="Ім'я клієнта..."
            className="border-violet-500/50 focus:border-violet-400"
            required={true}
            error={attemptedSubmit && !contractor2.trim()}
          />
          {attemptedSubmit && !contractor2.trim() && (
            <span className="text-[10px] text-red-400 font-bold animate-fadeIn">⚠️ Будь ласка, вкажіть клієнта!</span>
          )}
        </div>
      )}

      {/* === Додаткові параметри (Опціонально) === */}
      <div className="border-t border-slate-800/60 my-2 pt-4">
        <span className="text-[11px] uppercase font-black tracking-wider text-slate-500 flex items-center gap-1.5">
          ⚙️ Додаткові деталі (опціонально)
        </span>
      </div>

      {/* 1. Category selector */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-xs font-semibold text-slate-400">
          <span>🗂️ Стаття (Для звіту)</span>
          <button
            onClick={onNavigateToCategories}
            className="text-sky-400 flex items-center gap-1 cursor-pointer hover:underline text-[11px]"
          >
            <Settings className="w-3.5 h-3.5" /> Налаштувати
          </button>
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-slate-800 border-2 border-slate-700 p-3.5 rounded-xl text-white outline-none w-full text-base focus:border-sky-400 transition-all cursor-pointer"
        >
          <option value="">-- Без статті (Загальне) --</option>
          {initData?.categories.map((cat, idx) => (
            <option key={idx} value={cat}>
              📁 {cat}
            </option>
          ))}
        </select>
      </div>

      {/* 5. Discount for Discount options */}
      {isDiscount && (
        <div className="flex flex-col gap-3 bg-black border-2 border-red-500 p-5 rounded-2xl shadow-xl shadow-red-500/15 animate-fadeIn">
          <label className="text-xs font-black uppercase tracking-wider text-red-400">📉 Знижка (%)</label>
          <input
            type="number"
            value={discountPercent}
            onChange={(e) => setDiscountSum(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="bg-slate-900 border-2 border-red-500 p-3.5 rounded-xl text-white outline-none w-full text-base font-bold transition-all focus:ring-2 focus:ring-red-500/30"
          />
          {rawSum > 0 && (
            <div className="text-center font-bold text-slate-100 text-sm mt-1">
              Сума зі знижкою:{" "}
              <span className="text-red-400 font-black text-base">{targetTotal.toFixed(2)}</span>{" "}
              {getCurrencySymbol(currentCurrency)}
            </div>
          )}
        </div>
      )}

      {/* 6. Discount Split Toggle for Client Gets Discount */}
      {isDiscountSomeone && rawSum > 0 && (
        <div className="flex flex-col gap-3 bg-black border-2 border-violet-500 p-5 rounded-2xl shadow-xl shadow-violet-500/15 animate-fadeIn">
          <label className="text-xs font-black uppercase tracking-wider text-violet-400 text-center leading-relaxed">
            Яку суму пишемо в борг клієнту?
          </label>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <button
              type="button"
              onClick={() => setClientGetsDiscount(true)}
              className={`p-3.5 rounded-xl font-bold text-xs uppercase transition-all ${
                clientGetsDiscount
                  ? "bg-violet-600 text-white border-2 border-violet-400 shadow-md shadow-violet-600/20"
                  : "bg-slate-900 text-slate-400 border-2 border-slate-800"
              }`}
            >
              Зі знижкою
              <div className="text-sm font-black mt-1">
                {clientDiscountSum.toFixed(2)} {getCurrencySymbol(currentCurrency)}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setClientGetsDiscount(false)}
              className={`p-3.5 rounded-xl font-bold text-xs uppercase transition-all ${
                !clientGetsDiscount
                  ? "bg-violet-600 text-white border-2 border-violet-400 shadow-md shadow-violet-600/20"
                  : "bg-slate-900 text-slate-400 border-2 border-slate-800"
              }`}
            >
              Без знижки
              <div className="text-sm font-black mt-1">
                {clientFullSum.toFixed(2)} {getCurrencySymbol(currentCurrency)}
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Payment account splits area */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowSplits(!showSplits)}
          className="flex items-center justify-between w-full p-3.5 bg-slate-900 border border-slate-800 hover:bg-slate-800/80 rounded-2xl text-sm font-bold text-sky-400 transition-all active:scale-95"
        >
          <div className="flex flex-col items-start gap-0.5 text-left min-w-0 flex-1 mr-2">
            <span className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Рахунок оплати / Розподіл (у {currentCurrency})</span>
            </span>
            {activeSplitsSummary ? (
              <span className="text-[11px] font-semibold text-slate-300 truncate w-full">
                {activeSplitsSummary}
              </span>
            ) : (
              <span className="text-[11px] font-medium text-slate-500">
                Натисніть для вибору рахунку або розподілу
              </span>
            )}
          </div>
          {showSplits ? <ChevronUp className="w-4 h-4 shrink-0 text-slate-400" /> : <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />}
        </button>

        {showSplits && (
          <div className="bg-black border-2 border-amber-500 p-4.5 rounded-2xl flex flex-col gap-4 shadow-lg shadow-amber-500/10 animate-fadeIn">
            <p className="text-center text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-center gap-1.5">
              <span>🏦 Рахунки та залишки ({currentCurrency})</span>
            </p>

            <div className="grid grid-cols-3 gap-2.5">
              {(() => {
                const sVal = bankSplits["Готівка"] || 0;
                const curBal = getAccountBalance("Готівка");
                const projectedBal = isIncomeOp ? curBal + sVal : curBal - sVal;
                const isOverdraft = !isIncomeOp && sVal > 0 && projectedBal < -0.01;
                const isSelected = sVal > 0;
                const sym = getCurrencySymbol(currentCurrency);

                return (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModalBank("Готівка");
                      const curCash = bankSplits["Готівка"];
                      setModalSum(curCash > 0 ? String(curCash) : (cashRemainder > 0 ? String(cashRemainder) : ""));
                      setModalType("bank");
                    }}
                    className={`p-2.5 rounded-xl border-2 text-center transition-all relative flex flex-col justify-between min-h-[78px] cursor-pointer group active:scale-95 ${
                      isOverdraft
                        ? "bg-red-500/15 border-red-500 text-red-300 shadow-md shadow-red-500/10"
                        : isSelected
                        ? "bg-sky-500/15 border-sky-400 text-sky-400 font-black shadow-md shadow-sky-500/10"
                        : cashRemainder < -0.01
                        ? "bg-red-500/15 border-red-500 text-red-500 font-black"
                        : "bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400"
                    }`}
                    title={`Поточний залишок: ${curBal.toFixed(2)} ${sym}`}
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <span className="text-xs truncate font-bold group-hover:text-white transition-colors">{aliases["Готівка"] || "Готівка"}</span>
                      {isCustomCash && <span className="text-[10px] text-amber-400 font-black shrink-0" title="Введено вручну">✏️</span>}
                    </div>

                    <div className="my-0.5">
                      {isSelected ? (
                        <div className="text-sm font-black tracking-tight text-white font-mono">
                          {!isDiscount && cashRemainder < -0.01 ? "⚠️ " : ""}
                          {sVal.toFixed(2)} {sym}
                        </div>
                      ) : (
                        <div className={`text-xs font-bold font-mono ${curBal < 0 ? "text-rose-400" : curBal > 0 ? "text-slate-300" : "text-slate-500"}`}>
                          {curBal.toFixed(2)} {sym}
                        </div>
                      )}
                    </div>

                    <div className="w-full pt-1 border-t border-white/5 flex items-center justify-center text-[10px] font-semibold truncate leading-none">
                      {isSelected ? (
                        <span className={isOverdraft ? "text-rose-400 font-black" : "text-slate-400"}>
                          {isOverdraft ? "⚠️ Буде: " : "Буде: "}{projectedBal.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-500 group-hover:text-slate-400">
                          Залишок
                        </span>
                      )}
                    </div>
                  </button>
                );
              })()}

              {["Банк 1", "Банк 2", "Банк 3", "Банк 4", "Банк 5"].map((bankName, idx) => {
                const sVal = bankSplits[bankName] || 0;
                const curBal = getAccountBalance(bankName);
                const projectedBal = isIncomeOp ? curBal + sVal : curBal - sVal;
                const isOverdraft = !isIncomeOp && sVal > 0 && projectedBal < -0.01;
                const isSelected = sVal > 0;
                const sym = getCurrencySymbol(currentCurrency);

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setActiveModalBank(bankName);
                      setModalSum(sVal > 0 ? String(sVal) : (cashRemainder > 0 ? String(cashRemainder) : ""));
                      setModalType("bank");
                    }}
                    className={`p-2.5 rounded-xl border-2 text-center transition-all relative flex flex-col justify-between min-h-[78px] cursor-pointer group active:scale-95 ${
                      isOverdraft
                        ? "bg-red-500/15 border-red-500 text-red-300 shadow-md shadow-red-500/10"
                        : isSelected
                        ? "bg-sky-500/15 border-sky-400 text-sky-400 font-bold shadow-md shadow-sky-500/10"
                        : "bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-400"
                    }`}
                    title={`Поточний залишок: ${curBal.toFixed(2)} ${sym}`}
                  >
                    <div className="flex items-center justify-between w-full gap-1">
                      <span className="text-xs truncate font-bold group-hover:text-white transition-colors">{aliases[bankName] || bankName}</span>
                    </div>

                    <div className="my-0.5">
                      {isSelected ? (
                        <div className="text-sm font-black tracking-tight text-white font-mono">
                          {sVal.toFixed(2)} {sym}
                        </div>
                      ) : (
                        <div className={`text-xs font-bold font-mono ${curBal < 0 ? "text-rose-400" : curBal > 0 ? "text-slate-300" : "text-slate-500"}`}>
                          {curBal.toFixed(2)} {sym}
                        </div>
                      )}
                    </div>

                    <div className="w-full pt-1 border-t border-white/5 flex items-center justify-center text-[10px] font-semibold truncate leading-none">
                      {isSelected ? (
                        <span className={isOverdraft ? "text-rose-400 font-black" : "text-slate-400"}>
                          {isOverdraft ? "⚠️ Буде: " : "Буде: "}{projectedBal.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-500 group-hover:text-slate-400">
                          Залишок
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {offsetSplits.map((off, idx) => (
                <div
                  key={`offset-${idx}`}
                  onClick={() => {
                    setEditingOffsetIndex(idx);
                    setModalOffsetName(off.name);
                    setModalSum(String(off.sum));
                    setModalType("offset");
                  }}
                  className="relative p-3 rounded-xl border text-center bg-violet-500/10 border-violet-400 hover:border-violet-300 text-violet-400 font-bold animate-fadeIn cursor-pointer transition-all hover:scale-[1.02]"
                  title="Натисніть для редагування контрагента або суми"
                >
                  <div className="text-xs truncate font-bold pr-3 flex items-center justify-center gap-1">
                    <span>👤 {off.name}</span>
                  </div>
                  <div className="text-sm font-extrabold mt-1">{Number(off.sum).toFixed(2)}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOffsetSplits(prev => prev.filter((_, i) => i !== idx));
                    }}
                    className="absolute top-1 right-1 p-1 hover:bg-red-500/20 text-red-400 rounded-md transition-all"
                    title="Видалити"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  setEditingOffsetIndex(null);
                  // Pre-fill remaining sum if empty or 0, prioritizing cashRemainder
                  const initialSum = modalSum || (cashRemainder > 0 ? String(cashRemainder) : "");
                  setModalOffsetName("");
                  setModalSum(initialSum);
                  setModalType("offset");
                }}
                className="col-span-3 py-3 rounded-xl border-2 border-dashed border-violet-500/30 hover:border-violet-500/50 text-violet-400 font-bold text-xs uppercase transition-all flex items-center justify-center gap-1.5 hover:bg-violet-500/5"
              >
                <UserPlus className="w-4 h-4" />
                <span>
                  {isDiscount || operation === "Покупка"
                    ? "+ Хто за нас заплатив"
                    : "+ Зарахувати іншому"}
                </span>
              </button>

              {unpaidPart > 0.01 && (
                <div className="col-span-3 p-3.5 rounded-xl bg-amber-500/15 border-2 border-amber-500/40 text-amber-300 flex items-center justify-between text-xs font-bold animate-fadeIn">
                  <span className="flex items-center gap-2 text-amber-200">
                    <Hourglass className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span>⏳ Записати в борг {contractor ? `(${contractor})` : "контрагента"}:</span>
                  </span>
                  <span className="text-sm font-black text-amber-400">
                    {unpaidPart.toFixed(2)} {getCurrencySymbol(currentCurrency)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 7. Cross Currency Payments Checkbox */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl flex flex-col gap-4">
        <label className="flex items-center gap-3 font-bold text-sm text-sky-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isCrossCurrency}
            onChange={(e) => setIsCrossCurrency(e.target.checked)}
            className="w-5 h-5 rounded-md border-2 border-slate-700 focus:ring-0 cursor-pointer text-sky-500 bg-slate-800"
          />
          <span className="flex items-center gap-1.5">
            💱 {isIncome ? "Отримали іншою валютою (Мультивалютний прихід)" : "Оплатили іншою валютою (Мультивалютний розхід)"}
          </span>
        </label>

        {isCrossCurrency && (
          <div className="flex flex-col gap-5 p-5 rounded-2xl bg-black border-2 border-sky-400 shadow-xl shadow-sky-500/20 animate-fadeIn">
            {/* Base Currency Context Banner */}
            <div className="bg-sky-950/50 border-2 border-sky-500/30 p-4 rounded-xl text-xs text-sky-200 flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <span className="font-bold text-slate-300">📝 Сума для мультивалютного розрахунку:</span>
                <div className="flex flex-wrap items-center gap-2.5 mt-1">
                  <div className="relative">
                    <input
                      type="number"
                      step="any"
                      value={crossBaseSumOverride}
                      onChange={(e) => setCrossBaseSumOverride(e.target.value)}
                      placeholder={targetTotal.toFixed(2)}
                      className="bg-slate-900 border-2 border-sky-500/50 px-3 py-1.5 pr-10 rounded-xl text-white font-black text-sm w-36 outline-none focus:border-sky-400 transition-all text-center placeholder-slate-500"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">
                      {CURRENCY_INFOS[currentCurrency]?.symbol}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    з початкових {targetTotal.toFixed(2)} {CURRENCY_INFOS[currentCurrency]?.symbol}
                  </span>
                  
                  {/* Quick-set remainder button if there is some distribution elsewhere */}
                  {paidSum > 0 && paidSum < targetTotal && (
                    <button
                      type="button"
                      onClick={() => setCrossBaseSumOverride(String(Number((targetTotal - paidSum).toFixed(2))))}
                      className="text-[10px] bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 px-2.5 py-1.5 rounded-lg font-bold transition-all active:scale-95"
                    >
                      🎯 Встановити залишок: {(targetTotal - paidSum).toFixed(2)} {CURRENCY_INFOS[currentCurrency]?.symbol}
                    </button>
                  )}

                  {crossBaseSumOverride !== "" && (
                    <button
                      type="button"
                      onClick={() => setCrossBaseSumOverride("")}
                      className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 px-2 py-1.5 rounded-lg font-bold transition-all ml-auto"
                    >
                      Скинути
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-sky-300/75 leading-relaxed">
                За замовчуванням дорівнює основній сумі ({targetTotal.toFixed(2)} {currentCurrency}). Ви можете змінити її вручну або натиснути кнопку вище, щоб заповнити її залишком після розподілу по банках.
              </p>
            </div>

            <div className="flex justify-between items-center text-xs bg-slate-950 p-3.5 rounded-xl border-2 border-slate-800">
              <span className="font-black text-slate-300 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                📈 Джерело курсів:
              </span>
              <select
                value={crossRateSource}
                onChange={(e) => setCrossRateSource(e.target.value)}
                className="bg-slate-900 p-2 rounded-lg text-white font-bold outline-none text-xs border-2 border-slate-700 cursor-pointer hover:border-slate-600 transition-all"
              >
                <option value="telegram">Telegram (EXCHANGE Drohobych)</option>
                <option value="minfin">Мінфін (Чорний ринок)</option>
                <option value="nbu">НБУ (Офіційний)</option>
              </select>
            </div>

            {crossBlocks.map((block, idx) => (
              <div
                key={idx}
                className="bg-black border-2 border-slate-700 p-5 rounded-2xl flex flex-col gap-4 relative animate-fadeIn shadow-lg shadow-black/80"
              >
                {idx > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const updated = crossBlocks.filter((_, i) => i !== idx);
                      setCrossBlocksWithBalance(updated, -1);
                    }}
                    className="absolute top-3 right-3 p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs transition-all active:scale-90"
                    title="Видалити валюту"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                
                <div className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                  💵 Валюта {idx + 1}
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                      <span>🌍 Валюта</span>
                    </label>
                    <select
                      value={block.curr}
                      onChange={async (e) => {
                        const newCurr = e.target.value;
                        const updated = [...crossBlocks];
                        updated[idx].curr = newCurr;
                        
                        const prevEq = parseFloat(block.eq) || 0;
                        const initialEq = prevEq > 0 ? prevEq : (crossRemainder > 0 ? crossRemainder : 0);
                        
                        let rate = "";
                        let sum = "";
                        
                        try {
                          const res = await fetch(`/api/rates?source=${crossRateSource}`);
                          const rates = await res.json();
                          if (rates && !rates.error) {
                            const fC = newCurr;
                            const tC = currentCurrency;
                            const rateVal = getConventionalRate(fC, tC, rates, isIncome, "kantor");
                            rate = (fC === "UAH" || tC === "UAH") ? rateVal.toFixed(2) : rateVal.toFixed(4);
                            
                            if (initialEq > 0) {
                              const isFromSoft = getRank(fC) < getRank(tC);
                              sum = (isFromSoft ? (initialEq * rateVal) : (initialEq / rateVal)).toFixed(2);
                            }
                          }
                        } catch (err) {
                          console.warn("Failed to fetch rates for changed cross block", err);
                        }
                        
                        updated[idx].rate = rate;
                        updated[idx].eq = initialEq > 0 ? initialEq.toFixed(2) : "";
                        updated[idx].sum = sum;
                        
                        setCrossBlocksWithBalance(updated, idx);
                      }}
                      className="bg-slate-800 p-3 rounded-xl text-white font-bold outline-none text-sm border border-slate-700 focus:border-sky-500 transition-all cursor-pointer"
                    >
                      <option value="UAH">🇺🇦 UAH (₴)</option>
                      <option value="USD">🇺🇸 USD ($)</option>
                      <option value="EUR">🇪🇺 EUR (€)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400">
                      🏦 {isIncome ? "На який рахунок" : "З якого рахунку"}
                    </label>
                    <select
                      value={block.acc}
                      onChange={(e) => {
                        const updated = [...crossBlocks];
                        updated[idx].acc = e.target.value;
                        setCrossBlocks(updated);
                      }}
                      className="bg-slate-800 p-3 rounded-xl text-white font-bold outline-none text-sm border border-slate-700 focus:border-sky-500 transition-all cursor-pointer"
                    >
                      <option value="Готівка">💵 {initData?.allAliases[block.curr as "UAH" | "USD" | "EUR"]?.["Готівка"] || "Готівка"}</option>
                      <option value="Банк 1">💳 {initData?.allAliases[block.curr as "UAH" | "USD" | "EUR"]?.["Банк 1"] || "Банк 1"}</option>
                      <option value="Банк 2">💳 {initData?.allAliases[block.curr as "UAH" | "USD" | "EUR"]?.["Банк 2"] || "Банк 2"}</option>
                      <option value="Банк 3">💳 {initData?.allAliases[block.curr as "UAH" | "USD" | "EUR"]?.["Банк 3"] || "Банк 3"}</option>
                      <option value="Банк 4">💳 {initData?.allAliases[block.curr as "UAH" | "USD" | "EUR"]?.["Банк 4"] || "Банк 4"}</option>
                      <option value="Банк 5">💳 {initData?.allAliases[block.curr as "UAH" | "USD" | "EUR"]?.["Банк 5"] || "Банк 5"}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400">
                      💰 {isIncome ? "Сума отримання" : "Сума оплати"} ({CURRENCY_INFOS[block.curr]?.flag} {block.curr})
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={block.sum}
                        onChange={(e) => updateCrossBlockMath(idx, "sum", e.target.value)}
                        placeholder="0.00"
                        className="bg-slate-800 p-3 pr-8 rounded-xl text-white text-sm font-bold outline-none border border-slate-700 focus:border-sky-500 transition-all w-full"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">
                        {CURRENCY_INFOS[block.curr]?.symbol}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-bold text-slate-400">
                      ⚡ Курс обміну
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={block.rate}
                      onChange={(e) => updateCrossBlockMath(idx, "rate", e.target.value)}
                      placeholder="Введіть курс..."
                      className="bg-slate-800 p-3 rounded-xl text-white text-sm outline-none border border-slate-700 focus:border-sky-500 transition-all font-mono font-bold"
                    />
                  </div>
                </div>

                {/* Live Exchange Rate Explanation Banner */}
                {block.curr !== currentCurrency && block.rate && parseFloat(block.rate) > 0 && (
                  <div className="text-xs text-sky-400 font-bold bg-sky-950/30 px-3.5 py-2.5 rounded-xl border border-sky-900/40 text-center animate-fadeIn">
                    {getRateLabelDetailed(block.curr, currentCurrency, parseFloat(block.rate) || 0)}
                  </div>
                )}

                {/* Rapid Rate Fetch Utilities */}
                {block.curr !== currentCurrency && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      🔄 Оновити курс з джерела:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleFetchFormRate(idx, "kantor")}
                        className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-sky-400 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-700 hover:border-sky-500/30"
                      >
                        🏦 Кантор (Обмін)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFetchFormRate(idx, "cross")}
                        className="p-2.5 bg-slate-800/80 hover:bg-slate-700 text-violet-400 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-700 hover:border-violet-500/30"
                      >
                        📈 Крос-курс (Офіц.)
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5 bg-slate-900/40 p-3 rounded-xl border border-slate-800/50">
                  <label className="text-[11px] font-bold text-slate-400 flex justify-between items-center">
                    <span>⚖️ Еквівалент у базовій валюті ({currentCurrency})</span>
                    <span className="text-[10px] font-normal text-slate-500">Зараховується в загальну суму</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={block.eq}
                      onChange={(e) => updateCrossBlockMath(idx, "eq", e.target.value)}
                      placeholder="0.00"
                      className="bg-slate-800 border border-slate-700 focus:border-sky-400 p-3 pr-8 rounded-lg text-white text-sm font-mono font-bold outline-none transition-all w-full"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">
                      {CURRENCY_INFOS[currentCurrency]?.symbol}
                    </span>
                  </div>
                </div>

                {parseFloat(block.sum) > 0 && crossRemainder !== 0 && (() => {
                  const recalc = getHypotheticalRecalculation(idx);
                  if (!recalc) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => handleApproveDiscrepancyForBlock(idx)}
                      className="w-full py-2.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 font-bold rounded-xl text-xs flex flex-col items-center justify-center gap-0.5 border border-sky-500/30 hover:border-sky-500/60 transition-all cursor-pointer active:scale-95 mt-1"
                    >
                      <span className="flex items-center gap-1 font-bold text-sky-300">
                        🎯 Одобрити {block.sum} {block.curr} та встановити курс {recalc.newRate}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        Курс: 1 {CURRENCY_INFOS[recalc.tC]?.flag} {recalc.tC} = {recalc.newRate} {CURRENCY_INFOS[recalc.fC]?.flag} {recalc.fC} (було {recalc.oldRate}) • закриє різницю {Math.abs(crossRemainder).toFixed(2)} {currentCurrency}
                      </span>
                    </button>
                  );
                })()}
              </div>
            ))}

            {/* Remainder Distribution Banner */}
            <div className="p-1 rounded-xl border border-slate-800 bg-slate-950/30">
              {crossRemainder === 0 ? (
                <div className="text-emerald-400 bg-emerald-950/25 border border-emerald-900/30 p-3 rounded-lg flex items-center gap-2.5 text-xs font-semibold">
                  <span>✅</span>
                  <span>Вся сума транзакції повністю покрита мультивалютними сумами!</span>
                </div>
              ) : crossRemainder > 0 ? (
                <div className="text-amber-400 bg-amber-950/25 border border-amber-900/30 p-3 rounded-lg flex flex-col gap-2 text-xs font-semibold">
                  <div className="flex items-center gap-2.5">
                    <span>⚠️</span>
                    <span>Залишилося розподілити: <strong className="text-white text-sm font-black">{crossRemainder.toFixed(2)} {currentCurrency}</strong></span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-normal leading-normal">
                    Ви можете додати ще одну валюту для розподілу, скоригувати суми поточного блоку або одобрити фактично отриману/сплачену суму нижче.
                  </p>
                  {(() => {
                    const foreignBlocks = crossBlocks
                      .map((b, bIdx) => ({ b, bIdx, recalc: getHypotheticalRecalculation(bIdx) }))
                      .filter(item => item.recalc !== null);
                    if (foreignBlocks.length === 0) return null;
                    return (
                      <div className="flex flex-col gap-2 mt-2">
                        {foreignBlocks.map(({ b, bIdx, recalc }) => (
                          <button
                            key={bIdx}
                            type="button"
                            onClick={() => handleApproveDiscrepancyForBlock(bIdx)}
                            className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 shadow-md cursor-pointer"
                          >
                            <span className="font-black flex items-center gap-1">
                              🤝 Одобрити меншу суму {recalc ? `(Встановити курс ${recalc.newRate})` : ""}
                            </span>
                            {recalc && (
                              <span className="text-[10px] text-slate-900/90 font-bold">
                                перерахувати курс {recalc.fC} → {recalc.tC} з {recalc.oldRate} на {recalc.newRate} ({b.sum} {b.curr})
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="text-red-400 bg-red-950/25 border border-red-900/30 p-3 rounded-lg flex flex-col gap-2 text-xs font-semibold">
                  <div className="flex items-center gap-2.5">
                    <span>🚨</span>
                    <span>Перевищено суму мультивалютного розрахунку на <strong className="text-white text-sm font-black">{Math.abs(crossRemainder).toFixed(2)} {currentCurrency}</strong></span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-normal leading-normal">
                    Сума еквівалентів перевищує суму мультивалютного розрахунку. Ви можете скоригувати суми або одобрити фактично отриману суму як повну оплату.
                  </p>
                  {(() => {
                    const foreignBlocks = crossBlocks
                      .map((b, bIdx) => ({ b, bIdx, recalc: getHypotheticalRecalculation(bIdx) }))
                      .filter(item => item.recalc !== null);
                    if (foreignBlocks.length === 0) return null;
                    return (
                      <div className="flex flex-col gap-2 mt-2">
                        {foreignBlocks.map(({ b, bIdx, recalc }) => (
                          <button
                            key={bIdx}
                            type="button"
                            onClick={() => handleApproveDiscrepancyForBlock(bIdx)}
                            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 shadow-md cursor-pointer"
                          >
                            <span className="font-black flex items-center gap-1">
                              🤝 Одобрити більшу суму {recalc ? `(Встановити курс ${recalc.newRate})` : ""}
                            </span>
                            {recalc && (
                              <span className="text-[10px] text-slate-900/90 font-bold">
                                перерахувати курс {recalc.fC} → {recalc.tC} з {recalc.oldRate} на {recalc.newRate} ({b.sum} {b.curr})
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={async () => {
                const defaultCurr = currentCurrency === "USD" ? "UAH" : "USD";
                const initialEq = crossRemainder > 0 ? crossRemainder : 0;
                
                let rate = "";
                let sum = "";
                
                try {
                  const res = await fetch(`/api/rates?source=${crossRateSource}`);
                  const rates = await res.json();
                  if (rates && !rates.error) {
                    const fC = defaultCurr;
                    const tC = currentCurrency;
                    const rateVal = getConventionalRate(fC, tC, rates, isIncome, "kantor");
                    rate = (fC === "UAH" || tC === "UAH") ? rateVal.toFixed(2) : rateVal.toFixed(4);
                    
                    if (initialEq > 0) {
                      const isFromSoft = getRank(fC) < getRank(tC);
                      sum = (isFromSoft ? (initialEq * rateVal) : (initialEq / rateVal)).toFixed(2);
                    }
                  }
                } catch (err) {
                  console.warn("Failed to fetch rates for new cross block", err);
                }
                
                const updated = [
                  ...crossBlocks,
                  {
                    active: true,
                    curr: defaultCurr,
                    acc: "Готівка",
                    sum: sum,
                    rate: rate,
                    eq: initialEq > 0 ? initialEq.toFixed(2) : ""
                  }
                ];
                setCrossBlocksWithBalance(updated, -1);
              }}
              className="w-full py-3 border border-dashed border-sky-500/30 text-sky-400 text-xs font-black uppercase tracking-wider rounded-xl hover:bg-sky-500/5 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              ➕ Додати ще одну валюту отримання/оплати
            </button>
          </div>
        )}
      </div>

      {/* Dynamic interest-bearing debt section */}
      {operation.includes("борг") && (
        <div className="flex flex-col gap-3 p-4 bg-slate-900/60 border border-violet-500/30 rounded-2xl shadow-md shadow-violet-500/5 animate-fadeIn">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={createPlannedInterest}
              onChange={(e) => setCreatePlannedInterest(e.target.checked)}
              className="w-4.5 h-4.5 rounded border-slate-700 bg-slate-800 text-violet-500 focus:ring-violet-500/50 cursor-pointer"
            />
            <span className="text-xs font-extrabold text-violet-400 uppercase tracking-wide">
              📊 Одразу записати як заплановані доходи/витрати під %
            </span>
          </label>

          {createPlannedInterest && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5 border-t border-slate-800/60 pt-3 animate-slideDown">
              <div className="flex flex-col gap-1.5 col-span-1 sm:col-span-2">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Режим відсотків:</label>
                {isIncome ? (
                  <div className="py-2.5 px-3 rounded-xl text-xs font-black bg-rose-500/10 text-rose-400 border border-rose-500/20 shadow-sm flex items-center gap-1.5 uppercase tracking-wider">
                    📥 Взято під % (Кредит / Витрата)
                  </div>
                ) : (
                  <div className="py-2.5 px-3 rounded-xl text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm flex items-center gap-1.5 uppercase tracking-wider">
                    📈 Дано під % (Депозит / Дохід)
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ставка відсотків (%):</label>
                <input
                  type="number"
                  step="any"
                  value={plannedInterestRate}
                  onChange={(e) => setPlannedInterestRate(e.target.value)}
                  placeholder="Введіть ставку відсотків..."
                  className="bg-slate-800 border-2 border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Періодичність:</label>
                <select
                  value={plannedInterestPeriod}
                  onChange={(e: any) => setPlannedInterestPeriod(e.target.value)}
                  className="bg-slate-800 border-2 border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3 py-2 text-xs text-white outline-none"
                >
                  <option value="monthly">В місяць (30 днів)</option>
                  <option value="annual">Річних (365 днів)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Дата старту нараховування:</label>
                <input
                  type="date"
                  value={plannedInterestStartDate}
                  onChange={(e) => setPlannedInterestStartDate(e.target.value)}
                  className="bg-slate-800 border-2 border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Дата сплати (термін):</label>
                <input
                  type="date"
                  value={plannedInterestDueDate}
                  onChange={(e) => setPlannedInterestDueDate(e.target.value)}
                  className="bg-slate-800 border-2 border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 9. Receipt photo upload */}
      <div className="flex flex-col gap-1.5">
        <input
          type="file"
          accept="image/*"
          id="inp-receipt-app"
          onChange={handleReceiptUpload}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => document.getElementById("inp-receipt-app")?.click()}
          className={`py-3.5 rounded-xl border-2 border-dashed font-bold text-sm flex items-center justify-center gap-2 transition-all hover:bg-slate-800/40 ${
            receipt
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "border-slate-700 text-slate-400"
          }`}
        >
          <Paperclip className="w-4 h-4" />
          {receipt ? `Чек прикріплено: ${receipt.name}` : "Прикріпити Чек (Фото / Галерея)"}
        </button>
      </div>

      {/* 10. Action buttons */}
      <div className="flex flex-col gap-3 mt-4">
        <button
          onClick={handleFormSubmit}
          disabled={!isDiscount && !isCrossCurrency && cashRemainder < -0.01}
          className={`py-4 rounded-xl font-bold text-base text-white shadow-lg transition-all active:scale-[0.98] ${
            isIncome ? "bg-emerald-500 shadow-emerald-500/10 hover:bg-emerald-400" : "bg-red-500 shadow-red-500/10 hover:bg-red-400"
          } disabled:opacity-50 disabled:pointer-events-none`}
        >
          Зберегти запис
        </button>
        <button
          onClick={onBack}
          className="py-3.5 bg-slate-800 border-2 border-slate-700 text-slate-300 font-bold rounded-xl text-sm transition-all hover:bg-slate-700 active:scale-[0.98]"
        >
          Скасувати
        </button>
      </div>

      {/* Grid Modal */}
      {modalType && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
          <div className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 w-full max-w-[340px] animate-scaleIn">
            <h3 className="text-center font-bold text-sky-400 mb-4 text-base">
              {modalType === "bank"
                ? `${aliases[activeModalBank] || activeModalBank}`
                : isDiscount || operation === "Покупка"
                ? "👤 Хто заплатив"
                : "👤 Зарахувати іншому"}
            </h3>

            {modalType === "offset" && (
              <div className="mb-4">
                <label className="text-[10px] font-bold text-slate-500 block mb-1">
                  Ім'я контрагента
                </label>
                <AutocompleteInput
                  value={modalOffsetName}
                  onChange={setModalOffsetName}
                  suggestions={initData?.names || []}
                  placeholder="Введіть ім'я..."
                />
              </div>
            )}

            {modalType === "bank" && (
              <div className="mb-4">
                {(() => {
                  const activeBankBal = getAccountBalance(activeModalBank);
                  const modalSumNum = parseFloat(modalSum) || 0;
                  const modalProjectedBal = isIncomeOp ? activeBankBal + modalSumNum : activeBankBal - modalSumNum;
                  const isModalOverdraft = !isIncomeOp && modalSumNum > 0 && modalProjectedBal < -0.01;
                  const sym = getCurrencySymbol(currentCurrency);

                  return (
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-1.5 text-xs text-left">
                      <div className="flex justify-between items-center text-slate-400">
                        <span className="font-semibold">Поточний залишок:</span>
                        <span className={`font-mono font-bold ${activeBankBal < 0 ? "text-rose-400" : "text-slate-200"}`}>
                          {activeBankBal.toFixed(2)} {sym}
                        </span>
                      </div>
                      {modalSumNum > 0 && (
                        <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80">
                          <span className="font-semibold">
                            {isIncomeOp ? "Залишок після зарахування:" : "Залишок після списання:"}
                          </span>
                          <span className={`font-mono font-black ${isModalOverdraft ? "text-rose-400" : "text-emerald-400"}`}>
                            {modalProjectedBal >= 0 ? "+" : ""}{modalProjectedBal.toFixed(2)} {sym}
                            {isModalOverdraft && " ⚠️"}
                          </span>
                        </div>
                      )}
                      {isModalOverdraft && (
                        <div className="text-[10px] text-rose-300 font-bold bg-rose-500/15 p-1.5 rounded-lg border border-rose-500/30 mt-0.5">
                          ⚠️ Увага: на цьому рахунку недостатньо коштів! Буде від'ємний баланс.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Quick-fill chips */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {targetTotal > 0 && (
                    <button
                      type="button"
                      onClick={() => setModalSum(targetTotal.toFixed(2))}
                      className="px-2 py-1 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 text-[10px] font-bold rounded-lg border border-sky-500/30 transition-all cursor-pointer active:scale-95"
                    >
                      Вся сума ({targetTotal.toFixed(2)})
                    </button>
                  )}
                  {!isIncomeOp && getAccountBalance(activeModalBank) > 0 && getAccountBalance(activeModalBank) < targetTotal && (
                    <button
                      type="button"
                      onClick={() => setModalSum(getAccountBalance(activeModalBank).toFixed(2))}
                      className="px-2 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[10px] font-bold rounded-lg border border-amber-500/30 transition-all cursor-pointer active:scale-95"
                    >
                      Весь залишок ({getAccountBalance(activeModalBank).toFixed(2)})
                    </button>
                  )}
                  {cashRemainder > 0 && Math.abs(cashRemainder - targetTotal) > 0.01 && (
                    <button
                      type="button"
                      onClick={() => setModalSum(cashRemainder.toFixed(2))}
                      className="px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-bold rounded-lg border border-emerald-500/30 transition-all cursor-pointer active:scale-95"
                    >
                      Залишок до сплати ({cashRemainder.toFixed(2)})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setModalSum("0")}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-bold rounded-lg border border-slate-700 transition-all cursor-pointer active:scale-95"
                  >
                    Очистити (0)
                  </button>
                </div>
              </div>
            )}

            {modalType === "bank" && activeModalBank === "Готівка" && isCustomCash && (
              <button
                type="button"
                onClick={() => {
                  setIsCustomCash(false);
                  closeModals();
                }}
                className="w-full mb-3 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold rounded-xl border border-amber-500/40 flex items-center justify-center gap-1.5 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Скинути на авто-розрахунок залишку
              </button>
            )}

            <div className="mb-5">
              <label className="text-[10px] font-bold text-slate-500 block mb-1">Сума</label>
              <input
                type="number"
                value={modalSum}
                onChange={(e) => setModalSum(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                className="bg-slate-800 p-3 rounded-xl border border-slate-700 text-white font-bold text-center text-lg focus:border-sky-400 outline-none w-full"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const s = parseFloat(modalSum) || 0;
                  if (modalType === "bank") {
                    if (activeModalBank === "Готівка") {
                      setIsCustomCash(true);
                    }
                    setBankSplits(prev => ({ ...prev, [activeModalBank]: s }));
                    closeModals();
                  } else {
                    if (modalOffsetName.trim() && s > 0) {
                      if (editingOffsetIndex !== null) {
                        setOffsetSplits(prev => prev.map((item, i) => i === editingOffsetIndex ? { name: modalOffsetName.trim(), sum: s } : item));
                      } else {
                        setOffsetSplits(prev => [...prev, { name: modalOffsetName.trim(), sum: s }]);
                      }
                      setModalOffsetName("");
                      setModalSum("");
                      setEditingOffsetIndex(null);
                      closeModals();
                    } else {
                      alert("⚠️ Будь ласка, введіть ім'я контрагента та дійсну суму більше 0!");
                    }
                  }
                }}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-xl text-sm"
              >
                ОК
              </button>
              <button
                type="button"
                onClick={closeModals}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-sm"
              >
                Назад
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function closeModals() {
    setModalType(null);
    setEditingOffsetIndex(null);
  }

  function resetToCash() {
    setIsCustomCash(false);
    setBankSplits({ "Готівка": 0, "Банк 1": 0, "Банк 2": 0, "Банк 3": 0, "Банк 4": 0, "Банк 5": 0 });
    setOffsetSplits([]);
  }
};
