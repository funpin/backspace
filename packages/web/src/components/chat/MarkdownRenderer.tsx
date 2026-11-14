import React, { createContext, useContext } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import { MemoizedCodeBlock } from './CodeBlock';
import { MassMentionBadge } from './MassMentionBadge';
import { MentionBadge } from './MentionBadge';
import { remarkEmojiShortcodes } from '../../utils/remarkEmojiShortcodes';
import { useEmojiShortcodeNames } from '../../utils/emojiShortcodes';
import { splitMentions } from '../../utils/mentionTokens';

// ─── Remark Plugin: Tag Bare Fenced Blocks ─────────────────────────────────
// react-markdown v9 removed the `inline` prop from <code>. Fenced blocks
// without a language hint have no className, making them indistinguishable
// from inline code. This plugin assigns `lang: 'text'` to bare fenced blocks
// so that `className="language-text"` is always present on block-level code.

interface MdastNode {
  type: string;
  lang?: string | null;
  children?: MdastNode[];
}

function remarkDefaultCodeLang() {
  return (tree: MdastNode) => {
    walkTree(tree);
  };
}

function walkTree(node: MdastNode) {
  if (node.type === 'code' && !node.lang) {
    node.lang = 'text';
  }
  if (node.children) {
    for (const child of node.children) {
      walkTree(child);
    }
  }
}

// ─── Pre-processing: Mention Tokens ─────────────────────────────────────────
// remark-parse mangles <@userId> (treats as autolink or escapes the angle
// brackets) before remark plugins can see the text nodes. We solve this by
// converting mention tokens to standard markdown links BEFORE the parser
// runs. The `a` component override then detects the mention:// scheme (a
// user) and the mass-mention:// scheme (`everyone`, `here`, or `&` and a role
// id). Code spans and fenced blocks are kept as-is by the shared token scan
// (utils/mentionTokens.ts), the same scan the reply preview, the mention
// highlight, the composer and the alert rule use.

function preprocessMentions(raw: string): string {
  return splitMentions(raw).map((part) => {
    switch (part.kind) {
      case 'text': return part.text;
      case 'user': return `[@${part.userId}](mention://${part.userId})`;
      case 'role': return `[@&${part.roleId}](mass-mention://&${part.roleId})`;
      case 'everyone': return `[@${part.keyword}](mass-mention://${part.keyword})`;
    }
  }).join('');
}

// ─── URL Transform: Allow mention:// Scheme ─────────────────────────────────
// react-markdown's defaultUrlTransform strips URLs with unknown protocols.
// Internal mention schemes reach the badge renderer; neither opens an external URL.

function urlTransform(url: string): string {
  if (url.startsWith('mention://') || url.startsWith('mass-mention://')) return url;
  return defaultUrlTransform(url);
}

// ─── Markdown Component Overrides ──────────────────────────────────────────

const REMARK_PLUGINS = [remarkGfm, remarkDefaultCodeLang, remarkEmojiShortcodes];

// ─── Mentions: Channel Context ─────────────────────────────────────────────
// The component overrides below are built once and shared by every message,
// so the channel a message belongs to reaches its mention badges through
// context rather than through the overrides.

const MentionChannelContext = createContext<string | null>(null);

/** A `mass-mention://` target: `everyone`, `here`, or `&` and a role id. */
function ChannelMassMentionBadge({ target }: { target: string }) {
  const channelId = useContext(MentionChannelContext);
  if (target.startsWith('&')) return <MassMentionBadge roleId={target.slice(1)} channelId={channelId} />;
  if (target === 'everyone' || target === 'here') return <MassMentionBadge keyword={target} channelId={channelId} />;
  return <>{'@' + target}</>;
}

function ChannelMentionBadge({ userId }: { userId: string }) {
  const channelId = useContext(MentionChannelContext);
  return <MentionBadge userId={userId} channelId={channelId} />;
}

