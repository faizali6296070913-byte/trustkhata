"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { updateCustomerScore } from "@/lib/scoring";

export default function ApprovePage() {
  const params = useParams();
  const token = params.token;

  const [approval, setApproval] = useState(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    getDoc(doc(db, "approvals", token))
      .then((snap) => {
        if (snap.exists()) {
          setApproval(snap.data());
        } else {
          setError("এই লিংকটি সঠিক নয় বা মেয়াদ শেষ হয়ে গেছে।");
        }
        setLoading(false);
      })
      .catch(() => {
        setError("কিছু একটা সমস্যা হয়েছে।");
        setLoading(false);
      });
  }, [token]);

  const respond = async (decision) => {
    setDone(true); // সাথে সাথে UI বদলে দাও, ব্যাকগ্রাউন্ডে সেভ হতে থাকুক
    try {
      await Promise.all([
        updateDoc(doc(db, "approvals", token), {
          status: decision,
          respondedAt: serverTimestamp(),
        }),
        updateDoc(doc(db, "transactions", approval.transactionId), {
          status: decision,
          [decision === "approved" ? "approvedAt" : "rejectedAt"]: serverTimestamp(),
        }),
        updateCustomerScore(
          approval.customerPhone,
          decision === "approved" ? "approved" : "rejected",
          approval.amount
        ),
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <p style={{ padding: 20 }}>লোড হচ্ছে...</p>;
  if (error) return <p style={{ padding: 20, color: "red" }}>{error}</p>;
  if (done) return <p style={{ padding: 20 }}>ধন্যবাদ! আপনার উত্তর সেভ হয়ে গেছে।</p>;
  if (approval.status !== "pending") return <p style={{ padding: 20 }}>এই রিকোয়েস্ট আগেই একশন নেওয়া হয়ে গেছে।</p>;

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>{approval.shopName} আপনাকে ₹{approval.amount} ধার দিতে চায়</h2>
      {approval.itemDetails && <p>বিবরণ: {approval.itemDetails}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          onClick={() => respond("approved")}
          style={{ flex: 1, padding: 12, background: "green", color: "white", border: "none" }}
        >
          ✅ Approve
        </button>
        <button
          onClick={() => respond("rejected")}
          style={{ flex: 1, padding: 12, background: "red", color: "white", border: "none" }}
        >
          ❌ Reject
        </button>
      </div>
    </div>
  );
}