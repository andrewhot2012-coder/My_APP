import React, { useState, useEffect, useCallback } from "react";
import {
  Coins,
  X,
  Wallet,
  Users,
  CheckCircle2,
  PlusCircle,
  ArrowRight,
  ArrowLeft,
  Info,
  ShieldCheck,
  Building2,
  RefreshCw,
  Plus,
  Scale
} from "lucide-react";
import { InitData, BankBalances } from "../types";
import { AutocompleteInput } from "./AutocompleteInput";

interface InitialDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  initData: InitData | null;
  currentCurrency: string;
  onSaveAdjustment: (bankKey: string, currentBalance: number, targetBalance: number, comment?: string) => Promise<void>;
  onSaveInitialDebt: (contractorName: string, type: "owe_us" | "we_owe", sum: number, debtCurrency: string, comment?: string) => Promise<void>;
  loading?: boolean;
}

export const InitialDataModal: React.FC<InitialDataModalProps> = ({
  isOpen,
  onClose,
  initData,
  currentCurrency,
  onSaveAdjustment,
  onSaveInitialDebt,
  loading = false
}) => {
  const [activeTab, setActiveTab] = useState<"balances" | "debts">("balances");
  const [selectedCurrency, setSelectedCurrency] = useState<"UAH" | "USD" | "EUR">(
    (currentCurrency as "UAH" | "USD" | "EUR") || "UAH"
  );

  // Account balance state
  const [editingBank, setEditingBank] = useState<string | null>(null);
  const [targetSumInput, setTargetSumInput] = useState<string>("");
  const [savingAccount, setSavingAccount] = useState<string | null>(null);

  // Debt state
  const [debtType, setDebtType] = useState<"owe_us" | "we_owe">("owe_us");
  const [contractorName, setContractorName] = useState<string>("");
  const [debtSum, setDebtSum] = useState<string>("");
  const [debtCurrency, setDebtCurrency] = useState<"UAH" | "USD" | "EUR">(
    (currentCurrency as "UAH" | "USD" | "EUR") || "UAH"
  );
  const [debtComment, setDebtComment] = useState<string>("");
  const [savingDebt, setSavingDebt] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCurrency((currentCurrency as "UAH" | "USD" | "EUR") || "UAH");
    setDebtCurrency((currentCurrency as "UAH" | "USD" | "EUR") || "UAH");
  }, [currentCurrency]);

  const handleStepBack = useCallback(() => {
    // 1) If editing a bank account balance input -> cancel edit mode
    if (editingBank !== null) {
      setEditingBank(null);
      setTargetSumInput("");
      return;
    }

    // 2) If in "debts" tab and user filled some form inputs -> reset inputs
    if (activeTab === "debts" && (contractorName.trim() !== "" || debtSum.trim() !== "" || debtComment.trim() !== "")) {
      setContractorName("");
      setDebtSum("");
      setDebtComment("");
      return;
    }

    // 3) If in "debts" tab (form is empty/reset) -> switch back to "balances" tab
    if (activeTab === "debts") {
      setActiveTab("balances");
      return;
    }

    // 4) Root level ("balances" tab with no editing active) -> close modal
    onClose();
  }, [editingBank, activeTab, contractorName, debtSum, debtComment, onClose]);

  useEffect(() => {
    const handleIntercept = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (isOpen) {
        customEvent.detail.preventScreenTransition();
        handleStepBack();
      }
    };
    window.addEventListener("app-back-intercept", handleIntercept);
    return () => window.removeEventListener("app-back-intercept", handleIntercept);
  }, [isOpen, handleStepBack]);

  if (!isOpen || !initData) return null;

  const getSymbol = (c: string) => {
    if (c === "UAH") return "₴";
    if (c === "USD") return "$";
    if (c === "EUR") return "€";
    return c;
  };

  const aliases = initData.allAliases[selectedCurrency] || {
    "Готівка": "Готівка",
    "Банк 1": "Банк 1",
    "Банк 2": "Банк 2",
    "Банк 3": "Банк 3",
    "Банк 4": "Банк 4",
    "Банк 5": "Банк 5"
  };

  const bankDetails = initData.allBankDetails?.[selectedCurrency] || {
    "Готівка": 0,
    "Банк 1": 0,
    "Банк 2": 0,
    "Банк 3": 0,
    "Банк 4": 0,
    "Банк 5": 0
  };

  const bankKeys: (keyof BankBalances)[] = [
    "Готівка",
    "Банк 1",
    "Банк 2",
    "Банк 3",
    "Банк 4",
    "Банк 5"
  ];

  const handleSaveAccountBalance = async (key: string) => {
    const targetVal = parseFloat(targetSumInput.replace(",", "."));
    if (isNaN(targetVal)) {
      alert("⚠️ Будь ласка, введіть коректну суму");
      return;
    }
    const currentVal = bankDetails[key as keyof BankBalances] || 0;
    setSavingAccount(key);
    try {
      await onSaveAdjustment(key, currentVal, targetVal, "Початковий залишок");
      setEditingBank(null);
      setTargetSumInput("");
      setSuccessMessage(`✅ Залишок для "${aliases[key as keyof BankBalances] || key}" успішно оновлено!`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (e: any) {
      alert("Помилка збереження: " + e.message);
    } finally {
      setSavingAccount(null);
    }
  };

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const cName = contractorName.trim();
    if (!cName) {
      alert("⚠️ Вкажіть ім'я або назву контрагента!");
      return;
    }
    const val = parseFloat(debtSum.replace(",", "."));
    if (isNaN(val) || val <= 0) {
      alert("⚠️ Будь ласка, введіть коректну суму боргу!");
      return;
    }

    setSavingDebt(true);
    try {
      await onSaveInitialDebt(
        cName,
        debtType,
        val,
        debtCurrency,
        debtComment.trim() || undefined
      );
      setContractorName("");
      setDebtSum("");
      setDebtComment("");
      setSuccessMessage(
        `✅ Початковий борг для "${cName}" (${val.toFixed(2)} ${getSymbol(debtCurrency)}) успішно додано!`
      );
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err: any) {
      alert("Помилка збереження боргу: " + err.message);
    } finally {
      setSavingDebt(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl text-left overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleStepBack}
              className="p-2 sm:px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer flex items-center gap-1.5 text-xs font-extrabold active:scale-95"
              title="Назад"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Назад</span>
            </button>

            <div className="flex items-center gap-2 border-l border-slate-800/80 pl-2.5">
              <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-400">
                <Scale className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div>
                <h2 className="text-sm sm:text-lg font-black text-white">Початкові дані</h2>
                <p className="text-[11px] text-slate-400 hidden sm:block">Залишки та початкові борги</p>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer active:scale-95"
            title="Закрити"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 p-2 gap-2">
          <button
            onClick={() => setActiveTab("balances")}
            className={`flex-1 py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "balances"
                ? "bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20"
                : "bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>💳 Залишки на рахунках</span>
          </button>
          <button
            onClick={() => setActiveTab("debts")}
            className={`flex-1 py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === "debts"
                ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20"
                : "bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>👤 Існуючі борги</span>
          </button>
        </div>

        {/* Banner notification */}
        {successMessage && (
          <div className="mx-4 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === "balances" && (
            <div className="space-y-5">
              {/* Currency Selector */}
              <div className="flex items-center justify-between bg-slate-950/60 p-2 rounded-2xl border border-slate-800">
                <span className="text-xs font-bold text-slate-400 pl-2">Оберіть валюту:</span>
                <div className="flex gap-1.5">
                  {(["UAH", "USD", "EUR"] as const).map((curr) => (
                    <button
                      key={curr}
                      onClick={() => {
                        setSelectedCurrency(curr);
                        setEditingBank(null);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                        selectedCurrency === curr
                          ? "bg-sky-500 text-slate-950"
                          : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {curr === "UAH" ? "🇺🇦 UAH" : curr === "USD" ? "🇺🇸 USD" : "🇪🇺 EUR"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-sky-300">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-sky-400" />
                <p className="leading-relaxed">
                  Встановіть початковий залишок коштів для кожного рахунку в обраній валютi (<b>{selectedCurrency}</b>). Система здійснить коригування залишку з відповідним записом в історію.
                </p>
              </div>

              {/* Account list */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {bankKeys.map((key) => {
                  const label = aliases[key] || key;
                  const currentVal = bankDetails[key] || 0;
                  const isEditing = editingBank === key;
                  const isCash = key === "Готівка";

                  return (
                    <div
                      key={key}
                      className={`p-4 rounded-2xl border transition-all ${
                        isEditing
                          ? "bg-slate-800/90 border-sky-500/50 shadow-lg shadow-sky-500/10"
                          : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{isCash ? "💵" : "🏦"}</span>
                          <span className="font-extrabold text-white text-sm truncate max-w-[140px]" title={label}>
                            {label}
                          </span>
                        </div>
                        <span className="text-xs font-black text-sky-400">
                          {currentVal.toFixed(2)} {getSymbol(selectedCurrency)}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="mt-3 space-y-2.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Новий початковий залишок ({getSymbol(selectedCurrency)}):
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              step="any"
                              value={targetSumInput}
                              onChange={(e) => setTargetSumInput(e.target.value)}
                              placeholder={currentVal.toString()}
                              autoFocus
                              className="bg-slate-900 border border-slate-700 focus:border-sky-400 rounded-xl px-3 py-2 text-white font-extrabold text-sm w-full outline-none"
                            />
                            <button
                              onClick={() => handleSaveAccountBalance(key)}
                              disabled={savingAccount === key || loading}
                              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1 transition-all cursor-pointer disabled:opacity-50"
                            >
                              {savingAccount === key ? (
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                "Зберегти"
                              )}
                            </button>
                            <button
                              onClick={() => setEditingBank(null)}
                              className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl text-xs cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingBank(key);
                            setTargetSumInput(currentVal.toString());
                          }}
                          className="mt-2 w-full py-2 bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <span>Встановити залишок</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "debts" && (
            <div className="space-y-6">
              {/* Form to add initial debt */}
              <form onSubmit={handleAddDebt} className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <PlusCircle className="w-4 h-4 text-amber-400" />
                    Додати початковий борг контрагента
                  </h3>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Новий запис
                  </span>
                </div>

                {/* Debt Type Selector */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDebtType("owe_us")}
                    className={`py-3 px-3 rounded-xl border text-xs font-black flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      debtType === "owe_us"
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/10"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-base">🟢</span>
                    <span>Нам винні (Боржник)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDebtType("we_owe")}
                    className={`py-3 px-3 rounded-xl border text-xs font-black flex flex-col items-center gap-1 transition-all cursor-pointer ${
                      debtType === "we_owe"
                        ? "bg-rose-500/15 border-rose-500 text-rose-300 shadow-md shadow-rose-500/10"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-base">🔴</span>
                    <span>Ми винні (Кредитор)</span>
                  </button>
                </div>

                {/* Inputs grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Contractor Name */}
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">
                      Контрагент (ПІБ або назва компанії) <span className="text-rose-400">*</span>
                    </label>
                    <AutocompleteInput
                      value={contractorName}
                      onChange={setContractorName}
                      suggestions={initData.names || []}
                      placeholder="Наприклад: ПЕТРЕНКО ІВАН або ТОВ 'АГРО'"
                      required
                    />
                  </div>

                  {/* Sum */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">
                      Сума боргу <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={debtSum}
                      onChange={(e) => setDebtSum(e.target.value)}
                      placeholder="0.00"
                      required
                      className="bg-slate-800 border border-slate-700 focus:border-amber-400 rounded-xl p-3.5 text-white font-extrabold text-base w-full outline-none transition-all"
                    />
                  </div>

                  {/* Currency */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">
                      Валюта боргу
                    </label>
                    <select
                      value={debtCurrency}
                      onChange={(e) => setDebtCurrency(e.target.value as any)}
                      className="bg-slate-800 border border-slate-700 focus:border-amber-400 rounded-xl p-3.5 text-white font-extrabold text-base w-full outline-none cursor-pointer"
                    >
                      <option value="UAH">🇺🇦 Гривня (UAH)</option>
                      <option value="USD">🇺🇸 Долар (USD)</option>
                      <option value="EUR">🇪🇺 Євро (EUR)</option>
                    </select>
                  </div>

                  {/* Comment */}
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-bold text-slate-400 mb-1.5 block">
                      Коментар (необов'язково)
                    </label>
                    <input
                      type="text"
                      value={debtComment}
                      onChange={(e) => setDebtComment(e.target.value)}
                      placeholder="Наприклад: Початковий борг за накладною №12"
                      className="bg-slate-800 border border-slate-700 focus:border-amber-400 rounded-xl p-3 text-white text-sm w-full outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingDebt || loading}
                  className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer active:scale-98 disabled:opacity-50"
                >
                  {savingDebt ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Збереження боргу...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      <span>Зберегти початковий борг</span>
                    </>
                  )}
                </button>
              </form>

              {/* Current Debtors Summary */}
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider">
                  Зареєстровані початкові борги ({currentCurrency}):
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Owe Us */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] font-black text-emerald-400 mb-2 border-b border-slate-800 pb-1">
                      🟢 Нам винні ({initData.debtors.oweUs.length}):
                    </div>
                    {initData.debtors.oweUs.length === 0 ? (
                      <div className="text-slate-500 text-[11px]">Немає зареєстрованих боржників</div>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {initData.debtors.oweUs.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-300 truncate max-w-[120px]" title={item.name}>
                              👤 {item.name}
                            </span>
                            <span className="font-extrabold text-emerald-400">
                              +{item.sum.toFixed(2)} {getSymbol(currentCurrency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* We Owe */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] font-black text-rose-400 mb-2 border-b border-slate-800 pb-1">
                      🔴 Ми винні ({initData.debtors.weOwe.length}):
                    </div>
                    {initData.debtors.weOwe.length === 0 ? (
                      <div className="text-slate-500 text-[11px]">Немає боргів перед кредиторами</div>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {initData.debtors.weOwe.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-300 truncate max-w-[120px]" title={item.name}>
                              👤 {item.name}
                            </span>
                            <span className="font-extrabold text-rose-400">
                              -{item.sum.toFixed(2)} {getSymbol(currentCurrency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-400 text-[11px]">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Всі дані автоматично синхронізуються з вашою Google Таблицею</span>
          </div>
          <button
            onClick={onClose}
            className="py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white font-extrabold rounded-xl transition-all cursor-pointer"
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
};
