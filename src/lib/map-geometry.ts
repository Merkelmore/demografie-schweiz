export type Position = [number, number];
export type RegionFeature = {
  geometry: {
    coordinates: Position[][] | Position[][][];
    type: "Polygon" | "MultiPolygon";
  };
};

// Both maps use the projected Swiss coordinates from the same BFS topology.
export const mapViewBox = { height: 560, padding: 24, width: 800 };

function rings(feature: RegionFeature) {
  return feature.geometry.type === "Polygon"
    ? feature.geometry.coordinates as Position[][]
    : (feature.geometry.coordinates as Position[][][]).flat();
}

export function regionBounds(features: RegionFeature[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const feature of features) {
    for (const ring of rings(feature)) {
      for (const [x, y] of ring) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return { minX, minY, maxX, maxY };
}

export function regionPath(feature: RegionFeature, extent: ReturnType<typeof regionBounds>) {
  const scale = Math.min(
    (mapViewBox.width - mapViewBox.padding * 2) / (extent.maxX - extent.minX),
    (mapViewBox.height - mapViewBox.padding * 2) / (extent.maxY - extent.minY),
  );
  const offsetX = (mapViewBox.width - (extent.maxX - extent.minX) * scale) / 2;
  const offsetY = (mapViewBox.height - (extent.maxY - extent.minY) * scale) / 2;
  return rings(feature).map((ring) => ring.map(([x, y], index) =>
    `${index === 0 ? "M" : "L"}${(offsetX + (x - extent.minX) * scale).toFixed(1)} ${(mapViewBox.height - offsetY - (y - extent.minY) * scale).toFixed(1)}`,
  ).join(" ") + " Z").join(" ");
}
