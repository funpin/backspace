import React from 'react';
import { useUIStore } from '../../stores/uiStore';
import { Icon } from '../ui/Icon';

export function MobileNav() {
  const isMobile = useUIStore((s) => s.isMobile);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);

  if (!isMobile) return null;

  return (
    <>
      {/* Hamburger button in header */}
      <button
        onClick={toggleSidebar}
        className="fixed top-3 left-3 z-[120] p-2 rounded-lg bg-surface-channel text-txt-primary desktop:hidden"
      >
        <Icon name={sidebarOpen ? 'x' : 'menu'} size="lg" />
      </button>

      {/* Backdrop when sidebar is open on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-surface-overlay z-[35] desktop:hidden"
          onClick={toggleSidebar}
        />
      )}
    </>
  );
}
