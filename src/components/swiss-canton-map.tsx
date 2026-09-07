"use client";

import { feature } from "topojson-client";
import { RegionMap } from "@/components/region-map";
import { regionBounds, regionPath, type Position } from "@/lib/map-geometry";
import { useEffect, useMemo, useState } from "react";

import { cantonNumbers, getCanton, type Language } from "@/lib/cantons";
import { useTranslation } from "@/lib/i18n";

type CantonTopology = { objects: Record<string, unknown>; type: "Topology" };

type CantonFeature = {
  geometry: {
    coordinates: Position[][] | Position[][][];
    type: "Polygon" | "MultiPolygon";
  };
  properties: {
    kantId: number;
    kantName: string;
  };
  type: "Feature";
};

type CantonCollection = {
  features: CantonFeature[];
};

const codesByNumber = Object.fromEntries(Object.entries(cantonNumbers).map(([code, number]) => [number, code]));

type SwissCantonMapProps = {
  language: Language;
  onHover?: (code: string, position: { x: number; y: number }) => void;
  onLeave?: (code: string) => void;
  onSelect: (code: string, position?: { x: number; y: number }) => void;
  selectedCode: string;
  valueDomain?: readonly [number, number];
  values?: Record<string, number>;
};

export function SwissCantonMap({ language, onHover, onLeave, onSelect, selectedCode, valueDomain, values }: SwissCantonMapProps) {
  const { t } = useTranslation();
  const [features, setFeatures] = useState<CantonFeature[]>([]);
  const [loadError, setLoadError] = useState(false);
  const numericValues = values ? Object.values(values) : [];
  const hasValues = numericValues.length > 0;
  const minimumValue = valueDomain?.[0] ?? Math.min(...numericValues);
  const maximumValue = valueDomain?.[1] ?? Math.max(...numericValues);

  useEffect(() => {
    let active = true;

    fetch("/geo/municipalities-2026.topojson")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load canton geometry");
        return response.json() as Promise<CantonTopology>;
      })
      .then((topology) => {
        const layer = topology.objects.k4kant_20260101_gf_ohne_seen;
        if (!layer) throw new Error("Canton layer missing");
        const collection = feature(topology as Parameters<typeof feature>[0], layer as Parameters<typeof feature>[1]) as unknown as CantonCollection;
        if (collection.features.length !== 26 || collection.features.some((region) => !getCanton(codesByNumber[region.properties.kantId] ?? ""))) {
          throw new Error("Expected all 26 cantons");
        }
        if (active) setFeatures(collection.features);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const regions = useMemo(() => {
    if (!features.length) return [];
    const extent = regionBounds(features);
    return features.flatMap((region, index) => {
      const canton = getCanton(codesByNumber[region.properties.kantId] ?? "");
      return canton ? [{ canton, index, path: regionPath(region, extent) }] : [];
    });
  }, [features]);

  if (loadError) {
    return <p className="map-status" role="alert">{t("mapFailed")}</p>;
  }

  if (features.length === 0) {
    return <p className="map-status" aria-live="polite">{t("mapLoading")}</p>;
  }

  return (
    <RegionMap className="map-zoom-viewport" ariaLabel={t("cantonMapAria")}>
        {regions.map(({ canton, index, path }) => {
        const cantonCode = canton.code;
        const isSelected = cantonCode === selectedCode;
        const label = `${canton.name[language]}: ${t("cantonAction")}`;
        const value = values?.[cantonCode];
        const normalizedValue = hasValues && value !== undefined ? maximumValue > minimumValue ? Math.max(0, Math.min(1, (value - minimumValue) / (maximumValue - minimumValue))) : 0.5 : null;
        const lightness = normalizedValue === null ? 88 : 91 - normalizedValue * (valueDomain ? 43 : 35);

        return (
          <path
            aria-label={label}
            className={`map-region ${isSelected ? "selected" : ""}`}
            d={path}
            key={cantonCode}
            role="button"
            style={{ "--region-index": index, "--region-lightness": `${lightness}%` } as React.CSSProperties}
            tabIndex={0}
            onClick={(event) => {
              onSelect(cantonCode, { x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(cantonCode);
              }
            }}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") onHover?.(cantonCode, { x: event.clientX, y: event.clientY });
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") onLeave?.(cantonCode);
            }}
          />
        );
        })}
    </RegionMap>
  );
}
