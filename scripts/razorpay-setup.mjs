#!/usr/bin/env node
// One-off, safe to repeat: makes the two monthly plans in Razorpay (using the keys in .env.local — rzp_test_… = test mode) and
// puts the keys, the plan ids and a webhook secret into Parameter Store (/myalgoagent/app) for the website.
// Nothing here is printed except what was created; secrets are never shown.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]));
const keyId = env.RAZORPAY_KEY_ID, keySecret = env.RAZORPAY_KEY_SECRET;
if (!keyId || !keySecret) throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not in .env.local");
const mode = keyId.startsWith("rzp_live_") ? "LIVE" : "test";
if (mode === "LIVE" && process.argv[2] !== "--live") throw new Error("These are LIVE keys. Re-run with --live only when you mean to charge real money.");
const auth = "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
const api = async (path, body) => {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, { method: body ? "POST" : "GET", headers: { Authorization: auth, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error?.description ?? `Razorpay ${res.status}`);
  return j;
};

const PLANS = [
  { env: "RAZORPAY_PLAN_TRADE", name: "MyAlgoAgent Trade (monthly)", amount: 199900, description: "MyAlgoAgent Trade plan, billed monthly (GST included)" },
  { env: "RAZORPAY_PLAN_PRO", name: "MyAlgoAgent Pro (monthly)", amount: 349900, description: "MyAlgoAgent Pro plan, billed monthly (GST included)" },
];
const existing = (await api("/plans?count=100")).items;
const ids = {};
for (const p of PLANS) {
  const found = existing.find((e) => e.item.name === p.name && e.item.amount === p.amount);
  ids[p.env] = found ? found.id : (await api("/plans", { period: "monthly", interval: 1, item: { name: p.name, amount: p.amount, currency: "INR", description: p.description } })).id;
  console.log(`${mode} plan ${p.name}: ${found ? "already there" : "created"} (${ids[p.env]})`);
}

const put = (name, value, secure) => execFileSync("aws", ["ssm", "put-parameter", "--profile", "myalgoagent", "--region", "ap-south-1", "--name", `/myalgoagent/app/${name}`, "--type", secure ? "SecureString" : "String", "--value", value, "--overwrite"], { stdio: ["ignore", "ignore", "inherit"] });
put("RAZORPAY_KEY_ID", keyId, false);
put("RAZORPAY_KEY_SECRET", keySecret, true);
for (const [k, v] of Object.entries(ids)) put(k, v, false);
const existingWh = (() => { try { return execFileSync("aws", ["ssm", "get-parameter", "--profile", "myalgoagent", "--region", "ap-south-1", "--name", "/myalgoagent/app/RAZORPAY_WEBHOOK_SECRET", "--query", "Parameter.Value", "--output", "text"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return null; } })();
if (!existingWh) { put("RAZORPAY_WEBHOOK_SECRET", randomBytes(24).toString("hex"), true); console.log("webhook secret created in Parameter Store"); } else console.log("webhook secret already in Parameter Store");
console.log("saved to Parameter Store: key id, key secret, plan ids");
