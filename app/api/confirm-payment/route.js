import { NextResponse } from "next/server";
import { verifyIdTokenREST } from "@/lib/firebaseAdmin";
import { getDocument, patchDocument } from "@/lib/firestoreAdmin";
import { verifyPin } from "@/lib/pinSecurity";
import { updateCustomerScoreAdmin } from "@/lib/settlementAdmin";
import { normalizePhone } from "@/lib/phone";

export async function POST(req) {
  try {
    const { idToken, txnId, pin } = await req.json();

    if (!idToken || !txnId || !pin) {
      return NextResponse.json({ error: "প্রয়োজনীয় তথ্য দেওয়া হয়নি।" }, { status: 400 });
    }

    // ---- ধাপ ১: লগইন যাচাই ----
    const user = await verifyIdTokenREST(idToken);

    // ---- ধাপ ২: transaction খুঁজে বের করা ----
    const txn = await getDocument("transactions", txnId);
    if (!txn) {
      return NextResponse.json({ error: "এই এন্ট্রি খুঁজে পাওয়া যায়নি।" }, { status: 404 });
    }

    // ---- মালিকানা যাচাই — যে লগইন করেছে সে-ই কি আসলে এই লেনদেনের কাস্টমার ----
    const emailPrefix = (user.email || "").split("@")[0];
    const requesterDigits = normalizePhone(user.phoneNumber || emailPrefix || "");
    if (!requesterDigits || requesterDigits !== txn.customerId) {
      return NextResponse.json({ error: "এই এন্ট্রিতে আপনার অনুমতি নেই।" }, { status: 403 });
    }

    if (txn.status !== "awaiting_pin_confirmation") {
      return NextResponse.json(
        { error: "এই এন্ট্রি ইতিমধ্যে সম্পন্ন হয়ে গেছে অথবা এখনো PIN জেনারেট হয়নি।" },
        { status: 400 }
      );
    }

    // ---- নতুন: PIN এর hash এখন আলাদা সুরক্ষিত কালেকশন থেকে আনা হচ্ছে ----
    const pinSecretId = `txn_${txnId}`;
    const pinSecret = (await getDocument("pinSecrets", pinSecretId)) || {};

    // ---- ধাপ ৩: PIN যাচাই (লক/মেয়াদ/attempt সবকিছুসহ) ----
    const result = verifyPin(pin, pinSecret);

    if (!result.valid) {
      if (result.updateFields) {
        await patchDocument("pinSecrets", pinSecretId, result.updateFields);
      }
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    // ---- ধাপ ৪: সঠিক PIN — এবার টাকার হিসাব আপডেট করা ----
    const thisPayment = txn.pendingPaymentAmount || txn.amount;
    const previousPaid = txn.amountPaid || 0;
    const newAmountPaid = previousPaid + thisPayment;
    const remaining = txn.amount - newAmountPaid;
    const isFullyPaid = remaining <= 0;

    // ---- PIN secret ডকুমেন্ট থেকে সব গোপন ফিল্ড মুছে ফেলা (একই PIN দ্বিতীয়বার কাজ করবে না) ----
    await patchDocument("pinSecrets", pinSecretId, result.updateFields);

    const updates = {
      amountPaid: newAmountPaid,
      payments: [
        ...(txn.payments || []),
        { amount: thisPayment, paidAt: new Date().toISOString() },
      ],
      status: isFullyPaid ? "paid" : "approved",
    };
    if (isFullyPaid) {
      updates.paidAt = new Date();
    }

    await patchDocument("transactions", txnId, updates);

    if (isFullyPaid) {
      await updateCustomerScoreAdmin(txn.customerPhone, "paid", txn.amount).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      fullyPaid: isFullyPaid,
      remaining: remaining > 0 ? remaining : 0,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "সমস্যা হয়েছে, আবার চেষ্টা করুন।" }, { status: 500 });
  }
}