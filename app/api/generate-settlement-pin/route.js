import { NextResponse } from "next/server";
import { verifyIdTokenREST } from "@/lib/firebaseAdmin";
import { getDocument, patchDocument } from "@/lib/firestoreAdmin";
import { generatePinCode, createPinFields } from "@/lib/pinSecurity";

export async function POST(req) {
  try {
    const { idToken, requestId } = await req.json();

    if (!idToken || !requestId) {
      return NextResponse.json({ error: "প্রয়োজনীয় তথ্য দেওয়া হয়নি।" }, { status: 400 });
    }

    // ---- ধাপ ১: লগইন যাচাই ----
    const user = await verifyIdTokenREST(idToken);
    const uid = user.localId;

    // ---- ধাপ ২: settlement request আছে কিনা ও এই দোকানদারের নিজেরই কিনা যাচাই ----
    const settleReq = await getDocument("settlementRequests", requestId);
    if (!settleReq) {
      return NextResponse.json({ error: "এই রিকোয়েস্ট খুঁজে পাওয়া যায়নি।" }, { status: 404 });
    }
    if (settleReq.shopId !== uid) {
      return NextResponse.json({ error: "এই রিকোয়েস্টে আপনার অনুমতি নেই।" }, { status: 403 });
    }
    // ---- বদলানো হয়েছে: "pending" এর পাশাপাশি "awaiting_pin" ও অনুমতি দেওয়া হলো,
    // যাতে পেজ রিফ্রেশ হয়ে গেলে দোকানদার নতুন PIN আবার তৈরি করতে পারেন ----
    if (!["pending", "awaiting_pin"].includes(settleReq.status)) {
      return NextResponse.json({ error: "এই রিকোয়েস্ট এখন PIN জেনারেট করার অবস্থায় নেই।" }, { status: 400 });
    }

    // ---- ধাপ ৩: PIN তৈরি করে hash সেভ করা ----
    const pin = generatePinCode();
    await patchDocument("settlementRequests", requestId, {
      ...createPinFields(pin),
      status: "awaiting_pin",
    });

    return NextResponse.json({ pin });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "সমস্যা হয়েছে, আবার চেষ্টা করুন।" }, { status: 500 });
  }
}