// api/create-order.js
// Vercel Serverless Function (Node.js)
// Usage: GET /api/create-order?amount=49.99&remark=TOPUP123
// Make sure to set LG_APP_ID and LG_SECRET_KEY in Vercel Environment Variables

import { createHash } from "crypto";

export default async function handler(req, res) {
  try {
    const params = req.method === "GET" ? req.query : req.body;

    // 1) validate amount
    const rawAmount = params.amount;
    if (!rawAmount) return res.status(400).json({ error: "missing amount" });

    const amount = parseFloat(rawAmount);
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "invalid amount" });

    // optional min/max rules
    const MIN = 1.0, MAX = 100000.0;
    if (amount < MIN || amount > MAX) return res.status(400).json({ error: `amount must be between ${MIN} and ${MAX}` });

    // 2) env secrets
    const APP_ID = process.env.LG_APP_ID;
    const SECRET_KEY = process.env.LG_SECRET_KEY;
    const NOTIFY_URL = process.env.NOTIFY_URL || "";
    const GATEWAY_URL = process.env.GATEWAY_URL || "https://www.lg-pay.com/api/order/create";

    if (!APP_ID || !SECRET_KEY) {
      console.error("Missing LG_APP_ID or LG_SECRET_KEY in env");
      return res.status(500).json({ error: "server misconfigured" });
    }

    // 3) prepare payload (money in paise)
    const money = Math.round(amount * 100); // INR -> paise
    const order_sn = "p" + Date.now() + Math.floor(Math.random() * 900 + 100);
    const remark = params.remark ? String(params.remark).substring(0, 200) : "web-order";

    const data = {
      app_id: APP_ID,
      trade_type: "WEB",
      order_sn: order_sn,
      money: money,
      notify_url: NOTIFY_URL,
      ip: req.headers["x-forwarded-for"]?.split(",")?.[0] || req.socket.remoteAddress || "0.0.0.0",
      remark: remark,
      currency: "INR"
    };

    // 4) build signature: ksort -> join -> &key=SECRET -> md5 uppercase
    const keys = Object.keys(data).sort();
    const parts = keys.map(k => `${k}=${data[k]}`);
    const base = parts.join("&") + "&key=" + SECRET_KEY;
    const sign = createHash("md5").update(base).digest("hex").toUpperCase();
    data.sign = sign;

    // 5) send POST to gateway (application/x-www-form-urlencoded)
    const formBody = new URLSearchParams();
    for (const k of Object.keys(data)) formBody.append(k, data[k]);

    const gatewayRes = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody.toString()
    });

    const text = await gatewayRes.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { json = null; }

    // 6) extract pay_url from gateway response
    let payUrl = null;
    if (json) {
      if (json.data && (json.data.pay_url || json.data.url)) payUrl = json.data.pay_url || json.data.url;
      else if (json.pay_url) payUrl = json.pay_url;
    }
    // fallback to Location header if gateway returned redirect
    const location = gatewayRes.headers.get("location");
    if (!payUrl && location) payUrl = location;

    console.log("create-order:", { order_sn, money, gatewayStatus: gatewayRes.status, payUrl });

    // 7) if pay_url exists -> redirect user
    if (payUrl) {
      res.writeHead(302, { Location: payUrl });
      return res.end();
    }

    // 8) else, return raw gateway response for debugging
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json({ raw_text: text, parsed: json });

  } catch (err) {
    console.error("create-order error:", err);
    return res.status(500).json({ error: "internal_error", detail: err.message });
  }
      }
