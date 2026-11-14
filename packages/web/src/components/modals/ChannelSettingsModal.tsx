import React, { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Modal } from '../ui/Modal';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useUIStore } from '../../stores/uiStore';
import { useSpaceStore, getApiForOrigin } from '../../stores/spaceStore';
import { PermissionBits, hasPermissionBit, isHiddenFromEveryone } from '../../utils/permissions';
import { InlineNameEditor } from '../ui/InlineNameEditor';
import { PermissionsEditor } from '../ui/PermissionsEditor';
import type { PermissionDef } from '../ui/OverrideEntry';
import { describeError } from '../../i18n/errors';
import { useEntityOverrides } from '../../hooks/useEntityOverrides';
import { PrivacySetting } from './PrivacySetting';
import { Icon } from '../ui/Icon';
import { Button } from '../ui/Button';
import { ChannelTopicEditor } from './ChannelTopicEditor';
import { CHANNEL_NAME_MAX_LENGTH, normalizeChannelName } from '@backspace/shared/src/constants';

// ─── Permission Definitions for Channel Overrides ──────────────────────────────

const TEXT_CHANNEL_PERMISSIONS: PermissionDef[] = [
  { key: 'VIEW_CHANNEL', bit: PermissionBits.VIEW_CHANNEL },
  { key: 'SEND_MESSAGES', bit: PermissionBits.SEND_MESSAGES },
  { key: 'MANAGE_MESSAGES', bit: PermissionBits.MANAGE_MESSAGES },
  { key: 'ATTACH_FILES', bit: PermissionBits.ATTACH_FILES },
  { key: 'MENTION_EVERYONE', bit: PermissionBits.MENTION_EVERYONE },
  { key: 'READ_MESSAGE_HISTORY', bit: PermissionBits.READ_MESSAGE_HISTORY },
  { key: 'ADD_REACTIONS', bit: PermissionBits.ADD_REACTIONS },
];

const VOICE_CHANNEL_PERMISSIONS: PermissionDef[] = [
  { key: 'VIEW_CHANNEL', bit: PermissionBits.VIEW_CHANNEL },
  { key: 'CONNECT', bit: PermissionBits.CONNECT },
  { key: 'SPEAK', bit: PermissionBits.SPEAK },
  { key: 'STREAM', bit: PermissionBits.STREAM },
  { key: 'MUTE_MEMBERS', bit: PermissionBits.MUTE_MEMBERS },
  { key: 'DEAFEN_MEMBERS', bit: PermissionBits.DEAFEN_MEMBERS },
  { key: 'MOVE_MEMBERS', bit: PermissionBits.MOVE_MEMBERS },
  { key: 'DISCONNECT_MEMBERS', bit: PermissionBits.DISCONNECT_MEMBERS },
];

// ─── Overview Tab ───────────────────────────────────────────────────────────────

