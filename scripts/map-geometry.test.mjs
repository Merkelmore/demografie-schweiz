import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { feature } from "topojson-client";
import { mapViewBox, regionBounds, regionPath } from "../src/lib/map-geometry.ts";
import { cantonNumbers } from "../src/lib/cantons.ts";

const topology = JSON.parse(readFileSync(new URL("../public/geo/municipalities-2026.topojson", import.meta.url), "utf8"));
const cantons = feature(topology, topology.objects.k4kant_20260101_gf_ohne_seen).features;
const municipalities = feature(topology, topology.objects.k4voge_20260101_gf).features;

test("the shared BFS file contains exactly the 26 cantons used by the catalogue", () => {
  assert.equal(cantons.length, 26);
  assert.deepEqual(cantons.map(region => region.properties.kantId).sort((a, b) => a - b), Object.values(cantonNumbers).sort((a, b) => a - b));
});

function assertFitted(regions) {
  const extent = regionBounds(regions);
  for (const region of regions) {
    const path = regionPath(region, extent);
    assert.ok(!/NaN|Infinity/.test(path));
    for (const [, x, y] of path.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)) {
      assert.ok(Number(x) >= mapViewBox.padding - .1 && Number(x) <= mapViewBox.width - mapViewBox.padding + .1);
      assert.ok(Number(y) >= mapViewBox.padding - .1 && Number(y) <= mapViewBox.height - mapViewBox.padding + .1);
    }
  }
}

test("all canton outlines and every canton’s municipalities fit inside the map padding", () => {
  assertFitted(cantons);
  for (const canton of cantons) {
    assertFitted(municipalities.filter(region => region.properties.kantId === canton.properties.kantId));
  }
});

test("fitting preserves proportions, north-up orientation, and closed lake rings", () => {
  const rectangle = { geometry: { type: "Polygon", coordinates: [
    [[0, 0], [200, 0], [200, 100], [0, 100], [0, 0]],
    [[50, 25], [50, 75], [150, 75], [150, 25], [50, 25]],
  ] } };
  const path = regionPath(rectangle, regionBounds([rectangle]));
  const points = [...path.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map(([, x, y]) => [Number(x), Number(y)]);
  const width = points[1][0] - points[0][0];
  const height = points[0][1] - points[2][1];
  assert.equal(width / height, 2);
  assert.ok(points[0][1] > points[2][1]);
  assert.equal((path.match(/ Z/g) ?? []).length, 2);
});
