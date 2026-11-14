import React from 'react';
import { Tooltip } from './Tooltip';

interface UsernameProps {
  username: string;
  showAt?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The globe that marks a person from another instance, sized to the text it
 * follows (0.85em). Callers wrap it in a `Tooltip` naming the full username.
 * Lucide's `globe`, drawn inline because `Icon` has fixed pixel sizes and this
 * one scales with the surrounding text.
 */
export function FederationGlobeIcon() {
  return (
    <svg
      width="0.85em"
      height="0.85em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-txt-tertiary flex-shrink-0 inline-block align-[-0.05em]"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

/**
 * A username as its owner's instance issued it: a bare handle ("kai") or a
 * federated one ("kai@orbit.example"), shown as the handle with a globe whose
 * tooltip is the full name. Only for usernames: a display name is free text
 * and may contain '@' itself, so callers render it as plain text.
 */
export function Username({ username, showAt, className, style }: UsernameProps) {
  const atIndex = username.indexOf('@');
  const prefix = showAt ? '@' : '';
  if (atIndex === -1) {
    return <span className={className} style={style}>{prefix}{username}</span>;
  }
  const name = username.slice(0, atIndex);
  return (
    <span className={`inline-flex items-center gap-0.5 ${className ?? ''}`} style={style}>
      {prefix}{name}
      <Tooltip content={`${prefix}${username}`} position="top">
        <FederationGlobeIcon />
      </Tooltip>
    </span>
  );
}
