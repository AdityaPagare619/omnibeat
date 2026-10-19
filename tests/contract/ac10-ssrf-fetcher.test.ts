/**
 * AC10-ssrf-fetcher — Charter Part 8.5 AC-10 (blueprint §5.1 security, §6.6 trust features).
 *
 * The fetcher refuses private address ranges and off-allowlist redirects.
 * SSRF guards are a property of the outbound fetcher the server uses for
 * upstream catalog/artwork/cache URLs — they must hold even when a DNS name
 * resolves into a private range, and after any redirect hop.
 *
 * depends: ARCH contract v0 — the fetcher module's public entry point and its
 * allowlist configuration; the skeleton uses placeholder import paths that will
 * be corrected once contract v0 freezes them.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

const PRIVATE_TARGETS = [
  "http://127.0.0.1:9/x",
  "http://localhost:9/x",
  "http://10.0.0.8/x",
  "http://192.168.1.1/x",
  "http://172.16.0.1/x",
  "http://169.254.169.254/latest/meta-data/",
  "http://[::1]:9/x",
  "http://[fd00::1]/x",
];

async function guardedFetch(url: string): Promise<unknown> {
  // TODO(Phase 2): replace with the real import once ARCH contract v0 fixes the path, e.g.
  //   const { safeFetch } = await import("../../packages/fetcher/src/index");
  //   return safeFetch(url);
  void url;
  throw new Error("NOT IMPLEMENTED: no fetcher module yet (ARCH contract v0 pending)");
}

/** Returns true when the fetcher refused the target; rethrows NOT IMPLEMENTED loudly. */
async function refusedByFetcher(url: string): Promise<boolean> {
  try {
    await guardedFetch(url);
    return false;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith("NOT IMPLEMENTED")) throw err; // no fetcher yet -> fail red, never fake a refusal
    return true;
  }
}

describe("AC10-ssrf-fetcher", () => {
  it("AC10-ssrf-fetcher/refuses-private-ranges: private and link-local addresses are refused before connect", async () => {
    for (const url of PRIVATE_TARGETS) {
      const refused = await refusedByFetcher(url);
      expect(refused, `fetcher must refuse private-range target ${url} (AC-10)`).toBe(true);
    }
  });

  it("AC10-ssrf-fetcher/refuses-off-allowlist-redirect: a redirect escaping the allowlist is refused", async () => {
    // Harness: local HTTP server (allowed host) answers 302 → http://169.254.169.254/latest/meta-data/.
    // The fetcher must refuse at the redirect hop (never follow off-allowlist), with no bytes
    // of the redirect target fetched. The test below spins the real redirector so the harness
    // is wired, but the fetcher call itself is not implemented yet.
    const redirector = createServer((_req, res) => {
      res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
      res.end();
    });
    await new Promise<void>((resolve) => redirector.listen(0, "127.0.0.1", resolve));
    const port = (redirector.address() as AddressInfo).port;
    try {
      const refused = await refusedByFetcher(`http://127.0.0.1:${port}/allowed`);
      expect(refused, `fetcher must refuse the off-allowlist redirect to 169.254.169.254 (AC-10); initial allowlist pass does not legitimise the hop`).toBe(true);
    } finally {
      await new Promise<void>((resolve) => redirector.close(() => resolve()));
    }
  });
});
