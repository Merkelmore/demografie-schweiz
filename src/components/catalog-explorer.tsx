"use client";

import { ArrowDown, BookOpen, Calculator, ChevronDown, Languages, Map as MapIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { SwissCantonMap } from "@/components/swiss-canton-map";
import { MunicipalityVoteExplorer } from "@/components/municipality-vote-explorer";
import { PoliticalCompassModal } from "@/components/political-compass-modal";
import type { CantonCardResponse, CatalogResponse, MapResponse } from "@/lib/catalog";
import { getCanton } from "@/lib/cantons";
import { LanguageProvider, locales, useTranslation } from "@/lib/i18n";
import { useHoverCardPlacement } from "@/lib/use-hover-card";

const cardCacheTtl = 5 * 60 * 1000;
const cardWidth = 340;
const hoverDelay = 110;
const balancedPoliticalScoreThreshold = 0.025;
const strongPoliticalScoreThreshold = 0.1;

type Metric = CantonCardResponse["metrics"][number];
type CategoryCode = "population_total" | "crime_per_100000" | "asylum_pending_per_1000" | "population_foreign_percent" | "fertility_tfr" | "unemployment_rate" | "political_orientation_score" | "cultural_enrichment_score";
type CachedCard = { expiresAt: number; value: CantonCardResponse };
type Source = { metric: string; metricCode: string; referenceDate: string | null; title: string; url: string };

function numberFormat(language: string) {
  return new Intl.NumberFormat(`${language}-CH`, { maximumFractionDigits: 2 });
}

function formatMetric(metric: Metric | undefined, language: string, unavailable: string) {
  if (!metric || metric.value === null) return unavailable;
  const suffix = metric.unit === "percent" ? " %" : metric.unit === "per_1000" ? " pro 1'000" : metric.unit === "per_100000" ? " pro 100'000" : "";
  return `${numberFormat(language).format(metric.value)}${suffix}`;
}

function formatScore(metric: Metric | undefined, language: string, unavailable: string) {
  if (!metric || metric.value === null) return unavailable;
  return `${metric.value >= 0 ? "+" : ""}${numberFormat(language).format(metric.value)}`;
}

function formatPoliticalTendency(metric: Metric | undefined, language: string, unavailable: string, labels: { balanced: string; lightLeft: string; left: string; lightRight: string; right: string }) {
  if (!metric || metric.value === null) return formatScore(metric, language, unavailable);
  const magnitude = Math.abs(metric.value);
  const tendency = magnitude <= balancedPoliticalScoreThreshold
    ? labels.balanced
    : metric.value > 0 ? magnitude < strongPoliticalScoreThreshold ? labels.lightRight : labels.right : magnitude < strongPoliticalScoreThreshold ? labels.lightLeft : labels.left;
  return `${formatScore(metric, language, unavailable)} (${tendency})`;
}

function formatCulturalScore(metric: Metric | undefined, language: string, unavailable: string) {
  if (!metric || metric.value === null) return unavailable;
  return `${numberFormat(language).format(metric.value)} / 100`;
}

function CatalogExplorerContent() {
  const { language, setLanguage, t } = useTranslation();
  const categories = [
    { code: "population_total", label: t("population"), shortLabel: t("population") }, { code: "crime_per_100000", label: t("crime"), shortLabel: t("crime") }, { code: "asylum_pending_per_1000", label: t("asylum"), shortLabel: t("asylum") }, { code: "population_foreign_percent", label: t("foreignPopulation"), shortLabel: t("foreignPopulation") }, { code: "fertility_tfr", label: t("fertility"), shortLabel: t("fertility") }, { code: "unemployment_rate", label: t("unemployment"), shortLabel: t("unemployment") }, { code: "political_orientation_score", label: t("politicalTendency"), shortLabel: t("politicalTendency") }, { code: "cultural_enrichment_score", label: t("culturalScore"), shortLabel: "CES" },
  ] as const;
  const [mapMetric, setMapMetric] = useState<CategoryCode>("population_total");
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);
  const [pinnedCode, setPinnedCode] = useState<string | null>(null);
  const [compassMode, setCompassMode] = useState<"cantons" | null>(null);
  const [isMethodologyOpen, setIsMethodologyOpen] = useState(false);
  const [isSourcesOpen, setIsSourcesOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>();
  const [sourcesError, setSourcesError] = useState<string>();
  const [card, setCard] = useState<CantonCardResponse>();
  const [map, setMap] = useState<MapResponse>();
  const [cardError, setCardError] = useState<string>();
  const [mapError, setMapError] = useState<string>();
  const [municipalityCanton, setMunicipalityCanton] = useState<string | null>(null);
  const cardCache = useRef(new Map<string, CachedCard>());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { cardRef, place, style: cardStyle } = useHoverCardPlacement(cardWidth);
  const activeCode = pinnedCode ?? hoveredCode;

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ metric: mapMetric });

    fetch(`/api/catalog/map?${parameters}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("mapCatalogFailed"));
        return response.json() as Promise<MapResponse>;
      })
      .then((mapResponse) => {
        setMap(mapResponse);
        setMapError(undefined);
      })
      .catch((requestError: unknown) => {
        if ((requestError as { name?: string }).name !== "AbortError") setMapError(requestError instanceof Error ? requestError.message : t("mapValuesFailed"));
      });

    return () => controller.abort();
  }, [mapMetric, t]);

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
        if (!response.ok) throw new Error(t("cantonDataFailed"));
        return response.json() as Promise<CantonCardResponse>;
      })
      .then((cardResponse) => {
        cardCache.current.set(activeCode, { expiresAt: Date.now() + cardCacheTtl, value: cardResponse });
        setCard(cardResponse);
        setCardError(undefined);
      })
      .catch((requestError: unknown) => {
        if ((requestError as { name?: string }).name !== "AbortError") setCardError(requestError instanceof Error ? requestError.message : t("cantonDataFailed"));
      });

    return () => controller.abort();
  }, [activeCode, t]);

  useEffect(() => {
    if (!isSourcesOpen || sources) return;

    const controller = new AbortController();
    fetch("/api/catalog?canton=ZH", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("sourcesFailed"));
        return response.json() as Promise<CatalogResponse>;
      })
      .then((catalog) => {
        const uniqueSources = new Map<string, Source>();
        for (const metric of catalog.metrics) {
          if (!metric.source) continue;
          const source = { metric: metric.name, metricCode: metric.code, referenceDate: metric.referenceDate, title: metric.source.title, url: metric.source.url };
          uniqueSources.set(`${source.metric}:${source.title}:${source.url}`, source);
        }
        setSources([...uniqueSources.values()].sort((left, right) => left.metric.localeCompare(right.metric, "de")));
        setSourcesError(undefined);
      })
      .catch((requestError: unknown) => {
        if ((requestError as { name?: string }).name !== "AbortError") setSourcesError(requestError instanceof Error ? requestError.message : t("sourcesFailed"));
      });

    return () => controller.abort();
  }, [isSourcesOpen, sources, t]);

  useEffect(() => {
    function dismissPinnedCard(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        if (hoverTimer.current) clearTimeout(hoverTimer.current);
        if (municipalityCanton) {
          setMunicipalityCanton(null);
          return;
        }
        setPinnedCode(null);
        setHoveredCode(null);
      }
    }

    window.addEventListener("keydown", dismissPinnedCard);
    return () => window.removeEventListener("keydown", dismissPinnedCard);
  }, [municipalityCanton]);

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const metrics = new Map(card?.metrics.map((metric) => [metric.code, metric]));
  const mapValues = map?.values;
  const culturalScore = metrics.get("cultural_enrichment_score");
  const activeCategory = categories.find((category) => category.code === mapMetric) ?? categories[0];
  const activeMetric = metrics.get(mapMetric);
  const isCardVisible = activeCode !== null;
  const selectedCantonName = activeCode ? getCanton(activeCode)?.name[language] : undefined;
  const tendencyLabels = { balanced: t("tendencyBalanced"), lightLeft: t("tendencyLightLeft"), left: t("tendencyLeft"), lightRight: t("tendencyLightRight"), right: t("tendencyRight") };

  function clearHoverTimer() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  function hoverCanton(code: string, position: { x: number; y: number }) {
    if (pinnedCode) return;
    place(position);
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

  function selectCanton(code: string, position?: { x: number; y: number }) {
    clearHoverTimer();
    if (position) place(position);
    setPinnedCode((selected) => selected === code ? null : code);
    setHoveredCode(code);
  }

  function closeCantonCard() {
    clearHoverTimer();
    setPinnedCode(null);
    setHoveredCode(null);
  }

  function openMunicipalityVotes() {
    if (!activeCode) return;
    setMunicipalityCanton(activeCode);
    closeCantonCard();
  }

  if (municipalityCanton) {
    return <div className="map-page municipality-map-page">
      <header className="site-header">
        <div className="site-header__identity"><span className="site-brand">{t("siteName")}</span></div>
        <div className="site-header__actions"><button className="methodology-trigger" type="button" onClick={() => setMunicipalityCanton(null)}><MapIcon size={15} />{t("backToCantonMap")}</button><LanguageSwitcher language={language} setLanguage={setLanguage} t={t} /></div>
      </header>
      <MunicipalityVoteExplorer cantonCode={municipalityCanton} key={municipalityCanton} onBack={() => setMunicipalityCanton(null)} />
      <footer className="site-footer"><span>BFS · {t("municipalVoteResults")}</span><span>2026</span></footer>
    </div>;
  }

  return (
    <div className="map-page">
      <header className="site-header">
        <div className="site-header__identity">
          <span className="site-brand">{t("siteName")}</span>
          <label className="global-category global-category--desktop"><span>{t("map")}</span><select aria-label={t("map")} value={mapMetric} onChange={(event) => setMapMetric(event.target.value as CategoryCode)}>{categories.map((category) => <option key={category.code} value={category.code}>{category.label}</option>)}</select><ChevronDown size={14} /></label>
          <label className="global-category global-category--mobile"><MapIcon className="global-category__icon" size={15} /><select aria-label={t("map")} value={mapMetric} onChange={(event) => setMapMetric(event.target.value as CategoryCode)}>{categories.map((category) => <option key={category.code} value={category.code}>{category.shortLabel}</option>)}</select><ChevronDown size={14} /></label>
        </div>
        <div className="site-header__actions">
          <button className="methodology-trigger" type="button" onClick={() => setIsSourcesOpen(true)}><BookOpen size={15} />{t("sources")}</button>
          <button className="methodology-trigger" type="button" onClick={() => setIsMethodologyOpen(true)}><Calculator size={15} />{t("cesMethodology")}</button><LanguageSwitcher language={language} setLanguage={setLanguage} t={t} />
        </div>
      </header>
      <main className="map-explorer" aria-label={t("cantonMapAria")}>
        <div className="map-hero">
          <p className="map-nudge">{t("nudge")} <ArrowDown aria-hidden="true" size={16} strokeWidth={2.4} /></p>
          <div className="map-canvas map-canvas--full"><SwissCantonMap language={language} onHover={hoverCanton} onLeave={leaveCanton} selectedCode={activeCode ?? ""} onSelect={selectCanton} valueDomain={mapMetric === "political_orientation_score" ? [-0.6, 0.6] : mapMetric === "cultural_enrichment_score" ? [0, 100] : undefined} values={mapValues} /></div>
        </div>
        {mapError && <span className="map-availability">{mapError}</span>}
        {!mapError && map && Object.keys(mapValues ?? {}).length === 0 && <span className="map-availability">{t("mapNoValues")}</span>}

        {isCardVisible && <aside ref={cardRef} className={`hover-card ${pinnedCode ? "hover-card--pinned" : ""}`} aria-live="polite" aria-label={t("cantonAction")} style={cardStyle} onPointerEnter={clearHoverTimer} onPointerLeave={leaveCanton}>
          <div className="hover-card__header">
            <div className="hover-card__identity">
              <h1>{selectedCantonName ?? card?.selectedGeo.name ?? t("loading")}</h1>
              {pinnedCode && <div className="hover-card__quick-actions"><button type="button" onClick={openMunicipalityVotes}>{t("municipalityLevel")}</button><button type="button" onClick={() => setCompassMode("cantons")}>{t("politicalCompass")}</button></div>}
            </div>
            {pinnedCode && <button type="button" aria-label={t("closeCanton")} onClick={closeCantonCard}><X size={16} /></button>}
          </div>
          {cardError && <p className="hover-card__error">{cardError}</p>}
          {!cardError && <>
            {mapMetric !== "cultural_enrichment_score" && <div className="hover-card__map-value"><span>{activeCategory.label}</span><strong>{mapMetric === "political_orientation_score" ? formatPoliticalTendency(activeMetric, language, t("unavailable"), tendencyLabels) : formatMetric(activeMetric, language, t("unavailable"))}</strong></div>}
            <div className="hover-card__ces"><span>{t("culturalScore")}</span><strong>{formatCulturalScore(culturalScore, language, t("unavailable"))}</strong></div>
            <dl className="hover-card__facts">
              <div><dt>{t("population")}</dt><dd>{formatMetric(metrics.get("population_total"), language, t("unavailable"))}</dd></div>
              <div><dt>{t("crime")}</dt><dd>{formatMetric(metrics.get("crime_per_100000"), language, t("unavailable"))}</dd></div>
              <div><dt>{t("asylum")}</dt><dd>{formatMetric(metrics.get("asylum_pending_per_1000"), language, t("unavailable"))}</dd></div>
              <div><dt>{t("foreignPopulation")}</dt><dd>{formatMetric(metrics.get("population_foreign_percent"), language, t("unavailable"))}</dd></div>
              <div><dt>{t("fertility")}</dt><dd>{formatMetric(metrics.get("fertility_tfr"), language, t("unavailable"))}</dd></div>
              <div><dt>{t("unemployment")}</dt><dd>{formatMetric(metrics.get("unemployment_rate"), language, t("unavailable"))}</dd></div>
              <div><dt>{t("politicalTendency")} {card?.election.referenceDate ? `(${card.election.referenceDate.slice(0, 4)})` : ""}</dt><dd>{formatPoliticalTendency(metrics.get("political_orientation_score"), language, t("unavailable"), tendencyLabels)}</dd></div>
            </dl>
          </>}
        </aside>}
      </main>
      <footer className="site-footer"><span>{t("mainFooter")}</span><span>2026</span></footer>
      {isSourcesOpen && <div className="methodology-backdrop" role="presentation" onClick={() => setIsSourcesOpen(false)}><section className="methodology-dialog sources-dialog" role="dialog" aria-modal="true" aria-labelledby="sources-title" onClick={(event) => event.stopPropagation()}><div className="methodology-dialog__header"><div><span>{t("sourcesKicker")}</span><h2 id="sources-title">{t("sourcesTitle")}</h2></div><button type="button" aria-label={t("closeSources")} onClick={() => setIsSourcesOpen(false)}><X size={18} /></button></div>{sourcesError && <p className="hover-card__error">{sourcesError}</p>}{!sourcesError && !sources && <p className="sources-dialog__loading">{t("sourcesLoading")}</p>}{sources && <ul className="sources-list">{sources.map((source) => <li key={`${source.metric}:${source.title}:${source.url}`}><strong>{categories.find((category) => category.code === source.metricCode)?.label ?? source.metric}</strong><span>{source.title}{source.referenceDate ? ` · ${t("asOf", { date: source.referenceDate })}` : ""}</span>{source.url ? <a href={source.url} rel="noreferrer" target="_blank">{t("openSource")}</a> : <span className="sources-list__local">{t("localCalculation")}</span>}</li>)}</ul>}</section></div>}
      {isMethodologyOpen && <div className="methodology-backdrop" role="presentation" onClick={() => setIsMethodologyOpen(false)}><section className="methodology-dialog" role="dialog" aria-modal="true" aria-labelledby="methodology-title" onClick={(event) => event.stopPropagation()}><div className="methodology-dialog__header"><div><span>{t("methodology")}</span><h2 id="methodology-title">{t("cesTitle")}</h2></div><button type="button" aria-label={t("closeMethodology")} onClick={() => setIsMethodologyOpen(false)}><X size={18} /></button></div><p>{t("cesText")}</p><p className="methodology-formula">{t("cesFormula")}</p><ul><li>{t("cesCrime")}</li><li>{t("cesAsylum")}</li><li>{t("cesForeign")}</li><li>{t("cesUnemployment")}</li></ul><p>{t("cesMissing")}</p></section></div>}
      {compassMode && <PoliticalCompassModal mode={compassMode} onClose={() => setCompassMode(null)} />}
    </div>
  );
}

function LanguageSwitcher({ language, setLanguage, t }: { language: ReturnType<typeof useTranslation>["language"]; setLanguage: ReturnType<typeof useTranslation>["setLanguage"]; t: ReturnType<typeof useTranslation>["t"] }) {
  return <label className="language-switcher"><Languages aria-hidden="true" size={15} /><span className="sr-only">{t("language")}</span><select aria-label={t("language")} value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>{locales.map((locale) => <option key={locale} value={locale}>{locale.toUpperCase()}</option>)}</select><ChevronDown size={13} /></label>;
}

export function CatalogExplorer() {
  return <LanguageProvider><CatalogExplorerContent /></LanguageProvider>;
}
