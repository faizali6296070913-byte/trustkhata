import { runQuery, getDocument, patchDocument } from "@/lib/firestoreAdmin";

const DAY_MS = 24 * 60 * 60 * 1000;
const OVERDUE_PENALTY_PER_WEEK = 5;

function isOverdueServer(txn) {
  if (txn.status !== "approved" || !txn.approvedAt) return false;
  const dueDays = txn.dueDays || 30;
  const dueDateMs = new Date(txn.approvedAt).getTime() + dueDays * DAY_MS;
  return Date.now() > dueDateMs;
}

function getOverdueDaysServer(txn) {
  const dueDays = txn.dueDays || 30;
  const dueDateMs = new Date(txn.approvedAt).getTime() + dueDays * DAY_MS;
  const diff = Date.now() - dueDateMs;
  return diff > 0 ? Math.floor(diff / DAY_MS) : 0;
}

// ---- এই route টা প্রতিদিন একবার Vercel Cron নিজে থেকেই চালাবে (কারো app খোলার অপেক্ষা করবে না) ----
export async function GET(request) {
  // ---- নিরাপত্তা: শুধু Vercel Cron নিজে (গোপন CRON_SECRET সহ) এই route চালাতে পারবে ----
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // ---- সব "approved" (এখনো সম্পূর্ণ শোধ হয়নি) transaction খুঁজে বের করা ----
    const approvedTxns = await runQuery("transactions", [
      { field: "status", op: "EQUAL", value: "approved" },
    ]);

    let processedCount = 0;
    const errors = [];

    for (const txn of approvedTxns) {
      try {
        if (!isOverdueServer(txn)) continue;

        const overdueDays = getOverdueDaysServer(txn);
        const weeksOverdue = Math.floor(overdueDays / 7) + 1;
        const alreadyApplied = txn.overduePenaltiesApplied || 0;

        if (weeksOverdue <= alreadyApplied) continue; // এই সপ্তাহের penalty আগেই দেওয়া হয়ে গেছে

        const weeksToApply = weeksOverdue - alreadyApplied;
        const customerId = txn.customerId;
        if (!customerId) continue;

        const customer = await getDocument("customers", customerId);
        if (!customer) continue;

        let newScore = (customer.trustScore ?? 50) - OVERDUE_PENALTY_PER_WEEK * weeksToApply;
        if (newScore < 0) newScore = 0;
        if (newScore > 100) newScore = 100;

        await patchDocument("customers", customerId, { trustScore: newScore });
        await patchDocument("transactions", txn.id, { overduePenaltiesApplied: weeksOverdue });

        processedCount++;
      } catch (innerErr) {
        errors.push({ txnId: txn.id, error: innerErr.message });
      }
    }

    return Response.json({
      success: true,
      checkedTransactions: approvedTxns.length,
      penaltiesApplied: processedCount,
      errors,
    });
  } catch (err) {
    console.error("Cron overdue penalty error:", err);
    return new Response("Error: " + err.message, { status: 500 });
  }
}