"use client";
import { useEffect, useState, useMemo } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  onSnapshot,
  getDoc,
  getDocs,
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
import { isOverdue, getOverdueDays, checkAndApplyOverduePenalty } from "@/lib/overdue";
import { useLanguage } from "@/lib/LanguageContext";
import { translateShopType } from "@/lib/translations";

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

// ---- বদলানো হয়েছে: এখন lang প্যারামিটার নিয়ে দুই ভাষাতেই সঠিক এরর মেসেজ দেয় ----
const ERROR_MESSAGES = {
  bn: {
    default: "একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।",
    network: "📶 ইন্টারনেট সংযোগে সমস্যা মনে হচ্ছে — সংযোগ চেক করে আবার চেষ্টা করুন।",
    permission: "🔒 এই কাজটি করার অনুমতি নেই — অ্যাকাউন্টে সমস্যা থাকলে লগ আউট করে আবার লগইন করুন।",
    generic: "একটা সমস্যা হয়েছে, একটু পর আবার চেষ্টা করুন।",
  },
  en: {
    default: "Something went wrong, please try again.",
    network: "📶 There seems to be a connection issue — check your internet and try again.",
    permission: "🔒 You don't have permission for this action — if there's an account issue, log out and log back in.",
    generic: "Something went wrong, please try again in a moment.",
  },
};

function getFriendlyErrorMessage(err, lang = "bn") {
  const messages = ERROR_MESSAGES[lang] || ERROR_MESSAGES.bn;
  if (!err) return messages.default;
  const msg = (err.message || "").toLowerCase();
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("offline")) {
    return messages.network;
  }
  if (msg.includes("permission")) {
    return messages.permission;
  }
  return messages.generic;
}

