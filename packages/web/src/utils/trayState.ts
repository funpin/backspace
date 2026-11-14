import type { ChosenUserStatus } from '@backspace/shared';
import type { HomeConnection } from '../stores/homeConnectionStore';

/**
 * The B:SPACE character in the desktop tray (menu bar on macOS, the
 * notification area on Windows). Must match TRAY_STATES in
 * packages/desktop/src/trayState.ts.
 */
export type TrayState = 'idle' | 'notify' | 'screen' | 'dnd' | 'offline';

export interface TrayInputs {
  homeConnection: HomeConnection;
  isScreenSharing: boolean;
  unreadCount: number;
  chosenStatus: ChosenUserStatus | null;
}

/**
 * One state wins, most urgent first: no connection to the server (nothing
 * else is trustworthy then), the user's own screen being shared (a privacy
 * reminder that must not be hidden by unread messages), unread messages,
 * then the user's own Do Not Disturb or Idle status.
 */
export function pickTrayState({ homeConnection, isScreenSharing, unreadCount, chosenStatus }: TrayInputs): TrayState {
  if (homeConnection === 'closed') return 'offline';
  if (isScreenSharing) return 'screen';
  if (unreadCount > 0) return 'notify';
  if (chosenStatus === 'dnd' || chosenStatus === 'idle') return 'dnd';
  return 'idle';
}
