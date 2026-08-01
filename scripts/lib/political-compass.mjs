export const ACTIVE_PROPOSAL_WEIGHTS = Object.freeze([
  { id: 6860, economicWeight: 0.9, authorityWeight: 1.7, label: "Nachhaltigkeitsinitiative «Keine 10-Millionen-Schweiz»" },
  { id: 6870, economicWeight: 0.2, authorityWeight: 1.4, label: "Änderung Zivildienstgesetz" },
  { id: 6821, economicWeight: 0.5, authorityWeight: -0.8, label: "Bargeld-Initiative" },
  { id: 6830, economicWeight: 1.3, authorityWeight: -0.5, label: "SRG-Initiative («200 Franken sind genug»)" },
  { id: 6840, economicWeight: -1.4, authorityWeight: 0.3, label: "Klimafonds-Initiative" },
  { id: 6850, economicWeight: -0.3, authorityWeight: -0.8, label: "Individualbesteuerung" },
  { id: 6810, economicWeight: -1.8, authorityWeight: 1.3, label: "Initiative für eine Zukunft" },
  { id: 6780, economicWeight: 0, authorityWeight: -1, label: "Eigenmietwert-/Zweitliegenschaftssteuer-Reform" },
  { id: 6790, economicWeight: -0.4, authorityWeight: 0.6, label: "E-ID-Gesetz" },
]);

export const EXCLUDED_PROPOSAL_IDS = Object.freeze({
  6800: "Service-citoyen-Initiative wird nicht berücksichtigt",
  6822: "Bargeld-Gegenvorschlag wird nicht separat gewichtet",
  6823: "Stichfrage wird nicht gewichtet",
});

export const DELTA_CLAMP = 3;
export const AXIS_LIMIT = 100;

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function yesPercentage(result) {
  return Array.isArray(result) && finite(result[0]) ? result[0] : undefined;
}

function voteCounts(result) {
  if (!Array.isArray(result) || !finite(result[2]) || !finite(result[3])) return undefined;
  const total = result[2] + result[3];
  return total > 0 ? { yes: result[2], no: result[3] } : undefined;
}

export function populationStandardDeviation(values) {
  const valid = values.filter(finite);
  if (valid.length === 0) return 0;
  const mean = valid.reduce((sum, value) => sum + value, 0) / valid.length;
  return Math.sqrt(valid.reduce((sum, value) => sum + (value - mean) ** 2, 0) / valid.length);
}

export function clamp(value, lower, upper) {
  return Math.max(lower, Math.min(upper, value));
}

export function axisDenominators(weights = ACTIVE_PROPOSAL_WEIGHTS) {
  return {
    x: DELTA_CLAMP * weights.reduce((sum, weight) => sum + Math.abs(weight.economicWeight), 0),
    y: DELTA_CLAMP * weights.reduce((sum, weight) => sum + Math.abs(weight.authorityWeight), 0),
  };
}

export function normalizeAxis(raw, denominator) {
  if (!finite(raw) || denominator <= 0) return undefined;
  return Number(clamp((raw / denominator) * AXIS_LIMIT, -AXIS_LIMIT, AXIS_LIMIT).toFixed(2));
}

function coordinateForPercentages(percentages, references, deviations, weights) {
  let xRaw = 0;
  let yRaw = 0;
  for (const weight of weights) {
    const percentage = percentages[weight.id];
    const reference = references[weight.id];
    const deviation = deviations[weight.id];
    if (!finite(percentage) || !finite(reference) || !finite(deviation) || deviation <= 0) return undefined;
    const delta = clamp((percentage - reference) / deviation, -DELTA_CLAMP, DELTA_CLAMP);
    xRaw += delta * weight.economicWeight;
    yRaw += delta * weight.authorityWeight;
  }
  const denominator = axisDenominators(weights);
  return { x: normalizeAxis(xRaw, denominator.x), y: normalizeAxis(yRaw, denominator.y), xRaw, yRaw };
}

function indexedResults(proposals) {
  return new Map(proposals.map((proposal) => [proposal.id, proposal]));
}

function municipalPercentages(municipalityId, proposals, weights) {
  return Object.fromEntries(weights.map((weight) => [weight.id, yesPercentage(proposals.get(weight.id)?.results[String(municipalityId)])]));
}

export function aggregateCantonPercentages(municipalities, proposals, weights) {
  const values = {};
  for (const weight of weights) {
    let yes = 0;
    let no = 0;
    for (const municipality of municipalities) {
      const counts = voteCounts(proposals.get(weight.id)?.results[String(municipality.id)]);
      if (!counts) return undefined;
      yes += counts.yes;
      no += counts.no;
    }
    values[weight.id] = (yes / (yes + no)) * 100;
  }
  return values;
}

export function buildPoliticalCompass({ municipalities, proposals, weights = ACTIVE_PROPOSAL_WEIGHTS }) {
  const proposalById = indexedResults(proposals);
  const missingProposalIds = weights.filter(({ id }) => !proposalById.has(id)).map(({ id }) => id);
  if (missingProposalIds.length) throw new Error(`Missing active proposals: ${missingProposalIds.join(", ")}`);

  const references = {};
  const deviations = {};
  for (const weight of weights) {
    const proposal = proposalById.get(weight.id);
    if (!finite(proposal.nationalYesPercentage)) throw new Error(`Proposal ${weight.id} has no national yes percentage`);
    references[weight.id] = proposal.nationalYesPercentage;
    deviations[weight.id] = populationStandardDeviation(municipalities.map(({ id }) => yesPercentage(proposal.results[String(id)])));
    if (deviations[weight.id] <= 0) throw new Error(`Proposal ${weight.id} has no municipal variation`);
  }

  const missingMunicipalityIds = [];
  const municipalityPoints = [];
  for (const municipality of municipalities) {
    const point = coordinateForPercentages(municipalPercentages(municipality.id, proposalById, weights), references, deviations, weights);
    if (!point) {
      missingMunicipalityIds.push(String(municipality.id));
      continue;
    }
    municipalityPoints.push({ id: String(municipality.id), name: municipality.name, canton: municipality.cantonCode, cantonName: municipality.cantonName, x: point.x, y: point.y });
  }

  const cantonPoints = [];
  const byCanton = new Map();
  for (const municipality of municipalities) {
    const canton = byCanton.get(municipality.cantonCode) ?? [];
    canton.push(municipality);
    byCanton.set(municipality.cantonCode, canton);
  }
  for (const [code, cantonMunicipalities] of byCanton) {
    const percentages = aggregateCantonPercentages(cantonMunicipalities, proposalById, weights);
    const point = percentages && coordinateForPercentages(percentages, references, deviations, weights);
    if (point) cantonPoints.push({ code, name: cantonMunicipalities[0].cantonName, x: point.x, y: point.y });
  }

  return {
    axisDenominators: axisDenominators(weights),
    cantons: cantonPoints.sort((left, right) => left.code.localeCompare(right.code)),
    deviations,
    missingMunicipalityIds,
    municipalities: municipalityPoints,
    nationalReferences: references,
  };
}
