import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceStore } from '../../../stores/voiceStore';
import { AudioManager } from '../../../audio/AudioManager';
import { useAudioDevices } from '../../../hooks/useAudioDevices';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { SectionShell, DropdownItem } from './_shared/SettingsPickerPrimitives';

/**
 * Feature-detect per-element output routing support. iOS Safari has zero
 * support for `HTMLMediaElement.setSinkId` (and likewise no AudioContext
 * variant); when both are absent, the OS routes audio (Bluetooth menu, etc.)
 * and an in-app picker would be non-functional.
 *
 * Cached at module level since support cannot change within a page lifetime.
 */
let cachedPlatformSupportsSinkSelection: boolean | null = null;
function platformSupportsSinkSelection(): boolean {
  if (cachedPlatformSupportsSinkSelection !== null) return cachedPlatformSupportsSinkSelection;
  if (typeof window === 'undefined' || typeof HTMLMediaElement === 'undefined') {
    cachedPlatformSupportsSinkSelection = false;
    return false;
  }
  const supported = 'setSinkId' in HTMLMediaElement.prototype;
  cachedPlatformSupportsSinkSelection = supported;
  return supported;
}

export function AudioOutputSection() {
  // Hard gate: if the browser cannot route audio per-element at all (iOS
  // Safari has zero support for HTMLMediaElement.setSinkId), hide the entire
  // section. Users adjust output via OS controls (Bluetooth menu, etc.).
  // This check is module-level cached; for a given page lifetime the function
  // always returns the same value, so hook order downstream is stable.
  if (!platformSupportsSinkSelection()) return null;
  return <AudioOutputSectionInner />;
}

function AudioOutputSectionInner() {
  const { t } = useTranslation(['settings', 'common']);
  const outputDeviceId = useVoiceStore((s) => s.outputDeviceId);
  const setOutputDevice = useVoiceStore((s) => s.setOutputDevice);
  const outputVolume = useVoiceStore((s) => s.outputVolume);
  const setOutputVolume = useVoiceStore((s) => s.setOutputVolume);
  const { permState, outputs, outputLabels, requestPermission } = useAudioDevices();

  const [listOpen, setListOpen] = useState(false);
  // Default to "supported" — only flip false if a real context exists and
  // lacks setSinkId (Safari < 17). Pre-context users can still pick a device;
  // AudioManager.setOutputDevice defers the actual setSinkId until the
  // context exists (applyOutputDevice early-returns when ctx is null, and
  // initContext re-applies the persisted ID on creation).
  const [supportsSinkId, setSupportsSinkId] = useState(true);
  // Bumped whenever AudioManager's AudioContext transitions to 'running'.
  // Used as a dep on the supportsSinkId effect so the check re-evaluates
  // when the user joins voice after opening Settings — without this, a
  // user who opens Settings before joining voice would see an incorrect
  // "browser doesn't support setSinkId" fallback that never recovers.
  const [audioCtxGen, setAudioCtxGen] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click-outside-to-close. Listens for both mousedown and touchstart so the
  // popover dismisses with a single tap on touch devices (iOS Safari does not
  // synthesize mousedown reliably from touch).
  useEffect(() => {
    if (!listOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setListOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [listOpen]);

  // Listen for AudioContext resume events so the supportsSinkId check
  // re-evaluates once the context first becomes available.
  useEffect(() => {
    if (permState !== 'granted') return;
    const am = AudioManager.getInstance();
    const unsubscribe = am.onResumed(() => setAudioCtxGen((g) => g + 1));
    return () => { unsubscribe(); };
  }, [permState]);

  // Detect setSinkId support — Safari < 17 does not support it on AudioContext.
  // Default state is "supported"; we only flip to false once we have a real
  // context to inspect AND it lacks the API. This avoids hiding the picker
  // from users who open Settings before joining voice (no context yet).
  useEffect(() => {
    const ctx = AudioManager.getInstance().getContext();
    if (ctx && !('setSinkId' in ctx)) {
      setSupportsSinkId(false);
    } else {
      setSupportsSinkId(true);
    }
  }, [permState, audioCtxGen]);

  if (permState === 'unknown') {
    return (
      <SectionShell title={t('voice.output.title')}>
        <div className="text-sm text-txt-tertiary">{t('voice.output.checkingAccess')}</div>
      </SectionShell>
    );
  }

  // Output-device labels are gated behind microphone permission. If permission
  // is not granted we can still let the user adjust output volume + test the
  // current default, but the picker is hidden.
  const showPicker = permState === 'granted' && supportsSinkId;
  const systemDefaultLabel = t('voice.output.device.systemDefault');
  const selectedLabel = outputDeviceId === 'default'
    ? systemDefaultLabel
    : outputLabels.get(outputDeviceId) ?? systemDefaultLabel;

  const handleSelect = (id: string) => {
    setOutputDevice(id);
    AudioManager.getInstance().setOutputDevice(id).catch(() => {});
    setListOpen(false);
  };

  const handleTestTone = async () => {
    try { await AudioManager.getInstance().playTestTone(); } catch { /* best-effort */ }
  };

  return (
    <SectionShell title={t('voice.output.title')}>
      <div className="space-y-3">
        {showPicker ? (
          <div ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setListOpen((v) => !v)}
              className="w-full h-[38px] px-3 flex items-center justify-between rounded-lg bg-surface-input shadow-[inset_0_0_0_1px_var(--glass-border)] hover:bg-interactive-hover transition-colors duration-fast"
            >
              <span className="text-compact text-txt-primary truncate text-left">{selectedLabel}</span>
              <Icon
                name="chevron-right"
                size="sm"
                className={`text-txt-tertiary ml-2 transition-transform duration-base ease-out ${listOpen ? 'rotate-90' : ''}`}
              />
            </button>
            {listOpen && (
              <div className="mt-1 rounded-lg bg-surface-input border border-border-soft py-1 max-h-64 overflow-y-auto">
                <DropdownItem label={systemDefaultLabel} active={outputDeviceId === 'default'} onClick={() => handleSelect('default')} />
                {outputs.filter(d => d.deviceId !== 'default').map((d) => (
                  <DropdownItem
                    key={d.deviceId}
                    label={outputLabels.get(d.deviceId) ?? d.deviceId}
                    active={outputDeviceId === d.deviceId}
                    onClick={() => handleSelect(d.deviceId)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : permState === 'granted' && !supportsSinkId ? (
          <div className="text-xs text-txt-tertiary">
            {t('voice.output.device.unsupported')}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-txt-tertiary">
              {t('voice.output.permissionPrompt.description')}
            </div>
            <Button variant="primary" onClick={() => { requestPermission().catch(() => {}); }}>
              {t('voice.output.permissionPrompt.enable')}
            </Button>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-compact font-medium text-txt-primary">{t('voice.output.volume.label')}</div>
            <div className="text-xs text-txt-tertiary tabular-nums">{t('common:units.percent', { value: outputVolume })}</div>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            value={outputVolume}
            onChange={(e) => setOutputVolume(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-interactive-muted [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-txt-primary [&::-webkit-slider-thumb]:shadow-md"
            style={{
              background: `linear-gradient(to right, rgb(var(--accent-tone)) 0%, rgb(var(--accent-tone)) ${outputVolume / 2}%, rgb(var(--interactive-muted)) ${outputVolume / 2}%, rgb(var(--interactive-muted)) 100%)`,
            }}
          />
        </div>

        <Button variant="secondary" icon="volume-1" fullWidth onClick={handleTestTone}>
          {t('voice.output.testSound')}
        </Button>
      </div>
    </SectionShell>
  );
}
