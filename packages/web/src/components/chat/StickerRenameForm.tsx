import { useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_STICKER_NAME_LENGTH, normalizeStickerName, stickerUrl, type PersonalSticker } from '@backspace/shared/src/stickers';
import { api } from '../../api/client';
import { describeError } from '../../i18n/errors';
import { usePickerEscapeClaim } from './pickerEscape';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

interface StickerRenameFormProps {
  sticker: PersonalSticker;
  /** Called with the stored entry once the server accepted the new name. */
  onRenamed: (sticker: PersonalSticker) => void;
  onCancel: () => void;
}

/**
 * Renames one collection entry. It takes the picker's place, like the upload
 * form, instead of floating over it: the picker already sits in a popover or
 * a sheet that closes on an outside click, so a portaled dialog would close
 * the picker that owns it. The name is checked with the server's own rule
 * (`normalizeStickerName`) before it is sent. Escape cancels it, except
 * while the new name is being saved, and only the next Escape closes the
 * picker.
 */
export function StickerRenameForm({ sticker, onRenamed, onCancel }: StickerRenameFormProps) {
  const { t } = useTranslation(['chat', 'errors']);
  const headingId = useId();
  const inputId = useId();
  const [name, setName] = useState(sticker.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const writing = useRef(false);

  usePickerEscapeClaim(() => {
    if (!writing.current) onCancel();
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (writing.current) return;
    const next = normalizeStickerName(name);
    if (next === undefined) {
      setError(t('errors:sticker_name_invalid', { max: MAX_STICKER_NAME_LENGTH }));
      return;
    }
    if (next === sticker.name) {
      onCancel();
      return;
    }
    writing.current = true;
    setSaving(true);
    setError('');
    try {
      onRenamed(await api.stickers.rename(sticker.id, next));
    } catch (err) {
      setError(describeError(err));
    } finally {
      writing.current = false;
      setSaving(false);
    }
  };

  return (
    <form onSubmit={event => void submit(event)} aria-labelledby={headingId} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-glass-border px-4 py-2.5">
        <h3 id={headingId} className="text-sm font-semibold">{t('chat:stickers.renameTitle')}</h3>
        <IconButton icon="x" size="sm" noTitle label={t('chat:stickers.cancel')} disabled={saving} onClick={onCancel} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 space-y-3">
        <div className="flex min-h-40 items-center justify-center rounded-xl bg-surface-input p-4 sticker-checkerboard">
          <img src={stickerUrl(sticker.token) ?? undefined} alt={sticker.name} className="h-32 w-full object-contain" />
        </div>
        <div>
          <label htmlFor={inputId} className="mb-1.5 block text-xs font-medium text-txt-secondary">
            {t('chat:stickers.name')}
          </label>
          <input
            id={inputId}
            value={name}
            disabled={saving}
            maxLength={MAX_STICKER_NAME_LENGTH}
            autoFocus
            onChange={event => {
              setName(event.target.value);
              setError('');
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className="input-search w-full"
            placeholder={t('chat:stickers.name')}
          />
        </div>
        {error && (
          <p id={`${inputId}-error`} role="alert" className="rounded-lg bg-status-danger/10 px-3 py-2 text-xs text-status-danger">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-glass-border px-4 py-2.5">
        <Button variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          {t('chat:stickers.cancel')}
        </Button>
        <Button type="submit" variant="primary" size="sm" loading={saving} disabled={saving || !name.trim()}>
          {t('chat:stickers.rename')}
        </Button>
      </div>
    </form>
  );
}
