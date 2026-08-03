"use client";
import { createContext, useContext, useState, useEffect, useRef } from "react";
import { translations } from "@/lib/translations";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { normalizePhone } from "@/lib/phone";

const LanguageContext = createContext({
  lang: "bn",
  setLang: () => {},
  toggleLang: () => {},
  t: (key) => key,
});

const STORAGE_KEY = "trustkhata_lang";

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("bn"); // ---- ডিফল্ট ভাষা বাংলা ----

  // ---- নতুন: লগইন করা থাকলে কোন Firestore ডকুমেন্টে ভাষা সেভ করতে হবে তা মনে রাখা ----
  // (shopkeeper হলে shopkeepers/{uid}, কাস্টমার হলে customers/{phoneDigits})
  const prefDocRef = useRef(null);

  // ---- ধাপ ১: browser এ আগে থেকে সেভ করা পছন্দ থাকলে সাথে সাথেই লোড করা (লগইন চেক শেষ হওয়ার আগেই, দ্রুত দেখানোর জন্য) ----
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

  // ---- নতুন: লগইন করা থাকলে, একাউন্টে সেভ করা ভাষা প্রেফারেন্স খুঁজে এনে সেট করা ----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        prefDocRef.current = null;
        return;
      }
      try {
        // ---- আগে দোকানদার হিসেবে চেক করা ----
        const shopSnap = await getDoc(doc(db, "shopkeepers", user.uid));
        if (shopSnap.exists()) {
          prefDocRef.current = { collection: "shopkeepers", id: user.uid };
          const saved = shopSnap.data().preferredLanguage;
          if (saved === "bn" || saved === "en") {
            setLangState(saved);
            try {
              localStorage.setItem(STORAGE_KEY, saved);
            } catch (e) {}
          }
          return;
        }

        // ---- দোকানদার না হলে, কাস্টমার হিসেবে চেক করা (ফোন নম্বর দিয়ে) ----
        if (user.phoneNumber) {
          const digits = normalizePhone(user.phoneNumber);
          const custSnap = await getDoc(doc(db, "customers", digits));
          if (custSnap.exists()) {
            prefDocRef.current = { collection: "customers", id: digits };
            const saved = custSnap.data().preferredLanguage;
            if (saved === "bn" || saved === "en") {
              setLangState(saved);
              try {
                localStorage.setItem(STORAGE_KEY, saved);
              } catch (e) {}
            }
          }
        }
      } catch (err) {
        console.error("ভাষা প্রেফারেন্স লোড করতে সমস্যা হয়েছে:", err);
      }
    });
    return () => unsub();
  }, []);

  const setLang = (newLang) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch (e) {}

    // ---- নতুন: লগইন করা থাকলে Firestore এও সেভ করা, যাতে অন্য ডিভাইসেও একই ভাষা মনে থাকে ----
    if (prefDocRef.current) {
      setDoc(
        doc(db, prefDocRef.current.collection, prefDocRef.current.id),
        { preferredLanguage: newLang },
        { merge: true }
      ).catch((err) => {
        console.error("ভাষা প্রেফারেন্স সেভ করতে সমস্যা হয়েছে:", err);
      });
    }
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