// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicHttpUrl, readUrl } from "./read-url";

const article = readFileSync(
  "src/domain/import/fixtures/article-abisko.html",
  "utf8",
);

function serving(body: string, init?: ResponseInit & { url?: string }) {
  return (async () => {
    const response = new Response(body, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      ...init,
    });
    if (init?.url !== undefined) {
      Object.defineProperty(response, "url", { value: init.url });
    }
    return response;
  }) as unknown as typeof fetch;
}

describe("publicHttpUrl", () => {
  it("takes an ordinary product address", () => {
    expect(publicHttpUrl(" https://www.article.com/product/1 ")?.href).toBe(
      "https://www.article.com/product/1",
    );
  });

  it.each([
    "not a url",
    "ftp://example.com/file",
    "file:///etc/passwd",
    "http://localhost:3000/",
    "http://127.0.0.1/",
    "http://10.1.2.3/",
    "http://172.20.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://intranet/",
    "http://user:pass@example.com/",
  ])("refuses %s", (input) => {
    expect(publicHttpUrl(input)).toBeNull();
  });
});

describe("readUrl", () => {
  it("reads the Article sectional", async () => {
    const result = await readUrl(
      "https://www.article.com/product/22588/abisko",
      serving(article),
    );
    expect(result.status).toBe("read");
    if (result.status === "read") {
      expect(result.extracted.name?.value).toContain("Abisko");
      expect(result.extracted.priceCents?.value).toBe(169900);
      expect(result.extracted.widthMeters?.value).toBeCloseTo(2.4003, 4);
    }
  });

  it("refuses a private address without fetching it", async () => {
    let fetched = false;
    const result = await readUrl("http://localhost:3000/", (async () => {
      fetched = true;
      return new Response("");
    }) as unknown as typeof fetch);
    expect(result.status).toBe("refused");
    expect(fetched).toBe(false);
  });

  it("refuses a page that redirected onto the local network", async () => {
    const result = await readUrl(
      "https://example.com/",
      serving("<html></html>", { url: "http://127.0.0.1:3000/" }),
    );
    expect(result.status).toBe("refused");
  });

  it("says when the page answered with an error", async () => {
    const result = await readUrl(
      "https://example.com/gone",
      serving("", { status: 404 }),
    );
    expect(result).toEqual({
      status: "unreachable",
      message: "The page answered 404.",
    });
  });

  it("says when the address is not a page", async () => {
    const result = await readUrl(
      "https://example.com/a.pdf",
      serving("%PDF", { headers: { "content-type": "application/pdf" } }),
    );
    expect(result.status).toBe("unreachable");
  });

  it("says when nothing answered", async () => {
    const result = await readUrl("https://example.com/", (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch);
    expect(result).toEqual({
      status: "unreachable",
      message: "The page did not answer.",
    });
  });

  it("reads a JavaScript shell as nothing, not as a guess", async () => {
    const result = await readUrl(
      "https://www.target.com/p/tv-stand",
      serving(
        "<html><head><title></title></head><body><div id='app'></div></body></html>",
      ),
    );
    expect(result).toEqual({
      status: "read",
      extracted: { dimensionOrderIsAssumed: false },
    });
  });
});
