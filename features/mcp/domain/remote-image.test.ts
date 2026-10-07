import { describe, expect, it } from "vitest";

import {
  checkRemoteImageUrl,
  isPrivateAddress,
  sniffImageType,
} from "@/features/mcp/domain/remote-image";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGNAT
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12:3456::1",
    "ff02::1",
    "::ffff:127.0.0.1", // v4-mapped loopback
    "::ffff:7f00:1", // same, hex form
    "::ffff:169.254.169.254",
    "64:ff9b::a00:1",
    "not-an-ip",
    "",
  ])("treats %j as private/unsafe", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "93.184.216.34", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows public address %s",
    (ip) => {
      expect(isPrivateAddress(ip)).toBe(false);
    },
  );
});

describe("checkRemoteImageUrl", () => {
  it("accepts a plain public https URL", () => {
    const r = checkRemoteImageUrl("https://cdn.example.com/a/b.jpg?x=1");
    expect(r.ok).toBe(true);
  });

  it.each([
    ["http://example.com/a.jpg", "not_https"],
    ["ftp://example.com/a.jpg", "not_https"],
    ["file:///etc/passwd", "not_https"],
    ["javascript:alert(1)", "not_https"],
    ["https://user:pw@example.com/a.jpg", "credentials_in_url"],
    ["https://example.com:8443/a.jpg", "port_not_allowed"],
    ["https://localhost/a.jpg", "host_not_allowed"],
    ["https://foo.localhost/a.jpg", "host_not_allowed"],
    ["https://printer.local/a.jpg", "host_not_allowed"],
    ["https://db.internal/a.jpg", "host_not_allowed"],
    ["https://intranet/a.jpg", "host_not_allowed"],
    ["https://127.0.0.1/a.jpg", "host_not_allowed"],
    ["https://[::1]/a.jpg", "host_not_allowed"],
    ["https://169.254.169.254/latest/meta-data", "host_not_allowed"],
    ["https://10.1.2.3/a.jpg", "host_not_allowed"],
    ["not a url", "invalid_url"],
  ])("rejects %s", (url, reason) => {
    const r = checkRemoteImageUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });

  it("normalises tricky IPv4 spellings before judging them", () => {
    // WHATWG URL turns decimal / hex / octal forms into dotted quads.
    for (const url of ["https://2130706433/a.jpg", "https://0x7f.0.0.1/a.jpg", "https://017700000001/a.jpg"]) {
      expect(checkRemoteImageUrl(url).ok, url).toBe(false);
    }
  });
});

describe("sniffImageType", () => {
  it("recognises JPEG, PNG and WEBP by magic number", () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe("image/jpeg");
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    const webp = new Uint8Array(16);
    webp.set([0x52, 0x49, 0x46, 0x46], 0);
    webp.set([0x57, 0x45, 0x42, 0x50], 8);
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("rejects HTML, SVG, GIF and empty bodies regardless of what the server claimed", () => {
    const enc = new TextEncoder();
    expect(sniffImageType(enc.encode("<!doctype html><html>"))).toBeNull();
    expect(sniffImageType(enc.encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImageType(enc.encode("GIF89a"))).toBeNull();
    expect(sniffImageType(new Uint8Array(0))).toBeNull();
  });
});
