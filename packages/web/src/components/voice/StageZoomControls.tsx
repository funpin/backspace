import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../i18n/formatters';
import { MAX_ZOOM, MIN_ZOOM, type StageZoomControls } from '../../hooks/useStageZoom';
import { containedBox } from '../../utils/streamPointerProtocol';

/** One press of + or −, and one arrow-key step of the slider. */
const ZOOM_STEP = 0.25;
/** Where the chip jumps to from 100 %: far enough to see that it zoomed. */
const FIRST_ZOOM = 2;
/** The minimap's long side, px. */
const MINIMAP_SIZE = 148;
/** How often the minimap repaints its picture. It is a map, not a second player. */
const MINIMAP_REPAINT_MS = 500;

const BUTTON = 'h-7 flex items-center justify-center text-white/70 hover:text-white transition-colors';

function MagnifierIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  );
}

/**
 * The zoom control of the focus bar. At 100 % it is one chip that says so, and
 * a press zooms in. Once zoomed it opens into − / slider / + with the
 * percentage, which is then the way back to 100 %. The chip is always there,
 * so the bar does not change what it offers when the wheel is first turned.
 */
export function StageZoomBar({ zoom }: { zoom: StageZoomControls }) {
  const { t } = useTranslation(['voice', 'common']);
  const f = useFormatters();
  const scale = zoom.zoom.scale;
  const percent = f.formatPercent(Math.round(scale * 100));
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  if (!zoom.isZoomed) {
    return (
      <button
        type="button"
        data-testid="zoom-chip"
        onClick={(e) => {
          e.stopPropagation();
          zoom.setScale(FIRST_ZOOM);
        }}
        className={`${BUTTON} px-2.5 gap-1.5 bg-black/60 hover:bg-black/80 rounded-lg`}
        aria-label={t('voice:grid.zoomIn')}
        title={t('voice:grid.zoomHint')}
      >
        <MagnifierIcon />
        <span className="text-xs font-medium tabular-nums">{percent}</span>
      </button>
    );
  }

  return (
    <div
      data-testid="zoom-bar"
      data-no-pan
      onClick={stop}
      className="h-7 flex items-center bg-black/60 rounded-lg pl-1 pr-0.5"
    >
      <button
        type="button"
        onClick={() => zoom.setScale(scale - ZOOM_STEP)}
        className={`${BUTTON} w-6 text-base leading-none`}
        aria-label={t('voice:grid.zoomOut')}
        title={t('voice:grid.zoomOut')}
      >
        {/* i18n-check: allow-literal a minus sign is the button's glyph in every language */}
        −
      </button>
      <input
        type="range"
        data-testid="zoom-slider"
        min={MIN_ZOOM * 100}
        max={MAX_ZOOM * 100}
        step={ZOOM_STEP * 100}
        value={Math.round(scale * 100)}
        onChange={(e) => zoom.setScale(Number(e.target.value) / 100)}
        // The stage under the bar pans on a drag and leaves focus on a click.
        onPointerDown={stop}
        aria-label={t('voice:grid.zoomLevel')}
        aria-valuetext={percent}
        className="w-24 mx-1 h-1 accent-accent-primary cursor-pointer"
      />
      <button
        type="button"
        onClick={() => zoom.setScale(scale + ZOOM_STEP)}
        className={`${BUTTON} w-6 text-base leading-none`}
        aria-label={t('voice:grid.zoomIn')}
        title={t('voice:grid.zoomIn')}
      >
        {/* i18n-check: allow-literal a plus sign is the button's glyph in every language */}
        +
      </button>
      <button
        type="button"
        data-testid="zoom-reset"
        onClick={zoom.reset}
        className={`${BUTTON} min-w-[3.25rem] px-1.5 rounded-md hover:bg-white/10 text-xs font-medium tabular-nums`}
        aria-label={t('voice:grid.resetZoom')}
        title={t('voice:grid.resetZoom')}
      >
        {percent}
      </button>
    </div>
  );
}

/**
 * A small map of the whole stage with the part on screen framed in it, shown
 * while zoomed. Pressing or dragging on it moves the view there.
 *
 * The map is the stage in miniature, letterbox bands included, so the frame's
 * place in it is the view's place in the stage with no further arithmetic.
 * Its picture is repainted from the stage's own `<video>` twice a second onto
 * a canvas: no second subscription, no second decoder.
 */
export function StageZoomMinimap({ zoom }: { zoom: StageZoomControls }) {
  const { t } = useTranslation(['voice', 'common']);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stageElement, stageSize, viewport, isZoomed, centerOn } = zoom;

  const ratio = stageSize.width > 0 && stageSize.height > 0 ? stageSize.width / stageSize.height : 16 / 9;
  const width = ratio >= 1 ? MINIMAP_SIZE : Math.round(MINIMAP_SIZE * ratio);
  const height = ratio >= 1 ? Math.round(MINIMAP_SIZE / ratio) : MINIMAP_SIZE;

  useEffect(() => {
    if (!isZoomed || !stageElement) return;
    const paint = () => {
      const canvas = canvasRef.current;
      const video = stageElement.querySelector<HTMLVideoElement>(':scope > [data-context-menu] > video');
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!video || video.videoWidth === 0) return;
      const box = containedBox({ left: 0, top: 0, width: canvas.width, height: canvas.height }, video.videoWidth, video.videoHeight);
      if (box) ctx.drawImage(video, box.left, box.top, box.width, box.height);
    };
    paint();
    const interval = setInterval(paint, MINIMAP_REPAINT_MS);
    return () => clearInterval(interval);
  }, [isZoomed, stageElement, width, height]);

  if (!isZoomed) return null;

  const moveTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    centerOn((e.clientX - bounds.left) / bounds.width, (e.clientY - bounds.top) / bounds.height);
  };

  return (
    <div
      data-testid="zoom-minimap"
      data-no-pan
      role="img"
      aria-label={t('voice:grid.zoomMinimap')}
      title={t('voice:grid.zoomMinimap')}
      style={{ width, height }}
      className="relative rounded-lg overflow-hidden bg-black ring-1 ring-white/20 shadow-lg cursor-crosshair touch-none"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        moveTo(e);
      }}
      onPointerMove={(e) => { if (e.buttons === 1) moveTo(e); }}
    >
      <canvas ref={canvasRef} width={width * 2} height={height * 2} className="block w-full h-full opacity-70" />
      <div
        data-testid="zoom-minimap-frame"
        className="absolute rounded-[3px] border-2 border-accent-primary bg-white/10 pointer-events-none"
        style={{
          left: `${viewport.left * 100}%`,
          top: `${viewport.top * 100}%`,
          width: `${viewport.width * 100}%`,
          height: `${viewport.height * 100}%`,
          // Everything outside the frame is dimmed; the frame itself stays clear.
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
        }}
      />
    </div>
  );
}
