import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_MEMBER_NICKNAME_LENGTH, normalizeMemberNickname } from '@backspace/shared/src/constants';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { getApiForOrigin } from '../../../stores/spaceStore';
import { applySpaceMemberUpdate } from '../../../stores/spaceMemberUpdates';
import { describeError } from '../../../i18n/errors';
import type { MemberTarget } from './memberRoleActions';

/**
 * Sets or clears one member's nickname in one space. `accountName` is what
 * shows when there is no nickname; `self` picks the wording. The value is
 * checked with the server's own rule (`normalizeMemberNickname`) before it is
 * sent: an empty field clears the nickname, like Reset.
 */
export function MemberNicknameDialog({ target, nickname, accountName, self, onClose }: {
  target: MemberTarget;
  nickname: string | null;
  accountName: string;
  self: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation(['spaces', 'common', 'errors']);
  const [value, setValue] = useState(nickname ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const writing = useRef(false);
  const close = () => { if (!writing.current) onClose(); };

  const save = async (raw: string | null) => {
    if (writing.current) return;
    const next = normalizeMemberNickname(raw);
    if (next === undefined) {
      setError(t('errors:member_nickname_invalid', { max: MAX_MEMBER_NICKNAME_LENGTH }));
      return;
    }
    if (next === nickname) {
      onClose();
      return;
    }
    writing.current = true;
    setSaving(true);
    setError('');
    try {
      const member = await getApiForOrigin(target.origin).spaces.updateMember(target.spaceId, target.userId, { nickname: next });
      applySpaceMemberUpdate(target.origin, member);
      onClose();
    } catch (err) {
      setError(describeError(err));
    } finally {
      writing.current = false;
      setSaving(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void save(value);
  };

  return (
    <Modal isOpen onClose={close} title={t('spaces:members.nickname.title')} mobileStyle="sheet">
      <form onSubmit={handleSubmit}>
        <p className="mb-4 text-sm text-txt-secondary">
          {self
            ? t('spaces:members.nickname.descriptionSelf')
            : t('spaces:members.nickname.descriptionOther', { name: accountName })}
        </p>

        {error && (
          <div role="alert" className="mb-3 rounded-lg bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label htmlFor="member-nickname-input" className="block text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:members.nickname.label')}
          </label>
          <input
            id="member-nickname-input"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={MAX_MEMBER_NICKNAME_LENGTH}
            placeholder={accountName}
            disabled={saving}
            className="input-standard w-full"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {nickname !== null && (
            <Button variant="ghost" onClick={() => void save(null)} disabled={saving} className="mr-auto">
              {t('spaces:members.nickname.reset')}
            </Button>
          )}
          <Button variant="ghost" onClick={close} disabled={saving}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? t('common:states.pleaseWait') : t('common:actions.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
