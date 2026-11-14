import { layoutRect, layoutPixels } from '../../platform/interfaceScale';
import React, { useEffect, useLayoutEffect, useRef, useCallback, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  useContextMenuStore,
  filterMenuItems,
  type ContextMenuItem,
  type ContextMenuCheckbox,
  type ContextMenuLeafItem,
  type ContextMenuSubmenu,
} from '../../stores/contextMenuStore';
import { useUIStore } from '../../stores/uiStore';
import { usePortalContainer } from '../../hooks/usePortalContainer';
import { Icon } from './Icon';

// ── Desktop item button ──────────────────────────────────────────────────────

// An item the arrow keys moved to looks like a hovered one.
const ITEM_SHAPE =
  'w-full text-left h-[34px] px-2 mx-1.5 text-sm rounded-lg flex items-center gap-2 outline-none transition-colors duration-fast';
const ITEM_CLASS =
  `${ITEM_SHAPE} text-txt-secondary hover:bg-interactive-hover hover:text-txt-primary focus-visible:bg-interactive-hover focus-visible:text-txt-primary`;
const ITEM_DANGER_CLASS =
  `${ITEM_SHAPE} text-status-danger hover:bg-status-danger/10 focus-visible:bg-status-danger/10`;
const ITEM_DISABLED_CLASS =
  `${ITEM_SHAPE} text-txt-secondary opacity-40 cursor-default`;
const ITEM_STYLE: React.CSSProperties = { width: 'calc(100% - 12px)' };

// ── Mobile item button ───────────────────────────────────────────────────────

const MOBILE_ITEM_CLASS = 'w-full text-left min-h-11 px-5 py-3 text-sm flex items-center gap-3 active:bg-interactive-active';

// ── Checkbox indicator ───────────────────────────────────────────────────────

function CheckboxIndicator({ checked }: { checked: boolean }) {
  return (
    <div
      className={`w-4 h-4 rounded border flex items-center justify-center transition-colors duration-fast ${
        checked ? 'bg-accent-primary border-accent-primary text-on-accent' : 'border-txt-tertiary'
      }`}
    >
      {checked && <Icon name="check" size="xs" />}
    </div>
  );
}

// ── Reactive checkbox wrapper ───────────────────────────────────────────────

interface ReactiveCheckboxItemProps {
  item: ContextMenuCheckbox;
  isMobile?: boolean;
}

const checkboxEnabled = () => false;

function ReactiveCheckboxItem({ item, isMobile }: ReactiveCheckboxItemProps) {
  const checked = useSyncExternalStore(item.subscribe, item.getChecked);
  const disabled = useSyncExternalStore(item.subscribe, item.getDisabled ?? checkboxEnabled);

  const className = isMobile
    ? `${MOBILE_ITEM_CLASS} text-txt-primary disabled:opacity-50`
    : disabled ? ITEM_DISABLED_CLASS : ITEM_CLASS;

  return (
    <button
      type="button"
      className={className}
      style={isMobile ? undefined : ITEM_STYLE}
      role="menuitemcheckbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        item.onChange(!checked);
      }}
    >
      <span className="flex-1">{item.label}</span>
      <CheckboxIndicator checked={checked} />
    </button>
  );
}

