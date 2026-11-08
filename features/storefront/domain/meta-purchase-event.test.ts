import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildMetaPurchaseEvent,
  hashEmail,
  hashPhone,
  sanitizeClientIp,
  sanitizeMetaCookie,
  sanitizeUserAgent,
} from "@/features/storefront/domain/meta-purchase-event";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

describe("hashEmail", () => {
  it("normalises case and whitespace before hashing", () => {
    expect(hashEmail("  Ayse.Yilmaz@Example.COM ")).toBe(sha("ayse.yilmaz@example.com"));
  });
  it("refuses anything that is not an e-mail", () => {
    expect(hashEmail(null)).toBeNull();
    expect(hashEmail("")).toBeNull();
    expect(hashEmail("not-an-email")).toBeNull();
  });
});

describe("hashPhone", () => {
  it("hashes every Turkish input shape as 90 + subscriber digits, no plus", () => {
    const expected = sha("905321234567");
    expect(hashPhone("+905321234567")).toBe(expected);
    expect(hashPhone("0532 123 45 67")).toBe(expected);
    expect(hashPhone("532 123 45 67")).toBe(expected);
  });
  it("refuses an invalid or missing number", () => {
    expect(hashPhone(null)).toBeNull();
    expect(hashPhone("12345")).toBeNull();
  });
});

describe("sanitizeMetaCookie", () => {
  it("keeps Meta's own cookie format", () => {
    expect(sanitizeMetaCookie("fb.1.1730000000000.1234567890")).toBe("fb.1.1730000000000.1234567890");
    expect(sanitizeMetaCookie("fb.1.1730000000000.IwAR2abc-DEF_ghi")).toBe("fb.1.1730000000000.IwAR2abc-DEF_ghi");
  });
  it("drops anything else", () => {
    expect(sanitizeMetaCookie(undefined)).toBeNull();
    expect(sanitizeMetaCookie("random")).toBeNull();
    expect(sanitizeMetaCookie("fb.1.123.value with space")).toBeNull();
    expect(sanitizeMetaCookie(`fb.1.1730000000000.${"a".repeat(700)}`)).toBeNull();
  });
});

describe("sanitizeClientIp / sanitizeUserAgent", () => {
  it("takes the first forwarded address only when it is an IP", () => {
    expect(sanitizeClientIp("88.230.1.2, 10.0.0.1")).toBe("88.230.1.2");
    expect(sanitizeClientIp("2a02:ff0::1")).toBe("2a02:ff0::1");
    expect(sanitizeClientIp("unknown")).toBeNull();
    expect(sanitizeClientIp(null)).toBeNull();
  });
  it("caps the user agent and drops a blank one", () => {
    expect(sanitizeUserAgent("x".repeat(600))).toHaveLength(512);
    expect(sanitizeUserAgent("  ")).toBeNull();
  });
});

describe("buildMetaPurchaseEvent", () => {
  const purchase = {
    orderNumber: "261108-K-01050",
    totalMinor: 124_550,
    items: [
      { productKey: "yumurta-30", quantity: 2 },
      { productKey: "dut-pekmezi", quantity: 1.5 },
    ],
  };

  it("carries the same dedupe key as the browser Pixel and the server-side amount", () => {
    const event = buildMetaPurchaseEvent({
      purchase,
      signals: {
        emailHash: "a".repeat(64),
        phoneHash: "b".repeat(64),
        fbp: "fb.1.1730000000000.111",
        fbc: "fb.1.1730000000000.IwAR",
        clientIp: "88.230.1.2",
        userAgent: "Mozilla/5.0",
      },
      eventTimeMs: 1_794_000_000_999,
      eventSourceUrl: "https://apuhanciftligi.com/odeme",
    });

    expect(event).toEqual({
      event_name: "Purchase",
      event_time: 1_794_000_000,
      event_id: "purchase:261108-K-01050",
      action_source: "website",
      event_source_url: "https://apuhanciftligi.com/odeme",
      user_data: {
        em: ["a".repeat(64)],
        ph: ["b".repeat(64)],
        fbp: "fb.1.1730000000000.111",
        fbc: "fb.1.1730000000000.IwAR",
        client_ip_address: "88.230.1.2",
        client_user_agent: "Mozilla/5.0",
      },
      custom_data: {
        currency: "TRY",
        value: 1245.5,
        order_id: "261108-K-01050",
        content_type: "product",
        content_ids: ["yumurta-30", "dut-pekmezi"],
        contents: [
          { id: "yumurta-30", quantity: 2 },
          { id: "dut-pekmezi", quantity: 1.5 },
        ],
        num_items: 2,
      },
    });
  });

  it("leaves out every signal it does not have", () => {
    const event = buildMetaPurchaseEvent({
      purchase,
      signals: { emailHash: null, phoneHash: null, fbp: null, fbc: null, clientIp: null, userAgent: null },
      eventTimeMs: 0,
      eventSourceUrl: "https://apuhanciftligi.com/odeme",
    });
    expect(event.user_data).toEqual({});
  });
});
