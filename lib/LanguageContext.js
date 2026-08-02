"use client";
import { createContext, useContext, useState, useEffect } from "react";
import { translations } from "@/lib/translations";

const LanguageContext = createContext({
  lang: "bn",
  setLang: () => {},
  toggleLang: () => {},
  t: (key) => key,
});

const STORAGE_KEY = "trustkhata_lang";

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("bn"); // ---- ডিফল্ট ভাষা বাংলা ----

  // ---- আগে থেকে সেভ করা পছন্দ থাকলে সেটা লোড করা ----
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "bn" || saved === "en") {
        setLangState(saved);
      }
    } catch (e) {
      // localStorage না থাকলেও যেন crash না করে
    }
  }, []);

  const setLang = (newLang) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch (e) {}
  };

  const toggleLang = () => {
    setLang(lang === "bn" ? "en" : "bn");
  };

  // ---- t("key") লিখলেই বর্তমান ভাষার লেখাটা পাওয়া যাবে ----
  const t = (key) => translations[lang]?.[key] ?? translations.bn[key] ?? key;

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}