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
import {
  onAuthStateChanged,
  signOut,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "firebase/auth";
import { normalizePhone } from "@/lib/phone";
import { getFriendlyAuthError } from "@/lib/authErrors";

const SHOP_TYPES = [
  "মুদি দোকান",
  "ঔষধের দোকান",
  "কাপড়ের দোকান",
  "ইলেকট্রনিক্স",
  "হার্ডওয়্যার",
  "খাবারের দোকান",
  "সবজি/ফলের দোকান",
  "অন্যান্য",
];

export default function DashboardPage() {
  const [shopData, setShopData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState(null);
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

  // ---- নতুন: দোকানের তথ্য এডিট করার জন্য state ----
  const [editShopName, setEditShopName] = useState("");
  const [editOwnerName, setEditOwnerName] = useState("");
  const [editShopType, setEditShopType] = useState(SHOP_TYPES[0]);
  const [editYearsInBusiness, setEditYearsInBusiness] = useState("");
  const [editStreet, setEditStreet] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editState, setEditState] = useState("");
  const [editPincode, setEditPincode] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");

  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [itemDetails, setItemDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [lastLink, setLastLink] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [lastPhone, setLastPhone] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const [customerScore, setCustomerScore] = useState(null);
  const [customerFlagged, setCustomerFlagged] = useState(false);
  const [customerVerified, setCustomerVerified] = useState(false);
  const [checkingScore, setCheckingScore] = useState(false);
  const [verifiedByMe, setVerifiedByMe] = useState(false);

  // ---- নতুন: প্রতিটা transaction এর জন্য আলাদাভাবে পেমেন্ট ইনপুট রাখার state ----
  const [paymentInputs, setPaymentInputs] = useState({});

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }
      setUid(user.uid);
      const unsubSnap = onSnapshot(doc(db, "shopkeepers", user.uid), (snap) => {
        const data = snap.data();
        setShopData(data);
        // ---- নতুন: দোকানের তথ্য এডিট ফর্মের ইনপুট বক্স পূরণ করা ----
        if (data) {
          setEditShopName(data.shopName || "");
          setEditOwnerName(data.ownerName || "");
          setEditShopType(data.shopType || SHOP_TYPES[0]);
          setEditYearsInBusiness(data.yearsInBusiness ?? "");
          setEditStreet(data.address?.street || "");
          setEditCity(data.address?.city || "");
          setEditState(data.address?.state || "");
          setEditPincode(data.address?.pincode || "");
        }
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
          amountPaid: 0, // ---- নতুন: এখন পর্যন্ত কত শোধ হয়েছে ----
          payments: [], // ---- নতুন: কিস্তির ইতিহাস ----
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

  // ---- বদলানো হয়েছে: পুরো amount না নিয়ে, দোকানদার যত টাকা পেয়েছেন সেটা নিয়ে PIN তৈরি করে ----
  // ---- নতুন: দোকানের তথ্য আপডেট করা ----
  const handleUpdateShopProfile = async (e) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setProfileSubmitting(true);
    try {
      await updateDoc(doc(db, "shopkeepers", uid), {
        shopName: editShopName,
        ownerName: editOwnerName,
        shopType: editShopType,
        yearsInBusiness: editYearsInBusiness ? Number(editYearsInBusiness) : null,
        shopAddress: `${editStreet}, ${editCity}, ${editState} - ${editPincode}`,
        address: { street: editStreet, city: editCity, state: editState, pincode: editPincode },
      });
      setProfileSuccess("✅ দোকানের তথ্য আপডেট হয়েছে।");
    } catch (err) {
      console.error(err);
      setProfileError("আপডেট করা যায়নি, আবার চেষ্টা করুন।");
    }
    setProfileSubmitting(false);
  };

  const markAsPaid = async (txn) => {
    const remaining = txn.amount - (txn.amountPaid || 0);
    const enteredRaw = paymentInputs[txn.id];
    const entered = enteredRaw ? Number(enteredRaw) : remaining;

    if (!entered || entered <= 0) {
      alert("সঠিক পরিমাণ লিখুন।");
      return;
    }
    if (entered > remaining) {
      alert(`সর্বোচ্চ ₹${remaining} নেওয়া যাবে (এর বেশি বাকি নেই)।`);
      return;
    }

    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    try {
      await updateDoc(doc(db, "transactions", txn.id), {
        securityPIN: pin,
        pendingPaymentAmount: entered, // ---- নতুন: এই কিস্তিতে কত টাকা কনফার্ম হবে ----
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
      const digits = normalizePhone(shopData.phone);
      const pseudoEmail = `${digits}@halkhata.app`;
      const credential = EmailAuthProvider.credential(pseudoEmail, currentPassword);

      // আগে বর্তমান পাসওয়ার্ড দিয়ে যাচাই করা হচ্ছে
      await reauthenticateWithCredential(auth.currentUser, credential);
      // যাচাই সফল হলে নতুন পাসওয়ার্ড সেট করা হচ্ছে
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
    paid: { color: "blue", label: "✅ সম্পূর্ণ পরিশোধিত" },
  };

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2>{shopData.shopName}</h2>
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
      <p>✅ স্ট্যাটাস: {shopData.status}</p>

      {/* ---- নতুন: সেটিংস প্যানেল (পাসওয়ার্ড বদলানো) ---- */}
      {showSettings && (
        <div style={{ background: "#1a1a1a", padding: 15, marginBottom: 20, borderRadius: 6 }}>
          <h3 style={{ marginTop: 0 }}>✏️ দোকানের তথ্য বদলান</h3>
          <form onSubmit={handleUpdateShopProfile}>
            <input
              type="text"
              placeholder="দোকানের নাম"
              value={editShopName}
              onChange={(e) => setEditShopName(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="text"
              placeholder="মালিকের নাম"
              value={editOwnerName}
              onChange={(e) => setEditOwnerName(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <select
              value={editShopType}
              onChange={(e) => setEditShopType(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            >
              {SHOP_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="কতদিন ধরে ব্যবসা করছেন (বছর)"
              value={editYearsInBusiness}
              onChange={(e) => setEditYearsInBusiness(e.target.value)}
              min="0"
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
              style={{ display: "block", width: "100%", marginBottom: 10, padding: 8, boxSizing: "border-box" }}
            />
            <button type="submit" disabled={profileSubmitting} style={{ width: "100%", padding: 10 }}>
              {profileSubmitting ? "আপডেট হচ্ছে..." : "দোকানের তথ্য আপডেট করুন"}
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
        <>
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
          {/* ---- নতুন: কাস্টমারের WhatsApp না থাকলে, লিংক কপি করে SMS/অন্য মাধ্যমে পাঠানোর সুবিধা ---- */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(lastLink);
              setLinkCopied(true);
              setTimeout(() => setLinkCopied(false), 2000);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "center",
              marginTop: 8,
              padding: 10,
              background: "#333",
              color: "white",
              border: "1px solid #666",
              fontWeight: "bold",
            }}
          >
            {linkCopied ? "✅ কপি হয়েছে!" : "🔗 লিংক কপি করুন (WhatsApp না থাকলে)"}
          </button>
          <p style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
            কাস্টমার নিজের একাউন্টে লগইন করলেও এই রিকোয়েস্ট সরাসরি দেখতে পাবেন।
          </p>
        </>
      )}

      <h3 style={{ marginTop: 30 }}>👤 কাস্টমার অনুযায়ী হিসাব</h3>
      {(() => {
        const customerSummary = {};
        transactions.forEach((t) => {
          if (!customerSummary[t.customerId]) {
            customerSummary[t.customerId] = {
              customerId: t.customerId,
              customerPhone: t.customerPhone,
              outstanding: 0,
              paid: 0,
            };
          }
          const remaining = (t.amount || 0) - (t.amountPaid || 0);
          if (["approved", "awaiting_pin_confirmation"].includes(t.status)) {
            customerSummary[t.customerId].outstanding += remaining;
            customerSummary[t.customerId].paid += t.amountPaid || 0;
          }
          if (t.status === "paid") {
            customerSummary[t.customerId].paid += t.amount || 0;
          }
        });
        const list = Object.values(customerSummary);
        if (list.length === 0) return <p style={{ color: "#999" }}>কোনো কাস্টমার নেই।</p>;
        return list.map((c) => (
          <div
            key={c.customerId}
            onClick={() => (window.location.href = `/customer-ledger/${c.customerId}`)}
            style={{ background: "#1a1a1a", padding: 10, marginBottom: 8, cursor: "pointer" }}
          >
            <p style={{ margin: 0, fontWeight: "bold" }}>
              👤 {c.customerPhone} <span style={{ fontSize: 11, color: "#3b82f6" }}>বিস্তারিত দেখুন →</span>
            </p>
            <p style={{ margin: 0, fontSize: 13 }}>
              বাকি: <span style={{ color: c.outstanding > 0 ? "orange" : "#999" }}>₹{c.outstanding}</span>
              {"  |  "}পরিশোধিত: <span style={{ color: "green" }}>₹{c.paid}</span>
            </p>
          </div>
        ));
      })()}

      <h3 style={{ marginTop: 30 }}>সাম্প্রতিক রিকোয়েস্টগুলো</h3>
      {transactions.length === 0 && <p>কোনো রিকোয়েস্ট নেই।</p>}
      {transactions.map((txn) => {
        const s = statusMap[txn.status] || statusMap.pending_approval;
        const approveLink = `/approve/${txn.approvalToken}`;
        const amountPaid = txn.amountPaid || 0;
        const remaining = txn.amount - amountPaid;

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

            {/* ---- নতুন: আংশিক পরিশোধের অগ্রগতি দেখানো ---- */}
            {amountPaid > 0 && txn.status !== "paid" && (
              <p style={{ margin: 0, fontSize: 12, color: "#4ade80" }}>
                এ পর্যন্ত পরিশোধিত: ₹{amountPaid} | বাকি: ₹{remaining}
              </p>
            )}

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

            {/* ---- বদলানো হয়েছে: পুরো "Paid মার্ক করুন" এর বদলে আংশিক টাকা নেওয়ার ইনপুট ---- */}
            {txn.status === "approved" && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 12, color: "#999", margin: "0 0 4px 0" }}>
                  আজ কত টাকা পেয়েছেন? (সর্বোচ্চ ₹{remaining})
                </p>
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    type="number"
                    placeholder={`₹${remaining}`}
                    value={paymentInputs[txn.id] ?? ""}
                    onChange={(e) =>
                      setPaymentInputs((prev) => ({ ...prev, [txn.id]: e.target.value }))
                    }
                    style={{ flex: 1, padding: 6 }}
                  />
                  <button
                    onClick={() => markAsPaid(txn)}
                    style={{
                      padding: "6px 10px",
                      background: "#333",
                      color: "white",
                      border: "1px solid #666",
                    }}
                  >
                    💰 নিশ্চিত করুন
                  </button>
                </div>
              </div>
            )}

            {txn.status === "awaiting_pin_confirmation" && (
              <>
                <p style={{ fontSize: 12, color: "orange", marginTop: 8 }}>
                  এই কিস্তি: ₹{txn.pendingPaymentAmount} | PIN: {txn.securityPIN} (কাস্টমারকে দিন)
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