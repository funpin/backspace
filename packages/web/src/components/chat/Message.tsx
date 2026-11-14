import { isStickerMessage } from '../../utils/stickerMessages';
import { StickerMessage } from './StickerMessage';
import { useAuthorMenu } from './useAuthorMenu';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatters, useFormatters } from '../../i18n/formatters';
import type { MessageWithUser, Embed, Reaction, User } from '@backspace/shared';
import { MarkdownRenderer } from './MarkdownRenderer';
import { InlineMessageText } from './InlineMessageText';
import { Avatar } from '../ui/Avatar';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { menuPositionFor, useContextMenuStore } from '../../stores/contextMenuStore';
import { buildMessageMenuItems } from './messageMenuItems';
import { useAuthStore, useSelfIdentity } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { selectMyRoleIdsInChannel, useSpaceStore } from '../../stores/spaceStore';
import { useUIStore } from '../../stores/uiStore';
import { AttachmentRenderer, attUrlOf } from './AttachmentRenderer';
import { AttachmentProgress } from './AttachmentProgress';
import { EmbedRenderer } from './EmbedRenderer';
import { FederationGlobeIcon } from '../ui/Username';
import { Tooltip } from '../ui/Tooltip';
import { Icon } from '../ui/Icon';
import { IconButton } from '../ui/IconButton';
import { EmojiPicker } from './EmojiPicker';
import { MobilePickerSheet } from './MobilePickerSheet';
import { ReactionPickerPopover } from './ReactionPickerPopover';
import { hasPermissionBit, PermissionBits } from '../../utils/permissions';
import { isDeletedPartnerDm } from '../../utils/dmFormatters';
import { isFederationGlobeApplicable, isMine, spaceMemberName } from '../../utils/identity';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { useSelfIdInChannel } from '../../utils/channelUser';
import { mentionsReader } from '../../utils/notificationFilters';
import {
  isPendingMessage,
  usePendingMessageStore,
  type PendingMessageView,
  type PendingAttachmentView,
} from '../../stores/pendingMessageStore';
import { useTransferStore } from '../../stores/transferStore';
import { useMessageJump } from './messageJumpContext';
import { ReactionPill } from './ReactionPill';
import { memberNameColor } from '../../utils/memberGroups';

interface MessageProps {
  message: MessageWithUser | PendingMessageView;
  isCompact: boolean;
  isFirstInGroup: boolean;
  previousMessageId: string | null;
}

interface PendingAttachmentTileProps {
  transferId: string;
}

function PendingAttachmentTile({ transferId }: PendingAttachmentTileProps) {
  const transfer = useTransferStore((s) => s.transfers.get(transferId));
  const pauseUpload = useTransferStore((s) => s.pauseUpload);
  const resumeUpload = useTransferStore((s) => s.resumeUpload);
  const abortUpload = useTransferStore((s) => s.abortUpload);
  if (!transfer) {
    return <div className="w-[140px] h-[96px] rounded-xl bg-surface-channel" />;
  }
  return (
    <div className="relative w-[140px] h-[96px] rounded-xl overflow-hidden bg-surface-channel">
      <AttachmentProgress
        loaded={transfer.progress.loaded}
        total={transfer.progress.total}
        state={transfer.state}
        filename={transfer.file.name}
        error={transfer.error?.message}
        onPause={transfer.state === 'active' ? () => pauseUpload(transfer.id) : undefined}
        onResume={transfer.state === 'paused' ? () => resumeUpload(transfer.id) : undefined}
        onAbort={() => abortUpload(transfer.id)}
        size="tile"
      />
    </div>
  );
}

/**
 * A person's name in a message row (author, reply preview): the name as
 * plain text, followed by the federation globe exactly when the person is
 * from another instance (`isFederationGlobeApplicable`), with the full
 * username as its tooltip. The same rule as the DM list and header.
 */
function PersonName({ name, person, className, style }: {
  name: string;
  person: Pick<User, 'username'>;
  className: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} style={style}>
      {name}
      {isFederationGlobeApplicable(person) && (
        <Tooltip content={person.username} position="top">
          <FederationGlobeIcon />
        </Tooltip>
      )}
    </span>
  );
}