// Flyouts are portals: handle activation here instead of letting it bubble to
// the parent menu, whose DOM does not contain the focused checkbox.
function handleMenuNavigation(event: React.KeyboardEvent, container: HTMLElement | null): void {
  if (!container) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    event.stopPropagation();
    const focused = document.activeElement;
    if (focused instanceof HTMLButtonElement && container.contains(focused)) focused.click();
    return;
  }
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const delta = event.key === 'ArrowDown' ? 1 : -1;
  const next = index < 0 && delta > 0 ? 0 : (Math.max(index, 0) + delta + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

// ── Desktop submenu flyout ───────────────────────────────────────────────────

/**
 * Keeps the browser's own menu from opening over ours. Chromium fires a
 * `contextmenu` event on keyup of the Menu key, after our keydown has already
 * opened the menu and moved focus into it, so that event lands on the panel.
 * A right-click on the panel lands here too.
 */
function suppressNativeMenu(event: React.MouseEvent): void {
  event.preventDefault();
}

interface SubmenuFlyoutProps {
  submenu: ContextMenuSubmenu;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  close: () => void;
}

function SubmenuFlyout({ submenu, triggerRef, onMouseEnter, onMouseLeave, close }: SubmenuFlyoutProps) {
  const flyoutRef = useRef<HTMLDivElement>(null);
  const portalContainer = usePortalContainer();
  const filteredChildren = filterMenuItems(submenu.children);

  useLayoutEffect(() => {
    const flyout = flyoutRef.current;
    const trigger = triggerRef.current;
    if (!flyout || !trigger) return;

    const tRect = layoutRect(trigger.getBoundingClientRect());
    const fRect = layoutRect(flyout.getBoundingClientRect());
    const gap = 4;

    let left = tRect.right + gap;
    if (left + fRect.width > layoutPixels(window.innerWidth)) {
      left = tRect.left - fRect.width - gap;
    }
    if (left < 8) left = 8;

    let top = tRect.top;
    if (top + fRect.height > layoutPixels(window.innerHeight) - 8) {
      top = layoutPixels(window.innerHeight) - fRect.height - 8;
    }
    if (top < 8) top = 8;

    flyout.style.left = `${left}px`;
    flyout.style.top = `${top}px`;
  }, [triggerRef]);

  useEffect(() => {
    // Keyboard-opened flyouts receive focus; hovering must not steal it.
    if (document.activeElement === triggerRef.current) {
      flyoutRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    }
  }, [triggerRef]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (['Escape', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      useContextMenuStore.getState().setOpenSubmenu(null);
      triggerRef.current?.focus();
      return;
    }
    handleMenuNavigation(event, flyoutRef.current);

  };

  if (filteredChildren.length === 0) return null;

  return createPortal(
    <div
      ref={flyoutRef}
      role="menu"
      aria-label={submenu.label}
      onKeyDown={handleKeyDown}
      onContextMenu={suppressNativeMenu}
      className="fixed z-popover glass rounded-xl py-1.5 min-w-[160px] overflow-y-auto scrollbar-thin animate-fade-in"
      style={{ left: -9999, top: -9999 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {filteredChildren.map((child) => (
        <DesktopLeafItem key={child.key} item={child} close={close} />
      ))}
    </div>,
    portalContainer,
  );
}

// ── Desktop leaf item ────────────────────────────────────────────────────────

interface DesktopLeafItemProps {
  item: ContextMenuLeafItem;
  close: () => void;
}

function DesktopLeafItem({ item, close }: DesktopLeafItemProps) {
  switch (item.type) {
    case 'separator':
      return <div role="separator" className="h-px bg-border-hard my-1 mx-1.5" />; // i18n-check: allow-literal (the check reads the following `case` as JSX text)

    case 'custom':
      return <div role="group">{item.render(close)}</div>; // i18n-check: allow-literal (the check reads the following `case` as JSX text)

    case 'checkbox':
      return <ReactiveCheckboxItem item={item} />;

    case 'action': {
      const className = item.disabled
        ? ITEM_DISABLED_CLASS
        : item.danger
          ? ITEM_DANGER_CLASS
          : ITEM_CLASS;
      return (
        <button
          type="button"
          role="menuitem"
          className={className}
          style={ITEM_STYLE}
          disabled={item.disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (item.disabled) return;
            item.onClick();
            close();
          }}
        >
          {item.icon && <span className="w-4 h-4">{item.icon}</span>}
          {item.label}
        </button>
      );
    }
  }
}

// ── Desktop submenu trigger item ─────────────────────────────────────────────

interface DesktopSubmenuItemProps {
  item: ContextMenuSubmenu;
  close: () => void;
}

function DesktopSubmenuItem({ item, close }: DesktopSubmenuItemProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSubmenuKey = useContextMenuStore((s) => s.openSubmenuKey);
  const setOpenSubmenu = useContextMenuStore((s) => s.setOpenSubmenu);
  const isOpen = openSubmenuKey === item.key;

  const cancelTimers = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);

  const handleTriggerEnter = useCallback(() => {
    cancelTimers();
    openTimer.current = setTimeout(() => {
      setOpenSubmenu(item.key);
    }, 150);
  }, [cancelTimers, setOpenSubmenu, item.key]);

  const handleTriggerLeave = useCallback(() => {
    cancelTimers();
    closeTimer.current = setTimeout(() => {
      setOpenSubmenu(null);
    }, 150);
  }, [cancelTimers, setOpenSubmenu]);

  const handleFlyoutEnter = useCallback(() => {
    cancelTimers();
  }, [cancelTimers]);

  const handleFlyoutLeave = useCallback(() => {
    cancelTimers();
    closeTimer.current = setTimeout(() => {
      setOpenSubmenu(null);
    }, 150);
  }, [cancelTimers, setOpenSubmenu]);

  useEffect(() => {
    return () => {
      cancelTimers();
    };
  }, [cancelTimers]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setOpenSubmenu(isOpen ? null : item.key)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowRight') return;
          event.preventDefault();
          event.stopPropagation();
          setOpenSubmenu(item.key);
        }}
        className={ITEM_CLASS}
        style={ITEM_STYLE}
        onMouseEnter={handleTriggerEnter}
        onMouseLeave={handleTriggerLeave}
      >
        {item.icon && <span className="w-4 h-4">{item.icon}</span>}
        <span className="flex-1">{item.label}</span>
        <span className="text-txt-tertiary ml-auto"><Icon name="chevron-right" size="sm" /></span>
      </button>
      {isOpen && (
        <SubmenuFlyout
          submenu={item}
          triggerRef={triggerRef}
          onMouseEnter={handleFlyoutEnter}
          onMouseLeave={handleFlyoutLeave}
          close={close}
        />
      )}
    </>
  );
}

