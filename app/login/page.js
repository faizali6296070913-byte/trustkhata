"use client";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getFriendlyAuthError } from "@/lib/authErrors";
import { useLanguage } from "@/lib/LanguageContext";

export default function LoginPage() {
  const { t } = useLanguage();
  const [mode, setMode] = useState("password");
  const [phonePw, setPhonePw] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [step, setStep] = useState("phone");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ---- নতুন: OTP পাঠানো ও যাচাই করার সময় আলাদা লোডিং state ----
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const redirectAfterLogin = async (uid) => {
    const userRef = doc(db, "users", uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, { role: "shopkeeper", createdAt: serverTimestamp() });
    }
    const shopRef = doc(db, "shopkeepers", uid);
    const shopSnap = await getDoc(shopRef);
    if (!shopSnap.exists()) {
      await setDoc(shopRef, { status: "pending_review", createdAt: serverTimestamp() });
      window.location.href = "/onboarding";
      return;
    }
    if (!shopSnap.data().shopName) {
      window.location.href = "/onboarding";
      return;
    }
    window.location.href = "/dashboard";
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const digits = phonePw.replace(/\D/g, "").slice(-10);
      const pseudoEmail = `${digits}@halkhata.app`;
      const result = await signInWithEmailAndPassword(auth, pseudoEmail, password);
      await redirectAfterLogin(result.user.uid);
    } catch (err) {
      console.error(err);
      setError(getFriendlyAuthError(err));
    }
    setSubmitting(false);
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
      await redirectAfterLogin(result.user.uid);
    } catch (err) {
      console.error(err);
      setError(getFriendlyAuthError(err));
      setVerifyingOtp(false); // ---- নতুন: এরর হলে বাটন আবার চালু করো ----
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>🏪 {t("shopkeeperLoginTitle")}</h2>

      <div style={{ display: "flex", marginBottom: 20 }}>
        <button
          onClick={() => setMode("password")}
          style={{
            flex: 1,
            padding: 10,
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
            padding: 10,
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
            placeholder={t("phoneOnly")}
            value={phonePw}
            onChange={(e) => setPhonePw(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
          />

          <div style={{ position: "relative", marginBottom: 10 }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder={t("passwordPlaceholder")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ display: "block", width: "100%", padding: 8, paddingRight: 40, boxSizing: "border-box" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
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
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>

          <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
            {submitting ? t("loggingIn") : t("loginButton")}
          </button>
          <a href="/forgot-password" style={{ display: "block", marginTop: 10, fontSize: 13, color: "#999" }}>
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
                placeholder={t("phoneOnly")}
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
        </>
      )}

      {error && <p style={{ color: "red" }}>{error}</p>}
      <div id="recaptcha-container"></div>
    </div>
  );
}