function formatMessageTimestamp(t: TFunction<['chat', 'common']>, fmt: typeof formatters, timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = fmt.formatTime(timestamp);

  if (isToday) return t('common:time.today', { time });
  if (isYesterday) return t('common:time.yesterday', { time });
  return fmt.formatDateTime(timestamp);
}

function formatHoverTime(timestamp: number): string {
  return formatters.formatTime(timestamp);
}

const GIF_URL_REGEX = /^https:\/\/(?:media\.tenor\.com|static\.klipy\.com)\/.+$/;

function isGifOnlyMessage(content: string | null): boolean {
  if (!content) return false;
  const trimmed = content.trim();
  return GIF_URL_REGEX.test(trimmed);
}

/**
 * Returns the original posted URL when a message is a single URL that resolved
 * to an image embed, or null if the message should render normally.
 */
function getImageEmbedSourceUrl(content: string | null, embeds: Embed[]): string | null {
  if (!content) return null;
  const trimmed = content.trim();
  // Must be a single URL with no surrounding text
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return null;
  if (/\s/.test(trimmed)) return null;
  // Must have at least one image embed whose URL matches the posted content
  const hasMatchingImageEmbed = embeds.some(
    (e) => e.embedType === 'image' && e.url === trimmed
  );
  return hasMatchingImageEmbed ? trimmed : null;
}

