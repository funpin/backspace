import React from 'react';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '../../stores/uiStore';
import { IconButton } from '../ui/IconButton';

interface MobileScreenHeaderProps {
  title: string;
  rightActions?: React.ReactNode;
}

export function MobileScreenHeader({ title, rightActions }: MobileScreenHeaderProps) {
  const { t } = useTranslation('common');
  const popMobileScreen = useUIStore((s) => s.popMobileScreen);

  return (
    <header className="h-12 flex items-center gap-2 px-3 border-b border-border-hard bg-surface-base shrink-0">
      <IconButton icon="chevron-left" label={t('actions.back')} noTitle onClick={popMobileScreen} />
      <h1 className="text-sm font-semibold text-txt-primary flex-1 truncate">{title}</h1>
      {rightActions}
    </header>
  );
}
