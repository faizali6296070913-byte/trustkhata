import { db } from "@/lib/firebase";
import {
  doc,
  runTransaction,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { updateCustomerScore } from "@/lib/scoring";

// ---- টাকাকে পয়সায় (integer) রূপান্তর — দশমিক হিসাবের ভুল এড়ানোর জন্য ----
const toPaisa = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paisa) => Math.round(paisa) / 100;

/**
 * একটা দোকান+কাস্টমারের সব "approved" (বাকি থাকা) transaction, সবচেয়ে পুরনো থেকে নতুন — এই ক্রমে এনে দেয়।
 * শুধু "approved" status নেওয়া হয়, যেগুলো ইতিমধ্যে আলাদাভাবে PIN জেনারেট হয়ে "awaiting_pin_confirmation"
 * এ আছে সেগুলো বাদ দেওয়া হয়, যাতে দুইভাবে হিসাব না হয়ে যায়।
 */
async function getOutstandingTxnsOldestFirst(shopId, customerId) {
  const q = query(
    collection(db, "transactions"),
    where("shopId", "==", shopId),
    where("customerId", "==", customerId),
    where("status", "==", "approved"),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * FIFO অনুযায়ী কোন এন্ট্রি থেকে কত কাটা হবে তার একটা পরিকল্পনা বানায় (শুধু হিসাব, এখনো সেভ করে না)।
 */
export async function planFifoAllocation(shopId, customerId, totalAmountRupees) {
  const txns = await getOutstandingTxnsOldestFirst(shopId, customerId);
  let remainingToAllocatePaisa = toPaisa(totalAmountRupees);
  const totalOutstandingPaisa = txns.reduce(
    (sum, t) => sum + (toPaisa(t.amount) - toPaisa(t.amountPaid || 0)),
    0
  );

  if (remainingToAllocatePaisa > totalOutstandingPaisa) {
    throw new Error(
      `সর্বোচ্চ ₹${toRupees(totalOutstandingPaisa)} মেটানো যাবে (এর বেশি বাকি নেই)।`
    );
  }

  const allocations = [];
  for (const t of txns) {
    if (remainingToAllocatePaisa <= 0) break;
    const alreadyPaidPaisa = toPaisa(t.amountPaid || 0);
    const txnOutstandingPaisa = toPaisa(t.amount) - alreadyPaidPaisa;
    if (txnOutstandingPaisa <= 0) continue;

    const takeFromThis = Math.min(txnOutstandingPaisa, remainingToAllocatePaisa);
    allocations.push({
      txnId: t.id,
      txn: t,
      amountPaisa: takeFromThis,
      willBeFullyPaid: takeFromThis === txnOutstandingPaisa,
    });
    remainingToAllocatePaisa -= takeFromThis;
  }

  return allocations;
}

/**
 * FIFO পরিকল্পনা অনুযায়ী, সব এন্ট্রিকে একসাথে (atomic ভাবে) আপডেট করে —
 * হয় সবগুলো সফল হবে, নাহলে একটাও না (Firestore Transaction ব্যবহার করে)।
 */
export async function executeFifoSettlement(shopId, customerId, totalAmountRupees, customerPhone) {
  const allocations = await planFifoAllocation(shopId, customerId, totalAmountRupees);

  await runTransaction(db, async (transaction) => {
    for (const alloc of allocations) {
      const txnRef = doc(db, "transactions", alloc.txnId);
      const freshSnap = await transaction.get(txnRef);
      if (!freshSnap.exists()) continue;
      const fresh = freshSnap.data();

      // ---- নিরাপত্তা: এই সময়ের মধ্যে যদি অন্য কোনোভাবে এই এন্ট্রি বদলে গিয়ে থাকে, বাদ দাও ----
      if (fresh.status !== "approved") continue;

      const newAmountPaid = toRupees(toPaisa(fresh.amountPaid || 0) + alloc.amountPaisa);
      const isFullyPaid = toPaisa(fresh.amount) - toPaisa(newAmountPaid) <= 0;

      transaction.update(txnRef, {
        amountPaid: newAmountPaid,
        payments: arrayUnion({
          amount: toRupees(alloc.amountPaisa),
          paidAt: new Date().toISOString(),
          viaSettlement: true,
        }),
        status: isFullyPaid ? "paid" : "approved",
        ...(isFullyPaid ? { paidAt: serverTimestamp() } : {}),
      });
    }
  });

  // ---- ট্রাস্ট স্কোর: যেসব এন্ট্রি সম্পূর্ণ শোধ হয়ে গেল, তাদের জন্য আলাদা আলাদা score আপডেট ----
  for (const alloc of allocations) {
    if (alloc.willBeFullyPaid) {
      await updateCustomerScore(customerPhone, "paid", alloc.txn.amount).catch(() => {});
    }
  }

  return allocations;
}