export async function POST(request) {
  try {
    const { phone, link } = await request.json();

    const message = `আপনার একটি বাকি অনুরোধ এসেছে। অনুমোদন বা প্রত্যাখ্যান করতে এখানে ক্লিক করুন: ${link}`;

    const cleanPhone = phone.replace(/\D/g, "").slice(-10);

    const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "q",
        message: message,
        numbers: cleanPhone,
      }),
    });

    const data = await response.json();

    // Fast2SMS থেকে আসল কারণটা টার্মিনালে দেখাও
    console.log("Fast2SMS response:", JSON.stringify(data));

    if (data.return === true) {
      return Response.json({ success: true });
    } else {
      return Response.json({ success: false, error: data }, { status: 400 });
    }
  } catch (err) {
    console.error("SMS route এরর:", err);
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}