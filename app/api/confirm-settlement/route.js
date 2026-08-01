import { NextResponse } from "next/server";
import { verifyIdTokenREST } from "@/lib/firebaseAdmin";
import { getDocument, patchDocument } from "@/lib/firestoreAdmin";
import { verifyPin } from "@/lib/pinSecurity";
import { executeFifoSettlementAdmin } from "@/lib/settlementAdmin";
import { normalizePhone } from "@/lib/phone";

export async function POST(req) {
  try {
    const { idToken, requestId, pin } = await req.json();

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

    // ---- নতুন: মালিকানা যাচাই — যে লগইন করেছে সে-ই কি আসলে এই রিকোয়েস্টের কাস্টমার ----
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

    // ---- ধাপ ৩: PIN যাচাই ----
    const result = verifyPin(pin, settleReq);

    if (!result.valid) {
      if (result.updateFields) {
        await patchDocument("settlementRequests", requestId, result.updateFields);
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
      // ---- FIFO ব্যর্থ হলে PIN ফিল্ড মুছে দাও, যাতে ভুল অবস্থায় আটকে না থাকে ----
      await patchDocument("settlementRequests", requestId, result.updateFields);
      return NextResponse.json({ error: allocErr.message || "সমস্যা হয়েছে।" }, { status: 400 });
    }

    // ---- ধাপ ৫: request কে "completed" করা ও PIN ফিল্ড মুছে ফেলা ----
    await patchDocument("settlementRequests", requestId, {
      ...result.updateFields,
      status: "completed",
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "সমস্যা হয়েছে, আবার চেষ্টা করুন।" }, { status: 500 });
  }
}