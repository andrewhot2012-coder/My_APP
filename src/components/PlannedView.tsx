import React, { useState, useEffect } from "react";
import { Repeat, Calendar, Trash2, Edit3, Check, PlusCircle, BookmarkCheck } from "lucide-react";
import { PlannedItem } from "../types";
import { parseDateString, calculateAccruedInterest, formatDateUkr } from "../googleSheets";

interface PlannedViewProps {
  plannedItems: PlannedItem[];
  currentCurrency: string;
  onBack: () => void;
  onSave: (item: any, type: "income" | "expense") => void;
  onDelete: (id: string, type: "income" | "expense") => void;
  onFulfill: (item: any) => void;
  onFulfillInterest?: (item: any, accrued: number, chosenDate?: string) => void;
  highlightedId?: string | null;
  clearHighlight?: () => void;
}

export const PlannedView: React.FC<PlannedViewProps> = ({
  plannedItems,
  currentCurrency,
  onBack,
  onSave,
  onDelete,
  onFulfill,
  onFulfillInterest,
  highlightedId,
  clearHighlight
}) => {
  const [type, setType] = useState<"income" | "expense">("expense");
  const [items, setItems] = useState<PlannedItem[]>([]);

  // Period Selector Modal State for Interest fulfillment
  const [selectedInterestItem, setSelectedInterestItem] = useState<any | null>(null);
  const [fulfillmentTargetDate, setFulfillmentTargetDate] = useState("");

  useEffect(() => {
    const handleIntercept = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (selectedInterestItem) {
        customEvent.detail.preventScreenTransition();
        setSelectedInterestItem(null);
      }
    };
    window.addEventListener("app-back-intercept", handleIntercept);
    return () => window.removeEventListener("app-back-intercept", handleIntercept);
  }, [selectedInterestItem]);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sum, setSum] = useState("");
  const [date, setDate] = useState("");
  const [isRegular, setIsRegular] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Interest-bearing states
  const [isInterest, setIsInterest] = useState(false);
  const [interestMode, setInterestMode] = useState<"take" | "give">("take");
  const [interestRate, setInterestRate] = useState("");
  const [interestPeriod, setInterestPeriod] = useState<"annual" | "monthly">("annual");
  const [interestStartDate, setInterestStartDate] = useState("");

  useEffect(() => {
    // Filter items based on selected currency (showing all planned items)
    const list = plannedItems.filter(i => i.currency === currentCurrency);
    setItems(list);
  }, [plannedItems, currentCurrency]);

  useEffect(() => {
    if (highlightedId) {
      const timerScroll = setTimeout(() => {
        const el = document.getElementById(`planned-item-${highlightedId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 300);

      const timerClear = setTimeout(() => {
        if (clearHighlight) {
          clearHighlight();
        }
      }, 4000);

      return () => {
        clearTimeout(timerScroll);
        clearTimeout(timerClear);
      };
    }
  }, [highlightedId, items, clearHighlight]);

  useEffect(() => {
    setInterestMode(type === "expense" ? "take" : "give");
  }, [type]);

  const handleFormSave = () => {
    if (!name.trim()) { alert("⚠️ Введіть Назву!"); return; }
    const s = parseFloat(sum) || 0;
    if (s <= 0) { alert("⚠️ Введіть коректну Суму!"); return; }
    if (!date) { alert("⚠️ Виберіть дату!"); return; }

    const item: any = {
      name: name.trim(),
      sum: s,
      date: date,
      isRegular: isRegular,
      isInterest: isInterest,
      interestMode: isInterest ? (type === "expense" ? "take" : "give") : undefined,
      interestRate: isInterest ? (parseFloat(interestRate) || 0) : undefined,
      interestPeriod: isInterest ? interestPeriod : undefined,
      interestStartDate: isInterest ? (interestStartDate || date) : undefined
    };
    if (editingId) {
      item.id = editingId;
    }

    onSave(item, type);
    // Reset form
    resetForm();
  };

  const handleEditInit = (item: PlannedItem) => {
    setEditingId(item.id || null);
    setName(item.name);
    setSum(String(item.sum));
    setDate(item.date);
    setIsRegular(item.isRegular);
    setType(item.type || "expense");
    
    // Set interest states
    setIsInterest(!!item.isInterest);
    setInterestMode(item.interestMode || "take");
    setInterestRate(item.interestRate ? String(item.interestRate) : "");
    setInterestPeriod(item.interestPeriod || "annual");
    setInterestStartDate(item.interestStartDate || item.date);
  };

  const handleDeleteLocal = (id: string, itemType: "income" | "expense") => {
    if (!confirm("Ви впевнені, що хочете видалити цей запланований запис?")) return;
    if (!confirm("⚠️ Ви дійсно підтверджуєте видалення цього запланованого запису? Ця дія додатково вимагає підтвердження.")) return;
    onDelete(id, itemType);
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setSum("");
    setDate("");
    setIsRegular(false);
    
    // Reset interest states
    setIsInterest(false);
    setInterestMode(type === "expense" ? "take" : "give");
    setInterestRate("");
    setInterestPeriod("annual");
    setInterestStartDate("");
  };

  const getCurrencySymbol = (c: string) => {
    if (c === "UAH") return "₴"; if (c === "USD") return "$"; if (c === "EUR") return "€"; return c;
  };

  const getCurrencyFlag = (c: string) => {
    if (c === "UAH") return "🇺🇦"; if (c === "USD") return "🇺🇸"; if (c === "EUR") return "🇪🇺"; return "";
  };

  return (
    <div className="flex flex-col gap-4 text-left animate-fadeIn">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <BookmarkCheck className="w-5 h-5 text-sky-400" />
          Планування
        </h2>
        <button
          onClick={onBack}
          className="text-xs font-bold text-slate-400 hover:text-white transition-all bg-slate-800 px-3 py-1.5 rounded-lg"
        >
          Назад
        </button>
      </div>

      {/* Type tab switcher */}
      <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
        <button
          onClick={() => { setType("expense"); resetForm(); }}
          className={`py-3 rounded-xl font-bold text-sm transition-all ${
            type === "expense" ? "bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm" : "text-slate-400 hover:text-slate-300"
          }`}
        >
          💸 Заплановані Витрати
        </button>
        <button
          onClick={() => { setType("income"); resetForm(); }}
          className={`py-3 rounded-xl font-bold text-sm transition-all ${
            type === "income" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm" : "text-slate-400 hover:text-slate-300"
          }`}
        >
          📈 Заплановані Доходи
        </button>
      </div>

      {/* Plan composition form card */}
      <div className="bg-slate-900 border border-slate-800/60 p-4 rounded-2xl flex flex-col gap-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {editingId ? "✏️ Редагувати плановане" : "+ Додати нове плановане"}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-500 block">Назва запису *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Наприклад: Оренда, Комуналка..."
            className="bg-slate-800 border border-slate-700 focus:border-sky-400 p-2.5 rounded-xl text-white outline-none text-sm transition-all"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 block">Сума ({getCurrencySymbol(currentCurrency)}) *</label>
            <input
              type="number"
              value={sum}
              onChange={(e) => setSum(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="bg-slate-800 border border-slate-700 focus:border-sky-400 p-2.5 rounded-xl text-white outline-none text-sm transition-all"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 block">Дата сплати *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (!interestStartDate) {
                  setInterestStartDate(e.target.value);
                }
              }}
              className="bg-slate-800 border border-slate-700 focus:border-sky-400 p-2.5 rounded-xl text-white outline-none text-sm transition-all cursor-pointer"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-1">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isRegular}
              onChange={(e) => setIsRegular(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 focus:ring-0 cursor-pointer"
            />
            <span className="flex items-center gap-1">
              <Repeat className="w-3.5 h-3.5 text-sky-400 inline" />
              Щомісячний регулярний платіж
            </span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isInterest}
              onChange={(e) => {
                setIsInterest(e.target.checked);
                if (e.target.checked && !interestStartDate) {
                  setInterestStartDate(date || new Date().toISOString().split('T')[0]);
                }
              }}
              className="w-4 h-4 rounded border-slate-700 focus:ring-0 cursor-pointer"
            />
            <span className="flex items-center gap-1">
              📈 Нарахування відсотків (% кредит/депозит)
            </span>
          </label>
        </div>

        {/* If isInterest, show interest options */}
        {isInterest && (
          <div className="bg-slate-950/45 p-3.5 rounded-xl border border-slate-800/80 flex flex-col gap-3">
            <div className="py-2.5 px-3.5 bg-slate-900 border border-slate-800/80 rounded-xl text-center text-xs font-bold shadow-inner">
              {type === "expense" ? (
                <span className="text-rose-400 flex items-center gap-1.5 justify-center">
                  📥 Взяти під % (Кредит)
                </span>
              ) : (
                <span className="text-emerald-400 flex items-center gap-1.5 justify-center">
                  📤 Дати під % (Депозит)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 block">Відсоток (%) *</label>
                <input
                  type="number"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                  placeholder="напр. 15"
                  step="0.01"
                  className="bg-slate-800 border border-slate-700 focus:border-sky-400 p-2.5 rounded-xl text-white outline-none text-xs transition-all"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-500 block">Період *</label>
                <select
                  value={interestPeriod}
                  onChange={(e) => setInterestPeriod(e.target.value as "annual" | "monthly")}
                  className="bg-slate-800 border border-slate-700 focus:border-sky-400 p-2.5 rounded-xl text-white outline-none text-xs transition-all cursor-pointer"
                >
                  <option value="annual">Річний відсоток</option>
                  <option value="monthly">В місяць відсоток</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 block">Дата старту нарахування відсотків *</label>
              <input
                type="date"
                value={interestStartDate}
                onChange={(e) => setInterestStartDate(e.target.value)}
                className="bg-slate-800 border border-slate-700 focus:border-sky-400 p-2.5 rounded-xl text-white outline-none text-xs transition-all cursor-pointer"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 mt-2">
          <button
            onClick={handleFormSave}
            className="py-2.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 shadow-md shadow-sky-500/10"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{editingId ? "Зберегти" : "Створити"}</span>
          </button>
          <button
            onClick={resetForm}
            className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs"
          >
            Очистити
          </button>
        </div>
      </div>

      {/* Planned list */}
      <div className="flex flex-col gap-3 mt-1 max-h-[380px] overflow-y-auto pr-1">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
          Активні плани ({getCurrencyFlag(currentCurrency)} {currentCurrency}):
        </div>

        {items.length === 0 && (
          <div className="text-center py-6 text-slate-500 font-semibold text-sm bg-slate-900 border border-slate-800/40 rounded-2xl">
            Немає запланованих записів
          </div>
        )}

        {items.map((it, idx) => {
          const itemType = it.type || "expense";
          const borderCol = it.isInterest
            ? (it.interestMode === "give" ? "border-emerald-500/40" : "border-rose-500/40")
            : (itemType === "expense" ? "border-red-500/20" : "border-emerald-500/20");
          const bgTextCol = itemType === "expense" ? "text-red-400" : "text-emerald-400";
          const sumSign = itemType === "expense" ? "-" : "+";

          // Calculate accrued interest
          let days = 0;
          let accrued = 0;
          if (it.isInterest && it.interestStartDate) {
            const startStr = it.interestStartDate;
            const todayD = new Date();
            const todayStr = todayD.getFullYear() + '-' + String(todayD.getMonth() + 1).padStart(2, '0') + '-' + String(todayD.getDate()).padStart(2, '0');
            const { accrued: newAccrued, elapsedDays } = calculateAccruedInterest(
              Number(it.sum) || 0,
              Number(it.interestRate) || 0,
              it.interestPeriod,
              startStr,
              todayStr
            );
            days = elapsedDays;
            accrued = Number(((it.accumulatedInterest || 0) + newAccrued).toFixed(2));
          }

          const isHighlighted = !!(highlightedId && String(it.id) === String(highlightedId));

          return (
            <div
              id={`planned-item-${it.id}`}
              key={it.id || idx}
              className={`p-4 rounded-2xl border bg-slate-900 flex flex-col gap-3 transition-all hover:border-slate-700 ${borderCol} ${
                isHighlighted 
                  ? "ring-2 ring-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.4)] bg-sky-950/20 scale-[1.015] border-sky-500/80" 
                  : ""
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1 truncate text-xs font-semibold">
                  <div className="flex items-center gap-1.5 text-white text-sm font-bold truncate">
                    {it.isRegular && <Repeat className="w-3.5 h-3.5 text-sky-400 inline" />}
                    <span className="truncate">{it.name}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-slate-400 font-mono text-[11px]">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>Термін: {formatDateUkr(it.dueDate || it.date)}</span>
                    {it.isInterest && it.interestStartDate && (
                      <span className="text-[10px] text-emerald-400/90 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40 font-bold">
                        % з {formatDateUkr(it.interestStartDate)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className={`text-base font-extrabold ${bgTextCol}`}>
                    {sumSign} {Number(it.sum).toFixed(2)} {getCurrencySymbol(currentCurrency)}
                  </span>
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl">
                    <button
                      onClick={() => onFulfill(it)}
                      className="p-1.5 hover:bg-emerald-500/20 text-emerald-400 rounded-lg cursor-pointer"
                      title="Виконати зараз"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleEditInit(it)}
                      className="p-1.5 hover:bg-sky-500/20 text-sky-400 rounded-lg cursor-pointer"
                      title="Редагувати"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {deletingItemId === it.id ? (
                      <div className="flex items-center gap-1 bg-rose-950/80 p-0.5 rounded-lg border border-rose-600/50 animate-fadeIn">
                        <button
                          onClick={() => {
                            onDelete(it.id || "", itemType);
                            setDeletingItemId(null);
                          }}
                          className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-black rounded cursor-pointer"
                          title="Підтвердити видалення"
                        >
                          Так
                        </button>
                        <button
                          onClick={() => setDeletingItemId(null)}
                          className="px-1.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] rounded cursor-pointer"
                          title="Скасувати"
                        >
                          Ні
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingItemId(it.id)}
                        className="p-1.5 hover:bg-red-500/20 text-red-400 rounded-lg cursor-pointer"
                        title="Видалити"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Interest calculation details */}
              {it.isInterest && (
                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        it.interestMode === "give" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                      }`}>
                        {it.interestMode === "give" ? "📈 Дано під % (Депозит)" : "📥 Взято під % (Кредит)"}
                      </span>
                      <span className="text-slate-400 font-bold">
                        {it.interestRate}% {it.interestPeriod === "monthly" ? "в місяць" : "річних"}
                      </span>
                    </div>
                    <p className="text-slate-500 font-medium">
                      Нараховано за <span className="text-sky-400 font-bold font-mono">{days}</span> дн. відсотки:{" "}
                      <span className="text-white font-extrabold font-mono">{accrued}{getCurrencySymbol(currentCurrency)}</span>
                    </p>
                  </div>

                  {onFulfillInterest && (
                    <button
                      onClick={() => {
                        setSelectedInterestItem(it);
                        const todayD = new Date();
                        const todayStr = todayD.getFullYear() + '-' + String(todayD.getMonth() + 1).padStart(2, '0') + '-' + String(todayD.getDate()).padStart(2, '0');
                        setFulfillmentTargetDate(todayStr);
                      }}
                      disabled={accrued <= 0}
                      className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer select-none ${
                        accrued <= 0
                          ? "bg-slate-800/50 text-slate-600 border border-slate-800/30 cursor-not-allowed"
                          : it.interestMode === "give"
                          ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-md shadow-emerald-500/10"
                          : "bg-rose-500 hover:bg-rose-400 text-white shadow-md shadow-rose-500/10"
                      }`}
                      title={accrued <= 0 ? "Відсотки ще не накопичились (потрібно хоча б 1 день)" : "Отримати чи віддати нараховані відсотки"}
                    >
                      {it.interestMode === "give" ? "📥 Отримати %" : "📤 Віддати %"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Period selection Modal */}
      {selectedInterestItem && (() => {
        const it = selectedInterestItem;
        const startStr = it.interestStartDate || it.date;
        const todayD = new Date();
        const todayStr = todayD.getFullYear() + '-' + String(todayD.getMonth() + 1).padStart(2, '0') + '-' + String(todayD.getDate()).padStart(2, '0');
        const targetDate = fulfillmentTargetDate || todayStr;
        const { accrued: newAccrued, elapsedDays } = calculateAccruedInterest(
          Number(it.sum) || 0,
          Number(it.interestRate) || 0,
          it.interestPeriod,
          startStr,
          targetDate
        );
        const calculatedAccrued = Number(((it.accumulatedInterest || 0) + newAccrued).toFixed(2));

        const isGive = it.interestMode === "give";

        const getDaysUkrWordLocal = (n: number) => {
          const mod10 = n % 10;
          const mod100 = n % 100;
          if (mod10 === 1 && mod100 !== 11) return "день";
          if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дні";
          return "днів";
        };

        return (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-[400px] animate-scaleIn shadow-2xl flex flex-col gap-4 text-left max-h-[92vh] overflow-y-auto">
              <h3 className="font-extrabold text-white text-base flex items-center gap-2 border-b border-slate-800 pb-3">
                <span>📅 Розрахунок відсотків по договору</span>
              </h3>

              <div className="flex flex-col gap-1 text-xs">
                <span className="text-slate-400 font-bold">Договір:</span>
                <span className="text-white font-black truncate bg-slate-950 px-3 py-2 rounded-xl border border-slate-800/40">
                  {it.name.replace("Нараховані відсотки: ", "")}
                </span>
              </div>

              {/* Блок дат та ставки */}
              <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-950/50 p-3 rounded-2xl border border-slate-800/50">
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-400 font-extrabold text-[11px]">🗓 Початок розрахунку:</span>
                  <span className="text-sky-400 font-black font-mono text-sm">{formatDateUkr(startStr)}</span>
                  <span className="text-[10px] text-slate-500 leading-tight">Дата ост. виплати / укладання</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-slate-400 font-extrabold text-[11px]">📈 Ставка відсотків:</span>
                  <span className="text-emerald-400 font-black font-mono text-sm">{it.interestRate}%</span>
                  <span className="text-[10px] text-slate-500 leading-tight">{it.interestPeriod === "monthly" ? "щомісяця" : "річних"}</span>
                </div>
              </div>

              {it.dueDate && (
                <div className="flex items-center justify-between text-xs bg-slate-950/40 px-3 py-2 rounded-xl border border-slate-800/40">
                  <span className="text-slate-400 font-bold">🏁 Кінцевий термін договору (тіло):</span>
                  <span className="text-amber-400 font-black font-mono">{formatDateUkr(it.dueDate)}</span>
                </div>
              )}

              {/* Вибір кінцевої дати нарахування */}
              <div className="flex flex-col gap-1.5 bg-slate-950/30 p-3 rounded-2xl border border-slate-800/40">
                <label className="text-xs font-extrabold text-slate-300 uppercase tracking-wide">
                  🎯 Нарахувати по дату (включно):
                </label>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Оберіть день, по який включно підраховуються відсотки:
                </p>
                <div className="flex flex-wrap gap-1.5 my-1">
                  <button
                    type="button"
                    onClick={() => setFulfillmentTargetDate(todayStr)}
                    className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                      targetDate === todayStr 
                        ? "bg-violet-600 text-white border-violet-500" 
                        : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                    }`}
                  >
                    Сьогодні ({formatDateUkr(todayStr)})
                  </button>
                  {it.dueDate && it.dueDate !== todayStr && (
                    <button
                      type="button"
                      onClick={() => setFulfillmentTargetDate(it.dueDate)}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                        targetDate === it.dueDate 
                          ? "bg-violet-600 text-white border-violet-500" 
                          : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700"
                      }`}
                    >
                      До терміну ({formatDateUkr(it.dueDate)})
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={fulfillmentTargetDate || todayStr}
                    min={startStr}
                    onChange={(e) => setFulfillmentTargetDate(e.target.value)}
                    className="flex-1 bg-slate-800 border-2 border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                  />
                  <span className="text-xs text-sky-400 font-mono font-bold whitespace-nowrap bg-slate-950 px-2.5 py-2 rounded-xl border border-slate-800">
                    {formatDateUkr(targetDate)}
                  </span>
                </div>
              </div>

              {/* Підсумок нарахування за період */}
              <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-800/60 flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400 font-bold">Період розрахунку:</span>
                  <span className="text-sky-300 font-bold font-mono text-xs">
                    з {formatDateUkr(startStr)} по {formatDateUkr(targetDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-slate-400 font-bold">Днів у роботі:</span>
                  <span className="text-sky-400 font-black font-mono text-sm">
                    {`${elapsedDays} ${getDaysUkrWordLocal(elapsedDays)}`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs border-t border-slate-800/50 pt-2 font-semibold">
                  <span className="text-slate-400 font-bold">Відсотки за цей період:</span>
                  <span className={`font-black text-base font-mono ${isGive ? "text-emerald-400" : "text-rose-400"}`}>
                    {calculatedAccrued.toFixed(2)} {getCurrencySymbol(currentCurrency)}
                  </span>
                </div>
                {Boolean(it.accumulatedInterest && it.accumulatedInterest > 0) && (
                  <div className="text-[10px] text-amber-400 font-medium text-right -mt-1">
                    (включаючи {it.accumulatedInterest.toFixed(2)} {getCurrencySymbol(currentCurrency)} невиплачених % з попереднього періоду)
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 font-bold">
                <button
                  type="button"
                  onClick={() => setSelectedInterestItem(null)}
                  className="py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-all active:scale-[0.98]"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  disabled={calculatedAccrued <= 0}
                  onClick={() => {
                    if (onFulfillInterest) {
                      onFulfillInterest(it, calculatedAccrued, targetDate);
                    }
                    setSelectedInterestItem(null);
                  }}
                  className={`py-3 font-black rounded-xl text-xs text-white shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
                    isGive ? "bg-emerald-500 hover:bg-emerald-400" : "bg-rose-500 hover:bg-rose-400"
                  }`}
                >
                  {isGive ? "📥 Розрахувати та отримати %" : "📤 Розрахувати та виплатити %"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
