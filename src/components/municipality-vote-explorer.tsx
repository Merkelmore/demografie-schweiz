"use client";

import { ArrowLeft, ChevronDown } from "lucide-react";
import { feature } from "topojson-client";
import { useEffect, useMemo, useState } from "react";

import { cantons, getCanton } from "@/lib/cantons";

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

export function MunicipalityVoteExplorer({ cantonCode, onBack, onCantonChange }: { cantonCode: string; onBack: () => void; onCantonChange: (code: string) => void }) {
  const [data, setData] = useState<VoteData>();
  const [features, setFeatures] = useState<MunicipalityFeature[]>([]);
  const [error, setError] = useState<string>();
  const [selectedMunicipality, setSelectedMunicipality] = useState<number>();
  const [selectedProposalId, setSelectedProposalId] = useState<number>();
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
  const selected = cantonFeatures.find((municipality) => municipality.properties.vogeId === selectedMunicipality);
  const extent = useMemo(() => cantonFeatures.length > 0 ? bounds(cantonFeatures) : undefined, [cantonFeatures]);

  if (error) return <main className="municipality-page"><p className="municipality-status" role="alert">{error}</p></main>;
  if (!data || !activeProposal || !extent) return <main className="municipality-page"><p className="municipality-status" aria-live="polite">Gemeinde-Abstimmungen werden geladen …</p></main>;

  return (
    <main className="municipality-page" aria-label={`Gemeinde-Abstimmungen im Kanton ${canton?.name.de ?? cantonCode}`}>
      <section className="municipality-explorer">
        <div className="municipality-map-workspace">
          <div className="municipality-map-toolbar">
            <button className="municipality-back" type="button" onClick={onBack}><ArrowLeft size={16} />Kantonskarte</button>
            <div><span>LETZTE DREI ABSTIMMUNGSTAGE</span><h1>Gemeinden in {canton?.name.de}</h1></div>
            <label className="municipality-canton-select"><span>Kanton</span><select aria-label="Kanton für Gemeinde-Abstimmungen" value={cantonCode} onChange={(event) => onCantonChange(event.target.value)}>{cantons.map((item) => <option key={item.code} value={item.code}>{item.name.de}</option>)}</select><ChevronDown size={14} /></label>
            <label className="municipality-proposal-select"><span>Vorlage</span><select aria-label="Abstimmungsvorlage" value={activeProposal.id} onChange={(event) => setSelectedProposalId(Number(event.target.value))}>{allProposals.map((proposal) => <option key={proposal.id} value={proposal.id}>{formatDate(proposal.date)} · {proposal.title}</option>)}</select><ChevronDown size={14} /></label>
          </div>
          <svg className="municipality-map" viewBox={`0 0 ${viewBox.width} ${viewBox.height}`} role="group" aria-label={`Abstimmungsresultate der Gemeinden in ${canton?.name.de}`}>
            {cantonFeatures.map((municipality) => {
              const result = resultFor(activeProposal, municipality.properties.vogeId);
              const isSelected = municipality.properties.vogeId === selectedMunicipality;
              const lightness = 94 - (result.yesPct ?? 50) * 0.45;
              return <path key={municipality.properties.vogeId} aria-label={`${municipality.properties.vogeName}: Ja ${percent.format(result.yesPct)} Prozent`} className={`municipality-region ${isSelected ? "selected" : ""}`} d={pathFor(municipality, extent)} fill={`hsl(356 57% ${lightness}%)`} role="button" tabIndex={0} onClick={() => setSelectedMunicipality(municipality.properties.vogeId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedMunicipality(municipality.properties.vogeId); } }} />;
            })}
          </svg>
          <p className="municipality-legend"><span>Weniger Ja</span><i aria-hidden="true" /><span>Mehr Ja</span>{activeProposal.provisional && <strong>Provisorische Resultate</strong>}</p>
        </div>
        <aside className="municipality-detail" aria-live="polite">
          {selected ? <><header><span>GEMEINDE</span><h2>{selected.properties.vogeName}</h2></header><div className="municipality-detail__content"><p className="municipality-detail__intro">Resultate aller Vorlagen der letzten drei eidgenössischen Abstimmungstage.</p>{data.votingDays.map((day) => <section key={day.date} className="municipality-voting-day"><h3>{formatDate(day.date)}</h3>{day.proposals.map((proposal) => { const result = resultFor(proposal, selected.properties.vogeId); return <div key={proposal.id}><strong>{proposal.title}</strong><span>Ja {percent.format(result.yesPct)} % · Beteiligung {percent.format(result.turnout)} %</span><small>{number.format(result.yesVotes)} Ja · {number.format(result.noVotes)} Nein · {number.format(result.eligibleVoters)} Stimmberechtigte{proposal.provisional ? " · provisorisch" : ""}</small></div>; })}</section>)}</div></> : <div className="municipality-detail__empty"><span>GEMEINDE</span><h2>Gemeinde auswählen</h2><p>Wähle eine Fläche auf der Karte, um die Resultate aller Vorlagen der letzten drei Abstimmungstage zu sehen.</p></div>}
        </aside>
      </section>
      <p className="municipality-source">Quelle: Bundesamt für Statistik (BFS), eidgenössische Abstimmungsresultate auf Gemeindeebene. Die Karte enthält die 2&apos;105 räumlichen Gemeinden; 12 Auslandsgemeinden ohne Fläche sind nicht kartiert.</p>
    </main>
  );
}
