"use client";
import { useEffect, useState, useMemo, useRef } from "react";
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
import { isOverdue, getOverdueDays } from "@/lib/overdue";

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
  // ---- নতুন: Block ফিচারের জন্য filter ও pagination ----
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);
  const [customerPage, setCustomerPage] = useState(1);
  const CUSTOMERS_PER_PAGE = 50;

  // ---- Detail view এর জন্য state ----
  const [selectedShop, setSelectedShop] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  // ---- Notification এর জন্য ----
  const [notifPermission, setNotifPermission] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );
  const prevPendingCount = useRef(null);
  const prevRedFlagCount = useRef(null);

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

  // ---- নতুন: কাস্টমারকে ব্লক/আনব্লক করা — ব্লক করলে সেই কাস্টমার নতুন কোনো দোকান থেকে ক্রেডিট নিতে পারবে না ----
  const handleToggleBlockCustomer = async (customer) => {
    const isCurrentlyBlocked = customer.isBlockedByAdmin === true;
    const action = isCurrentlyBlocked ? "আনব্লক" : "ব্লক";
    if (!confirm(`${customer.name || customer.phone} কে ${action} করতে চান?`)) return;
    try {
      await updateDoc(doc(db, "customers", customer.id), {
        isBlockedByAdmin: !isCurrentlyBlocked,
        blockedAt: !isCurrentlyBlocked ? serverTimestamp() : null,
        blockedBy: !isCurrentlyBlocked ? adminUid : null,
      });
      writeLog(
        isCurrentlyBlocked ? "unblock_customer" : "block_customer",
        "customer",
        customer.id,
        customer.name || customer.phone
      );
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

  // ---- কোনো দোকান/কাস্টমারের সাথে সম্পর্কিত transaction খুঁজে বের করা ----
  const getTransactionsFor = (entity, type) => {
    if (!entity) return [];
    return transactions
      .filter((t) => {
        if (type === "shop") {
          return (
            t.shopId === entity.id ||
            t.shopPhone === entity.phone ||
            t.shopkeeperId === entity.id
          );
        }
        if (type === "customer") {
          return (
            t.customerId === entity.id ||
            t.customerPhone === entity.phone ||
            t.customerId === entity.phone
          );
        }
        return false;
      })
      .sort((a, b) => {
        const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return bt - at;
      });
  };

  // ---- Transaction status বদলানো ----
  const handleUpdateTxnStatus = async (txn, newStatus) => {
    if (!confirm(`এই লেনদেনের স্ট্যাটাস "${statusLabel(newStatus)}" করতে চান?`)) return;
    try {
      await updateDoc(doc(db, "transactions", txn.id), {
        status: newStatus,
        adminUpdatedAt: serverTimestamp(),
        adminUpdatedBy: adminUid,
      });
      writeLog("update_transaction", "transaction", txn.id, `₹${txn.amount} → ${newStatus}`);
    } catch (err) {
      console.error(err);
      alert("সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    }
  };

  // ---- Notification permission চাওয়া ----
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().then(setNotifPermission);
      }
    }
  }, []);

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

  // ---- নতুন: মেয়াদ পার হওয়া (Overdue) সব transaction একসাথে খুঁজে বের করা ----
  const overdueTxns = useMemo(() => {
    return transactions.filter((t) => t.status === "approved" && isOverdue(t));
  }, [transactions]);

  // ---- নতুন: overdue transaction গুলোকে কাস্টমার অনুযায়ী গোষ্ঠীবদ্ধ করা ----
  const overdueByCustomer = useMemo(() => {
    const map = {};
    overdueTxns.forEach((t) => {
      const key = t.customerId || t.customerPhone;
      if (!map[key]) {
        map[key] = {
          customerId: t.customerId,
          customerPhone: t.customerPhone,
          count: 0,
          totalAmount: 0,
          maxOverdueDays: 0,
        };
      }
      map[key].count += 1;
      map[key].totalAmount += (t.amount || 0) - (t.amountPaid || 0);
      map[key].maxOverdueDays = Math.max(map[key].maxOverdueDays, getOverdueDays(t));
    });
    return Object.values(map).sort((a, b) => b.maxOverdueDays - a.maxOverdueDays);
  }, [overdueTxns]);

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
    if (showBlockedOnly && !c.isBlockedByAdmin) return false;
    if (!term) return true;
    return (
      (c.name || "").toLowerCase().includes(term) ||
      (c.phone || "").includes(term)
    );
  });

  // ---- নতুন: Pagination হিসাব ----
  const totalCustomerPages = Math.max(1, Math.ceil(filteredCustomers.length / CUSTOMERS_PER_PAGE));
  const paginatedCustomers = filteredCustomers.slice(
    (customerPage - 1) * CUSTOMERS_PER_PAGE,
    customerPage * CUSTOMERS_PER_PAGE
  );

  const pendingShops = filteredShopkeepers.filter((s) => s.status === "pending_review");
  const activeShops = filteredShopkeepers.filter((s) => s.status === "approved");
  const suspendedShops = filteredShopkeepers.filter((s) => s.status === "suspended");
  const rejectedShops = filteredShopkeepers.filter((s) => s.status === "rejected");
  const redFlaggedCount = customers.filter((c) => c.isRedFlagged).length;

  // ---- নতুন পেন্ডিং দোকান / red-flag এলে notification পাঠানো ----
  useEffect(() => {
    if (!isAdmin) return;
    const allPendingCount = shopkeepers.filter((s) => s.status === "pending_review").length;

    if (prevPendingCount.current !== null && allPendingCount > prevPendingCount.current) {
      fireNotification(
        "🆕 নতুন দোকান পেন্ডিং",
        `${allPendingCount - prevPendingCount.current}টি নতুন দোকান অনুমোদনের অপেক্ষায় আছে।`
      );
    }
    prevPendingCount.current = allPendingCount;
  }, [shopkeepers, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    if (prevRedFlagCount.current !== null && redFlaggedCount > prevRedFlagCount.current) {
      fireNotification(
        "🚩 নতুন Red-Flag কাস্টমার",
        `একজন কাস্টমার এখন red-flag হয়ে গেছে। চেক করুন।`
      );
    }
    prevRedFlagCount.current = redFlaggedCount;
  }, [redFlaggedCount, isAdmin]);

  const fireNotification = (title, body) => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  };

  // ---- নতুন: সার্চ/ফিল্টার বদলালে পেজ ১ এ ফিরে যাওয়া ----
  useEffect(() => {
    setCustomerPage(1);
  }, [searchTerm, showRedFlagOnly, showBlockedOnly]);

  if (loading) return <p style={{ padding: 20 }}>লোড হচ্ছে...</p>;

  if (!isAdmin) {
    return <p style={{ padding: 20, color: "red" }}>⛔ আপনার এই পেজে প্রবেশের অনুমতি নেই।</p>;
  }

  // ---- Shop Detail View ----
  if (selectedShop) {
    const shopTxns = getTransactionsFor(selectedShop, "shop");
    return (
      <div style={{ padding: 20, maxWidth: 600, margin: "auto" }}>
        <button onClick={() => setSelectedShop(null)} style={{ marginBottom: 16, padding: 8 }}>
          ← ফিরে যান
        </button>
        <h2>🏪 {selectedShop.shopName || "(নাম নেই)"}</h2>
        <div style={shopCardStyle}>
          <p style={smallText}>মালিক: {selectedShop.ownerName || "—"}</p>
          <p style={smallText}>ফোন: {selectedShop.phone}</p>
          <p style={smallText}>ঠিকানা: {selectedShop.shopAddress || "—"}</p>
          <p style={smallText}>স্ট্যাটাস: {selectedShop.status}</p>
          {selectedShop.shopType && <p style={smallText}>ধরন: {selectedShop.shopType}</p>}
        </div>

        <h3 style={{ marginTop: 24 }}>লেনদেনের ইতিহাস ({shopTxns.length})</h3>
        {shopTxns.length === 0 && <p style={smallText}>কোনো লেনদেন পাওয়া যায়নি।</p>}
        {shopTxns.map((t) => (
          <TxnCard key={t.id} txn={t} onUpdateStatus={handleUpdateTxnStatus} />
        ))}
      </div>
    );
  }

  // ---- Customer Detail View ----
  if (selectedCustomer) {
    const custTxns = getTransactionsFor(selectedCustomer, "customer");
    return (
      <div style={{ padding: 20, maxWidth: 600, margin: "auto" }}>
        <button onClick={() => setSelectedCustomer(null)} style={{ marginBottom: 16, padding: 8 }}>
          ← ফিরে যান
        </button>
        <h2>
          👤 {selectedCustomer.name || "(নাম নেই)"} {selectedCustomer.isRedFlagged && "🚩"}{" "}
          {selectedCustomer.isBlockedByAdmin && "🚫"}
        </h2>
        <div style={shopCardStyle}>
          <p style={smallText}>ফোন: {selectedCustomer.phone}</p>
          <p style={smallText}>ট্রাস্ট স্কোর: {selectedCustomer.trustScore ?? 50}</p>
          <p style={smallText}>রিজেকশন সংখ্যা: {selectedCustomer.rejectionCount ?? 0}</p>
          {selectedCustomer.isBlockedByAdmin && (
            <p style={{ ...smallText, color: "red", fontWeight: "bold" }}>
              🚫 এই কাস্টমার Admin দ্বারা ব্লক করা আছে — নতুন কোনো দোকান তাকে ক্রেডিট দিতে পারবে না
            </p>
          )}
        </div>

        {/* ---- নতুন: কাস্টমার ব্লক/আনব্লক করার বাটন ---- */}
        <button
          onClick={() => handleToggleBlockCustomer(selectedCustomer)}
          style={{
            width: "100%",
            padding: 10,
            marginBottom: 20,
            background: selectedCustomer.isBlockedByAdmin ? "green" : "#7f1d1d",
            color: "white",
            border: "none",
            borderRadius: 4,
          }}
        >
          {selectedCustomer.isBlockedByAdmin ? "✅ ব্লক তুলে নিন" : "🚫 এই কাস্টমারকে ব্লক করুন"}
        </button>

        <h3 style={{ marginTop: 24 }}>লেনদেনের ইতিহাস ({custTxns.length})</h3>
        {custTxns.length === 0 && <p style={smallText}>কোনো লেনদেন পাওয়া যায়নি।</p>}
        {custTxns.map((t) => (
          <TxnCard key={t.id} txn={t} onUpdateStatus={handleUpdateTxnStatus} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: "auto" }}>
      <h2>🛠️ Admin Dashboard</h2>

      {/* Notification স্ট্যাটাস ও ব্যাজ */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        {notifPermission !== "granted" && notifPermission !== "unsupported" && (
          <button
            onClick={() => Notification.requestPermission().then(setNotifPermission)}
            style={{ padding: "6px 10px", fontSize: 12, background: "#333", color: "white", border: "none" }}
          >
            🔔 নোটিফিকেশন চালু করুন
          </button>
        )}
        {notifPermission === "granted" && (
          <span style={{ fontSize: 12, color: "#4ade80" }}>🔔 নোটিফিকেশন চালু আছে</span>
        )}
      </div>

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

      {redFlaggedCount > 0 && (
        <div style={{ background: "#3b0d0d", padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          🚩 বর্তমানে {redFlaggedCount} জন কাস্টমার red-flagged
        </div>
      )}

      {/* ---- নতুন: মেয়াদ পার হওয়া (Overdue) কাস্টমারদের সতর্কতা ও তালিকা ---- */}
      {overdueByCustomer.length > 0 && (
        <div style={{ background: "#3b2a00", padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
          ⚠️ বর্তমানে {overdueByCustomer.length} জন কাস্টমারের মোট {overdueTxns.length}টি বাকি মেয়াদ পার হয়ে গেছে
        </div>
      )}

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

      {/* ---- নতুন: মেয়াদ পার হওয়া (Overdue) কাস্টমারদের বিস্তারিত তালিকা ---- */}
      <h3>⚠️ মেয়াদ পার হওয়া (Overdue) কাস্টমার ({overdueByCustomer.length})</h3>
      {overdueByCustomer.length === 0 && (
        <p style={{ fontSize: 13, color: "#999" }}>বর্তমানে কোনো কাস্টমারের মেয়াদ পার হওয়া বাকি নেই।</p>
      )}
      {overdueByCustomer.map((item) => {
        const customerDoc = customers.find(
          (c) => c.id === item.customerId || c.phone === item.customerPhone
        );
        return (
          <div key={item.customerId || item.customerPhone} style={{ ...shopCardStyle, borderLeft: "4px solid #f97316" }}>
            <p
              onClick={() => customerDoc && setSelectedCustomer(customerDoc)}
              style={{
                margin: 0,
                fontWeight: "bold",
                cursor: customerDoc ? "pointer" : "default",
                textDecoration: customerDoc ? "underline" : "none",
              }}
            >
              {customerDoc?.name || item.customerPhone}
            </p>
            <p style={smallText}>
              ফোন: {item.customerPhone} | {item.count}টি বাকি এন্ট্রি | মোট ₹{item.totalAmount}
            </p>
            <p style={{ ...smallText, color: "#f97316" }}>
              সবচেয়ে পুরনো মেয়াদ পার হয়েছে {item.maxOverdueDays} দিন আগে
            </p>
          </div>
        );
      })}

      <h3 style={{ marginTop: 30 }}>⏳ পেন্ডিং অনুমোদন ({pendingShops.length})</h3>
      {pendingShops.length === 0 && <p>কোনো পেন্ডিং দোকান নেই।</p>}
      {pendingShops.map((shop) => (
        <div key={shop.id} style={shopCardStyle}>
          <p
            onClick={() => setSelectedShop(shop)}
            style={{ margin: 0, fontWeight: "bold", cursor: "pointer", textDecoration: "underline" }}
          >
            {shop.shopName || "(নাম দেওয়া হয়নি)"}
          </p>
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
          <p
            onClick={() => setSelectedShop(shop)}
            style={{ margin: 0, fontWeight: "bold", cursor: "pointer", textDecoration: "underline" }}
          >
            {shop.shopName}
          </p>
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
              <p onClick={() => setSelectedShop(shop)} style={{ margin: 0, fontWeight: "bold", cursor: "pointer", textDecoration: "underline" }}>
                {shop.shopName}
              </p>
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
          <p style={{ margin: 0, cursor: "pointer", textDecoration: "underline" }} onClick={() => setSelectedShop(shop)}>
            {shop.shopName} — {shop.phone}
          </p>
        </div>
      ))}

      <h3 style={{ marginTop: 30 }}>👤 কাস্টমার ({filteredCustomers.length})</h3>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14 }}>
        <input
          type="checkbox"
          checked={showRedFlagOnly}
          onChange={(e) => setShowRedFlagOnly(e.target.checked)}
        />
        শুধু 🚩 রেড-ফ্ল্যাগড কাস্টমার দেখান
      </label>
      {/* ---- নতুন: শুধু ব্লকড কাস্টমার দেখার ফিল্টার ---- */}
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 14 }}>
        <input
          type="checkbox"
          checked={showBlockedOnly}
          onChange={(e) => setShowBlockedOnly(e.target.checked)}
        />
        শুধু 🚫 ব্লকড কাস্টমার দেখান
      </label>
      {paginatedCustomers.map((c) => (
        <div
          key={c.id}
          style={{
            ...shopCardStyle,
            borderLeft: c.isBlockedByAdmin ? "4px solid #777" : c.isRedFlagged ? "4px solid red" : "4px solid #444",
          }}
        >
          <p
            onClick={() => setSelectedCustomer(c)}
            style={{ margin: 0, fontWeight: "bold", cursor: "pointer", textDecoration: "underline" }}
          >
            {c.name || "(নাম নেই)"} {c.isRedFlagged && "🚩"} {c.isBlockedByAdmin && "🚫"}
          </p>
          <p style={smallText}>
            ফোন: {c.phone} | স্কোর: {c.trustScore ?? 50} | রিজেকশন: {c.rejectionCount ?? 0}
          </p>
        </div>
      ))}

      {/* ---- নতুন: Pagination controls ---- */}
      {filteredCustomers.length > CUSTOMERS_PER_PAGE && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, marginBottom: 10 }}>
          <button
            onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
            disabled={customerPage === 1}
            style={{ padding: "6px 14px", background: "#333", color: "white", border: "1px solid #666" }}
          >
            ← আগের পাতা
          </button>
          <span style={{ fontSize: 13, color: "#999" }}>
            পাতা {customerPage} / {totalCustomerPages}
          </span>
          <button
            onClick={() => setCustomerPage((p) => Math.min(totalCustomerPages, p + 1))}
            disabled={customerPage === totalCustomerPages}
            style={{ padding: "6px 14px", background: "#333", color: "white", border: "1px solid #666" }}
          >
            পরের পাতা →
          </button>
        </div>
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

// ---- একটা transaction card, detail view গুলোতে ব্যবহার হয় ----
function TxnCard({ txn, onUpdateStatus }) {
  const label = statusLabel(txn.status);
  return (
    <div style={{ ...shopCardStyle, borderLeft: `4px solid ${statusColor(txn.status)}` }}>
      <p style={{ margin: 0 }}>
        ₹{txn.amount} {txn.itemDetails ? `— ${txn.itemDetails}` : ""}
      </p>
      <p style={smallText}>
        দোকান: {txn.shopName || txn.shopId} | কাস্টমার: {txn.customerPhone}
      </p>
      <p style={{ ...smallText, color: statusColor(txn.status), fontWeight: "bold" }}>{label}</p>
      {txn.createdAt?.toDate && (
        <p style={smallText}>{txn.createdAt.toDate().toLocaleString("bn-BD")}</p>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        {txn.status !== "paid" && (
          <button onClick={() => onUpdateStatus(txn, "paid")} style={{ ...btnStyle, background: "green" }}>
            পরিশোধিত করুন
          </button>
        )}
        {txn.status !== "rejected" && (
          <button onClick={() => onUpdateStatus(txn, "rejected")} style={{ ...btnStyle, background: "red" }}>
            বাতিল করুন
          </button>
        )}
      </div>
    </div>
  );
}

function statusLabel(status) {
  const map = {
    pending_approval: "⏳ অপেক্ষমান",
    approved: "🟢 Approved",
    rejected: "🔴 Rejected",
    awaiting_pin_confirmation: "🔑 PIN অপেক্ষমান",
    paid: "✅ সম্পূর্ণ পরিশোধিত",
  };
  return map[status] || status;
}

function statusColor(status) {
  const map = {
    pending_approval: "#999",
    approved: "green",
    rejected: "red",
    awaiting_pin_confirmation: "orange",
    paid: "blue",
  };
  return map[status] || "#999";
}

function actionLabel(action) {
  const map = {
    approve_shop: "✅ দোকান Approve",
    reject_shop: "❌ দোকান Reject",
    suspend_shop: "⛔ দোকান Suspend",
    reactivate_shop: "✅ দোকান পুনরায় সক্রিয়",
    make_admin: "👑 Admin বানানো হয়েছে",
    update_transaction: "✏️ Transaction status বদলানো হয়েছে",
  };
  return map[action] || action;
}

const cardStyle = {
  flex: "1 1 45%",
  background: "#1a1a1a",
  padding: 12,
  borderRadius: 6,
  textAlign: "center",
};
const cardLabel = { margin: 0, fontSize: 11, color: "#999" };
const cardValue = { margin: 0, fontSize: 20, fontWeight: "bold" };

const shopCardStyle = {
  background: "#1a1a1a",
  padding: 12,
  marginBottom: 10,
  borderRadius: 6,
  borderLeft: "4px solid #444",
};

const smallText = { margin: 0, fontSize: 13, color: "#ccc" };

const btnStyle = {
  flex: 1,
  padding: 8,
  color: "white",
  border: "none",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 13,
};