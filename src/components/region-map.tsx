"use client";

import { RotateCcw } from "lucide-react";
import { useRef, useState, type ReactNode, type TouchEvent } from "react";

import { useTranslation } from "@/lib/i18n";
import { mapViewBox } from "@/lib/map-geometry";

const maximumMapZoom = 3;
const panActivationDistance = 6;

/** The existing municipality viewport, shared by both geographic levels. */
export function RegionMap({ ariaLabel, children, className, mapClassName }: {
  ariaLabel: string;
  children: ReactNode;
  className: "map-zoom-viewport" | "municipality-map-viewport";
  mapClassName?: string;
}) {
  const { t } = useTranslation();
  const [mapZoom, setMapZoom] = useState(1);
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const mapZoomRef = useRef(1);
  const mapOffsetRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef<{ distance: number; moved: boolean; zoom: number } | null>(null);
  const panRef = useRef<{ moved: boolean; startX: number; startY: number; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  function touchDistance(touches: TouchEvent<HTMLDivElement>["touches"]) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  }

  function setOffset(nextOffset: { x: number; y: number }) {
    mapOffsetRef.current = nextOffset;
    setMapOffset(nextOffset);
  }

  function setZoom(nextZoom: number) {
    const clampedZoom = Math.max(1, Math.min(maximumMapZoom, nextZoom));
    mapZoomRef.current = clampedZoom;
    setMapZoom(clampedZoom);
    if (clampedZoom === 1) setOffset({ x: 0, y: 0 });
  }

  function clampOffset(nextOffset: { x: number; y: number }, viewport: HTMLDivElement) {
    const bounds = viewport.getBoundingClientRect();
    const maximumX = (bounds.width * (mapZoomRef.current - 1)) / 2;
    const maximumY = (bounds.height * (mapZoomRef.current - 1)) / 2;
    return { x: Math.max(-maximumX, Math.min(maximumX, nextOffset.x)), y: Math.max(-maximumY, Math.min(maximumY, nextOffset.y)) };
  }

  function startTouch(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 1) {
      suppressClickRef.current = false;
      const touch = event.touches[0];
      panRef.current = { moved: false, startX: touch.clientX, startY: touch.clientY, x: mapOffsetRef.current.x, y: mapOffsetRef.current.y };
      return;
    }
    if (event.touches.length !== 2) return;
    panRef.current = null;
    pinchRef.current = { distance: touchDistance(event.touches), moved: false, zoom: mapZoomRef.current };
  }

  function moveTouch(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 2 && pinchRef.current) {
      const distance = touchDistance(event.touches);
      if (Math.abs(distance - pinchRef.current.distance) >= panActivationDistance) {
        pinchRef.current.moved = true;
        setIsPanning(true);
      }
      if (pinchRef.current.distance > 0) setZoom(pinchRef.current.zoom * distance / pinchRef.current.distance);
      setOffset(clampOffset(mapOffsetRef.current, event.currentTarget));
      return;
    }
    if (event.touches.length !== 1 || !panRef.current || mapZoomRef.current === 1) return;
    const touch = event.touches[0];
    const nextOffset = clampOffset({ x: panRef.current.x + touch.clientX - panRef.current.startX, y: panRef.current.y + touch.clientY - panRef.current.startY }, event.currentTarget);
    if (Math.hypot(touch.clientX - panRef.current.startX, touch.clientY - panRef.current.startY) >= panActivationDistance) {
      panRef.current.moved = true;
      setIsPanning(true);
    }
    setOffset(nextOffset);
  }

  function endTouch(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length === 1 && pinchRef.current) {
      suppressClickRef.current ||= pinchRef.current.moved;
      const touch = event.touches[0];
      panRef.current = { moved: false, startX: touch.clientX, startY: touch.clientY, x: mapOffsetRef.current.x, y: mapOffsetRef.current.y };
      pinchRef.current = null;
      return;
    }
    if (event.touches.length < 2) {
      suppressClickRef.current ||= pinchRef.current?.moved ?? false;
      pinchRef.current = null;
    }
    if (event.touches.length === 0) {
      suppressClickRef.current ||= panRef.current?.moved ?? false;
      panRef.current = null;
      setIsPanning(false);
    }
  }

  return <div className={`${className} ${isPanning ? `${className}--panning` : ""}`} onTouchCancel={endTouch} onTouchEnd={endTouch} onTouchMove={moveTouch} onTouchStart={startTouch}
    onClickCapture={(event) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
    }}>
    <svg className={mapClassName} viewBox={`0 0 ${mapViewBox.width} ${mapViewBox.height}`} role="group" aria-label={ariaLabel} fillRule="evenodd" style={{ transform: `translate(${mapOffset.x}px, ${mapOffset.y}px) scale(${mapZoom})` }}>
      {children}
    </svg>
    {mapZoom > 1 && <button className="map-zoom-reset" type="button" aria-label={t("mapReset")} title={t("mapReset")} onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}><RotateCcw size={16} style={{ width: 16, height: 16 }} /></button>}
  </div>;
}
