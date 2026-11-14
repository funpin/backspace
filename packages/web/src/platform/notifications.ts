import { isElectron } from './platform';
import type { TrayState } from '../utils/trayState';

export interface NotificationOptions {
  channelId?: string;
  spaceId?: string;
  userId?: string;
}

const clicks = new EventTarget();

/** One subscription per mounted controller, including older desktop bridges. */
export function onNotificationClick(callback: (options: NotificationOptions) => void): () => void {
  const handler = (event: Event) => callback((event as CustomEvent<NotificationOptions>).detail);
  clicks.addEventListener('click', handler);
  const unsubscribe = window.backspace?.onNotificationClick?.(callback);
  return () => {
    clicks.removeEventListener('click', handler);
    unsubscribe?.();
  };
}

export function sendNotification(title: string, body: string, options?: NotificationOptions): void {
  if (isElectron()) {
    window.backspace!.showNotification(title, body, options);
  } else if ('Notification' in window && Notification.permission === 'granted') {
    const notification = new Notification(title, { body, icon: '/icons/icon-192.png' });
    notification.onclick = () => {
      window.focus();
      notification.close();
      if (options) clicks.dispatchEvent(new CustomEvent('click', { detail: options }));
    };
  }
}

export function requestNotificationPermission(): Promise<boolean> {
  if (isElectron()) return Promise.resolve(true);
  if (!('Notification' in window)) return Promise.resolve(false);
  return Notification.requestPermission().then((p) => p === 'granted');
}

export function updateBadgeCount(count: number): void {
  if (isElectron()) {
    window.backspace!.setBadgeCount(count);
  }
}

/** The character in the desktop tray. Older desktop builds lack the bridge method; they keep the idle icon. */
export function updateTrayState(state: TrayState): void {
  if (isElectron()) {
    window.backspace?.setTrayState?.(state);
  }
}
