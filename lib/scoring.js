import { db } from "@/lib/firebase";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { normalizePhone } from "@/lib/phone";

function getAmountTier(amount) {
  if (amount <= 500) return "small";
  if (amount <= 2000) return "medium";
  return "large";
}

const POINTS = {
  approved: { small: 3, medium: 5, large: 8 },
  paid: { small: 5, medium: 10, large: 15 },
  rejected: { small: 8, medium: 15, large: 25 },
};

// ---- নতুন: মেয়াদ পার হওয়া (Overdue) এন্ট্রির জন্য প্রতি সপ্তাহে score কমার হার ----
const OVERDUE_PENALTY_PER_WEEK = 5;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export async function updateCustomerScore(phone, eventType, amount) {
  const customerId = normalizePhone(phone);
  const customerRef = doc(db, "customers", customerId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(customerRef);
    const now = Date.now();

    let data = snap.exists()
      ? snap.data()
      : {
          phone,
          trustScore: 50,
          rejectionCount: 0,
          isRedFlagged: false,
          recentRejections: [],
        };

    const tier = getAmountTier(amount || 0);
    let delta = 0;

    if (eventType === "approved") {
      delta = POINTS.approved[tier];
    } else if (eventType === "paid") {
      delta = POINTS.paid[tier];
    } else if (eventType === "rejected") {
      const recent = (data.recentRejections || []).filter(
        (t) => now - t < THIRTY_DAYS_MS
      );
      const occurrence = recent.length + 1;

      let multiplier = 1;
      if (occurrence === 2) multiplier = 1.5;
      if (occurrence >= 3) multiplier = 2;

      delta = -Math.round(POINTS.rejected[tier] * multiplier);

      recent.push(now);
      data.recentRejections = recent;
      data.rejectionCount = (data.rejectionCount || 0) + 1;

      if (data.rejectionCount >= 3) {
        data.isRedFlagged = true;
      }
    }

    let newScore = (data.trustScore ?? 50) + delta;
    if (newScore > 100) newScore = 100;
    if (newScore < 0) newScore = 0;

    data.trustScore = newScore;
    data.phone = phone;
    data.updatedAt = serverTimestamp();
    if (!snap.exists()) {
      data.createdAt = serverTimestamp();
    }

    transaction.set(customerRef, data, { merge: true });
  });
}

/**
 * ---- নতুন: মেয়াদ পার হওয়া (Overdue) এন্ট্রির জন্য score কমানো ----
 * weeksToApply = নতুন করে কতগুলো সপ্তাহের penalty প্রযোজ্য হবে (একসাথে একাধিক সপ্তাহ পার হয়ে গেলে সবগুলো একসাথে ধরা হয়)।
 */
export async function applyOverduePenalty(phone, weeksToApply) {
  if (!weeksToApply || weeksToApply <= 0) return;
  const customerId = normalizePhone(phone);
  const customerRef = doc(db, "customers", customerId);

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(customerRef);
    if (!snap.exists()) return; // কাস্টমার ডেটা না থাকলে কিছু করার নেই

    const data = snap.data();
    const delta = -(OVERDUE_PENALTY_PER_WEEK * weeksToApply);
    let newScore = (data.trustScore ?? 50) + delta;
    if (newScore < 0) newScore = 0;
    if (newScore > 100) newScore = 100;

    transaction.set(
      customerRef,
      { trustScore: newScore, updatedAt: serverTimestamp() },
      { merge: true }
    );
  });
}