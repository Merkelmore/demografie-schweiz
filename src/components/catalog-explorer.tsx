"use client";

import { BookOpen, Calculator, ChevronDown, Map as MapIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SwissCantonMap } from "@/components/swiss-canton-map";
import type { CantonCardResponse, CatalogResponse, MapResponse } from "@/lib/catalog";

const number = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 });

const categories = [
  { code: "population_total", label: "Einwohnerzahl", shortLabel: "Einwohner" },
  { code: "crime_per_100000", label: "Kriminalität (PKS)", shortLabel: "Kriminalität" },
  { code: "asylum_pending_per_1000", label: "Asylverfahren", shortLabel: "Asyl" },
  { code: "population_foreign_percent", label: "Ausländische Bevölkerung", shortLabel: "Ausländer" },
  { code: "fertility_tfr", label: "Fertilitätsrate", shortLabel: "Fertilität" },
  { code: "unemployment_rate", label: "Erwerbslosenquote (BFS)", shortLabel: "BFS-Quote" },
  { code: "political_orientation_score", label: "Politische Orientierung", shortLabel: "Politik" },
  { code: "cultural_enrichment_score", label: "Cultural Enrichment Score", shortLabel: "CES" },
] as const;

const cardCacheTtl = 5 * 60 * 1000;
const hoverDelay = 180;

type Metric = CantonCardResponse["metrics"][number];
type CategoryCode = (typeof categories)[number]["code"];
type CachedCard = { expiresAt: number; value: CantonCardResponse };
type Source = { metric: string; referenceDate: string | null; title: string; url: string };

function formatMetric(metric?: Metric) {
  if (!metric || metric.value === null) return metric?.unavailableReason ?? "Nicht importiert";
  const suffix = metric.unit === "percent" ? " %" : metric.unit === "per_1000" ? " pro 1'000" : metric.unit === "per_100000" ? " pro 100'000" : metric.unit === "births_per_woman" ? " Kinder je Frau" : "";
  return `${number.format(metric.value)}${suffix}`;
}

function formatScore(metric?: Metric) {
  if (!metric || metric.value === null) return formatMetric(metric);
  return `${metric.value >= 0 ? "+" : ""}${number.format(metric.value)}`;
}

function formatCulturalScore(metric?: Metric) {
  if (!metric || metric.value === null) return formatMetric(metric);
  return `${number.format(metric.value)} / 100`;
}

function hasElectionShares(partyShares: CantonCardResponse["election"]["partyShares"]) {
  return ["SP", "GPS", "Mitte", "GLP", "FDP", "SVP"].every((party) => party in partyShares);
}

function formatElectionShares(partyShares: CantonCardResponse["election"]["partyShares"]) {
  return ["SP", "GPS", "Mitte", "GLP", "FDP", "SVP"].map((party) => `${party} ${number.format(partyShares[party as keyof typeof partyShares] ?? 0)} %`).join(" · ");
}

