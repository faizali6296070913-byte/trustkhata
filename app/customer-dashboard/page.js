"use client";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, updateDoc, serverTimestamp, collection, query, where, orderBy } from "firebase/firestore";
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

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = "/customer-login";
        return;
      }
      const digits = normalizePhone(user.phoneNumber);

      const unsubCustomer = onSnapshot(doc(db, "customers", digits), (snap) => {
        setCustomerData(snap.exists() ? snap.data() : null);
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

      return () => {
        unsubCustomer();
        unsubTxns();
      };
    });
    return () => unsubAuth();
  }, []);

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

  if (loading) return <p style={{ padding: 20 }}>লোড হচ্ছে...</p>;

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

      {/* ---- নতুন: সেটিংস প্যানেল (পাসওয়ার্ড বদলানো) ---- */}
      {showSettings && (
        <div style={{ background: "#1a1a1a", padding: 15, marginBottom: 20, marginTop: 12, borderRadius: 6 }}>
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
      {shopList.map((shop, idx) => (
        <div
          key={idx}
          onClick={() => (window.location.href = `/shop-ledger/${shop.shopId}`)}
          style={{ background: "#1a1a1a", padding: 10, marginBottom: 8, cursor: "pointer" }}
        >
          <p style={{ margin: 0, fontWeight: "bold" }}>🏪 {shop.shopName} <span style={{ fontSize: 11, color: "#3b82f6" }}>বিস্তারিত দেখুন →</span></p>
          <p style={{ margin: 0, fontSize: 13 }}>
            বাকি: <span style={{ color: shop.outstanding > 0 ? "orange" : "#999" }}>₹{shop.outstanding}</span>
            {"  |  "}পরিশোধিত: <span style={{ color: "green" }}>₹{shop.paid}</span>
          </p>
        </div>
      ))}

      <h3 style={{ marginTop: 30 }}>সব লেনদেনের বিস্তারিত</h3>
      {transactions.length === 0 && <p>কোনো রেকর্ড নেই।</p>}
      {transactions.map((txn) => {
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
          </div>
        );
      })}
    </div>
  );
}