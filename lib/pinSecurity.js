import crypto from "node:crypto";

// ---- নিরাপত্তা সেটিংস ----
export const MAX_PIN_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000; // ৫ বার ভুল হলে ১৫ মিনিট লক
export const PIN_EXPIRY_MS = 24 * 60 * 60 * 1000; // PIN জেনারেট হওয়ার ২৪ ঘন্টা পর মেয়াদ শেষ

// ---- ৪ সংখ্যার র‍্যান্ডম PIN তৈরি করা (সার্ভারে হয়, ব্রাউজারে না) ----
export function generatePinCode() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

// ---- PIN কে hash করা (আসল PIN কখনো ডাটাবেসে থাকবে না) ----
export function hashPin(pin) {
  return crypto.createHash("sha256").update(String(pin)).digest("hex");
}

// ---- নতুন PIN জেনারেট করার সময় যেসব ফিল্ড ডকুমেন্টে সেভ করতে হবে ----
export function createPinFields(pin) {
  return {
    pinHash: hashPin(pin),
    pinAttempts: 0,
    pinLockedUntil: null,
    pinGeneratedAt: new Date(),
  };
}

/**
 * PIN যাচাই করার আগে চেক করে — লক আছে কিনা, মেয়াদ শেষ কিনা।
 * doc = Firestore থেকে আসা ডকুমেন্ট ডেটা (pinHash, pinAttempts, pinLockedUntil, pinGeneratedAt সহ)
 */
export function checkPinGate(doc) {
  if (!doc.pinHash) {
    return { ok: false, reason: "কোনো PIN জেনারেট করা হয়নি।" };
  }

  const now = Date.now();

  // ---- লক করা আছে কিনা ----
  if (doc.pinLockedUntil) {
    const lockedUntilMs = new Date(doc.pinLockedUntil).getTime();
    if (now < lockedUntilMs) {
      const minutesLeft = Math.ceil((lockedUntilMs - now) / 60000);
      return {
        ok: false,
        reason: `অনেকবার ভুল PIN দেওয়া হয়েছে। আরও ${minutesLeft} মিনিট পর আবার চেষ্টা করুন।`,
      };
    }
  }

  // ---- PIN এর মেয়াদ শেষ কিনা ----
  if (doc.pinGeneratedAt) {
    const generatedMs = new Date(doc.pinGeneratedAt).getTime();
    if (now - generatedMs > PIN_EXPIRY_MS) {
      return {
        ok: false,
        reason: "এই PIN এর মেয়াদ শেষ হয়ে গেছে। দোকানদারকে নতুন PIN জেনারেট করতে বলুন।",
      };
    }
  }

  return { ok: true };
}

/**
 * এন্টার করা PIN সঠিক কিনা যাচাই করে।
 * সফল হলে { valid: true } এবং attempts রিসেট করার ফিল্ড দেয়।
 * ভুল হলে { valid: false } এবং নতুন attempt count / লক ফিল্ড দেয় (এটা patchDocument দিয়ে সেভ করতে হবে)।
 */
export function verifyPin(enteredPin, doc) {
  const gate = checkPinGate(doc);
  if (!gate.ok) {
    return { valid: false, reason: gate.reason, updateFields: null };
  }

  const enteredHash = hashPin(enteredPin);

  if (enteredHash === doc.pinHash) {
    return {
      valid: true,
      reason: null,
      // ---- সফল হলে PIN সংক্রান্ত সব ফিল্ড মুছে ফেলা হবে, যাতে একই PIN দিয়ে দ্বিতীয়বার কাজ না করে ----
      updateFields: {
        pinHash: null,
        pinAttempts: 0,
        pinLockedUntil: null,
        pinGeneratedAt: null,
      },
    };
  }

  // ---- ভুল হলে attempt count বাড়ানো ----
  const newAttempts = (doc.pinAttempts || 0) + 1;
  const updateFields = { pinAttempts: newAttempts };

  if (newAttempts >= MAX_PIN_ATTEMPTS) {
    updateFields.pinLockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
    return {
      valid: false,
      reason: "৫ বার ভুল PIN দেওয়া হয়েছে। ১৫ মিনিটের জন্য লক করা হলো।",
      updateFields,
    };
  }

  const remaining = MAX_PIN_ATTEMPTS - newAttempts;
  return {
    valid: false,
    reason: `ভুল PIN। আর ${remaining} বার চেষ্টা করতে পারবেন।`,
    updateFields,
  };
}