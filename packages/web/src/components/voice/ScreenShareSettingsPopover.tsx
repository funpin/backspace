import React, { useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useFloatingPosition } from '../../hooks/useFloatingPosition';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import { Button } from '../ui/Button';
import { StreamQualityControls, StreamSummary, StreamHostSubtitle } from './StreamQualityControls';

interface ScreenShareSettingsPopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  /**
   * When provided, the popover ends with a destructive "Stop Sharing" action.
   * The control bars pass this because the screen-share button is their only
   * entry point to these settings while a share is live; the stream-tile
   * context menu omits it because it already carries its own stop item.
   */
  onStopSharing?: () => void;
}

export function ScreenShareSettingsPopover({ open, onClose, anchorRef, onStopSharing }: ScreenShareSettingsPopoverProps) {
  const { t } = useTranslation(['voice', 'common']);
  const popoverRef = useRef<HTMLDivElement>(null);
  const portalContainer = usePortalContainer();

  const { style } = useFloatingPosition(anchorRef, popoverRef, {
    placement: 'top',
    offset: 12,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      // The anchor owns its own toggle: closing here on its mousedown would
      // make the following click re-open the popover instead of closing it.
      if (anchorRef.current?.contains(target)) return;
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={style}
      className="w-[260px] glass rounded-xl overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-border-hard">
        <div className="text-sm font-semibold text-txt-primary">{t('voice:streamSettings.title')}</div>
        <StreamHostSubtitle className="mt-0.5" />
      </div>

      <div className="px-3 py-3">
        <StreamQualityControls />
      </div>

      {/* Footer — computed stats */}
      <div className="px-3 py-2 border-t border-border-hard">
        <StreamSummary />
      </div>

      {/* Stop sharing — only when the host surface has no other stop control */}
      {onStopSharing && (
        <div className="px-3 pb-3 pt-1">
          <Button variant="danger-solid" icon="screen-share-off" fullWidth onClick={onStopSharing}>
            {t('voice:controls.stopSharing')}
          </Button>
        </div>
      )}
    </div>,
    portalContainer,
  );
}
