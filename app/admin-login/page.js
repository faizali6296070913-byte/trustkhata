"use client";
import { useEffect, useState, useMemo } from "react";
import { auth, db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  collection,
  updateDoc,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUid, setAdminUid] = useState(null);

  const [shopkeepers, setShopkeepers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [logs, setLogs] = useState([]);

  const [searchTerm, setSearchTerm] = useState("");
  const [showRedFlagOnly, setShowRedFlagOnly] = useState(false);

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

    const unsubShops = onSnapshot(collection(db, "shopkeepers"), (snap) => {
      setShopkeepers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubCustomers = onSnapshot(collection(db, "customers"), (snap) => {
      setCustomers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const unsubTxns = onSnapshot(collection(db, "transactions"), (snap) => {
      setTransactions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    const logsQuery = query(collection(db, "adminLogs"), orderBy("createdAt", "desc"), limit(30));
    const unsubLogs = onSnapshot(logsQuery, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubShops();
      unsubCustomers();
      unsubTxns();
      unsubLogs();
    };
  }, [isAdmin]);

  const writeLog = async (action, targetType, targetId, targetName) => {
    try {
      await addDoc(collection(db, "adminLogs"), {
        action,
        targetType,
        targetId,
        targetName: targetName || "",
        adminUid,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Log write failed:", err);
    }
  };

  const handleApprove = async (shop) => {
    try {
      await updateDoc(doc(db, "shopkeepers", shop.id), {
        status: "approved",
        verifiedAt: serverTimestamp(),
        verifiedBy: adminUid,
      });
      writeLog("approve_shop", "shopkeeper", shop.id, shop.shopName);
    } catch (err) {
      console.error(err);
      alert("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
  };

  const handleReject = async (shop) => {
    try {
      await updateDoc(doc(db, "shopkeepers", shop.id), {
        status: "rejected",
        verifiedAt: serverTimestamp(),
        verifiedBy: adminUid,
      });
      writeLog("reject_shop", "shopkeeper", shop.id, shop.shopName);
    } catch (err) {
      console.error(err);
      alert("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
  };

  const handleSuspend = async (shop) => {
    if (!confirm(`${shop.shopName || "এই দোকান"} সাসপেন্ড করতে চান?`)) return;
    try {
      await updateDoc(doc(db, "shopkeepers", shop.id), {
        status: "suspended",
        verifiedAt: serverTimestamp(),
        verifiedBy: adminUid,
      });
      writeLog("suspend_shop", "shopkeeper", shop.id, shop.shopName);
    } catch (err) {
      console.error(err);
      alert("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
  };

  const handleReactivate = async (shop) => {
    try {
      await updateDoc(doc(db, "shopkeepers", shop.id), {
        status: "approved",
        verifiedAt: serverTimestamp(),
        verifiedBy: adminUid,
      });
      writeLog("reactivate_shop", "shopkeeper", shop.id, shop.shopName);
    } catch (err) {
      console.error(err);
      alert("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
  };

  const handleMakeAdmin = async (shop) => {
    if (!confirm(`${shop.ownerName || shop.phone} কে Admin বানাতে চান?`)) return;
    try {
      await updateDoc(doc(db, "users", shop.id), {
        role: "admin",
      });
      writeLog("make_admin", "user", shop.id, shop.ownerName || shop.phone);
      alert("Admin বানানো হয়েছে।");
    } catch (err) {
      console.error(err);
      alert("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
  };

  const handleExportCSV = () => {
    const rows = [["ধরন", "নাম", "ফোন", "স্ট্যাটাস/স্কোর", "ঠিকানা"]];
    shopkeepers.forEach((s) => {
      rows.push(["দোকান", s.shopName || "", s.phone || "", s.status || "", s.shopAddress || ""]);
    });
    customers.forEach((c) => {
      rows.push(["কাস্টমার", c.name || "", c.phone || "", c.trustScore ?? "", ""]);
    });
    const csvContent = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `trustkhata-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = useMemo(() => {
    let totalOutstanding = 0;
    let totalPaid = 0;
    transactions.forEach((t) => {
      const amt = Number(t.amount) || 0;
      if (t.status === "paid") totalPaid += amt;
      else if (["pending_approval", "approved", "awaiting_pin_confirmation"].includes(t.status)) {
        totalOutstanding += amt;
      }
    });
    return { totalOutstanding, totalPaid, totalTxns: transactions.length };
  }, [transactions]);

  const term = searchTerm.trim().toLowerCase();

  const filteredShopkeepers = shopkeepers.filter((s) => {
    if (!term) return true;
    return (
      (s.shopName || "").toLowerCase().includes(term) ||
      (s.ownerName || "").toLowerCase().includes(term) ||
      (s.phone || "").includes(term)
    );
  });

  const filteredCustomers = customers.filter((c) => {
    if (showRedFlagOnly && !c.isRedFlagged) return false;
    if (!term) return true;
    return (
      (c.name || "").toLowerCase().includes(term) ||
      (c.phone || "").includes(term)
    );
  });

  if (loading) return <p style={{ padding: 20 }}>লোড হচ্ছে...</p>;

  if (!isAdmin) {
    return <p style={{ padding: 20, color: "red" }}>⛔ আপনার এই পেজে প্রবেশের অনুমতি নেই।</p>;
  }

  const pendingShops = filteredShopkeepers.filter((s) => s.status === "pending_review");
  const activeShops = filteredShopkeepers.filter((s) => s.status === "approved");
  const suspendedShops = filteredShopkeepers.filter((s) => s.status === "suspended");
  const rejectedShops = filteredShopkeepers.filter((s) => s.status === "rejected");

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: "auto" }}>
      <h2>🛠️ Admin Dashboard</h2>

      <div style={{ display: "flex", gap: 12, margin: "20px 0", flexWrap: "wrap" }}>
        <div style={cardStyle}>
          <p style={cardLabel}>মোট দোকান</p>
          <p style={cardValue}>{shopkeepers.length}</p>
        </div>
        <div style={cardStyle}>
          <p style={cardLabel}>মোট কাস্টমার</p>
          <p style={cardValue}>{customers.length}</p>
        </div>
        <div style={cardStyle}>
          <p style={cardLabel}>বকেয়া (₹)</p>
          <p style={cardValue}>{stats.totalOutstanding}</p>
        </div>
        <div style={cardStyle}>
          <p style={cardLabel}>পরিশোধিত (₹)</p>
          <p style={cardValue}>{stats.totalPaid}</p>
        </div>
      </div>

      <button onClick={handleExportCSV} style={{ padding: 10, width: "100%", marginBottom: 20 }}>
        📥 CSV রিপোর্ট ডাউনলোড করুন
      </button>

      <input
        type="text"
        placeholder="🔍 নাম বা ফোন নাম্বার দিয়ে খুঁজুন..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{ display: "block", width: "100%", marginBottom: 20, padding: 10 }}
      />

      <h3>⏳ পেন্ডিং অনুমোদন ({pendingShops.length})</h3>
      {pendingShops.length === 0 && <p>কোনো পেন্ডিং দোকান নেই।</p>}
      {pendingShops.map((shop) => (
        <div key={shop.id} style={shopCardStyle}>
          <p style={{ margin: 0, fontWeight: "bold" }}>{shop.shopName || "(নাম দেওয়া হয়নি)"}</p>
          <p style={smallText}>মালিক: {shop.ownerName || "—"} | ফোন: {shop.phone}</p>
          <p style={smallText}>ঠিকানা: {shop.shopAddress || "—"}</p>
          {shop.shopType && (
            <p style={smallText}>
              ধরন: {shop.shopType} {shop.yearsInBusiness ? `| ${shop.yearsInBusiness} বছর ধরে ব্যবসা` : ""}
            </p>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button onClick={() => handleApprove(shop)} style={{ ...btnStyle, background: "green" }}>
              ✅ Approve
            </button>
            <button onClick={() => handleReject(shop)} style={{ ...btnStyle, background: "red" }}>
              ❌ Reject
            </button>
          </div>
        </div>
      ))}

      <h3 style={{ marginTop: 30 }}>✅ সক্রিয় দোকান ({activeShops.length})</h3>
      {activeShops.map((shop) => (
        <div key={shop.id} style={shopCardStyle}>
          <p style={{ margin: 0, fontWeight: "bold" }}>{shop.shopName}</p>
          <p style={smallText}>মালিক: {shop.ownerName || "—"} | ফোন: {shop.phone}</p>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <button onClick={() => handleSuspend(shop)} style={{ ...btnStyle, background: "orange" }}>
              ⛔ সাসপেন্ড
            </button>
            <button
              onClick={() => handleMakeAdmin(shop)}
              style={{ ...btnStyle, background: "#1a1a1a", border: "1px solid #555" }}
            >
              👑 Admin বানান
            </button>
          </div>
        </div>
      ))}

      {suspendedShops.length > 0 && (
        <>
          <h3 style={{ marginTop: 30 }}>⛔ সাসপেন্ডেড দোকান ({suspendedShops.length})</h3>
          {suspendedShops.map((shop) => (
            <div key={shop.id} style={shopCardStyle}>
              <p style={{ margin: 0, fontWeight: "bold" }}>{shop.shopName}</p>
              <p style={smallText}>ফোন: {shop.phone}</p>
              <button
                onClick={() => handleReactivate(shop)}
                style={{ ...btnStyle, background: "green", marginTop: 8 }}
              >
                ✅ পুনরায় সক্রিয় করুন
              </button>
            </div>
          ))}
        </>
      )}

      <h3 style={{ marginTop: 30 }}>❌ Rejected ({rejectedShops.length})</h3>
      {rejectedShops.map((shop) => (
        <div key={shop.id} style={{ ...shopCardStyle, borderLeft: "4px solid red" }}>
          <p style={{ margin: 0 }}>{shop.shopName} — {shop.phone}</p>
        </div>
      ))}

      <h3 style={{ marginTop: 30 }}>👤 কাস্টমার ({filteredCustomers.length})</h3>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14 }}>
        <input
          type="checkbox"
          checked={showRedFlagOnly}
          onChange={(e) => setShowRedFlagOnly(e.target.checked)}
        />
        শুধু 🚩 রেড-ফ্ল্যাগড কাস্টমার দেখান
      </label>
      {filteredCustomers.slice(0, 50).map((c) => (
        <div
          key={c.id}
          style={{
            ...shopCardStyle,
            borderLeft: c.isRedFlagged ? "4px solid red" : "4px solid #444",
          }}
        >
          <p style={{ margin: 0, fontWeight: "bold" }}>
            {c.name || "(নাম নেই)"} {c.isRedFlagged && "🚩"}
          </p>
          <p style={smallText}>
            ফোন: {c.phone} | স্কোর: {c.trustScore ?? 50} | রিজেকশন: {c.rejectionCount ?? 0}
          </p>
        </div>
      ))}
      {filteredCustomers.length > 50 && (
        <p style={{ fontSize: 13, color: "#999" }}>
          আরও {filteredCustomers.length - 50} জন আছে (সার্চ করে খুঁজুন)
        </p>
      )}

      <h3 style={{ marginTop: 30 }}>📋 সাম্প্রতিক অ্যাক্টিভিটি</h3>
      {logs.length === 0 && <p style={{ fontSize: 13, color: "#999" }}>কোনো লগ নেই।</p>}
      {logs.map((log) => (
        <div
          key={log.id}
          style={{
            fontSize: 13,
            color: "#999",
            marginBottom: 6,
            borderBottom: "1px solid #333",
            paddingBottom: 6,
          }}
        >
          <strong>{actionLabel(log.action)}</strong> — {log.targetName || log.targetId}
          {log.createdAt?.toDate && <span> · {log.createdAt.toDate().toLocaleString("bn-BD")}</span>}
        </div>
      ))}
    </div>
  );
}

function actionLabel(action) {
  const map = {
    approve_shop: "✅ দোকান Approve",
    reject_shop: "❌ দোকান Reject",
    suspend_shop: "⛔ দোকান Suspend",
    reactivate_shop: "✅ দোকান পুনরায় সক্রিয়",
    make_admin: "👑 নতুন Admin বানানো হয়েছে",
  };
  return map[action] || action;
}

const cardStyle = { background: "#1a1a1a", padding: 15, flex: "1 1 100px", textAlign: "center", borderRadius: 6 };
const cardLabel = { margin: 0, fontSize: 12, color: "#999" };
const cardValue = { margin: 0, fontSize: 22, fontWeight: "bold" };
const shopCardStyle = { background: "#1a1a1a", padding: 12, marginBottom: 10, borderRadius: 6 };
const smallText = { margin: 0, fontSize: 13, color: "#999" };
const btnStyle = { flex: 1, padding: 8, color: "white", border: "none", borderRadius: 4 };