import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import test from "node:test";

const base = process.env.SEO_BASE_URL ?? "http://localhost:3009";
const canonicalOrigin = "https://politik-kompass-schweiz.info";
const snapshot = JSON.parse(await readFile(new URL("../public/data/political-compass.json", import.meta.url), "utf8"));
const votes = JSON.parse(await readFile(new URL("../public/data/municipal-votes.json", import.meta.url), "utf8"));
const slugs = { AG: "aargau", AI: "appenzell-innerrhoden", AR: "appenzell-ausserrhoden", BE: "bern", BL: "basel-landschaft", BS: "basel-stadt", FR: "freiburg", GE: "genf", GL: "glarus", GR: "graubuenden", JU: "jura", LU: "luzern", NE: "neuenburg", NW: "nidwalden", OW: "obwalden", SG: "st-gallen", SH: "schaffhausen", SO: "solothurn", SZ: "schwyz", TG: "thurgau", TI: "tessin", UR: "uri", VD: "waadt", VS: "wallis", ZG: "zug", ZH: "zuerich" };
const paths = ["/", "/politischer-kompass", "/kantone", "/methodik", "/ueber-das-projekt", ...Object.values(slugs).map((slug) => `/kantone/${slug}`)];
const pages = new Map();
const number = (value) => new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 }).format(value);
const coordinate = (value) => `${value > 0 ? "+" : ""}${number(value)}`;
const plainText = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

async function fetchPage(path, options) {
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(15000), ...options });
  assert.equal(response.status, 200, path);
  return { response, text: await response.text() };
}

test("all sitemap pages expose unique metadata, readable HTML and valid structured data without JavaScript", async () => {
  const titles = new Set();
  const descriptions = new Set();
  for (const path of paths) {
    const { response, text } = await fetchPage(path);
    pages.set(path, text);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.equal((text.match(/<h1(?:\s|>)/g) ?? []).length, 1, `${path}: one primary heading`);
    const canonical = text.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.ok(canonical, `${path}: canonical link exists`);
    assert.equal(new URL(canonical).toString(), `${canonicalOrigin}${path}`, `${path}: canonical URL`);
    assert.doesNotMatch(text, /<meta name="robots" content="[^"]*noindex/);
    assert.match(text, /<meta name="description" content="[^"]{50,}"/);
    const title = text.match(/<title>(.*?)<\/title>/s)?.[1];
    const description = text.match(/<meta name="description" content="([^"]+)"/)?.[1];
    assert.ok(title && !titles.has(title), `unique title: ${path}`);
    assert.ok(description && !descriptions.has(description), `unique description: ${path}`);
    titles.add(title); descriptions.add(description);
    const schemas = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
    assert.ok(schemas.some((schema) => schema["@type"] === "WebSite"));
    if (path !== "/") assert.ok(schemas.some((schema) => schema["@graph"]?.some((item) => item["@type"] === "BreadcrumbList")));
  }
});

test("homepage stays a compact map with one optional methodology link", async () => {
  const { text } = await fetchPage("/");
  assert.doesNotMatch(text, /discovery-home|discovery-title|knowledge-link-cards/);
  assert.match(text, /class="map-page"/);
  assert.match(text, /class="site-footer__methodology" href="\/methodik"/);
  assert.doesNotMatch(text, /href="\/politischer-kompass"/);
});

