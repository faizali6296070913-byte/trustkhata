"use client";
import { useState } from "react";
import { auth } from "@/lib/firebase";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { getFriendlyAuthError } from "@/lib/authErrors";
import { useLanguage } from "@/lib/LanguageContext";

export default function CustomerForgotPasswordPage() {
  const { t } = useLanguage();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [step, setStep] = useState("phone");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

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
    setSendingOtp(true);
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
    setSendingOtp(false);
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setVerifyingOtp(true);
    try {
      await confirmationResult.confirm(otp);
      setStep("newPassword");
    } catch (err) {
      console.error(err);
      setError(getFriendlyAuthError(err));
    }
    setVerifyingOtp(false);
  };

  // ---- বদলানো হয়েছে: এখন সরাসরি না বদলে, সার্ভারের API রুট কল করে সঠিক একাউন্টের পাসওয়ার্ড বদলানো হচ্ছে ----
  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError(t("onboardPwTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("onboardPwMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || t("genericError"));
        setSubmitting(false);
        return;
      }
      setStep("done");
    } catch (err) {
      console.error(err);
      setError(t("genericError"));
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>{t("resetPasswordTitle")}</h2>

      {step === "phone" && (
        <form onSubmit={sendOtp}>
          <p style={{ fontSize: 13, color: "#999", marginBottom: 10 }}>
            {t("resetPhoneInstruction")}
          </p>
          <input
            type="tel"
            placeholder={t("phoneNumberPlaceholder")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            disabled={sendingOtp}
            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
          />
          <button
            type="submit"
            disabled={sendingOtp}
            style={{ width: "100%", padding: 10, opacity: sendingOtp ? 0.7 : 1 }}
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
            style={{ width: "100%", padding: 10, opacity: verifyingOtp ? 0.7 : 1 }}
          >
            {verifyingOtp ? `⏳ ${t("verifying")}` : t("verifyButton")}
          </button>
        </form>
      )}

      {step === "newPassword" && (
        <form onSubmit={handleSetNewPassword}>
          <p style={{ fontSize: 13, color: "green", marginBottom: 10 }}>
            ✅ {t("verifySuccessNote")}
          </p>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <input
              type={showNewPw ? "text" : "password"}
              placeholder={t("onboardPasswordPlaceholder")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={submitting}
              style={{ display: "block", width: "100%", padding: 8, paddingRight: 40, boxSizing: "border-box" }}
            />
            <button
              type="button"
              onClick={() => setShowNewPw((v) => !v)}
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer" }}
            >
              {showNewPw ? "🙈" : "👁️"}
            </button>
          </div>
          <input
            type={showNewPw ? "text" : "password"}
            placeholder={t("onboardConfirmPasswordPlaceholder")}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={submitting}
            style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
          />
          <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
            {submitting ? t("saving") : t("changePasswordButton")}
          </button>
        </form>
      )}

      {step === "done" && (
        <div>
          <p style={{ color: "green", marginBottom: 16 }}>
            ✅ {t("passwordChangedSuccess")}
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
            {t("goToLoginPage")}
          </a>
        </div>
      )}

      {error && <p style={{ color: "red", fontSize: 13 }}>{error}</p>}
      <div id="recaptcha-container"></div>
    </div>
  );
}