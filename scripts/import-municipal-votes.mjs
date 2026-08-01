import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ACTIVE_PROPOSAL_WEIGHTS, EXCLUDED_PROPOSAL_IDS, buildPoliticalCompass } from "./lib/political-compass.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const geometryUrl = "https://dam-api.bfs.admin.ch/hub/api/dam/assets/36438312/master";
const geometryOutput = resolve(projectRoot, "public/geo/municipalities-2026.topojson");
const votesOutput = resolve(projectRoot, "public/data/municipal-votes.json");
const compassOutput = resolve(projectRoot, "public/data/political-compass.json");
const votingDays = [
  { date: "2026-06-14", url: "https://ogd-static.voteinfo-app.ch/v1/ogd/sd-t-17-02-20260614-eidgAbstimmung.json" },
  { date: "2026-03-08", url: "https://ogd-static.voteinfo-app.ch/v1/ogd/sd-t-17-02-20260308-eidgAbstimmung.json" },
  { date: "2025-11-30", url: "https://ogd-static.voteinfo-app.ch/v1/ogd/sd-t-17-02-20251130-eidgAbstimmung.json" },
  { date: "2025-09-28", url: "https://ogd-static.voteinfo-app.ch/v1/ogd/sd-t-17-02-20250928-eidgAbstimmung.json" },
];

const cantonDetails = {
  1: ["ZH", "Zürich"], 2: ["BE", "Bern"], 3: ["LU", "Luzern"], 4: ["UR", "Uri"], 5: ["SZ", "Schwyz"], 6: ["OW", "Obwalden"], 7: ["NW", "Nidwalden"], 8: ["GL", "Glarus"], 9: ["ZG", "Zug"], 10: ["FR", "Freiburg"], 11: ["SO", "Solothurn"], 12: ["BS", "Basel-Stadt"], 13: ["BL", "Basel-Landschaft"], 14: ["SH", "Schaffhausen"], 15: ["AR", "Appenzell Ausserrhoden"], 16: ["AI", "Appenzell Innerrhoden"], 17: ["SG", "St. Gallen"], 18: ["GR", "Graubünden"], 19: ["AG", "Aargau"], 20: ["TG", "Thurgau"], 21: ["TI", "Tessin"], 22: ["VD", "Waadt"], 23: ["VS", "Wallis"], 24: ["NE", "Neuenburg"], 25: ["GE", "Genf"], 26: ["JU", "Jura"],
};

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Unable to download ${url}: ${response.status}`);
  return response.json();
}

function germanTitle(titles) {
  return titles.find((title) => title.langKey === "de")?.text ?? titles[0]?.text ?? "Unbenannte Vorlage";
}

function extractResults(proposal) {
  return Object.fromEntries(proposal.kantone.flatMap((canton) => canton.gemeinden.map((municipality) => [
    String(municipality.geoLevelnummer),
    [
      municipality.resultat.jaStimmenInProzent,
      municipality.resultat.stimmbeteiligungInProzent,
      municipality.resultat.jaStimmenAbsolut,
      municipality.resultat.neinStimmenAbsolut,
      municipality.resultat.anzahlStimmberechtigte,
    ],
  ])));
}

const [topology, ...voteResponses] = await Promise.all([getJson(geometryUrl), ...votingDays.map(({ url }) => getJson(url))]);
const municipalGeometries = topology.objects.k4voge_20260101_gf?.geometries;
if (!Array.isArray(municipalGeometries) || municipalGeometries.length !== 2105) throw new Error("Expected 2,105 current BFS municipal geometries");

const spatialMunicipalityIds = new Set(municipalGeometries.map((geometry) => String(geometry.properties.vogeId)));
const extractedDays = voteResponses.map((response, index) => ({
  date: votingDays[index].date,
  proposals: response.schweiz.vorlagen.map((proposal) => ({
    id: proposal.vorlagenId,
    provisional: proposal.provisorisch,
    title: germanTitle(proposal.vorlagenTitel),
    nationalYesPercentage: proposal.resultat.jaStimmenInProzent,
    results: extractResults(proposal),
  })),
}));

for (const day of extractedDays) {
  for (const proposal of day.proposals) {
    const missingSpatialResults = [...spatialMunicipalityIds].filter((id) => !proposal.results[id]);
    if (missingSpatialResults.length > 0) throw new Error(`Proposal ${proposal.id} is missing ${missingSpatialResults.length} mapped municipalities`);
  }
}

await Promise.all([
  mkdir(dirname(geometryOutput), { recursive: true }),
  mkdir(dirname(votesOutput), { recursive: true }),
  mkdir(dirname(compassOutput), { recursive: true }),
]);

const compassProposals = extractedDays.flatMap((day) => day.proposals.map((proposal) => ({ ...proposal, date: day.date, sourceUrl: votingDays.find((votingDay) => votingDay.date === day.date)?.url })));
const compass = buildPoliticalCompass({
  municipalities: municipalGeometries.map((geometry) => {
    const [cantonCode, cantonName] = cantonDetails[geometry.properties.kantId] ?? [];
    if (!cantonCode) throw new Error(`Unknown canton ${geometry.properties.kantId} for municipality ${geometry.properties.vogeId}`);
    return { id: String(geometry.properties.vogeId), name: geometry.properties.vogeName, cantonCode, cantonName };
  }),
  proposals: compassProposals,
});
if (compass.municipalities.length + compass.missingMunicipalityIds.length !== municipalGeometries.length) throw new Error("Political compass coverage is inconsistent");
if (compass.cantons.length !== 26) throw new Error(`Expected 26 canton compass points, got ${compass.cantons.length}`);
const activeProposalDetails = ACTIVE_PROPOSAL_WEIGHTS.map((weight) => {
  const proposal = compassProposals.find(({ id }) => id === weight.id);
  return { ...weight, date: proposal.date, nationalYesPercentage: proposal.nationalYesPercentage, sourceUrl: proposal.sourceUrl, title: proposal.title };
});
const politicalCompassSnapshot = {
  source: "BFS voteinfo",
  sources: [...new Set(activeProposalDetails.map(({ sourceUrl }) => sourceUrl))],
  methodology: {
    axisLimit: 100,
    deltaClamp: 3,
    excludedProposals: EXCLUDED_PROPOSAL_IDS,
    normalization: "Feste theoretische Achsenspanne: 3 × Summe der absoluten aktiven Gewichte je Achse.",
    standardDeviation: "Populations-Standardabweichung der exakten Ja-Anteile aller aktuellen räumlichen BFS-Gemeinden je Vorlage.",
    weights: activeProposalDetails,
  },
  coverage: { currentMunicipalities: municipalGeometries.length, missingMunicipalityIds: compass.missingMunicipalityIds },
  nationalReferences: compass.nationalReferences,
  standardDeviations: compass.deviations,
  axisDenominators: compass.axisDenominators,
  municipalities: compass.municipalities,
  cantons: compass.cantons,
};
await Promise.all([
  writeFile(geometryOutput, JSON.stringify(topology)),
  writeFile(votesOutput, JSON.stringify({ source: "BFS voteinfo", votingDays: extractedDays })),
  writeFile(compassOutput, JSON.stringify(politicalCompassSnapshot)),
]);

console.log(`Stored ${extractedDays.length} voting days, ${extractedDays.reduce((total, day) => total + day.proposals.length, 0)} proposals, ${compass.municipalities.length} municipal compass points and 26 canton compass points.`);
