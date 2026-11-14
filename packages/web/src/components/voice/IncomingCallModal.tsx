import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useVoiceStore } from '../../stores/voiceStore';
import { useSpaceStore } from '../../stores/spaceStore';
import { parseFederatedUsername } from '../../utils/identity';
import { sendDmCallReject } from '../../utils/dmCall';
import { acceptIncomingDmCall } from '../../utils/voiceActions';
import { useCanonicalUserView } from '../../utils/userViewLookup';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';
import type { User } from '@backspace/shared';

/**
 * Decline the call ringing in: the decline goes where the ring came from,
 * with the ids it came with, and only the ring's slot clears. A call the
 * client is in keeps its own ids and origin.
 */
function declineRing(): void {
  const { incomingCall, setIncomingCall } = useVoiceStore.getState();
  if (!incomingCall) return;
  sendDmCallReject(incomingCall);
  setIncomingCall(null);
}

export function IncomingCallModal() {
  const { t } = useTranslation(['voice', 'common']);
  const incomingCall = useVoiceStore((s) => s.incomingCall);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss after 30 seconds
  useEffect(() => {
    if (incomingCall) {
      // Auto-reject after timeout
      timerRef.current = setTimeout(declineRing, 30000);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [incomingCall]);

  const dmChannels = useSpaceStore((s) => s.dmChannels);

  const _FALLBACK_USER = { id: '', username: '', createdAt: 0, isAdmin: false, replicatedInstances: [] } as unknown as User;
  // Look up caller member before the early return so useCanonicalUserView is always called
  const _rawCallerMember = (() => {
    if (!incomingCall) return null;
    const dmChannel = dmChannels.find(d => d.id === incomingCall.dmChannelId);
    return dmChannel?.members.find(m => m.id === incomingCall.callerId) ?? null;
  })();
  const _callerOrigin = useSpaceStore((s) => (incomingCall?.dmChannelId ? s.channelOriginMap.get(incomingCall.dmChannelId) ?? '' : ''));
  const _canonicalCaller = useCanonicalUserView((_rawCallerMember as User | null) ?? _FALLBACK_USER, _callerOrigin);
  const callerMember = _rawCallerMember ? _canonicalCaller : null;

  if (!incomingCall) return null;

  const callerAvatarId = callerMember?.homeUserId ?? incomingCall.callerId;
  const { baseName: callerBaseName } = parseFederatedUsername(incomingCall.callerName);

  // Accepting arms the microphone and connects inside this tap (iOS needs
  // the gesture), and the call becomes active at once (`acceptIncomingDmCall`).
  const handleAccept = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    acceptIncomingDmCall();
  };

  const handleDecline = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    declineRing();
  };

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-surface-overlay" />

      {/* Call card */}
      <div className="relative glass-modal call-refraction rounded-2xl w-[340px] overflow-hidden animate-fade-in animate-slide-up">
        {/* Liquid ripple orbs — soft radial gradients with blur */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[0, 1.3, 2.6].map((delay, i) => (
            <div
              key={i}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[180px] h-[180px] rounded-full blur-xl animate-call-ripple"
              style={{
                animationDelay: `${delay}s`,
                background: 'radial-gradient(circle, rgb(var(--status-online) / 0.18) 0%, rgb(var(--status-online) / 0.06) 35%, rgb(var(--status-online) / 0.02) 55%, transparent 70%)',
              }}
            />
          ))}
        </div>

        {/* Content */}
        <div className="relative z-[2] p-8 flex flex-col items-center gap-4">
          {/* Caller avatar */}
          <div className="rounded-full animate-call-glow">
            <Avatar
              src={callerMember?.avatar}
              avatarColor={callerMember?.avatarColor}
              userId={callerAvatarId}
              name={callerBaseName}
              size={80}
            />
          </div>

          {/* Caller info */}
          <div className="text-center">
            <h3 className="text-xl font-semibold text-txt-primary">{callerBaseName}</h3>
            <p className="text-sm text-txt-secondary mt-1">{t('voice:incomingCall.status')}</p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-6 mt-2">
            {/* Decline */}
            <button
              type="button"
              onClick={handleDecline}
              className="w-14 h-14 rounded-full bg-status-danger/[0.14] text-status-danger flex items-center justify-center transition-[background-color,transform] duration-fast ease-out hover:bg-status-danger/25 active:scale-[0.96] group"
              title={t('common:actions.decline')}
            >
              <Icon name="phone-off" size="lg" className="group-hover:scale-110 transition-transform duration-fast" />
            </button>

            {/* Accept */}
            <button
              type="button"
              onClick={handleAccept}
              className="w-14 h-14 rounded-full bg-status-ok/[0.14] text-status-ok flex items-center justify-center transition-[background-color,transform] duration-fast ease-out hover:bg-status-ok/25 active:scale-[0.96] animate-call-button-glow group"
              title={t('common:actions.accept')}
            >
              <Icon name="phone" size="lg" className="group-hover:scale-110 transition-transform duration-fast" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
