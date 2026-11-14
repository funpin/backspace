/**
 * The count badge on a sidebar icon: a space's unread messages or the DM
 * button's. The number is drawn for sight and `label` is read instead, so a
 * screen reader hears "12 unread messages" rather than "12". Above 99 it
 * draws "99+". A muted space keeps its count in a quieter colour
 * (sounds.md, "Notification settings").
 */
export function UnreadCountBadge({ count, label, muted = false }: { count: number; label: string; muted?: boolean }) {
  return (
    <span className="absolute -right-1 -top-1 z-raised pointer-events-none">
      <span
        aria-hidden="true"
        className={`block min-w-4 h-4 px-1 rounded-full text-2xs leading-4 font-semibold tabular-nums text-center ring-2 ring-surface-channel ${
          muted ? 'bg-interactive-muted text-txt-secondary' : 'bg-notification text-surface-base'
        }`}
      >
        {count > 99 ? '99+' : count}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
