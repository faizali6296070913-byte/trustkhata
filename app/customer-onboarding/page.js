"use client";
import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

export default function CustomerOnboardingPage() {
  const [name, setName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [pincode, setPincode] = useState("");
  const [altPhone, setAltPhone] = useState("");
  const [occupation, setOccupation] = useState("");
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
    setSubmitting(true);
    setError("");
    try {
      const user = auth.currentUser;
      const digits = user.phoneNumber.replace(/\D/g, "");

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
        <button type="submit" disabled={submitting} style={{ width: "100%", padding: 10 }}>
          {submitting ? "সেভ হচ্ছে..." : "সেভ করুন"}
        </button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>
    </div>
  );
}