export function CatalogExplorer() {
  const [mapMetric, setMapMetric] = useState<CategoryCode>("population_total");
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [pinnedCode, setPinnedCode] = useState<string | null>(null);
  const [cardPosition, setCardPosition] = useState({ x: 24, y: 76 });
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>();
  const [sourcesError, setSourcesError] = useState<string>();
  const [card, setCard] = useState<CantonCardResponse>();
  const [map, setMap] = useState<MapResponse>();
  const [cardError, setCardError] = useState<string>();
  const [mapError, setMapError] = useState<string>();
  const cardCache = useRef(new Map<string, CachedCard>());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeCode = pinnedCode ?? hoveredCode;

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ metric: mapMetric });

    fetch(`/api/catalog/map?${parameters}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Der lokale Datenkatalog konnte nicht geladen werden.");
        return response.json() as Promise<MapResponse>;
      })
      .then((mapResponse) => {
        setMap(mapResponse);
        setMapError(undefined);
      })
      .catch((requestError: unknown) => {
        if ((requestError as { name?: string }).name !== "AbortError") setMapError(requestError instanceof Error ? requestError.message : "Die Kartenwerte konnten nicht geladen werden.");
      });

    return () => controller.abort();
  }, [mapMetric]);

  useEffect(() => {
    if (!activeCode) return;

    const cachedCard = cardCache.current.get(activeCode);
    if (cachedCard && cachedCard.expiresAt > Date.now()) {
      setCard(cachedCard.value);
      setCardError(undefined);
      return;
    }

    const controller = new AbortController();
    setCard(undefined);
    fetch(`/api/catalog/card?${new URLSearchParams({ canton: activeCode })}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Die Kantonsdaten konnten nicht geladen werden.");
        return response.json() as Promise<CantonCardResponse>;
      })
      .then((cardResponse) => {
        cardCache.current.set(activeCode, { expiresAt: Date.now() + cardCacheTtl, value: cardResponse });
        setCard(cardResponse);
        setCardError(undefined);
      })
      .catch((requestError: unknown) => {
        if ((requestError as { name?: string }).name !== "AbortError") setCardError(requestError instanceof Error ? requestError.message : "Die Kantonsdaten konnten nicht geladen werden.");
      });

    return () => controller.abort();
  }, [activeCode]);

  useEffect(() => {
    if (!isSourcesOpen || sources) return;

    const controller = new AbortController();
    fetch("/api/catalog?canton=ZH", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Die Quellen konnten nicht geladen werden.");
        return response.json() as Promise<CatalogResponse>;
      })
      .then((catalog) => {
        const uniqueSources = new Map<string, Source>();
        for (const metric of catalog.metrics) {
          if (!metric.source) continue;
          const source = { metric: metric.name, referenceDate: metric.referenceDate, title: metric.source.title, url: metric.source.url };
          uniqueSources.set(`${source.metric}:${source.title}:${source.url}`, source);
        }
        setSources([...uniqueSources.values()].sort((left, right) => left.metric.localeCompare(right.metric, "de")));
        setSourcesError(undefined);
      })
      .catch((requestError: unknown) => {
        if ((requestError as { name?: string }).name !== "AbortError") setSourcesError(requestError instanceof Error ? requestError.message : "Die Quellen konnten nicht geladen werden.");
      });

    return () => controller.abort();
  }, [isSourcesOpen, sources]);

  useEffect(() => {
    function dismissPinnedCard(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        setPinnedCode(null);
        setHoveredCode(null);
      }
    }

    window.addEventListener("keydown", dismissPinnedCard);
    return () => window.removeEventListener("keydown", dismissPinnedCard);
  }, []);

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const metrics = new Map(card?.metrics.map((metric) => [metric.code, metric]));
  const mapValues = map?.values;
  const electionShares = card?.election.partyShares ?? {};
  const electionAvailable = hasElectionShares(electionShares);
  const culturalScore = metrics.get("cultural_enrichment_score");
  const activeCategory = categories.find((category) => category.code === mapMetric) ?? categories[0];
  const activeMetric = metrics.get(mapMetric);
  const isCardVisible = pinnedCode !== null || hoveredCode !== null;

  function clearHoverTimer() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  function positionCard(position: { x: number; y: number }) {
    const cardWidth = 340;
    const cardHeight = 470;
    setCardPosition({
      x: Math.max(12, Math.min(position.x + 16, window.innerWidth - cardWidth - 12)),
      y: Math.max(64, Math.min(position.y + 16, window.innerHeight - cardHeight - 12)),
    });
  }

  function hoverCanton(code: string, position: { x: number; y: number }) {
    if (pinnedCode) return;
    positionCard(position);
    if (hoveredCode === code) return;

    clearHoverTimer();
    const cachedCard = cardCache.current.get(code);
    if (cachedCard && cachedCard.expiresAt > Date.now()) {
      setCardError(undefined);
      setHoveredCode(code);
      return;
    }

    hoverTimer.current = setTimeout(() => {
      setCardError(undefined);
      setHoveredCode(code);
      hoverTimer.current = null;
    }, hoverDelay);
  }

  function leaveCanton() {
    if (pinnedCode) return;
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => {
      setHoveredCode(null);
      hoverTimer.current = null;
    }, hoverDelay);
  }

  function selectCanton(code: string) {
    clearHoverTimer();
    setCardError(undefined);
    if (pinnedCode === code) {
      setPinnedCode(null);
      setHoveredCode(null);
      return;
    }
    setPinnedCode(code);
    setHoveredCode(code);
  }

  return (
    <div className="map-page">
      <header className="site-header">
        <div className="site-header__identity">
          <span className="site-brand">Cultural Enrichment Radar</span>
          <label className="global-category global-category--desktop"><span>Karte</span><select aria-label="Kartenkategorie" value={mapMetric} onChange={(event) => setMapMetric(event.target.value as CategoryCode)}>{categories.map((category) => <option key={category.code} value={category.code}>{category.label}</option>)}</select><ChevronDown size={14} /></label>
          <label className="global-category global-category--mobile"><MapIcon className="global-category__icon" size={15} /><select aria-label="Kartenkategorie" value={mapMetric} onChange={(event) => setMapMetric(event.target.value as CategoryCode)}>{categories.map((category) => <option key={category.code} value={category.code}>{category.shortLabel}</option>)}</select><ChevronDown size={14} /></label>
        </div>
        <div className="site-header__actions">
          <button className="methodology-trigger" type="button" onClick={() => setIsSourcesOpen(true)}><BookOpen size={15} />Quellen</button>
          <button className="methodology-trigger" type="button" onClick={() => setIsMethodologyOpen(true)}><Calculator size={15} />Was ist Cultural Enrichment Score?</button>
        </div>
      </header>
      <main className="map-explorer" aria-label="Interaktive Karte der Schweizer Kantone">
        <div className="map-canvas map-canvas--full"><SwissCantonMap language="de" onHover={hoverCanton} onLeave={leaveCanton} selectedCode={pinnedCode ?? hoveredCode ?? ""} onSelect={selectCanton} valueDomain={mapMetric === "political_orientation_score" ? [-0.2, 0.2] : mapMetric === "cultural_enrichment_score" ? [0, 100] : undefined} values={mapValues} /></div>
        {mapError && <span className="map-availability">{mapError}</span>}
        {!mapError && map && Object.keys(mapValues ?? {}).length === 0 && <span className="map-availability">Keine Kantonswerte</span>}

        {isCardVisible && <aside className={`hover-card ${pinnedCode ? "hover-card--pinned" : ""}`} aria-live="polite" aria-label="Kantonsdaten" style={{ left: cardPosition.x, top: cardPosition.y }}>
          <div className="hover-card__header"><div><span>KANTON</span><h1>{card?.selectedGeo.name ?? "Wird geladen …"}</h1></div>{pinnedCode && <button type="button" aria-label="Fixierte Kantonsdaten schliessen" onClick={() => { setPinnedCode(null); setHoveredCode(null); }}><X size={16} /></button>}</div>
          {cardError && <p className="hover-card__error">{cardError}</p>}
          {!cardError && <>
            {mapMetric !== "cultural_enrichment_score" && <div className="hover-card__map-value"><span>{activeCategory.label}</span><strong>{mapMetric === "political_orientation_score" ? formatScore(activeMetric) : formatMetric(activeMetric)}</strong></div>}
            <div className="hover-card__ces"><span>Cultural Enrichment Score</span><strong>{formatCulturalScore(culturalScore)}</strong></div>
            <dl className="hover-card__facts">
              <div><dt>Einwohnerzahl</dt><dd>{formatMetric(metrics.get("population_total"))}</dd></div>
              <div><dt>Kriminalität (PKS)</dt><dd>{formatMetric(metrics.get("crime_per_100000"))}</dd></div>
              <div><dt>Offene Asylverfahren</dt><dd>{formatMetric(metrics.get("asylum_pending_per_1000"))}</dd></div>
              <div><dt>Ausländische Bevölkerung</dt><dd>{formatMetric(metrics.get("population_foreign_percent"))}</dd></div>
              <div><dt>Fertilitätsrate</dt><dd>{formatMetric(metrics.get("fertility_tfr"))}</dd></div>
              <div><dt>Erwerbslosenquote (BFS)</dt><dd>{formatMetric(metrics.get("unemployment_rate"))}</dd></div>
              <div className="hover-card__political"><dt>Politische Orientierung {card?.election.referenceDate ? `(${card.election.referenceDate.slice(0, 4)})` : ""}</dt><dd>{electionAvailable ? <><span>{formatElectionShares(electionShares)}</span><span>Score {formatScore(metrics.get("political_orientation_score"))}</span></> : formatScore(metrics.get("political_orientation_score"))}</dd></div>
            </dl>
          </>}
        </aside>}
      </main>
      <footer className="site-footer"><span>BFS · SEM · Lokaler Datenkatalog</span><span>2026</span></footer>
      {isSourcesOpen && <div className="methodology-backdrop" role="presentation" onClick={() => setIsSourcesOpen(false)}><section className="methodology-dialog sources-dialog" role="dialog" aria-modal="true" aria-labelledby="sources-title" onClick={(event) => event.stopPropagation()}><div className="methodology-dialog__header"><div><span>DATENGRUNDLAGEN</span><h2 id="sources-title">Quellen</h2></div><button type="button" aria-label="Quellen schliessen" onClick={() => setIsSourcesOpen(false)}><X size={18} /></button></div>{sourcesError && <p className="hover-card__error">{sourcesError}</p>}{!sourcesError && !sources && <p className="sources-dialog__loading">Quellen werden geladen …</p>}{sources && <ul className="sources-list">{sources.map((source) => <li key={`${source.metric}:${source.title}:${source.url}`}><strong>{source.metric}</strong><span>{source.title}{source.referenceDate ? ` · Stand ${source.referenceDate}` : ""}</span>{source.url ? <a href={source.url} rel="noreferrer" target="_blank">Originalquelle öffnen</a> : <span className="sources-list__local">Lokale Berechnung aus den genannten Datenquellen</span>}</li>)}</ul>}</section></div>}
      {isMethodologyOpen && <div className="methodology-backdrop" role="presentation" onClick={() => setIsMethodologyOpen(false)}><section className="methodology-dialog" role="dialog" aria-modal="true" aria-labelledby="methodology-title" onClick={(event) => event.stopPropagation()}><div className="methodology-dialog__header"><div><span>BERECHNUNG</span><h2 id="methodology-title">Cultural Enrichment Score</h2></div><button type="button" aria-label="Berechnung schliessen" onClick={() => setIsMethodologyOpen(false)}><X size={18} /></button></div><p>Nicht amtlicher Kompositindex. Alle vier Faktoren werden über die aktuell verfügbaren Kantone auf 0 bis 100 normiert und zählen gleich stark.</p><p className="methodology-formula">CES = 0.25 × (Kriminalität + offene Asylverfahren + ausländische Bevölkerung + Erwerbslosenquote)</p><ul><li>Kriminalität pro 100&apos;000: 2025</li><li>Offene Asylverfahren pro 1&apos;000: 30.06.2026</li><li>Ausländische Bevölkerung: 2024</li><li>BFS-Erwerbslosenquote: 2024</li></ul><p>Höhere Werte bedeuten nur höhere normierte Werte dieser vier Faktoren. Für Appenzell Innerrhoden wird kein Score angezeigt, weil BFS die Erwerbslosenquote 2024 nicht veröffentlicht hat.</p></section></div>}
    </div>
  );
}