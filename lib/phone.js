// যেকোনো ফরম্যাটের ফোন নাম্বার (যেমন +919876543210, 9876543210, ০৯৮৭৬৫৪৩২১০)
// থেকে সবসময় একই ১০-ডিজিট নাম্বার বের করে — এটাই সব জায়গায় customer ID হিসেবে ব্যবহার হবে
export function normalizePhone(raw) {
  if (!raw) return "";
  const digitsOnly = raw.replace(/\D/g, "");
  return digitsOnly.slice(-10); // শুধু শেষ ১০টা ডিজিট রাখো
}