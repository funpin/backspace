import { useEffect, useSyncExternalStore } from 'react';
import { getActiveRoom } from '../hooks/useLiveKit';
import { discoverPeerConnections } from './livekitInternals';

/** One sample a second, kept for two minutes. */
export const PING_SAMPLE_MS = 1000;
export const PING_WINDOW = 120;

/**
 * Round-trip time to the voice server over the last `PING_WINDOW` samples,
 * oldest first; null where a sample could not be taken (no connection yet, a
 * reconnect). Kept outside React and outside voiceStore: it is written every
 * second for the whole call, and only an open graph should re-render for it.
 */
let samples: readonly (number | null)[] = [];
const listeners = new Set<() => void>();

function emit(next: readonly (number | null)[]): void {
  samples = next;
  for (const listener of listeners) listener();
}

export function pushPing(ping: number | null): void {
  emit([...samples, ping].slice(-PING_WINDOW));
}

export function resetPingHistory(): void {
  if (samples.length > 0) emit([]);
}

export function getPingHistory(): readonly (number | null)[] {
  return samples;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function usePingHistory(): readonly (number | null)[] {
  return useSyncExternalStore(subscribe, getPingHistory, getPingHistory);
}

export interface PingSummary {
  min: number;
  avg: number;
  max: number;
}

/** Lowest, mean and highest of the samples that were taken; null when none were. */
export function summarizePings(history: readonly (number | null)[]): PingSummary | null {
  const taken = history.filter((value): value is number => value !== null);
  if (taken.length === 0) return null;
  return {
    min: Math.min(...taken),
    avg: Math.round(taken.reduce((sum, value) => sum + value, 0) / taken.length),
    max: Math.max(...taken),
  };
}

/** The candidate-pair counters a round-trip time is derived from. */
export interface PairCounters {
  totalRoundTripTime: number;
  responsesReceived: number;
}

/**
 * Round-trip time for one sampling interval, in ms. The ICE agent measures it
 * on its connectivity checks, a few seconds apart, and `currentRoundTripTime`
 * holds only the latest. The mean of the checks answered since the previous
 * sample (`totalRoundTripTime` over `responsesReceived`, both cumulative) does
 * not drop a spike that a later check already overwrote; with no new answer
 * in the interval the latest value stands.
 */
export function roundTripSince(
  previous: PairCounters | null,
  current: PairCounters | null,
  currentRoundTripTime: number | null,
): number | null {
  if (previous && current && current.responsesReceived > previous.responsesReceived) {
    const mean = (current.totalRoundTripTime - previous.totalRoundTripTime)
      / (current.responsesReceived - previous.responsesReceived);
    if (Number.isFinite(mean) && mean >= 0) return Math.round(mean * 1000);
  }
  return currentRoundTripTime !== null && Number.isFinite(currentRoundTripTime)
    ? Math.round(currentRoundTripTime * 1000)
    : null;
}

interface PairReport {
  type?: string;
  id?: string;
  state?: string;
  nominated?: boolean;
  selectedCandidatePairId?: string;
  currentRoundTripTime?: number;
  totalRoundTripTime?: number;
  responsesReceived?: number;
}

/** The candidate pair a peer connection is sending on, from one stats report. */
function selectedPair(reports: RTCStatsReport): PairReport | null {
  let selectedId: string | null = null;
  let nominated: PairReport | null = null;
  reports.forEach((raw: unknown) => {
    const report = raw as PairReport;
    if (report.type === 'transport' && report.selectedCandidatePairId) selectedId = report.selectedCandidatePairId;
    if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') nominated = report;
  });
  const byId = selectedId ? (reports.get(selectedId) as PairReport | undefined) : undefined;
  return byId ?? nominated;
}

/**
 * Samples the round-trip time once a second while `active`, for the whole
 * call rather than while the graph is open: a graph that started empty every
 * time it was opened could never show the spike that made its owner open it.
 * One `getStats()` per peer connection per second; only the candidate pair is read.
 */
export function usePingSampler(active: boolean): void {
  useEffect(() => {
    if (!active) {
      resetPingHistory();
      return;
    }
    let cancelled = false;
    const previous = new WeakMap<RTCPeerConnection, PairCounters>();

    const sample = async (): Promise<void> => {
      const room = getActiveRoom();
      const pcs = room ? discoverPeerConnections(room as never) : [];
      let ping: number | null = null;
      for (const pc of pcs) {
        let reports: RTCStatsReport;
        try {
          reports = await pc.getStats();
        } catch {
          continue;
        }
        const pair = selectedPair(reports);
        if (!pair) continue;
        const counters = pair.totalRoundTripTime !== undefined && pair.responsesReceived !== undefined
          ? { totalRoundTripTime: pair.totalRoundTripTime, responsesReceived: pair.responsesReceived }
          : null;
        const value = roundTripSince(previous.get(pc) ?? null, counters, pair.currentRoundTripTime ?? null);
        if (counters) previous.set(pc, counters);
        // Publisher and subscriber connections share the route; the worse of the two is what the call feels.
        if (value !== null && (ping === null || value > ping)) ping = value;
      }
      if (!cancelled) pushPing(ping);
    };

    void sample();
    const interval = setInterval(() => { void sample(); }, PING_SAMPLE_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active]);
}
