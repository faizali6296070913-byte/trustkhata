"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { updateCustomerScore } from "@/lib/scoring";

export default function ConfirmPaymentPage() {
  const params = useParams();
  const txnId = params.txnId;

  const [txn, setTxn] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [fullyPaid, setFullyPaid] = useState(false); // ---- নতুন ----
  const [remainingAfter, setRemainingAfter] = useState(0); // ---- নতুন ----

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

    // ---- নতুন: এই কিস্তির টাকা যোগ করে দেখা হচ্ছে সম্পূর্ণ শোধ হয়ে গেল কিনা ----
    const thisPayment = txn.pendingPaymentAmount || txn.amount; // পুরনো ডেটার জন্য fallback
    const previousPaid = txn.amountPaid || 0;
    const newAmountPaid = previousPaid + thisPayment;
    const remaining = txn.amount - newAmountPaid;
    const isFullyPaid = remaining <= 0;

    setFullyPaid(isFullyPaid);
    setRemainingAfter(remaining > 0 ? remaining : 0);
    setDone(true); // সাথে সাথে UI বদলে দাও

    try {
      const updates = {
        amountPaid: newAmountPaid,
        payments: arrayUnion({
          amount: thisPayment,
          paidAt: new Date().toISOString(), // arrayUnion এর ভেতরে serverTimestamp ব্যবহার করা যায় না
        }),
      };

      if (isFullyPaid) {
        updates.status = "paid";
        updates.paidAt = serverTimestamp();
      } else {
        // এখনো কিছু বাকি আছে, পরের কিস্তির জন্য 'approved' এ ফিরিয়ে দাও
        updates.status = "approved";
      }

      await updateDoc(doc(db, "transactions", txnId), updates);

      // ---- নতুন: ট্রাস্ট স্কোর শুধু তখনই বাড়বে যখন পুরো টাকা শোধ হয়ে যাবে ----
      // (এতে কেউ ছোট ছোট কিস্তিতে ভাগ করে বারবার স্কোর কারচুপি করতে পারবে না)
      if (isFullyPaid) {
        await updateCustomerScore(txn.customerPhone, "paid", txn.amount);
      }
    } catch (err) {
      console.error(err);
    }
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
        <button type="submit" style={{ width: "100%", padding: 10 }}>
          কনফার্ম করুন
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}