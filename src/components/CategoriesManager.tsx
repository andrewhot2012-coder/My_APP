import React, { useState, useEffect } from "react";
import { Settings, Trash2, PlusCircle, ArrowLeft, AlertCircle, X, Check } from "lucide-react";
import { getCustomCategories } from "../googleSheets";

interface CategoriesManagerProps {
  categories: string[];
  onBack: () => void;
  onSaveCategory: (name: string) => void;
  onDeleteCategory: (name: string) => void;
}

export const CategoriesManager: React.FC<CategoriesManagerProps> = ({
  categories,
  onBack,
  onSaveCategory,
  onDeleteCategory
}) => {
  const [newCat, setNewCat] = useState("");
  const [deletingCat, setDeletingCat] = useState<string | null>(null);
  
  // Keep local list in sync with props or fallback to localStorage
  const [list, setList] = useState<string[]>(() => {
    if (categories && categories.length > 0) return categories;
    return getCustomCategories();
  });

  useEffect(() => {
    if (categories && categories.length > 0) {
      setList(categories);
    } else {
      setList(getCustomCategories());
    }
  }, [categories]);

  const handleAddLocal = () => {
    const val = newCat.trim();
    if (!val) return;
    onSaveCategory(val);
    setList(prev => prev.includes(val) ? prev : [...prev, val]);
    setNewCat("");
  };

  const handleConfirmDelete = (cat: string) => {
    onDeleteCategory(cat);
    setList(prev => prev.filter(c => (c || "").trim().toLowerCase() !== cat.trim().toLowerCase()));
    setDeletingCat(null);
  };

  return (
    <div className="flex flex-col gap-4 text-left animate-fadeIn">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <h2 className="text-xl font-black text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-sky-400" />
          Статті витрат / доходів
        </h2>
        <button
          onClick={onBack}
          className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1 bg-slate-800 px-2.5 py-1.5 rounded-lg active:scale-95 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад до форми
        </button>
      </div>

      {/* Add form */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col gap-3 shadow-lg">
        <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Створити нову статтю</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddLocal();
              }
            }}
            placeholder="Назва статті (наприклад: Паливо, Оренда...)"
            className="flex-1 bg-slate-800 border-2 border-slate-700 focus:border-sky-400 p-2.5 rounded-xl text-white outline-none text-sm transition-all"
          />
          <button
            onClick={handleAddLocal}
            className="p-3 bg-sky-500 hover:bg-sky-400 text-white rounded-xl transition-all active:scale-95 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/20"
            title="Додати статтю"
          >
            <PlusCircle className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col gap-2.5 max-h-[380px] overflow-y-auto pr-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Наявні статті ({list.length}):</span>
          <span className="text-[11px] text-slate-500 font-medium">Натисніть на кошик для видалення</span>
        </div>

        {list.length === 0 && (
          <div className="text-center py-8 bg-slate-900/40 border border-slate-800/60 rounded-2xl text-slate-500 font-semibold text-sm">
            Жодної статті не створено. Введіть назву вище та натисніть "+".
          </div>
        )}

        {list.map((cat, idx) => {
          const isDeleting = deletingCat === cat;

          return (
            <div
              key={`${cat}-${idx}`}
              className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                isDeleting
                  ? "bg-rose-950/20 border-rose-600/50 shadow-lg shadow-rose-950/30"
                  : "bg-slate-950/40 border-slate-800/80 hover:border-slate-700/80"
              }`}
            >
              <span className="text-sm font-bold text-white flex items-center gap-2 truncate">
                <span className="text-base">📁</span>
                <span className="truncate">{cat}</span>
              </span>

              {isDeleting ? (
                <div className="flex items-center gap-1.5 flex-shrink-0 animate-fadeIn">
                  <span className="text-xs text-rose-300 font-bold hidden sm:inline mr-1">
                    Видалити?
                  </span>
                  <button
                    onClick={() => handleConfirmDelete(cat)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl transition-all active:scale-95 shadow-md shadow-rose-600/30 flex items-center gap-1 cursor-pointer"
                    title="Підтвердити видалення"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Так
                  </button>
                  <button
                    onClick={() => setDeletingCat(null)}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                    title="Скасувати"
                  >
                    <X className="w-3.5 h-3.5" />
                    Ні
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeletingCat(cat)}
                  className="p-2.5 bg-slate-900 border border-slate-800 hover:bg-rose-950/40 hover:border-rose-700/60 hover:text-rose-400 text-slate-400 rounded-xl transition-all active:scale-95 cursor-pointer flex-shrink-0"
                  title={`Видалити статтю "${cat}"`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
