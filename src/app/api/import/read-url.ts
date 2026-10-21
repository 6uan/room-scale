/**
 * Fetching one product page on the server, for the link path of assisted
 * import (ADR 0005).
 *
 * This is the one place RoomScale reaches out from a server, and what comes
 * back is from an origin nobody here controls. So: only http(s), never an
 * address inside the network the server sits on, a short timeout, a cap on
 * how much is read, and the body is parsed as text and nothing else. One
 * page per call, and nothing is kept.
 */

import { isIP } from "node:net";
import { extractProductFromHtml, type ExtractedProduct } from "@/domain/import";

export type ReadUrlResult =
  | { readonly status: "read"; readonly extracted: ExtractedProduct }
  /** The address is not one this will fetch. */
  | { readonly status: "refused"; readonly message: string }
  /** The page did not come back, or came back as something other than a page. */
  | { readonly status: "unreachable"; readonly message: string };

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 4 * 1024 * 1024;

/** Sent so a retailer serves the page it serves a browser rather than a bot wall. */
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export async function readUrl(
  input: string,
  fetchPage: typeof fetch = fetch,
): Promise<ReadUrlResult> {
  const url = publicHttpUrl(input);
  if (url === null) {
    return {
      status: "refused",
      message:
        "That is not a web address this can fetch. Paste the page's text instead.",
    };
  }

  let response: Response;
  try {
    response = await fetchPage(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { status: "unreachable", message: "The page did not answer." };
  }

  // A redirect may have landed somewhere this would not have fetched.
  if (response.url !== "" && publicHttpUrl(response.url) === null) {
    return {
      status: "refused",
      message: "The page redirected somewhere this will not fetch.",
    };
  }
  if (!response.ok) {
    return {
      status: "unreachable",
      message: `The page answered ${response.status}.`,
    };
  }
  const type = response.headers.get("content-type") ?? "";
  if (!/^(text\/html|application\/xhtml\+xml)\b/i.test(type)) {
    return {
      status: "unreachable",
      message: "That address is not a web page.",
    };
  }

  const html = await readUpTo(response, MAX_BYTES);
  return { status: "read", extracted: extractProductFromHtml(html) };
}

/** The address as a URL, or null if it is not an http(s) one on the public internet. */
export function publicHttpUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (url.username !== "" || url.password !== "") {
    return null;
  }
  return isPrivateHost(url.hostname) ? null : url;
}

/**
 * Addresses that name this machine or its network rather than a retailer.
 * Hostnames that resolve to one are not caught here; that needs a resolver,
 * and the fetch runs where nothing on the network is listening for it.
 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    (!host.includes(".") && isIP(host) === 0)
  ) {
    return true;
  }
  if (isIP(host) === 4) {
    const [a = 0, b = 0] = host.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (isIP(host) === 6) {
    return (
      host === "::1" ||
      host === "::" ||
      /^(fc|fd|fe[89ab])/.test(host) ||
      host.startsWith("::ffff:")
    );
  }
  return false;
}

async function readUpTo(response: Response, limit: number): Promise<string> {
  if (response.body === null) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let read = 0;
  while (read < limit) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    read += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text + decoder.decode();
}
