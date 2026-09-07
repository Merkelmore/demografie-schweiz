"use client";

import { ArrowLeft, X } from "lucide-react";
import { feature } from "topojson-client";
import { useEffect, useMemo, useRef, useState } from "react";

import { cantonNumbers, getCanton } from "@/lib/cantons";
import { RegionMap } from "@/components/region-map";
import { regionBounds as bounds, regionPath as pathFor, type Position } from "@/lib/map-geometry";
import { CompassMiniature } from "@/components/compass-miniature";
import { PoliticalCompassModal } from "@/components/political-compass-modal";
import { compassSpread, quadrantFill, usePoliticalCompass } from "@/lib/political-compass";
import { formattingLocale, useTranslation } from "@/lib/i18n";
import { useHoverCardPlacement } from "@/lib/use-hover-card";

type MunicipalityFeature = {
  geometry: { coordinates: Position[][] | Position[][][]; type: "Polygon" | "MultiPolygon" };
  properties: { kantId: number; vogeId: number; vogeName: string };
  type: "Feature";
};
type MunicipalityTopology = { objects: Record<string, unknown>; type: "Topology" };
type VoteResult = [number, number, number, number, number];
type Proposal = { id: number; provisional: boolean; results: Record<string, VoteResult>; title: string };
type VotingDay = { date: string; proposals: Proposal[] };
type VoteData = { source: string; votingDays: VotingDay[] };

const cardWidth = 410;
const hoverDelay = 110;
const uncoloredMunicipality = "#dde4e8";
function resultFor(proposal: Proposal, municipalityId: number) {
  const [yesPct, turnout, yesVotes, noVotes, eligibleVoters] = proposal.results[String(municipalityId)] ?? [];
  return { eligibleVoters, noVotes, turnout, yesPct, yesVotes };
}

/** The electorate barely moves between voting days, so the most recent reported figure represents the municipality. */
function eligibleVoters(proposals: Proposal[], municipalityId: number) {
  return proposals.map((proposal) => resultFor(proposal, municipalityId).eligibleVoters).find((value) => typeof value === "number" && Number.isFinite(value));
}

function formatPercent(value: number | undefined, language: string, unavailable: string) {
  return typeof value === "number" && Number.isFinite(value) ? `${new Intl.NumberFormat(formattingLocale(language), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value)} %` : unavailable;
}

function formatNumber(value: number | undefined, language: string, unavailable: string) {
  return typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat(formattingLocale(language)).format(value) : unavailable;
}

