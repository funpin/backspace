import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useKeybindStore, BINDABLE_ACTIONS, Keybind } from '../../../stores/keybindStore';
import { isElectron, isElectronMac } from '../../../platform/platform';
import { useKeybindPortalStatus } from '../../../hooks/useKeybindPortalStatus';
import { Button } from '../../ui/Button';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODIFIER_CODES = new Set([
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
]);

const MOUSE_BUTTON_MAP: Record<number, number> = { 1: 3, 3: 4, 4: 5 };

type SettingsT = TFunction<['settings', 'common']>;

/**
 * The name a mouse button is shown under. The label is composed while the
 * user records the combo and stored with the keybind, so it is in the
 * language that was active at recording time.
 */
function mouseButtonName(t: SettingsT, button: number): string {
  switch (button) {
    case 3: return t('keybinds.key.middleClick');
    case 4: return t('keybinds.key.mouse4');
    case 5: return t('keybinds.key.mouse5');
    default: return t('keybinds.key.mouseGeneric', { button });
  }
}

function keyDisplayName(t: SettingsT, code: string, key: string): string {
  if (code.startsWith('Shift')) return t('keybinds.key.shift');
  if (code.startsWith('Control')) return t('keybinds.key.ctrl');
  if (code.startsWith('Alt')) return isElectronMac() ? t('keybinds.key.option') : t('keybinds.key.alt');
  if (code.startsWith('Meta')) return isElectronMac() ? t('keybinds.key.cmd') : t('keybinds.key.win');
  if (code.startsWith('Key')) return code.slice(3).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (key === ' ') return t('keybinds.key.space');
  return key.length === 1 ? key.toUpperCase() : key;
}

