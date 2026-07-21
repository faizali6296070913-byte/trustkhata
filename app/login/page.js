"use client";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [step, setStep] = useState("phone");
  const [error, setError] = useState("");

  const setupRecaptcha = () => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
    }
  };

  const sendOtp = async (e) => {
    e.preventDefault();
    setError("");
    try {
      setupRecaptcha();
      const fullPhone = phone.startsWith("+") ? phone : `+91${phone}`;
      const result = await signInWithPhoneNumber(auth, fullPhone, window.recaptchaVerifier);
      setConfirmationResult(result);
      setStep("otp");
    } catch (err) {
      setError(err.message);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const result = await confirmationResult.confirm(otp);
      const user = result.user;

      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          phone: user.phoneNumber,
          role: "shopkeeper",
          name: null,
          createdAt: serverTimestamp(),
        });

        await setDoc(doc(db, "shopkeepers", user.uid), {
          shopName: null,
          ownerName: null,
          shopAddress: null,
          phone: user.phoneNumber,
          status: "pending_review",
          verifiedAt: null,
          verifiedBy: null,
          createdAt: serverTimestamp(),
          totalCustomers: 0,
          totalOutstandingAmount: 0,
        });

        window.location.href = "/onboarding";
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      console.error(err);
      setError("ভুল OTP, আবার চেষ্টা করুন");
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>শপকিপার লগইন</h2>

      {step === "phone" && (
        <form onSubmit={sendOtp}>
          <input
            type="tel"
            placeholder="ফোন নাম্বার (যেমন 9876543210)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
          />
          <button type="submit" style={{ width: "100%", padding: 10 }}>OTP পাঠান</button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={verifyOtp}>
          <input
            type="text"
            placeholder="OTP কোড দিন"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
          />
          <button type="submit" style={{ width: "100%", padding: 10 }}>যাচাই করুন</button>
        </form>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
      <div id="recaptcha-container"></div>
    </div>
  );
}