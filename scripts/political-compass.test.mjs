import assert from "node:assert/strict";
import test from "node:test";

import { ACTIVE_PROPOSAL_WEIGHTS, AXIS_LIMIT, DELTA_CLAMP, EXCLUDED_PROPOSAL_IDS, aggregateCantonPercentages, buildPoliticalCompass, clamp, normalizeAxis, populationStandardDeviation } from "./lib/political-compass.mjs";

const result = (percentage, yes = 50, no = 50) => [percentage, 0, yes, no, 0];
const active = ACTIVE_PROPOSAL_WEIGHTS.map((weight, index) => ({
  id: weight.id,
  nationalYesPercentage: 50,
  results: { a: result(40 + index, 40 + index, 60 - index), b: result(60 - index, 60 - index, 40 + index), c: result(50, 50, 50) },
}));
const municipalities = [
  { id: "a", name: "Alpha", cantonCode: "AA", cantonName: "Alpha" },
  { id: "b", name: "Beta", cantonCode: "BB", cantonName: "Beta" },
  { id: "c", name: "Gamma", cantonCode: "CC", cantonName: "Gamma" },
];

test("uses exactly nine active proposals and excludes the specified ballot questions", () => {
  assert.equal(ACTIVE_PROPOSAL_WEIGHTS.length, 9);
  assert.deepEqual(ACTIVE_PROPOSAL_WEIGHTS.map(({ id }) => id).sort((a, b) => a - b), [6780, 6790, 6810, 6821, 6830, 6840, 6850, 6860, 6870]);
  assert.deepEqual(Object.keys(EXCLUDED_PROPOSAL_IDS).map(Number).sort((a, b) => a - b), [6800, 6822, 6823]);
});

test("calculates population standard deviation and clamps extreme deltas", () => {
  assert.equal(populationStandardDeviation([40, 60]), 10);
  assert.equal(clamp(7, -DELTA_CLAMP, DELTA_CLAMP), DELTA_CLAMP);
  assert.equal(normalizeAxis(100, 1), AXIS_LIMIT);
});

test("builds positions from exact municipal shares and vote-weighted canton results", () => {
  const compass = buildPoliticalCompass({ municipalities, proposals: active });
  assert.equal(compass.municipalities.length, 3);
  assert.equal(compass.cantons.length, 3);
  assert.equal(compass.nationalReferences[6860], 50);
  assert.equal(compass.deviations[6860], Math.sqrt(200 / 3));
  assert.ok(compass.municipalities.every((point) => point.x >= -100 && point.x <= 100 && point.y >= -100 && point.y <= 100));
});

test("aggregates canton shares from votes instead of taking an unweighted municipal average", () => {
  const proposals = new Map([[6860, { results: { small: result(10, 1, 9), large: result(90, 90, 10) } }]]);
  const percentages = aggregateCantonPercentages([{ id: "small" }, { id: "large" }], proposals, [{ id: 6860 }]);
  assert.equal(percentages[6860], (91 / 110) * 100);
  assert.notEqual(percentages[6860], 50);
});

test("does not invent a point when one active result is absent", () => {
  const incomplete = structuredClone(active);
  delete incomplete[0].results.a;
  const compass = buildPoliticalCompass({ municipalities, proposals: incomplete });
  assert.deepEqual(compass.missingMunicipalityIds, ["a"]);
  assert.deepEqual(compass.municipalities.map(({ id }) => id), ["b", "c"]);
});
