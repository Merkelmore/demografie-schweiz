import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";
import { cantons } from "@/lib/cantons";

type Point = { x: number; y: number };
type Municipality = Point & { id: string; name: string; canton: string };
type Weight = { id: number; title: string; label: string; date: string; sourceUrl: string; economicWeight: number; authorityWeight: number; nationalYesPercentage: number };
type Snapshot = {
  source: string;
  sources: string[];
  methodology: { axisLimit: number; deltaClamp: number; weights: Weight[]; excludedProposals: Record<string, string> };
  municipalities: Municipality[];
  cantons: (Point & { code: string; name: string })[];
  coverage: { currentMunicipalities: number; missingMunicipalityIds: string[] };
};
type Votes = { votingDays: { date: string; proposals: { id: number; provisional: boolean; results: Record<string, [number, number, number, number, number]> }[] }[] };

function readSnapshot<T>(filename: string): T {
  return JSON.parse(readFileSync(path.join(process.cwd(), "public", "data", filename), "utf8")) as T;
}

export const compassSnapshot = readSnapshot<Snapshot>("political-compass.json");
const voteSnapshot = readSnapshot<Votes>("municipal-votes.json");
const proposals = new Map(voteSnapshot.votingDays.flatMap((day) => day.proposals.map((proposal) => [proposal.id, proposal] as const)));
export const votingDates = [...new Set(compassSnapshot.methodology.weights.map((weight) => weight.date))].sort();
export const hasProvisionalResults = compassSnapshot.methodology.weights.some((weight) => proposals.get(weight.id)?.provisional);

function slugify(name: string) {
  return name.toLowerCase().replaceAll("ä", "ae").replaceAll("ö", "oe").replaceAll("ü", "ue")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export const cantonPages = cantons.map((canton) => ({
  ...canton,
  slug: slugify(canton.name.de),
  point: compassSnapshot.cantons.find((point) => point.code === canton.code),
  municipalities: compassSnapshot.municipalities.filter((point) => point.canton === canton.code)
    .sort((a, b) => a.name.localeCompare(b.name, "de-CH")),
}));

export function getCantonPage(slug: string) {
  return cantonPages.find((canton) => canton.slug === slug);
}

export function cantonVoteResults(code: string) {
  const municipalities = compassSnapshot.municipalities.filter((point) => point.canton === code);
  return compassSnapshot.methodology.weights.map((weight) => {
    const proposal = proposals.get(weight.id);
    const results = municipalities.map(({ id }) => proposal?.results[id]);
    const complete = results.length > 0 && results.every((result) => result && Number.isFinite(result[2]) && Number.isFinite(result[3]));
    const yes = complete ? results.reduce((sum, result) => sum + result![2], 0) : 0;
    const no = complete ? results.reduce((sum, result) => sum + result![3], 0) : 0;
    return { ...weight, provisional: proposal?.provisional ?? false, yesPercentage: complete && yes + no > 0 ? 100 * yes / (yes + no) : null };
  });
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 }).format(value);
}

export function formatCoordinate(value: number) {
  return `${value > 0 ? "+" : ""}${formatNumber(value)}`;
}
