import React, { useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import { Button } from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation(['common']);
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) {
      e.stopPropagation();
      onClose();
    }
  }, [onClose, loading]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown, true);
      return () => document.removeEventListener('keydown', handleKeyDown, true);
    }
  }, [isOpen, handleKeyDown]);

  const portalContainer = usePortalContainer();

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-confirm flex items-center justify-center animate-fade-in">
      <div
        className="absolute inset-0 bg-surface-overlay"
        onClick={() => { if (!loading) onClose(); }}
      />
      <div className="relative max-w-[440px] w-full mx-4 glass-modal rounded-2xl animate-slide-up">
        <div className="p-5">
          <h3 className="text-lg font-semibold text-txt-primary mb-2">{title}</h3>
          <div className="text-sm text-txt-secondary mb-5 leading-relaxed">{description}</div>
          <div className="flex gap-3">
            <Button variant="ghost" size="lg" fullWidth onClick={onClose} disabled={loading} className="bg-interactive-hover">
              {cancelLabel ?? t('common:actions.cancel')}
            </Button>
            <Button variant={variant === 'danger' ? 'danger-solid' : 'primary'} size="lg" fullWidth onClick={onConfirm} loading={loading}>
              {loading ? t('common:states.pleaseWait') : (confirmLabel ?? t('common:actions.confirm'))}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    portalContainer,
  );
}
