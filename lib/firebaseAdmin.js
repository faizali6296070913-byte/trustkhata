import crypto from "node:crypto";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getAccessToken() {
  const serviceAccountJson = Buffer.from(
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
    "base64"
  ).toString("utf-8");
  const serviceAccount = JSON.parse(serviceAccountJson);

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope:
      "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/firebase",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaim = base64url(JSON.stringify(claim));
  const signInput = `${encodedHeader}.${encodedClaim}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signInput);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key);
  const encodedSignature = signature
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const jwt = `${signInput}.${encodedSignature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error("Failed to get access token: " + JSON.stringify(data));
  }
  return { accessToken: data.access_token, projectId: serviceAccount.project_id };
}

// ---- OTP-verified idToken থেকে ইউজারের তথ্য বের করা ----
export async function verifyIdTokenREST(idToken) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    }
  );
  const data = await res.json();
  if (!res.ok || !data.users || data.users.length === 0) {
    throw new Error("Invalid token: " + JSON.stringify(data));
  }
  return data.users[0];
}

// ---- মূল ফাংশন: একই OTP-verified একাউন্টে password ও email set করা (দুইটা আলাদা ধাপে) ----
export async function linkPasswordToCurrentAccount(idToken, email, password) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  // ধাপ ১: শুধু password set করা (self-service API, email verification লাগবে না)
  const passwordRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idToken,
        password,
        returnSecureToken: false,
      }),
    }
  );
  const passwordData = await passwordRes.json();

  if (!passwordRes.ok) {
    throw new Error("Failed to set password: " + JSON.stringify(passwordData));
  }

  // ধাপ ২: Admin অধিকার দিয়ে email যুক্ত করা এবং সরাসরি verified করে দেওয়া
  try {
    const { accessToken, projectId } = await getAccessToken();

    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ idToken }),
      }
    );
    const lookupData = await lookupRes.json();
    const localId = lookupData.users?.[0]?.localId;

    if (localId) {
      await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ localId, email, emailVerified: true }),
        }
      );
    }
  } catch (emailErr) {
    console.warn("Email set skipped:", emailErr.message);
  }

  return passwordData;
}