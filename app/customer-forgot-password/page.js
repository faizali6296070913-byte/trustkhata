"use client";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber, updatePassword } from "firebase/auth";
import { normalizePhone } from "@/lib/phone";

export default function CustomerForgotPasswordPage() {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [step, setStep] = useState("phone"); // "phone" | "otp" | "newPassword" | "done"
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
      await confirmationResult.confirm(otp);
      // OTP verify হয়ে গেলে এই মুহূর্তে auth.currentUser আপডেট হয়ে যায়
      setStep("newPassword");
    } catch (err) {
      console.error(err);
      setError("ভুল OTP, আবার চেষ্টা করুন।");
    }
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("দুটো পাসওয়ার্ড মিলছে না।");
      return;
    }

    setSubmitting(true);
    try {
      const user = auth.currentUser;
      await updatePassword(user, newPassword);
      setStep("done");
    } catch (err) {
      console.error(err);
      setError("পাসওয়ার্ড বদলানো যায়নি, আবার চেষ্টা করুন।");
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>পাসওয়ার্ড রিসেট করুন</h2>

      {step === "phone" && (
        <form onSubmit={sendOtp}>
          <p style={{ fontSize: 13, color: "#999", marginBottom: 10 }}>
            আপনার ফোন নাম্বার দিন, OTP দিয়ে যাচাই করার পর নতুন পাসওয়ার্ড সেট করতে পারবেন।
          </p>
          <input
            type="tel"
            placeholder="ফোন নাম্বার (যেমন 9876543210)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
          />
          <button type="submit" style={{ width: "100%", padding: 10 }}>
            OTP পাঠান
          </button>
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
          <button type="submit" style={{ width: "100%", padding: 10 }}>
            যাচাই করুন
          </button>
        </form>
      )}

      {step === "newPassword" && (
        <form onSubmit={handleSetNewPassword}>
          <p style={{ fontSize: 13, color: "green", marginBottom: 10 }}>
            ✅ যাচাই সফল হয়েছে। এখন নতুন পাসওয়ার্ড দিন।
          </p>
          <input
            type="password"
            placeholder="নতুন পাসওয়ার্ড (অন্তত ৬ অক্ষর)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
          />
          <input
            type="password"
            placeholder="নতুন পাসওয়ার্ড আবার লিখুন"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
          />
          <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
            {submitting ? "সেভ হচ্ছে..." : "পাসওয়ার্ড বদলান"}
          </button>
        </form>
      )}

      {step === "done" && (
        <div>
          <p style={{ color: "green", marginBottom: 16 }}>
            ✅ আপনার পাসওয়ার্ড সফলভাবে বদলানো হয়েছে!
          </p>
          <a
            href="/customer-login"
            style={{
              display: "block",
              textAlign: "center",
              padding: 10,
              background: "#2563eb",
              color: "white",
              textDecoration: "none",
            }}
          >
            লগইন পেজে যান
          </a>
        </div>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
      <div id="recaptcha-container"></div>
    </div>
  );
}