import { describe, expect, it } from 'vitest';
import { detectCodeLanguage, isPreviewableTextFile, languageOfFilename, PREVIEW_MAX_FILE_BYTES } from './codeLanguage';

describe('detectCodeLanguage', () => {
  it('proves JSON by parsing it', () => {
    expect(detectCodeLanguage('{\n  "name": "b-space",\n  "port": 3000\n}')).toBe('json');
    expect(detectCodeLanguage('{ name: "not json" }')).toBeNull();
  });

  it('recognises TypeScript by its type marks', () => {
    expect(detectCodeLanguage('interface User {\n  id: string;\n  age: number;\n}\nconst u = {} as unknown;')).toBe('typescript');
  });

  it('recognises JavaScript', () => {
    expect(detectCodeLanguage('const add = (a, b) => a + b;\nconsole.log(add(1, 2));\nfunction x() {}')).toBe('javascript');
  });

  it('recognises Python', () => {
    expect(detectCodeLanguage('import os\n\ndef main():\n    print(os.getcwd())\n\nif __name__ == "__main__":\n    main()')).toBe('python');
  });

  it('recognises Go, Rust, CSS and markup', () => {
    expect(detectCodeLanguage('package main\n\nfunc main() {\n\tx := 1\n}')).toBe('go');
    expect(detectCodeLanguage('use std::fmt;\n\nfn main() {\n    let mut x = 1;\n}')).toBe('rust');
    expect(detectCodeLanguage('.card {\n  color: red;\n  padding: 4px;\n}\n.card:hover {\n  color: blue;\n}')).toBe('css');
    expect(detectCodeLanguage('<div class="a">\n  <span>hi</span>\n</div>')).toBe('markup');
  });

  it('leaves prose and short snippets alone', () => {
    expect(detectCodeLanguage('Just a note to self: buy milk, then call the bank about the card.')).toBeNull();
    expect(detectCodeLanguage('x = 1')).toBeNull();
  });
});

describe('file helpers', () => {
  it('maps a file name to its grammar', () => {
    expect(languageOfFilename('server.TS')).toBe('typescript');
    expect(languageOfFilename('notes.txt')).toBe('text');
    expect(languageOfFilename('Makefile')).toBe('text');
  });

  it('previews small text files only', () => {
    expect(isPreviewableTextFile('pasted.txt', 'text/plain', 1200)).toBe(true);
    expect(isPreviewableTextFile('main.py', 'application/octet-stream', 1200)).toBe(true);
    expect(isPreviewableTextFile('unknown', 'text/plain', 1200)).toBe(true);
    expect(isPreviewableTextFile('big.log', 'text/plain', PREVIEW_MAX_FILE_BYTES + 1)).toBe(false);
    expect(isPreviewableTextFile('archive.zip', 'application/zip', 1200)).toBe(false);
    expect(isPreviewableTextFile('logo.svg', 'image/svg+xml', 1200)).toBe(false);
    expect(isPreviewableTextFile('empty.txt', 'text/plain', 0)).toBe(false);
  });
});
