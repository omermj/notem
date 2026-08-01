import type { NotemDrag } from "./drag";

export interface DragPoint {
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  altKey: boolean;
}

export interface InternalDropTarget {
  accepts(payload: NotemDrag, point: DragPoint, hit: Element): boolean;
  priority?:
    number | ((payload: NotemDrag, point: DragPoint, hit: Element) => number);
  move?(payload: NotemDrag, point: DragPoint): void;
  leave?(): void;
  drop(
    payload: NotemDrag,
    point: DragPoint,
    target: HTMLElement,
  ): void | Promise<void>;
  highlight?: boolean;
}

interface InternalDragOptions {
  label: string;
  onStart?(): void;
  onEnd?(): void;
  onUnhandledDrop?(point: DragPoint): void | Promise<void>;
}

interface ActiveDrag {
  payload: NotemDrag;
  options: InternalDragOptions;
  source: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  started: boolean;
  preview: HTMLDivElement | null;
  target: HTMLElement | null;
  targetConfig: InternalDropTarget | null;
}

const targets = new Map<HTMLElement, InternalDropTarget>();
let active: ActiveDrag | null = null;

export function internalDropTarget(
  node: HTMLElement,
  config: InternalDropTarget,
): { update(next: InternalDropTarget): void; destroy(): void } {
  targets.set(node, config);
  return {
    update(next) {
      targets.set(node, next);
    },
    destroy() {
      targets.delete(node);
      if (active?.target === node) clearTarget(active);
    },
  };
}

export function beginInternalDrag(
  event: PointerEvent,
  payload: NotemDrag,
  options: InternalDragOptions,
): void {
  if (event.button !== 0 || active) return;
  const source = event.currentTarget as HTMLElement | null;
  if (!source) return;
  const interactive =
    event.target instanceof Element
      ? event.target.closest("button, input, select, textarea, a")
      : null;
  if (interactive && interactive !== source) return;

  active = {
    payload,
    options,
    source,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    started: false,
    preview: null,
    target: null,
    targetConfig: null,
  };
  source.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", pointerMove, true);
  window.addEventListener("pointerup", pointerUp, true);
  window.addEventListener("pointercancel", pointerCancel, true);
}

function pointerMove(event: PointerEvent): void {
  const drag = active;
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (
    !drag.started &&
    Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5
  ) {
    return;
  }
  if (!drag.started) startDragging(drag);
  event.preventDefault();
  positionPreview(drag, event.clientX, event.clientY);
  updateTarget(drag, pointFrom(event));
}

function pointerUp(event: PointerEvent): void {
  const drag = active;
  if (!drag || event.pointerId !== drag.pointerId) return;
  const point = pointFrom(event);
  const target = drag.targetConfig;
  const targetElement = drag.target;
  const started = drag.started;
  cleanup(drag);
  if (!started) return;
  suppressNextClick();
  if (target && targetElement)
    void target.drop(drag.payload, point, targetElement);
  else void drag.options.onUnhandledDrop?.(point);
}

function pointerCancel(event: PointerEvent): void {
  const drag = active;
  if (!drag || event.pointerId !== drag.pointerId) return;
  cleanup(drag);
}

function startDragging(drag: ActiveDrag): void {
  drag.started = true;
  drag.source.classList.add("internal-drag-source");
  document.body.classList.add("internal-drag-active");
  const preview = document.createElement("div");
  preview.className = "internal-drag-preview";
  preview.textContent = drag.options.label;
  document.body.append(preview);
  drag.preview = preview;
  drag.options.onStart?.();
}

function updateTarget(drag: ActiveDrag, point: DragPoint): void {
  const hit = document.elementFromPoint(point.clientX, point.clientY);
  const [target, config] = hit
    ? findTarget(hit, drag.payload, point)
    : [null, null];
  if (target !== drag.target) {
    clearTarget(drag);
    drag.target = target;
    drag.targetConfig = config;
    if (target && config?.highlight !== false)
      target.classList.add("internal-drop-hover");
  } else {
    drag.targetConfig = config;
  }
  config?.move?.(drag.payload, point);
}

function findTarget(
  hit: Element,
  payload: NotemDrag,
  point: DragPoint,
): [HTMLElement | null, InternalDropTarget | null] {
  let bestTarget: HTMLElement | null = null;
  let bestConfig: InternalDropTarget | null = null;
  let bestPriority = Number.NEGATIVE_INFINITY;
  let candidate: Element | null = hit;
  while (candidate) {
    if (candidate instanceof HTMLElement) {
      const config = targets.get(candidate);
      if (config?.accepts(payload, point, hit)) {
        const priority =
          typeof config.priority === "function"
            ? config.priority(payload, point, hit)
            : (config.priority ?? 0);
        if (priority > bestPriority) {
          bestTarget = candidate;
          bestConfig = config;
          bestPriority = priority;
        }
      }
    }
    candidate = candidate.parentElement;
  }
  return [bestTarget, bestConfig];
}

function clearTarget(drag: ActiveDrag): void {
  drag.targetConfig?.leave?.();
  drag.target?.classList.remove("internal-drop-hover");
  drag.target = null;
  drag.targetConfig = null;
}

function positionPreview(drag: ActiveDrag, x: number, y: number): void {
  if (!drag.preview) return;
  drag.preview.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
}

function cleanup(drag: ActiveDrag): void {
  clearTarget(drag);
  drag.source.classList.remove("internal-drag-source");
  document.body.classList.remove("internal-drag-active");
  drag.preview?.remove();
  drag.source.releasePointerCapture?.(drag.pointerId);
  window.removeEventListener("pointermove", pointerMove, true);
  window.removeEventListener("pointerup", pointerUp, true);
  window.removeEventListener("pointercancel", pointerCancel, true);
  active = null;
  if (drag.started) drag.options.onEnd?.();
}

function pointFrom(event: PointerEvent): DragPoint {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    altKey: event.altKey,
  };
}

function suppressNextClick(): void {
  const suppress = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopImmediatePropagation();
    window.removeEventListener("click", suppress, true);
  };
  window.addEventListener("click", suppress, true);
  window.setTimeout(
    () => window.removeEventListener("click", suppress, true),
    100,
  );
}
