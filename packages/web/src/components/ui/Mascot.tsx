import { useId, type JSX } from 'react';
import { EYES_STANDARD, MARK_BODY, MARK_HEAD, MARK_SCREEN } from '../brand/markGeometry';

/**
 * The B:SPACE character: the logo's letter B made of two replies, with
 * eyes. Each state is a pose plus a looping motion, all in CSS
 * (`.mascot--<state>` in styles/globals.css), so the system's reduced-motion
 * setting and the Appearance switch (html[data-motion="off"]) stop it like
 * every other animation and it rests on its final, readable frame.
 *
 * The eyes are cut out of the head through a mask, so the surface behind
 * shows through them on any background and they can still move.
 */
export const MASCOT_STATES = ['idle', 'look', 'notify', 'typing', 'voice', 'screen', 'joy', 'dnd', 'offline'] as const;

export type MascotState = (typeof MASCOT_STATES)[number];

interface MascotProps {
  state: MascotState;
  className?: string;
}

const [LEFT, RIGHT] = EYES_STANDARD;

function Eyes({ state }: { state: MascotState }): JSX.Element {
  if (state === 'joy') {
    return (
      <>
        {[LEFT, RIGHT].map((e) => (
          <path key={e.cx} d={`M${e.cx - 4.4} ${e.cy + 2}Q${e.cx} ${e.cy - 5.6} ${e.cx + 4.4} ${e.cy + 2}`} fill="none" stroke="black" strokeWidth={3} strokeLinecap="round" />
        ))}
      </>
    );
  }
  if (state === 'offline') {
    return (
      <>
        {[LEFT, RIGHT].map((e) => (
          <path key={e.cx} d={`M${e.cx - 3.2} ${e.cy - 3.2}L${e.cx + 3.2} ${e.cy + 3.2}M${e.cx + 3.2} ${e.cy - 3.2}L${e.cx - 3.2} ${e.cy + 3.2}`} stroke="black" strokeWidth={2.6} strokeLinecap="round" />
        ))}
      </>
    );
  }
  if (state === 'dnd') {
    return (
      <>
        {[LEFT, RIGHT].map((e) => (
          <rect key={e.cx} x={e.cx - e.rx - 0.4} y={e.cy} width={2 * e.rx + 0.8} height={2.6} rx={1.3} fill="black" />
        ))}
      </>
    );
  }
  return (
    <>
      {[LEFT, RIGHT].map((e) => (
        <ellipse key={e.cx} className="mascot-eye" cx={e.cx} cy={e.cy} rx={e.rx} ry={e.ry} fill="black" />
      ))}
    </>
  );
}

export function Mascot({ state, className }: MascotProps): JSX.Element {
  const uid = useId().replace(/:/g, '');
  const faceMask = `mascot-face-${uid}`;
  const ringMask = `mascot-ring-${uid}`;
  const offline = state === 'offline';

  return (
    <div role="presentation" className={`relative ${className ?? 'w-32 h-32'}`} data-mascot-state={state}>
      <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" className={`mascot mascot--${state}`}>
        <defs>
          {/* White keeps the head, black cuts it: the eyes, and room around the unread dot. */}
          <mask id={faceMask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
            <rect width="100" height="100" fill="white" />
            <g className="mascot-eyes">
              <Eyes state={state} />
            </g>
            {state === 'notify' && <circle className="mascot-badge" cx="77" cy="13" r="11" fill="black" />}
          </mask>
          {state === 'voice' && (
            <mask id={ringMask} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
              <rect width="100" height="100" fill="white" />
              <path d={MARK_BODY} fill="black" stroke="black" strokeWidth={5} strokeLinejoin="round" />
            </mask>
          )}
        </defs>
        <g className="mascot-all">
          {state === 'voice' && (
            <path className="mascot-ring stroke-status-ok" d={MARK_BODY} fill="none" strokeWidth={11} strokeLinejoin="round" mask={`url(#${ringMask})`} />
          )}
          <path
            className={`mascot-body ${offline ? 'fill-status-offline' : 'fill-accent-primary'}`}
            d={state === 'screen' ? `${MARK_BODY}${MARK_SCREEN}` : MARK_BODY}
            fillRule="evenodd"
          />
          {state === 'screen' && (
            <>
              <rect className="mascot-glow fill-accent-tone" x="40" y="60" width="28" height="20" rx="3" />
              <circle className="mascot-live fill-status-danger" cx="46.5" cy="66.5" r="2.8" />
            </>
          )}
          {state === 'typing' && [42, 52, 62].map((cx) => (
            <circle key={cx} className="mascot-dot fill-txt-primary" cx={cx} cy="70.5" r="3.4" />
          ))}
          <path className={offline ? 'fill-txt-secondary' : 'fill-txt-primary'} d={MARK_HEAD} mask={`url(#${faceMask})`} />
        </g>
        {state === 'notify' && <circle className="mascot-badge fill-status-danger" cx="77" cy="13" r="8" />}
        {state === 'dnd' && (
          <path className="mascot-z stroke-txt-tertiary" d="M74 6h6l-6 7h6" fill="none" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </div>
  );
}
