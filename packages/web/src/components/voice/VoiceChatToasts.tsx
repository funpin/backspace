import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MessageWithUser } from '@backspace/shared';
import { Avatar } from '../ui/Avatar';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';
import { useSelfIdInChannel } from '../../utils/channelUser';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { parseFederatedUsername } from '../../utils/identity';
import { getChannelOrigin } from '../../stores/spaceStore';

/** How long a message stays on screen. */
export const CHAT_TOAST_MS = 6000;
/** More than this at once and the oldest gives way: a busy chat must not cover the picture. */
export const MAX_CHAT_TOASTS = 3;
/** How far behind this client's clock a server's may run and its messages still count as new. */
const CLOCK_SKEW_ALLOWANCE_MS = 120_000;
/** Clearance above the call's control bar, px. */
const BASE_BOTTOM = 96;
const EMPTY: readonly MessageWithUser[] = [];

/**
 * Which of `messages` are news for someone watching the call: written by
 * someone else, by a person (not a system line), since `since`, and not shown
 * yet. A channel's history loading in later is older than `since` and stays out.
 */
export function freshMessages(
  messages: readonly MessageWithUser[],
  seen: ReadonlySet<string>,
  selfId: string | undefined,
  since: number,
): MessageWithUser[] {
  return messages.filter((message) =>
    !seen.has(message.id)
    && !message.id.startsWith('temp_')
    && message.type !== 'system'
    && message.userId !== selfId
    && message.createdAt >= since);
}

function ChatToast({ message, origin, onOpen, onDismiss }: {
  message: MessageWithUser;
  origin: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation(['voice', 'common']);
  const author = useCanonicalUserView(message.user, origin);
  const name = author.displayName ?? parseFederatedUsername(author.username).baseName;
  const text = message.content?.trim()
    || (message.attachments.length > 0 ? t('voice:chatToast.attachment', { count: message.attachments.length }) : '');
  return (
    <div
      data-testid="voice-chat-toast"
      className="voice-chat-toast glass rounded-xl w-[280px] max-w-full flex items-start gap-2.5 p-2.5 pr-1.5 pointer-events-auto"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex items-start gap-2.5 min-w-0 flex-1 text-left"
        title={t('voice:chatToast.open')}
      >
        <Avatar src={author.avatar} name={name} size={28} userId={author.homeUserId ?? author.id} user={author} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-txt-primary truncate">{name}</span>
          <span className="block text-[13px] leading-snug text-txt-secondary line-clamp-2 break-words">{text}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="w-6 h-6 flex-shrink-0 flex items-center justify-center rounded text-txt-tertiary hover:text-txt-primary transition-colors"
        aria-label={t('voice:chatToast.dismiss')}
        title={t('voice:chatToast.dismiss')}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M18.4 4L12 10.4L5.6 4L4 5.6L10.4 12L4 18.4L5.6 20L12 13.6L18.4 20L20 18.4L13.6 12L20 5.6L18.4 4Z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Messages written in the call's text chat, shown over the grid while the
 * chat panel is not on screen (closed, or hidden by voice fullscreen), so a
 * viewer does not have to keep the panel open to notice them.
 *
 * They stack in the bottom-right corner above the control bar. A corner inset
 * (someone's camera over their share) may sit in that corner too: the stack
 * then starts above it rather than on top of it.
 */
export function VoiceChatToasts({ channelId }: { channelId: string | null }) {
  const messages = useChatStore((s) => (channelId ? s.messages.get(channelId) : undefined)) ?? EMPTY;
  const chatOpen = useUIStore((s) => s.voiceChatOpen);
  const fullscreen = useUIStore((s) => s.voiceFullscreen);
  const selfId = useSelfIdInChannel(channelId ?? '');
  const origin = channelId ? getChannelOrigin(channelId) : '';
  const panelVisible = chatOpen && !fullscreen;

  const [toasts, setToasts] = useState<MessageWithUser[]>([]);
  const [bottom, setBottom] = useState(BASE_BOTTOM);
  const seen = useRef(new Set<string>());
  const since = useRef(Date.now() - CLOCK_SKEW_ALLOWANCE_MS);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const rootRef = useRef<HTMLDivElement>(null);

  const dismiss = (id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  // Another call's chat: start over, and nothing already in it is news.
  useEffect(() => {
    // Whatever the chat already holds is not news, whatever its timestamp says.
    const present = channelId ? useChatStore.getState().messages.get(channelId) ?? EMPTY : EMPTY;
    seen.current = new Set(present.map((message) => message.id));
    // The server stamps messages with its own clock: allow for one that runs behind this one.
    since.current = Date.now() - CLOCK_SKEW_ALLOWANCE_MS;
    setToasts([]);
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, [channelId]);

  useEffect(() => {
    const fresh = freshMessages(messages, seen.current, selfId, since.current);
    for (const message of messages) seen.current.add(message.id);
    // With the panel on screen the message is already in front of the viewer.
    if (fresh.length === 0 || panelVisible) return;
    setToasts((current) => [...current, ...fresh].slice(-MAX_CHAT_TOASTS));
    for (const message of fresh) {
      timers.current.set(message.id, setTimeout(() => dismiss(message.id), CHAT_TOAST_MS));
    }
  }, [messages, selfId, panelVisible]);

  // The panel came on screen: what the toasts said is now in it.
  useEffect(() => {
    if (panelVisible) setToasts([]);
  }, [panelVisible]);

  // Start above a corner inset that occupies the same corner.
  const shown = toasts.length > 0;
  useLayoutEffect(() => {
    if (!shown) return;
    const root = rootRef.current;
    const container = root?.offsetParent;
    if (!root || !container) return;
    const measure = () => {
      const bounds = container.getBoundingClientRect();
      let next = BASE_BOTTOM;
      for (const inset of container.querySelectorAll('[data-testid="tile-inset"]')) {
        const box = inset.getBoundingClientRect();
        const inCorner = box.right > bounds.right - 320 && box.bottom > bounds.bottom - 320;
        if (inCorner) next = Math.max(next, Math.round(bounds.bottom - box.top) + 8);
      }
      setBottom(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
    // Re-measured as the stack grows: an inset may have appeared since the first toast.
  }, [shown, toasts.length]);

  if (!shown) return null;

  const openChat = () => {
    const ui = useUIStore.getState();
    // The panel is not drawn in fullscreen, so opening it means leaving fullscreen.
    if (ui.voiceFullscreen) ui.setVoiceFullscreen(false);
    if (!ui.voiceChatOpen) ui.toggleVoiceChat();
  };

  return (
    <div
      ref={rootRef}
      data-testid="voice-chat-toasts"
      aria-live="polite"
      style={{ bottom }}
      className="absolute right-4 z-20 flex flex-col items-end gap-2 max-w-[calc(100%-2rem)] pointer-events-none transition-[bottom] duration-200"
    >
      {toasts.map((message) => (
        <ChatToast
          key={message.id}
          message={message}
          origin={origin}
          onOpen={openChat}
          onDismiss={() => dismiss(message.id)}
        />
      ))}
    </div>
  );
}
