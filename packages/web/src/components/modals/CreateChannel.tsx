import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field } from '../ui/Controls';
import { Icon } from '../ui/Icon';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { describeError } from '../../i18n/errors';
import { CHANNEL_TOPIC_MAX_LENGTH, normalizeChannelTopic } from '@backspace/shared/src/constants';

export function CreateChannelModal() {
  const { t } = useTranslation(['spaces', 'common']);
  const [name, setName] = useState('');
  const [type, setType] = useState<'text' | 'voice'>('text');
  const [topic, setTopic] = useState('');
  const [categoryId, setCategoryId] = useState<string | ''>('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const createChannel = useSpaceStore((s) => s.createChannel);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const categories = useSpaceStore((s) => s.categories);

  const isOpen = activeModal === 'createChannel';

  // Pre-select category when opened from a category's + button
  useEffect(() => {
    if (isOpen && modalData.categoryId) {
      setCategoryId(modalData.categoryId as string);
    }
  }, [isOpen, modalData.categoryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t('spaces:channel.create.nameRequired'));
      return;
    }

    if (!currentSpaceId) {
      setError(t('spaces:channel.create.noSpaceSelected'));
      return;
    }

    setIsLoading(true);
    try {
      await createChannel(currentSpaceId, name.trim(), type, normalizeChannelTopic(topic) ?? undefined, categoryId || undefined);
      closeModal();
      setName('');
      setTopic('');
      setType('text');
      setCategoryId('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title={t('spaces:channel.create.title')} mobileStyle="sheet">
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-status-danger/10 text-xs text-status-danger">
            {error}
          </div>
        )}

        <div className="mb-4">
          <span className="block text-xs font-medium text-txt-secondary mb-1.5">
            {t('spaces:channel.create.typeLabel')}
          </span>
          <div className="space-y-2">
            {(['text', 'voice'] as const).map((kind) => (
              <label
                key={kind}
                className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors duration-fast ${
                  type === kind
                    ? 'shadow-[inset_0_0_0_1.5px_rgb(var(--accent-tone))] bg-accent-tone/[0.16]'
                    : 'shadow-[inset_0_0_0_1px_var(--glass-border)] hover:bg-interactive-hover'
                }`}
              >
                <input
                  type="radio"
                  name="channelType"
                  value={kind}
                  checked={type === kind}
                  onChange={() => setType(kind)}
                  className="hidden"
                />
                <Icon name={kind === 'text' ? 'hash' : 'volume-2'} className={type === kind ? 'text-accent-tone' : 'text-txt-tertiary'} />
                <div>
                  <div className="text-sm font-medium text-txt-primary">
                    {kind === 'text' ? t('spaces:channel.create.types.text.name') : t('spaces:channel.create.types.voice.name')}
                  </div>
                  <div className="text-xs text-txt-tertiary">
                    {kind === 'text' ? t('spaces:channel.create.types.text.description') : t('spaces:channel.create.types.voice.description')}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <Field label={t('spaces:channel.create.nameLabel')} className="mb-4">
          {({ id }) => (
            <input
              id={id}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-standard w-full"
              placeholder={t('spaces:channel.create.namePlaceholder')}
              autoFocus
            />
          )}
        </Field>

        {type === 'text' && (
          <Field label={t('spaces:channel.create.topicLabel')} className="mb-4">
            {({ id }) => (
              <input
                id={id}
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                maxLength={CHANNEL_TOPIC_MAX_LENGTH}
                className="input-standard w-full"
                placeholder={t('spaces:channel.create.topicPlaceholder')}
              />
            )}
          </Field>
        )}

        {categories.length > 0 && (
          <Field label={t('spaces:channel.create.categoryLabel')} className="mb-4">
            {({ id }) => (
              <select
                id={id}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="input-standard w-full"
              >
                <option value="">{t('spaces:channel.create.noCategory')}</option>
                {[...categories].sort((a, b) => a.position - b.position).map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            )}
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={closeModal}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={isLoading}>
            {isLoading ? t('spaces:channel.create.submitting') : t('spaces:channel.create.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
