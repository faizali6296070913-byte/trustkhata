export function getFriendlyAuthError(error) {
  const code = error?.code || "";

  const messages = {
    "auth/invalid-email": "সঠিক ইমেইল/ফোন নম্বর দিন।",
    "auth/user-not-found": "এই একাউন্ট খুঁজে পাওয়া যায়নি।",
    "auth/wrong-password": "পাসওয়ার্ড সঠিক নয়।",
    "auth/invalid-credential": "লগইন তথ্য সঠিক নয়।",
    "auth/too-many-requests": "অনেকবার চেষ্টা করা হয়েছে, কিছুক্ষণ পর আবার চেষ্টা করুন।",
    "auth/network-request-failed": "ইন্টারনেট সংযোগ চেক করুন।",
    "auth/invalid-phone-number": "সঠিক ফোন নম্বর দিন।",
    "auth/missing-phone-number": "ফোন নম্বর দিতে হবে।",
    "auth/code-expired": "OTP কোডের মেয়াদ শেষ, নতুন কোড চান।",
    "auth/invalid-verification-code": "OTP কোডটি সঠিক নয়।",
    "auth/weak-password": "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।",
    "auth/email-already-in-use": "এই ইমেইল/নম্বর দিয়ে আগেই একাউন্ট আছে।",
    "auth/user-disabled": "এই একাউন্টটি বন্ধ করা হয়েছে।",
  };

  return messages[code] || "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।";
}
