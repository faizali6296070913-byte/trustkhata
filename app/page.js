"use client";
import { useLanguage } from "@/lib/LanguageContext";

export default function HomePage() {
  const { t } = useLanguage();
  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto", textAlign: "center" }}>
      <h1 style={{ marginTop: 60 }}>📒 Digital Halkhata</h1>
      <p style={{ color: "#999", marginBottom: 40 }}>{t("homeTagline")}</p>

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
        }}
      >
        👤 {t("joinAsCustomer")}
      </a>
    </div>
  );
}