function OverviewTab({
  channelId,
  channelName,
  channelType,
  channelTopic,
  isPrivate,
  isFetching,
  isLoading,
  error,
  canManageChannels,
  canManageRoles,
  onTogglePrivate,
  onDeleteChannel,
  onRename,
  onSaveTopic,
}: {
  channelId: string;
  channelName: string;
  channelType: string;
  channelTopic: string | null;
  isPrivate: boolean;
  isFetching: boolean;
  isLoading: boolean;
  error: string;
  canManageChannels: boolean;
  canManageRoles: boolean;
  onTogglePrivate: () => void;
  onDeleteChannel: () => void;
  onRename: (name: string) => Promise<void>;
  onSaveTopic: (topic: string | null) => Promise<void>;
}) {
  const { t } = useTranslation(['spaces', 'common']);
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-txt-secondary mb-1.5">
          {t('spaces:channel.settings.channelLabel')}
        </label>
        <InlineNameEditor
          name={channelName}
          icon={
            <Icon name={isPrivate ? 'lock' : 'hash'} size="md" className="text-txt-tertiary" />
          }
          canEdit={canManageChannels}
          editLabel={t('spaces:channel.settings.rename')}
          fieldLabel={t('spaces:channel.settings.nameLabel')}
          maxLength={CHANNEL_NAME_MAX_LENGTH}
          normalize={normalizeChannelName}
          onSave={onRename}
        />
      </div>

      {/* Only text channels show a topic (in the channel header), so only
          they offer to edit one, the same as the create dialog. */}
      {channelType === 'text' && (
        <ChannelTopicEditor key={channelId} topic={channelTopic} canEdit={canManageChannels} onSave={onSaveTopic} />
      )}

      {error && (
        <div className="px-3 py-2 rounded-lg bg-status-danger/10 text-xs text-status-danger">
          {error}
        </div>
      )}

      {/* Privacy is an @everyone override: reading and writing it both need
          MANAGE_ROLES, so without it the row would only show a guess. */}
      {canManageRoles && (
        <PrivacySetting
          label={t('spaces:channel.settings.private.label')}
          description={t('spaces:channel.settings.private.description')}
          note={t('spaces:channel.settings.private.note')}
          isPrivate={isPrivate}
          busy={isLoading || isFetching}
          onToggle={onTogglePrivate}
        />
      )}

      {canManageChannels && (
        <div className="pt-4 border-t border-border-hard">
          <label className="block text-xs font-medium text-status-danger mb-2">{t('common:labels.dangerZone')}</label>
          <Button variant="danger" icon="trash-2" onClick={onDeleteChannel}>
            {t('spaces:channel.settings.deleteButton')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main Modal ─────────────────────────────────────────────────────────────────

export function ChannelSettingsModal() {
  const { t } = useTranslation(['spaces', 'common']);
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const channels = useSpaceStore((s) => s.channels);
  const spaces = useSpaceStore((s) => s.spaces);
  const spacePermissions = useSpaceStore((s) => s.spacePermissions);
  const channelPermissions = useSpaceStore((s) => s.channelPermissions);

  const [tab, setTab] = useState<'overview' | 'permissions'>('overview');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isOpen = activeModal === 'channelSettings';
  const channelId = modalData?.channelId as string | undefined;
  const channel = channels.find(c => c.id === channelId);

  // Each flag reads the scope its server route checks (permissions.md, "Client
  // gating"): editing or deleting this channel resolves MANAGE_CHANNELS with the
  // channel's overrides, the override routes check MANAGE_ROLES space-wide.
  const canManageChannels = hasPermissionBit(channelId ? channelPermissions.get(channelId) : undefined, PermissionBits.MANAGE_CHANNELS);
  const canManageRoles = hasPermissionBit(currentSpaceId ? spacePermissions.get(currentSpaceId) : undefined, PermissionBits.MANAGE_ROLES);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowDeleteConfirm(false);
      setIsDeleting(false);
      setTab('overview');
    }
  }, [isOpen]);

  // One list of this channel's overrides for the whole dialog: the Overview
  // derives privacy from it and the Permissions tab edits it, so neither
  // shows a copy the other has made stale.
  const space = spaces.find(s => s.id === currentSpaceId);
  const entityOverrides = useEntityOverrides('channel', isOpen ? channelId : undefined, space, canManageRoles);
  const isPrivate = currentSpaceId ? isHiddenFromEveryone(entityOverrides.overrides, currentSpaceId) : false;
  const isFetching = !entityOverrides.loaded;
  const shownError = error || entityOverrides.error;

  if (!isOpen || !channel || !channelId || !currentSpaceId) return null;

  const handleToggle = async () => {
    setError('');
    setIsLoading(true);
    try {
      // Only the View Channels bit of the @everyone override changes; any
      // other @everyone bit on this channel stays (#327, #365).
      await entityOverrides.setBits('role', currentSpaceId, PermissionBits.VIEW_CHANNEL, isPrivate ? 'neutral' : 'deny');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteChannel = async () => {
    if (!channelId || !currentSpaceId) return;
    setIsDeleting(true);
    try {
      const channelApi = getApiForOrigin(space?._instanceOrigin ?? '');
      await channelApi.channels.delete(channelId);
      closeModal();
    } catch (err) {
      setError(describeError(err));
      setIsDeleting(false);
    }
  };

  const handleRenameChannel = async (name: string): Promise<void> => {
    setError('');
    try {
      await useSpaceStore.getState().updateChannel(channelId, { name });
    } catch (err) {
      setError(describeError(err));
      throw err;
    }
  };

  const handleSaveTopic = async (topic: string | null): Promise<void> => {
    setError('');
    try {
      await useSpaceStore.getState().updateChannel(channelId, { topic });
    } catch (err) {
      setError(describeError(err));
      throw err;
    }
  };

  const showTabs = canManageRoles;

  const tabClass = (target: typeof tab) =>
    `w-full h-[34px] text-left px-2.5 rounded-lg text-sm transition-colors duration-fast ${
      tab === target ? 'bg-surface-elevated text-txt-primary font-medium' : 'text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover'
    }`;

  return (
    <>
      <Modal isOpen={isOpen} onClose={closeModal} title={t('spaces:channel.settings.title')} mobileStyle="fullscreen" maxWidth={showTabs ? 'max-w-2xl' : 'max-w-md'}>
        {showTabs ? (
          <div className="flex gap-4 h-[min(520px,calc(70*var(--app-vh)))]">
            {/* Tabs */}
            <div className="w-32 flex-shrink-0 self-start z-10">
              <div className="space-y-0.5">
                <button onClick={() => setTab('overview')} className={tabClass('overview')}>
                  {t('spaces:settings.nav.tabs.overview')}
                </button>
                <button onClick={() => setTab('permissions')} className={tabClass('permissions')}>
                  {t('spaces:permissions.title')}
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 overflow-y-auto scrollbar-thin">
              {tab === 'overview' && (
                <OverviewTab
                  channelId={channelId}
                  channelName={channel.name}
                  channelType={channel.type}
                  channelTopic={channel.topic}
                  isPrivate={isPrivate}
                  isFetching={isFetching}
                  isLoading={isLoading}
                  error={shownError}
                  canManageChannels={canManageChannels}
                  canManageRoles={canManageRoles}
                  onTogglePrivate={handleToggle}
                  onDeleteChannel={() => setShowDeleteConfirm(true)}
                  onRename={handleRenameChannel}
                  onSaveTopic={handleSaveTopic}
                />
              )}
              {tab === 'permissions' && (
                <PermissionsEditor
                  entityId={channelId}
                  spaceId={currentSpaceId}
                  permDefs={channel.type === 'voice' ? VOICE_CHANNEL_PERMISSIONS : TEXT_CHANNEL_PERMISSIONS}
                  overrides={entityOverrides.overrides}
                  loadError={entityOverrides.error}
                  putOverride={entityOverrides.put}
                  deleteOverride={entityOverrides.remove}
                  onSaved={entityOverrides.reload}
                  unhideNote={t('spaces:channel.settings.private.unhideOnSave')}
                />
              )}
            </div>
          </div>
        ) : (
          <OverviewTab
            channelId={channelId}
            channelName={channel.name}
            channelType={channel.type}
            channelTopic={channel.topic}
            isPrivate={isPrivate}
            isFetching={isFetching}
            isLoading={isLoading}
            error={shownError}
            canManageChannels={canManageChannels}
            canManageRoles={canManageRoles}
            onTogglePrivate={handleToggle}
            onDeleteChannel={() => setShowDeleteConfirm(true)}
            onRename={handleRenameChannel}
            onSaveTopic={handleSaveTopic}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteChannel}
        title={t('spaces:channel.delete.title', { name: channel.name })}
        description={
          <Trans
            t={t}
            i18nKey={channel.type === 'voice' ? 'spaces:channel.delete.descriptionVoice' : 'spaces:channel.delete.description'}
            values={{ name: channel.name }}
            components={{ strong: <strong /> }}
          />
        }
        confirmLabel={t('spaces:channel.delete.confirm')}
        variant="danger"
        loading={isDeleting}
      />
    </>
  );
}
