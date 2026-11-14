import React from 'react';
import type { ContextMenuItem } from '../../stores/contextMenuStore';
import type { MessageWithUser } from '@backspace/shared';
import { buildImageMenuItems } from './imageMenuItems';
import { isStickerMessage } from '../../utils/stickerMessages';
import { useUIStore } from '../../stores/uiStore';
import { useTransferStore } from '../../stores/transferStore';
import i18n from '../../i18n';
import { Icon } from '../ui/Icon';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮'];

interface MessageMenuParams {
  message: MessageWithUser;
  selectedText: string;
  previousMessageId: string | null;
  isAuthor: boolean;
  isDm: boolean;
  canAddReactions: boolean;
  canSendMessages: boolean;
  canManageMessages: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReaction: (emoji: string) => void;
  onOpenEmojiPicker: () => void;
  onMarkUnread: (messageId: string) => void;
  imageUrl?: string | null;
  stickerSource?: string | null;
  stickerName?: string;
  sourceUrl?: string | null;
  videoUrl?: string | null;
  videoFilename?: string | null;
  videoSize?: number | null;
  audioUrl?: string | null;
  audioFilename?: string | null;
  audioSize?: number | null;
}

export function buildMessageMenuItems(params: MessageMenuParams): ContextMenuItem[] {
  const {
    message,
    selectedText,
    previousMessageId,
    isAuthor,
    isDm,
    canAddReactions,
    canSendMessages,
    canManageMessages,
    onReply,
    onEdit,
    onDelete,
    onReaction,
    onOpenEmojiPicker,
    onMarkUnread,
    imageUrl,
    sourceUrl,
    videoUrl,
    videoFilename,
    videoSize,
    audioUrl,
    audioFilename,
    audioSize,
  } = params;

  const items: ContextMenuItem[] = [];

  items.push(...buildImageMenuItems({ imageUrl, sourceUrl, stickerSource: params.stickerSource, stickerName: params.stickerName }));

  // ── Video Actions (when right-clicking a video attachment) ─────────────
  if (videoUrl && videoFilename) {
    items.push({
      key: 'save-video',
      type: 'action',
      label: i18n.t('chat:menu.saveVideo'),
      icon: <Icon name="download" size="sm" />,
      onClick: () => {
        void useTransferStore.getState().startDownload(videoUrl, {
          filename: videoFilename,
          size: videoSize ?? undefined,
          mimetype: 'video/*',
          tray: true,
        });
      },
    });
    items.push({ key: 'video-sep', type: 'separator' });
  }

  // ── Audio Actions (when right-clicking an audio attachment) ────────────
  if (audioUrl && audioFilename) {
    items.push({
      key: 'save-audio',
      type: 'action',
      label: i18n.t('chat:menu.saveAudio'),
      icon: <Icon name="download" size="sm" />,
      onClick: () => {
        void useTransferStore.getState().startDownload(audioUrl, {
          filename: audioFilename,
          size: audioSize ?? undefined,
          mimetype: 'audio/*',
          tray: true,
        });
      },
    });
    items.push({ key: 'audio-sep', type: 'separator' });
  }

  items.push(...buildLinkMenuItems(sourceUrl));

  // ── Quick Reaction Row ──────────────────────────────────────────────────
  if (canAddReactions) {
    items.push({
      key: 'quick-reactions',
      type: 'custom',
      render: (close) => (
        <div className="flex items-center gap-1 px-2 py-1.5">
          {QUICK_EMOJIS.map(emoji => (
            <button
              key={emoji}
              onClick={(e) => {
                e.stopPropagation();
                onReaction(emoji);
                // The menu closes like the picker does, so the reaction shows
                // on the message instead of behind the menu's backdrop.
                close();
              }}
              className="glass-pill w-9 h-9 flex items-center justify-center text-lg rounded-lg transition-transform duration-fast ease-pop active:scale-[0.92]"
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenEmojiPicker();
            }}
            className="glass-pill w-9 h-9 flex items-center justify-center text-txt-secondary hover:text-txt-primary rounded-lg transition-colors duration-fast"
            title={i18n.t('common:actions.addReaction')}
          >
            <Icon name="smile" size="md" />
          </button>
        </div>
      ),
    });
    items.push({ key: 'reactions-sep', type: 'separator' });
  }

  // ── Reply ───────────────────────────────────────────────────────────────
  const canReply = isDm || canSendMessages;
  if (canReply) {
    items.push({
      key: 'reply',
      type: 'action',
      label: i18n.t('common:actions.reply'),
      icon: <Icon name="reply" size="sm" />,
      onClick: onReply,
    });
    items.push({ key: 'reply-sep', type: 'separator' });
  }

  // ── Clipboard group ─────────────────────────────────────────────────────
  items.push({
    key: 'copy-selected',
    type: 'action',
    label: i18n.t('chat:menu.copySelectedText'),
    hidden: selectedText.length === 0,
    icon: <Icon name="copy" size="sm" />,
    onClick: () => {
      navigator.clipboard.writeText(selectedText);
    },
  });

  items.push({
    key: 'copy-text',
    type: 'action',
    label: i18n.t('chat:menu.copyText'),
    hidden: !message.content || !!sourceUrl || isStickerMessage(message.content),
    icon: <Icon name="copy" size="sm" />,
    onClick: () => {
      navigator.clipboard.writeText(message.content ?? '');
    },
  });

  items.push({ key: 'clipboard-sep', type: 'separator' });

  // ── Mark Unread ─────────────────────────────────────────────────────────
  items.push({
    key: 'mark-unread',
    type: 'action',
    label: i18n.t('chat:menu.markUnread'),
    icon: <Icon name="eye-off" size="sm" />,
    onClick: () => {
      // '0' sentinel marks the entire channel as unread (when no previous message exists)
      onMarkUnread(previousMessageId ?? '0');
    },
  });

  items.push({ key: 'unread-sep', type: 'separator' });

  // ── Edit Message (author only; a sticker's content is a token, not text) ──
  if (isAuthor && !isStickerMessage(message.content)) {
    items.push({
      key: 'edit',
      type: 'action',
      label: i18n.t('chat:menu.editMessage'),
      icon: <Icon name="pencil" size="sm" />,
      onClick: onEdit,
    });
  }

  // ── Delete Message (author or moderator) ────────────────────────────────
  const canDelete = isAuthor || canManageMessages;
  if (canDelete) {
    items.push({
      key: 'delete',
      type: 'action',
      label: i18n.t('chat:menu.deleteMessage'),
      icon: <Icon name="trash-2" size="sm" />,
      onClick: onDelete,
      danger: true,
    });
  }

  return items;
}

function buildLinkMenuItems(sourceUrl?: string | null): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  // ── Link Actions (when URL text is suppressed) ──────────────────────
  if (sourceUrl) {
    items.push({
      key: 'copy-link',
      type: 'action',
      label: i18n.t('chat:menu.copyLink'),
      icon: <Icon name="link" size="sm" />,
      onClick: () => {
        navigator.clipboard.writeText(sourceUrl).then(() => {
          useUIStore.getState().addToast(i18n.t('chat:menu.linkCopied'), 'success', 3000);
        }).catch(() => {
          useUIStore.getState().addToast(i18n.t('chat:menu.linkCopyFailed'), 'warning', 3000);
        });
      },
    });
    items.push({
      key: 'open-link',
      type: 'action',
      label: i18n.t('chat:menu.openLink'),
      icon: <Icon name="external-link" size="sm" />,
      onClick: () => {
        window.open(sourceUrl, '_blank', 'noopener');
      },
    });
    items.push({ key: 'link-sep', type: 'separator' });
  }

  return items;
}
