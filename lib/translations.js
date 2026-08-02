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

    // ---- dashboard: টাকা/মেয়াদ/বিবরণ ফর্ম ও WhatsApp লিংক ----
    amountPlaceholder: "টাকার পরিমাণ",
    invalidAmountWarning: "সঠিক পরিমাণ লিখুন (০ এর বেশি)",
    dueDaysLabel: "কতদিনের মধ্যে মেটাতে হবে (দিন)",
    dueDaysPlaceholder: "যেমন ৩০",
    itemDetailsPlaceholder: "জিনিসের বিবরণ (ঐচ্ছিক)",
    iKnowThisPerson: "আমি এই ব্যক্তিকে সরাসরি চিনি ও শনাক্ত করেছি",
    cannotSendToBlocked: "এই কাস্টমারকে রিকোয়েস্ট পাঠানো যাবে না",
    sending: "পাঠানো হচ্ছে...",
    sendRequest: "রিকোয়েস্ট পাঠান",
    whatsappCreditMessage: "আপনার একটি বাকি অনুরোধ এসেছে। অনুমোদন বা প্রত্যাখ্যান করতে এখানে ক্লিক করুন:",
    sendViaWhatsapp: "WhatsApp এ পাঠান",
    copied: "কপি হয়েছে!",
    copyLinkNoWhatsapp: "লিংক কপি করুন (WhatsApp না থাকলে)",
    customerCanSeeRequestNote: "কাস্টমার নিজের একাউন্টে লগইন করলেও এই রিকোয়েস্ট সরাসরি দেখতে পাবেন।",
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

    // ---- dashboard: amount/due days/details form & WhatsApp link ----
    amountPlaceholder: "Amount",
    invalidAmountWarning: "Enter a valid amount (more than 0)",
    dueDaysLabel: "Due within how many days",
    dueDaysPlaceholder: "e.g. 30",
    itemDetailsPlaceholder: "Item details (optional)",
    iKnowThisPerson: "I personally know and have verified this person",
    cannotSendToBlocked: "Request can't be sent to this customer",
    sending: "Sending...",
    sendRequest: "Send Request",
    whatsappCreditMessage: "You have a new credit request. Click here to approve or reject:",
    sendViaWhatsapp: "Send via WhatsApp",
    copied: "Copied!",
    copyLinkNoWhatsapp: "Copy Link (if no WhatsApp)",
    customerCanSeeRequestNote: "The customer will also see this request directly after logging into their own account.",
};