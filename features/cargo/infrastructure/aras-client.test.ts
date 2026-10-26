/**
 * The Aras client builds SOAP by hand, so check the two things that can go
 * wrong silently: values are XML-escaped on the way out, and the result code
 * is read from Aras's reply shape (taken from the service's WSDL).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { sendArasOrder, cancelArasDispatch } = await import(
  "@/features/cargo/infrastructure/aras-client"
);

const creds = { username: "user", password: "p&ss<1>", testMode: true };
const order = {
  integrationCode: "26081800477",
  tradingWaybillNumber: "26081800477",
  receiverName: "Ayşe & Ali",
  receiverAddress: "Kızılay Mah. <Blok A>",
  receiverPhone: "5321234567",
  cityName: "Ankara",
  townName: "Çankaya",
  quarterName: null,
};

function reply(body: string, status = 200) {
  return new Response(
    `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>${body}</soap:Body></soap:Envelope>`,
    { status },
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("sendArasOrder", () => {
  it("posts an escaped SetOrder envelope to the test endpoint and reads the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(
        '<SetOrderResponse xmlns="http://tempuri.org/"><SetOrderResult><OrderResultInfo><ResultCode>0</ResultCode><ResultMessage>Başarılı</ResultMessage></OrderResultInfo></SetOrderResult></SetOrderResponse>',
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendArasOrder(creds, order);

    expect(result).toEqual({ ok: true, value: { resultCode: "0", resultMessage: "Başarılı" } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("customerservicestest.araskargo.com.tr");
    expect(init.headers).toMatchObject({ SOAPAction: '"http://tempuri.org/SetOrder"' });
    const body = String(init.body);
    expect(body).toContain("<ReceiverName>Ayşe &amp; Ali</ReceiverName>");
    expect(body).toContain("<ReceiverAddress>Kızılay Mah. &lt;Blok A&gt;</ReceiverAddress>");
    expect(body).toContain("<Password>p&amp;ss&lt;1&gt;</Password>");
    expect(body).not.toContain("ReceiverQuarterName");
  });

  it("passes Aras's rejection message through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        reply(
          "<SetOrderResponse><SetOrderResult><OrderResultInfo><ResultCode>936</ResultCode><ResultMessage>İl / İlçe ismi boş bırakılamaz</ResultMessage></OrderResultInfo></SetOrderResult></SetOrderResponse>",
        ),
      ),
    );

    const result = await sendArasOrder(creds, order);

    expect(result).toEqual({
      ok: true,
      value: { resultCode: "936", resultMessage: "İl / İlçe ismi boş bırakılamaz" },
    });
  });

  it("returns an error on an HTTP failure or an unreadable reply", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("<soap:Fault/>", 500)));
    expect((await sendArasOrder(creds, order)).ok).toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply("<Something/>")));
    expect((await sendArasOrder(creds, order)).ok).toBe(false);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect((await sendArasOrder(creds, order)).ok).toBe(false);
  });
});

describe("cancelArasDispatch", () => {
  it("reads the CancelDispatch result against the live endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply(
        "<CancelDispatchResponse><CancelDispatchResult><ResultCode>999</ResultCode><ResultMessage>İptal edilemez</ResultMessage></CancelDispatchResult></CancelDispatchResponse>",
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await cancelArasDispatch({ ...creds, testMode: false }, "26081800477");

    expect(result).toEqual({ ok: true, value: { resultCode: "999", resultMessage: "İptal edilemez" } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://customerws.araskargo.com.tr/arascargoservice.asmx");
  });
});
