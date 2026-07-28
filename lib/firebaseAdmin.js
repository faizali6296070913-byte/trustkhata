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

// ---- OTP-verified idToken থেকে phone number বের করা (self-service, admin লাগে না) ----
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

// ---- নতুন: pseudoEmail এর কোনো পুরনো/এতিম (orphan) একাউন্ট থাকলে মুছে ফেলা ----
async function deleteOrphanAccountByEmail(email) {
  const { accessToken, projectId } = await getAccessToken();

  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email: [email] }),
    }
  );
  const lookupData = await lookupRes.json();

  if (lookupData.users && lookupData.users.length > 0) {
    const orphanLocalId = lookupData.users[0].localId;
    await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:delete`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ localId: orphanLocalId }),
      }
    );
  }
}

// ---- মূল ফাংশন: OTP-verified একাউন্টেই সরাসরি email+password link/set করা ----
export async function linkPasswordToCurrentAccount(idToken, email, password) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  const doUpdate = async () => {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, email, password, returnSecureToken: false }),
      }
    );
    const data = await res.json();
    return { ok: res.ok, data };
  };

  let result = await doUpdate();

  // ---- যদি এই email আগে থেকেই অন্য (এতিম) একাউন্টে ব্যবহৃত থাকে, সেটা মুছে আবার চেষ্টা করা ----
  if (!result.ok && result.data?.error?.message?.includes("EMAIL_EXISTS")) {
    await deleteOrphanAccountByEmail(email);
    result = await doUpdate();
  }

  if (!result.ok) {
    throw new Error("Failed to set password: " + JSON.stringify(result.data));
  }
  return result.data;
}