"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type TouchEvent } from "react";

import { getCanton, type Language } from "@/lib/cantons";

type Position = [number, number];

type CantonFeature = {
  geometry: {
    coordinates: Position[][] | Position[][][];
    type: "Polygon" | "MultiPolygon";
  };
  properties: {
    kan_name: string[];
  };
  type: "Feature";
};

type CantonCollection = {
  features: CantonFeature[];
};

const codesByName: Record<string, string> = {
  Aargau: "AG",
  "Appenzell Ausserrhoden": "AR",
  "Appenzell Innerrhoden": "AI",
  "Basel-Landschaft": "BL",
  "Basel-Stadt": "BS",
  Bern: "BE",
  Fribourg: "FR",
  Geneve: "GE",
  "Genève": "GE",
  Glarus: "GL",
  Graubunden: "GR",
  "Graubünden": "GR",
  Jura: "JU",
  Luzern: "LU",
  Neuchatel: "NE",
  "Neuchâtel": "NE",
  Nidwalden: "NW",
  Obwalden: "OW",
  Schaffhausen: "SH",
  Schwyz: "SZ",
  Solothurn: "SO",
  "St. Gallen": "SG",
  Tessin: "TI",
  Ticino: "TI",
  Thurgau: "TG",
  Uri: "UR",
  Vaud: "VD",
  Valais: "VS",
  Zug: "ZG",
  Zurich: "ZH",
  "Zürich": "ZH",
};

const viewBoxWidth = 640;
const viewBoxHeight = 350;
const bounds = { maxLatitude: 47.82, maxLongitude: 10.52, minLatitude: 45.8, minLongitude: 5.94 };
const maximumMapZoom = 3;

function project([longitude, latitude]: Position) {
  const x = ((longitude - bounds.minLongitude) / (bounds.maxLongitude - bounds.minLongitude)) * viewBoxWidth;
  const y = ((bounds.maxLatitude - latitude) / (bounds.maxLatitude - bounds.minLatitude)) * viewBoxHeight;

  return [x, y] as const;
}

function ringToPath(ring: Position[]) {
  return ring
    .map((position, index) => {
      const [x, y] = project(position);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function featureToPath(feature: CantonFeature) {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates as Position[][]] : feature.geometry.coordinates as Position[][][];

  return polygons
    .flatMap((polygon) => polygon.map(ringToPath))
    .join(" ");
}

type SwissCantonMapProps = {
  language: Language;
  onHover?: (code: string, position: { x: number; y: number }) => void;
  onLeave?: (code: string) => void;
  onSelect: (code: string) => void;
  selectedCode: string;
  valueDomain?: readonly [number, number];
  values?: Record<string, number>;
};

export function SwissCantonMap({ language, onHover, onLeave, onSelect, selectedCode, valueDomain, values }: SwissCantonMapProps) {
  const [features, setFeatures] = useState<CantonFeature[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const mapZoomRef = useRef(1);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const numericValues = values ? Object.values(values) : [];
  const hasValues = numericValues.length > 0;
  const minimumValue = valueDomain?.[0] ?? Math.min(...numericValues);
  const maximumValue = valueDomain?.[1] ?? Math.max(...numericValues);

  useEffect(() => {
    let active = true;

    fetch("/geo/cantons.geojson")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load canton geometry");
        return response.json() as Promise<CantonCollection>;
      })
      .then((collection) => {
        if (active) setFeatures(collection.features);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loadError) {
    return <p className="map-status" role="alert">Die Kantonskarte konnte nicht geladen werden.</p>;
  }

  if (features.length === 0) {
    return <p className="map-status" aria-live="polite">Kantonskarte wird geladen …</p>;
  }

  function touchDistance(touches: TouchEvent<HTMLDivElement>["touches"]) {
    return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  }

  function setZoom(nextZoom: number) {
    const clampedZoom = Math.max(1, Math.min(maximumMapZoom, nextZoom));
    mapZoomRef.current = clampedZoom;
    setMapZoom(clampedZoom);
  }

  function startPinch(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const midpointX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
    const midpointY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    setZoomOrigin(`${((midpointX - bounds.left) / bounds.width) * 100}% ${((midpointY - bounds.top) / bounds.height) * 100}%`);
    pinchRef.current = { distance: touchDistance(event.touches), zoom: mapZoomRef.current };
  }

  function zoomMap(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length !== 2 || !pinchRef.current) return;

    event.preventDefault();
    setZoom(pinchRef.current.zoom * (touchDistance(event.touches) / pinchRef.current.distance));
  }

  function endPinch(event: TouchEvent<HTMLDivElement>) {
    if (event.touches.length < 2) pinchRef.current = null;
  }

  function resetZoom() {
    setZoomOrigin("50% 50%");
    setZoom(1);
  }

  return (
    <div className="map-zoom-viewport" onTouchEnd={endPinch} onTouchMove={zoomMap} onTouchStart={startPinch}>
      <svg viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`} role="group" aria-label="Interaktive Karte der Schweizer Kantone" style={{ transform: `scale(${mapZoom})`, transformOrigin: zoomOrigin }}>
        {features.map((feature, index) => {
        const sourceName = feature.properties.kan_name[0];
        const code = codesByName[sourceName];
        const canton = code ? getCanton(code) : undefined;

        if (!canton) return null;

        const cantonCode = canton.code;
        const isSelected = cantonCode === selectedCode;
        const label = language === "de" ? `${canton.name.de} auswählen` : `Select ${canton.name.en}`;
        const value = values?.[cantonCode];
        const normalizedValue = hasValues && value !== undefined ? maximumValue > minimumValue ? Math.max(0, Math.min(1, (value - minimumValue) / (maximumValue - minimumValue))) : 0.5 : null;
        const lightness = normalizedValue === null ? 88 : 91 - normalizedValue * (valueDomain ? 43 : 35);

        function reportHover(position: { x: number; y: number }) {
          onHover?.(cantonCode, position);
        }

        return (
          <path
            aria-label={label}
            className={`map-region ${isSelected ? "selected" : ""}`}
            d={featureToPath(feature)}
            key={cantonCode}
            role="button"
            style={{ "--region-index": index, "--region-lightness": `${lightness}%` } as React.CSSProperties}
            tabIndex={0}
            onClick={() => onSelect(cantonCode)}
            onFocus={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              reportHover({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(cantonCode);
              }
            }}
            onBlur={() => onLeave?.(cantonCode)}
            onPointerEnter={(event) => reportHover({ x: event.clientX, y: event.clientY })}
            onPointerLeave={() => onLeave?.(cantonCode)}
          />
        );
        })}
      </svg>
      {mapZoom > 1 && <button className="map-zoom-reset" type="button" aria-label="Kartenansicht zurücksetzen" title="Kartenansicht zurücksetzen" onClick={resetZoom}><RotateCcw size={16} /></button>}
    </div>
  );
}