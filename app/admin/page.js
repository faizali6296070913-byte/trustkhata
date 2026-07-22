"use client";

export default function HomePage() {
  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto", textAlign: "center" }}>
      <h1 style={{ marginTop: 60 }}>📒 Digital Halkhata</h1>
      <p style={{ color: "#999", marginBottom: 40 }}>বাকির হিসাব রাখুন, বিশ্বাসের সাথে</p>

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
        🏪 দোকানদার হিসেবে যোগ দিন
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
        👤 কাস্টমার হিসেবে যোগ দিন
      </a>
    </div>
  );
}