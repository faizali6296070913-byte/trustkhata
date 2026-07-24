export function getFriendlyAuthError(err) {
  const code = err?.code || "";

  switch (code) {
    case "auth/too-many-requests":
      return "আপনি অনেকবার চেষ্টা করেছেন। অনুগ্রহ করে ৩০ মিনিট থেকে ২ ঘণ্টা পর আবার চেষ্টা করুন। এর মধ্যে দোকানের পাঠানো WhatsApp লিংক থেকেও কাজ চালাতে পারবেন।";
    case "auth/invalid-phone-number":
      return "সঠিক ফোন নাম্বার দিন (১০ ডিজিট)।";
    case "auth/invalid-verification-code":
      return "ভুল OTP কোড, আবার চেষ্টা করুন।";
    case "auth/code-expired":
      return "OTP এর মেয়াদ শেষ হয়ে গেছে, আবার নতুন করে OTP চান।";
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "ভুল ফোন নাম্বার বা পাসওয়ার্ড।";
    case "auth/user-not-found":
      return "এই নাম্বারে কোনো পাসওয়ার্ড সেট করা নেই। OTP দিয়ে লগইন করুন।";
    case "auth/email-already-in-use":
    case "auth/credential-already-in-use":
      return "এই ফোন নাম্বারের জন্য আগেই পাসওয়ার্ড সেট করা আছে।";
    case "auth/network-request-failed":
      return "ইন্টারনেট সংযোগে সমস্যা হচ্ছে, আবার চেষ্টা করুন।";
    default:
      return "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।";
  }
}