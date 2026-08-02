"use client";
import { useLanguage } from "@/lib/LanguageContext";

export default function LanguageToggle() {
  const { lang, toggleLang } = useLanguage();

  return (
    <button
      onClick={toggleLang}
      style={{
        position: "fixed",
        top: 8,
        right: 8,
        zIndex: 9999,
        padding: "6px 10px",
        borderRadius: 20,
        background: "#333",
        color: "white",
        border: "1px solid #666",
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      🌐 {lang === "bn" ? "EN" : "বাং"}
    </button>
  );
}