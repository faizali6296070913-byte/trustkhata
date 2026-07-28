export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { verifyIdTokenREST, linkPasswordToCurrentAccount } from "@/lib/firebaseAdmin";
import { normalizePhone } from "@/lib/phone";

export async function POST(request) {
  try {
    const { idToken, newPassword } = await request.json();

    if (!idToken || !newPassword) {
      return NextResponse.json({ error: "তথ্য অসম্পূর্ণ।" }, { status: 400 });
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।" }, { status: 400 });
    }

    const user = await verifyIdTokenREST(idToken);
    const phoneNumber = user.phoneNumber;

    if (!phoneNumber) {
      return NextResponse.json({ error: "ফোন যাচাই পাওয়া যায়নি।" }, { status: 400 });
    }

    const digits = normalizePhone(phoneNumber);
    const pseudoEmail = `${digits}@halkhata.app`;

    // ---- এটাই মূল পরিবর্তন: আলাদা একাউন্ট না বানিয়ে/বদলে, OTP-verified একাউন্টেই সরাসরি পাসওয়ার্ড link করা ----
    await linkPasswordToCurrentAccount(idToken, pseudoEmail, newPassword);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে।" }, { status: 500 });
  }
}