// ── Desktop menu item dispatcher ─────────────────────────────────────────────

interface DesktopMenuItemProps {
  item: ContextMenuItem;
  close: () => void;
}

function DesktopMenuItem({ item, close }: DesktopMenuItemProps) {
  if (item.type === 'submenu') {
    return <DesktopSubmenuItem item={item} close={close} />;
  }
  return <DesktopLeafItem item={item} close={close} />;
}

// ── Desktop menu panel ───────────────────────────────────────────────────────

interface DesktopMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number };
  close: () => void;
  closeGuard: boolean;
}

function DesktopMenu({ items, position, close, closeGuard }: DesktopMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const portalContainer = usePortalContainer();

  // Viewport-aware positioning via direct DOM mutation
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = layoutRect(el.getBoundingClientRect());
    let x = layoutPixels(position.x);
    let y = layoutPixels(position.y);
    if (x + rect.width > layoutPixels(window.innerWidth) - 8) x = layoutPixels(window.innerWidth) - rect.width - 8;
    if (y + rect.height > layoutPixels(window.innerHeight) - 8) y = layoutPixels(window.innerHeight) - rect.height - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [position]);

  // Auto-focus on mount for keyboard nav. The element focused before (the row
  // a keyboard user opened the menu from) gets focus back when the menu
  // closes, unless an action moved focus elsewhere, such as a dialog it opened.
  // Read during the first render, before the menu takes focus: an effect
  // that runs twice (React's development checks) would otherwise record the
  // menu itself.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(() => {
    menuRef.current?.focus();
    return () => {
      const active = document.activeElement;
      if (opener?.isConnected && (!active || active === document.body)) opener.focus();
    };
  }, [opener]);

  // Dismiss on scroll/resize
  useEffect(() => {
    const dismiss = () => close();
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [close]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'ArrowLeft') {
      event.preventDefault();
      if (useContextMenuStore.getState().openSubmenuKey) {
        useContextMenuStore.getState().setOpenSubmenu(null);
      } else if (event.key === 'Escape') {
        close();
      }
      return;
    }
    handleMenuNavigation(event, menuRef.current);
  }, [close]);

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-popover"
        onMouseDown={(e) => {
          if (!closeGuard) {
            close();
          }
        }}
        onContextMenu={(e) => {
          // Prevent browser context menu but do NOT stopPropagation.
          // This allows right-clicks to reach underlying elements that may
          // open a new context menu via their own onContextMenu handler.
          e.preventDefault();
        }}
      />
      {/* Menu panel */}
      <div
        ref={menuRef}
        role="menu"
        tabIndex={-1}
        className="fixed z-popover min-w-[180px] py-1.5 glass rounded-xl animate-fade-in max-h-[calc(calc(100*var(--app-vh))-16px)] overflow-y-auto scrollbar-thin outline-none"
        style={{ left: position.x, top: position.y }}
        onKeyDown={handleKeyDown}
        onContextMenu={suppressNativeMenu}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((item) => (
          <DesktopMenuItem key={item.key} item={item} close={close} />
        ))}
      </div>
    </>,
    portalContainer,
  );
}

