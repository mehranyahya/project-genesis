const E164_DIGITS = /^[1-9][0-9]{7,14}$/;
const PUBLIC_HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

function httpsUrl(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "string" || value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) {
    throw new Error("Site link must be an explicit HTTPS URL");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid site link URL");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname.length > 253 ||
    !PUBLIC_HOST.test(url.hostname) ||
    /\.(?:localhost|local|internal|lan|home)$/.test(url.hostname)
  ) {
    throw new Error("Site link must use a public, credential-free HTTPS host");
  }
  return url;
}

export function validateSiteLink(value, kind) {
  const url = httpsUrl(value);
  if (url === null) return null;
  if (kind === "telegram") {
    if (
      !["t.me", "telegram.me"].includes(url.hostname) ||
      url.search ||
      url.hash ||
      !/^\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/.test(url.pathname)
    ) {
      throw new Error("Telegram link must point to a public username");
    }
  } else if (kind === "instagram") {
    const handle = url.pathname.replace(/^\//, "").replace(/\/$/, "");
    if (
      !["instagram.com", "www.instagram.com"].includes(url.hostname) ||
      url.search ||
      url.hash ||
      !/^[A-Za-z0-9_][A-Za-z0-9._]{0,29}$/.test(handle) ||
      handle.endsWith(".") ||
      handle.includes("..") ||
      [
        "accounts",
        "explore",
        "direct",
        "oauth",
        "challenge",
        "p",
        "reel",
        "reels",
        "stories",
      ].includes(handle.toLowerCase())
    ) {
      throw new Error("Instagram link must point to a public profile");
    }
  } else if (kind === "website") {
    if (url.search || url.hash)
      throw new Error("Website link must not contain query or fragment data");
  } else if (kind === "map") {
    const host = url.hostname;
    const allowed =
      (["google.com", "www.google.com", "maps.google.com"].includes(host) &&
        (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))) ||
      (host === "maps.app.goo.gl" && /^\/[A-Za-z0-9]+$/.test(url.pathname)) ||
      (host === "goo.gl" && /^\/maps\/[A-Za-z0-9]+$/.test(url.pathname)) ||
      (["openstreetmap.org", "www.openstreetmap.org"].includes(host) && url.pathname === "/") ||
      (host === "neshan.org" && (url.pathname === "/maps" || url.pathname.startsWith("/maps/"))) ||
      (host === "balad.ir" && url.pathname.startsWith("/p/"));
    if (!allowed) throw new Error("Map link provider or path is not allowlisted");
    for (const [key, value] of url.searchParams) {
      if (
        ["url", "redirect", "redirect_uri", "next", "continue"].includes(key.toLowerCase()) ||
        /[\u0000-\u001f\u007f]|https?:|javascript:/i.test(value)
      ) {
        throw new Error("Map link must not contain a redirect or nested URL");
      }
    }
  } else if (kind === "whatsapp") {
    if (url.hash) throw new Error("WhatsApp link must not contain a fragment");
    if (url.hostname === "wa.me") {
      if (!E164_DIGITS.test(url.pathname.slice(1))) throw new Error("Invalid WhatsApp phone path");
      for (const key of url.searchParams.keys()) {
        if (key !== "text") throw new Error("Unsupported WhatsApp query parameter");
      }
    } else if (url.hostname === "api.whatsapp.com") {
      if (url.pathname !== "/send" || !E164_DIGITS.test(url.searchParams.get("phone") ?? "")) {
        throw new Error("Invalid WhatsApp send link");
      }
      for (const key of url.searchParams.keys()) {
        if (key !== "phone" && key !== "text")
          throw new Error("Unsupported WhatsApp query parameter");
      }
    } else {
      throw new Error("WhatsApp link host is not allowlisted");
    }
    for (const key of new Set(url.searchParams.keys())) {
      if (url.searchParams.getAll(key).length !== 1)
        throw new Error("Duplicate WhatsApp query parameter");
    }
  } else {
    throw new Error("Unknown site link kind");
  }
  return url.toString();
}
