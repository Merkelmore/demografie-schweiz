"use client";

import { ArrowLeft, ChevronDown, X } from "lucide-react";
import { feature } from "topojson-client";
import { useEffect, useMemo, useRef, useState } from "react";

import { getCanton } from "@/lib/cantons";
import { PoliticalCompassModal } from "@/components/political-compass-modal";

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
const hoverDelay = 180;

function formatDate(date: string) {
  return new Intl.DateTimeFormat("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${date}T00:00:00Z`));
}

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
  const [cardPosition, setCardPosition] = useState({ x: 24, y: 76 });
  const [selectedProposalId, setSelectedProposalId] = useState<number>();
  const [isCompassOpen, setIsCompassOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const allProposals = useMemo(() => data?.votingDays.flatMap((day) => day.proposals.map((proposal) => ({ ...proposal, date: day.date }))) ?? [], [data]);
  const activeProposal = allProposals.find((proposal) => proposal.id === selectedProposalId) ?? allProposals[0];
  const selectedMunicipality = pinnedMunicipality ?? hoveredMunicipality;
  const selected = cantonFeatures.find((municipality) => municipality.properties.vogeId === selectedMunicipality);
  const extent = useMemo(() => cantonFeatures.length > 0 ? bounds(cantonFeatures) : undefined, [cantonFeatures]);

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

  function positionCard(position: { x: number; y: number }) {
    const cardWidth = 410;
    const cardHeight = 620;
    setCardPosition({
      x: Math.max(12, Math.min(position.x + 16, window.innerWidth - cardWidth - 12)),
      y: Math.max(64, Math.min(position.y + 16, window.innerHeight - cardHeight - 12)),
    });
  }

  function hoverMunicipality(id: number, position: { x: number; y: number }) {
    if (pinnedMunicipality !== null) return;
    positionCard(position);
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
    if (position) positionCard(position);
    if (pinnedMunicipality === id) {
      setPinnedMunicipality(null);
      setHoveredMunicipality(null);
      return;
    }
    setPinnedMunicipality(id);
    setHoveredMunicipality(id);
  }

  if (error) return <main className="municipality-page"><p className="municipality-status" role="alert">{error}</p></main>;
  if (!data || !activeProposal || !extent) return <main className="municipality-page"><p className="municipality-status" aria-live="polite">Gemeinde-Abstimmungen werden geladen …</p></main>;

  return (
    <main className="municipality-page" aria-label={`Gemeinde-Abstimmungen im Kanton ${canton?.name.de ?? cantonCode}`}>
      <section className="municipality-explorer">
        <div className="municipality-map-workspace">
          <div className="municipality-map-toolbar">
            <button className="municipality-back" type="button" onClick={onBack}><ArrowLeft size={16} />Kantonskarte</button>
            <div><span>LETZTE VIER ABSTIMMUNGSTAGE</span><h1>Gemeinden in {canton?.name.de}</h1></div>
            <label className="municipality-proposal-select"><span>Vorlage</span><select aria-label="Abstimmungsvorlage" value={activeProposal.id} onChange={(event) => setSelectedProposalId(Number(event.target.value))}>{allProposals.map((proposal) => <option key={proposal.id} value={proposal.id}>{formatDate(proposal.date)} · {proposal.title}</option>)}</select><ChevronDown size={14} /></label>
          </div>
          <svg className="municipality-map" viewBox={`0 0 ${viewBox.width} ${viewBox.height}`} role="group" aria-label={`Abstimmungsresultate der Gemeinden in ${canton?.name.de}`}>
            {cantonFeatures.map((municipality) => {
              const result = resultFor(activeProposal, municipality.properties.vogeId);
              const isSelected = municipality.properties.vogeId === selectedMunicipality;
              const yesPct = typeof result.yesPct === "number" && Number.isFinite(result.yesPct) ? result.yesPct : 50;
              const lightness = 94 - yesPct * 0.45;
              return <path key={municipality.properties.vogeId} aria-label={`${municipality.properties.vogeName}: Ja ${formatPercent(result.yesPct)}`} className={`municipality-region ${isSelected ? "selected" : ""}`} d={pathFor(municipality, extent)} fill={`hsl(356 57% ${lightness}%)`} role="button" tabIndex={0} onClick={(event) => pinMunicipality(municipality.properties.vogeId, { x: event.clientX, y: event.clientY })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pinMunicipality(municipality.properties.vogeId); } }} onPointerEnter={(event) => { if (event.pointerType === "mouse") hoverMunicipality(municipality.properties.vogeId, { x: event.clientX, y: event.clientY }); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") leaveMunicipality(); }} />;
            })}
          </svg>
          <p className="municipality-legend"><span>Weniger Ja</span><i aria-hidden="true" /><span>Mehr Ja</span>{activeProposal.provisional && <strong>Provisorische Resultate</strong>}</p>
        </div>
        {selected && <aside className={`hover-card hover-card--municipality ${pinnedMunicipality !== null ? "hover-card--pinned" : ""}`} aria-live="polite" aria-label={`Abstimmungsresultate für ${selected.properties.vogeName}`} style={{ left: cardPosition.x, top: cardPosition.y }}>
          <div className="hover-card__header"><div><span>GEMEINDE</span><h2>{selected.properties.vogeName}</h2></div>{pinnedMunicipality !== null && <button type="button" aria-label="Fixierte Gemeindedaten schliessen" onClick={() => { setPinnedMunicipality(null); setHoveredMunicipality(null); }}><X size={16} /></button>}</div>
          <div className="municipality-hover-card__content"><p>Resultate aller Vorlagen der letzten vier eidgenössischen Abstimmungstage.</p>{data.votingDays.map((day) => <section key={day.date} className="municipality-voting-day"><h3>{formatDate(day.date)}</h3>{day.proposals.map((proposal) => { const result = resultFor(proposal, selected.properties.vogeId); return <div key={proposal.id}><strong>{proposal.title}</strong><span>Ja {formatPercent(result.yesPct)} · Beteiligung {formatPercent(result.turnout)}</span><small>{formatNumber(result.yesVotes)} Ja · {formatNumber(result.noVotes)} Nein · {formatNumber(result.eligibleVoters)} Stimmberechtigte{proposal.provisional ? " · provisorisch" : ""}</small></div>; })}</section>)}</div>
          {pinnedMunicipality !== null && <div className="hover-card__actions hover-card__actions--single"><button type="button" onClick={() => setIsCompassOpen(true)}>Politischer Kompass</button></div>}
        </aside>}
      </section>
      <p className="municipality-source">Quelle: Bundesamt für Statistik (BFS), eidgenössische Abstimmungsresultate auf Gemeindeebene. Die Karte enthält die 2&apos;105 räumlichen Gemeinden; 12 Auslandsgemeinden ohne Fläche sind nicht kartiert.</p>
      {isCompassOpen && selected && <PoliticalCompassModal mode="municipalities" originMunicipalityId={String(selected.properties.vogeId)} onClose={() => setIsCompassOpen(false)} />}
    </main>
  );
}
