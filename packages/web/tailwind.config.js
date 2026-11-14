/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      height: { screen: 'calc(100 * var(--app-vh))' },
      minHeight: { screen: 'calc(100 * var(--app-vh))' },
      colors: {
        // ── KAMEN TOKENS (docs/brand/brandbook.md) ──
        // RGB-channel variables enable Tailwind opacity modifiers (e.g. bg-accent-rose/10)
        surface: {
          base:     'rgb(var(--bg-base) / <alpha-value>)',
          channel:  'rgb(var(--bg-channel) / <alpha-value>)',
          chat:     'rgb(var(--bg-chat) / <alpha-value>)',
          members:  'rgb(var(--bg-members) / <alpha-value>)',
          elevated: 'rgb(var(--bg-elevated) / <alpha-value>)',
          input:    'rgb(var(--bg-input) / <alpha-value>)',
          overlay:  'var(--bg-overlay)',
        },
        border: {
          hard: 'rgb(var(--border-hard) / <alpha-value>)',
          soft: 'rgb(var(--border-soft) / <alpha-value>)',
        },
        accent: {
          mint:            'rgb(var(--accent-mint) / <alpha-value>)',
          peach:           'rgb(var(--accent-peach) / <alpha-value>)',
          lavender:        'rgb(var(--accent-lavender) / <alpha-value>)',
          sky:             'rgb(var(--accent-sky) / <alpha-value>)',
          amber:           'rgb(var(--accent-amber) / <alpha-value>)',
          rose:            'rgb(var(--accent-rose) / <alpha-value>)',
          coral:           'rgb(var(--accent-coral) / <alpha-value>)',
          primary:         'rgb(var(--accent-primary) / <alpha-value>)',
          'primary-hover': 'rgb(var(--accent-primary-hover) / <alpha-value>)',
          'primary-active':'rgb(var(--accent-primary-active) / <alpha-value>)',
          tone:            'rgb(var(--accent-tone) / <alpha-value>)',
          secondary:       'rgb(var(--accent-secondary) / <alpha-value>)',
        },
        // Text and icons on an accent fill; dark for the light fills (amber, mono).
        'on-accent': 'rgb(var(--on-accent) / <alpha-value>)',
        txt: {
          primary:   'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          tertiary:  'rgb(var(--text-tertiary) / <alpha-value>)',
          message:   'rgb(var(--text-message) / <alpha-value>)',
          link:      'rgb(var(--text-link) / <alpha-value>)',
          positive:  'rgb(var(--text-positive) / <alpha-value>)',
          warning:   'rgb(var(--text-warning) / <alpha-value>)',
          danger:    'rgb(var(--text-danger) / <alpha-value>)',
        },
        interactive: {
          hover:    'var(--interactive-hover)',
          active:   'var(--interactive-active)',
          selected: 'var(--interactive-selected)',
          muted:    'rgb(var(--interactive-muted) / <alpha-value>)',
        },
        status: {
          online:  'rgb(var(--status-online) / <alpha-value>)',
          idle:    'rgb(var(--status-idle) / <alpha-value>)',
          dnd:     'rgb(var(--status-dnd) / <alpha-value>)',
          offline: 'rgb(var(--status-offline) / <alpha-value>)',
          // Brandbook names for the same three: ok / warn / danger.
          ok:      'rgb(var(--status-online) / <alpha-value>)',
          warn:    'rgb(var(--status-idle) / <alpha-value>)',
          danger:  'rgb(var(--status-dnd) / <alpha-value>)',
        },
        glass: {
          bg:        'var(--glass-bg)',
          border:    'var(--glass-border)',
          highlight: 'var(--glass-highlight)',
        },
        notification: 'rgb(var(--notification) / <alpha-value>)',
      },
      // One radius scale (docs/brand/brandbook.md §6). Redefining Tailwind's own
      // steps retunes ~1000 existing classes without touching the markup:
      // rounded = 6 (tags), rounded-lg = 10 (buttons, fields, rows),
      // rounded-xl = 14 (tiles, cards, popovers), rounded-2xl = 16 (dialogs).
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
        '2xl': '16px',
        full: '9999px',
      },
      // Two steps the default scale lacks, and `lg` pulled to 16 for header
      // names. xs (12), sm (14, the body size) and base (16) keep their
      // Tailwind values, so nothing reflows from this block alone.
      fontSize: {
        '2xs': ['11px', '16px'],
        compact: ['13px', '18px'],
        lg: ['16px', '24px'],
      },
      // Named layers; `z-[…]` values in the markup map onto these as files
      // are touched.
      zIndex: {
        raised: '10',
        float: '20',
        popover: '200',
        // Same layer as popovers on purpose: overlays stack by portal order, so a
        // menu opened from inside a dialog is appended after it and draws above.
        modal: '200',
        toast: '400',
        confirm: '500',
      },
      transitionDuration: {
        fast: '120ms',
        base: '220ms',
        slow: '320ms',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        pop: 'cubic-bezier(0.3, 1.5, 0.55, 1)',
      },
      boxShadow: {
        'header': '0 1px 0 rgb(var(--border-hard))',
        'elevation-low': '0 1px 0 rgb(var(--border-hard))',
        'elevation-high': 'var(--glass-shadow)',
        'glass': 'var(--glass-shadow)',
        'input': 'none',
      },
      fontFamily: {
        sans: ['Onest', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      animation: {
        'slide-up-sheet': 'slide-up-sheet 200ms ease-out',
      },
      keyframes: {
        'slide-up-sheet': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [
    ({ addVariant }) => {
      addVariant('desktop', 'html[data-viewport="desktop"] &');
    },
  ],
};
