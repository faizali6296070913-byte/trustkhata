"use client";
import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, onSnapshot, collection, updateDoc, serverTimestamp } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [shopkeepers, setShopkeepers] = useState([]);
  const [customerCount, setCustomerCount] = useState(0);
  const [adminUid, setAdminUid] = useState(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "/login";
        return;
      }
      const userSnap = await getDoc(doc(db, "users", user.uid));
      if (userSnap.exists() && userSnap.data().role === "admin") {
        setIsAdmin(true);
        setAdminUid(user.uid);
      }
      setLoading(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const unsubShops = onSnapshot(collection(db, "shopkeepers"), (snapshot) => {
      const shops = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setShopkeepers(shops);
    });

    const unsubCustomers = onSnapshot(collection(db, "customers"), (snapshot) => {
      setCustomerCount(snapshot.size);
    });

    return () => {
      unsubShops();
      unsubCustomers();
    };
  }, [isAdmin]);

  const handleApprove = async (shopId) => {
    try {
      await updateDoc(doc(db, "shopkeepers", shopId), {
        status: "approved",
        verifiedAt: serverTimestamp(),
        verifiedBy: adminUid,
      });
    } catch (err) {
      console.error(err);
      alert("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
  };

  const handleReject = async (shopId) => {
    try {
      await updateDoc(doc(db, "shopkeepers", shopId), {
        status: "rejected",
        verifiedAt: serverTimestamp(),
        verifiedBy: adminUid,
      });
    } catch (err) {
      console.error(err);
      alert("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
  };

  if (loading) return <p style={{ padding: 20 }}>লোড হচ্ছে...</p>;

  if (!isAdmin) {
    return <p style={{ padding: 20, color: "red" }}>⛔ আপনার এই পেজে প্রবেশের অনুমতি নেই।</p>;
  }

  const pendingShops = shopkeepers.filter((s) => s.status === "pending_review");
  const otherShops = shopkeepers.filter((s) => s.status !== "pending_review");

  const statusLabel = {
    pending_review: { label: "⏳ পেন্ডিং", color: "#999" },
    approved: { label: "✅ Approved", color: "green" },
    rejected: { label: "❌ Rejected", color: "red" },
    suspended: { label: "⛔ Suspended", color: "gray" },
  };

  return (
    <div style={{ padding: 20, maxWidth: 500, margin: "auto" }}>
      <h2>🛠️ Admin Dashboard</h2>

      <div style={{ display: "flex", gap: 20, margin: "20px 0" }}>
        <div style={{ background: "#1a1a1a", padding: 15, flex: 1, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#999" }}>মোট দোকান</p>
          <p style={{ margin: 0, fontSize: 24, fontWeight: "bold" }}>{shopkeepers.length}</p>
        </div>
        <div style={{ background: "#1a1a1a", padding: 15, flex: 1, textAlign: "center" }}>
          <p style={{ margin: 0, fontSize: 12, color: "#999" }}>মোট কাস্টমার</p>
          <p style={{ margin: 0, fontSize: 24, fontWeight: "bold" }}>{customerCount}</p>
        </div>
      </div>

      <h3>⏳ পেন্ডিং অনুমোদন ({pendingShops.length})</h3>
      {pendingShops.length === 0 && <p>কোনো পেন্ডিং দোকান নেই।</p>}
      {pendingShops.map((shop) => (
        <div key={shop.id} style={{ background: "#1a1a1a", padding: 12, marginBottom: 10 }}>
          <p style={{ margin: 0, fontWeight: "bold" }}>{shop.shopName || "(নাম দেওয়া হয়নি)"}</p>
          <p style={{ margin: 0, fontSize: 13, color: "#999" }}>
            মালিক: {shop.ownerName || "—"} | ফোন: {shop.phone}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "#999" }}>ঠিকানা: {shop.shopAddress || "—"}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button
              onClick={() => handleApprove(shop.id)}
              style={{ flex: 1, padding: 8, background: "green", color: "white", border: "none" }}
            >
              ✅ Approve
            </button>
            <button
              onClick={() => handleReject(shop.id)}
              style={{ flex: 1, padding: 8, background: "red", color: "white", border: "none" }}
            >
              ❌ Reject
            </button>
          </div>
        </div>
      ))}

      <h3 style={{ marginTop: 30 }}>সব দোকান</h3>
      {otherShops.map((shop) => {
        const s = statusLabel[shop.status] || statusLabel.pending_review;
        return (
          <div
            key={shop.id}
            style={{
              borderLeft: `4px solid ${s.color}`,
              background: "#1a1a1a",
              padding: 10,
              marginBottom: 8,
            }}
          >
            <p style={{ margin: 0 }}>{shop.shopName || "(নাম দেওয়া হয়নি)"}</p>
            <strong style={{ color: s.color, fontSize: 13 }}>{s.label}</strong>
          </div>
        );
      })}
    </div>
  );
}