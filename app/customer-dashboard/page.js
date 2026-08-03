"use client";
import { useEffect, useState, useMemo } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp, collection, query, where, orderBy } from "firebase/firestore";
import {
  onAuthStateChanged,
  signOut,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "firebase/auth";
import { updateCustomerScore } from "@/lib/scoring";
import { normalizePhone } from "@/lib/phone";
import { getFriendlyAuthError } from "@/lib/authErrors";
import { isOverdue, getOverdueDays, checkAndApplyOverduePenalty } from "@/lib/overdue";
import { useLanguage } from "@/lib/LanguageContext";

// ---- নতুন: এরর মেসেজ আরও স্পষ্ট ও কার্যকরী করার জন্য ----
function getFriendlyErrorMessage(err) {
  if (!err) return "একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।";
  const msg = (err.message || "").toLowerCase();
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("offline")) {
    return "📶 ইন্টারনেট সংযোগে সমস্যা মনে হচ্ছে — সংযোগ চেক করে আবার চেষ্টা করুন।";
  }
  if (msg.includes("permission")) {
    return "🔒 এই কাজটি করার অনুমতি নেই — লগ আউট করে আবার লগইন করে দেখুন।";
  }
  return "একটা সমস্যা হয়েছে, একটু পর আবার চেষ্টা করুন।";
}

