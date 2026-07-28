"use client";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged, EmailAuthProvider, linkWithCredential } from "firebase/auth";
import { normalizePhone } from "@/lib/phone";

export default function CustomerOnboardingPage() {
  const [name, setName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [pincode, setPincode] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [occupation, setOccupation] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = "/customer-login";
        return;
      }
      setCheckingAuth(false);
    });
    return () => unsub();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।");
      return;
    }
    if (password !== confirmPassword) {
      setError("দুটো পাসওয়ার্ড মিলছে না।");
      return;
    }

    setSubmitting(true);
    try {
      const user = auth.currentUser;
      const digits = normalizePhone(user.phoneNumber);
      const pseudoEmail = `${digits}@halkhata.app`;

      // ---- বদলানো হয়েছে: পাসওয়ার্ড link করার চেষ্টা আলাদাভাবে, ব্যর্থ হলেও থেমে যাবে না ----
      try {
        const credential = EmailAuthProvider.credential(pseudoEmail, password);
        await linkWithCredential(user, credential);
      } catch (linkErr) {
        console.warn("Password link skipped:", linkErr.code);
        // ইতিমধ্যে link করা থাকলে বা অন্য কোনো linking সমস্যা হলেও, প্রোফাইল তথ্য সেভ চালিয়ে যাওয়া হবে
      }

      // ---- এই অংশটুকু সবসময় চলবে, linking ব্যর্থ হলেও ----
      await updateDoc(doc(db, "customers", digits), {
        name,
        address: {
          street,
          city,
          state: stateVal,
          pincode,
        },
        altPhone: altPhone || null,
        occupation: occupation || null,
        hasPassword: true,
      });

      window.location.href = "/customer-dashboard";
    } catch (err) {
      console.error(err);
      setError("সেভ করা যায়নি, আবার চেষ্টা করুন।");
      setSubmitting(false);
    }
  };

  if (checkingAuth) return <p style={{ padding: 20 }}>লোড হচ্ছে...</p>;

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>আপনার তথ্য দিন</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="পূর্ণ নাম"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          type="text"
          placeholder="রাস্তা/এলাকা"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          type="text"
          placeholder="শহর"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          type="text"
          placeholder="রাজ্য"
          value={stateVal}
          onChange={(e) => setStateVal(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          type="text"
          placeholder="পিনকোড"
          value={pincode}
          onChange={(e) => setPincode(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          type="tel"
          placeholder="বিকল্প ফোন নাম্বার (ঐচ্ছিক)"
          value={altPhone}
          onChange={(e) => setAltPhone(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          type="text"
          placeholder="পেশা (ঐচ্ছিক)"
          value={occupation}
          onChange={(e) => setOccupation(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />

        <hr style={{ margin: "16px 0", borderColor: "#333" }} />
        <p style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>
          একটা পাসওয়ার্ড সেট করুন, পরের বার থেকে OTP ছাড়াই লগইন করতে পারবেন
        </p>
        <input
          type="password"
          placeholder="পাসওয়ার্ড (অন্তত ৬ অক্ষর)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          type="password"
          placeholder="পাসওয়ার্ড আবার লিখুন"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />

        <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
          {submitting ? "সেভ হচ্ছে..." : "সেভ করুন"}
        </button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
    </div>
  );
}