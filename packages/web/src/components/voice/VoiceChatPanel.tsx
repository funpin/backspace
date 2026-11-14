import React from 'react';
import { useTranslation } from 'react-i18next';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { useUIStore } from '../../stores/uiStore';
import { IconButton } from '../ui/IconButton';

interface VoiceChatPanelProps {
  channelId: string;
  channelName: string;
}

export function VoiceChatPanel({ channelId, channelName }: VoiceChatPanelProps) {
  const { t } = useTranslation(['voice', 'common']);
  const toggleVoiceChat = useUIStore((s) => s.toggleVoiceChat);

  return (
    <div
      data-testid="voice-chat-panel"
      className="relative w-[340px] min-w-[280px] max-w-[42%] min-h-0 flex-shrink-0 overflow-hidden bg-surface-chat flex flex-col border-l border-border-soft"
    >
      {/* Chat header */}
      <div className="h-12 px-4 flex items-center justify-between shadow-header flex-shrink-0">
        <span className="font-semibold text-txt-primary text-lg">{t('voice:chatPanel.title')}</span>
        <IconButton
          size="sm"
          icon="x"
          onClick={toggleVoiceChat}
          label={t('voice:chatPanel.close')}
        />
      </div>

      {/* Messages */}
      <MessageList channelId={channelId} />

      {/* Input */}
      <MessageInput channelId={channelId} channelName={channelName} />
    </div>
  );
}
