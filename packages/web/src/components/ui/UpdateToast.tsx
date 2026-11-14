import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useUpdateStore,
  shouldPrompt,
  canRestartToInstall,
  statusVersion,
} from '../../stores/updateStore';
import { useUIStore } from '../../stores/uiStore';
import { Button } from './Button';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

/**
 * The persistent update prompt.
 *
 * Renders nothing in a browser, nothing while an update is merely downloading
 * or being checked for, and nothing for a version the user has already
 * dismissed. When it does render, every button it offers actually does
 * something: a Restart button appears only on a build that can install in
 * place, and a build that cannot says so in plain words instead of presenting a
 * control that silently fails.
 *
 * Surface tier is `.glass-bubble`: this is a persistent floating control, which
 * is that tier's definition in docs/systems/design-system.md. It was previously
 * `.glass-pill`, which the spec reserves for inline decorations.
 */
export function UpdateToast() {
  const { t } = useTranslation(['desktop', 'common']);
  const initialize = useUpdateStore((s) => s.initialize);
  const snapshot = useUpdateStore((s) => s.snapshot);
  const currentVersion = useUpdateStore((s) => s.currentVersion);
  const dismiss = useUpdateStore((s) => s.dismiss);
  const install = useUpdateStore((s) => s.install);
  const openDownloadPage = useUpdateStore((s) => s.openDownloadPage);
  const addToast = useUIStore((s) => s.addToast);

  useEffect(() => initialize(), [initialize]);

  if (!shouldPrompt(snapshot) || snapshot === null) return null;

  const version = statusVersion(snapshot.status);
  if (version === null) return null;

  const canRestart = canRestartToInstall(snapshot);
  const failed = snapshot.status.phase === 'failed';

  const handleLater = () => {
    dismiss();
    // The prompt is gone but the update is not lost, and the user has no way to
    // know that unless they are told once, at the moment they need to know it.
    addToast(t('desktop:update.laterHint'), 'info', 5000);
  };

  let title: string;
  let body: string;
  if (failed) {
    title = t('desktop:update.failed.title');
    body = t('desktop:update.failed.body', { version });
  } else if (canRestart) {
    title = t('desktop:update.ready.title');
    body = t('desktop:update.ready.body', { version });
  } else {
    title = t('desktop:update.available.title', { version });
    body = currentVersion
      ? t('desktop:update.available.bodyWithCurrent', { currentVersion })
      : t('desktop:update.available.body');
  }

  return (
    <div className="fixed bottom-6 left-6 z-toast animate-slide-up max-w-[calc(calc(100*var(--app-vw))-3rem)]">
      <div className="glass-bubble rounded-lg p-4 w-[380px] max-w-full">
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center ${
              failed ? 'bg-status-danger/[0.14] text-status-danger' : 'bg-accent-tone/[0.16] text-accent-tone'
            }`}
            aria-hidden="true"
          >
            <Icon name={failed ? 'triangle-alert' : 'download'} size="sm" />
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-txt-primary">{title}</p>
            {/* Deliberately wraps. The previous version truncated this line
                mid-word inside a fixed-width pill. */}
            <p className="text-xs text-txt-secondary mt-1 leading-relaxed">{body}</p>
          </div>

          <IconButton
            icon="x"
            size="sm"
            label={t('desktop:update.dismiss')}
            onClick={handleLater}
            className="-mt-1 -mr-1"
          />
        </div>

        <div className="flex items-center gap-2 mt-3.5 pl-11">
          {canRestart ? (
            <Button variant="primary" size="sm" onClick={install}>
              {t('desktop:update.restartNow')}
            </Button>
          ) : (
            <Button variant="primary" size="sm" onClick={openDownloadPage}>
              {t('desktop:update.download')}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleLater}>
            {t('desktop:update.later')}
          </Button>
        </div>
      </div>
    </div>
  );
}
