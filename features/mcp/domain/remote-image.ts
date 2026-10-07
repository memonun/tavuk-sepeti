/**
 * Pure rules for pulling a product image from a URL the model supplied.
 *
 * The server will fetch whatever URL it is given, so this is an SSRF boundary:
 * only public https hosts, never an address that points back into our network,
 * and the bytes are identified by their magic number — not by the (attacker
 * controlled) Content-Type header.
 */
import { isIP } from "node:net";

export const REMOTE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REMOTE_IMAGE_MAX_REDIRECTS = 3;
export const REMOTE_IMAGE_TIMEOUT_MS = 10_000;

export type RemoteImageType = "image/jpeg" | "image/png" | "image/webp";

/** Reasons a URL is refused before any connection is made. */
export type UrlRejection =
  | "invalid_url"
  | "not_https"
  | "credentials_in_url"
  | "port_not_allowed"
  | "host_not_allowed";

export function checkRemoteImageUrl(raw: string): { ok: true; url: URL } | { ok: false; reason: UrlRejection } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (url.username !== "" || url.password !== "") return { ok: false, reason: "credentials_in_url" };
  if (url.port !== "" && url.port !== "443") return { ok: false, reason: "port_not_allowed" };

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "" ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".lan") ||
    host.endsWith(".home.arpa") ||
    (!host.includes(".") && isIP(host) === 0)
  ) {
    return { ok: false, reason: "host_not_allowed" };
  }
  if (isIP(host) !== 0 && isPrivateAddress(host)) return { ok: false, reason: "host_not_allowed" };
  return { ok: true, url };
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  const [a, b, c, d] = parts as [number, number, number, number];
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function inV4Range(ip: number, base: string, bits: number): boolean {
  const start = ipv4ToInt(base);
  if (start === null) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ip & mask) >>> 0 === (start & mask) >>> 0;
}

const PRIVATE_V4: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local + cloud metadata (169.254.169.254)
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

/** True for any address that is not a normal public unicast address. Fails closed on garbage. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(ip);
  if (family === 0) return true;

  if (family === 4) {
    const n = ipv4ToInt(ip);
    if (n === null) return true;
    return PRIVATE_V4.some(([base, bits]) => inV4Range(n, base, bits));
  }

  // IPv6. IPv4-mapped (::ffff:a.b.c.d / ::ffff:xxxx:xxxx) inherits the v4 verdict.
  const mappedDotted = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mappedDotted?.[1]) return isPrivateAddress(mappedDotted[1]);
  const mappedHex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (mappedHex?.[1] && mappedHex[2]) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (ip === "::" || ip === "::1") return true;
  const first = ip.split(":")[0] ?? "";
  const head = first === "" ? 0 : parseInt(first, 16);
  if (Number.isNaN(head)) return true;
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((head & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (ip.startsWith("64:ff9b:")) return true; // NAT64 can reach v4 internals
  if (ip.startsWith("2001:db8:") || ip.startsWith("2002:")) return true; // doc + 6to4
  return false;
}

/** Identify the image by its magic number. Returns null for anything else (HTML, SVG, scripts…). */
export function sniffImageType(bytes: Uint8Array): RemoteImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}
