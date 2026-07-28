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

export default function CustomerLedgerPage() {
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
      alert("সঠিক পরিমাণ লিখুন।");
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
      setSuccessMsg("✅ রিমাইন্ডার পাঠানো হয়েছে।");
      setRequestAmount("");
      setRequestNote("");
      setShowRequestForm(false);
    } catch (err) {
      console.error(err);
      alert("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
    setSubmitting(false);
  };

  const statusMap = {
    pending_approval: { color: "#999", label: "⏳ অপেক্ষমান" },
    approved: { color: "green", label: "🟢 Approved" },
    rejected: { color: "red", label: "🔴 Rejected" },
    awaiting_pin_confirmation: { color: "orange", label: "🔑 PIN অপেক্ষমান" },
    paid: { color: "blue", label: "✅ সম্পূর্ণ পরিশোধিত" },
  };

  if (loading) return <p style={{ padding: 20 }}>লোড হচ্ছে...</p>;

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
        ← ড্যাশবোর্ডে ফিরুন
      </a>
      <h2 style={{ marginTop: 10 }}>👤 {customerInfo?.name || customerInfo?.phone || "কাস্টমার"}</h2>
      <p style={{ fontSize: 13, color: "#999" }}>ফোন: {customerInfo?.phone}</p>
      <p style={{ fontSize: 13, color: "#999" }}>ট্রাস্ট স্কোর: {customerInfo?.trustScore ?? 50}/100</p>

      <div style={{ display: "flex", gap: 10, margin: "16px 0" }}>
        <div style={{ background: "#1a1a1a", padding: 12, flex: 1, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>বাকি</p>
          <p style={{ margin: 0, fontSize: 20, fontWeight: "bold", color: "orange" }}>
            ₹{totalOutstanding}
          </p>
        </div>
        <div style={{ background: "#1a1a1a", padding: 12, flex: 1, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 11, color: "#999" }}>পরিশোধিত</p>
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
          📢 পেমেন্ট রিমাইন্ডার পাঠান
        </button>
      )}

      {showRequestForm && (
        <form onSubmit={handleSendRequest} style={{ background: "#1a1a1a", padding: 12, marginBottom: 16 }}>
          <input
            type="number"
            placeholder={`কত টাকা চাইছেন (সর্বোচ্চ বাকি ₹${totalOutstanding})`}
            value={requestAmount}
            onChange={(e) => setRequestAmount(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
          />
          <input
            type="text"
            placeholder="নোট (ঐচ্ছিক)"
            value={requestNote}
            onChange={(e) => setRequestNote(e.target.value)}
            style={{ display: "block", width: "100%", marginBottom: 8, padding: 8, boxSizing: "border-box" }}
          />
          <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
            {submitting ? "পাঠানো হচ্ছে..." : "রিমাইন্ডার পাঠান"}
          </button>
        </form>
      )}

      {successMsg && <p style={{ color: "#4ade80" }}>{successMsg}</p>}

      {customerInfo?.phone && pendingRequests.length > 0 && (
        <a
          href={buildWhatsAppLink(
            customerInfo.phone,
            `আপনার ₹${totalOutstanding} বাকি আছে। অনুগ্রহ করে ₹${pendingRequests[0].amount} পরিশোধ করুন।`
          )}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "block", textAlign: "center", padding: 10, background: "#25D366", color: "white", marginBottom: 16, textDecoration: "none" }}
        >
          📱 WhatsApp এ জানিয়ে দিন
        </a>
      )}

      {pendingRequests.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15 }}>📋 পেন্ডিং রিকোয়েস্ট</h3>
          {pendingRequests.map((r) => (
            <div key={r.id} style={{ background: "#1a1a1a", padding: 10, marginBottom: 6, fontSize: 13 }}>
              {r.initiatedBy === "shopkeeper" ? "আপনি চেয়েছেন" : "কাস্টমার বলেছেন"}: ₹{r.amount}
              {r.note && ` — ${r.note}`}
            </div>
          ))}
        </div>
      )}

      <h3>📅 লেনদেনের ইতিহাস (তারিখ অনুযায়ী)</h3>
      {transactions.length === 0 && <p style={{ color: "#999" }}>কোনো লেনদেন নেই।</p>}
      {transactions.map((txn) => {
        const s = statusMap[txn.status] || statusMap.pending_approval;
        return (
          <div
            key={txn.id}
            style={{ borderLeft: `6px solid ${s.color}`, padding: 12, marginBottom: 10, background: "#1a1a1a" }}
          >
            <p style={{ margin: 0, fontSize: 12, color: "#999" }}>
              {txn.createdAt?.toDate
                ? txn.createdAt.toDate().toLocaleString("bn-BD", {
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
                পরিশোধিত: ₹{txn.amountPaid} | বাকি: ₹{(txn.amount || 0) - (txn.amountPaid || 0)}
              </p>
            )}
            <strong style={{ color: s.color }}>{s.label}</strong>

            {/* ---- নতুন: কাস্টমার নিজে PIN জেনারেট করলে, দোকানদারকে সরাসরি confirm করার লিংক দেখানো ---- */}
            {txn.status === "awaiting_pin_confirmation" && txn.initiatedBy === "customer" && (
              <div style={{ marginTop: 8, background: "#2a2a00", padding: 8, borderRadius: 4 }}>
                <p style={{ fontSize: 13, color: "#fbbf24", fontWeight: "bold", margin: 0 }}>
                  💸 কাস্টমার ₹{txn.pendingPaymentAmount} দিতে চেয়েছেন
                </p>
                <p style={{ fontSize: 12, color: "#999", margin: "4px 0" }}>
                  টাকা হাতে পেলে কাস্টমারের কাছ থেকে PIN নিয়ে এখানে ক্লিক করে নিশ্চিত করুন।
                </p>
                <a
                  href={`/confirm-payment/${txn.id}`}
                  style={{ display: "inline-block", padding: "6px 10px", background: "#2563eb", color: "white", textDecoration: "none", fontSize: 13 }}
                >
                  🔑 PIN দিয়ে নিশ্চিত করুন
                </a>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}