import React, { useState } from "react";
import { Users, Handshake, Trash2, ArrowUpRight, ArrowDownLeft, CheckCircle2, RefreshCw, Search, X, Scale, Plus } from "lucide-react";
import { DebtorsDetails, DebtorItem } from "../types";

interface DebtorsViewProps {
  debtors: DebtorsDetails | null;
  loading: boolean;
  onBack: () => void;
  onClearHistory: (name: string, mode: "all" | "keep_balance") => Promise<void>;
  onSelectContractor?: (name: string) => void;
  currentCurrency: string;
  onOpenInitialDataModal?: () => void;
}

export const DebtorsView: React.FC<DebtorsViewProps> = ({
  debtors,
  loading,
  onBack,
  onClearHistory,
  onSelectContractor,
  currentCurrency,
  onOpenInitialDataModal
}) => {
  const [tab, setTab] = useState<"all" | "oweUs" | "weOwe" | "settled">("all");
  const [search, setSearch] = useState("");
  const [cleaningName, setCleaningName] = useState<string | null>(null);
  const [cleaningContractor, setCleaningContractor] = useState<{ name: string; sum: number } | null>(null);
  const [confirmDeleteMode, setConfirmDeleteMode] = useState<"keep_balance" | "all" | null>(null);

  React.useEffect(() => {
    const handleIntercept = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (cleaningContractor || cleaningName) {
        customEvent.detail.preventScreenTransition();
        setCleaningContractor(null);
        setCleaningName(null);
      }
    };
    window.addEventListener("app-back-intercept", handleIntercept);
    return () => window.removeEventListener("app-back-intercept", handleIntercept);
  }, [cleaningContractor, cleaningName]);

  const getCurrencySymbol = () => {
    if (currentCurrency === "USD") return "$";
    if (currentCurrency === "EUR") return "€";
    return "₴";
  };

  const getActiveList = (): Array<{ name: string; sum: number; type: "oweUs" | "weOwe" | "settled" }> => {
    if (!debtors) return [];
    
    const allItems: Array<{ name: string; sum: number; type: "oweUs" | "weOwe" | "settled" }> = [];
    
    debtors.oweUs.forEach(item => {
      allItems.push({ ...item, type: "oweUs" });
    });
    debtors.weOwe.forEach(item => {
      allItems.push({ ...item, type: "weOwe" });
    });
    debtors.settled.forEach(item => {
      allItems.push({ ...item, type: "settled" });
    });

    let filtered = allItems;
    if (tab === "oweUs") filtered = allItems.filter(i => i.type === "oweUs");
    else if (tab === "weOwe") filtered = allItems.filter(i => i.type === "weOwe");
    else if (tab === "settled") filtered = allItems.filter(i => i.type === "settled");

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(item => item.name.toLowerCase().includes(q));
    }

    if (tab === "all") {
      return filtered.sort((a, b) => {
        const sumA = a.type === "settled" ? 0 : a.sum;
        const sumB = b.type === "settled" ? 0 : b.sum;
        if (sumB !== sumA) return sumB - sumA;
        return a.name.localeCompare(b.name);
      });
    }

    return filtered;
  };

  return (
    <div className="flex flex-col gap-4 text-left animate-fadeIn">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <Users className="w-5 h-5 text-sky-400" />
          Взаєморозрахунки / Борги
        </h2>
        <div className="flex items-center gap-2">
          {onOpenInitialDataModal && (
            <button
              onClick={onOpenInitialDataModal}
              className="text-xs font-black text-amber-300 hover:text-white transition-all bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
            >
              <Scale className="w-3.5 h-3.5 text-amber-400" />
              <span>➕ Внести початковий борг</span>
            </button>
          )}
          <button
            onClick={onBack}
            className="text-xs font-bold text-slate-400 hover:text-white transition-all bg-slate-800 px-3 py-1.5 rounded-lg cursor-pointer"
          >
            Назад
          </button>
        </div>
      </div>

      {/* Tabs list */}
      <div className="grid grid-cols-4 gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800/80">
        <button
          onClick={() => setTab("all")}
          className={`py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${
            tab === "all" ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" : "text-slate-400 hover:text-slate-300"
          }`}
        >
          <Users className="w-3.5 h-3.5 text-sky-400" />
          <span>Всі ({debtors ? (debtors.oweUs.length + debtors.weOwe.length + debtors.settled.length) : 0})</span>
        </button>
        <button
          onClick={() => setTab("oweUs")}
          className={`py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${
            tab === "oweUs" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-slate-400 hover:text-slate-300"
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
          <span>Нам винні ({debtors?.oweUs.length || 0})</span>
        </button>
        <button
          onClick={() => setTab("weOwe")}
          className={`py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${
            tab === "weOwe" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "text-slate-400 hover:text-slate-300"
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5 text-red-400" />
          <span>Ми винні ({debtors?.weOwe.length || 0})</span>
        </button>
        <button
          onClick={() => setTab("settled")}
          className={`py-2 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all flex flex-col items-center gap-1 ${
            tab === "settled" ? "bg-slate-800 text-white border border-transparent" : "text-slate-400 hover:text-slate-300"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
          <span>Закриті ({debtors?.settled.length || 0})</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Пошук контрагента за ім'ям..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3.5 pl-10 text-xs font-bold text-white placeholder-slate-500 focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/50 transition-all"
        />
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="p-1 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white absolute right-3 top-1/2 -translate-y-1/2 transition-all"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Debtors List */}
      <div className="flex flex-col gap-2.5 max-h-[440px] overflow-y-auto pr-1">
        {loading && (
          <div className="text-center py-6 text-slate-500 font-semibold animate-pulse">
            Оновлення списків...
          </div>
        )}

        {!loading && getActiveList().length === 0 && (
          <div className="text-center py-8 text-slate-500 font-semibold bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
            Список порожній
          </div>
        )}

        {!loading &&
          getActiveList().map((item, idx) => {
            const isOweUs = item.type === "oweUs";
            const isWeOwe = item.type === "weOwe";
            const isSettled = item.type === "settled";
            const textCol = isOweUs ? "text-emerald-400" : isWeOwe ? "text-red-400" : "text-slate-500";
            const amtPrefix = isOweUs ? "" : isWeOwe ? "-" : "";

            return (
              <div
                key={idx}
                className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between gap-4 shadow-sm hover:border-slate-700/60 transition-all"
              >
                <div
                  onClick={() => onSelectContractor?.(item.name)}
                  className="flex flex-col gap-1 truncate font-bold text-xs text-slate-400 cursor-pointer group flex-1"
                >
                  <span className="text-base text-white truncate group-hover:text-sky-400 transition-colors">{item.name}</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isOweUs && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Нам винні
                      </span>
                    )}
                    {isWeOwe && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                        Ми винні
                      </span>
                    )}
                    {isSettled && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-slate-950 text-slate-500 border border-slate-800">
                        Закрито
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3.5 flex-shrink-0">
                  <span className={`text-base font-black ${textCol}`}>
                    {isSettled ? "0.00" : `${amtPrefix} ${item.sum.toFixed(2)}`} {getCurrencySymbol()}
                  </span>
                  
                  {cleaningName === item.name ? (
                    <RefreshCw className="w-4 h-4 text-amber-500 animate-spin" />
                  ) : (
                    <button
                      onClick={() => {
                        setCleaningContractor({ name: item.name, sum: item.sum });
                        setConfirmDeleteMode(null);
                      }}
                      className="p-2.5 bg-slate-800 border border-slate-700 hover:bg-rose-950/20 hover:border-rose-800/40 hover:text-rose-400 rounded-xl transition-all cursor-pointer"
                      title="Очистити історію взаєморозрахунків"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {cleaningContractor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-5 text-left">
            {!confirmDeleteMode ? (
              <>
                <div>
                  <h3 className="text-lg font-black text-white">Очищення даних: {cleaningContractor.name}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Виберіть бажаний варіант видалення для контрагента (поточний борг: <b>{cleaningContractor.sum.toFixed(2)} {getCurrencySymbol()}</b>):
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setConfirmDeleteMode("keep_balance")}
                    className="group p-3.5 bg-slate-950 border border-slate-800 hover:border-sky-500/50 rounded-2xl flex flex-col gap-1 transition-all active:scale-98 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2 font-extrabold text-xs text-sky-400 group-hover:text-white transition-colors">
                      🧹 Видалити ТІЛЬКИ історію (Зберегти борг)
                    </div>
                    <div className="text-[10px] text-slate-400 group-hover:text-slate-300 leading-normal">
                      Всі попередні детальні транзакції будуть видалені з таблиці, але поточний баланс <b>{cleaningContractor.sum.toFixed(2)} {getCurrencySymbol()}</b> залишиться як початковий борг.
                    </div>
                  </button>

                  <button
                    onClick={() => setConfirmDeleteMode("all")}
                    className="group p-3.5 bg-slate-950 border border-slate-800 hover:border-rose-500/50 rounded-2xl flex flex-col gap-1 transition-all active:scale-98 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2 font-extrabold text-xs text-rose-400 group-hover:text-white transition-colors">
                      🔥 Повністю видалити все разом (Анулювати)
                    </div>
                    <div className="text-[10px] text-slate-400 group-hover:text-slate-300 leading-normal">
                      Повністю видалить контрагента з таблиці, очистить його історію транзакцій та скине борг до нуля.
                    </div>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setCleaningContractor(null);
                    setConfirmDeleteMode(null);
                  }}
                  className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold rounded-2xl text-xs transition-all active:scale-95 text-center cursor-pointer"
                >
                  Скасувати
                </button>
              </>
            ) : confirmDeleteMode === "all" ? (
              <>
                <div className="flex flex-col gap-2">
                  <div className="text-3xl">🚨</div>
                  <h3 className="text-lg font-black text-rose-400">Підтвердження повного видалення</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Ви дійсно хочете <b>ПОВНІСТЮ видалити</b> контрагента <b>"{cleaningContractor.name}"</b> та анулювати його баланс <b>{cleaningContractor.sum.toFixed(2)} {getCurrencySymbol()}</b>?
                  </p>
                  <p className="text-[11px] text-slate-400 bg-rose-950/40 border border-rose-900/50 p-2.5 rounded-xl">
                    ⚠️ Контрагента та всю його історію транзакцій буде остаточно вилучено з Google Таблиці.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5 mt-1">
                  <button
                    onClick={async () => {
                      const name = cleaningContractor.name;
                      setCleaningName(name);
                      setCleaningContractor(null);
                      setConfirmDeleteMode(null);
                      try {
                        await onClearHistory(name, "all");
                      } catch (err: any) {
                        console.error("Error clearing contractor:", err);
                      } finally {
                        setCleaningName(null);
                      }
                    }}
                    className="py-3.5 px-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl text-xs transition-all active:scale-98 text-center cursor-pointer shadow-lg shadow-rose-950/50"
                  >
                    🔥 Так, видалити повністю
                  </button>

                  <button
                    onClick={() => setConfirmDeleteMode(null)}
                    className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold rounded-2xl text-xs transition-all active:scale-95 text-center cursor-pointer"
                  >
                    Назад
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <div className="text-3xl">🧹</div>
                  <h3 className="text-lg font-black text-sky-400">Підтвердження очищення історії</h3>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Очистити детальні транзакції для контрагента <b>"{cleaningContractor.name}"</b>, зберігши поточний борг <b>{cleaningContractor.sum.toFixed(2)} {getCurrencySymbol()}</b> як стартовий баланс?
                  </p>
                </div>

                <div className="flex flex-col gap-2.5 mt-1">
                  <button
                    onClick={async () => {
                      const name = cleaningContractor.name;
                      setCleaningName(name);
                      setCleaningContractor(null);
                      setConfirmDeleteMode(null);
                      try {
                        await onClearHistory(name, "keep_balance");
                      } catch (err: any) {
                        console.error("Error clearing contractor history:", err);
                      } finally {
                        setCleaningName(null);
                      }
                    }}
                    className="py-3.5 px-4 bg-sky-600 hover:bg-sky-500 text-white font-black rounded-2xl text-xs transition-all active:scale-98 text-center cursor-pointer shadow-lg shadow-sky-950/50"
                  >
                    🧹 Так, очистити історію
                  </button>

                  <button
                    onClick={() => setConfirmDeleteMode(null)}
                    className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-extrabold rounded-2xl text-xs transition-all active:scale-95 text-center cursor-pointer"
                  >
                    Назад
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
