import { MAX_OWNER_TITLE_LENGTH, normalizeOwnerTitle } from '@backspace/shared/src/constants.js';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '../../i18n/errors';
import { useFormatters } from '../../i18n/formatters';
import { useSelfIdentity } from '../../stores/authStore';
import { useSpaceStore, type TaggedSpace } from '../../stores/spaceStore';
import { hostKeepsOwnerTitle, ownerGroupTitle } from '../../utils/memberGroups';
import { Modal } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';

/**
 * Sets or resets the owner title. Laid out like the space nickname dialog: a
 * description, the field, and a glass action pill with Reset (only while a
 * title is set), Cancel and Save. The heading changes only when the host
 * answers; a refusal stays in the dialog.
 */
function OwnerTitleEditor({ space, onClose }: { space: TaggedSpace; onClose: () => void }) {
  const { t } = useTranslation(['spaces', 'common', 'errors']);
  const updateSpace = useSpaceStore((s) => s.updateSpace);
  const current = ownerGroupTitle(space);
  const [title, setTitle] = useState(current ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const writing = useRef(false);
  const close = () => { if (!writing.current) onClose(); };

  const save = async (ownerTitle: string | null) => {
    if (writing.current) return;
    if (ownerTitle === current) {
      onClose();
      return;
    }
    writing.current = true;
    setSaving(true);
    setError('');
    try {
      // The store publishes only the server response; failed writes never change the heading.
      await updateSpace(space.id, { ownerTitle });
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      writing.current = false;
      setSaving(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // The server's own rule, so both refuse the same values. Only Reset sends null.
    const normalized = normalizeOwnerTitle(title);
    if (typeof normalized !== 'string') {
      setError(t('errors:space_owner_title_invalid', { max: MAX_OWNER_TITLE_LENGTH }));
      return;
    }
    void save(normalized);
  };

  return (
    <Modal isOpen onClose={close} title={t('spaces:members.ownerTitle.edit')} mobileStyle="sheet">
      <form onSubmit={submit}>
        <p id="space-owner-title-hint" className="mb-4 text-sm text-txt-secondary">
          {t('spaces:members.ownerTitle.hint', { max: MAX_OWNER_TITLE_LENGTH })}
        </p>

        {error && (
          <div role="alert" className="mb-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="space-owner-title" className="block text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:members.ownerTitle.label')}
          </label>
          <input
            id="space-owner-title"
            type="text"
            autoFocus
            maxLength={MAX_OWNER_TITLE_LENGTH}
            value={title}
            disabled={saving}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('spaces:members.groups.owner')}
            aria-describedby="space-owner-title-hint"
            className="input-standard w-full"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {current !== null && (
            <Button variant="ghost" onClick={() => void save(null)} disabled={saving} className="mr-auto">
              {t('spaces:members.ownerTitle.reset')}
            </Button>
          )}
          <Button variant="ghost" onClick={close} disabled={saving}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? t('common:states.saving') : t('common:actions.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The owner group's heading in the member list, on desktop and phone. The
 * heading is cosmetic: only the actual owner sees the editor, regardless of
 * role permissions. The edit control's negative margin keeps the heading as
 * tall as the other group headings; `touch` makes it a 44px tap target for
 * the phone screen.
 */
export function OwnerTitleHeading({ space, count, touch = false }: { space: TaggedSpace; count: number; touch?: boolean }) {
  const { t } = useTranslation('spaces');
  const { formatNumber } = useFormatters();
  // The owner id is the owner's row on the space's host, so compare it with
  // the signed-in user's row there, not with the home account id.
  const self = useSelfIdentity();
  const myIdHere = self?.rowIds.get(space._instanceOrigin);
  const [editing, setEditing] = useState(false);
  const canEdit = myIdHere !== undefined && myIdHere === space.ownerId && hostKeepsOwnerTitle(space);
  const ownerTitle = ownerGroupTitle(space);
  const title = ownerTitle ?? t('members.groups.owner');

  return (
    <>
      <div className="flex items-center gap-1 px-2 mb-1">
        <h3 title={title} className="min-w-0 truncate text-xs font-medium text-txt-tertiary">
          {title} — {formatNumber(count)}
        </h3>
        {canEdit && (
          <button type="button" onClick={() => setEditing(true)} aria-label={t('members.ownerTitle.edit')} title={t('members.ownerTitle.edit')} className={`shrink-0 rounded text-txt-tertiary hover:text-txt-primary hover:bg-interactive-hover transition-colors duration-fast ${touch ? '-my-4 flex h-11 w-11 items-center justify-center active:bg-interactive-hover' : '-my-1 p-1'}`}>
            <Icon name="pencil" size="xs" />
          </button>
        )}
      </div>
      {canEdit && editing && <OwnerTitleEditor space={space} onClose={() => setEditing(false)} />}
    </>
  );
}
