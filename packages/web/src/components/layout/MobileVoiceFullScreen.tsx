import { layoutRect, layoutPixels } from '../../platform/interfaceScale';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { useActiveDmCall } from '../../hooks/useActiveDmCall';
import {
  handleCameraAction,
  handleDisconnectAction,
  handleScreenShareAction,
  toggleDeafenFromControl,
  toggleMuteFromControl,
} from '../../utils/voiceActions';
import { VoiceGrid } from '../voice/VoiceGrid';
import { deriveGridTiles } from '../../hooks/useLiveKit';
import { requestMicPermission } from '../../utils/voice';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';

/**
 * Full-screen mobile voice/video call view.
 *
 * Renders the same `VoiceGrid` as desktop so cameras and screen-share tracks
 * subscribe + attach via the canonical `Track.attach()` pipeline. The grid
 * supports tap-to-focus (single tile takes the bulk of the viewport, others
 * collapse into a bottom strip) — feature parity with desktop's focused mode.
 *
 * Auto-focus on screen-share: when the user is not already focused on a
 * specific tile, the first available screen-share tile is auto-focused so
 * mobile users don't need to discover the tap-to-focus affordance to watch a
 * stream. Auto-focus is mobile-only behaviour; desktop preserves its
 * "render-everything-then-let-the-user-pick" pattern.
 */
