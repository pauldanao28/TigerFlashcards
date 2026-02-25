"use client";
import { motion } from "framer-motion";

interface LanguageToggleProps {
  language: 'en' | 'jp';
  setLanguage: (lang: 'en' | 'jp') => void;
}

export default function LanguageToggle({ language, setLanguage }: LanguageToggleProps) {
  return (
    <div className="flex items-center justify-center p-4">
      <div 
        className="relative flex w-48 h-12 p-1 bg-gray-200 dark:bg-gray-800 rounded-full cursor-pointer"
        onClick={() => setLanguage(language === 'en' ? 'jp' : 'en')}
      >
        {/* The Animated "Pill" Background */}
        <motion.div
          className="absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] bg-white dark:bg-orange-500 rounded-full shadow-md"
          initial={false}
          animate={{ x: language === 'en' ? 0 : '100%' }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />

        {/* Labels */}
        <div className="relative z-10 flex w-full text-sm font-bold uppercase">
          <div className={`flex-1 flex items-center justify-center transition-colors ${language === 'en' ? 'text-orange-600' : 'text-gray-500'}`}>
            English
          </div>
          <div className={`flex-1 flex items-center justify-center transition-colors ${language === 'jp' ? 'text-orange-600' : 'text-gray-500'}`}>
            日本語
          </div>
        </div>
      </div>
    </div>
  );
}