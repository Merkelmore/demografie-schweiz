import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.GTM_BASE_URL || "http://127.0.0.1:3009";
const id = "GTM-M9C9LKDH";

test("every public sitemap page has one head bootstrap and body noscript fallback", async () => {
  const sitemap = await fetch(new URL("/sitemap.xml", base));
  assert.equal(sitemap.status, 200);
  const locations = [...(await sitemap.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => new URL(match[1]).pathname);
  assert.equal(locations.length, 31);
  for (const path of locations) {
    const response = await fetch(new URL(path, base));
    assert.equal(response.status, 200, path);
    const html = await response.text();
    const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] || "";
    const bootstrap = [...head.matchAll(/<script\b[^>]*id="google-tag-manager"[^>]*>([\s\S]*?)<\/script>/g)];
    assert.equal(bootstrap.length, 1, `${path}: one bootstrap in head`);
    assert.match(bootstrap[0][1], new RegExp(id));
    assert.match(bootstrap[0][1], /j\.async=true/);
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] || "";
    assert.equal((body.match(/<noscript>/g) || []).length, 1, `${path}: one noscript`);
    // Next may prepend an empty hidden Suspense marker before the first authored body element.
    const authoredBody = body.replace(/^<div hidden="">(?:<!--[\s\S]*?-->)*<\/div>/, "");
    assert.match(authoredBody, new RegExp(`^<noscript><iframe[^>]*src="https://www.googletagmanager.com/ns.html\\?id=${id}"`), `${path}: noscript first`);
    assert.match(authoredBody, /height="0" width="0" style="display:none;visibility:hidden"/);
    assert.doesNotMatch(html, /googletagmanager\.com\/gtag\/js|google-analytics\.com\/g\/collect|\/api\/visits/);
  }
});
