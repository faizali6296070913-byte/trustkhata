"use client";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const uid = auth.currentUser.uid;

      await updateDoc(doc(db, "shopkeepers", uid), {
        shopName,
        ownerName,
        shopAddress: `${street}, ${city}, ${stateVal} - ${pincode}`,
        address: {
          street,
          city,
          state: stateVal,
          pincode,
        },
        shopType,
        yearsInBusiness: yearsInBusiness ? Number(yearsInBusiness) : null,
      });

      window.location.href = "/dashboard";
    } catch (err) {
      setError(err.message);
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
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />
        <input
          type="text"
          placeholder="মালিকের নাম"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          required
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        />

        <select
          value={shopType}
          onChange={(e) => setShopType(e.target.value)}
          style={{ display: "block", width: "100%", marginBottom: 10, padding: 8 }}
        >
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

        <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
          {submitting ? "সেভ হচ্ছে..." : "সেভ করুন"}
        </button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
    </div>
  );
}