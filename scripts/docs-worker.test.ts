import { expect, it } from "vitest";
import worker from "./docs-worker";

const env = { ASSETS: { fetch: async (request: Request) => new Response(`Asset: ${new URL(request.url).pathname}`, { headers: { "Content-Type": "text/plain" } }) } };

it.each(["scripture-inline.cameronandrewpak.workers.dev", "www.bible-sdk.com"])("permanently redirects %s while preserving paths and queries", async (hostname) => {
  const response = await worker.fetch(new Request(`https://${hostname}/assets/site.js?version=2&value=a%2Fb`), env);
  expect(response.status).toBe(308);
  expect(response.headers.get("Location")).toBe("https://bible-sdk.com/assets/site.js?version=2&value=a%2Fb");
});

it.each(["bible-sdk.com", "rebrand-bible-sdk-scripture-inline.cameronandrewpak.workers.dev"])("serves assets without redirect loops on %s", async (hostname) => {
  const response = await worker.fetch(new Request(`https://${hostname}/assets/site.js`), env);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("Asset: /assets/site.js");
  expect(response.headers.get("Location")).toBeNull();
});
