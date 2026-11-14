/**
 * Language guessing for code shown in chat: a fenced block written without a
 * language hint, and a text file previewed from its attachment card.
 *
 * Every result is a grammar `prism-react-renderer` bundles, so a guess always
 * highlights. The detector is deliberately conservative: prose and unknown
 * code return null and render as plain text, because a wrong grammar colours
 * a block worse than no grammar does.
 */

/** File extension to grammar, for the languages the bundled Prism build knows. */
const EXTENSION_LANGUAGE: Readonly<Record<string, string>> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx',
  ts: 'typescript', mts: 'typescript', cts: 'typescript', tsx: 'tsx',
  json: 'json', py: 'python', go: 'go', rs: 'rust',
  c: 'cpp', h: 'cpp', cc: 'cpp', cpp: 'cpp', hpp: 'cpp',
  html: 'markup', htm: 'markup', xml: 'markup', svg: 'markup',
  css: 'css', yml: 'yaml', yaml: 'yaml', 'md': 'markdown',
  swift: 'swift', kt: 'kotlin', graphql: 'graphql', gql: 'graphql',
};

/** Extensions that are plain text with no grammar of their own. */
const PLAIN_TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  'txt', 'log', 'csv', 'tsv', 'ini', 'toml', 'env', 'conf', 'cfg', 'sh', 'bash', 'zsh',
  'sql', 'java', 'rb', 'php', 'lua', 'cs', 'diff', 'patch', 'gitignore', 'dockerfile',
]);

/** The largest text file a card offers to preview; larger ones only download. */
export const PREVIEW_MAX_FILE_BYTES = 512 * 1024;

function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return null;
  return name.slice(dot + 1).toLowerCase();
}

/** The grammar for a file name, or 'text' when the file has none. */
export function languageOfFilename(name: string): string {
  const extension = extensionOf(name);
  return (extension && EXTENSION_LANGUAGE[extension]) || 'text';
}

/** Whether an attachment is a text file small enough to preview in chat. */
export function isPreviewableTextFile(name: string, mimetype: string, size: number): boolean {
  if (size <= 0 || size > PREVIEW_MAX_FILE_BYTES) return false;
  const extension = extensionOf(name);
  if (extension && (extension in EXTENSION_LANGUAGE || PLAIN_TEXT_EXTENSIONS.has(extension))) {
    // An SVG is an image first; its card stays a download.
    return extension !== 'svg';
  }
  return mimetype.startsWith('text/') && mimetype !== 'text/html';
}

function countMatches(code: string, pattern: RegExp): number {
  return code.match(pattern)?.length ?? 0;
}

/**
 * Guesses the language of code that came without a hint. Returns null when
 * nothing matches clearly.
 */
export function detectCodeLanguage(code: string): string | null {
  const trimmed = code.trim();
  if (trimmed.length < 8) return null;

  // JSON: the one language that can be proven rather than guessed.
  if (/^[[{]/.test(trimmed) && /[\]}]$/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // Not JSON; an object literal or a block of code falls through.
    }
  }

  if (/^<(!doctype html|html|\?xml|svg|div|span|p|a|ul|section|head|body)\b/i.test(trimmed) && /<\/[a-z][\w-]*>\s*$/i.test(trimmed)) {
    return 'markup';
  }

  const python =
    countMatches(code, /^\s*(def|class) \w+.*:\s*$/gm) * 2 +
    countMatches(code, /^\s*(from [\w.]+ import |import [\w.]+\s*$)/gm) +
    countMatches(code, /^\s*(elif .*:|except.*:|if __name__ ==)/gm) * 2 +
    countMatches(code, /\b(self\.|print\(|None\b|True\b|False\b)/g);
  const typescript =
    countMatches(code, /^\s*(export )?(interface|type) \w+/gm) * 2 +
    countMatches(code, /:\s*(string|number|boolean|void|unknown|never)\b/g) +
    countMatches(code, /\bas (const|unknown|string|number)\b/g) * 2;
  const javascript =
    countMatches(code, /\b(const|let) \w+\s*=/g) +
    countMatches(code, /=>/g) +
    countMatches(code, /\b(function \w*\(|console\.\w+\(|require\(|module\.exports)/g) +
    countMatches(code, /^\s*(import .* from |export (default |const |function ))/gm) * 2;
  const go =
    countMatches(code, /^package \w+\s*$/gm) * 3 +
    countMatches(code, /^func (\(\w+ \*?\w+\) )?\w+\(/gm) * 2 +
    countMatches(code, /:=/g);
  const rust =
    countMatches(code, /^\s*(pub )?fn \w+/gm) * 2 +
    countMatches(code, /\blet mut \w+/g) * 2 +
    countMatches(code, /^\s*(use \w+(::\w+)+|impl\b|#\[derive)/gm) * 2;
  const css =
    countMatches(code, /^[.#@]?[\w-][\w\s.#:>,()-]*\{\s*$/gm) +
    countMatches(code, /^\s*[a-z-]+:\s*[^;{}]+;\s*$/gm);

  const scores: Array<[string, number]> = [
    ['python', python],
    ['go', go],
    ['rust', rust],
    // TypeScript is JavaScript with types: its own marks decide, the shared ones support.
    ['typescript', typescript > 0 ? typescript + javascript : 0],
    ['javascript', javascript],
    ['css', javascript === 0 && python === 0 ? css : 0],
  ];
  let best: [string, number] = ['', 0];
  for (const entry of scores) {
    if (entry[1] > best[1]) best = entry;
  }
  return best[1] >= 3 ? best[0] : null;
}
