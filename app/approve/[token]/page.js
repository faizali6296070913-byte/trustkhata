"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db, auth } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { updateCustomerScore } from "@/lib/scoring";
import { normalizePhone } from "@/lib/phone";
import { useLanguage } from "@/lib/LanguageContext";

export default function ApprovePage() {
  const { t } = useLanguage();
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
          setError(t("linkInvalidOrExpired"));
        }
        setLoading(false);
      })
      .catch(() => {
        setError(t("somethingWentWrong"));
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

  if (loading || !authChecked) return <p style={{ padding: 20 }}>{t("loading")}</p>;
  if (error) return <p style={{ padding: 20, color: "red" }}>{error}</p>;
  if (done) return <p style={{ padding: 20 }}>{t("thankYouResponseSaved")}</p>;
  if (approval.status !== "pending") return <p style={{ padding: 20 }}>{t("requestAlreadyActioned")}</p>;

  // ---- নতুন: শুধুমাত্র যেই কাস্টমারকে রিকোয়েস্ট পাঠানো হয়েছে, শুধু তিনিই approve/reject করতে পারবেন ----
  const requestedDigits = normalizePhone(approval.customerPhone);
  const loggedInDigits = authUser?.phoneNumber ? normalizePhone(authUser.phoneNumber) : null;
  const isAuthorized = authUser && loggedInDigits === requestedDigits;

  // ---- নতুন: লগইন করা না থাকলে, আগে লগইন করতে বলা হবে ----
  if (!authUser) {
    return (
      <div style={{ padding: 20, maxWidth: 400, margin: "auto", textAlign: "center" }}>
        <h2>{approval.shopName} {t("wantsToLendYou")} ₹{approval.amount}</h2>
        {approval.itemDetails && <p>{t("detailsLabel")}: {approval.itemDetails}</p>}
        <p style={{ marginTop: 20, color: "orange" }}>
          🔒 {t("loginRequiredNote")}
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
          {t("loginButton")}
        </a>
        <p style={{ marginTop: 10, fontSize: 13, color: "#999" }}>
          {t("returnToLinkNote")}
        </p>
      </div>
    );
  }

  // ---- নতুন: লগইন করা আছে, কিন্তু এই রিকোয়েস্টের কাস্টমার না হলে আটকে দেওয়া ----
  if (!isAuthorized) {
    return (
      <div style={{ padding: 20, maxWidth: 400, margin: "auto", textAlign: "center" }}>
        <p style={{ color: "red" }}>
          ⚠️ {t("notYourRequestNote1")} {approval.customerPhone} {t("notYourRequestNote2")}
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>{approval.shopName} {t("wantsToLendYou")} ₹{approval.amount}</h2>
      {approval.itemDetails && <p>{t("detailsLabel")}: {approval.itemDetails}</p>}

      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          onClick={() => respond("approved")}
          style={{ flex: 1, padding: 12, background: "green", color: "white", border: "none" }}
        >
          ✅ {t("approveButton")}
        </button>
        <button
          onClick={() => respond("rejected")}
          style={{ flex: 1, padding: 12, background: "red", color: "white", border: "none" }}
        >
          ❌ {t("rejectEdit")}
        </button>
      </div>
    </div>
  );
}