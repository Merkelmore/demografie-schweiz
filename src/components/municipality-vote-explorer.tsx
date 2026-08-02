"use client";

import { ArrowLeft, X } from "lucide-react";
import { feature } from "topojson-client";
import { useEffect, useMemo, useRef, useState } from "react";

import { getCanton } from "@/lib/cantons";
import { CompassMiniature } from "@/components/compass-miniature";
import { PoliticalCompassModal } from "@/components/political-compass-modal";
import { compassSpread, quadrantFill, usePoliticalCompass } from "@/lib/political-compass";
import { useHoverCardPlacement } from "@/lib/use-hover-card";

type Position = [number, number];
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

const cantonNumbers: Record<string, number> = {
  ZH: 1, BE: 2, LU: 3, UR: 4, SZ: 5, OW: 6, NW: 7, GL: 8, ZG: 9, FR: 10, SO: 11, BS: 12, BL: 13,
  SH: 14, AR: 15, AI: 16, SG: 17, GR: 18, AG: 19, TG: 20, TI: 21, VD: 22, VS: 23, NE: 24, GE: 25, JU: 26,
};
const viewBox = { height: 560, padding: 24, width: 800 };
const number = new Intl.NumberFormat("de-CH");
const percent = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const cardWidth = 410;
const hoverDelay = 110;
const uncoloredMunicipality = "#dde4e8";

function rings(feature: MunicipalityFeature) {
  return feature.geometry.type === "Polygon" ? feature.geometry.coordinates as Position[][] : (feature.geometry.coordinates as Position[][][]).flat();
}

function bounds(features: MunicipalityFeature[]) {
  const points = features.flatMap((municipality) => rings(municipality).flat());
  return {
    maxX: Math.max(...points.map(([x]) => x)), maxY: Math.max(...points.map(([, y]) => y)),
    minX: Math.min(...points.map(([x]) => x)), minY: Math.min(...points.map(([, y]) => y)),
  };
}

function pathFor(feature: MunicipalityFeature, extent: ReturnType<typeof bounds>) {
  const scale = Math.min((viewBox.width - viewBox.padding * 2) / (extent.maxX - extent.minX), (viewBox.height - viewBox.padding * 2) / (extent.maxY - extent.minY));
  const offsetX = (viewBox.width - (extent.maxX - extent.minX) * scale) / 2;
  const offsetY = (viewBox.height - (extent.maxY - extent.minY) * scale) / 2;
  return rings(feature).map((ring) => ring.map(([x, y], index) => `${index === 0 ? "M" : "L"}${(offsetX + (x - extent.minX) * scale).toFixed(1)} ${(viewBox.height - offsetY - (y - extent.minY) * scale).toFixed(1)}`).join(" ")).join(" ");
}

function resultFor(proposal: Proposal, municipalityId: number) {
  const [yesPct, turnout, yesVotes, noVotes, eligibleVoters] = proposal.results[String(municipalityId)] ?? [];
  return { eligibleVoters, noVotes, turnout, yesPct, yesVotes };
}

/** The electorate barely moves between voting days, so the most recent reported figure represents the municipality. */
function eligibleVoters(proposals: Proposal[], municipalityId: number) {
  return proposals.map((proposal) => resultFor(proposal, municipalityId).eligibleVoters).find((value) => typeof value === "number" && Number.isFinite(value));
}

