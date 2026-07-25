import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import * as XLSX from "xlsx";

const sourceUrl = "https://dam-api.bfs.admin.ch/hub/api/dam/assets/36073663/master";
const cantonCodes = {
  Aargau: "AG",
  "Appenzell A. Rh.": "AR",
  "Appenzell I. Rh.": "AI",
  "Basel-Landschaft": "BL",
  "Basel-Stadt": "BS",
  Bern: "BE",
  Freiburg: "FR",
  Genf: "GE",
  Glarus: "GL",
  Graubünden: "GR",
  Jura: "JU",
  Luzern: "LU",
  Neuenburg: "NE",
  Nidwalden: "NW",
  Obwalden: "OW",
  Schaffhausen: "SH",
  Schwyz: "SZ",
  Solothurn: "SO",
  "St. Gallen": "SG",
  Tessin: "TI",
  Thurgau: "TG",
  Uri: "UR",
  Waadt: "VD",
  Wallis: "VS",
  Zug: "ZG",
  Zürich: "ZH",
};

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`BFS download failed with ${response.status}`);

const workbook = XLSX.read(Buffer.from(await response.arrayBuffer()), { type: "buffer" });
const years = workbook.SheetNames.filter((name) => /^20\d{2}$/.test(name)).sort();
const cantons = Object.fromEntries(Object.values(cantonCodes).map((code) => [code, {}]));

for (const year of years) {
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[year], { defval: "", header: 1 });
  const valuesForYear = new Map();

  for (const row of rows.slice(5)) {
    const code = cantonCodes[row[0]];
    const population = Number(row[1]);
    if (code && Number.isInteger(population) && population > 0) valuesForYear.set(code, population);
  }

  if (valuesForYear.size !== 26) {
    throw new Error(`Expected 26 canton values for ${year}, received ${valuesForYear.size}`);
  }

  for (const [code, population] of valuesForYear) {
    cantons[code][year] = population;
  }
}

const output = {
  cantons,
  source: {
    dataset: "BFS T 01.02.03.04 - Struktur der ständigen Wohnbevölkerung nach Kanton, 2010-2024",
    license: "Open Government Data (OGD), CC BY 4.0",
    sourceUrl,
  },
  years,
};

const outputDirectory = resolve("public/data");
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, "population.json"), `${JSON.stringify(output)}\n`);

console.log(`Imported ${years.length} years with 26 cantons each into public/data/population.json`);