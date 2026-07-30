import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { applyOverduePenalty } from "@/lib/scoring";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

// ---- একটা transaction এর approvedAt + dueDays পার হয়ে গেছে কিনা যাচাই ----
export function isOverdue(txn) {
  if (txn.status !== "approved") return false;
  if (!txn.approvedAt?.toMillis) return false; // এখনো approvedAt সেট না থাকলে চেক করা যাবে না
  const dueDays = txn.dueDays || 30;
  const dueDateMs = txn.approvedAt.toMillis() + dueDays * DAY_MS;
  return Date.now() > dueDateMs;
}

// ---- মেয়াদ পার হওয়ার পর কতদিন হয়ে গেছে ----
export function getOverdueDays(txn) {
  if (!txn.approvedAt?.toMillis) return 0;
  const dueDays = txn.dueDays || 30;
  const dueDateMs = txn.approvedAt.toMillis() + dueDays * DAY_MS;
  const overdueMs = Date.now() - dueDateMs;
  return overdueMs > 0 ? Math.floor(overdueMs / DAY_MS) : 0;
}

/**
 * ---- নতুন: একটা overdue transaction চেক করে, প্রয়োজনে score penalty প্রয়োগ করে ----
 * প্রতি সপ্তাহে একবার করে penalty হয় — এই ফাংশন সেটা ট্র্যাক করে (transaction ডকুমেন্টে
 * `overduePenaltiesApplied` ফিল্ডে কতবার penalty দেওয়া হয়েছে তা সংরক্ষণ করে, যাতে বারবার
 * dashboard লোড হলেও একই সপ্তাহের penalty দুইবার না বসে)।
 */
export async function checkAndApplyOverduePenalty(txn) {
  if (!isOverdue(txn)) return;

  const overdueDays = getOverdueDays(txn);
  const weeksOverdue = Math.floor(overdueDays / 7) + 1; // মেয়াদ পার হওয়ার প্রথম দিন থেকেই ১ সপ্তাহ ধরা হয়
  const alreadyApplied = txn.overduePenaltiesApplied || 0;

  if (weeksOverdue <= alreadyApplied) return; // এই সপ্তাহের জন্য ইতিমধ্যে penalty দেওয়া হয়ে গেছে

  const weeksToApply = weeksOverdue - alreadyApplied;

  try {
    await applyOverduePenalty(txn.customerPhone, weeksToApply);
    await updateDoc(doc(db, "transactions", txn.id), {
      overduePenaltiesApplied: weeksOverdue,
    });
  } catch (err) {
    console.error("Overdue penalty apply failed:", err);
  }
}