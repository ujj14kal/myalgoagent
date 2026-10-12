import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { razorpayKeys, razorpayMode, verifyOrderPayment, verifySubscriptionPayment, verifyWebhook } from "./razorpay";

const sig = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

describe("signatures", () => {
  it("accepts a genuine subscription payment and rejects any change", () => {
    const s = sig("keysecret", "pay_1|sub_1");
    expect(verifySubscriptionPayment({ paymentId: "pay_1", subscriptionId: "sub_1", signature: s }, "keysecret")).toBe(true);
    expect(verifySubscriptionPayment({ paymentId: "pay_2", subscriptionId: "sub_1", signature: s }, "keysecret")).toBe(false);
    expect(verifySubscriptionPayment({ paymentId: "pay_1", subscriptionId: "sub_1", signature: s }, "other")).toBe(false);
    expect(verifySubscriptionPayment({ paymentId: "pay_1", subscriptionId: "sub_1", signature: "" }, "keysecret")).toBe(false);
  });
  it("checks a top-up order the other way round (order|payment)", () => {
    const s = sig("keysecret", "order_1|pay_1");
    expect(verifyOrderPayment({ orderId: "order_1", paymentId: "pay_1", signature: s }, "keysecret")).toBe(true);
    expect(verifyOrderPayment({ orderId: "pay_1", paymentId: "order_1", signature: s }, "keysecret")).toBe(false);
  });
  it("accepts a webhook only with the right secret over the exact body", () => {
    const body = '{"event":"subscription.charged"}';
    const s = sig("whsecret", body);
    expect(verifyWebhook(body, s, "whsecret")).toBe(true);
    expect(verifyWebhook(body + " ", s, "whsecret")).toBe(false);
    expect(verifyWebhook(body, s, undefined)).toBe(false); // no secret configured: nothing is believed
    expect(verifyWebhook(body, null, "whsecret")).toBe(false);
  });
});

describe("keys", () => {
  it("needs both keys, and tells test from live", () => {
    expect(razorpayKeys({ RAZORPAY_KEY_ID: "rzp_test_x" } as never)).toBeNull();
    expect(razorpayKeys({ RAZORPAY_KEY_ID: "rzp_test_x", RAZORPAY_KEY_SECRET: "s" } as never)).toEqual({ keyId: "rzp_test_x", keySecret: "s" });
    expect(razorpayMode("rzp_test_abc")).toBe("test");
    expect(razorpayMode("rzp_live_abc")).toBe("live");
  });
});
