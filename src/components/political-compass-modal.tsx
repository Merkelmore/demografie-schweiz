"use client";

import { Info, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";
import { useMemo, useEffect, useRef, useState, type CSSProperties } from "react";

import { cantons } from "@/lib/cantons";
import { useTranslation } from "@/lib/i18n";
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

export function PoliticalCompassModal({ mode, onClose, originMunicipalityId, initialCantonCode }: { mode: CompassMode; onClose: () => void; originMunicipalityId?: string; initialCantonCode?: string }) {
  const { language, t } = useTranslation();
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | undefined>(undefined);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | undefined>(undefined);
  const { data, error } = usePoliticalCompass();
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => initialCantonCode ? new Set(cantons.filter(({ code }) => code !== initialCantonCode).map(({ code }) => code)) : new Set());
  const [hovered, setHovered] = useState<CompassPoint>();
  const [municipalityQuery, setMunicipalityQuery] = useState("");
  const [selectedMunicipalityId, setSelectedMunicipalityId] = useState<string>();
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
  const selectedMunicipality = useMemo(() => selectedMunicipalityId ? points.find((point) => point.id === selectedMunicipalityId) : undefined, [points, selectedMunicipalityId]);
  const visiblePoints = useMemo(() => {
    const cantonPoints = points.filter((point) => !hidden.has(pointCanton(point) ?? ""));
    return selectedMunicipality && !cantonPoints.some((point) => point.id === selectedMunicipality.id) ? [...cantonPoints, selectedMunicipality] : cantonPoints;
  }, [hidden, points, selectedMunicipality]);
  const municipalityMatches = useMemo(() => {
    if (mode !== "municipalities" || !municipalityQuery.trim() || selectedMunicipality) return [];
    const query = municipalityQuery.trim().toLocaleLowerCase(language);
    return points.filter((point): point is CompassPoint & { id: string } => typeof point.id === "string" && `${point.name} ${point.cantonName ?? ""}`.toLocaleLowerCase(language).includes(query)).slice(0, 8);
  }, [language, mode, municipalityQuery, points, selectedMunicipality]);
  const origin = mode === "municipalities" ? visiblePoints.find(({ id }) => id === originMunicipalityId) : undefined;
  const missingOrigin = mode === "municipalities" && originMunicipalityId && data && !data.municipalities.some(({ id }) => id === originMunicipalityId);
  const title = mode === "cantons" ? t("compassCantons") : t("compassMunicipalities");

  function resetView() {
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }

  function setViewZoom(nextZoom: number) {
    const clampedZoom = Math.max(1, Math.min(8, nextZoom));
    setZoom(clampedZoom);
    setPan((current) => clampPan(current, clampedZoom));
  }

  function toggleCanton(code: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(code)) next.add(code);
      return next;
    });
  }

  function selectMunicipality(point: CompassPoint & { id: string }) {
    setSelectedMunicipalityId(point.id);
    setMunicipalityQuery(point.name);
    setHidden(new Set(cantons.map(({ code }) => code)));
    setHovered(undefined);
    resetView();
  }

  function clearMunicipalitySearch() {
    setSelectedMunicipalityId(undefined);
    setMunicipalityQuery("");
    setHovered(undefined);
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

  function beginPointerGesture(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    const activePointers = [...pointers.current.values()];

    if (activePointers.length === 1) {
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: pan.x, originY: pan.y };
      pinch.current = undefined;
    } else if (activePointers.length === 2) {
      pinch.current = { distance: Math.hypot(activePointers[0].x - activePointers[1].x, activePointers[0].y - activePointers[1].y), zoom };
      drag.current = undefined;
    }
  }

  function continuePointerGesture(event: React.PointerEvent<SVGSVGElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const activePointers = [...pointers.current.values()];

    if (activePointers.length === 2 && pinch.current) {
      const distance = Math.hypot(activePointers[0].x - activePointers[1].x, activePointers[0].y - activePointers[1].y);
      if (pinch.current.distance > 0) setViewZoom(pinch.current.zoom * distance / pinch.current.distance);
      return;
    }

    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const factor = compassChart.size / bounds.width;
    setPan(clampPan({ x: drag.current.originX + (event.clientX - drag.current.x) * factor, y: drag.current.originY + (event.clientY - drag.current.y) * factor }));
  }

  function endPointerGesture(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = undefined;
    pinch.current = undefined;
  }

  return <div className="compass-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialog} className="compass-dialog" role="dialog" aria-modal="true" aria-labelledby="compass-title" onKeyDown={keepFocusInDialog} onMouseDown={(event) => event.stopPropagation()}>
      <header className="compass-dialog__header">
        <h2 id="compass-title">{t("politicalCompass")}</h2>
        <div className="compass-dialog__actions"><button type="button" className="compass-info-button" aria-expanded={methodOpen} onClick={() => setMethodOpen((open) => !open)}><Info size={17} />{t("methodology")}</button><button ref={closeButton} type="button" aria-label={t("compassClose")} onClick={onClose}><X size={18} /></button></div>
      </header>
      <div className="compass-filter">
        <div className="compass-filter__lead"><span id="compass-filter-label">{t("cantons")}</span><button type="button" onClick={() => { setHidden(new Set()); clearMunicipalitySearch(); }}>{t("all")}</button><button type="button" onClick={() => { setHidden(new Set(cantons.map(({ code }) => code))); clearMunicipalitySearch(); }}>{t("none")}</button>{mode === "municipalities" && <div className="compass-municipality-search"><input type="search" aria-label={t("searchMunicipality")} placeholder={t("searchMunicipality")} value={municipalityQuery} onChange={(event) => { setMunicipalityQuery(event.target.value); setSelectedMunicipalityId(undefined); setHovered(undefined); }} />{municipalityQuery && <button type="button" aria-label={t("clearSearch")} onClick={clearMunicipalitySearch}><X size={13} /></button>}{municipalityMatches.length > 0 && <ul role="listbox" aria-label={t("searchResults")}>{municipalityMatches.map((point) => <li key={point.id}><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectMunicipality(point)}>{point.name}<span>{point.cantonName}</span></button></li>)}</ul>}</div>}</div>
        <ul className="compass-filter__list" aria-labelledby="compass-filter-label">
          {cantons.map((canton) => <li key={canton.code} style={{ "--canton-color": cantonColor(canton.code) } as CSSProperties}>
            <label><input type="checkbox" aria-label={canton.name[language]} checked={!hidden.has(canton.code)} onChange={() => toggleCanton(canton.code)} /><i aria-hidden="true" />{canton.code}</label>
          </li>)}
        </ul>
      </div>
      {methodOpen && data && <section className="compass-method" aria-label={t("compassCalculationAria")}>
        <p>{t("compassMethodOne")}</p>
        <p>{t("compassMethodTwo")}</p>
        <div className="compass-method__table-wrap"><table><thead><tr><th>{t("proposal")}</th><th>{t("economy")}</th><th>{t("authority")}</th></tr></thead><tbody>{data.methodology.weights.map((weight) => <tr key={weight.id}><td>{weight.title}</td><td>{formatWeight(weight.economicWeight)}</td><td>{formatWeight(weight.authorityWeight)}</td></tr>)}</tbody></table></div>
        <p className="compass-method__excluded">{t("excluded")}: {Object.values(data.methodology.excludedProposals).join(" · ")}</p>
      </section>}
      {missingOrigin && <p className="compass-notice">{t("compassMissing")}</p>}
      <div className="compass-workspace">
        {error && <p className="compass-status" role="alert">{t("compassFailed")}</p>}
        {!error && !data && <p className="compass-status" aria-live="polite">{t("compassLoading")}</p>}
        {data && <>
          <div className="compass-plot">
          <span className="compass-plot__axis compass-plot__axis--top">{t("authoritarian")}</span>
          <span className="compass-plot__axis compass-plot__axis--left">{t("left")}</span>
          <svg className="compass-chart" viewBox={`0 0 ${compassChart.size} ${compassChart.size}`} role="img" aria-label={`${title} mit ${visiblePoints.length} Punkten`} onWheel={(event) => { event.preventDefault(); setViewZoom(zoom * (event.deltaY < 0 ? 1.18 : 0.85)); }} onPointerDown={beginPointerGesture} onPointerMove={continuePointerGesture} onPointerUp={endPointerGesture} onPointerCancel={endPointerGesture}>
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
          <div className="compass-controls" role="group" aria-label={t("compassZoomControls")}>
            <button type="button" aria-label={t("zoomOutCompass")} title={t("zoomOutCompass")} disabled={zoom <= 1} onClick={() => setViewZoom(zoom / 1.4)}><ZoomOut size={16} /></button>
            <span className="compass-controls__level" aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button type="button" aria-label={t("zoomInCompass")} title={t("zoomInCompass")} disabled={zoom >= 8} onClick={() => setViewZoom(zoom * 1.4)}><ZoomIn size={16} /></button>
            <button type="button" aria-label={t("resetCompass")} title={t("resetView")} disabled={zoom === 1 && pan.x === 0 && pan.y === 0} onClick={resetView}><RotateCcw size={15} /></button>
          </div>
          <span className="compass-plot__axis compass-plot__axis--right">{t("right")}</span>
          <span className="compass-plot__axis compass-plot__axis--bottom">{t("libertarian")}</span>
          </div>
        </>}
      </div>
      {data && <footer className="compass-dialog__footer">{t("compassFooter")} {data.coverage.missingMunicipalityIds.length === 0 ? t("allMunicipalitiesMapped") : t("missingMunicipalities", { count: data.coverage.missingMunicipalityIds.length })}</footer>}
    </section>
  </div>;
}