export default function CustomerDashboardPage() {
  const { t, lang } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [customerData, setCustomerData] = useState(null);
  const [transactions, setTransactions] = useState([]);

  // ---- নতুন: সেটিংস / পাসওয়ার্ড বদলানোর জন্য state ----
  const [showSettings, setShowSettings] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwChangeError, setPwChangeError] = useState("");
  const [pwChangeSuccess, setPwChangeSuccess] = useState("");
  const [pwChangeSubmitting, setPwChangeSubmitting] = useState(false);

  // ---- নতুন: প্রোফাইল এডিট করার জন্য state ----
  const [editName, setEditName] = useState("");
  const [editStreet, setEditStreet] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editPincode, setEditPincode] = useState("");
  const [editAltPhone, setEditAltPhone] = useState("");
  const [editOccupation, setEditOccupation] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");
  // ---- নতুন: ভুল করে টাচ লেগে তথ্য বদলে না যায়, তাই ডিফল্টভাবে ফর্ম লক থাকবে — পেন্সিল আইকনে চাপলে খুলবে ----
  const [profileFieldsUnlocked, setProfileFieldsUnlocked] = useState(false);
  // ---- নতুন: প্রথমে শুধু সাম্প্রতিক লেনদেন দেখানো, দ্রুত লোড হওয়ার জন্য ----
  const [showAllTxns, setShowAllTxns] = useState(false);

  // ---- নতুন: dashboard থেকেই সরাসরি PIN দিয়ে পেমেন্ট কনফার্ম করার জন্য state ----
  const [pinInputs, setPinInputs] = useState({});
  const [pinErrors, setPinErrors] = useState({});
  const [pinConfirming, setPinConfirming] = useState({});

  // ---- নতুন: "মোট বাকি মেটান" (FIFO) ফিচারের জন্য state ----
  const [settlementRequests, setSettlementRequests] = useState([]);
  const [settleAmountInputs, setSettleAmountInputs] = useState({});
  const [settleFormOpenFor, setSettleFormOpenFor] = useState(null);
  const [settleSubmitting, setSettleSubmitting] = useState(false);
  const [settleError, setSettleError] = useState({});
  const [settlePinInputs, setSettlePinInputs] = useState({});
  const [settleConfirming, setSettleConfirming] = useState({});

  // ---- নতুন: দোকানদারের পাঠানো সংশোধনের অনুরোধ (Edit Request) এর জন্য state ----
  const [editRequests, setEditRequests] = useState([]);
  const [editRespondingId, setEditRespondingId] = useState(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = "/customer-login";
        return;
      }
      const digits = normalizePhone(user.phoneNumber);

      const unsubCustomer = onSnapshot(doc(db, "customers", digits), (snap) => {
        const data = snap.exists() ? snap.data() : null;
        setCustomerData(data);
        // ---- নতুন: প্রোফাইল এডিট ফর্মের ইনপুট বক্স পূরণ করা ----
        if (data) {
          setEditName(data.name || "");
          setEditStreet(data.address?.street || "");
          setEditCity(data.address?.city || "");
          setEditState(data.address?.state || "");
          setEditPincode(data.address?.pincode || "");
          setEditAltPhone(data.altPhone || "");
          setEditOccupation(data.occupation || "");
        }
        setLoading(false);
      });

      const q = query(
        collection(db, "transactions"),
        where("customerId", "==", digits),
        orderBy("createdAt", "desc")
      );
      const unsubTxns = onSnapshot(q, (snapshot) => {
        setTransactions(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      });

      // ---- নতুন: "মোট বাকি মেটান" রিকোয়েস্টের জন্য listener ----
      const settleQ = query(
        collection(db, "settlementRequests"),
        where("customerId", "==", digits)
      );
      const unsubSettle = onSnapshot(settleQ, (snapshot) => {
        setSettlementRequests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      });

      // ---- নতুন: দোকানদারের পাঠানো সংশোধনের অনুরোধ (Edit Request) শোনা ----
      const editQ = query(
        collection(db, "editRequests"),
        where("customerId", "==", digits),
        where("status", "==", "pending")
      );
      const unsubEdit = onSnapshot(editQ, (snapshot) => {
        setEditRequests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      });

      return () => {
        unsubCustomer();
        unsubTxns();
        unsubSettle();
        unsubEdit();
      };
    });
    return () => unsubAuth();
  }, []);

  // ---- নতুন: dashboard লোড হওয়ার সময় নিজের মেয়াদ পার হওয়া এন্ট্রিগুলোর জন্য score penalty চেক করা ----
  useEffect(() => {
    transactions
      .filter((t) => t.status === "approved" && isOverdue(t))
      .forEach((t) => {
        checkAndApplyOverduePenalty(t).catch(() => {});
      });
  }, [transactions]);

  const handleLogout = () => {
    signOut(auth).then(() => {
      window.location.href = "/";
    });
  };

  // ---- নতুন: পাসওয়ার্ড বদলানো ----
  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwChangeError("");
    setPwChangeSuccess("");

    if (newPassword.length < 6) {
      setPwChangeError(t("pwTooShort"));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPwChangeError(t("pwMismatch"));
      return;
    }

    setPwChangeSubmitting(true);
    try {
      const digits = normalizePhone(customerData?.phone || auth.currentUser?.phoneNumber || "");
      const pseudoEmail = `${digits}@halkhata.app`;
      const credential = EmailAuthProvider.credential(pseudoEmail, currentPassword);

      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);

      setPwChangeSuccess("✅ পাসওয়ার্ড সফলভাবে বদলানো হয়েছে।");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      console.error(err);
      setPwChangeError(getFriendlyAuthError(err));
    }
    setPwChangeSubmitting(false);
  };

  // ---- নতুন: প্রোফাইল তথ্য আপডেট করা ----
  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setProfileSubmitting(true);
    try {
      const digits = normalizePhone(customerData?.phone || auth.currentUser?.phoneNumber || "");
      await updateDoc(doc(db, "customers", digits), {
        name: editName,
        address: {
          street: editStreet,
          city: editCity,
          state: editState,
          pincode: editPincode,
        },
        altPhone: editAltPhone || null,
        occupation: editOccupation || null,
      });
      setProfileSuccess(`✅ ${t("profileUpdatedSuccess")}`);
      setProfileFieldsUnlocked(false); // ---- নতুন: সেভ হওয়ার পর আবার ফর্ম লক করে দেওয়া, নিরাপত্তার জন্য ----
    } catch (err) {
      console.error(err);
      setProfileError(t("profileUpdateFailed"));
    }
    setProfileSubmitting(false);
  };

  // ---- নতুন: dashboard থেকেই সরাসরি PIN দিয়ে পেমেন্ট কনফার্ম করা (আলাদা লিংক লাগবে না) ----
  // ---- নতুন: "মোট বাকি মেটান" রিকোয়েস্ট পাঠানো (কাস্টমার শুরু করবে) ----
  const sendSettlementRequest = async (shop) => {
    const raw = settleAmountInputs[shop.shopId];
    const amount = Number(raw);
    setSettleError((prev) => ({ ...prev, [shop.shopId]: "" }));

    if (!raw || isNaN(amount) || amount <= 0) {
      setSettleError((prev) => ({ ...prev, [shop.shopId]: t("enterValidAmount") }));
      return;
    }
    if (amount > shop.outstanding) {
      setSettleError((prev) => ({
        ...prev,
        [shop.shopId]: `সর্বোচ্চ ₹${shop.outstanding} মেটানো যাবে।`,
      }));
      return;
    }

    setSettleSubmitting(true);
    try {
      const digits = normalizePhone(customerData?.phone || auth.currentUser?.phoneNumber || "");
      await setDoc(doc(collection(db, "settlementRequests")), {
        shopId: shop.shopId,
        shopName: shop.shopName,
        customerId: digits,
        customerPhone: customerData?.phone || "",
        amount,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setSettleAmountInputs((prev) => ({ ...prev, [shop.shopId]: "" }));
      setSettleFormOpenFor(null);
    } catch (err) {
      console.error(err);
      setSettleError((prev) => ({ ...prev, [shop.shopId]: t("genericError") }));
    }
    setSettleSubmitting(false);
  };

  // ---- বদলানো হয়েছে: PIN যাচাই ও টাকার হিসাব এখন সার্ভারে (API route) হয়, ব্রাউজারে না ----
  const confirmSettlement = async (req) => {
    const enteredPin = settlePinInputs[req.id] || "";
    setSettleError((prev) => ({ ...prev, [req.id]: "" }));

    if (!enteredPin) {
      setSettleError((prev) => ({ ...prev, [req.id]: "PIN লিখুন।" }));
      return;
    }

    setSettleConfirming((prev) => ({ ...prev, [req.id]: true }));
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/confirm-settlement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, requestId: req.id, pin: enteredPin }),
      });
      const data = await res.json();

      if (!res.ok) {
        setSettleError((prev) => ({ ...prev, [req.id]: data.error || t("genericError") }));
      } else {
        setSettlePinInputs((prev) => ({ ...prev, [req.id]: "" }));
      }
    } catch (err) {
      console.error(err);
      setSettleError((prev) => ({ ...prev, [req.id]: t("genericError") }));
    }
    setSettleConfirming((prev) => ({ ...prev, [req.id]: false }));
  };

  // ---- বদলানো হয়েছে: PIN যাচাই ও টাকার হিসাব এখন সার্ভারে (API route) হয়, ব্রাউজারে না ----
  const confirmPayment = async (txn) => {
    const enteredPin = pinInputs[txn.id] || "";
    setPinErrors((prev) => ({ ...prev, [txn.id]: "" }));

    if (!enteredPin) {
      setPinErrors((prev) => ({ ...prev, [txn.id]: "PIN লিখুন।" }));
      return;
    }

    setPinConfirming((prev) => ({ ...prev, [txn.id]: true }));
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, txnId: txn.id, pin: enteredPin }),
      });
      const data = await res.json();

      if (!res.ok) {
        setPinErrors((prev) => ({ ...prev, [txn.id]: data.error || t("genericError") }));
      } else {
        setPinInputs((prev) => ({ ...prev, [txn.id]: "" }));
      }
    } catch (err) {
      console.error(err);
      setPinErrors((prev) => ({ ...prev, [txn.id]: t("genericError") }));
    }
    setPinConfirming((prev) => ({ ...prev, [txn.id]: false }));
  };

  // ---- নতুন: দোকানদারের পাঠানো সংশোধনের অনুরোধে সাড়া দেওয়া ----
  const respondToEditRequest = async (req, decision) => {
    setEditRespondingId(req.id);
    try {
      if (decision === "approved") {
        // ---- আসল transaction এ নতুন পরিমাণ/বিবরণ বসানো হচ্ছে, শুধু "সম্পাদিত" চিহ্ন রাখা হচ্ছে (পুরনো মান রাখা হচ্ছে না) ----
        await updateDoc(doc(db, "transactions", req.transactionId), {
          amount: req.newAmount,
          itemDetails: req.newItemDetails,
          wasEdited: true,
          lastEditedAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, "editRequests", req.id), {
        status: decision,
        respondedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      alert(getFriendlyErrorMessage(err));
    }
    setEditRespondingId(null);
  };

  const respond = async (txn, decision) => {
    try {
      await updateDoc(doc(db, "transactions", txn.id), {
        status: decision,
        [decision === "approved" ? "approvedAt" : "rejectedAt"]: serverTimestamp(),
      });

      if (txn.approvalToken) {
        await updateDoc(doc(db, "approvals", txn.approvalToken), {
          status: decision,
          respondedAt: serverTimestamp(),
        }).catch(() => {});
      }

      await updateCustomerScore(txn.customerPhone, decision === "approved" ? "approved" : "rejected", txn.amount);
    } catch (err) {
      console.error(err);
      alert(getFriendlyErrorMessage(err));
    }
  };

  // ---- বাগ ফিক্স: এই hook (useMemo) আগে "if (loading) return" এর পরে ছিল, যেটা React এর নিয়ম ভঙ্গ করছিল
  // এবং "Minified React error #310" দিয়ে পুরো পেজ ভেঙে দিচ্ছিল — এখন early return এর আগে আনা হলো ----
  const toMillis = (t) => {
    if (!t) return 0;
    if (t.toDate) return t.toDate().getTime();
    if (typeof t === "string") return new Date(t).getTime();
    return 0;
  };

  const activityFeed = useMemo(() => {
    const events = [];
    transactions.forEach((t) => {
      if (t.createdAt) {
        events.push({
          time: toMillis(t.createdAt),
          icon: "🆕",
          text: `${t.shopName} আপনাকে ₹${t.amount} বাকি দিয়েছে`,
        });
      }
      if (t.paidAt) {
        events.push({
          time: toMillis(t.paidAt),
          icon: "💰",
          text: `${t.shopName} এ ₹${t.amount} সম্পূর্ণ পরিশোধিত হয়েছে`,
        });
      }
      (t.payments || []).forEach((p) => {
        events.push({
          time: toMillis(p.paidAt),
          icon: "💵",
          text: `${t.shopName} এ ₹${p.amount} পরিশোধ করেছেন`,
        });
      });
    });
    return events.sort((a, b) => b.time - a.time).slice(0, 8);
  }, [transactions]);

  // ---- নতুন: লোডিং এর সময় ফাঁকা "skeleton" আকৃতি দেখানো ----
  if (loading)
    return (
      <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ width: 140, height: 26, background: "#2a2a2a", borderRadius: 4 }} />
          <div style={{ width: 80, height: 36, background: "#2a2a2a", borderRadius: 4 }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 60, background: "#1a1a1a", borderRadius: 6, marginBottom: 10 }} />
        ))}
        <style>{`
          @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
          div[style*="background: #2a2a2a"], div[style*="background: #1a1a1a"] { animation: pulse 1.5s ease-in-out infinite; }
        `}</style>
      </div>
    );

  const getScoreTier = (score) => {
    if (score >= 70) return { label: `🟢 ${t("trustedCustomer")}`, color: "green" };
    if (score >= 40) return { label: `🟡 ${t("moderate")}`, color: "orange" };
    return { label: `🔴 ${t("risky")}`, color: "red" };
  };

  const statusMap = {
    pending_approval: { color: "#999", label: `⏳ ${t("statusPending")}` },
    approved: { color: "green", label: `🟢 ${t("statusApproved")}` },
    rejected: { color: "red", label: `🔴 ${t("statusRejected")}` },
    awaiting_pin_confirmation: { color: "orange", label: `🔑 ${t("statusAwaitingPin")}` },
    paid: { color: "blue", label: `✅ ${t("statusPaid")}` },
  };

  const score = customerData?.trustScore ?? 50;
  const tier = getScoreTier(score);

  // ---- বদলানো হয়েছে: পুরো amount না নিয়ে, বাকি অংশ (amount - amountPaid) হিসাব করা হচ্ছে ----
  const outstandingStatuses = ["approved", "awaiting_pin_confirmation"];
  const outstandingTxns = transactions.filter((t) => outstandingStatuses.includes(t.status));
  const paidTxns = transactions.filter((t) => t.status === "paid");

  const getRemaining = (t) => (t.amount || 0) - (t.amountPaid || 0);

  const totalOutstanding = outstandingTxns.reduce((sum, t) => sum + getRemaining(t), 0);
  const totalPaid = paidTxns.reduce((sum, t) => sum + (t.amount || 0), 0)
    + outstandingTxns.reduce((sum, t) => sum + (t.amountPaid || 0), 0); // আংশিক শোধ হওয়া টাকাও যোগ

  const shopIdsWithDue = new Set(outstandingTxns.filter((t) => getRemaining(t) > 0).map((t) => t.shopId));
  const allShopIds = new Set(transactions.map((t) => t.shopId));

  const shopSummary = {};
  transactions.forEach((t) => {
    if (!shopSummary[t.shopId]) {
      shopSummary[t.shopId] = { shopId: t.shopId, shopName: t.shopName, outstanding: 0, paid: 0 };
    }
    if (outstandingStatuses.includes(t.status)) {
      shopSummary[t.shopId].outstanding += getRemaining(t);
      shopSummary[t.shopId].paid += t.amountPaid || 0;
    }
    if (t.status === "paid") {
      shopSummary[t.shopId].paid += t.amount || 0;
    }
  });
  const shopList = Object.values(shopSummary);

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: "auto" }}>
      {/* ---- বাগ ফিক্স: ছোট স্ক্রিনে হেডার ভিড় করার ঝুঁকি এড়াতে icon-only বাটন ও wrap ---- */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{t("myProfile")}</h2>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => setShowSettings((v) => !v)}
            title={t("settingsTitle")}
            style={{ padding: "8px 10px", background: "#333", color: "white", border: "1px solid #666", borderRadius: 6, fontSize: 15 }}
          >
            ⚙️
          </button>
          <button
            onClick={handleLogout}
            title={t("logout")}
            style={{ padding: "8px 10px", background: "#333", color: "white", border: "1px solid #666", borderRadius: 6, fontSize: 15 }}
          >
            🚪
          </button>
        </div>
      </div>

      {/* ---- নতুন: নতুন ক্রেডিট রিকোয়েস্ট থাকলে সবার ওপরে বড় করে দেখানো, WhatsApp ছাড়াই সরাসরি Approve/Reject করা যাবে ---- */}
      {transactions.filter((t) => t.status === "pending_approval").length > 0 && (
        <div style={{ background: "#3b2a00", border: "2px solid #f59e0b", padding: 14, marginTop: 14, borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 10px 0", color: "#fbbf24" }}>
            🔔 {t("newCreditRequestArrived")}
          </h3>
          {transactions
            .filter((txn2) => txn2.status === "pending_approval")
            .map((txn) => (
              <div key={txn.id} style={{ background: "#1a1a1a", padding: 12, marginBottom: 8, borderRadius: 6 }}>
                <p style={{ margin: 0, fontWeight: "bold" }}>🏪 {txn.shopName}</p>
                <p style={{ margin: "4px 0" }}>
                  {t("amountLabel")}: <span style={{ fontWeight: "bold" }}>₹{txn.amount}</span>
                  {txn.itemDetails ? ` — ${txn.itemDetails}` : ""}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => respond(txn, "approved")}
                    style={{ flex: 1, padding: 10, background: "#16a34a", color: "white", border: "none", fontWeight: "bold" }}
                  >
                    ✅ {t("approveButton")}
                  </button>
                  <button
                    onClick={() => respond(txn, "rejected")}
                    style={{ flex: 1, padding: 10, background: "#dc2626", color: "white", border: "none", fontWeight: "bold" }}
                  >
                    ❌ {t("rejectButton")}
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ---- নতুন: দোকানদার কোনো এন্ট্রি সংশোধনের অনুরোধ পাঠালে সবার ওপরে দেখানো ---- */}
      {editRequests.length > 0 && (
        <div style={{ background: "#1e293b", border: "2px solid #3b82f6", padding: 14, marginTop: 14, borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 10px 0", color: "#60a5fa" }}>✏️ {t("editRequestArrived")}</h3>
          {editRequests.map((req) => (
            <div key={req.id} style={{ background: "#1a1a1a", padding: 12, marginBottom: 8, borderRadius: 6 }}>
              <p style={{ margin: 0, fontWeight: "bold" }}>🏪 {req.shopName}</p>
              <p style={{ margin: "4px 0" }}>
                {t("amountLabel")}: <span style={{ textDecoration: "line-through", color: "#999" }}>₹{req.oldAmount}</span>
                {" → "}
                <span style={{ fontWeight: "bold", color: "#60a5fa" }}>₹{req.newAmount}</span>
              </p>
              {req.newItemDetails && <p style={{ margin: 0, fontSize: 13 }}>{t("newDetailsLabel")}: {req.newItemDetails}</p>}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => respondToEditRequest(req, "approved")}
                  disabled={editRespondingId === req.id}
                  style={{ flex: 1, padding: 10, background: "#16a34a", color: "white", border: "none", fontWeight: "bold" }}
                >
                  ✅ {t("acceptEdit")}
                </button>
                <button
                  onClick={() => respondToEditRequest(req, "rejected")}
                  disabled={editRespondingId === req.id}
                  style={{ flex: 1, padding: 10, background: "#dc2626", color: "white", border: "none", fontWeight: "bold" }}
                >
                  ❌ {t("rejectEdit")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showSettings && (
        <div style={{ background: "#1a1a1a", padding: 15, marginBottom: 20, marginTop: 12, borderRadius: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>✏️ {t("editProfileInfo")}</h3>
            {/* ---- নতুন: পেন্সিল আইকন — এতে না চাপলে ফর্ম এডিট করা যাবে না, ভুল করে টাচ লেগে তথ্য বদলাবে না ---- */}
            <button
              type="button"
              onClick={() => setProfileFieldsUnlocked((v) => !v)}
              style={{
                padding: "6px 10px",
                background: profileFieldsUnlocked ? "#2563eb" : "#333",
                color: "white",
                border: "1px solid #666",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              {profileFieldsUnlocked ? `🔓 ${t("unlocked")}` : `✏️ ${t("tapToEdit")}`}
            </button>
          </div>
          {!profileFieldsUnlocked && (
            <p style={{ fontSize: 12, color: "#999", margin: "6px 0 0 0" }}>
              🔒 {t("profileLockedHint")}
            </p>
          )}
          <form onSubmit={handleUpdateProfile} style={{ marginTop: 10 }}>
            <input
              type="text"
              placeholder={t("fullNamePlaceholder")}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              disabled={!profileFieldsUnlocked}
              style={{
                display: "block",
                width: "100%",
                marginBottom: 8,
                padding: 8,
                boxSizing: "border-box",
                opacity: profileFieldsUnlocked ? 1 : 0.6,
              }}
            />
            <input
              type="text"
              placeholder={t("streetPlaceholder")}
              value={editStreet}
              onChange={(e) => setEditStreet(e.target.value)}
              disabled={!profileFieldsUnlocked}
              style={{
                display: "block",
                width: "100%",
                marginBottom: 8,
                padding: 8,
                boxSizing: "border-box",
                opacity: profileFieldsUnlocked ? 1 : 0.6,
              }}
            />
            <input
              type="text"
              placeholder={t("cityPlaceholder")}
              value={editCity}
              onChange={(e) => setEditCity(e.target.value)}
              disabled={!profileFieldsUnlocked}
              style={{
                display: "block",
                width: "100%",
                marginBottom: 8,
                padding: 8,
                boxSizing: "border-box",
                opacity: profileFieldsUnlocked ? 1 : 0.6,
              }}
            />
            <input
              type="text"
              placeholder={t("statePlaceholder")}
              value={editState}
              onChange={(e) => setEditState(e.target.value)}
              disabled={!profileFieldsUnlocked}
              style={{
                display: "block",
                width: "100%",
                marginBottom: 8,
                padding: 8,
                boxSizing: "border-box",
                opacity: profileFieldsUnlocked ? 1 : 0.6,
              }}
            />
            <input
              type="text"
              placeholder={t("pincodePlaceholder")}
              value={editPincode}
              onChange={(e) => setEditPincode(e.target.value)}
              disabled={!profileFieldsUnlocked}
              style={{
                display: "block",
                width: "100%",
                marginBottom: 8,
                padding: 8,
                boxSizing: "border-box",
                opacity: profileFieldsUnlocked ? 1 : 0.6,
              }}
            />
            <input
              type="tel"
              placeholder={t("altPhonePlaceholder")}
              value={editAltPhone}
              onChange={(e) => setEditAltPhone(e.target.value)}
              disabled={!profileFieldsUnlocked}
              style={{
                display: "block",
                width: "100%",
                marginBottom: 8,
                padding: 8,
                boxSizing: "border-box",
                opacity: profileFieldsUnlocked ? 1 : 0.6,
              }}
            />
            <input
              type="text"
              placeholder={t("occupationPlaceholder")}
              value={editOccupation}
              onChange={(e) => setEditOccupation(e.target.value)}
              disabled={!profileFieldsUnlocked}
              style={{
                display: "block",
                width: "100%",
                marginBottom: 10,
                padding: 8,
                boxSizing: "border-box",
                opacity: profileFieldsUnlocked ? 1 : 0.6,
              }}
            />
            {profileFieldsUnlocked && (
              <button type="submit" disabled={profileSubmitting} style={{ width: "100%", padding: 10 }}>
                {profileSubmitting ? t("updating") : t("updateProfile")}
              </button>
            )}
            {profileError && <p style={{ color: "red", fontSize: 13 }}>{profileError}</p>}
            {profileSuccess && <p style={{ color: "#4ade80", fontSize: 13 }}>{profileSuccess}</p>}
          </form>

          <hr style={{ margin: "16px 0", borderColor: "#333" }} />

          <h3 style={{ marginTop: 0 }}>🔑 {t("changePassword")}</h3>
          <form onSubmit={handleChangePassword}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <input
                type={showCurrentPw ? "text" : "password"}
                placeholder={t("currentPasswordPlaceholder")}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                style={{ display: "block", width: "100%", padding: 8, paddingRight: 40, boxSizing: "border-box" }}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw((v) => !v)}
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }}
              >
                {showCurrentPw ? "🙈" : "👁️"}
              </button>
            </div>

            <div style={{ position: "relative", marginBottom: 10 }}>
              <input
                type={showNewPw ? "text" : "password"}
                placeholder={t("newPasswordPlaceholder")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                style={{ display: "block", width: "100%", padding: 8, paddingRight: 40, boxSizing: "border-box" }}
              />
              <button
                type="button"
                onClick={() => setShowNewPw((v) => !v)}
                style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }}
              >
                {showNewPw ? "🙈" : "👁️"}
              </button>
            </div>

            <input
              type={showNewPw ? "text" : "password"}
              placeholder={t("confirmNewPasswordPlaceholder")}
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              required
              style={{ display: "block", width: "100%", marginBottom: 10, padding: 8, boxSizing: "border-box" }}
            />

            <button type="submit" disabled={pwChangeSubmitting} style={{ width: "100%", padding: 10 }}>
              {pwChangeSubmitting ? t("changing") : t("changePasswordButton")}
            </button>
            {pwChangeError && <p style={{ color: "red", fontSize: 13 }}>{pwChangeError}</p>}
            {pwChangeSuccess && <p style={{ color: "#4ade80", fontSize: 13 }}>{pwChangeSuccess}</p>}
          </form>

          <hr style={{ margin: "16px 0", borderColor: "#333" }} />

          {/* ---- নতুন: সেটিংস এর ভেতরেও Logout বাটন, উপরের 🚪 আইকনের পাশাপাশি ---- */}
          <button
            onClick={handleLogout}
            style={{
              display: "block",
              margin: "0 auto",
              padding: "10px 30px",
              background: "#7f1d1d",
              color: "white",
              border: "none",
              borderRadius: 6,
              fontWeight: "bold",
            }}
          >
            🚪 {t("logout")}
          </button>
        </div>
      )}

      {customerData?.name && (
        <p style={{ margin: "4px 0", fontSize: 16 }}>
          👤 {customerData.name}
          {customerData.address?.city &&
            ` — ${customerData.address.city}, ${customerData.address.state}`}
        </p>
      )}

      {customerData?.address?.street && (
        <p style={{ margin: 0, fontSize: 13, color: "#999" }}>
          🏠 {customerData.address.street}
          {customerData.address.pincode && ` — ${customerData.address.pincode}`}
        </p>
      )}

      {customerData?.altPhone && (
        <p style={{ margin: 0, fontSize: 13, color: "#999" }}>
          📞 {t("altPhoneLabel")}: {customerData.altPhone}
        </p>
      )}

      {customerData?.occupation && (
        <p style={{ margin: 0, fontSize: 13, color: "#999" }}>
          💼 {t("occupationLabel")}: {customerData.occupation}
        </p>
      )}

      <p style={{ color: tier.color, fontWeight: "bold", fontSize: 18, marginTop: 10 }}>
        {tier.label} — {t("score")}: {score}/100
      </p>
      {customerData?.isRedFlagged && (
        <p style={{ color: "red", fontWeight: "bold" }}>
          ⚠️ {t("redFlagOnProfile")}
        </p>
      )}

      {/* ---- নতুন: সাম্প্রতিক Activity ফিড ---- */}
      {activityFeed.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 8px 0", fontSize: 15 }}>🕐 {t("recentActivity")}</h3>
          <div style={{ background: "#1a1a1a", borderRadius: 8, padding: 10 }}>
            {activityFeed.map((ev, idx) => (
              <p
                key={idx}
                style={{
                  margin: 0,
                  padding: "6px 0",
                  fontSize: 13,
                  borderBottom: idx < activityFeed.length - 1 ? "1px solid #333" : "none",
                  wordBreak: "break-word",
                }}
              >
                {ev.icon} {ev.text}
              </p>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
        <div style={{ background: "#1a1a1a", padding: 12, flex: "1 1 45%", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>{t("totalOutstanding")}</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: "bold", color: "orange" }}>₹{totalOutstanding}</p>
        </div>
        <div style={{ background: "#1a1a1a", padding: 12, flex: "1 1 45%", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>{t("totalPaid")}</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: "bold", color: "green" }}>₹{totalPaid}</p>
        </div>
        <div style={{ background: "#1a1a1a", padding: 12, flex: "1 1 45%", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>{t("shopsWithDue")}</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: "bold" }}>{shopIdsWithDue.size}</p>
        </div>
        <div style={{ background: "#1a1a1a", padding: 12, flex: "1 1 45%", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>{t("totalShops")}</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: "bold" }}>{allShopIds.size}</p>
        </div>
      </div>

      <h3 style={{ marginTop: 30 }}>{t("shopWiseAccount")}</h3>
      {shopList.length === 0 && (
        <p style={{ color: "#999" }}>
          {t("noShopTransactionsYet")}
        </p>
      )}
      {shopList.map((shop, idx) => {
        // ---- নতুন: এই দোকানের জন্য চলমান settlement request (যদি থাকে) খুঁজে বের করা ----
        const activeSettle = settlementRequests.find(
          (r) => r.shopId === shop.shopId && (r.status === "pending" || r.status === "awaiting_pin")
        );

        return (
          <div key={idx} style={{ background: "#1a1a1a", padding: 12, marginBottom: 8, borderRadius: 6, wordBreak: "break-word" }}>
            <div onClick={() => (window.location.href = `/shop-ledger/${shop.shopId}`)} style={{ cursor: "pointer" }}>
              <p style={{ margin: 0, fontWeight: "bold" }}>🏪 {shop.shopName} <span style={{ fontSize: 11, color: "#3b82f6" }}>{t("viewDetails")} →</span></p>
              <p style={{ margin: 0, fontSize: 13 }}>
                {t("outstandingLabel")}: <span style={{ color: shop.outstanding > 0 ? "orange" : "#999" }}>₹{shop.outstanding}</span>
                {"  |  "}{t("paidLabel")}: <span style={{ color: "green" }}>₹{shop.paid}</span>
              </p>
            </div>

            {/* ---- নতুন: মোট বাকি একসাথে মেটানোর অনুরোধ পাঠানো (FIFO) ---- */}
            {shop.outstanding > 0 && !activeSettle && (
              <div style={{ marginTop: 8 }}>
                {settleFormOpenFor !== shop.shopId ? (
                  <button
                    onClick={() => setSettleFormOpenFor(shop.shopId)}
                    style={{ width: "100%", padding: 8, background: "#1e3a8a", color: "white", border: "none" }}
                  >
                    💰 {t("settleTotalDue")}
                  </button>
                ) : (
                  <div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={`${t("howMuchPaying")} (${t("maxLabel")} ₹${shop.outstanding})`}
                      value={settleAmountInputs[shop.shopId] || ""}
                      onChange={(e) =>
                        setSettleAmountInputs((prev) => ({ ...prev, [shop.shopId]: e.target.value }))
                      }
                      style={{ display: "block", width: "100%", marginBottom: 4, padding: 8, boxSizing: "border-box" }}
                    />
                    {/* ---- নতুন: টাইপ করার সাথে সাথেই ভুল পরিমাণ ধরিয়ে দেওয়া ---- */}
                    {settleAmountInputs[shop.shopId] && Number(settleAmountInputs[shop.shopId]) > shop.outstanding && (
                      <p style={{ color: "#f97316", fontSize: 12, margin: "0 0 6px 0" }}>
                        ⚠️ {t("maxSettleable")} ₹{shop.outstanding}
                      </p>
                    )}
                    {settleAmountInputs[shop.shopId] && Number(settleAmountInputs[shop.shopId]) <= 0 && (
                      <p style={{ color: "#f97316", fontSize: 12, margin: "0 0 6px 0" }}>
                        ⚠️ {t("enterValidAmount")}
                      </p>
                    )}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                      <button
                        onClick={() => sendSettlementRequest(shop)}
                        disabled={
                          settleSubmitting ||
                          !settleAmountInputs[shop.shopId] ||
                          Number(settleAmountInputs[shop.shopId]) <= 0 ||
                          Number(settleAmountInputs[shop.shopId]) > shop.outstanding
                        }
                        style={{ flex: 1, padding: 8, background: "#16a34a", color: "white", border: "none" }}
                      >
                        {settleSubmitting ? "⏳ ..." : t("sendRequestShort")}
                      </button>
                      <button
                        onClick={() => setSettleFormOpenFor(null)}
                        style={{ padding: "8px 14px", background: "#333", color: "white", border: "1px solid #666" }}
                      >
                        {t("cancel")}
                      </button>
                    </div>
                    {settleError[shop.shopId] && (
                      <p style={{ color: "red", fontSize: 12, margin: "4px 0 0 0" }}>{settleError[shop.shopId]}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ---- নতুন: রিকোয়েস্ট পাঠানো হয়েছে, দোকানদারের accept করার অপেক্ষায় ---- */}
            {activeSettle?.status === "pending" && (
              <p style={{ marginTop: 8, fontSize: 13, color: "#fbbf24" }}>
                ⏳ ₹{activeSettle.amount} {t("settleRequestSentWaiting")}
              </p>
            )}

            {/* ---- নতুন: দোকানদার PIN দিয়েছেন, কাস্টমার এখানেই PIN দিয়ে কনফার্ম করবেন ---- */}
            {activeSettle?.status === "awaiting_pin" && (
              <div style={{ marginTop: 8, background: "#3b2a00", padding: 10, borderRadius: 6 }}>
                <p style={{ margin: "0 0 6px 0", fontSize: 13, color: "#fbbf24" }}>
                  {t("shopGavePinFor")} ₹{activeSettle.amount} — {t("enterPinBelow")}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <input
                    type="text"
                    placeholder={t("enterPinPlaceholder")}
                    value={settlePinInputs[activeSettle.id] || ""}
                    onChange={(e) =>
                      setSettlePinInputs((prev) => ({ ...prev, [activeSettle.id]: e.target.value }))
                    }
                    style={{ flex: 1, padding: 8, boxSizing: "border-box" }}
                  />
                  <button
                    onClick={() => confirmSettlement(activeSettle)}
                    disabled={settleConfirming[activeSettle.id]}
                    style={{ padding: "8px 14px", background: "#16a34a", color: "white", border: "none", fontWeight: "bold" }}
                  >
                    {settleConfirming[activeSettle.id] ? "..." : t("confirmButton")}
                  </button>
                </div>
                {settleError[activeSettle.id] && (
                  <p style={{ color: "red", fontSize: 12, margin: "4px 0 0 0" }}>{settleError[activeSettle.id]}</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      <h3 style={{ marginTop: 30 }}>{t("allTransactionsDetail")}</h3>
      {transactions.length === 0 && (
        <p style={{ color: "#999" }}>{t("noTransactionsYet")}</p>
      )}
      {(showAllTxns ? transactions : transactions.slice(0, 30)).map((txn) => {
        const s = statusMap[txn.status] || statusMap.pending_approval;
        const remaining = getRemaining(txn);
        return (
          <div
            key={txn.id}
            style={{
              borderLeft: `6px solid ${s.color}`,
              padding: 12,
              marginBottom: 10,
              background: "#1a1a1a",
              borderRadius: 6,
              wordBreak: "break-word",
            }}
          >
            <p style={{ margin: 0 }}>🏪 {txn.shopName}</p>
            {/* ---- নতুন: প্রতিটা লেনদেনের তারিখ ও সময় — সার্ভার নিজে থেকেই সেট করে (serverTimestamp),
            কেউ এটা এডিট করতে পারে না, Firestore Rules এও এই ফিল্ড ক্লায়েন্ট থেকে বদলানো বন্ধ করা আছে ---- */}
            <p style={{ margin: "2px 0 4px 0", fontSize: 12, color: "#999" }}>
              🕐{" "}
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
            {/* ---- বদলানো হয়েছে: পরিমাণ ও বিবরণ আলাদা লাইনে, স্পষ্ট লেবেল সহ দেখানো ---- */}
            <p style={{ margin: 0, fontSize: 18, fontWeight: "bold", display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {t("amountLabel")}: ₹{txn.amount}
              {txn.wasEdited && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: "normal",
                    color: "#93c5fd",
                    background: "#1e3a5f",
                    padding: "2px 8px",
                    borderRadius: 999,
                  }}
                >
                  ✏️ {t("edited")}
                </span>
              )}
            </p>
            {txn.itemDetails && (
              <p style={{ margin: 0, fontSize: 13, color: "#ccc" }}>{t("detailsLabel")}: {txn.itemDetails}</p>
            )}

            {/* ---- নতুন: আংশিক পরিশোধের অগ্রগতি ---- */}
            {(txn.amountPaid || 0) > 0 && txn.status !== "paid" && (
              <p style={{ margin: 0, fontSize: 12, color: "#4ade80" }}>
                {t("paidLabel")}: ₹{txn.amountPaid} | {t("remainingLabel")}: ₹{remaining}
              </p>
            )}

            {/* ---- নতুন: মেয়াদ পার হয়ে গেলে সতর্কতা দেখানো ---- */}
            {isOverdue(txn) && (
              <p style={{ margin: "2px 0", fontSize: 12, color: "#f97316", fontWeight: "bold" }}>
                ⚠️ {t("overdueBy")} ({getOverdueDays(txn)} {t("days")}) — {t("settleSoon")}
              </p>
            )}

            <strong style={{ color: s.color }}>{s.label}</strong>

            {txn.status === "pending_approval" && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => respond(txn, "approved")}
                  style={{ flex: 1, padding: 8, background: "green", color: "white", border: "none" }}
                >
                  ✅ {t("approveButton")}
                </button>
                <button
                  onClick={() => respond(txn, "rejected")}
                  style={{ flex: 1, padding: 8, background: "red", color: "white", border: "none" }}
                >
                  ❌ {t("rejectButton")}
                </button>
              </div>
            )}

            {/* ---- নতুন: দোকানদার PIN জেনারেট করলে, কাস্টমার এখানেই সরাসরি PIN দিয়ে পরিশোধ কনফার্ম করতে পারবেন — আলাদা লিংক লাগবে না ---- */}
            {txn.status === "awaiting_pin_confirmation" && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: "0 0 6px 0", fontSize: 13, color: "#fbbf24" }}>
                  {t("shopGavePinFor")} ₹{txn.pendingPaymentAmount || txn.amount} — {t("enterPinBelow")}
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <input
                    type="text"
                    placeholder={t("enterPinPlaceholder")}
                    value={pinInputs[txn.id] || ""}
                    onChange={(e) =>
                      setPinInputs((prev) => ({ ...prev, [txn.id]: e.target.value }))
                    }
                    style={{ flex: 1, padding: 8, boxSizing: "border-box" }}
                  />
                  <button
                    onClick={() => confirmPayment(txn)}
                    disabled={pinConfirming[txn.id]}
                    style={{ padding: "8px 14px", background: "#16a34a", color: "white", border: "none", fontWeight: "bold" }}
                  >
                    {pinConfirming[txn.id] ? "..." : t("confirmButton")}
                  </button>
                </div>
                {pinErrors[txn.id] && (
                  <p style={{ color: "red", fontSize: 12, margin: "4px 0 0 0" }}>{pinErrors[txn.id]}</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ---- নতুন: ৩০টার বেশি লেনদেন থাকলে "আরও দেখুন" বাটন ---- */}
      {!showAllTxns && transactions.length > 30 && (
        <button
          onClick={() => setShowAllTxns(true)}
          style={{ width: "100%", padding: 10, background: "#333", color: "white", border: "1px solid #666", marginTop: 8 }}
        >
          {t("showMore")} ({transactions.length - 30} {t("remaining")})
        </button>
      )}
    </div>
  );
}