import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { GTM_CONTAINER_ID, GTM_HEAD_SCRIPT } from "../src/lib/google-tag-manager.mjs";

function run(existing) {
  const inserted = [];
  const firstScript = { parentNode: { insertBefore(script, before) { assert.equal(before, firstScript); inserted.push(script); } } };
  const window = existing ? { dataLayer: existing } : {};
  const document = { getElementsByTagName(name) { assert.equal(name, "script"); return [firstScript]; }, createElement(name) { assert.equal(name, "script"); return {}; } };
  vm.runInNewContext(GTM_HEAD_SCRIPT, { window, document });
  return { window, inserted };
}

test("loads exactly the requested container asynchronously and emits only the standard bootstrap event", () => {
  const { window, inserted } = run();
  assert.equal(GTM_CONTAINER_ID, "GTM-M9C9LKDH");
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].src, `https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`);
  assert.equal(inserted[0].async, true);
  assert.equal(window.dataLayer.length, 1);
  assert.equal(window.dataLayer[0].event, "gtm.js");
  assert.equal(typeof window.dataLayer[0]["gtm.start"], "number");
});

test("preserves an existing dataLayer instead of replacing queued messages", () => {
  const existing = [{ existing: true }];
  const { window } = run(existing);
  assert.equal(window.dataLayer, existing);
  assert.deepEqual(window.dataLayer[0], { existing: true });
  assert.equal(window.dataLayer.length, 2);
});

test("root layout owns both snippets, head placement and first body child", () => {
  const source = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
  assert.match(source, /<head>[\s\S]*<script id="google-tag-manager"[^>]*GTM_HEAD_SCRIPT[\s\S]*<\/head>/);
  assert.match(source, /<body[^>]*>\s*<noscript>\s*<iframe[^>]+googletagmanager\.com\/ns\.html\?id=\$\{GTM_CONTAINER_ID\}/);
  assert.equal((source.match(/id="google-tag-manager"/g) ?? []).length, 1);
  assert.match(source, /height="0" width="0" style=\{\{ display: "none", visibility: "hidden" \}\}/);
});

test("no second loader, direct GA4 setup, custom events or local visitor collector is included", () => {
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const files = [];
  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(?:tsx?|m?js)$/.test(path)) files.push({ path, text: readFileSync(path, "utf8") });
    }
  }
  walk(root);
  assert.equal(files.filter(({ text }) => text.includes("googletagmanager.com/gtm.js")).length, 1);
  assert.equal(files.filter(({ text }) => text.includes("googletagmanager.com/ns.html")).length, 1);
  for (const { path, text } of files) assert.doesNotMatch(text, /GoogleTagManager\s*from|GoogleAnalytics|gtag\(|sendGTMEvent|G-[A-Z0-9]{6,}|VisitorCounter|\/api\/visits/, path);
});
