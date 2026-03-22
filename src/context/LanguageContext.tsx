"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { translations } from "../lib/languages";

const LanguageContext = createContext<any>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<"en" | "jp">("en");
  const [userId, setUserId] = useState<string | null>(null);

  // 1. Get the user on mount
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);

        // 2. Immediately fetch their preference
        const { data } = await supabase
          .from("profiles")
          .select("preferred_language")
          .eq("id", user.id)
          .single();

        if (data?.preferred_language) {
          setLangState(data.preferred_language as "en" | "jp");
        }
      }
    };
    getUser();
  }, []);

  const setLang = async (newLang: "en" | "jp") => {
    setLangState(newLang);

    if (userId) {
      const { error } = await supabase
        .from("profiles")
        .update({ preferred_language: newLang })
        .eq("id", userId);

      if (error) console.error("Supabase Error:", error);
    }
  };

  const t = translations[lang] || translations["en"];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

// Safety check: This prevents the "Cannot destructure property 't' of null" error
export const useLang = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    // Return a fallback so the app doesn't crash while loading
    return { lang: "en", setLang: () => {}, t: translations["en"] };
  }
  return context;
};