// ── Mobile leaf item ─────────────────────────────────────────────────────────

interface MobileLeafItemProps {
  item: ContextMenuLeafItem;
  close: () => void;
}

function MobileLeafItem({ item, close }: MobileLeafItemProps) {
  switch (item.type) {
    case 'separator':
      return <div role="separator" className="h-px bg-border-hard my-1 mx-1.5" />; // i18n-check: allow-literal (the check reads the following `case` as JSX text)

    case 'custom':
      return <div role="group">{item.render(close)}</div>; // i18n-check: allow-literal (the check reads the following `case` as JSX text)

    case 'checkbox':
      return <ReactiveCheckboxItem item={item} isMobile />;

    case 'action': {
      const colorClass = item.danger ? 'text-status-danger' : 'text-txt-primary';
      return (
        <button
          type="button"
          role="menuitem"
          className={`${MOBILE_ITEM_CLASS} ${colorClass} ${item.disabled ? 'opacity-50' : ''}`}
          disabled={item.disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (item.disabled) return;
            item.onClick();
            close();
          }}
        >
          {item.icon && <span className="w-5 h-5">{item.icon}</span>}
          {item.label}
        </button>
      );
    }
  }
}

// ── Mobile bottom sheet menu ─────────────────────────────────────────────────

interface MobileMenuProps {
  items: ContextMenuItem[];
  close: () => void;
}

