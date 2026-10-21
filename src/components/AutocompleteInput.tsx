import React, { useState, useEffect, useRef } from "react";

interface AutocompleteInputProps {
  value: string;
  onChange: (val: string) => void;
  suggestions: string[];
  placeholder: string;
  className?: string;
  required?: boolean;
  error?: boolean;
}

export const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  value,
  onChange,
  suggestions,
  placeholder,
  className = "",
  required = false,
  error = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filtered, setFiltered] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const match = suggestions.filter(s =>
        s.toLowerCase().includes(value.toLowerCase())
      );
      setFiltered(match);
    }
  }, [value, suggestions, isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        required={required}
        className={`bg-slate-800 border-2 ${
          error 
            ? "border-red-500 bg-red-950/15 focus:border-red-500 focus:ring-2 focus:ring-red-500/50 shadow-[0_0_12px_rgba(239,68,68,0.25)]" 
            : required
              ? !value.trim()
                ? "border-amber-500 bg-amber-500/5 focus:border-amber-400 focus:ring-2 focus:ring-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                : "border-emerald-500/40 bg-emerald-500/5 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.08)]"
              : "border-slate-700 focus:border-sky-400"
        } p-3.5 rounded-xl text-white text-base w-full outline-none transition-all ${className}`}
      />
      {isOpen && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-black border-[3px] border-amber-400 rounded-2xl max-h-[220px] overflow-y-auto z-[999] shadow-[0_10px_30px_rgba(251,191,36,0.15)] divide-y-2 divide-slate-900 overflow-hidden">
          {filtered.map((item, idx) => (
            <div
              key={idx}
              onClick={() => {
                onChange(item);
                setIsOpen(false);
              }}
              className="p-4 cursor-pointer text-white font-extrabold text-base transition-all hover:bg-amber-400 hover:text-black active:bg-amber-500 bg-black"
            >
              👤 {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
