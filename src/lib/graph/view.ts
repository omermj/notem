export interface GraphPoint {
  x?: number;
  y?: number;
  radius: number;
}

export interface GraphTransform {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_GRAPH_ZOOM = 0.15;
export const MAX_GRAPH_ZOOM = 6;

export function clampGraphZoom(zoom: number): number {
  return Math.max(MIN_GRAPH_ZOOM, Math.min(MAX_GRAPH_ZOOM, zoom));
}

export function wheelZoomFactor(
  deltaY: number,
  deltaMode: number,
  pinch: boolean,
): number {
  const unit = deltaMode === 1 ? 0.05 : deltaMode === 2 ? 1 : 0.002;
  const exponent = Math.max(
    -0.5,
    Math.min(0.5, -deltaY * unit * (pinch ? 10 : 1)),
  );
  return 2 ** exponent;
}

export function graphPreSettleTicks(
  nodeCount: number,
  reusingLayout: boolean,
): number {
  if (reusingLayout) {
    if (nodeCount <= 1_000) return 12;
    if (nodeCount <= 2_500) return 6;
    return 4;
  }
  if (nodeCount <= 200) return 72;
  if (nodeCount <= 1_000) return 36;
  if (nodeCount <= 2_500) return 16;
  return 8;
}

export function fitGraphTransform(
  points: GraphPoint[],
  width: number,
  height: number,
  padding = 56,
): GraphTransform {
  if (!points.length) return { x: width / 2, y: height / 2, zoom: 1 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const x = point.x ?? 0;
    const y = point.y ?? 0;
    minX = Math.min(minX, x - point.radius);
    minY = Math.min(minY, y - point.radius);
    maxX = Math.max(maxX, x + point.radius);
    maxY = Math.max(maxY, y + point.radius);
  }

  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const zoom = clampGraphZoom(
    Math.min(
      2.5,
      availableWidth / contentWidth,
      availableHeight / contentHeight,
    ),
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    x: width / 2 - centerX * zoom,
    y: height / 2 - centerY * zoom,
    zoom,
  };
}
