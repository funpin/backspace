import React, { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { HubUpdateState } from '../../stores/projectHubStore';
import { releaseNotesUrl } from '../../utils/projectLinks';
import { Icon } from '../ui/Icon';
import { HubCard, HubLinkAction } from './HubCard';

function WhatsNewIcon() {
  return <Icon name="sparkles" />;
}

/**
 * "What's new": which version the home instance runs, whether that is news to
 * this user, and a link to its release notes on GitHub (or to the release
 * list when the version has no upstream tag or is unknown).
 *
 * Takes the update state rather than reading it, because the page passes the
 * snapshot it took on arrival: the card keeps saying "Updated to" for the
 * whole visit while the dot elsewhere clears at once.
 */
export function WhatsNewCard(props: { state: HubUpdateState; version: string | null }): JSX.Element {
  const { state, version } = props;
  const { t } = useTranslation('project');

  const line = version === null
    ? t('whatsNew.noVersion')
    : state === 'updated'
      ? t('whatsNew.updated', { version })
      : t('whatsNew.current', { version });

  return (
    <HubCard accent="lavender" icon={<WhatsNewIcon />} title={t('whatsNew.title')} body={line}>
      <HubLinkAction href={releaseNotesUrl(version)}>{t('whatsNew.action')}</HubLinkAction>
    </HubCard>
  );
}
