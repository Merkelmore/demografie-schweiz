// Optional QA tool: point PLAYWRIGHT_MODULE at an existing Playwright installation.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.GTM_BASE_URL || "http://127.0.0.1:3009";
const live = process.env.GTM_LIVE_SCRIPT === "true";
const container = "GTM-M9C9LKDH";
const scriptUrl = `https://www.googletagmanager.com/gtm.js?id=${container}`;
const fallbackUrl = `https://www.googletagmanager.com/ns.html?id=${container}`;
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || "msedge", headless: true });

try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    if (!live) await context.route("https://www.googletagmanager.com/**", (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "/* isolated GTM loading test */" }));
    const page = await context.newPage();
    const errors = [];
    const loads = [];
    const analytics = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().startsWith("https://www.googletagmanager.com/gtm.js")) loads.push(request.url());
      if (/google-analytics\.com\/(?:g\/)?collect|googletagmanager\.com\/gtag\/js|\/api\/visits/.test(request.url())) analytics.push(request.url());
    });
    const responsePromise = page.waitForResponse((response) => response.url() === scriptUrl);
    await page.goto(`${base}/methodik`, { waitUntil: "networkidle" });
    assert.equal((await responsePromise).status(), 200);
    assert.equal(await page.locator("head > script#google-tag-manager").count(), 1);
    assert.deepEqual(loads, [scriptUrl]);
    assert.equal(await page.evaluate(() => window.dataLayer.filter((event) => event.event === "gtm.js").length), 1);
    if (live) await page.waitForFunction((id) => Boolean(window.google_tag_manager?.[id]), container);
    await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Kantone", exact: true }).click();
    await page.waitForURL("**/kantone");
    await page.locator('a[href="/kantone/zuerich"]').click();
    await page.waitForURL("**/kantone/zuerich");
    await page.goBack();
    await page.waitForURL("**/kantone");
    assert.deepEqual(loads, [scriptUrl], "client navigation must not reload GTM");
    assert.equal(await page.evaluate(() => window.dataLayer.filter((event) => event.event === "gtm.js").length), 1);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(loads.length, 2, "one new GTM load for a full document reload");
    assert.equal(await page.evaluate(() => window.dataLayer.filter((event) => event.event === "gtm.js").length), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    assert.deepEqual(analytics, [], "no GA4/custom visitor collection was added");
    console.log(JSON.stringify({ width, mode: live ? "actual Google container" : "isolated loader", initialLoads: 1, clientNavigationExtraLoads: 0, reloadLoads: 1, errors: 0 }));
    await context.close();
  }
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  if (!live) await noScript.route("https://www.googletagmanager.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>GTM fallback test</title>" }));
  const page = await noScript.newPage();
  const requests = [];
  page.on("request", (request) => { if (request.url().startsWith("https://www.googletagmanager.com/")) requests.push(request.url()); });
  const fallbackResponse = page.waitForResponse((response) => response.url() === fallbackUrl);
  await page.goto(`${base}/methodik`, { waitUntil: "networkidle" });
  assert.equal((await fallbackResponse).status(), 200);
  assert.deepEqual(requests, [fallbackUrl]);
  assert.equal(await page.locator("body > noscript > iframe").count(), 1);
  assert.equal(await page.locator("body > noscript > iframe").isVisible(), false);
  console.log("JavaScript disabled: exactly one hidden GTM noscript iframe; no script request.");
  await noScript.close();
} finally { await browser.close(); }
