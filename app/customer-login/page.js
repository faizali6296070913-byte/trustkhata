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
import { useLanguage } from "@/lib/LanguageContext";

export default function CustomerLoginPage() {
  const { t } = useLanguage();
  const [mode, setMode] = useState("password");

  const [pwPhone, setPwPhone] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [showPwPassword, setShowPwPassword] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [step, setStep] = useState("phone");
  const [error, setError] = useState("");

  // ---- নতুন: OTP পাঠানো ও যাচাই করার সময় আলাদা লোডিং state ----
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

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
    setSendingOtp(true); // ---- নতুন ----
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
    setSendingOtp(false); // ---- নতুন ----
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setVerifyingOtp(true); // ---- নতুন ----
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
      setVerifyingOtp(false); // ---- নতুন ----
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>{t("customerLoginTitle")}</h2>

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
          {t("withPassword")}
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
          {t("withOtp")}
        </button>
      </div>

      {mode === "password" && (
        <form onSubmit={handlePasswordLogin}>
          <input
            type="tel"
            placeholder={t("phoneNumberPlaceholder")}
            value={pwPhone}
            onChange={(e) => setPwPhone(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
          />

          <div style={{ position: "relative", marginBottom: 10 }}>
            <input
              type={showPwPassword ? "text" : "password"}
              placeholder={t("passwordPlaceholder")}
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
            >
              {showPwPassword ? "🙈" : "👁️"}
            </button>
          </div>

          <button type="submit" disabled={pwSubmitting} style={{ width: "100%", padding: 10 }}>
            {pwSubmitting ? t("loggingIn") : t("loginButton")}
          </button>
          {pwError && <p style={{ color: "red", fontSize: 13 }}>{pwError}</p>}
          <a
            href="/customer-forgot-password"
            style={{ display: "block", textAlign: "center", marginTop: 10, fontSize: 13, color: "#999" }}
          >
            {t("forgotPassword")}
          </a>
        </form>
      )}

      {mode === "otp" && (
        <>
          {step === "phone" && (
            <form onSubmit={sendOtp}>
              <input
                type="tel"
                placeholder={t("phoneNumberPlaceholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                disabled={sendingOtp}
                style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
              />
              {/* ---- বদলানো হয়েছে: লোডিং অবস্থায় বাটন disable ও টেক্সট বদল ---- */}
              <button
                type="submit"
                disabled={sendingOtp}
                style={{
                  width: "100%",
                  padding: 10,
                  opacity: sendingOtp ? 0.7 : 1,
                  cursor: sendingOtp ? "not-allowed" : "pointer",
                }}
              >
                {sendingOtp ? `⏳ ${t("sending")}` : t("sendOtp")}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={verifyOtp}>
              <input
                type="text"
                placeholder={t("otpCodePlaceholder")}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                required
                disabled={verifyingOtp}
                style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
              />
              <button
                type="submit"
                disabled={verifyingOtp}
                style={{
                  width: "100%",
                  padding: 10,
                  opacity: verifyingOtp ? 0.7 : 1,
                  cursor: verifyingOtp ? "not-allowed" : "pointer",
                }}
              >
                {verifyingOtp ? `⏳ ${t("verifying")}` : t("verifyButton")}
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