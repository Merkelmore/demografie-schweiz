import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "..");
const geometryUrl = "https://dam-api.bfs.admin.ch/hub/api/dam/assets/36438312/master";
const geometryOutput = resolve(projectRoot, "public/geo/municipalities-2026.topojson");
const votesOutput = resolve(projectRoot, "public/data/municipal-votes.json");
const votingDays = [
  { date: "2026-06-14", url: "https://ogd-static.voteinfo-app.ch/v1/ogd/sd-t-17-02-20260614-eidgAbstimmung.json" },
  { date: "2026-03-08", url: "https://ogd-static.voteinfo-app.ch/v1/ogd/sd-t-17-02-20260308-eidgAbstimmung.json" },
  { date: "2025-11-30", url: "https://ogd-static.voteinfo-app.ch/v1/ogd/sd-t-17-02-20251130-eidgAbstimmung.json" },
];

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
]);
await Promise.all([
  writeFile(geometryOutput, JSON.stringify(topology)),
  writeFile(votesOutput, JSON.stringify({ source: "BFS voteinfo", votingDays: extractedDays })),
]);

console.log(`Stored ${extractedDays.length} voting days, ${extractedDays.reduce((total, day) => total + day.proposals.length, 0)} proposals and 2,105 municipal geometries.`);
