import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Icon, ICON_NAMES } from './Icon';
import { Badge, Tag } from './Tag';
import { Field, Options, Progress, Tabs } from './Controls';

describe('Icon', () => {
  it('renders every registered name at the brandbook stroke', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg, name).not.toBeNull();
      expect(svg?.getAttribute('stroke-width'), name).toBe('1.75');
      unmount();
    }
  });

  it('is hidden from assistive technology unless it carries a label', () => {
    const { container, rerender } = render(<Icon name="mic" />);
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    rerender(<Icon name="mic" label="Microphone" />);
    expect(screen.getByRole('img', { name: 'Microphone' })).toBeInTheDocument();
  });

  it('maps the four sizes to 13, 15, 18 and 20 px', () => {
    const sizes = { xs: '13', sm: '15', md: '18', lg: '20' } as const;
    for (const [size, px] of Object.entries(sizes)) {
      const { container, unmount } = render(<Icon name="hash" size={size as keyof typeof sizes} />);
      expect(container.querySelector('svg')?.getAttribute('width')).toBe(px);
      unmount();
    }
  });
});

describe('Button', () => {
  it('is type="button" unless told otherwise, so it never submits a form by accident', () => {
    const { rerender } = render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
    rerender(<Button type="submit">Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'submit');
  });

  it('takes the theme text colour on the accent fill, not white', () => {
    render(<Button variant="primary">Create</Button>);
    const button = screen.getByRole('button', { name: 'Create' });
    expect(button.className).toContain('bg-accent-primary');
    expect(button.className).toContain('text-on-accent');
    expect(button.className).not.toContain('text-white');
  });

  it('blocks presses and reports busy while loading, keeping its label', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Saving</Button>);
    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('forwards presses and the ref', () => {
    const onClick = vi.fn();
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref} onClick={onClick} icon="plus">Add</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(ref.current).toBe(screen.getByRole('button', { name: 'Add' }));
  });
});

describe('IconButton', () => {
  it('names itself from the label, as accessible name and as title', () => {
    render(<IconButton icon="mic-off" label="Unmute" tone="off" />);
    const button = screen.getByRole('button', { name: 'Unmute' });
    expect(button).toHaveAttribute('title', 'Unmute');
    expect(button.className).toContain('text-status-danger');
  });

  it('drops the native title when a tooltip already names it', () => {
    render(<IconButton icon="settings" label="Settings" noTitle />);
    expect(screen.getByRole('button', { name: 'Settings' })).not.toHaveAttribute('title');
  });
});

describe('Tag and Badge', () => {
  it('draws a content colour as a tinted tag with a dot', () => {
    render(<Tag color="#6fb5ff">TypeScript</Tag>);
    const tag = screen.getByText('TypeScript');
    expect(tag.style.color).not.toBe('');
    expect(tag.querySelector('span')).not.toBeNull();
  });

  it('caps a count at 99+', () => {
    render(<Badge count={140} label="140 unread" />);
    expect(screen.getByLabelText('140 unread')).toHaveTextContent('99+');
  });

  it('renders a bare dot without a count', () => {
    render(<Badge label="Unread" />);
    expect(screen.getByRole('img', { name: 'Unread' })).toHaveTextContent('');
  });
});

describe('Field', () => {
  it('wires label, description and error to the control', () => {
    render(
      <Field label="Channel name" description="Lowercase, no spaces" error="No spaces allowed">
        {({ id, describedBy, invalid }) => <input id={id} aria-describedby={describedBy} aria-invalid={invalid} />}
      </Field>,
    );
    const input = screen.getByLabelText('Channel name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const described = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(described).toHaveLength(2);
    expect(screen.getByRole('alert')).toHaveTextContent('No spaces allowed');
  });
});

describe('Options and Tabs', () => {
  it('marks the chosen option and reports a new choice', () => {
    const onChange = vi.fn();
    render(<Options label="Frame rate" value={60} onChange={onChange} items={[{ value: 30, label: '30' }, { value: 60, label: '60' }]} />);
    expect(screen.getByRole('radio', { name: '60' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('radio', { name: '30' }));
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('does not report a disabled option and explains why it is off', () => {
    const onChange = vi.fn();
    render(<Options label="Resolution" value="720" onChange={onChange} items={[{ value: '720', label: '720p' }, { value: '1440', label: '1440p', disabled: true, disabledReason: 'The host allows up to 720p' }]} />);
    const off = screen.getByRole('radio', { name: '1440p' });
    expect(off).toHaveAttribute('title', 'The host allows up to 720p');
    fireEvent.click(off);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('switches tabs and shows counts', () => {
    const onChange = vi.fn();
    render(<Tabs label="Friends" value="online" onChange={onChange} items={[{ value: 'online', label: 'Online', count: 3 }, { value: 'all', label: 'All', count: 12 }]} />);
    expect(screen.getByRole('tab', { name: /Online/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /All/ }));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});

describe('Progress', () => {
  it('clamps the value into 0–100', () => {
    const { rerender } = render(<Progress value={0.62} label="Upload" />);
    expect(screen.getByRole('progressbar', { name: 'Upload' })).toHaveAttribute('aria-valuenow', '62');
    rerender(<Progress value={4} label="Upload" />);
    expect(screen.getByRole('progressbar', { name: 'Upload' })).toHaveAttribute('aria-valuenow', '100');
    rerender(<Progress value={-1} label="Upload" />);
    expect(screen.getByRole('progressbar', { name: 'Upload' })).toHaveAttribute('aria-valuenow', '0');
  });
});
