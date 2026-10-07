/**
 * The download path is the SSRF boundary. DNS and the socket are mocked so the
 * guarantees can be pinned without a network: private answers are refused (even
 * mixed with a public one), the socket is pinned to the vetted address, every
 * redirect hop is re-checked, and the body is judged by its bytes.
 */
import { EventEmitter } from "node:events";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...a: unknown[]) => lookup(...a) }));

interface FakeResponse {
  status: number;
  headers?: Record<string, string>;
  body?: Uint8Array;
}
let responses: FakeResponse[] = [];
const requests: Array<{ host: string; path: string; pinned: () => Promise<string> }> = [];

vi.mock("node:https", () => ({
  request: (
    options: {
      host: string;
      path: string;
      lookup: (h: string, o: unknown, cb: (e: null, addr: string, fam: number) => void) => void;
    },
    onResponse: (res: EventEmitter & { statusCode: number; headers: Record<string, string>; resume: () => void; destroy: () => void }) => void,
  ) => {
    requests.push({
      host: options.host,
      path: options.path,
      pinned: () => new Promise((resolve) => options.lookup(options.host, {}, (_e, addr) => resolve(addr))),
    });
    const next = responses.shift() ?? { status: 500 };
    const req = new EventEmitter() as EventEmitter & { end: () => void };
    req.end = () => {
      const res = new EventEmitter() as EventEmitter & {
        statusCode: number;
        headers: Record<string, string>;
        resume: () => void;
        destroy: () => void;
      };
      res.statusCode = next.status;
      res.headers = next.headers ?? {};
      res.resume = () => undefined;
      res.destroy = () => undefined;
      onResponse(res);
      queueMicrotask(() => {
        if (next.body) res.emit("data", Buffer.from(next.body));
        res.emit("end");
      });
    };
    return req;
  },
}));

const { fetchRemoteImage } = await import("@/features/mcp/infrastructure/fetch-remote-image");

const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PUBLIC = [{ address: "93.184.216.34", family: 4 }];

describe("fetchRemoteImage", () => {
  beforeEach(() => {
    lookup.mockReset();
    responses = [];
    requests.length = 0;
  });

  it("downloads a public image, pinned to the vetted address, typed by its bytes", async () => {
    lookup.mockResolvedValue(PUBLIC);
    responses = [{ status: 200, headers: { "content-type": "text/html" }, body: JPEG }];

    const r = await fetchRemoteImage("https://cdn.example.com/a.jpg");

    expect(r.ok && r.value.type).toBe("image/jpeg");
    expect(await requests[0]?.pinned()).toBe("93.184.216.34");
  });

  it("refuses when DNS resolves to a private address, without connecting", async () => {
    lookup.mockResolvedValue([{ address: "10.0.0.7", family: 4 }]);
    const r = await fetchRemoteImage("https://evil.example.com/a.jpg");
    expect(r.ok).toBe(false);
    expect(requests).toHaveLength(0);
  });

  it("refuses when ANY answer is private (rebinding with a decoy public record)", async () => {
    lookup.mockResolvedValue([...PUBLIC, { address: "169.254.169.254", family: 4 }]);
    const r = await fetchRemoteImage("https://evil.example.com/a.jpg");
    expect(r.ok).toBe(false);
    expect(requests).toHaveLength(0);
  });

  it("refuses a literal private URL before resolving anything", async () => {
    const r = await fetchRemoteImage("https://127.0.0.1/a.jpg");
    expect(r.ok).toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("re-validates a redirect hop and blocks one that points inward", async () => {
    lookup.mockResolvedValueOnce(PUBLIC);
    responses = [{ status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } }];
    const r = await fetchRemoteImage("https://cdn.example.com/a.jpg");
    expect(r.ok).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it("follows a safe redirect to the image", async () => {
    lookup.mockResolvedValue(PUBLIC);
    responses = [
      { status: 301, headers: { location: "/real.jpg" } },
      { status: 200, body: JPEG },
    ];
    const r = await fetchRemoteImage("https://cdn.example.com/a.jpg");
    expect(r.ok).toBe(true);
    expect(requests[1]?.path).toBe("/real.jpg");
  });

  it("gives up after too many redirects", async () => {
    lookup.mockResolvedValue(PUBLIC);
    responses = Array.from({ length: 6 }, () => ({ status: 302, headers: { location: "/loop" } }));
    const r = await fetchRemoteImage("https://cdn.example.com/a.jpg");
    expect(r.ok).toBe(false);
    expect(requests.length).toBeLessThanOrEqual(4);
  });

  it("rejects a non-image body even if the server calls it image/jpeg", async () => {
    lookup.mockResolvedValue(PUBLIC);
    responses = [
      { status: 200, headers: { "content-type": "image/jpeg" }, body: new TextEncoder().encode("<html>nope</html>") },
    ];
    const r = await fetchRemoteImage("https://cdn.example.com/a.jpg");
    expect(r.ok).toBe(false);
  });

  it("rejects an oversized declared length without reading the body", async () => {
    lookup.mockResolvedValue(PUBLIC);
    responses = [{ status: 200, headers: { "content-length": String(6 * 1024 * 1024) }, body: JPEG }];
    const r = await fetchRemoteImage("https://cdn.example.com/a.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("5 MB");
  });

  it("reports an upstream error status", async () => {
    lookup.mockResolvedValue(PUBLIC);
    responses = [{ status: 404 }];
    const r = await fetchRemoteImage("https://cdn.example.com/missing.jpg");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("404");
  });
});
