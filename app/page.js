"use client";
import { useLanguage } from "@/lib/LanguageContext";

export default function HomePage() {
  const { t } = useLanguage();
  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto", textAlign: "center" }}>
      <h1 style={{ marginTop: 40 }}>📒 Digital Halkhata</h1>
      <p style={{ color: "#999", marginBottom: 24 }}>{t("homeTagline")}</p>

      {/* ---- নতুন: নতুন ব্যবহারকারীর বিশ্বাস অর্জনের জন্য সংক্ষিপ্ত "কীভাবে কাজ করে" ---- */}
      <div
        style={{
          background: "#1a1a1a",
          borderRadius: 8,
          padding: 16,
          marginBottom: 32,
          textAlign: "left",
        }}
      >
        <p style={{ margin: "0 0 10px 0", fontSize: 14 }}>
          🏪 {t("howItWorks1")}
        </p>
        <p style={{ margin: "0 0 10px 0", fontSize: 14 }}>
          ✅ {t("howItWorks2")}
        </p>
        <p style={{ margin: 0, fontSize: 14 }}>
          🔒 {t("howItWorks3")}
        </p>
      </div>

      <a
        href="/login"
        style={{
          display: "block",
          padding: 16,
          background: "#2563eb",
          color: "white",
          fontWeight: "bold",
          textDecoration: "none",
          marginBottom: 16,
          borderRadius: 6,
        }}
      >
        🏪 {t("joinAsShopkeeper")}
      </a>

      <a
        href="/customer-login"
        style={{
          display: "block",
          padding: 16,
          background: "#16a34a",
          color: "white",
          fontWeight: "bold",
          textDecoration: "none",
          borderRadius: 6,
        }}
      >
        👤 {t("joinAsCustomer")}
      </a>
    </div>
  );
}