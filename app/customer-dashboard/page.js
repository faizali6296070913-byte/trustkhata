"use client";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, setDoc, serverTimestamp, collection, query, where, orderBy, arrayUnion } from "firebase/firestore";
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
import { executeFifoSettlement } from "@/lib/settlement";
import { isOverdue, getOverdueDays, checkAndApplyOverduePenalty } from "@/lib/overdue";

export default function CustomerDashboardPage() {
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

      return () => {
        unsubCustomer();
        unsubTxns();
        unsubSettle();
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
      setPwChangeError("নতুন পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPwChangeError("নতুন পাসওয়ার্ড দুই জায়গায় মিলছে না।");
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
      setProfileSuccess("✅ প্রোফাইল আপডেট হয়েছে।");
    } catch (err) {
      console.error(err);
      setProfileError("আপডেট করা যায়নি, আবার চেষ্টা করুন।");
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
      setSettleError((prev) => ({ ...prev, [shop.shopId]: "সঠিক পরিমাণ লিখুন।" }));
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
      setSettleError((prev) => ({ ...prev, [shop.shopId]: "সমস্যা হয়েছে, আবার চেষ্টা করুন।" }));
    }
    setSettleSubmitting(false);
  };

  // ---- নতুন: দোকানদারের দেওয়া PIN দিয়ে "মোট বাকি মেটান" কনফার্ম করা — FIFO অনুযায়ী automatically পুরনো এন্ট্রি থেকে কাটা হবে ----
  const confirmSettlement = async (req) => {
    const enteredPin = settlePinInputs[req.id] || "";
    setSettleError((prev) => ({ ...prev, [req.id]: "" }));

    if (enteredPin !== req.pin) {
      setSettleError((prev) => ({ ...prev, [req.id]: "ভুল PIN, আবার চেষ্টা করুন।" }));
      return;
    }

    setSettleConfirming((prev) => ({ ...prev, [req.id]: true }));
    try {
      await executeFifoSettlement(req.shopId, req.customerId, req.amount, req.customerPhone);
      await updateDoc(doc(db, "settlementRequests", req.id), {
        status: "completed",
        completedAt: serverTimestamp(),
      });
      setSettlePinInputs((prev) => ({ ...prev, [req.id]: "" }));
    } catch (err) {
      console.error(err);
      setSettleError((prev) => ({
        ...prev,
        [req.id]: err.message || "সমস্যা হয়েছে, আবার চেষ্টা করুন।",
      }));
    }
    setSettleConfirming((prev) => ({ ...prev, [req.id]: false }));
  };

  const confirmPayment = async (txn) => {
    const enteredPin = pinInputs[txn.id] || "";
    setPinErrors((prev) => ({ ...prev, [txn.id]: "" }));

    if (enteredPin !== txn.securityPIN) {
      setPinErrors((prev) => ({ ...prev, [txn.id]: "ভুল PIN, আবার চেষ্টা করুন।" }));
      return;
    }

    setPinConfirming((prev) => ({ ...prev, [txn.id]: true }));

    const thisPayment = txn.pendingPaymentAmount || txn.amount;
    const previousPaid = txn.amountPaid || 0;
    const newAmountPaid = previousPaid + thisPayment;
    const remaining = txn.amount - newAmountPaid;
    const isFullyPaid = remaining <= 0;

    try {
      const updates = {
        amountPaid: newAmountPaid,
        payments: arrayUnion({
          amount: thisPayment,
          paidAt: new Date().toISOString(),
        }),
      };

      if (isFullyPaid) {
        updates.status = "paid";
        updates.paidAt = serverTimestamp();
      } else {
        updates.status = "approved";
      }

      await updateDoc(doc(db, "transactions", txn.id), updates);

      if (isFullyPaid) {
        await updateCustomerScore(txn.customerPhone, "paid", txn.amount);
      }

      setPinInputs((prev) => ({ ...prev, [txn.id]: "" }));
    } catch (err) {
      console.error(err);
      setPinErrors((prev) => ({ ...prev, [txn.id]: "সমস্যা হয়েছে, আবার চেষ্টা করুন।" }));
    }
    setPinConfirming((prev) => ({ ...prev, [txn.id]: false }));
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
      alert("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
  };

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
    if (score >= 70) return { label: "🟢 বিশ্বস্ত কাস্টমার", color: "green" };
    if (score >= 40) return { label: "🟡 মাঝারি", color: "orange" };
    return { label: "🔴 ঝুঁকিপূর্ণ", color: "red" };
  };

  const statusMap = {
    pending_approval: { color: "#999", label: "⏳ অপেক্ষমান" },
    approved: { color: "green", label: "🟢 Approved" },
    rejected: { color: "red", label: "🔴 Rejected" },
    awaiting_pin_confirmation: { color: "orange", label: "🔑 PIN অপেক্ষমান" },
    paid: { color: "blue", label: "✅ সম্পূর্ণ পরিশোধিত" },
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
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>আমার প্রোফাইল</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowSettings((v) => !v)}
            style={{ padding: 8, background: "#333", color: "white", border: "1px solid #666", height: 36 }}
          >
            ⚙️ সেটিংস
          </button>
          <button
            onClick={handleLogout}
            style={{ padding: 8, background: "#333", color: "white", border: "1px solid #666", height: 36 }}
          >
            🚪 লগ আউট
          </button>
        </div>
      </div>

      {/* ---- নতুন: নতুন ক্রেডিট রিকোয়েস্ট থাকলে সবার ওপরে বড় করে দেখানো, WhatsApp ছাড়াই সরাসরি Approve/Reject করা যাবে ---- */}
      {transactions.filter((t) => t.status === "pending_approval").length > 0 && (
        <div style={{ background: "#3b2a00", border: "2px solid #f59e0b", padding: 14, marginTop: 14, borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 10px 0", color: "#fbbf24" }}>
            🔔 নতুন ক্রেডিট রিকোয়েস্ট এসেছে
          </h3>
          {transactions
            .filter((t) => t.status === "pending_approval")
            .map((txn) => (
              <div key={txn.id} style={{ background: "#1a1a1a", padding: 12, marginBottom: 8, borderRadius: 6 }}>
                <p style={{ margin: 0, fontWeight: "bold" }}>🏪 {txn.shopName}</p>
                <p style={{ margin: "4px 0" }}>
                  পরিমাণ: <span style={{ fontWeight: "bold" }}>₹{txn.amount}</span>
                  {txn.itemDetails ? ` — ${txn.itemDetails}` : ""}
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => respond(txn, "approved")}
                    style={{ flex: 1, padding: 10, background: "#16a34a", color: "white", border: "none", fontWeight: "bold" }}
                  >
                    ✅ অ্যাপ্রুভ করুন
                  </button>
                  <button
                    onClick={() => respond(txn, "rejected")}
                    style={{ flex: 1, padding: 10, background: "#dc2626", color: "white", border: "none", fontWeight: "bold" }}
                  >
                    ❌ বাতিল করুন
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}
      {showSettings && (
        <div style={{ background: "#1a1a1a", padding: 15, marginBottom: 20, marginTop: 12, borderRadius: 6 }}>
          <h3 style={{ marginTop: 0 }}>✏️ প্রোফাইল তথ্য বদলান</h3>
          <form onSubmit={handleUpdateProfile}>
            <input
              type="text"
              placeholder="পূর্ণ নাম"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="text"
              placeholder="রাস্তা/এলাকা"
              value={editStreet}
              onChange={(e) => setEditStreet(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="text"
              placeholder="শহর"
              value={editCity}
              onChange={(e) => setEditCity(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="text"
              placeholder="রাজ্য"
              value={editState}
              onChange={(e) => setEditState(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="text"
              placeholder="পিনকোড"
              value={editPincode}
              onChange={(e) => setEditPincode(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="tel"
              placeholder="বিকল্প ফোন নাম্বার (ঐচ্ছিক)"
              value={editAltPhone}
              onChange={(e) => setEditAltPhone(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="text"
              placeholder="পেশা (ঐচ্ছিক)"
              value={editOccupation}
              onChange={(e) => setEditOccupation(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 10, padding: 8, boxSizing: "border-box" }}
            />
            <button type="submit" disabled={profileSubmitting} style={{ width: "100%", padding: 10 }}>
              {profileSubmitting ? "আপডেট হচ্ছে..." : "প্রোফাইল আপডেট করুন"}
            </button>
            {profileError && <p style={{ color: "red", fontSize: 13 }}>{profileError}</p>}
            {profileSuccess && <p style={{ color: "#4ade80", fontSize: 13 }}>{profileSuccess}</p>}
          </form>

          <hr style={{ margin: "16px 0", borderColor: "#333" }} />

          <h3 style={{ marginTop: 0 }}>🔑 পাসওয়ার্ড বদলান</h3>
          <form onSubmit={handleChangePassword}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <input
                type={showCurrentPw ? "text" : "password"}
                placeholder="বর্তমান পাসওয়ার্ড"
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
                placeholder="নতুন পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)"
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
              placeholder="নতুন পাসওয়ার্ড আবার লিখুন"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              required
              style={{ display: "block", width: "100%", marginBottom: 10, padding: 8, boxSizing: "border-box" }}
            />

            <button type="submit" disabled={pwChangeSubmitting} style={{ width: "100%", padding: 10 }}>
              {pwChangeSubmitting ? "পরিবর্তন হচ্ছে..." : "পাসওয়ার্ড বদলান"}
            </button>
            {pwChangeError && <p style={{ color: "red", fontSize: 13 }}>{pwChangeError}</p>}
            {pwChangeSuccess && <p style={{ color: "#4ade80", fontSize: 13 }}>{pwChangeSuccess}</p>}
          </form>
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
          📞 বিকল্প নাম্বার: {customerData.altPhone}
        </p>
      )}

      {customerData?.occupation && (
        <p style={{ margin: 0, fontSize: 13, color: "#999" }}>
          💼 পেশা: {customerData.occupation}
        </p>
      )}

      <p style={{ color: tier.color, fontWeight: "bold", fontSize: 18, marginTop: 10 }}>
        {tier.label} — স্কোর: {score}/100
      </p>
      {customerData?.isRedFlagged && (
        <p style={{ color: "red", fontWeight: "bold" }}>
          ⚠️ আপনার প্রোফাইলে Red Flag আছে (বারবার রিজেক্ট করার কারণে)
        </p>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
        <div style={{ background: "#1a1a1a", padding: 12, flex: "1 1 45%", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>মোট বাকি (অপরিশোধিত)</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: "bold", color: "orange" }}>₹{totalOutstanding}</p>
        </div>
        <div style={{ background: "#1a1a1a", padding: 12, flex: "1 1 45%", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>মোট পরিশোধিত</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: "bold", color: "green" }}>₹{totalPaid}</p>
        </div>
        <div style={{ background: "#1a1a1a", padding: 12, flex: "1 1 45%", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>বাকি আছে এমন দোকান</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: "bold" }}>{shopIdsWithDue.size}</p>
        </div>
        <div style={{ background: "#1a1a1a", padding: 12, flex: "1 1 45%", textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>মোট দোকান (সব মিলিয়ে)</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: "bold" }}>{allShopIds.size}</p>
        </div>
      </div>

      <h3 style={{ marginTop: 30 }}>দোকান অনুযায়ী হিসাব</h3>
      {shopList.length === 0 && <p>কোনো দোকানে লেনদেন নেই।</p>}
      {shopList.map((shop, idx) => {
        // ---- নতুন: এই দোকানের জন্য চলমান settlement request (যদি থাকে) খুঁজে বের করা ----
        const activeSettle = settlementRequests.find(
          (r) => r.shopId === shop.shopId && (r.status === "pending" || r.status === "awaiting_pin")
        );

        return (
          <div key={idx} style={{ background: "#1a1a1a", padding: 10, marginBottom: 8 }}>
            <div onClick={() => (window.location.href = `/shop-ledger/${shop.shopId}`)} style={{ cursor: "pointer" }}>
              <p style={{ margin: 0, fontWeight: "bold" }}>🏪 {shop.shopName} <span style={{ fontSize: 11, color: "#3b82f6" }}>বিস্তারিত দেখুন →</span></p>
              <p style={{ margin: 0, fontSize: 13 }}>
                বাকি: <span style={{ color: shop.outstanding > 0 ? "orange" : "#999" }}>₹{shop.outstanding}</span>
                {"  |  "}পরিশোধিত: <span style={{ color: "green" }}>₹{shop.paid}</span>
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
                    💰 মোট বাকি মেটান
                  </button>
                ) : (
                  <div>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={`কত টাকা দিচ্ছেন (সর্বোচ্চ ₹${shop.outstanding})`}
                      value={settleAmountInputs[shop.shopId] || ""}
                      onChange={(e) =>
                        setSettleAmountInputs((prev) => ({ ...prev, [shop.shopId]: e.target.value }))
                      }
                      style={{ display: "block", width: "100%", marginBottom: 6, padding: 8, boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => sendSettlementRequest(shop)}
                        disabled={settleSubmitting}
                        style={{ flex: 1, padding: 8, background: "#16a34a", color: "white", border: "none" }}
                      >
                        {settleSubmitting ? "..." : "রিকোয়েস্ট পাঠান"}
                      </button>
                      <button
                        onClick={() => setSettleFormOpenFor(null)}
                        style={{ padding: "8px 14px", background: "#333", color: "white", border: "1px solid #666" }}
                      >
                        বাতিল
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
                ⏳ ₹{activeSettle.amount} মেটানোর অনুরোধ পাঠানো হয়েছে, দোকানদারের অনুমোদনের অপেক্ষায়।
              </p>
            )}

            {/* ---- নতুন: দোকানদার PIN দিয়েছেন, কাস্টমার এখানেই PIN দিয়ে কনফার্ম করবেন ---- */}
            {activeSettle?.status === "awaiting_pin" && (
              <div style={{ marginTop: 8, background: "#3b2a00", padding: 10, borderRadius: 6 }}>
                <p style={{ margin: "0 0 6px 0", fontSize: 13, color: "#fbbf24" }}>
                  দোকানদার ₹{activeSettle.amount} এর জন্য PIN দিয়েছেন — সেই PIN নিচে লিখুন:
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="PIN দিন"
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
                    {settleConfirming[activeSettle.id] ? "..." : "কনফার্ম"}
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

      <h3 style={{ marginTop: 30 }}>সব লেনদেনের বিস্তারিত</h3>
      {transactions.length === 0 && <p>কোনো রেকর্ড নেই।</p>}
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
            }}
          >
            <p style={{ margin: 0 }}>🏪 {txn.shopName}</p>
            <p style={{ margin: 0 }}>
              ₹{txn.amount} {txn.itemDetails ? `— ${txn.itemDetails}` : ""}
            </p>

            {/* ---- নতুন: আংশিক পরিশোধের অগ্রগতি ---- */}
            {(txn.amountPaid || 0) > 0 && txn.status !== "paid" && (
              <p style={{ margin: 0, fontSize: 12, color: "#4ade80" }}>
                পরিশোধিত: ₹{txn.amountPaid} | বাকি: ₹{remaining}
              </p>
            )}

            {/* ---- নতুন: মেয়াদ পার হয়ে গেলে সতর্কতা দেখানো ---- */}
            {isOverdue(txn) && (
              <p style={{ margin: "2px 0", fontSize: 12, color: "#f97316", fontWeight: "bold" }}>
                ⚠️ মেয়াদ পার হয়ে গেছে ({getOverdueDays(txn)} দিন) — দ্রুত মেটান
              </p>
            )}

            <strong style={{ color: s.color }}>{s.label}</strong>

            {txn.status === "pending_approval" && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button
                  onClick={() => respond(txn, "approved")}
                  style={{ flex: 1, padding: 8, background: "green", color: "white", border: "none" }}
                >
                  ✅ Approve
                </button>
                <button
                  onClick={() => respond(txn, "rejected")}
                  style={{ flex: 1, padding: 8, background: "red", color: "white", border: "none" }}
                >
                  ❌ Reject
                </button>
              </div>
            )}

            {/* ---- নতুন: দোকানদার PIN জেনারেট করলে, কাস্টমার এখানেই সরাসরি PIN দিয়ে পরিশোধ কনফার্ম করতে পারবেন — আলাদা লিংক লাগবে না ---- */}
            {txn.status === "awaiting_pin_confirmation" && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: "0 0 6px 0", fontSize: 13, color: "#fbbf24" }}>
                  দোকানদার ₹{txn.pendingPaymentAmount || txn.amount} এর জন্য PIN দিয়েছেন — সেই PIN নিচে লিখুন:
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="PIN দিন"
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
                    {pinConfirming[txn.id] ? "..." : "কনফার্ম"}
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
          আরও দেখুন ({transactions.length - 30} টি বাকি)
        </button>
      )}
    </div>
  );
}