test("every published municipality and canton coordinate matches the shared compass snapshot", async () => {
  let count = 0;
  for (const canton of snapshot.cantons) {
    const path = `/kantone/${slugs[canton.code]}`;
    const html = pages.get(path) ?? (await fetchPage(path)).text;
    assert.ok(html.includes(`<dd>${coordinate(canton.x)}</dd>`), canton.code);
    assert.ok(html.includes(`<dd>${coordinate(canton.y)}</dd>`), canton.code);
    const municipalities = snapshot.municipalities.filter((point) => point.canton === canton.code);
    assert.equal((html.match(/<tr id="gemeinde-/g) ?? []).length, municipalities.length);
    for (const point of municipalities) {
      const row = html.match(new RegExp(`<tr id="gemeinde-${point.id}">([\\s\\S]*?)</tr>`))?.[1];
      assert.ok(row, `${point.name} has an addressable row`);
      assert.ok(row.includes(`<td>${coordinate(point.x)}</td>`), `${point.name} x`);
      assert.ok(row.includes(`<td>${coordinate(point.y)}</td>`), `${point.name} y`);
      count++;
    }
    for (const weight of snapshot.methodology.weights) {
      const proposal = votes.votingDays.flatMap((day) => day.proposals).find((item) => item.id === weight.id);
      const sum = municipalities.reduce((acc, point) => [acc[0] + proposal.results[point.id][2], acc[1] + proposal.results[point.id][3]], [0, 0]);
      assert.ok(plainText(html).includes(`${number(100 * sum[0] / (sum[0] + sum[1]))} %`), `${canton.code}: vote-weighted result ${weight.id}`);
    }
  }
  assert.equal(count, snapshot.municipalities.length);
});

test("sitemap and crawler policies expose the public pages, including assistant search agents", async () => {
  const { text: sitemap } = await fetchPage("/sitemap.xml");
  const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.deepEqual(locations.sort(), paths.map((path) => `${canonicalOrigin}${path}`).sort());
  assert.doesNotMatch(sitemap, /<lastmod>/, "do not fabricate freshness");
  const { text: robots } = await fetchPage("/robots.txt");
  for (const agent of ["*", "OAI-SearchBot", "ChatGPT-User", "Claude-SearchBot", "Claude-User"]) assert.ok(robots.toLowerCase().includes(`user-agent: ${agent.toLowerCase()}`));
  assert.ok(robots.includes(`Sitemap: ${canonicalOrigin}/sitemap.xml`));
  assert.doesNotMatch(robots, /Disallow:\s*\//i);
  for (const agent of ["Googlebot", "OAI-SearchBot", "Claude-SearchBot"]) {
    const { text } = await fetchPage("/kantone/zuerich", { headers: { "user-agent": agent } });
    assert.match(text, /id="gemeinde-261"/);
    assert.match(text, /<link rel="canonical"/);
  }
});

test("source dates, provisional status and dataset download stay visible and consistent", async () => {
  const { text } = await fetchPage("/politischer-kompass");
  const schemas = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
  const dataset = schemas.find((schema) => schema["@type"] === "Dataset");
  const dates = snapshot.methodology.weights.map((weight) => weight.date).sort();
  assert.equal(dataset.temporalCoverage, `${dates[0]}/${dates.at(-1)}`);
  assert.match(text, /provisorisch/);
  for (const date of new Set(dates)) assert.ok((pages.get("/methodik") ?? (await fetchPage("/methodik")).text).includes(`dateTime="${date}"`) || (pages.get("/methodik") ?? "").includes(`datetime="${date}"`));
  const { text: download } = await fetchPage(new URL(dataset.distribution.contentUrl).pathname);
  assert.deepEqual(JSON.parse(download), snapshot);
});

test("unknown cantons return 404, www redirects canonically, and the sharing image is a real PNG", async () => {
  const missing = await fetch(new URL("/kantone/does-not-exist", base));
  assert.equal(missing.status, 404);
  const target = new URL("/kantone/zuerich?test=1", base);
  const transport = target.protocol === "https:" ? https : http;
  const redirect = await new Promise((resolve, reject) => {
    const request = transport.get(target, { headers: { host: "www.politik-kompass-schweiz.info" }, timeout: 15000 }, (response) => { response.resume(); resolve(response); });
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("Redirect check timed out")));
  });
  assert.equal(redirect.statusCode, 308);
  assert.equal(redirect.headers.location, `${canonicalOrigin}/kantone/zuerich?test=1`);
  const image = await fetch(new URL("/opengraph-image", base));
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /image\/png/);
  const png = Buffer.from(await image.arrayBuffer());
  assert.equal(png.subarray(1, 4).toString(), "PNG");
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});
