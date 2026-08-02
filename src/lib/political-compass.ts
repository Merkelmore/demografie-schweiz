"use client";

import { useEffect, useState } from "react";

import { cantons } from "@/lib/cantons";

export type CompassPoint = { canton?: string; cantonName?: string; code?: string; id?: string; name: string; x: number; y: number };
export type CompassWeight = { authorityWeight: number; economicWeight: number; id: number; title: string };
export type CompassData = {
  cantons: CompassPoint[];
  coverage: { currentMunicipalities: number; missingMunicipalityIds: string[] };
  methodology: { excludedProposals: Record<string, string>; weights: CompassWeight[] };
  municipalities: CompassPoint[];
};

/** Model coordinates run from −100 to +100 on both axes; the chart is a square with the origin in its centre. */
export const axisLimit = 100;
/** The axis captions live in the surrounding markup, so the drawing keeps almost the whole viewBox for the plot. */
export const compassChart = { center: 400, extent: 370, size: 800 };

/**
 * The model normalises each axis against its theoretical maximum, so real positions only ever use a fraction of the
 * scale — the authority axis in particular collapses into a thin band around the origin. These constants stretch the
 * cloud for display: the 99th-percentile point is pushed out to `spreadTarget`, and anything beyond it is eased
 * towards the axis limit instead of being clipped, which keeps the ordering of the outliers intact.
 */
const spreadPercentile = 0.99;
const spreadTarget = 92;
const maximumSpreadGain = 8;

export type CompassSpread = { x: number; y: number };

function magnitudeAt(values: number[], quantile: number) {
  const sorted = values.map(Math.abs).sort((left, right) => left - right);
  return sorted[Math.round(quantile * (sorted.length - 1))] ?? 0;
}

function axisGain(values: number[]) {
  const reference = magnitudeAt(values, spreadPercentile);
  return reference > 0 ? Math.min(maximumSpreadGain, spreadTarget / reference) : 1;
}

export function compassSpread(points: CompassPoint[]): CompassSpread {
  return { x: axisGain(points.map((point) => point.x)), y: axisGain(points.map((point) => point.y)) };
}

function easeToLimit(value: number) {
  const magnitude = Math.abs(value);
  if (magnitude <= spreadTarget) return value;
  const headroom = axisLimit - spreadTarget;
  return Math.sign(value) * (spreadTarget + headroom * (1 - Math.exp(-(magnitude - spreadTarget) / headroom)));
}

export function spreadPoint(point: { x: number; y: number }, spread: CompassSpread) {
  return { x: easeToLimit(point.x * spread.x), y: easeToLimit(point.y * spread.y) };
}

export function toChartPoint(point: { x: number; y: number }, spread: CompassSpread, chart = compassChart) {
  const stretched = spreadPoint(point, spread);
  return { x: chart.center + stretched.x * (chart.extent / axisLimit), y: chart.center - stretched.y * (chart.extent / axisLimit) };
}

/** Canton points carry `code`, municipality points carry `canton` — both identify the canton a dot belongs to. */
export function pointCanton(point: CompassPoint) {
  return point.code ?? point.canton;
}

/** Golden-angle hues keep neighbouring cantons far apart in colour; the three tints separate hues that wrap around. */
const cantonHueStep = 137.508;
const cantonTints = [
  { lightness: 45, saturation: 66 },
  { lightness: 58, saturation: 54 },
  { lightness: 34, saturation: 58 },
];

export function cantonColor(code: string | undefined) {
  const index = cantons.findIndex((canton) => canton.code === code);
  if (index < 0) return "#7c8a93";
  const tint = cantonTints[index % cantonTints.length];
  return `hsl(${((index * cantonHueStep) % 360).toFixed(1)} ${tint.saturation}% ${tint.lightness}%)`;
}

/** The four canonical compass quadrants, in the same hues the chart paints behind them. */
export const quadrantHues = { authoritarianLeft: 356, authoritarianRight: 209, libertarianLeft: 108, libertarianRight: 288 };

export function quadrantHue(point: { x: number; y: number }) {
  if (point.y >= 0) return point.x >= 0 ? quadrantHues.authoritarianRight : quadrantHues.authoritarianLeft;
  return point.x >= 0 ? quadrantHues.libertarianRight : quadrantHues.libertarianLeft;
}

/** Fill for a region on a map: the quadrant gives the hue, the distance from the centre gives the strength. */
export function quadrantFill(point: { x: number; y: number }, spread: CompassSpread) {
  const stretched = spreadPoint(point, spread);
  const intensity = Math.min(1, Math.hypot(stretched.x, stretched.y) / axisLimit);
  return `hsl(${quadrantHue(stretched)} ${40 + intensity * 28}% ${89 - intensity * 44}%)`;
}

let snapshot: Promise<CompassData> | undefined;

function loadCompass() {
  snapshot ??= fetch("/data/political-compass.json")
    .then((response) => response.ok ? response.json() as Promise<CompassData> : Promise.reject(new Error("snapshot")))
    .catch((reason: unknown) => {
      snapshot = undefined;
      throw reason;
    });

  return snapshot;
}

/** Shared across the canton map, the municipality map and the compass dialog, so the snapshot is fetched once. */
export function usePoliticalCompass() {
  const [data, setData] = useState<CompassData>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;

    loadCompass()
      .then((loaded) => {
        if (!active) return;
        setData(loaded);
        setError(undefined);
      })
      .catch(() => {
        if (active) setError("Der politische Kompass konnte nicht geladen werden.");
      });

    return () => {
      active = false;
    };
  }, []);

  return { data, error };
}
