"use client";

import { Info, RotateCcw, X } from "lucide-react";
import { useMemo, useEffect, useRef, useState, type CSSProperties } from "react";

import { cantons } from "@/lib/cantons";
import { cantonColor, compassChart, compassSpread, pointCanton, toChartPoint, usePoliticalCompass, type CompassPoint } from "@/lib/political-compass";

type CompassMode = "cantons" | "municipalities";

const pointRadius = { cantons: 8, municipalities: 4.2 };
const quadrant = { origin: compassChart.center - compassChart.extent, side: compassChart.extent };
const gridOffsets = [0.25, 0.5, 0.75].flatMap((fraction) => [compassChart.center - compassChart.extent * fraction, compassChart.center + compassChart.extent * fraction]);

function formatWeight(weight: number) {
  return `${weight >= 0 ? "+" : ""}${weight.toFixed(1)}`;
}

/** A name pinned to a point. It counter-scales the zoom so the text stays legible however far the chart is zoomed. */
function CompassLabel({ position, text, tone, zoom }: { position: { x: number; y: number }; text: string; tone: "hovered" | "origin"; zoom: number }) {
  const flip = position.x > compassChart.center;

  return <g className={`compass-label compass-label--${tone}`} transform={`translate(${position.x} ${position.y}) scale(${1 / zoom})`}>
    <circle className="compass-label__ring" r="14" />
    <text x={flip ? -21 : 21} y="8" textAnchor={flip ? "end" : "start"}>{text}</text>
  </g>;
}

