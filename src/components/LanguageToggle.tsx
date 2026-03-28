"use client";
import { motion } from "framer-motion";

export default function LanguageToggle({ language, setLanguage }: any) {
  return (
    <div
      /* h-full lets it obey the h-8 (mobile) or h-10 (desktop) from the parent */
      className="relative flex w-full h-full p-1 bg-white border border-slate-100 shadow-sm rounded-full cursor-pointer select-none"
      onClick={() => setLanguage(language === "en" ? "jp" : "en")}
    >
      <motion.div
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-slate-100 rounded-full"
        initial={false}
        animate={{ x: language === "en" ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />

      <div className="relative z-10 flex w-full text-[10px] md:text-[11px] font-black uppercase tracking-tight">
        {/* English Slot */}
        <div
          className={`flex-1 flex items-center justify-center transition-colors ${
            language === "en" ? "text-indigo-600" : "text-slate-400"
          }`}
        >
          <span className="md:hidden">EN</span>
          <span className="hidden md:block">English</span>
        </div>

        {/* Japanese Slot */}
        <div
          className={`flex-1 flex items-center justify-center transition-colors ${
            language === "jp" ? "text-indigo-600" : "text-slate-400"
          }`}
        >
          <span className="md:hidden">JP</span>
          <span className="hidden md:block">日本語</span>
        </div>
      </div>
    </div>
  );
}
