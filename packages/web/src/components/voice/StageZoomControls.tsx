import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../i18n/formatters';
import { MAX_ZOOM, MIN_ZOOM, type StageZoomControls } from '../../hooks/useStageZoom';
import { containedBox } from '../../utils/streamPointerProtocol';
import { Icon } from '../ui/Icon';

/** One press of + or −, and one arrow-key step of the slider. */
const ZOOM_STEP = 0.25;
/** Where the chip jumps to from 100 %: far enough to see that it zoomed. */
const FIRST_ZOOM = 2;
/** The minimap's long side, px, and the least its short side shrinks to for a very long picture. */
const MINIMAP_SIZE = 148;
const MINIMAP_MIN_SIDE = 40;
/** How often the minimap repaints its picture. It is a map, not a second player. */
const MINIMAP_REPAINT_MS = 500;

// The bar sits on the picture, so its ground and text are the on-picture
// dark glass and white, not surface tokens.
const BUTTON = 'h-7 flex items-center justify-center text-white/70 hover:text-white transition-colors duration-fast';
const ON_PICTURE = 'bg-black/60 backdrop-blur-sm';

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
        className={`${BUTTON} ${ON_PICTURE} px-2.5 gap-1.5 hover:bg-black/80 rounded-lg`}
        aria-label={t('voice:grid.zoomIn')}
        title={t('voice:grid.zoomHint')}
      >
        <Icon name="zoom-in" size="sm" />
        <span className="text-xs font-medium tabular-nums">{percent}</span>
      </button>
    );
  }

  return (
    <div
      data-testid="zoom-bar"
      data-no-pan
      onClick={stop}
      className={`h-7 flex items-center ${ON_PICTURE} rounded-lg pl-1 pr-0.5`}
    >
      <button
        type="button"
        onClick={() => zoom.setScale(scale - ZOOM_STEP)}
        className={`${BUTTON} w-6 rounded hover:bg-white/10`}
        aria-label={t('voice:grid.zoomOut')}
        title={t('voice:grid.zoomOut')}
      >
        <Icon name="minus" size="sm" />
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
        className="w-24 mx-1 h-1 accent-accent-tone cursor-pointer"
      />
      <button
        type="button"
        onClick={() => zoom.setScale(scale + ZOOM_STEP)}
        className={`${BUTTON} w-6 rounded hover:bg-white/10`}
        aria-label={t('voice:grid.zoomIn')}
        title={t('voice:grid.zoomIn')}
      >
        <Icon name="plus" size="sm" />
      </button>
      <button
        type="button"
        data-testid="zoom-reset"
        onClick={zoom.reset}
        className={`${BUTTON} min-w-[3.25rem] px-1.5 rounded hover:bg-white/10 text-xs font-medium tabular-nums`}
        aria-label={t('voice:grid.resetZoom')}
        title={t('voice:grid.resetZoom')}
      >
        {percent}
      </button>
    </div>
  );
}

/** A rectangle in fractions (0..1) of some box. */
interface FractionBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The part of the picture on screen, as fractions of the picture. The view is
 * known in stage terms and the picture sits letterboxed inside the stage, so
 * the view is cut to the picture: a view that reaches into a band shows less
 * of the picture, never a frame hanging outside the map.
 */
export function pictureView(view: FractionBox, picture: FractionBox): FractionBox {
  const left = Math.max(view.left, picture.left);
  const top = Math.max(view.top, picture.top);
  const right = Math.min(view.left + view.width, picture.left + picture.width);
  const bottom = Math.min(view.top + view.height, picture.top + picture.height);
  return {
    left: (left - picture.left) / picture.width,
    top: (top - picture.top) / picture.height,
    width: Math.max(0, right - left) / picture.width,
    height: Math.max(0, bottom - top) / picture.height,
  };
}

/**
 * A small map of the shared picture with the part on screen framed in it,
 * shown while zoomed. Pressing or dragging on it moves the view there.
 *
 * The map has the picture's own shape, not the stage's: a wide screen in a
 * tall window is letterboxed on the stage, and a map of the stage would carry
 * those black bands. Its picture is repainted from the stage's own `<video>`
 * twice a second onto a canvas: no second subscription, no second decoder.
 */
