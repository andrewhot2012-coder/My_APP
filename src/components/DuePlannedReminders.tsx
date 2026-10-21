import React, { useEffect } from "react";
import { Bell, Repeat, AlertTriangle } from "lucide-react";
import { calculateAccruedInterest, parseDateString, formatDateUkr } from "../googleSheets";

interface ReminderProps {
  allPlanned: any[];
  currentCurrency: string;
  onFulfill: (p: any) => void;
}

export const DuePlannedReminders: React.FC<ReminderProps> = ({
  allPlanned,
  currentCurrency,
  onFulfill
}) => {
  const getDiffDays = (dateStr: string) => {
    if (!dateStr) return 0;
    const parsed = parseDateString(dateStr);
    if (!parsed) return 0;
    const [y, m, d] = parsed;
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const targetUtc = Date.UTC(y, m - 1, d);
    return Math.round((targetUtc - todayUtc) / 86400000);
  };

  const dueItems = allPlanned.filter(p => {
    const dateToUse = (p.isInterest && p.dueDate) ? p.dueDate : p.date;
    if (!dateToUse) return false;
    const diffDays = getDiffDays(dateToUse);
    // Overdue or due today/tomorrow (<= 1 day left)
    return diffDays <= 1;
  });

  useEffect(() => {
    if (dueItems.length > 0) {
      try {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtxClass) return;
        const ctx = new AudioCtxClass();
        const osc = ctx.createOscillator();
        osc.connect(ctx.destination);
        osc.frequency.value = 520;
        osc.onended = () => {
          ctx.close().catch(() => {});
        };
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } catch (e) {
        console.warn("Audio Context beep blocked by browser permissions", e);
      }
    }
  }, [dueItems.length]);

  const getCurrencySymbol = (curr?: string) => {
    if (curr === "USD") return "$";
    if (curr === "EUR") return "€";
    return "₴";
  };


  const calculateAccruedToday = (p: any) => {
    if (!p.isInterest) return p.sum;
    const startStr = p.interestStartDate || p.date;
    if (!startStr) return 0;
    
    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    const { accrued: newAccrued } = calculateAccruedInterest(
      Number(p.sum) || 0,
      Number(p.interestRate) || 0,
      p.interestPeriod,
      startStr,
      todayStr
    );
    return Number(((p.accumulatedInterest || 0) + newAccrued).toFixed(2));
  };

  if (dueItems.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 p-1 bg-slate-950/40 rounded-xl border border-slate-800/40 max-h-[220px] overflow-y-auto">
      {dueItems.map((p, idx) => {
        const dateToUse = (p.isInterest && p.dueDate) ? p.dueDate : p.date;
        const diffDays = dateToUse ? getDiffDays(dateToUse) : 0;

        const isOverdue = diffDays < 0;

        const defaultBgCol = p.type === "expense" ? "bg-red-500/10 border-red-500/20 text-red-200" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-200";
        
        // Overdue styling with visible red border & glow
        const itemStyle = isOverdue
          ? "bg-red-950/50 border-rose-500/80 ring-1 ring-rose-500/60 shadow-md shadow-rose-950/50 text-rose-100"
          : defaultBgCol;

        const sumSign = p.type === "expense" ? "-" : "+";
        const cSym = getCurrencySymbol(p.currency);
        
        const displaySum = p.isInterest ? calculateAccruedToday(p) : p.sum;
        const displayName = p.isInterest 
          ? `Сплата % по договору: "${p.name.replace("Нараховані відсотки: ", "")}"`
          : p.name;
          
        let dueLabel = "";
        if (isOverdue) {
          dueLabel = `Прострочено! (${formatDateUkr(dateToUse)})`;
        } else if (diffDays === 0) {
          dueLabel = `Сьогодні (${formatDateUkr(dateToUse)})`;
        } else if (diffDays === 1) {
          dueLabel = `Завтра (${formatDateUkr(dateToUse)})`;
        } else if (dateToUse) {
          dueLabel = `до ${formatDateUkr(dateToUse)}`;
        }

        return (
          <button
            key={p.id || idx}
            onClick={() => onFulfill(p)}
            className={`flex items-center justify-between py-1 px-2 sm:py-1.5 sm:px-2.5 rounded-lg border text-[11px] sm:text-xs font-semibold transition-all hover:scale-[1.005] active:scale-95 text-left w-full gap-1.5 ${itemStyle}`}
          >
            <div className="flex items-center gap-1.5 truncate pr-1 min-w-0">
              {isOverdue ? (
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 animate-pulse flex-shrink-0" />
              ) : (
                <Bell className="w-3.5 h-3.5 text-amber-400 animate-bounce flex-shrink-0" />
              )}
              {p.isRegular && <Repeat className="w-3 h-3 text-sky-400 inline flex-shrink-0" />}
              <span className="truncate text-[11px] sm:text-xs leading-tight">
                {displayName}
                {isOverdue ? (
                  <span className="text-[9px] sm:text-[10px] bg-rose-500/30 text-rose-200 border border-rose-500/50 px-1 py-0 rounded font-black ml-1 inline-block">
                    {dueLabel}
                  </span>
                ) : (
                  <span className="text-[9px] sm:text-[10px] text-amber-400/90 ml-1 font-bold">({dueLabel})</span>
                )}
              </span>
            </div>
            <span className={`font-mono font-black text-[11px] sm:text-xs flex-shrink-0 whitespace-nowrap px-1.5 py-0.5 rounded-md border ${
              isOverdue ? "bg-rose-900/60 border-rose-400/40 text-white" : "bg-black/30 border-white/10"
            }`}>
              {sumSign}
              {Number(displaySum).toFixed(2)}{cSym}
            </span>
          </button>
        );
      })}
    </div>
  );
};
