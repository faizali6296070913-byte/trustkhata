"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { updateCustomerScore } from "@/lib/scoring";

export default function ConfirmPaymentPage() {
  const params = useParams();
  const txnId = params.txnId;

  const [txn, setTxn] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!txnId) return;
    getDoc(doc(db, "transactions", txnId))
      .then((snap) => {
        if (snap.exists()) {
          setTxn(snap.data());
        } else {
          setError("এই লিংকটি সঠিক নয়।");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("কিছু একটা সমস্যা হয়েছে।");
        setLoading(false);
      });
  }, [txnId]);

  const handleConfirm = async (e) => {
    e.preventDefault();
    setError("");
    if (pinInput !== txn.securityPIN) {
      setError("ভুল PIN, আবার চেষ্টা করুন।");
      return;
    }
    setDone(true); // সাথে সাথে UI বদলে দাও
    try {
      await Promise.all([
        updateDoc(doc(db, "transactions", txnId), {
          status: "paid",
          paidAt: serverTimestamp(),
        }),
        updateCustomerScore(txn.customerPhone, "paid", txn.amount),
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <p style={{ padding: 20 }}>লোড হচ্ছে...</p>;
  if (error && !txn) return <p style={{ padding: 20, color: "red" }}>{error}</p>;
  if (done) return <p style={{ padding: 20 }}>✅ ধন্যবাদ! আপনার হিসাব ক্লিয়ার হয়ে গেছে।</p>;

  if (txn.status !== "awaiting_pin_confirmation") {
    return <p style={{ padding: 20 }}>এই এন্ট্রি ইতিমধ্যে সম্পন্ন হয়ে গেছে অথবা এখনো PIN জেনারেট হয়নি।</p>;
  }

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>{txn.shopName} — ₹{txn.amount}</h2>
      <p>দোকানদারের দেওয়া PIN নিচে লিখুন:</p>
      <form onSubmit={handleConfirm}>
        <input
          type="text"
          placeholder="PIN দিন"
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <button type="submit" style={{ width: "100%", padding: 10 }}>
          কনফার্ম করুন
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}