function codeToNumeric(code: string): number {
  // djb2 hash — produces unique numeric IDs for all KeyboardEvent.code values
  let hash = 5381;
  for (let i = 0; i < code.length; i++) {
    hash = ((hash << 5) + hash + code.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // ensure unsigned
}

// ---------------------------------------------------------------------------
// Keybind Row
// ---------------------------------------------------------------------------

/** A key combination as it is shown in a row: a sunken chip in the monospace face. */
const KEY_CHIP = 'inline-flex items-center min-h-6 px-2 py-0.5 rounded bg-surface-input shadow-[inset_0_0_0_1px_var(--glass-border)] font-mono text-xs';

interface KeybindRowProps {
  actionId: string;
  label: string;
  keybind: Keybind | undefined;
  isRecording: boolean;
  recordingDisplay: string;
  onStartRecording: () => void;
  onDelete: () => void;
  rowRef: React.RefObject<HTMLDivElement>;
}

function KeybindRow({ actionId, label, keybind, isRecording, recordingDisplay, onStartRecording, onDelete, rowRef }: KeybindRowProps) {
  const { t } = useTranslation(['settings', 'common']);
  return (
    <div
      ref={rowRef}
      className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 rounded-lg bg-surface-elevated transition-shadow duration-fast ease-out ${
        isRecording ? 'shadow-[inset_0_0_0_1.5px_rgb(var(--accent-tone))]' : ''
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-txt-primary">{label}</div>
        <div className="text-xs text-txt-tertiary mt-1">
          {isRecording ? (
            <span className={`${KEY_CHIP} text-accent-tone animate-pulse`}>
              {recordingDisplay || t('keybinds.row.recordingPrompt')}
            </span>
          ) : keybind ? (
            <span className={`${KEY_CHIP} text-txt-primary`}>{keybind.displayLabel}</span>
          ) : (
            t('keybinds.row.notBound')
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {!isRecording && (
          <>
            <Button variant="ghost" size="sm" onClick={onStartRecording}>
              {keybind ? t('common:actions.edit') : t('keybinds.row.record')}
            </Button>
            {keybind && (
              <Button variant="danger" size="sm" onClick={onDelete}>
                {t('common:actions.delete')}
              </Button>
            )}
          </>
        )}
        {isRecording && (
          <span className="text-2xs text-txt-tertiary">{t('keybinds.row.escToCancel')}</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conflict Dialog (inline)
// ---------------------------------------------------------------------------

interface ConflictInfo {
  newActionId: string;
  existingKeybind: Keybind;
  pendingKeybind: Keybind;
}

// ---------------------------------------------------------------------------
// KeybindsPanel
// ---------------------------------------------------------------------------

export function KeybindsPanel() {
  const { t } = useTranslation(['settings', 'common']);
  const { keybinds, setKeybind, removeKeybind, findConflict } = useKeybindStore();
  const portal = useKeybindPortalStatus();
  useEffect(() => {
    // Only opening this panel initiates first-time registration. A cancelled
    // request becomes unavailable and requires an explicit retry, not a loop.
    if (portal?.state === 'idle') window.backspace?.retryKeybindPortal?.();
  }, [portal?.state]);

  const [recordingActionId, setRecordingActionId] = useState<string | null>(null);
  const [recordingDisplay, setRecordingDisplay] = useState('');
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);

  const [accessibilityTrusted, setAccessibilityTrusted] = useState<boolean | null>(null);
  const [hookError, setHookError] = useState<string | null>(null);

  const pressedCodesRef = useRef(new Map<string, { numeric: number; display: string }>());
  const mouseButtonRef = useRef<number | null>(null);
  const mouseDisplayRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<Record<string, React.RefObject<HTMLDivElement>>>({});

  for (const action of BINDABLE_ACTIONS) {
    if (!rowRefs.current[action.id]) {
      rowRefs.current[action.id] = React.createRef();
    }
  }

  // --- Platform checks on mount ---
  useEffect(() => {
    if (isElectronMac() && window.backspace?.checkAccessibility) {
      window.backspace.checkAccessibility().then(setAccessibilityTrusted);
    }
    if (isElectron() && window.backspace?.onAccessibilityStatus) {
      const cleanup = window.backspace.onAccessibilityStatus((status) => {
        setAccessibilityTrusted(status.trusted);
      });
      return cleanup;
    }
  }, []);

  useEffect(() => {
    if (isElectron() && window.backspace?.onKeybindHookError) {
      const cleanup = window.backspace.onKeybindHookError((error) => {
        setHookError(error.message);
      });
      return cleanup;
    }
  }, []);

  // --- Recording logic ---
  const cancelRecording = useCallback(() => {
    setRecordingActionId(null);
    setRecordingDisplay('');
    pressedCodesRef.current.clear();
    mouseButtonRef.current = null;
    mouseDisplayRef.current = null;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const finalizeRecording = useCallback((actionId: string) => {
    const codes = pressedCodesRef.current;
    const mouseBtn = mouseButtonRef.current;

    const keys = Array.from(codes.values()).map((c) => c.numeric).sort((a, b) => a - b);
    const displayParts = Array.from(codes.values()).map((c) => c.display);
    if (mouseBtn) {
      displayParts.push(mouseButtonName(t, mouseBtn));
    }
    const displayLabel = displayParts.join(' + ');

    const hasNonModifier = Array.from(codes.keys()).some((code) => !MODIFIER_CODES.has(code));
    if (!hasNonModifier && !mouseBtn) {
      return;
    }

    const newKeybind: Keybind = { actionId, keys, mouseButton: mouseBtn ?? undefined, displayLabel };

    const existing = findConflict(keys, mouseBtn ?? undefined, actionId);
    if (existing) {
      setConflict({ newActionId: actionId, existingKeybind: existing, pendingKeybind: newKeybind });
      cancelRecording();
      return;
    }

    setKeybind(newKeybind);
    cancelRecording();
  }, [findConflict, setKeybind, cancelRecording, t]);

  // --- Recording event listeners ---
  useEffect(() => {
    if (portal || !recordingActionId) return;

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Escape') {
        cancelRecording();
        return;
      }

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      const display = keyDisplayName(t, e.code, e.key);
      const numeric = codeToNumeric(e.code);
      pressedCodesRef.current.set(e.code, { numeric, display });

      const parts = Array.from(pressedCodesRef.current.values()).map((c) => c.display);
      if (mouseDisplayRef.current) parts.push(mouseDisplayRef.current);
      setRecordingDisplay(parts.join(' + '));
    }

    function onKeyUp(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        if (recordingActionId) finalizeRecording(recordingActionId);
      }, 300);
    }

    function onMouseDown(e: MouseEvent) {
      const rowRef = rowRefs.current[recordingActionId!];
      if (rowRef?.current && !rowRef.current.contains(e.target as Node)) {
        cancelRecording();
        return;
      }

      const uiButton = MOUSE_BUTTON_MAP[e.button];
      if (!uiButton) return;

      e.preventDefault();
      e.stopPropagation();

      mouseButtonRef.current = uiButton;
      mouseDisplayRef.current = mouseButtonName(t, uiButton);

      const parts = Array.from(pressedCodesRef.current.values()).map((c) => c.display);
      parts.push(mouseDisplayRef.current);
      setRecordingDisplay(parts.join(' + '));

      finalizeRecording(recordingActionId!);
    }

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('mousedown', onMouseDown, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [recordingActionId, cancelRecording, finalizeRecording, t, portal]);

  // --- Conflict resolution ---
  const confirmConflict = () => {
    if (!conflict) return;
    removeKeybind(conflict.existingKeybind.actionId);
    setKeybind(conflict.pendingKeybind);
    setConflict(null);
  };

  const cancelConflict = () => setConflict(null);

  const getKeybind = (actionId: string) => keybinds.find((kb) => kb.actionId === actionId);

  const conflictAction = conflict
    ? BINDABLE_ACTIONS.find((a) => a.id === conflict.existingKeybind.actionId)
    : undefined;
  const conflictActionLabel = conflictAction ? t(`keybinds.action.${conflictAction.id}`) : '';

  if (portal) {
    return (
      <div className="space-y-5">
        <h2 className="text-xl font-semibold text-txt-primary mb-6">{t('keybinds.title')}</h2>
        <div className="rounded-xl bg-surface-elevated p-3.5 text-sm text-txt-secondary" role="status">
          <p>{t('keybinds.portal.description')}</p>
          <p className="mt-2">{t(`keybinds.portal.${portal.state}`)}</p>
          {portal.state === 'unavailable' && (
            <Button variant="primary" className="mt-3" onClick={() => window.backspace?.retryKeybindPortal?.()}>
              {t('keybinds.portal.retry')}
            </Button>
          )}
        </div>
        <dl className="space-y-1.5">
          {BINDABLE_ACTIONS.map((action) => (
            <div key={action.id} className="rounded-lg bg-surface-elevated px-4 py-3">
              <dt className="text-sm font-medium text-txt-primary">{t(`keybinds.action.${action.id}`)}</dt>
              <dd className="text-xs text-txt-tertiary mt-1">
                {portal.shortcuts[action.id]
                  ? t('keybinds.portal.assigned', { shortcut: portal.shortcuts[action.id] })
                  : t('keybinds.portal.notAssigned')}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold text-txt-primary mb-6">{t('keybinds.title')}</h2>
      {/* macOS Accessibility Warning */}
      {isElectronMac() && accessibilityTrusted === false && (
        <div className="rounded-xl bg-status-warn/10 border border-status-warn/20 p-3.5">
          <div className="text-sm text-status-warn font-medium">{t('keybinds.accessibility.title')}</div>
          <div className="text-xs text-txt-secondary mt-1">
            {t('keybinds.accessibility.description')}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-2.5"
            onClick={() => {
              window.backspace?.checkAccessibility().then(setAccessibilityTrusted);
            }}
          >
            {t('keybinds.accessibility.grant')}
          </Button>
        </div>
      )}

      {/* Linux hook error warning */}
      {isElectron() && hookError && (
        <div className="rounded-xl bg-status-warn/10 border border-status-warn/20 p-3.5">
          <div className="text-sm text-status-warn font-medium">{t('keybinds.hookError.title')}</div>
          <div className="text-xs text-txt-secondary mt-1">
            <Trans
              t={t}
              i18nKey="keybinds.hookError.description"
              components={{ code: <code className="bg-surface-input px-1 rounded font-mono" /> }}
            />
          </div>
        </div>
      )}

      {/* Web limitation note */}
      {!isElectron() && (
        <div className="text-xs text-txt-tertiary px-1">
          {t('keybinds.note.webOnly')}
        </div>
      )}

      {/* Keybind rows */}
      <div>
        <div className="text-xs font-medium text-txt-secondary mb-1.5">
          {t('keybinds.section.voice')}
        </div>
        <div className="space-y-1.5">
          {BINDABLE_ACTIONS.map((action) => (
            <KeybindRow
              key={action.id}
              actionId={action.id}
              label={t(`keybinds.action.${action.id}`)}
              keybind={getKeybind(action.id)}
              isRecording={recordingActionId === action.id}
              recordingDisplay={recordingDisplay}
              onStartRecording={() => {
                cancelRecording();
                setRecordingActionId(action.id);
              }}
              onDelete={() => removeKeybind(action.id)}
              rowRef={rowRefs.current[action.id]!}
            />
          ))}
        </div>
      </div>

      {/* Conflict dialog */}
      {conflict && (
        <div className="rounded-xl bg-surface-elevated shadow-[inset_0_0_0_1px_var(--glass-border)] p-3.5">
          <div className="text-sm text-txt-primary">
            <Trans
              t={t}
              i18nKey="keybinds.conflict.message"
              values={{
                combo: conflict.pendingKeybind.displayLabel,
                action: conflictActionLabel,
              }}
              components={{ strong: <span className="font-medium" /> }}
            />
          </div>
          <div className="flex gap-2 mt-2.5">
            <Button variant="primary" size="sm" onClick={confirmConflict}>
              {t('keybinds.conflict.overwrite')}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelConflict}>
              {t('common:actions.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
