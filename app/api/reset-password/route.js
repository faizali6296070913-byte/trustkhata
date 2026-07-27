import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebaseAdmin";
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

    const decoded = await adminAuth.verifyIdToken(idToken);
    const phoneNumber = decoded.phone_number;

    if (!phoneNumber) {
      return NextResponse.json({ error: "ফোন যাচাই পাওয়া যায়নি।" }, { status: 400 });
    }

    const digits = normalizePhone(phoneNumber);
    const pseudoEmail = `${digits}@halkhata.app`;

    try {
      const targetUser = await adminAuth.getUserByEmail(pseudoEmail);
      await adminAuth.updateUser(targetUser.uid, { password: newPassword });
    } catch (err) {
      await adminAuth.createUser({ email: pseudoEmail, password: newPassword });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "সার্ভারে সমস্যা হয়েছে।" }, { status: 500 });
  }
}