export default function DashboardPage() {
  const { t, lang } = useLanguage();
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
  // ---- নতুন: এই কাস্টমার কত দিনের মধ্যে মেটাবেন, দোকানদার নিজে ঠিক করবেন ----
  const [dueDays, setDueDays] = useState("30");
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [creditRequestError, setCreditRequestError] = useState("");
  const [lastLink, setLastLink] = useState(null);
  const [linkCopied, setLinkCopied] = useState(false);

  // ---- নতুন: কাস্টমারের পাঠানো "মোট বাকি মেটান" রিকোয়েস্টের জন্য state ----
  const [settlementRequests, setSettlementRequests] = useState([]);
  const [settleAccepting, setSettleAccepting] = useState({});
  // ---- নতুন: PIN এখন সার্ভার থেকে আসে, তাই একবার দেখানোর জন্য লোকাল state এ রাখা হয় ----
  // ---- (রিফ্রেশ করলে এই PIN আর দেখা যাবে না, কারণ hash করে রাখা হয় — তখন নতুন PIN তৈরি করতে হবে) ----
  const [settlementPins, setSettlementPins] = useState({});
  const [txnPins, setTxnPins] = useState({});
  const [lastPhone, setLastPhone] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const [customerScore, setCustomerScore] = useState(null);
  const [customerFlagged, setCustomerFlagged] = useState(false);
  const [customerVerified, setCustomerVerified] = useState(false);
  const [checkingScore, setCheckingScore] = useState(false);
  const [verifiedByMe, setVerifiedByMe] = useState(false);
  // ---- নতুন: এই কাস্টমারের অন্য/এই দোকানে কতগুলো মেয়াদ পার হওয়া (overdue) বাকি আছে ----
  const [customerOverdueCount, setCustomerOverdueCount] = useState(0);
  // ---- নতুন: এই ফোন নম্বরে সত্যিই কোনো নিবন্ধিত কাস্টমার আছে কিনা ----
  const [isRegisteredCustomer, setIsRegisteredCustomer] = useState(null);
  // ---- নতুন: Admin এই কাস্টমারকে ব্লক করে রেখেছেন কিনা ----
  const [isCustomerBlocked, setIsCustomerBlocked] = useState(false);

  // ---- নতুন: সংশোধনের অনুরোধ (Edit Request) এর জন্য state ----
  const [editRequests, setEditRequests] = useState([]);
  const [editFormOpenFor, setEditFormOpenFor] = useState(null);
  const [editAmountInput, setEditAmountInput] = useState("");
  const [editDetailsInput, setEditDetailsInput] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // ---- নতুন: প্রতিটা transaction এর জন্য আলাদাভাবে পেমেন্ট ইনপুট রাখার state ----
  const [paymentInputs, setPaymentInputs] = useState({});
  const [markingPaid, setMarkingPaid] = useState({});
  // ---- নতুন: প্রথমে শুধু সাম্প্রতিক লেনদেন দেখানো, দ্রুত লোড হওয়ার জন্য ----
  const [showAllTxns, setShowAllTxns] = useState(false);

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

  // ---- নতুন: কাস্টমারদের পাঠানো "মোট বাকি মেটান" রিকোয়েস্ট শোনা ----
  useEffect(() => {
    if (!uid) return;
    const settleQ = query(collection(db, "settlementRequests"), where("shopId", "==", uid));
    const unsub = onSnapshot(settleQ, (snapshot) => {
      setSettlementRequests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [uid]);

  // ---- নতুন: নিজের পাঠানো সংশোধনের অনুরোধ (Edit Request) শোনা ----
  useEffect(() => {
    if (!uid) return;
    const editQ = query(collection(db, "editRequests"), where("shopId", "==", uid));
    const unsub = onSnapshot(editQ, (snapshot) => {
      setEditRequests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [uid]);

  // ---- নতুন: dashboard লোড হওয়ার সময় মেয়াদ পার হওয়া এন্ট্রিগুলোর জন্য score penalty চেক করা ----
  useEffect(() => {
    transactions
      .filter((t) => t.status === "approved" && isOverdue(t))
      .forEach((t) => {
        checkAndApplyOverduePenalty(t).catch(() => {});
      });
  }, [transactions]);

  useEffect(() => {
    const digits = normalizePhone(phone);
    if (digits.length < 10) {
      setCustomerScore(null);
      setCustomerFlagged(false);
      setCustomerVerified(false);
      setCustomerOverdueCount(0);
      setIsRegisteredCustomer(null);
      setIsCustomerBlocked(false);
      return;
    }
    setCheckingScore(true);
    const timer = setTimeout(async () => {
      try {
        const snap = await getDoc(doc(db, "customers", digits));
        if (snap.exists()) {
          // ---- বদলানো হয়েছে: শুধু প্রকৃত নিবন্ধিত কাস্টমারদের স্কোর দেখানো হবে ----
          setIsRegisteredCustomer(true);
          setCustomerScore(snap.data().trustScore ?? 50);
          setCustomerFlagged(snap.data().isRedFlagged === true);
          setCustomerVerified(snap.data().verifiedByShopkeeper === true);
          // ---- নতুন: Admin ব্লক করেছেন কিনা চেক করা ----
          setIsCustomerBlocked(snap.data().isBlockedByAdmin === true);
        } else {
          // ---- বদলানো হয়েছে: নিবন্ধিত না হলে ডিফল্ট স্কোর দেখানো হবে না ----
          setIsRegisteredCustomer(false);
          setCustomerScore(null);
          setCustomerFlagged(false);
          setCustomerVerified(false);
          setIsCustomerBlocked(false);
        }

        // ---- নতুন: এই কাস্টমারের (যেকোনো দোকানের) মেয়াদ পার হওয়া বাকি আছে কিনা চেক করা ----
        const overdueQ = query(
          collection(db, "transactions"),
          where("customerId", "==", digits),
          where("status", "==", "approved")
        );
        const overdueSnap = await getDocs(overdueQ);
        const overdueTxns = overdueSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((t) => isOverdue(t));
        setCustomerOverdueCount(overdueTxns.length);
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
    // ---- নতুন: নিরাপত্তা যাচাই — ব্লক করা কাস্টমারকে কোনোভাবেই রিকোয়েস্ট পাঠানো যাবে না ----
    if (isCustomerBlocked) {
      alert(t("blockedCustomerAlert"));
      return;
    }
    setSubmitting(true);
    setSuccessMsg("");
    setCreditRequestError("");
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
          dueDays: Number(dueDays) || 30, // ---- নতুন: কতদিনের মধ্যে মেটাতে হবে (দোকানদার নির্ধারিত) ----
          overduePenaltiesApplied: 0, // ---- নতুন: এখন পর্যন্ত কতবার overdue penalty দেওয়া হয়েছে ----
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
      setDueDays("30");
      setCustomerScore(null);
      setCustomerFlagged(false);
      setCustomerVerified(false);
      setCustomerOverdueCount(0);
      setIsRegisteredCustomer(null);
      setIsCustomerBlocked(false);
      setVerifiedByMe(false);
    } catch (err) {
      console.error(err);
      // ---- বাগ ফিক্স: আগে এরর শুধু console এ লগ হতো, ইউজার কিছুই দেখতে পেতেন না ----
      setCreditRequestError(getFriendlyErrorMessage(err, lang));
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

  // ---- নতুন: কাস্টমারের "মোট বাকি মেটান" রিকোয়েস্ট accept করে PIN জেনারেট করা ----
  // ---- নতুন: কোনো এন্ট্রি ভুল হলে, সংশোধনের অনুরোধ পাঠানো — কাস্টমারের অনুমোদন লাগবে ----
  const handleSendEditRequest = async (txn) => {
    setEditError("");
    const newAmount = Number(editAmountInput);

    if (!editAmountInput || isNaN(newAmount) || newAmount <= 0) {
      setEditError("সঠিক পরিমাণ লিখুন।");
      return;
    }
    const alreadyPaid = txn.amountPaid || 0;
    if (newAmount < alreadyPaid) {
      setEditError(`নতুন পরিমাণ ₹${alreadyPaid} (ইতিমধ্যে পরিশোধিত) এর কম হতে পারবে না।`);
      return;
    }

    setEditSubmitting(true);
    try {
      await setDoc(doc(collection(db, "editRequests")), {
        shopId: uid,
        shopName: shopData.shopName,
        transactionId: txn.id,
        customerId: txn.customerId,
        customerPhone: txn.customerPhone,
        oldAmount: txn.amount,
        newAmount,
        oldItemDetails: txn.itemDetails || null,
        newItemDetails: editDetailsInput || null,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setEditFormOpenFor(null);
      setEditAmountInput("");
      setEditDetailsInput("");
    } catch (err) {
      console.error(err);
      setEditError("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
    setEditSubmitting(false);
  };

  // ---- বদলানো হয়েছে: PIN এখন ব্রাউজারে না, সার্ভারে (API route) তৈরি হয় ----
  const acceptSettlement = async (req) => {
    setSettleAccepting((prev) => ({ ...prev, [req.id]: true }));
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/generate-settlement-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, requestId: req.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "সমস্যা হয়েছে, আবার চেষ্টা করুন।");
      } else {
        setSettlementPins((prev) => ({ ...prev, [req.id]: data.pin }));
      }
    } catch (err) {
      console.error(err);
      alert(getFriendlyErrorMessage(err, lang));
    }
    setSettleAccepting((prev) => ({ ...prev, [req.id]: false }));
  };

  // ---- বদলানো হয়েছে: PIN এখন ব্রাউজারে না, সার্ভারে (API route) তৈরি হয় ----
  // ---- overrideAmount: PIN রিজেনারেট করার সময় আগের নির্দিষ্ট কিস্তির পরিমাণ ব্যবহার করার জন্য ----
  const markAsPaid = async (txn, overrideAmount) => {
    const remaining = txn.amount - (txn.amountPaid || 0);
    const enteredRaw = paymentInputs[txn.id];
    const entered = overrideAmount ?? (enteredRaw ? Number(enteredRaw) : remaining);

    if (!entered || entered <= 0) {
      alert(t("enterValidAmount"));
      return;
    }
    if (entered > remaining) {
      alert(`সর্বোচ্চ ₹${remaining} নেওয়া যাবে (এর বেশি বাকি নেই)।`);
      return;
    }

    setMarkingPaid((prev) => ({ ...prev, [txn.id]: true }));
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/generate-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, txnId: txn.id, paymentAmount: entered }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "সমস্যা হয়েছে, আবার চেষ্টা করুন।");
      } else {
        setTxnPins((prev) => ({ ...prev, [txn.id]: data.pin }));
      }
    } catch (err) {
      console.error(err);
      alert(getFriendlyErrorMessage(err, lang));
    }
    setMarkingPaid((prev) => ({ ...prev, [txn.id]: false }));
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

  // ---- বাগ ফিক্স: এই hook গুলো আগে "if (loading) return" এর পরে ছিল, যেটা React এর নিয়ম ভঙ্গ করছিল
  // (hook conditional return এর পরে কল হচ্ছিল) এবং "Minified React error #310" দিচ্ছিল — এখন সব early return এর আগে আনা হলো ----

  // ---- Firestore Timestamp ও ISO string দুটোই handle করার জন্য helper ----
  const toMillis = (t) => {
    if (!t) return 0;
    if (t.toDate) return t.toDate().getTime();
    if (typeof t === "string") return new Date(t).getTime();
    return 0;
  };

  const isToday = (millis) => {
    if (!millis) return false;
    const d = new Date(millis);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };

  // ---- সাম্প্রতিক/নিয়মিত কাস্টমার — কতবার লেনদেন হয়েছে তার ভিত্তিতে সাজানো ----
  const recentCustomers = useMemo(() => {
    const freq = {};
    transactions.forEach((t) => {
      if (!t.customerPhone) return;
      if (!freq[t.customerPhone]) {
        freq[t.customerPhone] = { phone: t.customerPhone, count: 0, lastAt: 0 };
      }
      freq[t.customerPhone].count += 1;
      freq[t.customerPhone].lastAt = Math.max(freq[t.customerPhone].lastAt, toMillis(t.createdAt));
    });
    return Object.values(freq)
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
      .slice(0, 6);
  }, [transactions]);

  // ---- আজকের সারসংক্ষেপ ----
  const dailySummary = useMemo(() => {
    let newCreditsToday = 0;
    let paidToday = 0;
    const customersToday = new Set();

    transactions.forEach((t) => {
      if (isToday(toMillis(t.createdAt))) {
        newCreditsToday += t.amount || 0;
        customersToday.add(t.customerPhone);
      }
      if (isToday(toMillis(t.paidAt))) {
        customersToday.add(t.customerPhone);
      }
      (t.payments || []).forEach((p) => {
        if (isToday(toMillis(p.paidAt))) {
          paidToday += p.amount || 0;
          customersToday.add(t.customerPhone);
        }
      });
    });

    return { newCreditsToday, paidToday, customerCount: customersToday.size };
  }, [transactions]);

  // ---- সাম্প্রতিক Activity ফিড — কী কী ঘটেছে তার সংক্ষিপ্ত তালিকা ----
  const activityFeed = useMemo(() => {
    const events = [];
    transactions.forEach((t) => {
      if (t.createdAt) {
        events.push({
          time: toMillis(t.createdAt),
          icon: "🆕",
          text: `${t.customerPhone} নতুন ₹${t.amount} বাকি নিয়েছেন`,
        });
      }
      if (t.approvedAt) {
        events.push({
          time: toMillis(t.approvedAt),
          icon: "✅",
          text: `${t.customerPhone} ₹${t.amount} অ্যাপ্রুভ করেছেন`,
        });
      }
      if (t.paidAt) {
        events.push({
          time: toMillis(t.paidAt),
          icon: "💰",
          text: `${t.customerPhone} সম্পূর্ণ ₹${t.amount} পরিশোধ করেছেন`,
        });
      }
      (t.payments || []).forEach((p) => {
        events.push({
          time: toMillis(p.paidAt),
          icon: "💵",
          text: `${t.customerPhone} ₹${p.amount} পরিশোধ করেছেন`,
        });
      });
    });
    return events.sort((a, b) => b.time - a.time).slice(0, 8);
  }, [transactions]);

  // ---- নতুন: লোডিং এর সময় ফাঁকা "skeleton" আকৃতি দেখানো, সাধারণ লেখার বদলে — এতে অ্যাপ দ্রুত মনে হয় ----
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

  if (shopData?.status === "pending_review") {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
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

  {/* ---- নতুন: সাসপেন্ড করা হলে dashboard ব্যবহার করতে দেওয়া হবে না ---- */}
  if (shopData?.status === "suspended") {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h2>{shopData.shopName}</h2>
          <button
            onClick={handleLogout}
            style={{ padding: 8, background: "#333", color: "white", border: "1px solid #666", height: 36 }}
          >
            🚪 লগ আউট
          </button>
        </div>
        <p style={{ color: "red", fontWeight: "bold" }}>
          ⛔ আপনার একাউন্ট Admin দ্বারা সাসপেন্ড করা হয়েছে। বিস্তারিত জানতে যোগাযোগ করুন।
        </p>
      </div>
    );
  }

  {/* ---- নতুন: Reject করা হলেও dashboard ব্যবহার করতে দেওয়া হবে না ---- */}
  if (shopData?.status === "rejected") {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <h2>{shopData.shopName}</h2>
          <button
            onClick={handleLogout}
            style={{ padding: 8, background: "#333", color: "white", border: "1px solid #666", height: 36 }}
          >
            🚪 লগ আউট
          </button>
        </div>
        <p style={{ color: "red", fontWeight: "bold" }}>
          ⛔ দুঃখিত, আপনার আবেদনটি Admin গ্রহণ করেননি।
        </p>
      </div>
    );
  }

  const statusMap = {
    pending_approval: { color: "#999", label: `⏳ ${t("statusPending")}` },
    approved: { color: "green", label: `🟢 ${t("statusApproved")}` },
    rejected: { color: "red", label: `🔴 ${t("statusRejected")}` },
    awaiting_pin_confirmation: { color: "orange", label: `🔑 ${t("statusAwaitingPin")}` },
    paid: { color: "blue", label: `✅ ${t("statusPaid")}` },
  };

  return (
    <div style={{ padding: 16, maxWidth: 480, margin: "auto" }}>
      {/* ---- বাগ ফিক্স: লম্বা দোকানের নাম বাটনের সাথে ওভারল্যাপ করছিল, এখন ঠিক করা হলো ---- */}
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            flex: "1 1 auto",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {shopData.shopName}
        </h2>
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
      <p style={{ fontSize: 13, color: "#999", margin: "6px 0 0 0" }}>✅ {t("statusLabel")}: {shopData.status}</p>

      {/* ---- নতুন: আজকের সারসংক্ষেপ ---- */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginTop: 14,
          background: "#1a1a1a",
          padding: 12,
          borderRadius: 8,
        }}
      >
        <div style={{ flex: "1 1 28%", minWidth: 90, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>{t("newCreditToday")}</p>
          <p style={{ margin: "2px 0 0 0", fontSize: 17, fontWeight: "bold", color: "orange" }}>
            ₹{dailySummary.newCreditsToday}
          </p>
        </div>
        <div style={{ flex: "1 1 28%", minWidth: 90, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>{t("paidToday")}</p>
          <p style={{ margin: "2px 0 0 0", fontSize: 17, fontWeight: "bold", color: "#4ade80" }}>
            ₹{dailySummary.paidToday}
          </p>
        </div>
        <div style={{ flex: "1 1 28%", minWidth: 90, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>{t("customersToday")}</p>
          <p style={{ margin: "2px 0 0 0", fontSize: 17, fontWeight: "bold" }}>{dailySummary.customerCount}</p>
        </div>
      </div>

      {/* ---- নতুন: সাম্প্রতিক Activity ফিড ---- */}
      {activityFeed.length > 0 && (
        <div style={{ marginTop: 14 }}>
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

      {/* ---- নতুন: সেটিংস প্যানেল (পাসওয়ার্ড বদলানো) ---- */}
      {showSettings && (
        <div style={{ background: "#1a1a1a", padding: 15, marginBottom: 20, borderRadius: 6 }}>
          <h3 style={{ marginTop: 0 }}>✏️ {t("editShopInfo")}</h3>
          <form onSubmit={handleUpdateShopProfile}>
            <input
              type="text"
              placeholder={t("shopNamePlaceholder")}
              value={editShopName}
              onChange={(e) => setEditShopName(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="text"
              placeholder={t("ownerNamePlaceholder")}
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
                  {translateShopType(type, lang)}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder={t("yearsInBusinessPlaceholder")}
              value={editYearsInBusiness}
              onChange={(e) => setEditYearsInBusiness(e.target.value)}
              min="0"
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="text"
              placeholder={t("streetPlaceholder")}
              value={editStreet}
              onChange={(e) => setEditStreet(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="text"
              placeholder={t("cityPlaceholder")}
              value={editCity}
              onChange={(e) => setEditCity(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="text"
              placeholder={t("statePlaceholder")}
              value={editState}
              onChange={(e) => setEditState(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
            />
            <input
              type="text"
              placeholder={t("pincodePlaceholder")}
              value={editPincode}
              onChange={(e) => setEditPincode(e.target.value)}
              style={{ display: "block", width: "100%", marginBottom: 10, padding: 8, boxSizing: "border-box" }}
            />
            <button type="submit" disabled={profileSubmitting} style={{ width: "100%", padding: 10 }}>
              {profileSubmitting ? t("updating") : t("updateShopInfo")}
            </button>
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
        </div>
      )}

      <h3 style={{ marginTop: 20 }}>{t("newCreditRequest")}</h3>

      {/* ---- নতুন: নিয়মিত/সাম্প্রতিক কাস্টমার শর্টকাট — এক ক্লিকে ফোন নম্বর বসিয়ে দেবে ---- */}
      {recentCustomers.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <p style={{ fontSize: 12, color: "#999", margin: "0 0 6px 0" }}>{t("quickSelect")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {recentCustomers.map((c) => (
              <button
                key={c.phone}
                type="button"
                onClick={() => setPhone(c.phone)}
                style={{
                  padding: "6px 10px",
                  background: phone === c.phone ? "#1e3a8a" : "#333",
                  color: "white",
                  border: "1px solid #555",
                  borderRadius: 20,
                  fontSize: 12,
                }}
              >
                👤 {c.phone}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleCreditRequest}>
        <input
          type="tel"
          placeholder={t("customerPhonePlaceholder")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />

        {checkingScore && <p style={{ fontSize: 12, color: "#999" }}>{t("checkingScore")}</p>}

        {/* ---- নতুন: এই নম্বরে কোনো নিবন্ধিত কাস্টমার না থাকলে জানিয়ে দেওয়া ---- */}
        {!checkingScore && isRegisteredCustomer === false && (
          <p style={{ fontSize: 13, color: "#999", marginBottom: 10 }}>
            ℹ️ {t("notRegisteredCustomer")}
          </p>
        )}

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
              {getScoreTier(customerScore).label} — {t("score")}: {customerScore}/100
              {customerVerified && (
                <span style={{ color: "#3b82f6", marginLeft: 6 }}>✅ {t("shopVerified")}</span>
              )}
            </p>
            {customerFlagged && (
              <p style={{ fontSize: 13, margin: 0, color: "red", fontWeight: "bold" }}>
                ⚠️ {t("redFlagWarning")}
              </p>
            )}
            {/* ---- নতুন: এই কাস্টমারের মেয়াদ পার হওয়া (overdue) বাকি থাকলে সতর্কতা ---- */}
            {customerOverdueCount > 0 && (
              <p style={{ fontSize: 13, margin: "4px 0 0 0", color: "#f97316", fontWeight: "bold" }}>
                ⚠️ {t("overdueWarningPrefix")} {customerOverdueCount} {t("overdueWarningSuffix")}
              </p>
            )}
            {/* ---- নতুন: Admin এই কাস্টমারকে ব্লক করে রাখলে সতর্কতা ---- */}
            {isCustomerBlocked && (
              <p style={{ fontSize: 13, margin: "4px 0 0 0", color: "red", fontWeight: "bold" }}>
                🚫 {t("customerBlockedWarning")}
              </p>
            )}
          </div>
        )}

        <input
          type="number"
          placeholder={t("amountPlaceholder")}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 4, padding: 8 }}
        />
        {/* ---- নতুন: টাইপ করার সাথে সাথেই ভুল পরিমাণ ধরিয়ে দেওয়া, সাবমিট করার আগেই ---- */}
        {amount !== "" && (Number(amount) <= 0 || isNaN(Number(amount))) && (
          <p style={{ color: "#f97316", fontSize: 12, margin: "0 0 10px 0" }}>
            ⚠️ {t("invalidAmountWarning")}
          </p>
        )}
        {amount === "" && <div style={{ marginBottom: 10 }} />}
        {/* ---- নতুন: কতদিনের মধ্যে মেটাতে হবে, দোকানদার নিজে ঠিক করবেন ---- */}
        <label style={{ fontSize: 13, color: "#999", display: "block", marginBottom: 4 }}>
          {t("dueDaysLabel")}
        </label>
        <input
          type="number"
          placeholder={t("dueDaysPlaceholder")}
          value={dueDays}
          onChange={(e) => setDueDays(e.target.value)}
          min="1"
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <textarea
          placeholder={t("itemDetailsPlaceholder")}
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
            {t("iKnowThisPerson")}
          </label>
        )}

        <button
          type="submit"
          disabled={submitting || isCustomerBlocked || !amount || Number(amount) <= 0}
          style={{ width: "100%", padding: 10 }}
        >
          {isCustomerBlocked ? `🚫 ${t("cannotSendToBlocked")}` : submitting ? `⏳ ${t("sending")}` : t("sendRequest")}
        </button>
        {/* ---- বাগ ফিক্স: আগে এরর দেখানোই হতো না, এখন স্পষ্টভাবে দেখানো হচ্ছে ---- */}
        {creditRequestError && (
          <p style={{ color: "red", fontSize: 13, marginTop: 8 }}>{creditRequestError}</p>
        )}
      </form>

      {successMsg && <p style={{ color: "green" }}>{successMsg}</p>}

      {lastLink && (
        <>
          <a
            href={buildWhatsAppLink(
              lastPhone,
              `${t("whatsappCreditMessage")} ${lastLink}`
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
            📱 {t("sendViaWhatsapp")}
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
            {linkCopied ? `✅ ${t("copied")}` : `🔗 ${t("copyLinkNoWhatsapp")}`}
          </button>
          <p style={{ fontSize: 12, color: "#999", marginTop: 4 }}>
            {t("customerCanSeeRequestNote")}
          </p>
        </>
      )}

      {/* ---- নতুন: কাস্টমারদের পাঠানো "মোট বাকি মেটান" রিকোয়েস্ট ---- */}
      {settlementRequests.filter((r) => r.status === "pending" || r.status === "awaiting_pin").length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>💰 {t("settlementRequestsTitle")}</h3>
          {settlementRequests
            .filter((r) => r.status === "pending" || r.status === "awaiting_pin")
            .map((req) => (
              <div key={req.id} style={{ background: "#1a1a1a", padding: 12, marginBottom: 8, borderRadius: 6 }}>
                <p style={{ margin: 0 }}>
                  👤 {req.customerPhone} — <span style={{ fontWeight: "bold" }}>₹{req.amount}</span> {t("wantsToSettle")}
                </p>
                {req.status === "pending" && (
                  <button
                    onClick={() => acceptSettlement(req)}
                    disabled={settleAccepting[req.id]}
                    style={{ width: "100%", padding: 8, marginTop: 8, background: "#16a34a", color: "white", border: "none" }}
                  >
                    {settleAccepting[req.id] ? "..." : `✅ ${t("approveGeneratePin")}`}
                  </button>
                )}
                {req.status === "awaiting_pin" && (
                  settlementPins[req.id] ? (
                    <p style={{ margin: "8px 0 0 0", fontSize: 14, color: "#fbbf24" }}>
                      🔑 PIN: <strong>{settlementPins[req.id]}</strong> — {t("tellCustomerPin")}
                    </p>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <p style={{ margin: 0, fontSize: 12, color: "#999" }}>
                        {t("pinNotVisibleRefresh")}
                      </p>
                      <button
                        onClick={() => acceptSettlement(req)}
                        disabled={settleAccepting[req.id]}
                        style={{ width: "100%", padding: 8, marginTop: 4, background: "#333", color: "white", border: "1px solid #666" }}
                      >
                        {settleAccepting[req.id] ? "..." : `🔄 ${t("generateNewPin")}`}
                      </button>
                    </div>
                  )
                )}
              </div>
            ))}
        </div>
      )}

      <h3 style={{ marginTop: 30 }}>👤 {t("customerWiseAccount")}</h3>
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
        if (list.length === 0) return <p style={{ color: "#999" }}>{t("noCustomersYet")}</p>;
        return list.map((c) => (
          <div
            key={c.customerId}
            onClick={() => (window.location.href = `/customer-ledger/${c.customerId}`)}
            style={{ background: "#1a1a1a", padding: 12, marginBottom: 8, cursor: "pointer", borderRadius: 6 }}
          >
            <p style={{ margin: 0, fontWeight: "bold" }}>
              👤 {c.customerPhone} <span style={{ fontSize: 11, color: "#3b82f6" }}>{t("viewDetails")} →</span>
            </p>
            <p style={{ margin: 0, fontSize: 13 }}>
              {t("outstandingLabel")}: <span style={{ color: c.outstanding > 0 ? "orange" : "#999" }}>₹{c.outstanding}</span>
              {"  |  "}{t("paidLabel")}: <span style={{ color: "green" }}>₹{c.paid}</span>
            </p>
          </div>
        ));
      })()}

      <h3 style={{ marginTop: 30 }}>{t("recentRequestsTitle")}</h3>
      {transactions.length === 0 && (
        <p style={{ color: "#999" }}>
          {t("noRequestsYet")}
        </p>
      )}
      {(showAllTxns ? transactions : transactions.slice(0, 30)).map((txn) => {
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
              borderRadius: 6,
              wordBreak: "break-word",
            }}
          >
            <p style={{ margin: 0 }}>
              👤 {txn.customerPhone}
              {txn.verifiedByShopkeeper && (
                <span style={{ color: "#3b82f6", fontSize: 11, marginLeft: 6 }}>✅ {t("verified")}</span>
              )}
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
            {/* ---- নতুন: মেয়াদ পার হয়ে গেলে সতর্কতা দেখানো ---- */}
            {isOverdue(txn) && (
              <p style={{ margin: "2px 0", fontSize: 12, color: "#f97316", fontWeight: "bold" }}>
                ⚠️ {t("overdueBy")} ({getOverdueDays(txn)} {t("days")})
              </p>
            )}

            {/* ---- নতুন: আংশিক পরিশোধের অগ্রগতি দেখানো ---- */}
            {amountPaid > 0 && txn.status !== "paid" && (
              <p style={{ margin: 0, fontSize: 12, color: "#4ade80" }}>
                {t("paidSoFar")}: ₹{amountPaid} | {t("remainingLabel")}: ₹{remaining}
              </p>
            )}

            <strong style={{ color: s.color }}>{s.label}</strong>

            {/* ---- নতুন: সংশোধনের অনুরোধ (Edit Request) — শুধু "approved" এন্ট্রির জন্য ---- */}
            {txn.status === "approved" && (() => {
              const pendingEdit = editRequests.find(
                (r) => r.transactionId === txn.id && r.status === "pending"
              );
              if (pendingEdit) {
                return (
                  <p style={{ margin: "6px 0 0 0", fontSize: 12, color: "#fbbf24" }}>
                    ✏️ {t("editRequestPending")} (₹{pendingEdit.oldAmount} → ₹{pendingEdit.newAmount}) {t("waitingCustomerApproval")}
                  </p>
                );
              }
              if (editFormOpenFor === txn.id) {
                return (
                  <div style={{ marginTop: 8, background: "#0d0d0d", padding: 10, borderRadius: 6 }}>
                    <input
                      type="number"
                      placeholder={`${t("newAmountPlaceholder")} (${t("currentAmountLabel")} ₹${txn.amount})`}
                      value={editAmountInput}
                      onChange={(e) => setEditAmountInput(e.target.value)}
                      style={{ display: "block", width: "100%", marginBottom: 6, padding: 8, boxSizing: "border-box" }}
                    />
                    <input
                      type="text"
                      placeholder={t("newDetailsPlaceholder")}
                      value={editDetailsInput}
                      onChange={(e) => setEditDetailsInput(e.target.value)}
                      style={{ display: "block", width: "100%", marginBottom: 6, padding: 8, boxSizing: "border-box" }}
                    />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <button
                        onClick={() => handleSendEditRequest(txn)}
                        disabled={editSubmitting}
                        style={{ flex: 1, padding: 8, background: "#1e3a8a", color: "white", border: "none" }}
                      >
                        {editSubmitting ? "..." : t("sendRequestShort")}
                      </button>
                      <button
                        onClick={() => {
                          setEditFormOpenFor(null);
                          setEditError("");
                        }}
                        style={{ padding: "8px 14px", background: "#333", color: "white", border: "1px solid #666" }}
                      >
                        {t("cancel")}
                      </button>
                    </div>
                    {editError && <p style={{ color: "red", fontSize: 12, margin: "4px 0 0 0" }}>{editError}</p>}
                  </div>
                );
              }
              return (
                <button
                  onClick={() => {
                    setEditFormOpenFor(txn.id);
                    setEditAmountInput(String(txn.amount));
                    setEditDetailsInput(txn.itemDetails || "");
                    setEditError("");
                  }}
                  style={{ marginTop: 8, padding: "6px 12px", fontSize: 12, background: "#333", color: "white", border: "1px solid #666" }}
                >
                  ✏️ {t("sendEditRequest")}
                </button>
              );
            })()}

            {txn.status === "pending_approval" && txn.approvalToken && (
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a
                  href={buildWhatsAppLink(
                    txn.customerPhone,
                    `${t("whatsappCreditMessage")} ${
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
                  📱 {t("sendViaWhatsapp")}
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
                  {copiedId === txn.id ? `✅ ${t("copied")}` : `📋 ${t("copyLink")}`}
                </button>
              </div>
            )}

            {/* ---- বদলানো হয়েছে: পুরো "Paid মার্ক করুন" এর বদলে আংশিক টাকা নেওয়ার ইনপুট ---- */}
            {txn.status === "approved" && (
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 12, color: "#999", margin: "0 0 4px 0" }}>
                  {t("howMuchReceivedToday")} ({t("maxLabel")} ₹{remaining})
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                    disabled={
                      markingPaid[txn.id] ||
                      (paymentInputs[txn.id] !== undefined &&
                        paymentInputs[txn.id] !== "" &&
                        (Number(paymentInputs[txn.id]) <= 0 || Number(paymentInputs[txn.id]) > remaining))
                    }
                    style={{
                      padding: "6px 10px",
                      background: "#333",
                      color: "white",
                      border: "1px solid #666",
                    }}
                  >
                    {markingPaid[txn.id] ? "..." : `💰 ${t("confirmButton")}`}
                  </button>
                </div>
                {/* ---- নতুন: টাইপ করার সাথে সাথেই ভুল পরিমাণ ধরিয়ে দেওয়া ---- */}
                {paymentInputs[txn.id] && Number(paymentInputs[txn.id]) > remaining && (
                  <p style={{ color: "#f97316", fontSize: 12, margin: "4px 0 0 0" }}>
                    ⚠️ {t("maxTakeable")} ₹{remaining}
                  </p>
                )}
                {paymentInputs[txn.id] && Number(paymentInputs[txn.id]) <= 0 && (
                  <p style={{ color: "#f97316", fontSize: 12, margin: "4px 0 0 0" }}>
                    ⚠️ {t("enterValidAmount")}
                  </p>
                )}
              </div>
            )}

            {txn.status === "awaiting_pin_confirmation" && (
              <>
                {txnPins[txn.id] ? (
                  <p style={{ fontSize: 12, color: "orange", marginTop: 8 }}>
                    {t("thisInstallment")}: ₹{txn.pendingPaymentAmount} | PIN: {txnPins[txn.id]} ({t("giveToCustomer")})
                  </p>
                ) : (
                  <div style={{ marginTop: 8 }}>
                    <p style={{ margin: 0, fontSize: 12, color: "#999" }}>
                      {t("pinNotVisibleRefresh")}
                    </p>
                    <button
                      onClick={() => markAsPaid(txn, txn.pendingPaymentAmount)}
                      disabled={markingPaid[txn.id]}
                      style={{ padding: 6, marginTop: 4, background: "#333", color: "white", border: "1px solid #666" }}
                    >
                      {markingPaid[txn.id] ? "..." : `🔄 ${t("generateNewPin")}`}
                    </button>
                  </div>
                )}
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
                  {copiedId === txn.id ? `✅ ${t("copied")}` : `📋 ${t("copyLink")}`}
                </button>
              </>
            )}
          </div>
        );
      })}

      {/* ---- নতুন: ৩০টার বেশি রিকোয়েস্ট থাকলে "আরও দেখুন" বাটন ---- */}
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