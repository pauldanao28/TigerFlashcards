"use client";
import { motion } from "framer-motion";

export default function LanguageToggle({ language, setLanguage }: any) {
  return (
    <div
      /* Obeying the h-8 or h-10 from parent, switching to the indigo theme */
      className="relative flex w-full h-full p-1 bg-white border border-slate-200 shadow-sm rounded-full cursor-pointer select-none"
      onClick={() => setLanguage(language === "en" ? "jp" : "en")}
    >
      {/* The Animated Indicator - Now Indigo with a shadow */}
      <motion.div
        className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-indigo-600 rounded-full shadow-md"
        initial={false}
        animate={{ x: language === "en" ? 0 : "100%" }}
        transition={{ type: "spring", stiffness: 500, damping: 35 }}
      />

      <div className="relative z-10 flex w-full text-[10px] md:text-[11px] font-black uppercase tracking-tight">
        {/* English Slot - Text turns white when active */}
        <div
          className={`flex-1 flex items-center justify-center transition-colors duration-200 ${
            language === "en" ? "text-white" : "text-slate-400"
          }`}
        >
          <span className="md:hidden">EN</span>
          <span className="hidden md:block">English</span>
        </div>

        {/* Japanese Slot - Text turns white when active */}
        <div
          className={`flex-1 flex items-center justify-center transition-colors duration-200 ${
            language === "jp" ? "text-white" : "text-slate-400"
          }`}
        >
          <span className="md:hidden">JP</span>
          <span className="hidden md:block">日本語</span>
        </div>
      </div>
    </div>
  );
}