export function Message({ message, isCompact, isFirstInGroup, previousMessageId }: MessageProps) {
  const { t } = useTranslation(['chat', 'common']);
  const fmt = useFormatters();
  const [editContent, setEditContent] = useState(message.content ?? '');
  const [isHovered, setIsHovered] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The reaction picker, and what opened it: the "+" of the hover bar, or the
  // message menu ('row'). On desktop it hangs off that button or the message
  // row; on mobile it is a bottom sheet whatever opened it.
  const [reactionPicker, setReactionPicker] = useState<'button' | 'row' | null>(null);
  const showReactionPicker = reactionPicker !== null;
  const confirmDeleteTimeout = useRef<ReturnType<typeof setTimeout>>();
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const reactionPickerBtnRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const currentUser = useAuthStore((s) => s.user);
  const editMessage = useChatStore((s) => s.editMessage);
  const editingMessageId = useChatStore((s) => s.editingMessageId);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const members = useSpaceStore((s) => s.members);
  const openUserProfile = useUIStore((s) => s.openUserProfile);
  const isMobile = useUIStore((s) => s.isMobile);
  const jumpToMessage = useMessageJump();

  const pending = isPendingMessage(message) ? message.__pending : null;
  const showInteractions = !pending;
  const isEditing = !pending && editingMessageId === message.id;

  useEffect(() => {
    if (!isEditing) return;
    const content = message.content ?? '';
    setEditContent(content);
    const frame = requestAnimationFrame(() => {
      const textarea = editTextareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(content.length, content.length);
    });
    return () => cancelAnimationFrame(frame);
  }, [isEditing, message.content]);

  const transfersForRow = useTransferStore((s) => s.transfers);
  const inMemoryFiles = useTransferStore((s) => s.hasInMemoryFile);
  const anyTransferTerminallyBad = !!pending && pending.transferIds.some((tid) => {
    const t = transfersForRow.get(tid);
    return t && (t.state === 'failed' || t.state === 'aborted');
  });
  const showRetryDiscardRow = pending?.state === 'failed' || anyTransferTerminallyBad;
  // Retry is only feasible when we can re-source the bytes for every transfer in the
  // pending row — either the in-memory File ref still exists (same-session retry)
  // or a persisted FileSystemFileHandle can reacquire the bytes (Chrome/Edge drag-drop).
  // After a reload (or post-redeploy refresh) without a handle, both are gone, and
  // showing a Retry button that silently no-ops would strand the user. Hide it instead.
  const canRetry = !!pending && pending.transferIds.every((tid) => {
    const t = transfersForRow.get(tid);
    if (!t || t.type !== 'upload') return false;
    return inMemoryFiles.has(tid) || !!t.fileHandleId;
  });

  const channelKey: string = isPendingMessage(message)
    ? message.channelId || message.dmChannelId || ''
    : message.channelId || (message as MessageWithUser & { dmChannelId?: string }).dmChannelId || '';
  // The instance that issued this message and its rows.
  const messageOrigin = useSpaceStore((s) => s.channelOriginMap.get(channelKey) ?? '');
  const self = useSelfIdentity();
  const isAuthor = isMine(message.user, messageOrigin, self);
  // The channel whose origin issued this message's ids; mentions resolve there.
  const mentionChannelId = channelKey || null;
  const selfIdHere = useSelfIdInChannel(mentionChannelId);
  const myRoleIdsHere = useSpaceStore((s) => (mentionChannelId ? selectMyRoleIdsInChannel(s, mentionChannelId) : undefined));
  const startEditing = () => {
    setEditContent(message.content ?? '');
    setEditingMessage(message.id);
  };
  const stopEditing = () => {
    setEditContent(message.content ?? '');
    setEditingMessage(null);
  };
  const channelPermissions = useSpaceStore((s) => s.channelPermissions);
  const myChPerms = channelPermissions.get(message.channelId);
  const isDmMessage = isPendingMessage(message)
    ? !!message.dmChannelId || !message.channelId
    : !!(message as MessageWithUser & { dmChannelId?: string }).dmChannelId || !message.channelId;
  const dmChannelId = isPendingMessage(message)
    ? message.dmChannelId
    : (message as MessageWithUser & { dmChannelId?: string }).dmChannelId;
  const dmChannels = useSpaceStore((s) => s.dmChannels);
  // Read-only enforcement (client mirror of the server guard): a dead 1-on-1 DM
  // (partner tombstoned) accepts no reaction mutations. Existing reactions still
  // DISPLAY, but the add/toggle affordances are withdrawn since the server drops them.
  const isDeadDmThread = !!dmChannelId && (() => {
    const dm = dmChannels.find(d => d.id === dmChannelId);
    return dm ? isDeletedPartnerDm(dm, { self, origin: messageOrigin }) : false;
  })();
  const canManageMessages = hasPermissionBit(myChPerms, PermissionBits.MANAGE_MESSAGES);
  const canSendMessages = isDmMessage || hasPermissionBit(myChPerms, PermissionBits.SEND_MESSAGES);
  const canDelete = isAuthor || canManageMessages;
  const canAddReactions = (isDmMessage || hasPermissionBit(myChPerms, PermissionBits.ADD_REACTIONS)) && !isDeadDmThread;

  const addReaction = useChatStore((s) => s.addReaction);
  const removeReaction = useChatStore((s) => s.removeReaction);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const markUnread = useChatStore((s) => s.markUnread);

  // The reply belongs to the channel this message is in; its composer shows it.
  const startReply = (): void => {
    if (channelKey) setReplyTo(channelKey, message);
  };

  const _FALLBACK_USER = { id: '', username: '', createdAt: 0, isAdmin: false, replicatedInstances: [] } as unknown as User;
  const _rawMsgUser = message.user ?? null;
  const _canonicalMsgUser = useCanonicalUserView(_rawMsgUser ?? _FALLBACK_USER, messageOrigin);
  const _rawReplyUser = (!isPendingMessage(message) && message.replyTo?.user) ? message.replyTo.user : null;
  const _canonicalReplyUser = useCanonicalUserView(_rawReplyUser ?? _FALLBACK_USER, messageOrigin);

  const toggleReaction = (emoji: string) => {
    // Read-only: a dead 1-on-1 DM accepts no reaction mutations (add OR remove).
    if (isDeadDmThread) return;
    // Read from the store at call time: the context menu keeps the handlers
    // of the render that opened it, whose `message` is older than a reaction
    // added since. Only stored reactions count, the ones the pills show: a
    // tap during an add's round trip is an add, which addReaction does not
    // send a second time.
    const hasReacted = useChatStore.getState().hasOwnReaction(message.id, emoji);
    if (hasReacted) {
      removeReaction(message.id, emoji);
    } else if (canAddReactions) {
      addReaction(message.id, emoji);
    }
  };

  // Reactions grouped by emoji, in the order each emoji first appeared.
  const reactionGroups = new Map<string, Reaction[]>();
  for (const r of message.reactions || []) {
    const group = reactionGroups.get(r.emoji);
    if (group) group.push(r);
    else reactionGroups.set(r.emoji, [r]);
  }

  // Auto-cancel delete confirmation after timeout
  const startDeleteConfirm = useCallback(() => {
    setConfirmingDelete(true);
    clearTimeout(confirmDeleteTimeout.current);
    confirmDeleteTimeout.current = setTimeout(() => setConfirmingDelete(false), 3000);
  }, []);

  const cancelDeleteConfirm = useCallback(() => {
    setConfirmingDelete(false);
    clearTimeout(confirmDeleteTimeout.current);
  }, []);

  useEffect(() => {
    return () => clearTimeout(confirmDeleteTimeout.current);
  }, []);

  const isGifOnly = isGifOnlyMessage(message.content);
  // A sticker draws its own image: no edit (its content is a token, not
  // text), and no embed (an older instance unfurls the asset URL into one).
  const isSticker = isStickerMessage(message.content);
  const canEdit = isAuthor && !isSticker;
  const imageEmbedSourceUrl = isGifOnly ? null : getImageEmbedSourceUrl(message.content, message.embeds || []);
  // sourceUrl: the original URL for context menu Copy/Open Link actions
  const sourceUrl = isGifOnly
    ? (message.content?.trim() ?? null)
    : imageEmbedSourceUrl;

  const closeReactionPicker = useCallback(() => setReactionPicker(null), []);

  const handleReactionEmojiSelect = useCallback((emoji: { native: string }) => {
    addReaction(message.id, emoji.native);
    setReactionPicker(null);
  }, [addReaction, message.id]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (pending) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const selectedText = window.getSelection()?.toString() ?? '';

    // Detect if the right-click target is a content image (not an avatar or embed thumbnail)
    const imgEl = (e.target as HTMLElement).closest('img') as HTMLImageElement | null;
    const isContentImage = imgEl && !imgEl.closest('[data-avatar]') && !imgEl.closest('[data-embed-thumbnail]');
    const imageUrl = isContentImage ? imgEl.src : null;
    // Attachment previews may be thumbnails; collection always uses the original source.
    const stickerSource = isContentImage ? imgEl.dataset.stickerSource : null;
    // An attachment's alt is its file name; the collection keeps it without the extension.
    const stickerName = isContentImage ? imgEl.alt.replace(/\.[^.]+$/, '').slice(0, 100) : undefined;

    // Detect right-click on a video/audio element and resolve its underlying attachment.
    // `message` is the persisted form here — pending messages return early above.
    const persistedAttachments = (message as MessageWithUser).attachments ?? [];
    const videoEl = (e.target as HTMLElement).closest('video') as HTMLVideoElement | null;
    const audioEl = (e.target as HTMLElement).closest('audio') as HTMLAudioElement | null;
    const matchAttByUrl = (mediaSrc: string, kind: 'video' | 'audio') => {
      // currentSrc is absolute; attUrlOf may be relative — compare via URL parse.
      let mediaPath: string;
      try {
        mediaPath = new URL(mediaSrc, window.location.origin).pathname;
      } catch { mediaPath = mediaSrc; }
      return persistedAttachments.find((att) => {
        if (!att.mimetype.startsWith(`${kind}/`)) return false;
        const attRaw = attUrlOf(att.filename);
        let attPath: string;
        try { attPath = new URL(attRaw, window.location.origin).pathname; } catch { attPath = attRaw; }
        return attPath === mediaPath;
      }) ?? null;
    };
    const videoAtt = videoEl?.currentSrc ? matchAttByUrl(videoEl.currentSrc, 'video') : null;
    const audioAtt = audioEl?.currentSrc ? matchAttByUrl(audioEl.currentSrc, 'audio') : null;

    const items = buildMessageMenuItems({
      message,
      selectedText,
      previousMessageId,
      imageUrl,
      stickerSource,
      stickerName,
      sourceUrl,
      videoUrl: videoAtt ? attUrlOf(videoAtt.filename) : null,
      videoFilename: videoAtt ? videoAtt.originalName : null,
      videoSize: videoAtt ? videoAtt.size : null,
      audioUrl: audioAtt ? attUrlOf(audioAtt.filename) : null,
      audioFilename: audioAtt ? audioAtt.originalName : null,
      audioSize: audioAtt ? audioAtt.size : null,
      isAuthor,
      isDm: isDmMessage,
      canAddReactions,
      canSendMessages,
      canManageMessages,
      onReply: startReply,
      onEdit: startEditing,
      onDelete: () => deleteMessage(message.id, channelKey),
      onReaction: (emoji: string) => toggleReaction(emoji),
      onOpenEmojiPicker: () => {
        // Close the context menu, then show the reaction picker at the row
        useContextMenuStore.getState().close();
        setReactionPicker('row');
      },
      onMarkUnread: (msgId: string) => markUnread(channelKey, msgId),
    });

    if (items.length === 0) return;
    useContextMenuStore.getState().open(menuPositionFor(e), items);
  };

  const handleEditSubmit = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editContent.trim()) {
        await editMessage(message.id, editContent.trim(), channelKey);
        setEditingMessage(null);
      }
    }
    if (e.key === 'Escape') {
      stopEditing();
    }
  };

  // Display identity: the user's own messages, from any instance, show their
  // session row; anyone else's go through the userViews cache so a stale copy
  // shows the best-known profile. `displayOrigin` issued the row shown.
  const displayIdentity = isAuthor && currentUser
    ? currentUser
    : (_rawMsgUser ? _canonicalMsgUser : message.user);
  const displayOrigin = isAuthor && currentUser ? '' : messageOrigin;

  const spaces = useSpaceStore((s) => s.spaces);
  const currentSpaceId = useSpaceStore((s) => s.currentSpaceId);
  const ownerId = spaces.find(s => s.id === currentSpaceId)?.ownerId;

  // The author's row in the space's roster: it gives the name colour and the
  // nickname. message.userId is the id on the space's instance, the id the
  // loaded member list carries. A DM has no roster.
  const spaceMemberOf = (userId: string) => (isDmMessage ? undefined : members.find(m => m.userId === userId));
  const displayName = spaceMemberName(spaceMemberOf(message.userId), displayIdentity);

  // A role colour belongs to the space and is drawn as given; without one the
  // name takes the primary text colour from its class.
  const getMemberDisplayColor = (userId: string): React.CSSProperties | undefined => {
    if (isDmMessage) return undefined;
    const member = spaceMemberOf(userId);
    const color = memberNameColor(member ?? { userId, roles: [] }, ownerId);
    return color ? { color } : undefined;
  };

  const roleColor = getMemberDisplayColor(message.userId);

  // A space message's author is a member of the space it was posted in; the
  // profile opened from it shows their roles there. message.userId is the id
  // on the space's instance, the same id the loaded member list carries.
  const authorMember = !isDmMessage && currentSpaceId
    ? { spaceId: currentSpaceId, userId: message.userId }
    : undefined;

  const handleAuthorMenu = useAuthorMenu({
    channelId: channelKey,
    authorId: message.userId,
    origin: messageOrigin,
    isDm: isDmMessage,
    canSend: canSendMessages && !isDeadDmThread && !pending,
    isAuthor,
  });

  const handleUsernameClick = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (!message.user) return;
    e.stopPropagation();
    openUserProfile(message.user, messageOrigin, e.currentTarget.getBoundingClientRect(), undefined, authorMember);
  };

  // The name is the author's keyboard stop (the avatar beside it opens the
  // same card and menu, so it stays out of the tab order): Enter and Space
  // open the profile card like a click, and the menu key or Shift+F10 open
  // the author menu like a right click.
  const handleUsernameKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleUsernameClick(e);
    } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      handleAuthorMenu(e);
    }
  };

  const replyRoleColor = (msg: { userId: string }) => getMemberDisplayColor(msg.userId);

  // Mention highlighting, by the rule the alert uses (`messageMentions`): a
  // `<@id>` token for my id on the channel's origin, not my home id (#332),
  // or a mass mention the space's instance stamped that reaches me
  // (`@everyone`, `@here`, a role I hold there). Tokens inside code are not
  // mentions (the shared scan in utils/mentionTokens.ts). A pending message
  // has no stamps yet.
  const stamped = isPendingMessage(message) ? undefined : message;
  const isMentioned = mentionsReader({
    myId: selfIdHere,
    myRoleIds: myRoleIdsHere,
    content: message.content,
    mentionEveryone: stamped?.mentionEveryone,
    mentionRoleIds: stamped?.mentionRoleIds,
  });

  const content = (
    <div
      ref={rowRef}
      id={`msg-${message.id}`}
      role="article"
      aria-label={t('chat:message.rowLabel', { author: displayName, time: formatMessageTimestamp(t, fmt, message.createdAt) })}
      className={`group relative flex gap-4 px-5 py-[3px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-tone/60 ${isFirstInGroup || message.replyTo ? 'mt-[1.0625rem]' : ''} ${
        isMentioned
          ? 'bg-accent-secondary/[0.08] border-l-2 border-l-accent-secondary hover:bg-accent-secondary/[0.12]'
          : 'hover:bg-interactive-hover'
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        if (confirmingDelete) {
          clearTimeout(confirmDeleteTimeout.current);
          confirmDeleteTimeout.current = setTimeout(() => setConfirmingDelete(false), 2000);
        }
      }}
    >
      {/* Reply Line */}
      {message.replyTo && (
        <div className="absolute left-[40px] top-[-14px] w-[30px] h-[22px] border-l-2 border-t-2 border-interactive-muted rounded-tl opacity-60" />
      )}

      {/* Avatar or timestamp column */}
      <div className="w-10 flex-shrink-0 flex items-start justify-start">
        {isFirstInGroup || message.replyTo ? (
          <div className="mt-0.5 relative" data-poke-user={message.userId} onContextMenu={handleAuthorMenu}>
            <ProfileAvatar
              src={displayIdentity.avatar}
              name={displayName}
              size={40}
              user={displayIdentity}
              origin={displayOrigin}
              member={authorMember}
              className="hover:drop-shadow-md transition-all active:translate-y-[1px]"
            />
          </div>
        ) : (
          <span className="text-2xs leading-[21px] text-txt-tertiary tabular-nums opacity-0 group-hover:opacity-100 select-none w-full text-right whitespace-nowrap">
            {formatHoverTime(message.createdAt)}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {message.replyTo && (() => {
          const replyTo = message.replyTo;
          const replyIdentity = isMine(replyTo.user, messageOrigin, self) && currentUser
            ? currentUser
            : (_rawReplyUser ? _canonicalReplyUser : replyTo.user);
          const replyDisplayName = spaceMemberName(spaceMemberOf(replyTo.userId), replyIdentity);
          const preview = (
            <>
              <Avatar src={replyIdentity.avatar} name={replyDisplayName} size={16} user={replyIdentity} />
              <PersonName
                name={replyDisplayName}
                person={replyIdentity}
                className="text-sm font-semibold text-txt-primary"
                style={replyRoleColor(replyTo)}
              />
              <span className="text-sm text-txt-message truncate max-w-[400px] group-hover/reply:text-txt-primary transition-colors">
                {replyTo.content ? <InlineMessageText content={replyTo.content} channelId={mentionChannelId} /> : ''}
              </span>
            </>
          );
          // Outside a message list (no jump handle) the preview stays inert.
          if (!jumpToMessage) {
            return <div className="flex items-center gap-1 mb-1 ml-[-4px] opacity-80 min-w-0">{preview}</div>;
          }
          return (
            <button
              type="button"
              onClick={() => jumpToMessage(replyTo.id)}
              className="group/reply flex items-center gap-1 max-w-full min-w-0 mb-1 ml-[-8px] pl-1 pr-1.5 rounded text-left opacity-80 hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-tone/60 transition-opacity cursor-pointer"
            >
              <span className="sr-only">{t('chat:message.reply.jump')}</span>
              {preview}
            </button>
          );
        })()}

        {(isFirstInGroup || message.replyTo) && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span
              role="button"
              tabIndex={0}
              onClick={handleUsernameClick}
              onContextMenu={handleAuthorMenu}
              onKeyDown={handleUsernameKeyDown}
              className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-tone/60"
            >
              <PersonName
                name={displayName}
                person={displayIdentity}
                className="text-sm font-semibold text-txt-primary cursor-pointer hover:underline leading-tight"
                style={roleColor}
              />
            </span>
            <span className="text-2xs text-txt-tertiary tabular-nums leading-tight hover:cursor-default">
              {formatMessageTimestamp(t, fmt, message.createdAt)}
            </span>
          </div>
        )}

        {isEditing ? (
          <div className="mt-1 w-full">
            <textarea
              ref={editTextareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleEditSubmit}
              className="input-standard w-full p-3 rounded-lg resize-none text-sm leading-[21px]"
              rows={2}
              autoFocus
            />
            <p className="text-xs text-txt-tertiary mt-1.5 ml-1">
              <Trans
                t={t}
                i18nKey="chat:message.edit.hint"
                components={{ // i18n-check: allow-literal (the next line is an object key after a JSX element, not text)
                  cancel: <button onClick={stopEditing} className="text-txt-link hover:underline" />,
                  save: (
                    <button
                      onClick={() => {
                        if (editContent.trim()) {
                          editMessage(message.id, editContent.trim(), channelKey);
                          setEditingMessage(null);
                        }
                      }}
                      className="text-txt-link hover:underline"
                    />
                  ),
                }}
              />
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {isGifOnly ? (
              <div className="mt-1 max-w-[400px]">
                <img
                  src={message.content!.trim()}
                  alt={t('chat:message.gifAlt')}
                  className="max-w-full max-h-[300px] rounded-xl"
                  loading="lazy"
                />
              </div>
            ) : imageEmbedSourceUrl ? (
              <>
                {/* URL text suppressed — embeds render the image */}
                {message.embeds && message.embeds.length > 0 && (
                  <div className="flex flex-col gap-2 mt-1">
                    {message.embeds.map((embed) => (
                      <EmbedRenderer key={embed.id} embed={embed} />
                    ))}
                  </div>
                )}
                {message.editedAt && (
                  <span className="text-2xs text-txt-tertiary select-none font-medium">{t('chat:message.edited')}</span>
                )}
              </>
            ) : (
              <>
                {message.content && (
                  <div className="text-txt-message text-sm leading-[21px] break-words whitespace-pre-wrap selection:bg-accent-tone/30">
                    {isSticker
                      ? <StickerMessage token={message.content} />
                      : <MarkdownRenderer content={message.content} channelId={mentionChannelId} />}
                    {message.editedAt && (
                      <span className="text-2xs text-txt-tertiary ml-1 select-none font-medium">{t('chat:message.edited')}</span>
                    )}
                  </div>
                )}

                {/* Embeds */}
                {!isEditing && !isSticker && message.embeds && message.embeds.length > 0 && (
                  <div className="flex flex-col gap-2 mt-1">
                    {message.embeds.map((embed) => (
                      <EmbedRenderer key={embed.id} embed={embed} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Attachments */}
            {message.attachments && message.attachments.length > 0 && (
              <div className="mt-1 grid gap-2">
                {message.attachments.map((att) => {
                  const pendingAtt = att as PendingAttachmentView;
                  if (pending && pendingAtt.__transferId) {
                    return <PendingAttachmentTile key={att.id} transferId={pendingAtt.__transferId} />;
                  }
                  return <AttachmentRenderer key={att.id} attachment={att} />;
                })}
              </div>
            )}

            {/* Failed-state retry/discard row */}
            {showRetryDiscardRow && pending && (
              <div className="mt-2 inline-flex items-center self-start gap-2 px-2.5 py-1.5 rounded-lg bg-status-danger/10">
                <span className="flex items-center gap-1.5 text-2xs font-medium text-status-danger">
                  <Icon name="circle-alert" size="xs" />
                  {t('chat:message.upload.failed')}
                </span>
                <span className="w-px h-3.5 bg-status-danger/25" aria-hidden="true" />
                {canRetry && (
                  <button
                    onClick={async () => {
                      const transfers = useTransferStore.getState().transfers;
                      const retryIds = pending.transferIds.filter((tid) => {
                        const s = transfers.get(tid)?.state;
                        return s === 'failed' || s === 'aborted';
                      });
                      // Flip the bubble back to 'sending' first so the orchestrator
                      // re-evaluates after the resumed transfers complete.
                      usePendingMessageStore.getState().markSending(pending.clientId);
                      for (const tid of retryIds) {
                        await useTransferStore.getState().resumeUpload(tid);
                      }
                    }}
                    className="px-2 py-0.5 rounded text-2xs font-medium text-status-ok bg-status-ok/10 hover:bg-status-ok/20 transition-colors duration-fast"
                  >
                    {t('common:actions.retry')}
                  </button>
                )}
                <button
                  onClick={() => {
                    const transfers = useTransferStore.getState().transfers;
                    for (const tid of pending.transferIds) {
                      const t = transfers.get(tid);
                      if (!t) continue;
                      // Route anything with potential server-side state (active/paused/
                      // queued/failed) through abortUpload — it sends DELETE so the
                      // .tus session doesn't sit on disk for the janitor to sweep.
                      // 'aborted' already cleaned itself; 'completed' has a finalized
                      // attachment row that the unlinked-attachment janitor handles (1h grace).
                      if (t.state !== 'aborted' && t.state !== 'completed') {
                        useTransferStore.getState().abortUpload(tid);
                      }
                      useTransferStore.getState().remove(tid);
                    }
                    if (channelKey) {
                      usePendingMessageStore.getState().removeByClientId(channelKey, pending.clientId);
                    }
                  }}
                  className="px-2 py-0.5 rounded text-2xs font-medium text-txt-secondary bg-surface-channel/50 hover:bg-status-danger/15 hover:text-status-danger transition-colors duration-fast"
                >
                  {t('chat:message.upload.discard')}
                </button>
              </div>
            )}

            {/* Reactions */}
            {showInteractions && reactionGroups.size > 0 && (
              <div className="flex flex-wrap gap-1">
                {[...reactionGroups].map(([emoji, reactions]) => (
                  <ReactionPill
                    key={emoji}
                    emoji={emoji}
                    reactions={reactions}
                    origin={messageOrigin}
                    onToggle={() => toggleReaction(emoji)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reactions retain the upstream mobile sheet and row/button anchor semantics. */}
      {showInteractions && reactionPicker && canAddReactions && isMobile && (
        <MobilePickerSheet onClose={closeReactionPicker} label={t('common:actions.addReaction')}>
          <EmojiPicker onEmojiSelect={handleReactionEmojiSelect} mobile />
        </MobilePickerSheet>
      )}
      {showInteractions && reactionPicker && canAddReactions && !isMobile && (
        <ReactionPickerPopover
          anchorEl={reactionPicker === 'button' ? reactionPickerBtnRef.current : rowRef.current}
          onEmojiSelect={handleReactionEmojiSelect}
          onClose={closeReactionPicker}
        />
      )}

      {/* Action buttons on hover */}
      {showInteractions && (isHovered || reactionPicker === 'button' || confirmingDelete) && !isEditing && (
        <div className="absolute -top-[18px] right-4 z-raised flex items-center gap-0.5 p-0.5 glass rounded-lg">
          {canAddReactions && (
            <div className="flex items-center gap-0.5 pr-0.5 mr-0.5 border-r border-border-soft">
              {['👍', '❤️', '😂', '😮'].map(emoji => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(emoji)}
                  className="grid place-items-center h-7 w-7 rounded-lg text-base leading-none hover:bg-interactive-hover transition-[background-color,transform] duration-fast ease-out active:scale-[0.92]"
                >
                  {emoji}
                </button>
              ))}
              <IconButton
                ref={reactionPickerBtnRef}
                icon="smile"
                size="sm"
                label={t('common:actions.addReaction')}
                onClick={() => setReactionPicker((v) => (v ? null : 'button'))}
                className={showReactionPicker ? 'bg-interactive-active !text-accent-tone' : undefined}
              />
            </div>
          )}
          <IconButton icon="reply" size="sm" label={t('common:actions.reply')} onClick={startReply} />
          {canEdit && (
            <IconButton icon="pencil" size="sm" label={t('common:actions.edit')} onClick={startEditing} />
          )}
          {canDelete && (
            <button
              onClick={() => {
                if (confirmingDelete) {
                  cancelDeleteConfirm();
                  deleteMessage(message.id, channelKey);
                } else {
                  startDeleteConfirm();
                }
              }}
              className={`relative grid place-items-center h-7 w-7 rounded-lg transition-[background-color,color,transform] duration-fast ease-out active:scale-[0.92] ${
                confirmingDelete
                  ? 'bg-status-ok/20 text-status-ok'
                  : 'text-txt-secondary hover:text-status-danger hover:bg-status-danger/10'
              }`}
              title={confirmingDelete ? t('chat:message.actions.confirmDelete') : t('common:actions.delete')}
            >
              {/* Trash icon */}
              <span
                className={`absolute inset-0 grid place-items-center transition-[transform,opacity] duration-fast ease-out ${
                  confirmingDelete ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
                }`}
              >
                <Icon name="trash-2" size="sm" />
              </span>
              {/* Checkmark icon */}
              <span
                className={`absolute inset-0 grid place-items-center transition-[transform,opacity] duration-fast ease-out ${
                  confirmingDelete ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                }`}
              >
                <Icon name="check" size="sm" />
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div data-context-menu onContextMenu={handleContextMenu}>
      {content}
    </div>
  );
}
