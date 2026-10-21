import React, { useState } from "react";
import { ArrowRightLeft, RefreshCw, Clock } from "lucide-react";
import { InitData } from "../types";
import { formatRatesLastUpdated } from "../lib/dailyRates";

interface ExchangeViewProps {
  initData: InitData | null;
  currentCurrency: string;
  onBack: () => void;
  onSubmit: (exchangeData: any) => void;
  ratesLastUpdated?: string;
}

export const ExchangeView: React.FC<ExchangeViewProps> = ({
  initData,
  currentCurrency,
  onBack,
  onSubmit,
  ratesLastUpdated
}) => {
  const [fromCurr, setFromCurr] = useState("USD");
  const [toCurr, setToCurr] = useState("UAH");
  const [fromAcc, setFromAcc] = useState("Готівка");
  const [toAcc, setToAcc] = useState("Готівка");
  const [fromSum, setFromSum] = useState("");
  const [toSum, setToSum] = useState("");
  const [rate, setRate] = useState("");
  const [rateSource, setRateSource] = useState("telegram");
  const [comment, setComment] = useState("");

  const getCalculatedToSum = (fCurr: string, tCurr: string, fSum: number, rVal: number): string => {
    if (rVal <= 0) return "";
    if (fCurr === tCurr) return fSum.toString();
    
    // UAH -> USD/EUR
    if (fCurr === "UAH" && tCurr !== "UAH") {
      return (fSum / rVal).toString();
    }
    // USD/EUR -> UAH
    if (fCurr !== "UAH" && tCurr === "UAH") {
      return (fSum * rVal).toString();
    }
    // EUR -> USD
    if (fCurr === "EUR" && tCurr === "USD") {
      return (fSum * rVal).toString();
    }
    // USD -> EUR
    if (fCurr === "USD" && tCurr === "EUR") {
      return (fSum / rVal).toString();
    }
    return (fSum * rVal).toString();
  };

  const getCalculatedFromSum = (fCurr: string, tCurr: string, tSum: number, rVal: number): string => {
    if (rVal <= 0) return "";
    if (fCurr === tCurr) return tSum.toString();
    
    // UAH -> USD/EUR
    if (fCurr === "UAH" && tCurr !== "UAH") {
      return (tSum * rVal).toString();
    }
    // USD/EUR -> UAH
    if (fCurr !== "UAH" && tCurr === "UAH") {
      return (tSum / rVal).toString();
    }
    // EUR -> USD
    if (fCurr === "EUR" && tCurr === "USD") {
      return (tSum / rVal).toString();
    }
    // USD -> EUR
    if (fCurr === "USD" && tCurr === "EUR") {
      return (tSum * rVal).toString();
    }
    return (tSum / rVal).toString();
  };

  const handleMathUpdate = (field: "from" | "to" | "rate", val: string) => {
    let fS = parseFloat(field === "from" ? val : fromSum) || 0;
    let tS = parseFloat(field === "to" ? val : toSum) || 0;
    let r = parseFloat(field === "rate" ? val : rate) || 0;

    if (field === "from") {
      setFromSum(val);
      if (fromCurr === toCurr) {
        setToSum(val);
      } else if (r > 0) {
        const calculated = getCalculatedToSum(fromCurr, toCurr, fS, r);
        const floatVal = parseFloat(calculated);
        setToSum(isNaN(floatVal) ? "" : floatVal.toFixed(2));
      }
    } else if (field === "to") {
      setToSum(val);
      if (fromCurr === toCurr) {
        setFromSum(val);
      } else if (r > 0) {
        const calculated = getCalculatedFromSum(fromCurr, toCurr, tS, r);
        const floatVal = parseFloat(calculated);
        setFromSum(isNaN(floatVal) ? "" : floatVal.toFixed(2));
      }
    } else if (field === "rate") {
      setRate(val);
      const rateVal = parseFloat(val) || 0;
      if (fS > 0 && rateVal > 0) {
        const calculated = getCalculatedToSum(fromCurr, toCurr, fS, rateVal);
        const floatVal = parseFloat(calculated);
        setToSum(isNaN(floatVal) ? "" : floatVal.toFixed(2));
      }
    }
  };

  const handleSwap = () => {
    const tempCurr = fromCurr;
    const tempAcc = fromAcc;
    const tempSum = fromSum;

    setFromCurr(toCurr);
    setFromAcc(toAcc);
    setFromSum(toSum);

    setToCurr(tempCurr);
    setToAcc(tempAcc);
    setToSum(tempSum);

    if (toCurr === fromCurr) {
      setRate("1.0000");
    }
  };

  const handleFetchRate = async (mode: "kantor" | "cross") => {
    if (fromCurr === toCurr) {
      alert("⚠️ Виберіть різні валюти!");
      return;
    }
    try {
      const res = await fetch(`/api/rates?source=${rateSource}`);
      const rates = await res.json();
      if (rates && !rates.error) {
        let rateVal = 1;
        if (fromCurr === "UAH" && toCurr !== "UAH") {
          rateVal = rates?.[toCurr]?.sell || 1;
        } else if (fromCurr !== "UAH" && toCurr === "UAH") {
          rateVal = rates?.[fromCurr]?.buy || 1;
        } else if (fromCurr === "EUR" && toCurr === "USD") {
          const eurBuy = rates?.EUR?.buy || 0;
          const usdSell = rates?.USD?.sell || 1;
          const usdBuy = rates?.USD?.buy || 1;
          rateVal = mode === "kantor" ? (usdSell > 0 ? eurBuy / usdSell : 1) : (usdBuy > 0 ? eurBuy / usdBuy : 1);
        } else if (fromCurr === "USD" && toCurr === "EUR") {
          const eurSell = rates?.EUR?.sell || 1;
          const eurBuy = rates?.EUR?.buy || 1;
          const usdBuy = rates?.USD?.buy || 1;
          rateVal = mode === "kantor" ? (usdBuy > 0 ? eurSell / usdBuy : 1) : (usdBuy > 0 ? eurBuy / usdBuy : 1);
        }
        setRate(rateVal.toFixed(4));
        const fsNum = parseFloat(fromSum) || 0;
        if (fsNum > 0) {
          const calculated = getCalculatedToSum(fromCurr, toCurr, fsNum, rateVal);
          const floatVal = parseFloat(calculated);
          setToSum(isNaN(floatVal) ? "" : floatVal.toFixed(2));
        }
      }
    } catch (err) {
      alert("Помилка завантаження курсів валют з сервера.");
    }
  };

  const handleExchangeSubmit = () => {
    const fsVal = parseFloat(fromSum) || 0;
    const tsVal = parseFloat(toSum) || 0;
    if (fsVal <= 0 || tsVal <= 0) {
      alert("⚠️ Заповніть суми обміну!");
      return;
    }
    if (fromAcc === toAcc && fromCurr === toCurr) {
      alert("⚠️ Рахунок відправника та отримувача збігаються!");
      return;
    }
    // Check if enough funds in the source account
    const available = initData?.allCashBalances[fromCurr as "UAH" | "USD" | "EUR"] || 0;
    if (fromAcc === "Готівка" && fsVal > available + 0.01) {
      alert(`⚠️ Недостатньо коштів на Готівці (${fromCurr})! Доступно: ${available}`);
      return;
    }

    onSubmit({
      fromCurr,
      toCurr,
      fromAcc,
      toAcc,
      fromSum: fsVal,
      toSum: tsVal,
      rate: parseFloat(rate) || 0,
      comment
    });
  };

  const aliasesFrom = initData?.allAliases[fromCurr as "UAH" | "USD" | "EUR"] || {};
  const aliasesTo = initData?.allAliases[toCurr as "UAH" | "USD" | "EUR"] || {};

  return (
    <div className="flex flex-col gap-4 text-left animate-fadeIn">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <ArrowRightLeft className="w-5 h-5 text-sky-400" />
          Обмін Валют
        </h2>
        <span className="text-[10px] uppercase font-bold tracking-wider px-3 py-1 bg-slate-800 rounded-full text-slate-400">
          Крос-рахунок
        </span>
      </div>

      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col gap-4">
        {/* Source currency/account */}
        <div className="flex flex-col gap-2">
          <label className="text-xs font-bold text-red-400 uppercase tracking-wider">📤 Віддаємо</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500">Валюта</label>
              <select
                value={fromCurr}
                onChange={(e) => {
                  const val = e.target.value;
                  setFromCurr(val);
                  if (val === toCurr) {
                    setRate("1.0000");
                    if (fromSum) setToSum(fromSum);
                  }
                }}
                className="bg-slate-800 p-3 rounded-xl text-white font-bold outline-none text-sm border-2 border-slate-700 w-full"
              >
                <option value="UAH">UAH</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500">Рахунок відправника</label>
              <select
                value={fromAcc}
                onChange={(e) => setFromAcc(e.target.value)}
                className="bg-slate-800 p-3 rounded-xl text-white font-semibold outline-none text-sm border-2 border-slate-700 w-full"
              >
                <option value="Готівка">{aliasesFrom["Готівка"] || "Готівка"}</option>
                <option value="Банк 1">{aliasesFrom["Банк 1"] || "Банк 1"}</option>
                <option value="Банк 2">{aliasesFrom["Банк 2"] || "Банк 2"}</option>
                <option value="Банк 3">{aliasesFrom["Банк 3"] || "Банк 3"}</option>
                <option value="Банк 4">{aliasesFrom["Банк 4"] || "Банк 4"}</option>
                <option value="Банк 5">{aliasesFrom["Банк 5"] || "Банк 5"}</option>
              </select>
            </div>
          </div>
          <div className="mt-1">
            <label className="text-[10px] font-bold text-slate-500">Сума віддано ({fromCurr})</label>
            <input
              type="number"
              value={fromSum}
              onChange={(e) => handleMathUpdate("from", e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="bg-slate-800 p-3.5 rounded-xl text-white font-bold text-lg border-2 border-slate-700 w-full outline-none focus:border-red-400"
            />
          </div>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center -my-2.5">
          <button
            onClick={handleSwap}
            type="button"
            className="p-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 hover:text-white rounded-full shadow-md transition-all active:scale-90 flex items-center justify-center z-10"
            title="Поміняти місцями"
          >
            <ArrowRightLeft className="w-4 h-4 rotate-90" />
          </button>
        </div>

        {/* Target currency/account */}
        <div className="flex flex-col gap-2 border-t border-slate-800 pt-3">
          <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider">📥 Отримуємо</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-500">Валюта</label>
              <select
                value={toCurr}
                onChange={(e) => {
                  const val = e.target.value;
                  setToCurr(val);
                  if (val === fromCurr) {
                    setRate("1.0000");
                    if (fromSum) setToSum(fromSum);
                  }
                }}
                className="bg-slate-800 p-3 rounded-xl text-white font-bold outline-none text-sm border-2 border-slate-700 w-full"
              >
                <option value="UAH">UAH</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500">Рахунок отримувача</label>
              <select
                value={toAcc}
                onChange={(e) => setToAcc(e.target.value)}
                className="bg-slate-800 p-3 rounded-xl text-white font-semibold outline-none text-sm border-2 border-slate-700 w-full"
              >
                <option value="Готівка">{aliasesTo["Готівка"] || "Готівка"}</option>
                <option value="Банк 1">{aliasesTo["Банк 1"] || "Банк 1"}</option>
                <option value="Банк 2">{aliasesTo["Банк 2"] || "Банк 2"}</option>
                <option value="Банк 3">{aliasesTo["Банк 3"] || "Банк 3"}</option>
                <option value="Банк 4">{aliasesTo["Банк 4"] || "Банк 4"}</option>
                <option value="Банк 5">{aliasesTo["Банк 5"] || "Банк 5"}</option>
              </select>
            </div>
          </div>
          <div className="mt-1">
            <label className="text-[10px] font-bold text-slate-500">Сума отримано ({toCurr})</label>
            <input
              type="number"
              value={toSum}
              onChange={(e) => handleMathUpdate("to", e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="bg-slate-800 p-3.5 rounded-xl text-white font-bold text-lg border-2 border-slate-700 w-full outline-none focus:border-emerald-400"
            />
          </div>
        </div>

        {/* Rate settings */}
        <div className="border-t border-slate-800 pt-3 flex flex-col gap-3">
          <div className="flex justify-between items-center text-xs">
            <span className="font-semibold text-slate-400">Джерело курсів:</span>
            <select
              value={rateSource}
              onChange={(e) => setRateSource(e.target.value)}
              className="bg-slate-800 p-1.5 rounded-lg text-white font-bold outline-none text-xs border border-slate-700"
              disabled={fromCurr === toCurr}
            >
              <option value="telegram">Telegram (EXCHANGE)</option>
              <option value="minfin">Мінфін</option>
              <option value="nbu">НБУ</option>
            </select>
          </div>

          <div className="flex items-center justify-between bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-slate-300 text-[11px]">
              <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>{formatRatesLastUpdated(ratesLastUpdated)}</span>
            </span>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Автоматична синхронізація увімкнена" />
          </div>

          {fromCurr !== toCurr ? (
            <div className="flex gap-2">
              <button
                onClick={() => handleFetchRate("kantor")}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-sky-400 font-extrabold rounded-xl text-xs uppercase flex items-center justify-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Кантор
              </button>
              <button
                onClick={() => handleFetchRate("cross")}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-violet-400 font-extrabold rounded-xl text-xs uppercase flex items-center justify-center gap-1.5 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Крос
              </button>
            </div>
          ) : (
            <div className="p-3.5 bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs rounded-xl font-bold text-center">
              🔄 Внутрішній переказ в одній валюті (Курс 1.0000)
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold text-slate-500">Курс ({fromCurr} ➔ {toCurr})</label>
            <input
              type="number"
              value={rate}
              onChange={(e) => handleMathUpdate("rate", e.target.value)}
              placeholder="1.0000"
              inputMode="decimal"
              className="bg-slate-800 p-3 rounded-xl text-white font-bold text-center border-2 border-slate-700 w-full outline-none focus:border-sky-400 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={fromCurr === toCurr}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-slate-400">📝 Коментар (необов'язково)</label>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Наприклад: обмін валют у канторах..."
          className="bg-slate-800 border-2 border-slate-700 focus:border-sky-400 p-3.5 rounded-xl text-white outline-none w-full text-base transition-all"
        />
      </div>

      <div className="flex flex-col gap-3 mt-4">
        <button
          onClick={handleExchangeSubmit}
          className="py-4 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl text-base shadow-lg shadow-sky-500/10 transition-all active:scale-[0.98]"
        >
          Здійснити обмін
        </button>
        <button
          onClick={onBack}
          className="py-3.5 bg-slate-800 border-2 border-slate-700 text-slate-300 font-bold rounded-xl text-sm transition-all hover:bg-slate-700 active:scale-[0.98]"
        >
          Назад
        </button>
      </div>
    </div>
  );
};