export function MunicipalityVoteExplorer({ cantonCode, onBack }: { cantonCode: string; onBack: () => void }) {
  const { language, t } = useTranslation();
  const [data, setData] = useState<VoteData>();
  const [features, setFeatures] = useState<MunicipalityFeature[]>([]);
  const [error, setError] = useState<string>();
  const [hoveredMunicipality, setHoveredMunicipality] = useState<number | null>(null);
  const [pinnedMunicipality, setPinnedMunicipality] = useState<number | null>(null);
  const [isCompassOpen, setIsCompassOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { cardRef, place, style: cardStyle } = useHoverCardPlacement(cardWidth);
  const compass = usePoliticalCompass();
  const canton = getCanton(cantonCode);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/data/municipal-votes.json").then((response) => response.ok ? response.json() as Promise<VoteData> : Promise.reject(new Error("vote data"))),
      fetch("/geo/municipalities-2026.topojson").then((response) => response.ok ? response.json() as Promise<MunicipalityTopology> : Promise.reject(new Error("geometry"))),
    ]).then(([votes, topology]) => {
      const collection = feature(topology as Parameters<typeof feature>[0], topology.objects.k4voge_20260101_gf as Parameters<typeof feature>[1]) as unknown as { features: MunicipalityFeature[] };
      if (!active) return;
      setData(votes);
      setFeatures(collection.features);
    }).catch(() => {
      if (active) setError(t("municipalityFailed"));
    });
    return () => { active = false; };
  }, [t]);

  const cantonFeatures = useMemo(() => features.filter((municipality) => municipality.properties.kantId === cantonNumbers[cantonCode]), [cantonCode, features]);
  const proposals = useMemo(() => data?.votingDays.flatMap((day) => day.proposals) ?? [], [data]);
  const extent = useMemo(() => cantonFeatures.length > 0 ? bounds(cantonFeatures) : undefined, [cantonFeatures]);
  /** Stretch the compass against every Swiss municipality, so the colours mean the same thing in every canton. */
  const spread = useMemo(() => compassSpread(compass.data?.municipalities ?? []), [compass.data]);
  const compassPoints = useMemo(() => new Map((compass.data?.municipalities ?? []).map((point) => [point.id, point])), [compass.data]);
  const selectedMunicipality = pinnedMunicipality ?? hoveredMunicipality;
  const selected = cantonFeatures.find((municipality) => municipality.properties.vogeId === selectedMunicipality);

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  useEffect(() => {
    function dismissMunicipalityCard(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      setPinnedMunicipality(null);
      setHoveredMunicipality(null);
    }

    window.addEventListener("keydown", dismissMunicipalityCard);
    return () => window.removeEventListener("keydown", dismissMunicipalityCard);
  }, []);

  function clearHoverTimer() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  }

  function hoverMunicipality(id: number, position: { x: number; y: number }) {
    if (pinnedMunicipality !== null) return;
    place(position);
    if (hoveredMunicipality === id) return;
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => {
      setHoveredMunicipality(id);
      hoverTimer.current = null;
    }, hoverDelay);
  }

  function leaveMunicipality() {
    if (pinnedMunicipality !== null) return;
    clearHoverTimer();
    hoverTimer.current = setTimeout(() => {
      setHoveredMunicipality(null);
      hoverTimer.current = null;
    }, hoverDelay);
  }

  function pinMunicipality(id: number, position?: { x: number; y: number }) {
    clearHoverTimer();
    if (position) place(position);
    if (pinnedMunicipality === id) {
      setPinnedMunicipality(null);
      setHoveredMunicipality(null);
      return;
    }
    setPinnedMunicipality(id);
    setHoveredMunicipality(id);
  }

  if (error) return <main className="municipality-page"><p className="municipality-status" role="alert">{error}</p></main>;
  if (!data || !extent || (!compass.data && !compass.error)) return <main className="municipality-page"><p className="municipality-status" aria-live="polite">{t("municipalityLoading")}</p></main>;

  const selectedPoint = selected && compassPoints.get(String(selected.properties.vogeId));

  return (
    <main className="municipality-page" aria-label={t("municipalitiesIn", { canton: canton?.name[language] ?? cantonCode })}>
      <section className="municipality-explorer">
        <div className="municipality-map-workspace">
          <div className="municipality-map-toolbar">
            <button className="municipality-back" type="button" onClick={onBack}><ArrowLeft size={16} />{t("backToCantonMap")}</button>
            <h1>{t("municipalitiesIn", { canton: canton?.name[language] ?? cantonCode })}</h1>
          </div>
          <RegionMap className="municipality-map-viewport" mapClassName="municipality-map" ariaLabel={t("municipalityMapAria", { canton: canton?.name[language] ?? cantonCode })}>
          {cantonFeatures.map((municipality) => {
              const point = compassPoints.get(String(municipality.properties.vogeId));
              const isSelected = municipality.properties.vogeId === selectedMunicipality;
              return <path key={municipality.properties.vogeId} aria-label={municipality.properties.vogeName} className={`municipality-region ${isSelected ? "selected" : ""}`} d={pathFor(municipality, extent)} fill={point ? quadrantFill(point, spread) : uncoloredMunicipality} role="button" tabIndex={0} onClick={(event) => pinMunicipality(municipality.properties.vogeId, { x: event.clientX, y: event.clientY })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pinMunicipality(municipality.properties.vogeId); } }} onPointerEnter={(event) => { if (event.pointerType === "mouse") hoverMunicipality(municipality.properties.vogeId, { x: event.clientX, y: event.clientY }); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") leaveMunicipality(); }} />;
            })}
          </RegionMap>
        </div>
        {selected && <aside ref={cardRef} className={`hover-card hover-card--municipality ${pinnedMunicipality !== null ? "hover-card--pinned" : ""}`} aria-live="polite" aria-label={t("municipalityResultsAria", { municipality: selected.properties.vogeName })} style={cardStyle}>
          <div className="hover-card__header"><h2>{selected.properties.vogeName}</h2>{pinnedMunicipality !== null && <button type="button" aria-label={t("closeMunicipality")} onClick={() => { setPinnedMunicipality(null); setHoveredMunicipality(null); }}><X size={16} /></button>}</div>
          <div className="municipality-hover-card__content">
            <div className="municipality-summary">
              <div className="municipality-summary__stat"><span>{t("eligibleVoters")}</span><strong>{formatNumber(eligibleVoters(proposals, selected.properties.vogeId), language, t("unavailable"))}</strong></div>
              {selectedPoint
                ? <CompassMiniature point={selectedPoint} spread={spread} title={t("municipalityPosition", { municipality: selected.properties.vogeName })} />
                : <p className="municipality-summary__missing">{t("noCompassPosition")}</p>}
              <button type="button" onClick={() => setIsCompassOpen(true)}>{t("politicalCompass")}</button>
            </div>
            <ul className="municipality-proposals">
              {proposals.map((proposal) => {
                const result = resultFor(proposal, selected.properties.vogeId);
                return <li key={proposal.id}><strong>{proposal.title}</strong><span>{t("yes")} {formatPercent(result.yesPct, language, t("unavailable"))} · {t("turnout")} {formatPercent(result.turnout, language, t("unavailable"))}</span><small>{formatNumber(result.yesVotes, language, t("unavailable"))} {t("yes")} · {formatNumber(result.noVotes, language, t("unavailable"))} {t("no")}{proposal.provisional ? ` · ${t("provisional")}` : ""}</small></li>;
              })}
            </ul>
          </div>
        </aside>}
      </section>
      <p className="municipality-source">{t("municipalSource")}</p>
      {isCompassOpen && selected && <PoliticalCompassModal mode="municipalities" initialCantonCode={cantonCode} originMunicipalityId={String(selected.properties.vogeId)} onClose={() => setIsCompassOpen(false)} />}
    </main>
  );
}
