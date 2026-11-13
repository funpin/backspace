import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { DesktopDownloadPanel } from './DesktopDownloadPanel';
import {
  detectDesktopPlatform,
  RELEASES_URL,
  type DetectedPlatform,
} from '../../../platform/desktopDownload';

// Only the detection is mocked: the link builder is the real one, so the hrefs
// these tests assert on are the URLs a visitor would actually get.
vi.mock('../../../platform/desktopDownload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/desktopDownload')>();
  return { ...actual, detectDesktopPlatform: vi.fn() };
});

const detect = vi.mocked(detectDesktopPlatform);

function platformIs(detected: DetectedPlatform) {
  detect.mockResolvedValue(detected);
}

const asset = (file: string) => `${RELEASES_URL}/download/v1.2.3/${file}`;

/** The tile for one platform, found by the heading that names it. */
function tile(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

beforeEach(() => {
  detect.mockReset();
});

afterEach(cleanup);

describe('DesktopDownloadPanel', () => {
  it('puts the x64 installer in the Windows hero, with no picker to choose from', async () => {
    platformIs({ os: 'windows', arch: 'x64', archGuessed: false });
    render(<DesktopDownloadPanel version="1.2.3" />);

    const hero = await screen.findByRole('region', { name: 'Windows' });
    expect(hero).toHaveAttribute('data-tile', 'hero');
    expect(within(hero).getByText('This PC')).toBeInTheDocument();
    expect(within(hero).getByText('Windows 10 and 11, x64')).toBeInTheDocument();
    expect(within(hero).queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Download for Windows' })).toHaveAttribute(
      'href',
      asset('Backspace-1.2.3-win-x64.exe'),
    );
    expect(within(hero).getByText('Version 1.2.3')).toBeInTheDocument();

    // Windows is the hero, so it must not also appear as a quiet tile, and
    // there is no tile for a platform the release has no build for.
    expect(screen.getAllByRole('link', { name: 'Download for Windows' })).toHaveLength(1);
    const quiet = screen.getAllByRole('region').filter((region) => region.getAttribute('data-tile') === 'quiet');
    expect(quiet.map((region) => within(region).getByRole('heading').textContent)).toEqual(['macOS']);
  });

  it('offers the x64 installer on Windows on ARM, where it runs under emulation', async () => {
    platformIs({ os: 'windows', arch: 'arm64', archGuessed: false });
    render(<DesktopDownloadPanel version="1.2.3" />);

    const hero = await screen.findByRole('region', { name: 'Windows' });
    expect(hero).toHaveAttribute('data-tile', 'hero');
    expect(within(hero).getByRole('link', { name: 'Download for Windows' })).toHaveAttribute(
      'href',
      asset('Backspace-1.2.3-win-x64.exe'),
    );
  });

  it('says nothing about a guessed architecture when there is one build per platform', async () => {
    platformIs({ os: 'windows', arch: 'x64', archGuessed: true });
    render(<DesktopDownloadPanel version="1.2.3" />);

    await screen.findByRole('region', { name: 'Windows' });
    expect(screen.queryByText(/preselected/)).not.toBeInTheDocument();
  });

  it('puts the Apple Silicon image in the macOS hero', async () => {
    platformIs({ os: 'mac', arch: 'arm64', archGuessed: true });
    render(<DesktopDownloadPanel version="1.2.3" />);

    const hero = await screen.findByRole('region', { name: 'macOS' });
    expect(hero).toHaveAttribute('data-tile', 'hero');
    expect(within(hero).getByText('This Mac')).toBeInTheDocument();
    expect(within(hero).queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Download for macOS' })).toHaveAttribute(
      'href',
      asset('Backspace-1.2.3-mac-arm64.dmg'),
    );
    expect(screen.queryByText(/preselected/)).not.toBeInTheDocument();
  });

  it('gives an Intel Mac no hero, since the Apple Silicon image does not run there', async () => {
    platformIs({ os: 'mac', arch: 'x64', archGuessed: false });
    render(<DesktopDownloadPanel version="1.2.3" />);

    expect(
      await screen.findByText('The desktop app runs on Windows (x64) and macOS (Apple Silicon).'),
    ).toBeInTheDocument();
    for (const region of screen.getAllByRole('region')) expect(region).toHaveAttribute('data-tile', 'quiet');
  });

  it('offers two quiet tiles and no hero on Linux and on an unsupported platform', async () => {
    for (const detected of [
      { os: 'linux', arch: 'x64', archGuessed: false },
      { os: 'other', arch: null, archGuessed: false },
    ] satisfies DetectedPlatform[]) {
      platformIs(detected);
      render(<DesktopDownloadPanel version="1.2.3" />);

      expect(
        await screen.findByText('The desktop app runs on Windows (x64) and macOS (Apple Silicon).'),
      ).toBeInTheDocument();

      const tiles = screen.getAllByRole('region');
      for (const region of tiles) expect(region).toHaveAttribute('data-tile', 'quiet');
      expect(tiles.map((region) => within(region).getByRole('heading').textContent)).toEqual(['Windows', 'macOS']);

      expect(within(tile('Windows')).getByRole('link', { name: 'Download for Windows' })).toHaveAttribute(
        'href',
        asset('Backspace-1.2.3-win-x64.exe'),
      );
      expect(within(tile('macOS')).getByRole('link', { name: 'Download for macOS' })).toHaveAttribute(
        'href',
        asset('Backspace-1.2.3-mac-arm64.dmg'),
      );
      // Two downloads plus the releases listing.
      expect(screen.getAllByRole('link')).toHaveLength(3);
      cleanup();
    }
  });

  it('points every link at the releases page while the version is unknown', async () => {
    platformIs({ os: 'windows', arch: 'x64', archGuessed: false });
    render(<DesktopDownloadPanel version={null} />);

    await screen.findByRole('link', { name: 'Download for Windows' });
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('href', RELEASES_URL);
    }
    expect(screen.queryByText(/Version/)).not.toBeInTheDocument();
  });

  it('opens every link in a new tab without leaking the opener', async () => {
    platformIs({ os: 'windows', arch: 'x64', archGuessed: false });
    render(<DesktopDownloadPanel version="1.2.3" />);

    await screen.findByRole('link', { name: 'Download for Windows' });
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('shows only the footer until detection resolves', () => {
    detect.mockReturnValue(new Promise(() => undefined));
    render(<DesktopDownloadPanel version="1.2.3" />);

    expect(screen.getByRole('heading', { name: 'Desktop' })).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', RELEASES_URL);
  });
});
