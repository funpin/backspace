import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

/** Where the picture sits in its stage: a scale and the offset of its top-left corner, in stage pixels. */
export interface StageZoom {
  scale: number;
  x: number;
  y: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
export const IDENTITY_ZOOM: StageZoom = { scale: 1, x: 0, y: 0 };

/** Wheel travel to scale: one notch of a mouse wheel (deltaY 100) is about 16 %. */
const WHEEL_SENSITIVITY = 0.0015;
/** Things drawn over the picture that take their own presses and clicks. */
const OVERLAY_CONTROLS = 'button, a, [role="button"], [data-no-pan]';
/** Pointer travel, in px, past which a press on a zoomed picture is a pan rather than a click. */
const PAN_THRESHOLD = 4;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Keeps a zoomed picture covering its stage: it can be panned until an edge
 * meets the stage's edge and no further, so there is never an empty band.
 */
export function clampZoom(zoom: StageZoom, width: number, height: number): StageZoom {
  const scale = clamp(zoom.scale, MIN_ZOOM, MAX_ZOOM);
  if (scale === MIN_ZOOM) return IDENTITY_ZOOM;
  return {
    scale,
    x: clamp(zoom.x, width - width * scale, 0),
    y: clamp(zoom.y, height - height * scale, 0),
  };
}

/**
 * Zooms by `factor` around a point of the stage, so what is under the pointer
 * stays under the pointer.
 */
export function zoomAt(
  zoom: StageZoom,
  factor: number,
  pointX: number,
  pointY: number,
  width: number,
  height: number,
): StageZoom {
  const scale = clamp(zoom.scale * factor, MIN_ZOOM, MAX_ZOOM);
  const ratio = scale / zoom.scale;
  return clampZoom(
    { scale, x: pointX - (pointX - zoom.x) * ratio, y: pointY - (pointY - zoom.y) * ratio },
    width,
    height,
  );
}

/** The part of the stage on screen, as fractions of the stage (0..1). At 1x it is the whole stage. */
export interface StageViewport {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function viewportOf(zoom: StageZoom, width: number, height: number): StageViewport {
  if (width <= 0 || height <= 0) return { left: 0, top: 0, width: 1, height: 1 };
  return {
    // `+ 0` turns the -0 of an unpanned view into 0.
    left: -zoom.x / (zoom.scale * width) + 0,
    top: -zoom.y / (zoom.scale * height) + 0,
    width: 1 / zoom.scale,
    height: 1 / zoom.scale,
  };
}

/** The zoom that keeps the scale and puts the stage point (`fx`, `fy`, fractions) in the middle of the view. */
export function centeredOn(zoom: StageZoom, fx: number, fy: number, width: number, height: number): StageZoom {
  return clampZoom(
    { scale: zoom.scale, x: width / 2 - fx * width * zoom.scale, y: height / 2 - fy * height * zoom.scale },
    width,
    height,
  );
}

export interface StageZoomControls {
  zoom: StageZoom;
  isZoomed: boolean;
  reset: () => void;
  /** Sets the scale, keeping the middle of the view where it is (the slider and the +/- buttons). */
  setScale: (scale: number) => void;
  /** Moves the view so the stage point at these fractions is in its middle (the minimap). */
  centerOn: (fx: number, fy: number) => void;
  /** What part of the stage is on screen, as fractions of it. */
  viewport: StageViewport;
  /** The stage element, once mounted. */
  stageElement: HTMLDivElement | null;
  /** The stage's size in px, 0 before it is measured. */
  stageSize: { width: number; height: number };
  /** Spread on the stage element. Carries the transform as CSS variables. */
  stageProps: {
    ref: (element: HTMLDivElement | null) => void;
    style: React.CSSProperties;
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
    onClickCapture: (e: React.MouseEvent<HTMLDivElement>) => void;
    'data-zoom-stage': '';
    'data-zoomed': 'true' | undefined;
  };
}

/**
 * Wheel-to-zoom and drag-to-pan for a stage that shows one picture. The hook
 * only produces numbers; the stage hands them to its picture through the
 * `--stage-zoom-*` CSS variables (see `[data-zoom-stage]` in globals.css), so
 * the overlays drawn on top of the picture stay where they are.
 *
 * `resetKey` names what the stage shows: a different picture starts unzoomed.
 * While zoomed, a click on the stage is swallowed, because a drag ends in one
 * and the stage's own click (leave focus) must not fire from a pan.
 */
export function useStageZoom(resetKey: string | null): StageZoomControls {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState<StageZoom>(IDENTITY_ZOOM);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  // Set when a press turned into a pan, so the click that ends it is not a click.
  const pannedRef = useRef(false);

  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  const ref = useCallback((el: HTMLDivElement | null) => setElement(el), []);
  const reset = useCallback(() => setZoom(IDENTITY_ZOOM), []);
  const setScale = useCallback((scale: number) => {
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    setZoom((current) =>
      zoomAt(current, clamp(scale, MIN_ZOOM, MAX_ZOOM) / current.scale, bounds.width / 2, bounds.height / 2, bounds.width, bounds.height),
    );
  }, [element]);
  const centerOn = useCallback((fx: number, fy: number) => {
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    setZoom((current) => (current.scale === MIN_ZOOM ? current : centeredOn(current, fx, fy, bounds.width, bounds.height)));
  }, [element]);

  useEffect(() => {
    setZoom(IDENTITY_ZOOM);
  }, [resetKey]);

  // React registers wheel listeners as passive, and a passive listener cannot
  // stop the page from scrolling under the zoom.
  useEffect(() => {
    if (!element) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const bounds = element.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;
      setZoom((current) =>
        zoomAt(
          current,
          Math.exp(-e.deltaY * WHEEL_SENSITIVITY),
          e.clientX - bounds.left,
          e.clientY - bounds.top,
          bounds.width,
          bounds.height,
        ),
      );
    };
    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [element]);

  // A resized stage (window resize, the strip toggling) keeps the picture covering it.
  useEffect(() => {
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setStageSize((size) => (size.width === bounds.width && size.height === bounds.height ? size : { width: bounds.width, height: bounds.height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const bounds = element.getBoundingClientRect();
      measure();
      setZoom((current) => (current.scale === MIN_ZOOM ? current : clampZoom(current, bounds.width, bounds.height)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pannedRef.current = false;
    if (e.button !== 0 || zoomRef.current.scale === MIN_ZOOM) return;
    // A press on a control drawn over the picture is that control's own:
    // the corner inset has its own drag, the buttons their own click.
    if (e.target instanceof Element && e.target.closest(OVERLAY_CONTROLS)) return;
    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: zoomRef.current.x,
      originY: zoomRef.current.y,
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== e.pointerId || !element) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    if (!pan.moved) {
      if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
      pan.moved = true;
      pannedRef.current = true;
      element.setPointerCapture?.(e.pointerId);
    }
    const bounds = element.getBoundingClientRect();
    setZoom((current) =>
      clampZoom({ scale: current.scale, x: pan.originX + dx, y: pan.originY + dy }, bounds.width, bounds.height),
    );
  };

  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
  };

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    const panned = pannedRef.current;
    pannedRef.current = false;
    if (!panned && zoomRef.current.scale === MIN_ZOOM) return;
    // Controls drawn over the picture (the inset, the action buttons) keep
    // working while zoomed; only a click on the picture itself is swallowed.
    if (!panned && e.target instanceof Element && e.target.closest(OVERLAY_CONTROLS)) return;
    e.stopPropagation();
    e.preventDefault();
  };

  const isZoomed = zoom.scale > MIN_ZOOM;
  return {
    zoom,
    isZoomed,
    reset,
    setScale,
    centerOn,
    viewport: viewportOf(zoom, stageSize.width, stageSize.height),
    stageElement: element,
    stageSize,
    stageProps: {
      ref,
      style: {
        '--stage-zoom-scale': String(zoom.scale),
        '--stage-zoom-x': `${zoom.x}px`,
        '--stage-zoom-y': `${zoom.y}px`,
      } as React.CSSProperties,
      onPointerDown,
      onPointerMove,
      onPointerUp: endPan,
      onPointerCancel: endPan,
      onClickCapture,
      'data-zoom-stage': '',
      'data-zoomed': isZoomed ? 'true' : undefined,
    },
  };
}
