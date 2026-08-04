import { NextResponse } from "next/server";
import { verifyIdTokenREST } from "@/lib/firebaseAdmin";
import { getDocument, patchDocument } from "@/lib/firestoreAdmin";
import { verifyPin } from "@/lib/pinSecurity";
import { executeFifoSettlementAdmin } from "@/lib/settlementAdmin";
import { normalizePhone } from "@/lib/phone";

export async function POST(req) {
  try {
    const { idToken, requestId, pin: rawPin } = await req.json();
    const pin = (rawPin || "").trim();

    if (!idToken || !requestId || !pin) {
      return NextResponse.json({ error: "প্রয়োজনীয় তথ্য দেওয়া হয়নি।" }, { status: 400 });
    }

    // ---- ধাপ ১: লগইন যাচাই ----
    const user = await verifyIdTokenREST(idToken);

    // ---- ধাপ ২: settlement request খুঁজে বের করা ----
    const settleReq = await getDocument("settlementRequests", requestId);
    if (!settleReq) {
      return NextResponse.json({ error: "এই রিকোয়েস্ট খুঁজে পাওয়া যায়নি।" }, { status: 404 });
    }

    // ---- মালিকানা যাচাই ----
    const emailPrefix = (user.email || "").split("@")[0];
    const requesterDigits = normalizePhone(user.phoneNumber || emailPrefix || "");
    if (!requesterDigits || requesterDigits !== settleReq.customerId) {
      return NextResponse.json({ error: "এই রিকোয়েস্টে আপনার অনুমতি নেই।" }, { status: 403 });
    }

    if (settleReq.status !== "awaiting_pin") {
      return NextResponse.json(
        { error: "এই রিকোয়েস্ট ইতিমধ্যে সম্পন্ন হয়ে গেছে অথবা এখনো PIN জেনারেট হয়নি।" },
        { status: 400 }
      );
    }

    // ---- নতুন: PIN এর hash আলাদা সুরক্ষিত কালেকশন থেকে আনা হচ্ছে ----
    const pinSecretId = `settle_${requestId}`;
    const pinSecret = (await getDocument("pinSecrets", pinSecretId)) || {};

    // ---- ধাপ ৩: PIN যাচাই ----
    const result = verifyPin(pin, pinSecret);

    if (!result.valid) {
      if (result.updateFields) {
        await patchDocument("pinSecrets", pinSecretId, result.updateFields);
      }
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    // ---- ধাপ ৪: সঠিক PIN — এবার FIFO অনুযায়ী টাকা ভাগ করে সব এন্ট্রি আপডেট করা ----
    try {
      await executeFifoSettlementAdmin(
        settleReq.shopId,
        settleReq.customerId,
        settleReq.amount,
        settleReq.customerPhone
      );
    } catch (allocErr) {
      // ---- FIFO ব্যর্থ হলে PIN secret ফিল্ড মুছে দাও, যাতে ভুল অবস্থায় আটকে না থাকে ----
      await patchDocument("pinSecrets", pinSecretId, result.updateFields);
      return NextResponse.json({ error: allocErr.message || "সমস্যা হয়েছে।" }, { status: 400 });
    }

    // ---- ধাপ ৫: PIN secret ফিল্ড মুছে ফেলা ও request কে "completed" করা ----
    await patchDocument("pinSecrets", pinSecretId, result.updateFields);
    await patchDocument("settlementRequests", requestId, {
      status: "completed",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "সমস্যা হয়েছে, আবার চেষ্টা করুন।" }, { status: 500 });
  }
}