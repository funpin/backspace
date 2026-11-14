import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Highlight, themes } from 'prism-react-renderer';
import { IconButton } from '../ui/IconButton';
import { Icon } from '../ui/Icon';
import { Tag } from '../ui/Tag';
import { detectCodeLanguage } from './codeLanguage';

// One Dark token colours on the block's own ground: the frame draws the
// surface, so the highlighter paints no background of its own.
const codeTheme = {
  ...themes.oneDark,
  plain: {
    ...themes.oneDark.plain,
    backgroundColor: 'transparent',
    color: 'rgb(var(--text-message))',
  },
};

/**
 * A language's own label colour (docs/brand/brandbook.md §3.4). The colour
 * belongs to the language, not to the interface, so it stays the same under
 * every accent theme. Languages without one get the neutral label.
 */
const LANGUAGE_COLORS: Readonly<Record<string, string>> = {
  js: '#e8c44a',
  javascript: '#e8c44a',
  ts: '#6fb5ff',
  typescript: '#6fb5ff',
  json: '#7fd6a0',
};

/** How long the copy button shows its confirmation. */
const COPIED_FEEDBACK_MS = 1500;

/** A block longer than this starts collapsed. */
export const CODE_COLLAPSE_AFTER_LINES = 20;
/** How many lines a collapsed block shows. */
export const CODE_COLLAPSED_LINES = 12;

function CodeBlockCopyButton({ code }: { code: string }) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setCopied(false);
      }, COPIED_FEEDBACK_MS);
    }).catch(() => {
      // The clipboard is unavailable (insecure context or denied permission);
      // the button stays as it was so nothing claims a copy that did not happen.
    });
  };

  return (
    <IconButton
      icon={copied ? 'check' : 'copy'}
      label={copied ? t('actions.copied') : t('actions.copy')}
      size="sm"
      onClick={handleCopy}
    />
  );
}

const CODE_FRAME = 'mt-1 rounded-xl bg-surface-input shadow-[inset_0_0_0_1px_var(--glass-border)] overflow-hidden';
const CODE_PRE = 'px-3 pt-1 pb-2.5 text-compact font-mono overflow-x-auto';

export interface CodeBlockProps {
  /** A Prism grammar name, or 'text' when the author gave none. */
  language: string;
  code: string;
  /** Shown in the header in place of the language label's empty slot: a file name. */
  title?: string | undefined;
}

/**
 * A block of code in chat: a header with the language and a copy button, the
 * highlighted code, and a "show all" row when the block is long.
 *
 * - A block with no language hint ('text') is guessed by `detectCodeLanguage`;
 *   when nothing matches it renders as plain text with no label.
 * - A block longer than `CODE_COLLAPSE_AFTER_LINES` shows its first
 *   `CODE_COLLAPSED_LINES` lines until the reader opens it. Copy always takes
 *   the whole block.
 */
export function CodeBlock({ language, code, title }: CodeBlockProps) {
  const { t } = useTranslation(['chat']);
  const [expanded, setExpanded] = useState(false);

  const resolved = useMemo(
    () => (language === 'text' ? detectCodeLanguage(code) ?? 'text' : language),
    [language, code],
  );
  const lines = useMemo(() => code.split('\n'), [code]);
  const collapsible = lines.length > CODE_COLLAPSE_AFTER_LINES;
  const shown = collapsible && !expanded ? lines.slice(0, CODE_COLLAPSED_LINES).join('\n') : code;
  const color = LANGUAGE_COLORS[resolved.toLowerCase()];

  return (
    <div className={CODE_FRAME}>
      <div className="flex items-center justify-between gap-2 pl-3 pr-1 pt-1">
        <div className="flex items-center gap-2 min-w-0">
          {title && <span className="text-xs font-medium text-txt-secondary truncate">{title}</span>}
          {resolved !== 'text' && (color ? <Tag color={color}>{resolved}</Tag> : <Tag>{resolved}</Tag>)}
        </div>
        <CodeBlockCopyButton code={code} />
      </div>
      {resolved === 'text' ? (
        <pre className={`${CODE_PRE} whitespace-pre`}>
          <code>{shown}</code>
        </pre>
      ) : (
        <Highlight theme={codeTheme} code={shown} language={resolved}>
          {({ style, tokens, getLineProps, getTokenProps }) => (
            <pre className={CODE_PRE} style={{ ...style, margin: 0 }}>
              {tokens.map((line, i) => {
                const lineProps = getLineProps({ line });
                return (
                  <div key={i} {...lineProps} style={{ ...lineProps.style, minHeight: '18px' }}>
                    {line.map((token, key) => (
                      <span key={key} {...getTokenProps({ token })} />
                    ))}
                  </div>
                );
              })}
            </pre>
          )}
        </Highlight>
      )}
      {collapsible && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="w-full h-[34px] flex items-center justify-center gap-1.5 text-xs font-medium text-txt-secondary hover:text-txt-primary hover:bg-interactive-hover shadow-[inset_0_1px_0_var(--glass-border)] transition-colors duration-fast"
        >
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size="xs" />
          {expanded ? t('chat:code.collapse') : t('chat:code.showAll', { count: lines.length })}
        </button>
      )}
    </div>
  );
}

export const MemoizedCodeBlock = React.memo(CodeBlock);
