"use client";

import { toChartPoint, type CompassSpread } from "@/lib/political-compass";

const miniature = { center: 50, extent: 42, size: 100 };

/**
 * The compass reduced to its colour key. With a point it marks a single region; without one it is the legend that
 * explains the quadrant colours of the municipality map.
 */
export function CompassMiniature({ point, spread, title }: { point?: { x: number; y: number }; spread: CompassSpread; title: string }) {
  const marker = point && toChartPoint(point, spread, miniature);

  return (
    <figure className="compass-miniature">
      <span className="compass-miniature__axis compass-miniature__axis--top">Autorität</span>
      <span className="compass-miniature__axis compass-miniature__axis--left">Links</span>
      <svg viewBox={`0 0 ${miniature.size} ${miniature.size}`} role="img" aria-label={title}>
        <rect className="compass-quadrant compass-quadrant--authoritarian-left" x="0" y="0" width="50" height="50" />
        <rect className="compass-quadrant compass-quadrant--authoritarian-right" x="50" y="0" width="50" height="50" />
        <rect className="compass-quadrant compass-quadrant--libertarian-left" x="0" y="50" width="50" height="50" />
        <rect className="compass-quadrant compass-quadrant--libertarian-right" x="50" y="50" width="50" height="50" />
        <line className="compass-axis" x1="0" x2="100" y1="50" y2="50" />
        <line className="compass-axis" x1="50" x2="50" y1="0" y2="100" />
        {marker && <>
          <circle className="compass-miniature__halo" cx={marker.x} cy={marker.y} r="9" />
          <circle className="compass-miniature__point" cx={marker.x} cy={marker.y} r="4.2" />
        </>}
      </svg>
      <span className="compass-miniature__axis compass-miniature__axis--right">Rechts</span>
      <span className="compass-miniature__axis compass-miniature__axis--bottom">Libertär</span>
    </figure>
  );
}
