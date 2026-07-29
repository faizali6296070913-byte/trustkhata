"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { updateCustomerScore } from "@/lib/scoring";
import { normalizePhone } from "@/lib/phone";

export default function ApprovePage() {
  const params = useParams();
  const token = params.token;

  const [approval, setApproval] = useState(null);
  const [loading, setLoading] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // ---- নতুন: লগইন যাচাইয়ের জন্য state ----
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // ---- নতুন: ব্রাউজারে ইতিমধ্যে লগইন করা আছে কিনা দেখা ----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

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

  if (loading || !authChecked) return <p style={{ padding: 20 }}>লোড হচ্ছে...</p>;
  if (error) return <p style={{ padding: 20, color: "red" }}>{error}</p>;
  if (done) return <p style={{ padding: 20 }}>ধন্যবাদ! আপনার উত্তর সেভ হয়ে গেছে।</p>;
  if (approval.status !== "pending") return <p style={{ padding: 20 }}>এই রিকোয়েস্ট আগেই একশন নেওয়া হয়ে গেছে।</p>;

  // ---- নতুন: শুধুমাত্র যেই কাস্টমারকে রিকোয়েস্ট পাঠানো হয়েছে, শুধু তিনিই approve/reject করতে পারবেন ----
  const requestedDigits = normalizePhone(approval.customerPhone);
  const loggedInDigits = authUser?.phoneNumber ? normalizePhone(authUser.phoneNumber) : null;
  const isAuthorized = authUser && loggedInDigits === requestedDigits;

  // ---- নতুন: লগইন করা না থাকলে, আগে লগইন করতে বলা হবে ----
  if (!authUser) {
    return (
      <div style={{ padding: 20, maxWidth: 400, margin: "auto", textAlign: "center" }}>
        <h2>{approval.shopName} আপনাকে ₹{approval.amount} ধার দিতে চায়</h2>
        {approval.itemDetails && <p>বিবরণ: {approval.itemDetails}</p>}
        <p style={{ marginTop: 20, color: "orange" }}>
          🔒 এই রিকোয়েস্ট অনুমোদন/বাতিল করতে আগে আপনার একাউন্টে লগইন করতে হবে।
        </p>
        <a
          href="/customer-login"
          style={{
            display: "inline-block",
            marginTop: 12,
            padding: "10px 20px",
            background: "#3b82f6",
            color: "white",
            textDecoration: "none",
            fontWeight: "bold",
            borderRadius: 4,
          }}
        >
          লগইন করুন
        </a>
        <p style={{ marginTop: 10, fontSize: 13, color: "#999" }}>
          লগইন করার পর এই একই লিংকে (WhatsApp মেসেজ থেকে) আবার আসুন।
        </p>
      </div>
    );
  }

  // ---- নতুন: লগইন করা আছে, কিন্তু এই রিকোয়েস্টের কাস্টমার না হলে আটকে দেওয়া ----
  if (!isAuthorized) {
    return (
      <div style={{ padding: 20, maxWidth: 400, margin: "auto", textAlign: "center" }}>
        <p style={{ color: "red" }}>
          ⚠️ এই রিকোয়েস্টটি আপনার একাউন্টের জন্য নয়। শুধুমাত্র {approval.customerPhone} নম্বরের কাস্টমার এটি অনুমোদন/বাতিল করতে পারবেন।
        </p>
      </div>
    );
  }

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