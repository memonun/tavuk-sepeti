import { describe, expect, it } from "vitest";

import { classifyFinanceChannel } from "@/features/finance/domain/finance-channel";

describe("classifyFinanceChannel", () => {
  it("classifies a plain hand-delivered order as local_delivery", () => {
    expect(
      classifyFinanceChannel({
        fulfillmentChannel: "delivery",
        recurringTemplateId: null,
        customerAccountType: "individual",
        customerOrderType: "retail",
      }),
    ).toBe("local_delivery");
  });

  it("classifies a cargo-shipped order as cargo", () => {
    expect(
      classifyFinanceChannel({
        fulfillmentChannel: "shipping",
        recurringTemplateId: null,
        customerAccountType: "individual",
        customerOrderType: null,
      }),
    ).toBe("cargo");
  });

  it("classifies an order generated from a recurring template as recurring", () => {
    expect(
      classifyFinanceChannel({
        fulfillmentChannel: "delivery",
        recurringTemplateId: "tmpl-1",
        customerAccountType: "individual",
        customerOrderType: null,
      }),
    ).toBe("recurring");
  });

  it("classifies a business-account customer's order as wholesale even when hand-delivered", () => {
    expect(
      classifyFinanceChannel({
        fulfillmentChannel: "delivery",
        recurringTemplateId: null,
        customerAccountType: "business",
        customerOrderType: null,
      }),
    ).toBe("wholesale");
  });

  it("classifies a wholesale order_type customer's order as wholesale", () => {
    expect(
      classifyFinanceChannel({
        fulfillmentChannel: "delivery",
        recurringTemplateId: null,
        customerAccountType: "individual",
        customerOrderType: "wholesale",
      }),
    ).toBe("wholesale");
  });

  it("gives wholesale priority over a recurring template on the same order", () => {
    // A B2B customer's weekly egg order is itself a recurring template —
    // it should still report as Toptan Satış, not Düzenli Sipariş.
    expect(
      classifyFinanceChannel({
        fulfillmentChannel: "delivery",
        recurringTemplateId: "tmpl-wholesale-eggs",
        customerAccountType: "business",
        customerOrderType: null,
      }),
    ).toBe("wholesale");
  });

  it("gives wholesale priority over the cargo channel", () => {
    expect(
      classifyFinanceChannel({
        fulfillmentChannel: "shipping",
        recurringTemplateId: null,
        customerAccountType: "business",
        customerOrderType: null,
      }),
    ).toBe("wholesale");
  });

  it("gives recurring priority over cargo when the customer is not wholesale", () => {
    expect(
      classifyFinanceChannel({
        fulfillmentChannel: "shipping",
        recurringTemplateId: "tmpl-1",
        customerAccountType: "individual",
        customerOrderType: null,
      }),
    ).toBe("recurring");
  });
});
