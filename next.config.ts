import type { NextConfig } from "next";

/**
 * Hostnames the dev server may be reached on, beyond localhost.
 *
 * Set `DEV_ORIGINS` in a local, untracked `.env.local` when you browse the dev
 * server through a tunnel, a reverse proxy, or another machine's hostname —
 * otherwise Next rejects those requests. Comma separated, no scheme:
 *
 *   DEV_ORIGINS=my-box,my-box.example.net,10.0.0.4
 */
const devOrigins =
  process.env.DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

/**
 * The end-to-end build writes somewhere else.
 *
 * Playwright builds and serves the app while a dev server is usually already
 * running, and both default to `.next`. Sharing it leaves the dev server
 * serving half a build — three times so far.
 */
const distDir = process.env.E2E === "1" ? ".next-e2e" : ".next";

const nextConfig: NextConfig = {
  distDir,
  ...(devOrigins.length > 0 ? { allowedDevOrigins: devOrigins } : {}),
};

export default nextConfig;
