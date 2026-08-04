import { getAccessToken } from "@/lib/firebaseAdmin";

// ---- আপনার নতুন (Mumbai region) named ডেটাবেসের নাম ----
const DATABASE_ID = "trustkhata-mumbai";

// ---- সাধারণ JS মান কে Firestore REST API এর নিজস্ব ফরম্যাটে রূপান্তর করা ----
// ---- বাগ ফিক্স: আগে এই ফাংশন শুধু string/number/boolean/Date সাপোর্ট করত —
// array (যেমন "payments" লিস্ট) বা nested object দিলে ক্র্যাশ করত। এখন array ও
// object দুটোই recursively (নিজে নিজের ভেতরেই) handle করা হচ্ছে। ----
function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    const fields = {};
    for (const key in value) fields[key] = toFirestoreValue(value[key]);
    return { mapValue: { fields } };
  }
  throw new Error("Unsupported value type for Firestore REST conversion: " + typeof value);
}

// ---- Firestore REST API থেকে আসা মানকে সাধারণ JS মানে ফিরিয়ে আনা ----
function fromFirestoreValue(v) {
  if (!v) return null;
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return new Date(v.timestampValue);
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return fromFirestoreFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(fromFirestoreValue);
  return null;
}

function fromFirestoreFields(fields) {
  const obj = {};
  for (const key in fields) obj[key] = fromFirestoreValue(fields[key]);
  return obj;
}

function buildFieldFilter({ field, op, value }) {
  return {
    fieldFilter: {
      field: { fieldPath: field },
      op,
      value: toFirestoreValue(value),
    },
  };
}

/**
 * একটা কালেকশনে (Admin অধিকার দিয়ে) নির্দিষ্ট শর্ত অনুযায়ী document খুঁজে বের করা।
 * whereFilters = [{ field: "status", op: "EQUAL", value: "approved" }, ...]
 */
export async function runQuery(collectionId, whereFilters = []) {
  const { accessToken, projectId } = await getAccessToken();
  const structuredQuery = { from: [{ collectionId }] };

  if (whereFilters.length === 1) {
    structuredQuery.where = buildFieldFilter(whereFilters[0]);
  } else if (whereFilters.length > 1) {
    structuredQuery.where = {
      compositeFilter: { op: "AND", filters: whereFilters.map(buildFieldFilter) },
    };
  }

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE_ID}/documents:runQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ structuredQuery }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error("Firestore query failed: " + JSON.stringify(data));

  return data
    .filter((row) => row.document)
    .map((row) => {
      const id = row.document.name.split("/").pop();
      return { id, ...fromFirestoreFields(row.document.fields || {}) };
    });
}

// ---- একটা নির্দিষ্ট document পড়া ----
export async function getDocument(collectionId, docId) {
  const { accessToken, projectId } = await getAccessToken();
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE_ID}/documents/${collectionId}/${docId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error("Firestore get failed: " + JSON.stringify(data));
  return fromFirestoreFields(data.fields || {});
}

// ---- একটা document এর নির্দিষ্ট কিছু ফিল্ড আপডেট করা (বাকি ফিল্ড অক্ষত থাকবে) ----
export async function patchDocument(collectionId, docId, updates) {
  const { accessToken, projectId } = await getAccessToken();
  const fields = {};
  for (const key in updates) fields[key] = toFirestoreValue(updates[key]);

  const maskParams = Object.keys(updates)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");

  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${DATABASE_ID}/documents/${collectionId}/${docId}?${maskParams}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ fields }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error("Firestore patch failed: " + JSON.stringify(data));
  return data;
}