export function StageZoomMinimap({ zoom }: { zoom: StageZoomControls }) {
  const { t } = useTranslation(['voice', 'common']);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { stageElement, stageSize, viewport, isZoomed, centerOn } = zoom;
  // The picture's own size. It changes mid-share (a window resized, another simulcast layer).
  const [pictureSize, setPictureSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!isZoomed || !stageElement) return;
    const video = stageElement.querySelector<HTMLVideoElement>(':scope > [data-context-menu] > video');
    if (!video) {
      setPictureSize(null);
      return;
    }
    const measure = () => {
      setPictureSize((current) => {
        if (video.videoWidth === 0 || video.videoHeight === 0) return null;
        return current?.width === video.videoWidth && current.height === video.videoHeight
          ? current
          : { width: video.videoWidth, height: video.videoHeight };
      });
    };
    const paint = () => {
      measure();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx || video.videoWidth === 0) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    };
    paint();
    video.addEventListener('resize', measure);
    video.addEventListener('loadedmetadata', measure);
    const interval = setInterval(paint, MINIMAP_REPAINT_MS);
    return () => {
      video.removeEventListener('resize', measure);
      video.removeEventListener('loadedmetadata', measure);
      clearInterval(interval);
    };
    // `pictureSize`: the canvas mounts once the picture's size is known, and
    // is cleared when that size changes. Either way it is painted at once
    // rather than left black until the next tick.
  }, [isZoomed, stageElement, pictureSize]);

  // Where the picture sits in the stage, as fractions of the stage.
  const picture = useMemo<FractionBox | null>(() => {
    if (!pictureSize || stageSize.width <= 0 || stageSize.height <= 0) return null;
    const box = containedBox({ left: 0, top: 0, width: stageSize.width, height: stageSize.height }, pictureSize.width, pictureSize.height);
    if (!box) return null;
    return {
      left: box.left / stageSize.width,
      top: box.top / stageSize.height,
      width: box.width / stageSize.width,
      height: box.height / stageSize.height,
    };
  }, [pictureSize, stageSize.width, stageSize.height]);

  // No picture to map yet (the video has no frame): nothing to show.
  if (!isZoomed || !picture || !pictureSize) return null;

  const ratio = pictureSize.width / pictureSize.height;
  const width = ratio >= 1 ? MINIMAP_SIZE : Math.max(MINIMAP_MIN_SIDE, Math.round(MINIMAP_SIZE * ratio));
  const height = ratio >= 1 ? Math.max(MINIMAP_MIN_SIDE, Math.round(MINIMAP_SIZE / ratio)) : MINIMAP_SIZE;
  const frame = pictureView(viewport, picture);

  const moveTo = (e: React.PointerEvent<HTMLDivElement>) => {
    const bounds = e.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    // A point of the map is a point of the picture; the view is moved in stage terms.
    const px = (e.clientX - bounds.left) / bounds.width;
    const py = (e.clientY - bounds.top) / bounds.height;
    centerOn(picture.left + px * picture.width, picture.top + py * picture.height);
  };

  return (
    <div
      data-testid="zoom-minimap"
      data-no-pan
      role="img"
      aria-label={t('voice:grid.zoomMinimap')}
      title={t('voice:grid.zoomMinimap')}
      style={{ width, height }}
      className="relative rounded-lg overflow-hidden bg-black ring-1 ring-white/20 cursor-crosshair touch-none"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        moveTo(e);
      }}
      onPointerMove={(e) => { if (e.buttons === 1) moveTo(e); }}
    >
      <canvas ref={canvasRef} width={width * 2} height={height * 2} className="block w-full h-full" />
      <div
        data-testid="zoom-minimap-frame"
        className="absolute rounded-sm border-2 border-accent-tone pointer-events-none"
        style={{
          left: `${frame.left * 100}%`,
          top: `${frame.top * 100}%`,
          width: `${frame.width * 100}%`,
          height: `${frame.height * 100}%`,
          // Everything outside the frame is dimmed; the frame itself stays clear.
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
        }}
      />
    </div>
  );
}
