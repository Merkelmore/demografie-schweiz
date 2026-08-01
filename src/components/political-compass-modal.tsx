"use client";

import { Info, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CompassMode = "cantons" | "municipalities";
type CompassPoint = { id?: string; name: string; x: number; y: number; canton?: string; cantonName?: string };
type Weight = { id: number; title: string; economicWeight: number; authorityWeight: number };
type CompassData = {
  cantons: CompassPoint[];
  coverage: { currentMunicipalities: number; missingMunicipalityIds: string[] };
  methodology: { excludedProposals: Record<string, string>; weights: Weight[] };
  municipalities: CompassPoint[];
};

const chart = { center: 400, extent: 320, size: 800 };
const number = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2, minimumFractionDigits: 2, signDisplay: "always" });

function toChartPoint(point: CompassPoint) {
  return { x: chart.center + point.x * (chart.extent / 100), y: chart.center - point.y * (chart.extent / 100) };
}

function formatWeight(weight: number) {
  return `${weight >= 0 ? "+" : ""}${weight.toFixed(1)}`;
}

export function PoliticalCompassModal({ mode, onClose, originMunicipalityId }: { mode: CompassMode; onClose: () => void; originMunicipalityId?: string }) {
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | undefined>(undefined);
  const [data, setData] = useState<CompassData>();
  const [error, setError] = useState<string>();
  const [hovered, setHovered] = useState<CompassPoint>();
  const [methodOpen, setMethodOpen] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/political-compass.json", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<CompassData> : Promise.reject(new Error("snapshot")))
      .then((snapshot) => { setData(snapshot); setError(undefined); })
      .catch((requestError: unknown) => {
        if ((requestError as { name?: string }).name !== "AbortError") setError("Der politische Kompass konnte nicht geladen werden.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    closeButton.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const points = mode === "cantons" ? data?.cantons ?? [] : data?.municipalities ?? [];
  const missingOrigin = mode === "municipalities" && originMunicipalityId && data && !data.municipalities.some(({ id }) => id === originMunicipalityId);
  const title = mode === "cantons" ? "Politischer Kompass der Kantone" : "Politischer Kompass der Gemeinden";
  const pointLabel = mode === "cantons" ? "Kantone" : "Gemeinden";

  function resetView() {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  function keepFocusInDialog(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"], a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])') ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function clampPan(next: { x: number; y: number }, nextZoom = zoom) {
    const limit = chart.extent * (nextZoom - 1);
    return { x: Math.max(-limit, Math.min(limit, next.x)), y: Math.max(-limit, Math.min(limit, next.y)) };
  }

  return <div className="compass-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialog} className="compass-dialog" role="dialog" aria-modal="true" aria-labelledby="compass-title" onKeyDown={keepFocusInDialog} onMouseDown={(event) => event.stopPropagation()}>
      <header className="compass-dialog__header">
        <div><span>RELATIVES ABSTIMMUNGSMODELL</span><h2 id="compass-title">{title}</h2><p>{points.length.toLocaleString("de-CH")} {pointLabel} · mit dem Mausrad zoomen, ziehen zum Verschieben</p></div>
        <div className="compass-dialog__actions"><button type="button" className="compass-info-button" aria-expanded={methodOpen} onClick={() => setMethodOpen((open) => !open)}><Info size={17} />Berechnung</button><button ref={closeButton} type="button" aria-label="Politischen Kompass schliessen" onClick={onClose}><X size={18} /></button></div>
      </header>
      {methodOpen && data && <section className="compass-method" aria-label="Berechnung des politischen Kompasses">
        <p>Für jede Vorlage wird der exakte Ja-Anteil einer Gemeinde mit dem offiziellen Schweizer Ja-Anteil verglichen. Die Differenz wird durch die Streuung aller Gemeindeanteile geteilt und auf ±3 Standardabweichungen begrenzt.</p>
        <p>Diese standardisierten Differenzen werden mit den Gewichten unten zu X (wirtschaftlich links ↔ rechts) und Y (libertär ↔ autoritär) summiert. Die fixe Skala von −100 bis +100 macht Kantone und Gemeinden direkt vergleichbar. Das sind relative Modellpositionen, keine objektiven Tatsachen über Menschen oder Orte.</p>
        <div className="compass-method__table-wrap"><table><thead><tr><th>Vorlage</th><th>Wirtschaft</th><th>Autorität</th></tr></thead><tbody>{data.methodology.weights.map((weight) => <tr key={weight.id}><td>{weight.title}</td><td>{formatWeight(weight.economicWeight)}</td><td>{formatWeight(weight.authorityWeight)}</td></tr>)}</tbody></table></div>
        <p className="compass-method__excluded">Ausgeschlossen: {Object.values(data.methodology.excludedProposals).join(" · ")}</p>
      </section>}
      {missingOrigin && <p className="compass-notice">Für die geöffnete aktuelle Gemeinde liegen nicht alle neun zuordenbaren Resultate vor. Sie erhält deshalb keinen erfundenen Punkt; der Kompass zeigt weiterhin alle verfügbaren Gemeinden.</p>}
      <div className="compass-workspace">
        {error && <p className="compass-status" role="alert">{error}</p>}
        {!error && !data && <p className="compass-status" aria-live="polite">Kompassdaten werden geladen …</p>}
        {data && <>
          <svg className="compass-chart" viewBox={`0 0 ${chart.size} ${chart.size}`} role="img" aria-label={`${title} mit ${points.length} Punkten`} onWheel={(event) => { event.preventDefault(); const nextZoom = Math.max(1, Math.min(8, zoom * (event.deltaY < 0 ? 1.18 : 0.85))); setZoom(nextZoom); setPan(clampPan(pan, nextZoom)); }} onPointerDown={(event) => { drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!drag.current || drag.current.pointerId !== event.pointerId) return; const bounds = event.currentTarget.getBoundingClientRect(); const factor = chart.size / bounds.width; setPan(clampPan({ x: drag.current.originX + (event.clientX - drag.current.x) * factor, y: drag.current.originY + (event.clientY - drag.current.y) * factor })); }} onPointerUp={(event) => { if (drag.current?.pointerId === event.pointerId) drag.current = undefined; }}>
            <g transform={`translate(${pan.x} ${pan.y}) translate(${chart.center} ${chart.center}) scale(${zoom}) translate(${-chart.center} ${-chart.center})`}>
              <rect className="compass-quadrant compass-quadrant--authoritarian-left" x="80" y="80" width="320" height="320" />
              <rect className="compass-quadrant compass-quadrant--authoritarian-right" x="400" y="80" width="320" height="320" />
              <rect className="compass-quadrant compass-quadrant--libertarian-left" x="80" y="400" width="320" height="320" />
              <rect className="compass-quadrant compass-quadrant--libertarian-right" x="400" y="400" width="320" height="320" />
              <line className="compass-axis" x1="65" x2="735" y1="400" y2="400" /><line className="compass-axis" x1="400" x2="400" y1="65" y2="735" />
              <text className="compass-quadrant-label" x="240" y="225">Aut. links</text><text className="compass-quadrant-label" x="560" y="225">Aut. rechts</text><text className="compass-quadrant-label" x="240" y="580">Lib. links</text><text className="compass-quadrant-label" x="560" y="580">Lib. rechts</text>
              {points.map((point) => { const position = toChartPoint(point); return <circle key={point.id ?? point.name} className={`compass-point compass-point--${mode}`} cx={position.x} cy={position.y} r={mode === "cantons" ? 6 : 2.4} tabIndex={mode === "cantons" ? 0 : undefined} aria-label={`${point.name}${point.cantonName ? `, ${point.cantonName}` : ""}: wirtschaftlich ${number.format(point.x)}, autoritätsbezogen ${number.format(point.y)}`} onFocus={() => setHovered(point)} onPointerEnter={() => setHovered(point)} onPointerLeave={() => setHovered(undefined)} />; })}
            </g>
            <text className="compass-axis-label" x="78" y="386">wirtschaftlich links</text><text className="compass-axis-label" textAnchor="end" x="722" y="386">wirtschaftlich rechts</text><text className="compass-axis-label" textAnchor="middle" x="400" y="48">autoritär</text><text className="compass-axis-label" textAnchor="middle" x="400" y="770">libertär</text>
          </svg>
          <div className="compass-controls"><button type="button" onClick={resetView}><RotateCcw size={15} />Ansicht zurücksetzen</button>{hovered ? <p><strong>{hovered.name}</strong>{hovered.cantonName && <> · {hovered.cantonName}</>}<span>X {number.format(hovered.x)} · Y {number.format(hovered.y)}</span></p> : <p>Über einen Punkt fahren für Name und Koordinaten.</p>}</div>
        </>}
      </div>
      {data && <footer className="compass-dialog__footer">Quelle: BFS voteinfo, eidgenössische Abstimmungen auf Gemeindeebene. {data.coverage.missingMunicipalityIds.length === 0 ? "Alle aktuellen räumlichen BFS-Gemeinden sind zugeordnet." : `${data.coverage.missingMunicipalityIds.length} aktuelle Gemeinden ohne vollständige Zuordnung sind nicht positioniert.`}</footer>}
    </section>
  </div>;
}
