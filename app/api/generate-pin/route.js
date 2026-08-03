import { NextResponse } from "next/server";
import { verifyIdTokenREST } from "@/lib/firebaseAdmin";
import { getDocument, patchDocument } from "@/lib/firestoreAdmin";
import { generatePinCode, createPinFields } from "@/lib/pinSecurity";

export async function POST(req) {
  try {
    const { idToken, txnId, paymentAmount } = await req.json();

    if (!idToken || !txnId || !paymentAmount) {
      return NextResponse.json({ error: "প্রয়োজনীয় তথ্য দেওয়া হয়নি।" }, { status: 400 });
    }

    // ---- ধাপ ১: লগইন যাচাই ----
    const user = await verifyIdTokenREST(idToken);
    const uid = user.localId;

    // ---- ধাপ ২: transaction আছে কিনা ও এই দোকানদারের নিজেরই কিনা যাচাই ----
    const txn = await getDocument("transactions", txnId);
    if (!txn) {
      return NextResponse.json({ error: "এই এন্ট্রি খুঁজে পাওয়া যায়নি।" }, { status: 404 });
    }
    if (txn.shopId !== uid) {
      return NextResponse.json({ error: "এই এন্ট্রিতে আপনার অনুমতি নেই।" }, { status: 403 });
    }
    if (!["approved", "awaiting_pin_confirmation"].includes(txn.status)) {
      return NextResponse.json({ error: "এই এন্ট্রি এখন PIN জেনারেট করার অবস্থায় নেই।" }, { status: 400 });
    }

    // ---- ধাপ ৩: টাকার পরিমাণ যাচাই ----
    const remaining = Number(txn.amount) - Number(txn.amountPaid || 0);
    const entered = Number(paymentAmount);
    if (!entered || entered <= 0 || entered > remaining) {
      return NextResponse.json(
        { error: `সর্বোচ্চ ₹${remaining} নেওয়া যাবে (এর বেশি বাকি নেই)।` },
        { status: 400 }
      );
    }

    // ---- ধাপ ৪: PIN তৈরি ----
    const pin = generatePinCode();

    // ---- নতুন: PIN এর hash এখন আলাদা "pinSecrets" কালেকশনে সংরক্ষিত হয়, যেটা ক্লায়েন্ট
    // (dashboard/customer-dashboard) কখনো পড়তে পারবে না — শুধু সার্ভার/Admin থেকেই অ্যাক্সেসযোগ্য।
    // এটা transaction ডকুমেন্টের ভেতরে রাখলে, dashboard যখন transaction লোড করে,
    // hash-টাও (দেখা না গেলেও) ব্রাউজারে চলে আসত — যেটা ৪-সংখ্যার PIN এর ক্ষেত্রে ঝুঁকিপূর্ণ ----
    await patchDocument("pinSecrets", `txn_${txnId}`, createPinFields(pin));

    // ---- transaction ডকুমেন্টে শুধু প্রয়োজনীয় তথ্য (PIN ছাড়া) ----
    await patchDocument("transactions", txnId, {
      pendingPaymentAmount: entered,
      status: "awaiting_pin_confirmation",
    });

    // ---- আসল PIN শুধু এই রেসপন্সে একবারই ফেরত যায়, দোকানদার এটা কাস্টমারকে বলবেন ----
    return NextResponse.json({ pin });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "সমস্যা হয়েছে, আবার চেষ্টা করুন।" }, { status: 500 });
  }
}