function MobileMenu({ items, close }: MobileMenuProps) {
  const { t } = useTranslation('common');
  const [submenuStack, setSubmenuStack] = useState<ContextMenuSubmenu | null>(null);
  const portalContainer = usePortalContainer();

  // Dismiss on scroll/resize
  useEffect(() => {
    const dismiss = () => close();
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [close]);

  // Determine what items to render: root or submenu
  const currentItems: ReadonlyArray<ContextMenuLeafItem | ContextMenuItem> = submenuStack
    ? filterMenuItems(submenuStack.children)
    : items;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-modal bg-surface-overlay" onClick={close} />
      {/* Bottom sheet */}
      <div
        role="menu"
        aria-label={submenuStack?.label}
        className="fixed bottom-0 left-0 right-0 z-modal rounded-t-2xl glass-bubble animate-slide-up-sheet"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
      >
        <div aria-hidden="true" className="w-10 h-1 bg-txt-tertiary/30 rounded-full mx-auto mt-2 mb-1" />
        {/* Back button for submenu */}
        {submenuStack && (
          <button
            type="button"
            role="menuitem"
            className={`${MOBILE_ITEM_CLASS} text-txt-secondary`}
            onClick={() => setSubmenuStack(null)}
          >
            <Icon name="arrow-left" size="md" />
            <span>{t('actions.back')}</span>
          </button>
        )}
        <div role="none" className="py-1">
          {currentItems.map((item) => {
            if (item.type === 'submenu') {
              // Render submenu trigger as a button that switches sheet content
              const colorClass = 'text-txt-primary';
              return (
                <button
                  key={item.key}
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  className={`${MOBILE_ITEM_CLASS} ${colorClass}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubmenuStack(item);
                  }}
                >
                  {item.icon && <span className="w-5 h-5">{item.icon}</span>}
                  <span className="flex-1">{item.label}</span>
                  <span className="text-txt-tertiary"><Icon name="chevron-right" size="sm" /></span>
                </button>
              );
            }
            return <MobileLeafItem key={item.key} item={item as ContextMenuLeafItem} close={close} />;
          })}
        </div>
      </div>
    </>,
    portalContainer,
  );
}

// ── Global long-press → contextmenu for mobile ──────────────────────────────

/**
 * Adds document-level touch listeners that detect long-press (500ms hold,
 * < 10px movement) and dispatch a synthetic `contextmenu` event on the
 * touched element. This allows ALL existing onContextMenu handlers to work
 * on touch devices without per-component changes.
 */
function useGlobalLongPress(isMobile: boolean) {
  useEffect(() => {
    if (!isMobile) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    let originX = 0;
    let originY = 0;
    let fired = false;
    let activeTarget: EventTarget | null = null;

    const cancel = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      // NOTE: Do NOT call e.preventDefault() here — it kills the synthesized
      // click event on mobile (touchstart → touchend → click chain).
      // Text selection prevention is handled by CSS user-select: none on
      // [data-context-menu] elements (see globals.css).
      if (e.touches.length !== 1) { cancel(); return; }
      const touch = e.touches[0]!;
      originX = touch.clientX;
      originY = touch.clientY;
      fired = false;
      activeTarget = e.target;

      timer = setTimeout(() => {
        timer = null;
        fired = true;
        // Clear any native text selection that started during the hold
        window.getSelection()?.removeAllRanges();
        // Dispatch synthetic contextmenu on the original target.
        // React's event delegation picks it up and fires onContextMenu handlers.
        const syntheticEvent = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: originX,
          clientY: originY,
          screenX: originX,
          screenY: originY,
        });
        if (activeTarget) {
          activeTarget.dispatchEvent(syntheticEvent);
        }
      }, 500);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (timer === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      if (Math.hypot(touch.clientX - originX, touch.clientY - originY) > 10) cancel();
    };

    const onTouchEnd = () => {
      cancel();
      if (fired) {
        const suppressClick = (ev: MouseEvent) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        document.addEventListener('click', suppressClick, { capture: true, once: true });
        setTimeout(() => {
          document.removeEventListener('click', suppressClick, { capture: true });
        }, 500);
        fired = false;
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      cancel();
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [isMobile]);
}

// ── Main renderer ────────────────────────────────────────────────────────────

export function ContextMenuRenderer() {
  const menu = useContextMenuStore((s) => s.menu);
  const close = useContextMenuStore((s) => s.close);
  const closeGuard = useContextMenuStore((s) => s.closeGuard);
  const isMobile = useUIStore((s) => s.isMobile);

  // Global long-press detection — enables context menus on all touch targets
  useGlobalLongPress(isMobile);

  if (!menu) return null;

  const filteredItems = filterMenuItems(menu.items);
  if (filteredItems.length === 0) return null;

  if (isMobile) {
    return <MobileMenu items={filteredItems} close={close} />;
  }

  return (
    <DesktopMenu
      items={filteredItems}
      position={menu.position}
      close={close}
      closeGuard={closeGuard}
    />
  );
}
