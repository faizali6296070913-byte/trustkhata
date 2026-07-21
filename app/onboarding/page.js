"use client";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

export default function OnboardingPage() {
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const uid = auth.currentUser.uid;

      await updateDoc(doc(db, "shopkeepers", uid), {
        shopName,
        ownerName,
        shopAddress,
      });

      await updateDoc(doc(db, "users", uid), {
        name: ownerName,
      });

      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>দোকানের তথ্য দিন</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="দোকানের নাম"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          type="text"
          placeholder="মালিকের নাম"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          type="text"
          placeholder="দোকানের ঠিকানা"
          value={shopAddress}
          onChange={(e) => setShopAddress(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
          {submitting ? "সেভ হচ্ছে..." : "সেভ করুন"}
        </button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
    </div>
  );
}