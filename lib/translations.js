// ---- এখানে প্রতিটা লেখার বাংলা ও ইংরেজি দুইটা ভার্সন থাকবে ----
// ---- প্রতিটা পেজ অনুবাদ করার সময় এই লিস্টে নতুন করে যোগ হবে ----
export const translations = {
  bn: {
    loading: "লোড হচ্ছে...",
    login: "লগইন",
    logout: "লগ আউট",
    welcome: "স্বাগতম",

    // ---- dashboard: উপরের অংশ ----
    settingsTitle: "সেটিংস",
    statusLabel: "স্ট্যাটাস",
    newCreditToday: "আজ নতুন বাকি",
    paidToday: "আজ পরিশোধিত",
    customersToday: "আজকের কাস্টমার",
    recentActivity: "সাম্প্রতিক কার্যক্রম",

    // ---- dashboard: নতুন ক্রেডিট রিকোয়েস্ট ফর্ম ----
    newCreditRequest: "নতুন ক্রেডিট রিকোয়েস্ট",
    quickSelect: "দ্রুত বেছে নিন:",
    customerPhonePlaceholder: "কাস্টমারের ফোন (যেমন 9876543210)",
    checkingScore: "স্কোর চেক হচ্ছে...",
    notRegisteredCustomer: "এই নম্বরে এখনো কোনো কাস্টমার অ্যাপে নিবন্ধিত (registered) নয়।",
    score: "স্কোর",
    shopVerified: "দোকানদার-যাচাইকৃত",
    redFlagWarning: "Red Flag — এই কাস্টমার বারবার রিকোয়েস্ট রিজেক্ট করেছে",
    overdueWarningPrefix: "এই কাস্টমারের",
    overdueWarningSuffix: "টা বাকি মেয়াদ পার হয়ে গেছে (এই বা অন্য দোকানে) — সাবধানে বাকি দিন",
    customerBlockedWarning: "এই কাস্টমারকে Admin ব্লক করে রেখেছেন — নতুন ক্রেডিট রিকোয়েস্ট পাঠানো যাবে না",
  },
  en: {
    loading: "Loading...",
    login: "Login",
    logout: "Log Out",
    welcome: "Welcome",

    // ---- dashboard: top section ----
    settingsTitle: "Settings",
    statusLabel: "Status",
    newCreditToday: "New Credit Today",
    paidToday: "Paid Today",
    customersToday: "Today's Customers",
    recentActivity: "Recent Activity",

    // ---- dashboard: new credit request form ----
    newCreditRequest: "New Credit Request",
    quickSelect: "Quick select:",
    customerPhonePlaceholder: "Customer's phone (e.g. 9876543210)",
    checkingScore: "Checking score...",
    notRegisteredCustomer: "No customer is registered on the app with this number yet.",
    score: "Score",
    shopVerified: "Shopkeeper-verified",
    redFlagWarning: "Red Flag — this customer has repeatedly rejected requests",
    overdueWarningPrefix: "This customer has",
    overdueWarningSuffix: "overdue entries (at this or another shop) — proceed carefully",
    customerBlockedWarning: "This customer has been blocked by Admin — a new credit request can't be sent",
  },
};