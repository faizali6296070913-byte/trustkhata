"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function ConfirmPaymentPage() {
  const params = useParams();
  const txnId = params.txnId;

  const [txn, setTxn] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [fullyPaid, setFullyPaid] = useState(false);
  const [remainingAfter, setRemainingAfter] = useState(0);
  // ---- নতুন: auth state ঠিকভাবে ট্র্যাক করা, যাতে পেজ খোলার সাথে সাথেই ভুল করে "লগইন নেই" না দেখায় ----
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

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
    setConfirming(true);

    try {
      // ---- নতুন: PIN যাচাই ও টাকার হিসাব এখন সার্ভারে (API route) হয়, এই পেজে না ----
      if (!authReady) {
        setError("একটু অপেক্ষা করুন, লগইন যাচাই হচ্ছে...");
        setConfirming(false);
        return;
      }
      if (!user) {
        setError("এই কাজটি করতে লগইন থাকা দরকার। কাস্টমার dashboard থেকে চেষ্টা করুন।");
        setConfirming(false);
        return;
      }
      const idToken = await user.getIdToken();

      const res = await fetch("/api/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, txnId, pin: pinInput }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "সমস্যা হয়েছে, আবার চেষ্টা করুন।");
        setConfirming(false);
        return;
      }

      setFullyPaid(data.fullyPaid);
      setRemainingAfter(data.remaining || 0);
      setDone(true);
    } catch (err) {
      console.error(err);
      setError("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
    setConfirming(false);
  };

  if (loading) return <p style={{ padding: 20 }}>লোড হচ্ছে...</p>;
  if (error && !txn) return <p style={{ padding: 20, color: "red" }}>{error}</p>;

  if (done) {
    return (
      <div style={{ padding: 20 }}>
        {fullyPaid ? (
          <p>✅ ধন্যবাদ! আপনার হিসাব সম্পূর্ণ ক্লিয়ার হয়ে গেছে।</p>
        ) : (
          <p>
            ✅ ধন্যবাদ! এই কিস্তি জমা হয়েছে। এখনো ₹{remainingAfter} বাকি আছে।
          </p>
        )}
      </div>
    );
  }

  if (txn.status !== "awaiting_pin_confirmation") {
    return <p style={{ padding: 20 }}>এই এন্ট্রি ইতিমধ্যে সম্পন্ন হয়ে গেছে অথবা এখনো PIN জেনারেট হয়নি।</p>;
  }

  const thisPaymentAmount = txn.pendingPaymentAmount || txn.amount;

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>{txn.shopName} — এই কিস্তি: ₹{thisPaymentAmount}</h2>
      {txn.amountPaid > 0 && (
        <p style={{ fontSize: 13, color: "#999" }}>
          মোট বাকি ছিল: ₹{txn.amount} | ইতিমধ্যে পরিশোধিত: ₹{txn.amountPaid}
        </p>
      )}
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
        <button type="submit" disabled={confirming} style={{ width: "100%", padding: 10 }}>
          {confirming ? "..." : "কনফার্ম করুন"}
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}