function formatPercent(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${percent.format(value)} %` : "Nicht verfügbar";
}

function formatNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? number.format(value) : "Nicht verfügbar";
}

export function MunicipalityVoteExplorer({ cantonCode, onBack }: { cantonCode: string; onBack: () => void }) {
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
      if (active) setError("Die BFS-Abstimmungsdaten konnten nicht geladen werden.");
    });
    return () => { active = false; };
  }, []);

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
  if (!data || !extent || (!compass.data && !compass.error)) return <main className="municipality-page"><p className="municipality-status" aria-live="polite">Gemeinde-Abstimmungen werden geladen …</p></main>;

  const selectedPoint = selected && compassPoints.get(String(selected.properties.vogeId));

  return (
    <main className="municipality-page" aria-label={`Gemeinde-Abstimmungen im Kanton ${canton?.name.de ?? cantonCode}`}>
      <section className="municipality-explorer">
        <div className="municipality-map-workspace">
          <div className="municipality-map-toolbar">
            <button className="municipality-back" type="button" onClick={onBack}><ArrowLeft size={16} />Kantonskarte</button>
            <h1>Gemeinden in {canton?.name.de}</h1>
          </div>
          <svg className="municipality-map" viewBox={`0 0 ${viewBox.width} ${viewBox.height}`} role="group" aria-label={`Gemeinden in ${canton?.name.de}, eingefärbt nach ihrer Position im politischen Kompass`}>
            {cantonFeatures.map((municipality) => {
              const point = compassPoints.get(String(municipality.properties.vogeId));
              const isSelected = municipality.properties.vogeId === selectedMunicipality;
              return <path key={municipality.properties.vogeId} aria-label={municipality.properties.vogeName} className={`municipality-region ${isSelected ? "selected" : ""}`} d={pathFor(municipality, extent)} fill={point ? quadrantFill(point, spread) : uncoloredMunicipality} role="button" tabIndex={0} onClick={(event) => pinMunicipality(municipality.properties.vogeId, { x: event.clientX, y: event.clientY })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pinMunicipality(municipality.properties.vogeId); } }} onPointerEnter={(event) => { if (event.pointerType === "mouse") hoverMunicipality(municipality.properties.vogeId, { x: event.clientX, y: event.clientY }); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") leaveMunicipality(); }} />;
            })}
          </svg>
        </div>
        {selected && <aside ref={cardRef} className={`hover-card hover-card--municipality ${pinnedMunicipality !== null ? "hover-card--pinned" : ""}`} aria-live="polite" aria-label={`Abstimmungsresultate für ${selected.properties.vogeName}`} style={cardStyle}>
          <div className="hover-card__header"><h2>{selected.properties.vogeName}</h2>{pinnedMunicipality !== null && <button type="button" aria-label="Fixierte Gemeindedaten schliessen" onClick={() => { setPinnedMunicipality(null); setHoveredMunicipality(null); }}><X size={16} /></button>}</div>
          <div className="municipality-hover-card__content">
            <div className="municipality-summary">
              <div className="municipality-summary__stat"><span>Stimmberechtigte</span><strong>{formatNumber(eligibleVoters(proposals, selected.properties.vogeId))}</strong></div>
              {selectedPoint
                ? <CompassMiniature point={selectedPoint} spread={spread} title={`Position von ${selected.properties.vogeName} im politischen Kompass`} />
                : <p className="municipality-summary__missing">Keine Kompassposition verfügbar.</p>}
              <button type="button" onClick={() => setIsCompassOpen(true)}>Politischer Kompass</button>
            </div>
            <ul className="municipality-proposals">
              {proposals.map((proposal) => {
                const result = resultFor(proposal, selected.properties.vogeId);
                return <li key={proposal.id}><strong>{proposal.title}</strong><span>Ja {formatPercent(result.yesPct)} · Beteiligung {formatPercent(result.turnout)}</span><small>{formatNumber(result.yesVotes)} Ja · {formatNumber(result.noVotes)} Nein{proposal.provisional ? " · provisorisch" : ""}</small></li>;
              })}
            </ul>
          </div>
        </aside>}
      </section>
      <p className="municipality-source">Quelle: Bundesamt für Statistik (BFS), eidgenössische Abstimmungsresultate auf Gemeindeebene. Die Karte enthält die 2&apos;105 räumlichen Gemeinden; 12 Auslandsgemeinden ohne Fläche sind nicht kartiert.</p>
      {isCompassOpen && selected && <PoliticalCompassModal mode="municipalities" originMunicipalityId={String(selected.properties.vogeId)} onClose={() => setIsCompassOpen(false)} />}
    </main>
  );
}