export function MobileVoiceFullScreen() {
  const { t } = useTranslation(['voice', 'common']);
  const popMobileScreen = useUIStore((s) => s.popMobileScreen);
  const pushMobileScreen = useUIStore((s) => s.pushMobileScreen);

  const currentVoiceChannelId = useVoiceStore((s) => s.currentVoiceChannelId);
  const isMuted = useVoiceStore((s) => s.isMuted);
  const isDeafened = useVoiceStore((s) => s.isDeafened);
  const isCameraOn = useVoiceStore((s) => s.isCameraOn);
  const isScreenSharing = useVoiceStore((s) => s.isScreenSharing);
  const activeDmCall = useVoiceStore((s) => s.activeDmCall);
  const participants = useVoiceStore((s) => s.participants);
  const focusedParticipantId = useVoiceStore((s) => s.focusedParticipantId);
  const setFocusedParticipant = useVoiceStore((s) => s.setFocusedParticipant);

  const channels = useSpaceStore((s) => s.channels);
  const spaces = useSpaceStore((s) => s.spaces);
  const channelToSpaceMap = useSpaceStore((s) => s.channelToSpaceMap);

  const { title: dmCallTitle } = useActiveDmCall();

  const cameraDeviceId = useVoiceStore((s) => s.cameraDeviceId);
  const setCameraDeviceId = useVoiceStore((s) => s.setCameraDeviceId);
  const micPermissionDenied = useVoiceStore((s) => s.micPermissionDenied);

  // ── In-call camera switcher ───────────────────────────────────────────────
  // On mobile, users typically have a front+back camera and need to flip
  // mid-call. Desktop exposes per-device selection in user settings, but
  // navigating away from the call screen mid-call breaks the flow.
  //
  // Mechanism: `setCameraDeviceId(deviceId)` writes to voiceStore; the
  // canonical `useLiveKit syncCamera` effect picks that up and calls
  // `room.switchActiveDevice('videoinput', target)` for an in-place hot-swap
  // (no republish). This is the same flow desktop's settings panel uses —
  // see docs/systems/voice.md "Hot-swap mid-call".
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraPickerOpen, setCameraPickerOpen] = useState(false);
  const cameraPickerAnchorRef = useRef<HTMLDivElement>(null);
  const cameraPickerPopupRef = useRef<HTMLDivElement>(null);
  const [cameraPickerRect, setCameraPickerRect] = useState<{ left: number; bottom: number } | null>(null);

  // Enumerate available video inputs. Pure passive — `enumerateDevices`
  // does NOT light the camera LED. Labels are populated only after an
  // active camera grant; before that they fall back to "Camera N".
  // We re-enumerate on every `devicechange` (e.g. AirPods connect, USB
  // camera plugged in).
  useEffect(() => {
    let cancelled = false;
    const enumerate = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const seen = new Set<string>();
        const cams: MediaDeviceInfo[] = [];
        for (const d of all) {
          if (d.kind !== 'videoinput') continue;
          if (seen.has(d.deviceId)) continue;
          seen.add(d.deviceId);
          cams.push(d);
        }
        setCameraDevices(cams);
      } catch {
        if (!cancelled) setCameraDevices([]);
      }
    };
    enumerate();
    const onChange = () => enumerate();
    navigator.mediaDevices.addEventListener('devicechange', onChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener('devicechange', onChange);
    };
  }, []);

  // Click-outside to close the picker. Listens to mousedown AND touchstart
  // because iOS Safari does not synthesize mousedown reliably from a single
  // tap (same pattern as MobileVoiceJoinSheet's picker).
  useEffect(() => {
    if (!cameraPickerOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      const inAnchor = cameraPickerAnchorRef.current?.contains(target) ?? false;
      const inPopup = cameraPickerPopupRef.current?.contains(target) ?? false;
      if (!inAnchor && !inPopup) setCameraPickerOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [cameraPickerOpen]);

  // Pin the popup to the anchor's screen rect on open, reposition on
  // resize/scroll. Using `bottom` makes the popup expand upward from the
  // chevron — natural for a control bar at the screen bottom.
  useEffect(() => {
    if (!cameraPickerOpen) {
      setCameraPickerRect(null);
      return;
    }
    const anchorBtn = cameraPickerAnchorRef.current?.querySelector('button');
    if (!anchorBtn) return;
    const update = () => {
      const r = layoutRect(anchorBtn.getBoundingClientRect());
      setCameraPickerRect({
        left: r.left,
        bottom: layoutPixels(window.innerHeight) - r.top + 6,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [cameraPickerOpen]);

  // Close the picker if the camera turns off (the trigger is hidden anyway,
  // but stale popup state would briefly flash if the camera toggles off
  // between renders).
  useEffect(() => {
    if (!isCameraOn && cameraPickerOpen) setCameraPickerOpen(false);
  }, [isCameraOn, cameraPickerOpen]);

  const handlePickCamera = useCallback(
    (deviceId: string | null) => {
      setCameraDeviceId(deviceId);
      setCameraPickerOpen(false);
    },
    [setCameraDeviceId],
  );

  const showCameraSwitcher = isCameraOn && cameraDevices.length > 1;

  // Track whether the user has explicitly chosen focus (manual tap) vs.
  // auto-focus we set on screen-share publish. Once the user manually
  // focuses or unfocuses anything during this screen's lifetime, we stop
  // auto-focusing.
  const userTouchedFocusRef = useRef(false);
  const lastAutoFocusedKeyRef = useRef<string | null>(null);

  // Pre-compute tiles for screen-share auto-focus detection. Cheap (same
  // derivation VoiceGrid runs).
  const tiles = useMemo(() => deriveGridTiles(participants), [participants]);

  // Auto-focus screen-share on mobile.
  // - Trigger only when the user has not manually changed focus during this
  //   screen lifetime AND the current focus is either null or a stale tile
  //   that no longer exists.
  // - Picks the first live screen-share tile.
  useEffect(() => {
    if (userTouchedFocusRef.current) return;

    const liveStreamTiles = tiles.filter(
      (t) => t.kind === 'stream' && t.screenTrack?.readyState === 'live',
    );
    if (liveStreamTiles.length === 0) return;

    const firstStreamKey = liveStreamTiles[0]?.key;
    if (!firstStreamKey) return;

    // Already focused on this stream — nothing to do.
    if (focusedParticipantId === firstStreamKey) {
      lastAutoFocusedKeyRef.current = firstStreamKey;
      return;
    }

    // Don't override an existing manual focus on a still-valid tile. The
    // VoiceGrid effect already clears focus when the focused tile vanishes,
    // so reaching here with a non-null focusedParticipantId means the user
    // is intentionally focused on something else (cleared by us only if it
    // matches the previous auto-focus).
    if (
      focusedParticipantId &&
      focusedParticipantId !== lastAutoFocusedKeyRef.current
    ) {
      return;
    }

    setFocusedParticipant(firstStreamKey);
    lastAutoFocusedKeyRef.current = firstStreamKey;
  }, [tiles, focusedParticipantId, setFocusedParticipant]);

  // Wrap setFocusedParticipant so we can flag user-initiated focus changes.
  // Replace the store action *transparently* via a subscription is fragile;
  // instead we wrap by intercepting through a custom click layer below. The
  // VoiceGrid uses the store's setFocusedParticipant directly for clicks —
  // we can't override that without forking VoiceGrid. Workaround: mark the
  // flag whenever focusedParticipantId changes to a value other than what
  // we auto-focused.
  useEffect(() => {
    if (focusedParticipantId === null) {
      // User dismissed focus (or VoiceGrid cleared it on stale). Either way,
      // the user has now interacted; do not re-auto-focus the same stream.
      if (lastAutoFocusedKeyRef.current !== null) {
        userTouchedFocusRef.current = true;
      }
    } else if (focusedParticipantId !== lastAutoFocusedKeyRef.current) {
      // User picked a different tile — manual interaction.
      userTouchedFocusRef.current = true;
    }
  }, [focusedParticipantId]);

  // Reset focus state when leaving the screen / call.
  useEffect(() => {
    return () => {
      // On unmount, clear focus so re-entering is a clean slate.
      useVoiceStore.getState().setFocusedParticipant(null);
    };
  }, []);

  if (!currentVoiceChannelId && !activeDmCall) {
    popMobileScreen();
    return null;
  }

  // A DM call has no voice channel (the two are exclusive).
  const isDmCall = !currentVoiceChannelId;
  let channelName = t('voice:status.voiceCall');
  let spaceName = '';

  if (isDmCall) {
    channelName = dmCallTitle ?? t('voice:status.dmCall');
  } else {
    const ch = channels.find((c) => c.id === currentVoiceChannelId);
    if (ch) {
      channelName = ch.name;
      const spaceId = channelToSpaceMap.get(ch.id);
      const space = spaceId ? spaces.find((s) => s.id === spaceId) : null;
      if (space) spaceName = space.name;
    }
  }

  const handleDisconnect = () => {
    handleDisconnectAction();
    popMobileScreen();
  };

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* Header */}
      <header className="h-12 flex items-center gap-1 px-1 border-b border-border-hard shrink-0">
        <IconButton
          icon="chevron-down"
          label={t('voice:mobileCall.collapse')}
          size="lg"
          className="h-11 w-11"
          onClick={popMobileScreen}
        />
        <div className="flex-1 min-w-0 px-1">
          <h1 className="text-sm font-semibold text-txt-primary truncate">
            {channelName}
          </h1>
          {spaceName && (
            <p className="text-2xs text-txt-tertiary truncate">{spaceName}</p>
          )}
        </div>
        <span className="text-xs text-txt-tertiary tabular-nums px-2">
          {t('voice:mobileCall.connectedCount', { count: participants.length })}
        </span>
        {!isDmCall && (
          <IconButton
            icon="users"
            label={t('voice:mobileCall.viewMembers')}
            size="lg"
            className="h-11 w-11"
            onClick={() => pushMobileScreen('members')}
          />
        )}
      </header>

      {/* Mic-permission denial banner. Surfaces only when the user joined
          voice without granting microphone access (most common on iOS PWA
          where the permission prompt missed its user-gesture window, and
          the user denied or dismissed). The retry button is the second
          user-gesture entry-point — it calls `getUserMedia` synchronously
          inside the click handler so iOS surfaces the prompt cleanly. On
          success the flag clears and `useLiveKit syncMic` re-fires to
          publish the freshly acquired mic track. */}
      {micPermissionDenied && (
        <div className="mx-2 mt-2 pl-3 pr-1.5 py-1.5 rounded-xl bg-status-warn/[0.14] flex items-center gap-3 shrink-0">
          <Icon name="mic-off" size="md" className="text-status-warn" />
          <div className="flex-1 min-w-0 py-1">
            <p className="text-xs font-medium text-status-warn">
              {t('voice:mobileCall.micDenied.title')}
            </p>
            <p className="text-2xs text-txt-tertiary mt-0.5">
              {t('voice:mobileCall.micDenied.description')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void requestMicPermission();
            }}
            className="h-11 px-3 rounded-lg text-xs font-medium bg-status-warn/20 text-status-warn hover:bg-status-warn/30 active:scale-[0.96] transition-[background-color,transform] duration-fast shrink-0"
          >
            {t('voice:mobileCall.micDenied.allow')}
          </button>
        </div>
      )}

      {/* Participant grid — VoiceGrid handles attach/detach, tap-to-focus,
          screen-share tiles, mute overlays, context menus. Identical
          rendering pipeline to desktop. */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <VoiceGrid participants={participants} />
      </div>

      {/* Control bar. 48px buttons: larger than the 44px touch minimum. */}
      <div
        className="glass-bubble mx-2 mb-2 rounded-xl flex items-center justify-center gap-3 px-3 py-2.5 shrink-0"
        style={{ marginBottom: 'calc(0.5rem + var(--safe-bottom))' }}
      >
        {/* Mute */}
        <IconButton
          icon={isMuted ? 'mic-off' : 'mic'}
          label={isMuted ? t('voice:controls.unmute') : t('voice:controls.mute')}
          size="lg"
          tone={isMuted ? 'off' : 'default'}
          filled
          className="h-12 w-12"
          onClick={toggleMuteFromControl}
        />

        {/* Deafen */}
        <IconButton
          icon={isDeafened ? 'headphone-off' : 'headphones'}
          label={isDeafened ? t('voice:controls.undeafen') : t('voice:controls.deafen')}
          size="lg"
          tone={isDeafened ? 'off' : 'default'}
          filled
          className="h-12 w-12"
          onClick={toggleDeafenFromControl}
        />

        {/* Camera (with in-call switcher chevron when multiple cameras exist
            and the camera is currently on). The chevron sits in a small
            attached pill above the bottom-right corner of the camera button —
            visible only when relevant so single-camera devices are unaffected. */}
        <div className="relative" ref={cameraPickerAnchorRef}>
          <IconButton
            icon={isCameraOn ? 'video' : 'video-off'}
            label={isCameraOn ? t('voice:camera.turnOff') : t('voice:camera.turnOn')}
            size="lg"
            tone={isCameraOn ? 'default' : 'off'}
            filled
            className="h-12 w-12"
            onClick={handleCameraAction}
          />
          {showCameraSwitcher && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setCameraPickerOpen((v) => !v);
              }}
              aria-label={t('voice:camera.switch')}
              aria-haspopup="menu"
              aria-expanded={cameraPickerOpen}
              className="absolute -top-1 -right-1 z-[1] w-6 h-6 rounded-full bg-surface-elevated text-txt-primary flex items-center justify-center shadow-[inset_0_0_0_1px_var(--glass-border)] active:scale-95 transition-transform duration-fast"
            >
              <Icon name="switch-camera" size="xs" />
            </button>
          )}
        </div>

        {/* Screen share — uses canonical handleScreenShareAction so the
            getDisplayMedia call actually fires (and propagates errors via
            voiceActions). The previous voiceStore.toggleScreenShare flipped
            only the boolean and never started capture. */}
        <IconButton
          icon={isScreenSharing ? 'screen-share-off' : 'screen-share'}
          label={isScreenSharing ? t('voice:mobileCall.stopSharingScreen') : t('voice:mobileCall.shareScreen')}
          size="lg"
          tone={isScreenSharing ? 'on' : 'default'}
          filled
          className="h-12 w-12"
          onClick={handleScreenShareAction}
        />

        {/* Disconnect */}
        <IconButton
          icon="phone-off"
          label={t('voice:mobileCall.disconnect')}
          size="lg"
          tone="danger-solid"
          className="h-12 w-12"
          onClick={handleDisconnect}
        />
      </div>

      {/* Camera picker popup — portaled to document.body so the upward
          expansion isn't clipped by the control bar's glass-bubble.
          Anchored to the chevron via getBoundingClientRect (recomputed on
          resize / scroll). max-height + overflow-y-auto + iOS scroll
          momentum keep every entry reachable on devices with many cameras. */}
      {showCameraSwitcher &&
        cameraPickerOpen &&
        cameraPickerRect &&
        createPortal(
          <div
            ref={cameraPickerPopupRef}
            role="menu"
            aria-label={t('voice:camera.select')}
            className="glass fixed z-popover rounded-xl p-1 overflow-y-auto"
            style={{
              left: cameraPickerRect.left,
              bottom: cameraPickerRect.bottom,
              minWidth: 180,
              maxWidth: 260,
              maxHeight: 'min(calc(50*var(--app-vh)), 320px)',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={cameraDeviceId === null}
              onClick={() => handlePickCamera(null)}
              className={`w-full min-h-11 text-left px-3 rounded-lg text-sm truncate transition-colors duration-fast ${
                cameraDeviceId === null ? 'bg-surface-elevated text-txt-primary font-medium' : 'text-txt-secondary'
              } active:bg-interactive-active`}
            >
              {t('voice:camera.autoSystemDefault')}
            </button>
            {cameraDevices.map((d, i) => (
              <button
                key={d.deviceId}
                type="button"
                role="menuitemradio"
                aria-checked={cameraDeviceId === d.deviceId}
                onClick={() => handlePickCamera(d.deviceId)}
                className={`w-full min-h-11 text-left px-3 rounded-lg text-sm truncate transition-colors duration-fast ${
                  cameraDeviceId === d.deviceId ? 'bg-surface-elevated text-txt-primary font-medium' : 'text-txt-secondary'
                } active:bg-interactive-active`}
              >
                {d.label || t('voice:camera.fallbackName', { index: i + 1 })}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
