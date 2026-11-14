// Dev-only workbench for the shared primitives of the Kamen brandbook. Nothing
// in the app imports this file; `dev-ui-kit.html` is its only entry. Every
// variant, size and state of Button, IconButton, Icon, Tag, Badge, Card,
// Field, Options, Tabs, Progress and Toggle on one page, with the accent theme
// switchable so each can be judged in all six.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Icon, ICON_NAMES } from '../components/ui/Icon';
import { Badge, Tag } from '../components/ui/Tag';
import { Card, Field, Options, Progress, Tabs } from '../components/ui/Controls';
import { Toggle } from '../components/ui/Toggle';
import { ACCENT_THEMES, useAppearanceStore } from '../stores/appearanceStore';
import { initI18n } from '../i18n';
import { initializeInterfaceScale } from '../platform/interfaceScale';
import { initializeAppearance } from '../platform/appearance';
import '../styles/globals.css';

initializeInterfaceScale();
initializeAppearance();

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium text-txt-tertiary">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

function Kit() {
  const accent = useAppearanceStore(state => state.accent);
  const setAccent = useAppearanceStore(state => state.setAccent);
  const [fps, setFps] = useState<30 | 60>(60);
  const [tab, setTab] = useState<'online' | 'all' | 'requests'>('online');
  const [on, setOn] = useState(true);
  return (
    <div className="min-h-screen overflow-y-auto bg-surface-chat p-8 space-y-8 text-sm text-txt-message">
      <Tabs label="Accent theme" value={accent} onChange={setAccent} items={ACCENT_THEMES.map(theme => ({ value: theme.id, label: theme.id }))} />
      <Section title="Button: variants">
        <Button variant="primary">Create channel</Button>
        <Button variant="secondary">Open</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="danger">Leave space</Button>
        <Button variant="danger-solid">Delete</Button>
      </Section>
      <Section title="Button: sizes, icon, loading, disabled">
        <Button variant="primary" size="sm">Small</Button>
        <Button variant="primary" size="md">Medium</Button>
        <Button variant="primary" size="lg">Large</Button>
        <Button variant="primary" icon="screen-share">Start stream</Button>
        <Button variant="secondary" icon="download">Download</Button>
        <Button variant="primary" loading>Saving</Button>
        <Button variant="primary" disabled>Disabled</Button>
        <Button variant="secondary" disabled>Disabled</Button>
      </Section>
      <Section title="IconButton: tones and sizes">
        <IconButton icon="mic" label="Mute" />
        <IconButton icon="mic-off" label="Unmute" tone="off" />
        <IconButton icon="screen-share" label="Stop sharing" tone="on" />
        <IconButton icon="trash-2" label="Delete" tone="danger" />
        <IconButton icon="phone-off" label="Disconnect" tone="danger-solid" />
        <IconButton icon="settings" label="Settings" size="sm" />
        <IconButton icon="headphones" label="Deafen" size="lg" filled />
        <IconButton icon="video" label="Camera" disabled />
      </Section>
      <Section title="Tag and Badge">
        <Tag tone="live">Live</Tag>
        <Tag>1080p · 60 fps</Tag>
        <Tag tone="accent">New</Tag>
        <Tag color="#e8c44a">JavaScript</Tag>
        <Tag color="#6fb5ff">TypeScript</Tag>
        <Tag color="#7fd6a0">JSON</Tag>
        <Badge label="Unread" />
        <Badge count={3} label="3 unread" />
        <Badge count={140} label="140 unread" />
        <Badge count={7} tone="muted" label="7 unread, muted" />
      </Section>
      <Section title="Options, Tabs, Toggle, Progress">
        <Options label="Frame rate" value={fps} onChange={setFps} items={[{ value: 30, label: '30' }, { value: 60, label: '60' }]} />
        <Tabs label="Friends" value={tab} onChange={setTab} items={[{ value: 'online', label: 'Online', count: 3 }, { value: 'all', label: 'All', count: 12 }, { value: 'requests', label: 'Requests', count: 1 }]} />
        <Toggle enabled={on} onChange={setOn} ariaLabel="Sample switch" />
        <Toggle enabled={!on} onChange={value => setOn(!value)} ariaLabel="Sample switch, inverted" />
        <div className="w-48"><Progress value={0.62} label="Upload" /></div>
        <div className="w-48"><Progress value={0.3} tone="danger" label="Failed upload" /></div>
      </Section>
      <Section title="Field and Card">
        <Card className="p-4 w-72 space-y-3">
          <Field label="Channel name" description="Lowercase, no spaces">
            {({ id, describedBy }) => <input id={id} aria-describedby={describedBy} className="input-standard w-full" defaultValue="release-plans" />}
          </Field>
          <Field label="Channel name" error="No spaces allowed">
            {({ id, describedBy, invalid }) => <input id={id} aria-describedby={describedBy} aria-invalid={invalid} className="input-danger w-full" defaultValue="release plans" />}
          </Field>
        </Card>
        <Card tone="sunken" className="p-4 w-72">A sunken card groups rows inside a dialog.</Card>
        <Card interactive className="p-4 w-56">An interactive card lifts on hover.</Card>
      </Section>
      <section className="space-y-3">
        <h2 className="text-xs font-medium text-txt-tertiary">Icon: every registered glyph, md (18)</h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-1.5">
          {ICON_NAMES.map(name => (
            <div key={name} className="flex flex-col items-center gap-1.5 rounded-lg bg-surface-channel py-3 text-2xs text-txt-tertiary">
              <span className="text-txt-primary"><Icon name={name} /></span>
              {name}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

void initI18n().then(() => {
  createRoot(document.getElementById('root')!).render(<Kit />);
});
