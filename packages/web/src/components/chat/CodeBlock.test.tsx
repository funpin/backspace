import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CODE_COLLAPSE_AFTER_LINES, CODE_COLLAPSED_LINES, CodeBlock } from './CodeBlock';

function linesOf(count: number): string {
  return Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n');
}

describe('CodeBlock', () => {
  it('shows a short block whole, with no toggle', () => {
    const { container } = render(<CodeBlock language="text" code={linesOf(CODE_COLLAPSE_AFTER_LINES)} />);
    expect(container.querySelector('pre')?.textContent).toContain(`line ${CODE_COLLAPSE_AFTER_LINES}`);
    expect(container.querySelector('[aria-expanded]')).toBeNull();
  });

  it('collapses a long block and opens it on request', () => {
    const total = CODE_COLLAPSE_AFTER_LINES + 5;
    const { container } = render(<CodeBlock language="text" code={linesOf(total)} />);
    const pre = container.querySelector('pre')!;
    expect(pre.textContent).toContain(`line ${CODE_COLLAPSED_LINES}`);
    expect(pre.textContent).not.toContain(`line ${CODE_COLLAPSED_LINES + 1}`);

    const toggle = container.querySelector('[aria-expanded]')!;
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.textContent).toContain(String(total));
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('pre')!.textContent).toContain(`line ${total}`);
  });

  it('labels a block with no hint by its detected language', () => {
    render(<CodeBlock language="text" code={'{\n  "port": 3000\n}'} />);
    expect(screen.getByText('json')).toBeInTheDocument();
  });

  it('leaves undetected text without a language label and shows a title', () => {
    render(<CodeBlock language="text" code="just some words here" title="pasted.txt" />);
    expect(screen.getByText('pasted.txt')).toBeInTheDocument();
    expect(screen.queryByText('text')).toBeNull();
  });
});