export function PoliticalCompassModal({ mode, onClose, originMunicipalityId }: { mode: CompassMode; onClose: () => void; originMunicipalityId?: string }) {
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | undefined>(undefined);
  const { data, error } = usePoliticalCompass();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [hovered, setHovered] = useState<CompassPoint>();
  const [methodOpen, setMethodOpen] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

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

  const points = useMemo(() => (mode === "cantons" ? data?.cantons : data?.municipalities) ?? [], [data, mode]);
  const spread = useMemo(() => compassSpread(points), [points]);
  const visiblePoints = useMemo(() => points.filter((point) => !hidden.has(pointCanton(point) ?? "")), [hidden, points]);
  const origin = mode === "municipalities" ? visiblePoints.find(({ id }) => id === originMunicipalityId) : undefined;
  const missingOrigin = mode === "municipalities" && originMunicipalityId && data && !data.municipalities.some(({ id }) => id === originMunicipalityId);
  const title = mode === "cantons" ? "Politischer Kompass der Kantone" : "Politischer Kompass der Gemeinden";

  function resetView() {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  function toggleCanton(code: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(code)) next.add(code);
      return next;
    });
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
    const limit = compassChart.extent * (nextZoom - 1);
    return { x: Math.max(-limit, Math.min(limit, next.x)), y: Math.max(-limit, Math.min(limit, next.y)) };
  }

  return <div className="compass-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialog} className="compass-dialog" role="dialog" aria-modal="true" aria-labelledby="compass-title" onKeyDown={keepFocusInDialog} onMouseDown={(event) => event.stopPropagation()}>
      <header className="compass-dialog__header">
        <h2 id="compass-title">Politischer Kompass</h2>
        <div className="compass-dialog__actions"><button type="button" className="compass-info-button" aria-expanded={methodOpen} onClick={() => setMethodOpen((open) => !open)}><Info size={17} />Berechnung</button><button ref={closeButton} type="button" aria-label="Politischen Kompass schliessen" onClick={onClose}><X size={18} /></button></div>
      </header>
      <div className="compass-filter">
        <div className="compass-filter__lead"><span id="compass-filter-label">Kantone</span><button type="button" onClick={() => setHidden(new Set())}>Alle</button><button type="button" onClick={() => setHidden(new Set(cantons.map(({ code }) => code)))}>Keine</button></div>
        <ul className="compass-filter__list" aria-labelledby="compass-filter-label">
          {cantons.map((canton) => <li key={canton.code} style={{ "--canton-color": cantonColor(canton.code) } as CSSProperties}>
            <label><input type="checkbox" aria-label={canton.name.de} checked={!hidden.has(canton.code)} onChange={() => toggleCanton(canton.code)} /><i aria-hidden="true" />{canton.code}</label>
          </li>)}
        </ul>
      </div>
      {methodOpen && data && <section className="compass-method" aria-label="Berechnung des politischen Kompasses">
        <p>Für jede Vorlage wird der exakte Ja-Anteil einer Gemeinde mit dem offiziellen Schweizer Ja-Anteil verglichen. Die Differenz wird durch die Streuung aller Gemeindeanteile geteilt und auf ±3 Standardabweichungen begrenzt.</p>
        <p>Diese standardisierten Differenzen werden mit den Gewichten unten zu X (wirtschaftlich links ↔ rechts) und Y (libertär ↔ autoritär) summiert. Für die Darstellung wird jede Achse so gedehnt, dass die äussersten Punkte den Rand erreichen; die Reihenfolge der Positionen bleibt dabei erhalten. Das sind relative Modellpositionen, keine objektiven Tatsachen über Menschen oder Orte.</p>
        <div className="compass-method__table-wrap"><table><thead><tr><th>Vorlage</th><th>Wirtschaft</th><th>Autorität</th></tr></thead><tbody>{data.methodology.weights.map((weight) => <tr key={weight.id}><td>{weight.title}</td><td>{formatWeight(weight.economicWeight)}</td><td>{formatWeight(weight.authorityWeight)}</td></tr>)}</tbody></table></div>
        <p className="compass-method__excluded">Ausgeschlossen: {Object.values(data.methodology.excludedProposals).join(" · ")}</p>
      </section>}
      {missingOrigin && <p className="compass-notice">Für die geöffnete aktuelle Gemeinde liegen nicht alle neun zuordenbaren Resultate vor. Sie erhält deshalb keinen erfundenen Punkt; der Kompass zeigt weiterhin alle verfügbaren Gemeinden.</p>}
      <div className="compass-workspace">
        {error && <p className="compass-status" role="alert">{error}</p>}
        {!error && !data && <p className="compass-status" aria-live="polite">Kompassdaten werden geladen …</p>}
        {data && <>
          <div className="compass-plot">
          <span className="compass-plot__axis compass-plot__axis--top">Autoritär</span>
          <span className="compass-plot__axis compass-plot__axis--left">Links</span>
          <svg className="compass-chart" viewBox={`0 0 ${compassChart.size} ${compassChart.size}`} role="img" aria-label={`${title} mit ${visiblePoints.length} Punkten`} onWheel={(event) => { event.preventDefault(); const nextZoom = Math.max(1, Math.min(8, zoom * (event.deltaY < 0 ? 1.18 : 0.85))); setZoom(nextZoom); setPan(clampPan(pan, nextZoom)); }} onPointerDown={(event) => { drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!drag.current || drag.current.pointerId !== event.pointerId) return; const bounds = event.currentTarget.getBoundingClientRect(); const factor = compassChart.size / bounds.width; setPan(clampPan({ x: drag.current.originX + (event.clientX - drag.current.x) * factor, y: drag.current.originY + (event.clientY - drag.current.y) * factor })); }} onPointerUp={(event) => { if (drag.current?.pointerId === event.pointerId) drag.current = undefined; }}>
            <g transform={`translate(${pan.x} ${pan.y}) translate(${compassChart.center} ${compassChart.center}) scale(${zoom}) translate(${-compassChart.center} ${-compassChart.center})`}>
              <rect className="compass-quadrant compass-quadrant--authoritarian-left" x={quadrant.origin} y={quadrant.origin} width={quadrant.side} height={quadrant.side} />
              <rect className="compass-quadrant compass-quadrant--authoritarian-right" x={compassChart.center} y={quadrant.origin} width={quadrant.side} height={quadrant.side} />
              <rect className="compass-quadrant compass-quadrant--libertarian-left" x={quadrant.origin} y={compassChart.center} width={quadrant.side} height={quadrant.side} />
              <rect className="compass-quadrant compass-quadrant--libertarian-right" x={compassChart.center} y={compassChart.center} width={quadrant.side} height={quadrant.side} />
              <g className="compass-grid">{gridOffsets.map((offset) => <g key={offset}><line x1={offset} x2={offset} y1={quadrant.origin} y2={quadrant.origin + quadrant.side * 2} /><line x1={quadrant.origin} x2={quadrant.origin + quadrant.side * 2} y1={offset} y2={offset} /></g>)}</g>
              <line className="compass-axis" x1={quadrant.origin - 10} x2={quadrant.origin + quadrant.side * 2 + 10} y1={compassChart.center} y2={compassChart.center} /><line className="compass-axis" x1={compassChart.center} x2={compassChart.center} y1={quadrant.origin - 10} y2={quadrant.origin + quadrant.side * 2 + 10} />
              {visiblePoints.map((point) => { const position = toChartPoint(point, spread); return <circle key={point.id ?? point.code ?? point.name} className={`compass-point compass-point--${mode}`} cx={position.x} cy={position.y} r={pointRadius[mode]} fill={cantonColor(pointCanton(point))} tabIndex={mode === "cantons" ? 0 : undefined} aria-label={point.cantonName ? `${point.name}, ${point.cantonName}` : point.name} onFocus={() => setHovered(point)} onBlur={() => setHovered(undefined)} onPointerEnter={() => setHovered(point)} onPointerLeave={() => setHovered(undefined)} />; })}
              {origin && origin !== hovered && <CompassLabel position={toChartPoint(origin, spread)} text={origin.name} tone="origin" zoom={zoom} />}
              {hovered && <CompassLabel position={toChartPoint(hovered, spread)} text={hovered.cantonName ? `${hovered.name} · ${hovered.cantonName}` : hovered.name} tone="hovered" zoom={zoom} />}
            </g>
          </svg>
          <button className="compass-reset" type="button" aria-label="Kompassansicht zurücksetzen" title="Ansicht zurücksetzen" onClick={resetView}><RotateCcw size={15} /></button>
          <span className="compass-plot__axis compass-plot__axis--right">Rechts</span>
          <span className="compass-plot__axis compass-plot__axis--bottom">Libertär</span>
          </div>
        </>}
      </div>
      {data && <footer className="compass-dialog__footer">Quelle: BFS voteinfo, eidgenössische Abstimmungen auf Gemeindeebene. {data.coverage.missingMunicipalityIds.length === 0 ? "Alle aktuellen räumlichen BFS-Gemeinden sind zugeordnet." : `${data.coverage.missingMunicipalityIds.length} aktuelle Gemeinden ohne vollständige Zuordnung sind nicht positioniert.`}</footer>}
    </section>
  </div>;
}
