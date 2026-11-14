import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MessageWithUser } from '@backspace/shared';
import { CHAT_TOAST_MS, MAX_CHAT_TOASTS, VoiceChatToasts, freshMessages } from './VoiceChatToasts';
import { useChatStore } from '../../stores/chatStore';
import { useUIStore } from '../../stores/uiStore';

vi.mock('../../audio/AudioManager', () => ({
  AudioManager: { getInstance: () => ({ playSound: vi.fn() }) },
}));
vi.mock('../../utils/channelUser', () => ({ useSelfIdInChannel: () => 'me' }));

function message(id: string, userId: string, content: string, extra: Partial<MessageWithUser> = {}): MessageWithUser {
  return {
    id,
    channelId: 'voice-1',
    userId,
    replyToId: null,
    content,
    editedAt: null,
    createdAt: Date.now() + 1000, // a server clock a little ahead of this one
    attachments: [],
    embeds: [],
    reactions: [],
    user: { id: userId, username: userId, displayName: null, avatar: null } as MessageWithUser['user'],
    ...extra,
  } as MessageWithUser;
}

const say = (m: MessageWithUser) => act(() => useChatStore.getState().addMessage('voice-1', m));

beforeEach(() => {
  useChatStore.setState({ messages: new Map() });
  useUIStore.setState({ voiceChatOpen: false, voiceFullscreen: false });
});

describe('freshMessages', () => {
  it('keeps only other people\'s new messages', () => {
    const since = 1000;
    const all = [
      message('old', 'bob', 'history', { createdAt: 500 }),
      message('mine', 'me', 'my own', { createdAt: 2000 }),
      message('temp_1', 'bob', 'optimistic', { createdAt: 2000 }),
      message('sys', 'bob', 'joined', { createdAt: 2000, type: 'system' }),
      message('seen', 'bob', 'shown already', { createdAt: 2000 }),
      message('new', 'bob', 'hello', { createdAt: 2000 }),
    ];

    expect(freshMessages(all, new Set(['seen']), 'me', since).map((m) => m.id)).toEqual(['new']);
  });
});

describe('VoiceChatToasts', () => {
  it('shows a message from someone else, not the viewer\'s own, and not what was there before', () => {
    useChatStore.getState().addMessage('voice-1', message('before', 'bob', 'earlier'));
    render(<VoiceChatToasts channelId="voice-1" />);
    expect(screen.queryByTestId('voice-chat-toast')).toBeNull();

    say(message('m1', 'me', 'my own line'));
    expect(screen.queryByTestId('voice-chat-toast')).toBeNull();

    say(message('m2', 'bob', 'look at line 42'));
    expect(screen.getByTestId('voice-chat-toast')).toHaveTextContent('look at line 42');
    expect(screen.getByTestId('voice-chat-toast')).toHaveTextContent('bob');
  });

  it('stays quiet while the chat panel is on screen, and speaks up in fullscreen where it is hidden', () => {
    useUIStore.setState({ voiceChatOpen: true });
    render(<VoiceChatToasts channelId="voice-1" />);

    say(message('m1', 'bob', 'first'));
    expect(screen.queryByTestId('voice-chat-toast')).toBeNull();

    act(() => useUIStore.setState({ voiceFullscreen: true }));
    say(message('m2', 'bob', 'second'));
    expect(screen.getByTestId('voice-chat-toast')).toHaveTextContent('second');
  });

  it('keeps at most a few on screen and lets each one go after a while', () => {
    vi.useFakeTimers();
    try {
      render(<VoiceChatToasts channelId="voice-1" />);
      for (let i = 0; i < MAX_CHAT_TOASTS + 2; i++) say(message(`m${i}`, 'bob', `line ${i}`));

      const shown = screen.getAllByTestId('voice-chat-toast');
      expect(shown).toHaveLength(MAX_CHAT_TOASTS);
      expect(shown[shown.length - 1]).toHaveTextContent(`line ${MAX_CHAT_TOASTS + 1}`);

      act(() => { vi.advanceTimersByTime(CHAT_TOAST_MS + 100); });
      expect(screen.queryByTestId('voice-chat-toast')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the chat when pressed, leaving fullscreen to do so', async () => {
    useUIStore.setState({ voiceFullscreen: true });
    render(<VoiceChatToasts channelId="voice-1" />);
    say(message('m1', 'bob', 'come see'));

    await userEvent.click(screen.getByTitle(/open the chat/i));

    expect(useUIStore.getState().voiceChatOpen).toBe(true);
    expect(useUIStore.getState().voiceFullscreen).toBe(false);
    expect(screen.queryByTestId('voice-chat-toast')).toBeNull();
  });

  it('names an attachment when the message has no text', () => {
    render(<VoiceChatToasts channelId="voice-1" />);
    say(message('m1', 'bob', '', { content: null, attachments: [{ id: 'a' }] as MessageWithUser['attachments'] }));

    expect(screen.getByTestId('voice-chat-toast')).toHaveTextContent(/attachment/i);
  });
});
