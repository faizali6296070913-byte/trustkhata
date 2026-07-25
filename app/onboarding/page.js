"use client";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { EmailAuthProvider, linkWithCredential } from "firebase/auth";

const SHOP_TYPES = [
  "মুদি দোকান",
  "ঔষধের দোকান",
  "কাপড়ের দোকান",
  "ইলেকট্রনিক্স",
  "হার্ডওয়্যার",
  "খাবারের দোকান",
  "সবজি/ফলের দোকান",
  "অন্যান্য",
];

export default function OnboardingPage() {
  const [shopName, setShopName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [pincode, setPincode] = useState("");
  const [shopType, setShopType] = useState(SHOP_TYPES[0]);
  const [yearsInBusiness, setYearsInBusiness] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
      return;
    }
    if (password !== confirmPassword) {
      setError("দুটো পাসওয়ার্ড মিলছে না।");
      return;
    }

    setSubmitting(true);
    try {
      const user = auth.currentUser;
      const uid = user.uid;

      await updateDoc(doc(db, "shopkeepers", uid), {
        shopName,
        ownerName,
        shopAddress: `${street}, ${city}, ${stateVal} - ${pincode}`,
        address: { street, city, state: stateVal, pincode },
        shopType,
        yearsInBusiness: yearsInBusiness ? Number(yearsInBusiness) : null,
      });

      const digits = user.phoneNumber.replace(/\D/g, "").slice(-10);
      const pseudoEmail = `${digits}@halkhata.app`;
      try {
        const cred = EmailAuthProvider.credential(pseudoEmail, password);
        await linkWithCredential(user, cred);
      } catch (linkErr) {
        console.warn("Password link skipped:", linkErr.code);
      }

      await updateDoc(doc(db, "users", uid), { hasPassword: true }).catch(() => {});

      window.location.href = "/dashboard";
    } catch (err) {
      console.error(err);
      setError("সেভ করা যায়নি, আবার চেষ্টা করুন।");
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 20, maxWidth: 400, margin: "auto" }}>
      <h2>দোকানের তথ্য দিন</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="দোকানের নাম"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="মালিকের নাম"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          required
          style={inputStyle}
        />

        <select value={shopType} onChange={(e) => setShopType(e.target.value)} style={inputStyle}>
          {SHOP_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="কতদিন ধরে ব্যবসা করছেন (বছর)"
          value={yearsInBusiness}
          onChange={(e) => setYearsInBusiness(e.target.value)}
          min="0"
          style={inputStyle}
        />

        <input
          type="text"
          placeholder="রাস্তা/এলাকা"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="শহর"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="রাজ্য"
          value={stateVal}
          onChange={(e) => setStateVal(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="পিনকোড"
          value={pincode}
          onChange={(e) => setPincode(e.target.value)}
          required
          style={inputStyle}
        />

        <hr style={{ margin: "16px 0", borderColor: "#333" }} />
        <p style={{ fontSize: 13, color: "#999", marginBottom: 8 }}>
          একটা পাসওয়ার্ড সেট করুন — পরের বার OTP ছাড়াই লগইন করতে পারবেন।
        </p>
        <input
          type="password"
          placeholder="পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="পাসওয়ার্ড আবার লিখুন"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          style={inputStyle}
        />

        <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
          {submitting ? "সেভ হচ্ছে..." : "সেভ করুন"}
        </button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
    </div>
  );
}

const inputStyle = { display: "block", width: "100%", marginBottom: 10, padding: 8 };