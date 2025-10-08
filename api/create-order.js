import md5 from "md5";

export default async function handler(req, res) {
  try {
    const { amount, remark } = req.query;

    const app_id = process.env.LG_APP_ID;
    const secret = process.env.LG_SECRET_KEY;
    const notify_url = process.env.NOTIFY_URL;
    const gateway = process.env.GATEWAY_URL;

    // ✅ Step 1: Sign Generate
    const sign = md5(
      `app_id=${app_id}&amount=${amount}&remark=${remark}&key=${secret}`
    );

    // ✅ Step 2: Request body তৈরি
    const payload = {
      app_id: app_id,
      amount: amount,
      remark: remark,
      notify_url: notify_url,
      sign: sign,
    };

    // ✅ Step 3: API Call
    const response = await fetch(gateway, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    // ✅ Step 4: Return result
    res.status(200).json({ raw_text: text, parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
