import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field } from '../ui/Controls';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { describeError } from '../../i18n/errors';

export function CreateCategoryModal() {
  const { t } = useTranslation(['spaces', 'common']);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const createCategory = useSpaceStore((s) => s.createCategory);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);

  const isOpen = activeModal === 'createCategory';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError(t('spaces:category.create.nameRequired'));
      return;
    }

    if (!currentSpaceId) {
      setError(t('spaces:category.create.noSpaceSelected'));
      return;
    }

    setIsLoading(true);
    try {
      await createCategory(currentSpaceId, name.trim());
      closeModal();
      setName('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={closeModal} title={t('spaces:category.create.title')} mobileStyle="sheet">
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-status-danger/10 text-xs text-status-danger">
            {error}
          </div>
        )}

        <Field label={t('spaces:category.create.nameLabel')} className="mb-5">
          {({ id }) => (
            <input
              id={id}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-standard w-full"
              placeholder={t('spaces:category.create.namePlaceholder')}
              autoFocus
            />
          )}
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={closeModal}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" type="submit" disabled={isLoading}>
            {isLoading ? t('spaces:category.create.submitting') : t('spaces:category.create.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
