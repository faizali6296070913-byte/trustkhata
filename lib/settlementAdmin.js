import { getAccessToken } from "@/lib/firebaseAdmin";
import { runQuery, getDocument, patchDocument } from "@/lib/firestoreAdmin";
import { normalizePhone } from "@/lib/phone";

const DATABASE_ID = "trustkhata-mumbai";

const toPaisa = (rupees) => Math.round(Number(rupees) * 100);
const toRupees = (paisa) => Math.round(paisa) / 100;

// ---- Firestore REST commit endpoint এর জন্য value convert করা ----
function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const k in value) fields[k] = toFirestoreValue(value[k]);
    return { mapValue: { fields } };
  }
  throw new Error("Unsupported value type: " + typeof value);
}

async function getOutstandingTxnsOldestFirst(shopId, customerId) {
  const txns = await runQuery("transactions", [
    { field: "shopId", op: "EQUAL", value: shopId },
    { field: "customerId", op: "EQUAL", value: customerId },
    { field: "status", op: "EQUAL", value: "approved" },
  ]);
  // ---- createdAt অনুযায়ী পুরনো থেকে নতুন সাজানো (runQuery নিজে orderBy সাপোর্ট করে না) ----
  return txns.sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return aTime - bTime;
  });
}

export async function planFifoAllocationAdmin(shopId, customerId, totalAmountRupees) {
  const txns = await getOutstandingTxnsOldestFirst(shopId, customerId);
  let remainingToAllocatePaisa = toPaisa(totalAmountRupees);

  if (remainingToAllocatePaisa <= 0) {
    throw new Error("সঠিক পরিমাণ দিন।");
  }

  const totalOutstandingPaisa = txns.reduce(
    (sum, t) => sum + (toPaisa(t.amount) - toPaisa(t.amountPaid || 0)),
    0
  );

  if (remainingToAllocatePaisa > totalOutstandingPaisa) {
    throw new Error(`সর্বোচ্চ ₹${toRupees(totalOutstandingPaisa)} মেটানো যাবে (এর বেশি বাকি নেই)।`);
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
      amountPaisa: takeFromThis,
      newAmountPaid: toRupees(alreadyPaidPaisa + takeFromThis),
      willBeFullyPaid: takeFromThis === txnOutstandingPaisa,
      existingPayments: t.payments || [],
    });
    remainingToAllocatePaisa -= takeFromThis;
  }

  return allocations;
}

// ---- সব এন্ট্রি একসাথে atomic ভাবে আপডেট করা (Firestore REST commit দিয়ে — একটাও বাদ যাবে না) ----
export async function executeFifoSettlementAdmin(shopId, customerId, totalAmountRupees, customerPhone) {
  const allocations = await planFifoAllocationAdmin(shopId, customerId, totalAmountRupees);
  const { accessToken, projectId } = await getAccessToken();

  const writes = allocations.map((alloc) => {
    const newPayments = [
      ...alloc.existingPayments,
      {
        amount: toRupees(alloc.amountPaisa),
        paidAt: new Date().toISOString(),
        viaSettlement: true,
      },
    ];
    const fields = {
      amountPaid: toFirestoreValue(alloc.newAmountPaid),
      payments: toFirestoreValue(newPayments),
      status: toFirestoreValue(alloc.willBeFullyPaid ? "paid" : "approved"),
    };
    if (alloc.willBeFullyPaid) {
      fields.paidAt = toFirestoreValue(new Date());
    }
    return {
      update: {
        name: `projects/${projectId}/databases/${DATABASE_ID}/documents/transactions/${alloc.txnId}`,
        fields,
      },
      updateMask: { fieldPaths: Object.keys(fields) },
    };
  });

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE_ID}/documents:commit`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ writes }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error("Settlement commit failed: " + JSON.stringify(data));

  // ---- ট্রাস্ট স্কোর: সম্পূর্ণ শোধ হওয়া এন্ট্রিগুলোর জন্য ----
  for (const alloc of allocations) {
    if (alloc.willBeFullyPaid) {
      await updateCustomerScoreAdmin(customerPhone, "paid", alloc.newAmountPaid).catch(() => {});
    }
  }

  return allocations;
}

// ---- lib/scoring.js এর সার্ভার-সাইড (REST) ভার্সন — এই ফাইলে শুধু "paid" event লাগে ----
function getAmountTier(amount) {
  if (amount <= 500) return "small";
  if (amount <= 2000) return "medium";
  return "large";
}

const PAID_POINTS = { small: 5, medium: 10, large: 15 };

export async function updateCustomerScoreAdmin(phone, eventType, amount) {
  if (eventType !== "paid") return;
  const customerId = normalizePhone(phone);
  const existing = await getDocument("customers", customerId);

  const tier = getAmountTier(amount || 0);
  const delta = PAID_POINTS[tier];

  const currentScore = existing?.trustScore ?? 50;
  let newScore = currentScore + delta;
  if (newScore > 100) newScore = 100;
  if (newScore < 0) newScore = 0;

  await patchDocument("customers", customerId, {
    trustScore: newScore,
    phone,
  });
}