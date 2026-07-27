"use client";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { normalizePhone } from "@/lib/phone";
import { getFriendlyAuthError } from "@/lib/authErrors";

export default function CustomerLoginPage() {
  const [mode, setMode] = useState("password"); // "password" | "otp"

  const [pwPhone, setPwPhone] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [showPwPassword, setShowPwPassword] = useState(false); // ---- নতুন ----
  const [pwError, setPwError] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [step, setStep] = useState("phone");
  const [error, setError] = useState("");

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setPwError("");
    setPwSubmitting(true);
    try {
      const digits = normalizePhone(pwPhone);
      const pseudoEmail = `${digits}@halkhata.app`;
      await signInWithEmailAndPassword(auth, pseudoEmail, pwPassword);
      window.location.href = "/customer-dashboard";
    } catch (err) {
      console.error(err);
      setPwError(getFriendlyAuthError(err));
      setPwSubmitting(false);
    }
  };

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
      console.error(err);
      setError(getFriendlyAuthError(err));
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const result = await confirmationResult.confirm(otp);
      const user = result.user;
      const digits = normalizePhone(user.phoneNumber);

      const customerRef = doc(db, "customers", digits);
      const snap = await getDoc(customerRef);

      if (!snap.exists()) {
        await setDoc(customerRef, {
          phone: user.phoneNumber,
          trustScore: 50,
          rejectionCount: 0,
          isRedFlagged: false,
          recentRejections: [],
          name: null,
          createdAt: serverTimestamp(),
        });
        window.location.href = "/customer-onboarding";
      } else if (!snap.data().name) {
        window.location.href = "/customer-onboarding";
      } else {
        window.location.href = "/customer-dashboard";
      }
    } catch (err) {
      console.error(err);
      setError(getFriendlyAuthError(err));
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>কাস্টমার লগইন</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setMode("password")}
          style={{
            flex: 1,
            padding: 8,
            background: mode === "password" ? "#2563eb" : "#333",
            color: "white",
            border: "none",
          }}
        >
          পাসওয়ার্ড দিয়ে
        </button>
        <button
          onClick={() => setMode("otp")}
          style={{
            flex: 1,
            padding: 8,
            background: mode === "otp" ? "#2563eb" : "#333",
            color: "white",
            border: "none",
          }}
        >
          OTP দিয়ে
        </button>
      </div>

      {mode === "password" && (
        <form onSubmit={handlePasswordLogin}>
          <input
            type="tel"
            placeholder="ফোন নাম্বার (যেমন 9876543210)"
            value={pwPhone}
            onChange={(e) => setPwPhone(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
          />

          {/* ---- নতুন: পাসওয়ার্ড ইনপুট + চোখ আইকন ---- */}
          <div style={{ position: "relative", marginBottom: 10 }}>
            <input
              type={showPwPassword ? "text" : "password"}
              placeholder="পাসওয়ার্ড"
              value={pwPassword}
              onChange={(e) => setPwPassword(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: 8, paddingRight: 40, boxSizing: "border-box" }}
            />
            <button
              type="button"
              onClick={() => setShowPwPassword((v) => !v)}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 16,
              }}
              aria-label={showPwPassword ? "পাসওয়ার্ড লুকান" : "পাসওয়ার্ড দেখান"}
            >
              {showPwPassword ? "🙈" : "👁️"}
            </button>
          </div>

          <button type="submit" disabled={pwSubmitting} style={{ width: "100%", padding: 10 }}>
            {pwSubmitting ? "লগইন হচ্ছে..." : "লগইন করুন"}
          </button>
          {pwError && <p style={{ color: "red", fontSize: 13 }}>{pwError}</p>}
          <a
            href="/customer-forgot-password"
            style={{ display: "block", textAlign: "center", marginTop: 10, fontSize: 13, color: "#999" }}
          >
            পাসওয়ার্ড ভুলে গেছেন?
          </a>
        </form>
      )}

      {mode === "otp" && (
        <>
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

          {error && <p style={{ color: "red", fontSize: 13 }}>{error}</p>}
        </>
      )}

      <div id="recaptcha-container"></div>
    </div>
  );
}