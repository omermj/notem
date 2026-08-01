import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from "d3-force";
import type { GraphNode, LinkGraph } from "../api";
import {
  clampGraphZoom,
  fitGraphTransform,
  graphPreSettleTicks,
  wheelZoomFactor,
} from "./view";

export interface GraphForces {
  strength: number;
  linkDistance: number;
}

interface RenderNode extends GraphNode, SimulationNodeDatum {
  radius: number;
  color: string;
}

interface RenderLink {
  source: RenderNode;
  target: RenderNode;
}

interface Quad {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  nodes: RenderNode[] | null;
  children: [Quad | null, Quad | null, Quad | null, Quad | null] | null;
}

const DASHED = [3, 3];
const SOLID: number[] = [];
class NodeQuadtree {
  private root: Quad | null = null;

  rebuild(nodes: RenderNode[]): void {
    if (!nodes.length) {
      this.root = null;
      return;
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const node of nodes) {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    const size = Math.max(x1 - x0, y1 - y0, 1);
    this.root = {
      x0,
      y0,
      x1: x0 + size,
      y1: y0 + size,
      nodes: [],
      children: null,
    };
    for (const node of nodes) this.insert(this.root, node, 0);
  }

  find(x: number, y: number, distance: number): RenderNode | null {
    if (!this.root) return null;
    let closest: RenderNode | null = null;
    let closestSquared = distance * distance;
    const visit = (quad: Quad): void => {
      const dx = x < quad.x0 ? quad.x0 - x : x > quad.x1 ? x - quad.x1 : 0;
      const dy = y < quad.y0 ? quad.y0 - y : y > quad.y1 ? y - quad.y1 : 0;
      if (dx * dx + dy * dy > closestSquared) return;
      if (quad.nodes) {
        for (const node of quad.nodes) {
          const nx = (node.x ?? 0) - x;
          const ny = (node.y ?? 0) - y;
          const squared = nx * nx + ny * ny;
          if (squared <= closestSquared) {
            closestSquared = squared;
            closest = node;
          }
        }
        return;
      }
      if (!quad.children) return;
      for (const child of quad.children) if (child) visit(child);
    };
    visit(this.root);
    return closest;
  }

  private insert(quad: Quad, node: RenderNode, depth: number): void {
    if (quad.nodes && (quad.nodes.length < 8 || depth >= 18)) {
      quad.nodes.push(node);
      return;
    }
    if (quad.nodes) {
      const existing = quad.nodes;
      quad.nodes = null;
      quad.children = [null, null, null, null];
      for (const item of existing) this.insertChild(quad, item, depth);
    }
    this.insertChild(quad, node, depth);
  }

  private insertChild(quad: Quad, node: RenderNode, depth: number): void {
    if (!quad.children) return;
    const midX = (quad.x0 + quad.x1) / 2;
    const midY = (quad.y0 + quad.y1) / 2;
    const right = (node.x ?? 0) >= midX;
    const bottom = (node.y ?? 0) >= midY;
    const index = (bottom ? 2 : 0) + (right ? 1 : 0);
    let child = quad.children[index];
    if (!child) {
      child = {
        x0: right ? midX : quad.x0,
        y0: bottom ? midY : quad.y0,
        x1: right ? quad.x1 : midX,
        y1: bottom ? quad.y1 : midY,
        nodes: [],
        children: null,
      };
      quad.children[index] = child;
    }
    this.insert(child, node, depth + 1);
  }
}

export class GraphRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly quadtree = new NodeQuadtree();
  private readonly chargeForce = forceManyBody<RenderNode>();
  private readonly linkForce = forceLink<RenderNode, RenderLink>();
  private readonly resizeObserver: ResizeObserver;
  private readonly themeObserver: MutationObserver;
  private simulation: Simulation<RenderNode, RenderLink> | null = null;
  private nodes: RenderNode[] = [];
  private links: RenderLink[] = [];
  private adjacency = new Map<string, Set<string>>();
  private hovered: RenderNode | null = null;
  private dragged: RenderNode | null = null;
  private pointerId: number | null = null;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private moved = false;
  private width = 1;
  private height = 1;
  private transformX = 0;
  private transformY = 0;
  private zoom = 1;
  private frameId = 0;
  private lastTick = 0;
  private lastTreeBuild = 0;
  private needsDraw = true;
  private centerId: string | null = null;
  private labelThreshold = 1.15;
  private labelFont = "11px sans-serif";
  private edgeColor = "CanvasText";
  private textColor = "CanvasText";
  private surfaceColor = "Canvas";
  private folderColors: string[] = [];
  private forceStrength = 0;
  private forceDistance = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onOpen: (node: GraphNode) => void,
    private readonly onHover: (node: GraphNode | null) => void,
  ) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas rendering is not available");
    this.context = context;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.themeObserver = new MutationObserver(() => {
      this.readTheme();
      this.invalidate();
    });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-system-theme", "style"],
    });
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerUp);
    canvas.addEventListener("pointerleave", this.pointerLeave);
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    this.readTheme();
    this.resize();
  }

  setData(
    graph: LinkGraph,
    forces: GraphForces,
    centerId: string | null,
    compact: boolean,
  ): void {
    const positions = new Map<string, RenderNode>();
    for (const node of this.nodes) positions.set(node.id, node);
    const reusingLayout = positions.size > 0;
    const byId = new Map<string, RenderNode>();
    this.nodes = graph.nodes.map((node) => {
      const previous = positions.get(node.id);
      const folder = node.id.includes("/") ? node.id.split("/", 1)[0] : "";
      const rendered: RenderNode = {
        ...node,
        x: previous?.x,
        y: previous?.y,
        vx: previous?.vx,
        vy: previous?.vy,
        radius: Math.min(15, 4 + Math.sqrt(node.linksCount) * 1.7),
        color: folderColor(folder, this.folderColors),
      };
      byId.set(node.id, rendered);
      return rendered;
    });
    this.links = [];
    this.adjacency = new Map();
    for (const node of this.nodes) this.adjacency.set(node.id, new Set());
    for (const edge of graph.edges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) continue;
      this.links.push({ source, target });
      this.adjacency.get(source.id)?.add(target.id);
      this.adjacency.get(target.id)?.add(source.id);
    }
    this.centerId = centerId?.replace(/\.md$/i, "") ?? null;
    this.labelThreshold = compact ? 0.6 : 0.8;
    this.forceStrength = forces.strength;
    this.forceDistance = forces.linkDistance;
    this.hovered = null;
    this.simulation?.stop();
    this.simulation = forceSimulation<RenderNode>(this.nodes)
      .force(
        "link",
        this.linkForce
          .links(this.links)
          .id((node) => node.id)
          .distance(forces.linkDistance)
          .strength(0.7),
      )
      .force("charge", this.chargeForce.strength(-forces.strength))
      .force("center", forceCenter(0, 0))
      .force("x", forceX<RenderNode>(0).strength(0.035))
      .force("y", forceY<RenderNode>(0).strength(0.035))
      .force(
        "collide",
        forceCollide<RenderNode>().radius((node) => node.radius + 3),
      )
      .stop();
    this.simulation.alpha(1);
    this.simulation.tick(graphPreSettleTicks(this.nodes.length, reusingLayout));
    // The initial layout must be stable before its first visible frame.
    this.simulation.alpha(0);
    this.quadtree.rebuild(this.nodes);
    this.lastTreeBuild = 0;
    this.applyFit();
    this.invalidate();
  }

  setForces(forces: GraphForces): void {
    if (
      this.forceStrength === forces.strength &&
      this.forceDistance === forces.linkDistance
    ) {
      return;
    }
    this.forceStrength = forces.strength;
    this.forceDistance = forces.linkDistance;
    this.chargeForce.strength(-forces.strength);
    this.linkForce.distance(forces.linkDistance);
    this.simulation?.alpha(0.55);
    this.invalidate();
  }

  zoomIn(): void {
    this.zoomBy(1.25);
  }

  zoomOut(): void {
    this.zoomBy(0.8);
  }

  fitToView(): void {
    this.applyFit();
  }

  destroy(): void {
    cancelAnimationFrame(this.frameId);
    this.simulation?.stop();
    this.resizeObserver.disconnect();
    this.themeObserver.disconnect();
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointercancel", this.pointerUp);
    this.canvas.removeEventListener("pointerleave", this.pointerLeave);
    this.canvas.removeEventListener("wheel", this.wheel);
  }

  private readonly pointerDown = (event: PointerEvent): void => {
    this.canvas.setPointerCapture(event.pointerId);
    this.pointerId = event.pointerId;
    this.pointerStartX = this.lastPointerX = event.offsetX;
    this.pointerStartY = this.lastPointerY = event.offsetY;
    this.moved = false;
    this.dragged = this.hitTest(event.offsetX, event.offsetY);
    if (this.dragged) {
      this.dragged.fx = this.dragged.x;
      this.dragged.fy = this.dragged.y;
      this.simulation?.alpha(0.3);
    }
  };

  private readonly pointerMove = (event: PointerEvent): void => {
    if (this.pointerId === event.pointerId) {
      const dx = event.offsetX - this.lastPointerX;
      const dy = event.offsetY - this.lastPointerY;
      if (
        Math.abs(event.offsetX - this.pointerStartX) +
          Math.abs(event.offsetY - this.pointerStartY) >
        4
      ) {
        this.moved = true;
      }
      if (this.dragged) {
        const x = (event.offsetX - this.transformX) / this.zoom;
        const y = (event.offsetY - this.transformY) / this.zoom;
        this.dragged.x = this.dragged.fx = x;
        this.dragged.y = this.dragged.fy = y;
        this.simulation?.alpha(0.3);
      } else {
        this.transformX += dx;
        this.transformY += dy;
      }
      this.lastPointerX = event.offsetX;
      this.lastPointerY = event.offsetY;
      this.invalidate();
      return;
    }
    this.setHovered(this.hitTest(event.offsetX, event.offsetY));
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    if (this.dragged) {
      this.dragged.fx = null;
      this.dragged.fy = null;
      if (!this.moved) this.onOpen(this.dragged);
    }
    this.dragged = null;
    this.pointerId = null;
    this.invalidate();
  };

  private readonly pointerLeave = (): void => {
    if (this.pointerId === null) this.setHovered(null);
  };

  private readonly wheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoomAt(
      this.zoom * wheelZoomFactor(event.deltaY, event.deltaMode, event.ctrlKey),
      event.offsetX,
      event.offsetY,
    );
  };

  private zoomBy(factor: number): void {
    this.zoomAt(this.zoom * factor, this.width / 2, this.height / 2);
  }

  private zoomAt(nextZoom: number, screenX: number, screenY: number): void {
    const previous = this.zoom;
    const next = clampGraphZoom(nextZoom);
    const worldX = (screenX - this.transformX) / previous;
    const worldY = (screenY - this.transformY) / previous;
    this.zoom = next;
    this.labelFont = `${Math.max(9, 11 / this.zoom)}px sans-serif`;
    this.transformX = screenX - worldX * next;
    this.transformY = screenY - worldY * next;
    this.invalidate();
  }

  private applyFit(): void {
    const transform = fitGraphTransform(
      this.nodes,
      this.width,
      this.height,
      this.centerId ? 42 : 64,
    );
    this.zoom = transform.zoom;
    this.transformX = transform.x;
    this.transformY = transform.y;
    this.labelFont = `${Math.max(9, 11 / this.zoom)}px sans-serif`;
    this.invalidate();
  }

  private setHovered(node: RenderNode | null): void {
    if (this.hovered === node) return;
    this.hovered = node;
    this.canvas.style.cursor = node ? "pointer" : "grab";
    this.onHover(node);
    this.invalidate();
  }

  private hitTest(screenX: number, screenY: number): RenderNode | null {
    const x = (screenX - this.transformX) / this.zoom;
    const y = (screenY - this.transformY) / this.zoom;
    const node = this.quadtree.find(x, y, 22 / this.zoom + 15);
    if (!node) return null;
    const dx = (node.x ?? 0) - x;
    const dy = (node.y ?? 0) - y;
    const radius = node.radius + 5 / this.zoom;
    return dx * dx + dy * dy <= radius * radius ? node : null;
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const oldWidth = this.width;
    const oldHeight = this.height;
    this.width = Math.max(1, rect.width);
    this.height = Math.max(1, rect.height);
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * ratio);
    this.canvas.height = Math.round(this.height * ratio);
    if (this.transformX === 0 && this.transformY === 0) {
      this.transformX = this.width / 2;
      this.transformY = this.height / 2;
    } else {
      this.transformX += (this.width - oldWidth) / 2;
      this.transformY += (this.height - oldHeight) / 2;
    }
    this.invalidate();
  }

  private readTheme(): void {
    const style = getComputedStyle(document.documentElement);
    this.edgeColor =
      style.getPropertyValue("--color-border-strong").trim() || "CanvasText";
    this.textColor =
      style.getPropertyValue("--color-text-strong").trim() || "CanvasText";
    this.surfaceColor =
      style.getPropertyValue("--color-surface").trim() || "Canvas";
    this.folderColors = Array.from({ length: 8 }, (_, index) =>
      style.getPropertyValue(`--color-graph-${index + 1}`).trim(),
    );
    for (const node of this.nodes) {
      const folder = node.id.includes("/") ? node.id.split("/", 1)[0] : "";
      node.color = folderColor(folder, this.folderColors);
    }
  }

  private invalidate(): void {
    this.needsDraw = true;
    if (!this.frameId) this.frameId = requestAnimationFrame(this.frame);
  }

  private readonly frame = (timestamp: number): void => {
    this.frameId = 0;
    const active = Boolean(
      this.simulation && this.simulation.alpha() > this.simulation.alphaMin(),
    );
    if (active && timestamp - this.lastTick >= 32) {
      this.simulation?.tick();
      this.lastTick = timestamp;
      this.needsDraw = true;
      if (timestamp - this.lastTreeBuild >= 96) {
        this.quadtree.rebuild(this.nodes);
        this.lastTreeBuild = timestamp;
      }
    }
    if (this.needsDraw) {
      this.draw();
      this.needsDraw = false;
    }
    if (active || this.dragged)
      this.frameId = requestAnimationFrame(this.frame);
  };

  private draw(): void {
    const context = this.context;
    const ratio = this.canvas.width / this.width;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.fillStyle = this.surfaceColor;
    context.fillRect(0, 0, this.width, this.height);
    context.translate(this.transformX, this.transformY);
    context.scale(this.zoom, this.zoom);
    const hovered = this.hovered;
    const neighbors = hovered ? this.adjacency.get(hovered.id) : null;

    context.setLineDash(SOLID);
    context.lineWidth = 1 / this.zoom;
    context.strokeStyle = this.edgeColor;
    for (const link of this.links) {
      context.globalAlpha =
        hovered && link.source !== hovered && link.target !== hovered
          ? 0.08
          : 0.55;
      context.beginPath();
      context.moveTo(link.source.x ?? 0, link.source.y ?? 0);
      context.lineTo(link.target.x ?? 0, link.target.y ?? 0);
      context.stroke();
    }

    for (const node of this.nodes) {
      const related = !hovered || node === hovered || neighbors?.has(node.id);
      context.globalAlpha = related ? (node.ghost ? 0.45 : 0.95) : 0.1;
      context.fillStyle = node.ghost ? this.surfaceColor : node.color;
      context.strokeStyle = node.ghost ? this.edgeColor : node.color;
      context.lineWidth = (node === hovered ? 2.5 : 1.25) / this.zoom;
      context.setLineDash(node.ghost ? DASHED : SOLID);
      context.beginPath();
      context.arc(node.x ?? 0, node.y ?? 0, node.radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      if (node.id === this.centerId) {
        context.setLineDash(SOLID);
        context.strokeStyle = this.textColor;
        context.lineWidth = 1.5 / this.zoom;
        context.beginPath();
        context.arc(
          node.x ?? 0,
          node.y ?? 0,
          node.radius + 3 / this.zoom,
          0,
          Math.PI * 2,
        );
        context.stroke();
      }
    }

    if (this.zoom >= this.labelThreshold) {
      context.setLineDash(SOLID);
      context.fillStyle = this.textColor;
      context.font = this.labelFont;
      context.textAlign = "center";
      context.textBaseline = "bottom";
      for (const node of this.nodes) {
        const related = !hovered || node === hovered || neighbors?.has(node.id);
        context.globalAlpha = related ? (node.ghost ? 0.55 : 0.9) : 0.08;
        context.fillText(
          node.title,
          node.x ?? 0,
          (node.y ?? 0) - node.radius - 3 / this.zoom,
        );
      }
    }
    context.globalAlpha = 1;
    context.setLineDash(SOLID);
  }
}

function folderColor(folder: string, colors: string[]): string {
  if (!folder) return colors[0] || "CanvasText";
  let hash = 0;
  for (let index = 0; index < folder.length; index += 1) {
    hash = (hash * 31 + folder.charCodeAt(index)) | 0;
  }
  return colors[Math.abs(hash) % colors.length] || "CanvasText";
}
