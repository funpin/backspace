import React, { type JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { isElectron } from '../../platform/platform';
import { describeEnvironment } from '../../utils/describeEnvironment';
import { bugReportUrl, featureRequestUrl } from '../../utils/projectLinks';
import { Icon } from '../ui/Icon';
import { HubCard, HubLinkAction } from './HubCard';

function ReportIcon() {
  return <Icon name="flag" />;
}

/**
 * "Report a bug or request a feature": two links to the upstream issue forms.
 * The bug form arrives with the instance version (left out when unknown) and
 * the browser or desktop app filled in; the environment string is English on
 * purpose, since it is written into a GitHub issue and never shown here.
 */
export function ReportCard(props: { version: string | null }): JSX.Element {
  const { version } = props;
  const { t } = useTranslation('project');
  const environment = describeEnvironment(navigator.userAgent, isElectron());

  return (
    <HubCard accent="amber" icon={<ReportIcon />} title={t('report.title')} body={t('report.body')}>
      <HubLinkAction href={bugReportUrl({ version, environment })}>{t('report.bug')}</HubLinkAction>
      <HubLinkAction href={featureRequestUrl()}>{t('report.feature')}</HubLinkAction>
    </HubCard>
  );
}