function buildComponents(): Components {
  return {
    // Paragraphs → spans to avoid block nesting issues in chat messages
    p: ({ children }) => <span className="block">{children}</span>,

    // Links & Mentions
    // remark-parse autolinks <@userId> into mailto:@userId before plugins run,
    // so we intercept that pattern here instead of using a remark plugin.
    a: ({ href, children }) => {
      if (href?.startsWith('mass-mention://')) {
        return <ChannelMassMentionBadge target={href.slice('mass-mention://'.length)} />;
      }
      if (href?.startsWith('mention://')) {
        return <ChannelMentionBadge userId={href.slice('mention://'.length)} />;
      }
      const mentionMatch = href?.match(/^(?:mailto:)?@([a-zA-Z0-9_-]+)$/);
      if (mentionMatch) {
        return <ChannelMentionBadge userId={mentionMatch[1]!} />;
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-txt-link hover:underline"
        >
          {children}
        </a>
      );
    },

    // Fenced code blocks (have className from our remark plugin) vs inline code
    code: ({ className, children, ...rest }) => {
      const match = /language-(\w+)/.exec(className || '');
      if (match) {
        const code = String(children).replace(/\n$/, '');
        return <MemoizedCodeBlock language={match[1]!} code={code} />;
      }
      // Inline code
      return (
        <code
          className="rounded bg-surface-elevated px-1.5 py-px text-[12.5px] font-mono"
          {...rest}
        >
          {children}
        </code>
      );
    },

    // Override <pre> to be a minimal wrapper — the CodeBlock handles all styling
    pre: ({ children }) => <>{children}</>,

    // Bold / Italic / Strikethrough
    strong: ({ children }) => <strong className="font-semibold text-txt-primary">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => <del className="line-through text-txt-secondary">{children}</del>,

    // Blockquotes
    blockquote: ({ children }) => (
      <blockquote className="pl-3 border-l-[3px] border-interactive-muted my-0.5">
        {children}
      </blockquote>
    ),

    // Lists
    ul: ({ children }) => <ul className="list-disc pl-6 my-0.5 space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-6 my-0.5 space-y-0.5">{children}</ol>,
    li: ({ children }) => <li>{children}</li>,

    // Headings — Discord renders these with slightly larger/bolder text
    h1: ({ children }) => <div className="text-2xl font-semibold text-txt-primary mt-2 mb-1">{children}</div>,
    h2: ({ children }) => <div className="text-xl font-semibold text-txt-primary mt-2 mb-1">{children}</div>,
    h3: ({ children }) => <div className="text-lg font-semibold text-txt-primary mt-1 mb-0.5">{children}</div>,

    // Horizontal rules
    hr: () => <hr className="border-border-soft my-2" />,

    // Images (in markdown content — not attachments)
    img: ({ src, alt }) => (
      <div className="mt-1 max-w-[400px]">
        <img
          src={src}
          alt={alt ?? ''}
          className="max-w-full max-h-[300px] rounded-xl"
          loading="lazy"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
        />
      </div>
    ),

    // Tables (GFM)
    table: ({ children }) => (
      <div className="overflow-x-auto my-1">
        <table className="border-collapse text-sm">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="border-b border-border-soft">{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className="border-b border-border-soft">{children}</tr>,
    th: ({ children }) => <th className="px-3 py-1.5 text-left text-txt-primary font-semibold">{children}</th>,
    td: ({ children }) => <td className="px-3 py-1.5">{children}</td>,
  };
}

// Build once and reuse — the components object is static
const MARKDOWN_COMPONENTS = buildComponents();

// ─── Public Component ──────────────────────────────────────────────────────

interface MarkdownRendererProps {
  content: string;
  /**
   * The channel the content was written in; `<@id>` mentions resolve among
   * that channel's people (see `MentionBadge`). Omitted for text that belongs
   * to no channel, where a mention cannot be resolved.
   */
  channelId?: string | null;
}

export const MarkdownRenderer = React.memo(function MarkdownRenderer({ content, channelId = null }: MarkdownRendererProps) {
  useEmojiShortcodeNames();
  return (
    <MentionChannelContext.Provider value={channelId}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS} urlTransform={urlTransform}>
        {preprocessMentions(content)}
      </ReactMarkdown>
    </MentionChannelContext.Provider>
  );
});
