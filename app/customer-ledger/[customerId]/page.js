"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { normalizePhone } from "@/lib/phone";
import { useLanguage } from "@/lib/LanguageContext";

export default function CustomerLedgerPage() {
  const { t, lang } = useLanguage();
  const params = useParams();
  const customerId = params.customerId;

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [requests, setRequests] = useState([]);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [shopUid, setShopUid] = useState(null);
  const [shopName, setShopName] = useState("");

  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestAmount, setRequestAmount] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setShopUid(user.uid);

      const shopSnap = await getDoc(doc(db, "shopkeepers", user.uid));
      if (shopSnap.exists()) setShopName(shopSnap.data().shopName || "");

      const custSnap = await getDoc(doc(db, "customers", customerId));
      if (custSnap.exists()) setCustomerInfo(custSnap.data());

      const q = query(
        collection(db, "transactions"),
        where("shopId", "==", user.uid),
        where("customerId", "==", customerId),
        orderBy("createdAt", "desc")
      );
      const unsubTxns = onSnapshot(q, (snap) => {
        setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      });

      const rq = query(
        collection(db, "paymentRequests"),
        where("shopId", "==", user.uid),
        where("customerId", "==", customerId),
        orderBy("createdAt", "desc")
      );
      const unsubReq = onSnapshot(rq, (snap) => {
        setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      });

      return () => {
        unsubTxns();
        unsubReq();
      };
    });
    return () => unsubAuth();
  }, [customerId]);

  const buildWhatsAppLink = (rawPhone, message) => {
    let digits = normalizePhone(rawPhone);
    digits = "91" + digits;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  };

  const handleSendRequest = async (e) => {
    e.preventDefault();
    setSuccessMsg("");
    const amt = Number(requestAmount);
    if (!amt || amt <= 0) {
      alert(t("enterValidAmount"));
      return;
    }
    setSubmitting(true);
    try {
      await addDoc(collection(db, "paymentRequests"), {
        shopId: shopUid,
        shopName,
        customerId,
        customerPhone: customerInfo?.phone || "",
        amount: amt,
        note: requestNote || null,
        initiatedBy: "shopkeeper",
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setSuccessMsg(`✅ ${t("reminderSent")}`);
      setRequestAmount("");
      setRequestNote("");
      setShowRequestForm(false);
    } catch (err) {
      console.error(err);
      alert(t("genericError"));
    }
    setSubmitting(false);
  };

  const statusMap = {
    pending_approval: { color: "#999", label: `⏳ ${t("statusPending")}` },
    approved: { color: "green", label: `🟢 ${t("statusApproved")}` },
    rejected: { color: "red", label: `🔴 ${t("statusRejected")}` },
    awaiting_pin_confirmation: { color: "orange", label: `🔑 ${t("statusAwaitingPin")}` },
    paid: { color: "blue", label: `✅ ${t("statusPaid")}` },
  };

  if (loading) return <p style={{ padding: 20 }}>{t("loading")}</p>;

  const totalOutstanding = transactions
    .filter((t) => ["approved", "awaiting_pin_confirmation"].includes(t.status))
    .reduce((sum, t) => sum + ((t.amount || 0) - (t.amountPaid || 0)), 0);
  const totalPaid = transactions
    .filter((t) => t.status === "paid")
    .reduce((sum, t) => sum + (t.amount || 0), 0)
    + transactions
      .filter((t) => ["approved", "awaiting_pin_confirmation"].includes(t.status))
      .reduce((sum, t) => sum + (t.amountPaid || 0), 0);

  const pendingRequests = requests.filter((r) => r.status === "pending");

  return (
    <div style={{ padding: 20, maxWidth: 450, margin: "auto" }}>
      <a href="/dashboard" style={{ fontSize: 13, color: "#999" }}>
        ← {t("backToDashboard")}
      </a>
      <h2 style={{ marginTop: 10 }}>👤 {customerInfo?.name || customerInfo?.phone || t("customerFallback")}</h2>
      <p style={{ fontSize: 13, color: "#999" }}>{t("phoneLabel")}: {customerInfo?.phone}</p>
      <p style={{ fontSize: 13, color: "#999" }}>{t("trustScoreLabel")}: {customerInfo?.trustScore ?? 50}/100</p>

      <div style={{ display: "flex", gap: 10, margin: "16px 0" }}>
        <div style={{ background: "#1a1a1a", padding: 12, flex: 1, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>{t("outstandingLabel")}</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: "bold", color: "orange" }}>
            ₹{totalOutstanding}
          </p>
        </div>
        <div style={{ background: "#1a1a1a", padding: 12, flex: 1, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>{t("paidLabel")}</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: "bold", color: "green" }}>
            ₹{totalPaid}
          </p>
        </div>
      </div>

      {totalOutstanding > 0 && (
        <button
          onClick={() => setShowRequestForm((v) => !v)}
          style={{ width: "100%", padding: 10, marginBottom: 10, background: "#2563eb", color: "white", border: "none" }}
        >
          📢 {t("sendPaymentReminder")}
        </button>
      )}

      {showRequestForm && (
        <form onSubmit={handleSendRequest} style={{ background: "#1a1a1a", padding: 12, marginBottom: 16 }}>
          <input
            type="number"
            placeholder={`${t("howMuchAsking")} (${t("maxOutstanding")} ₹${totalOutstanding})`}
            value={requestAmount}
            onChange={(e) => setRequestAmount(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
          />
          <input
            type="text"
            placeholder={t("noteOptionalPlaceholder")}
            value={requestNote}
            onChange={(e) => setRequestNote(e.target.value)}
            style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
          />
          <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
            {submitting ? t("sending") : t("sendReminderButton")}
          </button>
        </form>
      )}

      {successMsg && <p style={{ color: "#4ade80" }}>{successMsg}</p>}

      {customerInfo?.phone && pendingRequests.length > 0 && (
        <a
          href={buildWhatsAppLink(
            customerInfo.phone,
            `${t("youOweNote1")} ₹${totalOutstanding} ${t("youOweNote2")} ₹${pendingRequests[0].amount} ${t("youOweNote3")}`
          )}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", padding: 10, background: "#25D366", color: "white", marginBottom: 16, textDecoration: "none" }}
        >
          📱 {t("informViaWhatsapp")}
        </a>
      )}

      {pendingRequests.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15 }}>📋 {t("pendingRequestsTitle")}</h3>
          {pendingRequests.map((r) => (
            <div key={r.id} style={{ background: "#1a1a1a", padding: 10, marginBottom: 6, fontSize: 13 }}>
              {r.initiatedBy === "shopkeeper" ? t("youAsked") : t("customerSaid")}: ₹{r.amount}
              {r.note && ` — ${r.note}`}
            </div>
          ))}
        </div>
      )}

      <h3>📅 {t("transactionHistoryTitle")}</h3>
      {transactions.length === 0 && <p style={{ color: "#999" }}>{t("noTransactions")}</p>}
      {transactions.map((txn) => {
        const s = statusMap[txn.status] || statusMap.pending_approval;
        return (
          <div
            key={txn.id}
            style={{ borderLeft: `6px solid ${s.color}`, padding: 12, marginBottom: 10, background: "#1a1a1a" }}
          >
            <p style={{ margin: 0, fontSize: 12, color: "#999" }}>
              {txn.createdAt?.toDate
                ? txn.createdAt.toDate().toLocaleString(lang === "en" ? "en-IN" : "bn-BD", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : ""}
            </p>
            <p style={{ margin: 0 }}>
              ₹{txn.amount} {txn.itemDetails ? `— ${txn.itemDetails}` : ""}
            </p>
            {(txn.amountPaid || 0) > 0 && txn.status !== "paid" && (
              <p style={{ margin: 0, fontSize: 12, color: "#4ade80" }}>
                {t("paidLabel")}: ₹{txn.amountPaid} | {t("remainingLabel")}: ₹{(txn.amount || 0) - (txn.amountPaid || 0)}
              </p>
            )}
            <strong style={{ color: s.color }}>{s.label}</strong>

            {/* ---- নতুন: কাস্টমার নিজে PIN জেনারেট করলে, দোকানদারকে সরাসরি confirm করার লিংক দেখানো ---- */}
            {txn.status === "awaiting_pin_confirmation" && txn.initiatedBy === "customer" && (
              <div style={{ marginTop: 8, background: "#2a2a00", padding: 8, borderRadius: 4 }}>
                <p style={{ fontSize: 13, color: "#fbbf24", fontWeight: "bold", margin: 0 }}>
                  💸 {t("customerWantsToPay")} ₹{txn.pendingPaymentAmount}
                </p>
                <p style={{ fontSize: 12, color: "#999", margin: "4px 0" }}>
                  {t("takeMoneyThenConfirmNote")}
                </p>
                <a
                  href={`/confirm-payment/${txn.id}`}
                  style={{ display: "inline-block", padding: "6px 10px", background: "#2563eb", color: "white", textDecoration: "none", fontSize: 13 }}
                >
                  🔑 {t("confirmWithPin")}
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}