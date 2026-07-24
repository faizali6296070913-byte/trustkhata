"use client";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  getDoc,
  collection,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { normalizePhone } from "@/lib/phone";

export default function DashboardPage() {
  const [shopData, setShopData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(null);
  const [transactions, setTransactions] = useState([]);

  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [itemDetails, setItemDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [lastLink, setLastLink] = useState(null);
  const [lastPhone, setLastPhone] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const [customerScore, setCustomerScore] = useState(null);
  const [customerFlagged, setCustomerFlagged] = useState(false);
  const [customerVerified, setCustomerVerified] = useState(false);
  const [checkingScore, setCheckingScore] = useState(false);
  const [verifiedByMe, setVerifiedByMe] = useState(false);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setUid(user.uid);
      const unsubSnap = onSnapshot(doc(db, "shopkeepers", user.uid), (snap) => {
        setShopData(snap.data());
        setLoading(false);
      });
      return () => unsubSnap();
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "transactions"),
      where("shopId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const txns = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTransactions(txns);
    });
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      setCustomerScore(null);
      setCustomerFlagged(false);
      setCustomerVerified(false);
      return;
    }
    setCheckingScore(true);
    const timer = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, "customers", digits));
        if (snap.exists()) {
          setCustomerScore(snap.data().trustScore ?? 50);
          setCustomerFlagged(snap.data().isRedFlagged === true);
          setCustomerVerified(snap.data().verifiedByShopkeeper === true);
        } else {
          setCustomerScore(50);
          setCustomerFlagged(false);
          setCustomerVerified(false);
        }
      } catch (err) {
        console.error(err);
        setCustomerScore(null);
      }
      setCheckingScore(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [phone]);

  const getScoreTier = (score) => {
    if (score >= 70) return { label: "🟢 বিশ্বস্ত কাস্টমার", color: "green" };
    if (score >= 40) return { label: "🟡 মাঝারি", color: "orange" };
    return { label: "🔴 ঝুঁকিপূর্ণ", color: "red" };
  };

  const buildWhatsAppLink = (rawPhone, message) => {
    let digits = normalizePhone(rawPhone);
    digits = "91" + digits;
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  };

  const handleLogout = () => {
    signOut(auth).then(() => {
      window.location.href = "/";
    });
  };

  const handleCreditRequest = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSuccessMsg("");
    try {
      const txnRef = doc(collection(db, "transactions"));
      const token = crypto.randomUUID() + crypto.randomUUID();
      const phoneHash = normalizePhone(phone);
      const now = serverTimestamp();
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      await Promise.all([
        setDoc(txnRef, {
          shopId: uid,
          shopName: shopData.shopName,
          customerPhone: phone,
          customerId: phoneHash,
          amount: Number(amount),
          itemDetails: itemDetails || null,
          billPhotoURL: null,
          status: "pending_approval",
          approvalToken: token,
          verifiedByShopkeeper: verifiedByMe,
          createdAt: now,
          approvedAt: null,
          rejectedAt: null,
        }),
        setDoc(doc(db, "approvals", token), {
          transactionId: txnRef.id,
          shopId: uid,
          shopName: shopData.shopName,
          customerPhone: phone,
          amount: Number(amount),
          itemDetails: itemDetails || null,
          status: "pending",
          createdAt: now,
          expiresAt,
        }),
      ]);

      if (verifiedByMe) {
        await setDoc(
          doc(db, "customers", phoneHash),
          { verifiedByShopkeeper: true },
          { merge: true }
        );
      }

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      const link = `${appUrl}/approve/${token}`;

      setLastLink(link);
      setLastPhone(phone);
      setSuccessMsg("রিকোয়েস্ট তৈরি হয়েছে! নিচের বাটনে চেপে WhatsApp এ পাঠান।");
      setPhone("");
      setAmount("");
      setItemDetails("");
      setCustomerScore(null);
      setCustomerFlagged(false);
      setCustomerVerified(false);
      setVerifiedByMe(false);
    } catch (err) {
      console.error(err);
    }
    setSubmitting(false);
  };

  const markAsPaid = async (txnId) => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    try {
      await updateDoc(doc(db, "transactions", txnId), {
        securityPIN: pin,
        pinGeneratedAt: serverTimestamp(),
        status: "awaiting_pin_confirmation",
      });
    } catch (err) {
      console.error(err);
      alert("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
  };

  const copyLink = (link, id) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
    const fullLink = `${appUrl}${link}`;
    navigator.clipboard.writeText(fullLink).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  if (loading) return <p style={{ padding: 20 }}>লোড হচ্ছে...</p>;

  if (shopData?.status === "pending_review") {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2>{shopData.shopName}</h2>
          <button
            onClick={handleLogout}
            style={{ padding: 8, background: "#333", color: "white", border: "1px solid #666", height: 36 }}
          >
            🚪 লগ আউট
          </button>
        </div>
        <p>⏳ আপনার একাউন্ট এখনো অ্যাডমিন অ্যাপ্রুভ করেনি। অনুগ্রহ করে অপেক্ষা করুন।</p>
      </div>
    );
  }

  const statusMap = {
    pending_approval: { color: "#999", label: "⏳ অপেক্ষমান" },
    approved: { color: "green", label: "🟢 Approved" },
    rejected: { color: "red", label: "🔴 Rejected" },
    awaiting_pin_confirmation: { color: "orange", label: "🔑 PIN অপেক্ষমান" },
    paid: { color: "blue", label: "✅ পরিশোধিত" },
  };

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>{shopData.shopName}</h2>
        <button
          onClick={handleLogout}
          style={{ padding: 8, background: "#333", color: "white", border: "1px solid #666", height: 36 }}
        >
          🚪 লগ আউট
        </button>
      </div>
      <p>✅ স্ট্যাটাস: {shopData.status}</p>

      <h3 style={{ marginTop: 20 }}>নতুন ক্রেডিট রিকোয়েস্ট</h3>
      <form onSubmit={handleCreditRequest}>
        <input
          type="tel"
          placeholder="কাস্টমারের ফোন (যেমন 9876543210)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />

        {checkingScore && <p style={{ fontSize: 12, color: "#999" }}>স্কোর চেক হচ্ছে...</p>}

        {!checkingScore && customerScore !== null && (
          <div style={{ marginBottom: 10 }}>
            <p
              style={{
                fontSize: 13,
                margin: 0,
                color: getScoreTier(customerScore).color,
                fontWeight: "bold",
              }}
            >
              {getScoreTier(customerScore).label} — স্কোর: {customerScore}/100
              {customerVerified && (
                <span style={{ color: "#3b82f6", marginLeft: 6 }}>✅ দোকানদার-যাচাইকৃত</span>
              )}
            </p>
            {customerFlagged && (
              <p style={{ fontSize: 13, margin: 0, color: "red", fontWeight: "bold" }}>
                ⚠️ Red Flag — এই কাস্টমার বারবার রিকোয়েস্ট রিজেক্ট করেছে
              </p>
            )}
          </div>
        )}

        <input
          type="number"
          placeholder="টাকার পরিমাণ"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <textarea
          placeholder="জিনিসের বিবরণ (ঐচ্ছিক)"
          value={itemDetails}
          onChange={(e) => setItemDetails(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />

        {customerScore !== null && !customerVerified && (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={verifiedByMe}
              onChange={(e) => setVerifiedByMe(e.target.checked)}
            />
            আমি এই ব্যক্তিকে সরাসরি চিনি ও শনাক্ত করেছি
          </label>
        )}

        <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
          {submitting ? "পাঠানো হচ্ছে..." : "রিকোয়েস্ট পাঠান"}
        </button>
      </form>

      {successMsg && <p style={{ color: "green" }}>{successMsg}</p>}

      {lastLink && (
        <a
          href={buildWhatsAppLink(
            lastPhone,
            `আপনার একটি বাকি অনুরোধ এসেছে। অনুমোদন বা প্রত্যাখ্যান করতে এখানে ক্লিক করুন: ${lastLink}`
          )}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            textAlign: "center",
            marginTop: 10,
            padding: 10,
            background: "#25D366",
            color: "white",
            fontWeight: "bold",
            textDecoration: "none",
          }}
        >
          📱 WhatsApp এ পাঠান
        </a>
      )}

      <h3 style={{ marginTop: 30 }}>সাম্প্রতিক রিকোয়েস্টগুলো</h3>
      {transactions.length === 0 && <p>কোনো রিকোয়েস্ট নেই।</p>}
      {transactions.map((txn) => {
        const s = statusMap[txn.status] || statusMap.pending_approval;
        const approveLink = `/approve/${txn.approvalToken}`;
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
            <p style={{ margin: 0 }}>
              👤 {txn.customerPhone}
              {txn.verifiedByShopkeeper && (
                <span style={{ color: "#3b82f6", fontSize: 11, marginLeft: 6 }}>✅ যাচাইকৃত</span>
              )}
            </p>
            <p style={{ margin: 0 }}>
              ₹{txn.amount} {txn.itemDetails ? `— ${txn.itemDetails}` : ""}
            </p>
            <strong style={{ color: s.color }}>{s.label}</strong>

            {txn.status === "pending_approval" && txn.approvalToken && (
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a
                  href={buildWhatsAppLink(
                    txn.customerPhone,
                    `আপনার একটি বাকি অনুরোধ এসেছে। অনুমোদন বা প্রত্যাখ্যান করতে এখানে ক্লিক করুন: ${
                      (process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : ""))
                    }${approveLink}`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: 6,
                    background: "#25D366",
                    color: "white",
                    fontSize: 13,
                    textDecoration: "none",
                  }}
                >
                  📱 WhatsApp এ পাঠান
                </a>
                <button
                  onClick={() => copyLink(approveLink, txn.id)}
                  style={{
                    padding: 6,
                    background: "#333",
                    color: "white",
                    border: "1px solid #666",
                  }}
                >
                  {copiedId === txn.id ? "✅ কপি হয়েছে" : "📋 লিংক কপি করুন"}
                </button>
              </div>
            )}

            {txn.status === "approved" && (
              <button
                onClick={() => markAsPaid(txn.id)}
                style={{
                  display: "block",
                  marginTop: 8,
                  padding: 6,
                  background: "#333",
                  color: "white",
                  border: "1px solid #666",
                }}
              >
                💰 Paid মার্ক করুন
              </button>
            )}

            {txn.status === "awaiting_pin_confirmation" && (
              <>
                <p style={{ fontSize: 12, color: "orange", marginTop: 8 }}>
                  PIN: {txn.securityPIN} (কাস্টমারকে দিন)
                </p>
                <button
                  onClick={() => copyLink(`/confirm-payment/${txn.id}`, txn.id)}
                  style={{
                    marginTop: 4,
                    padding: 6,
                    background: "#333",
                    color: "white",
                    border: "1px solid #666",
                  }}
                >
                  {copiedId === txn.id ? "✅ কপি হয়েছে" : "📋 লিংক কপি করুন"}
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}