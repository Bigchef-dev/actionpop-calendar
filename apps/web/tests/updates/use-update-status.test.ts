// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUpdateStatus } from '../../src/features/updates/composables/useUpdateStatus';
import type { UpdateStatusAnswer } from '../../src/types';

const ANSWER: UpdateStatusAnswer = {
  checkedAt: '2026-11-23T21:00:00.000Z',
  refreshIntervalSeconds: 900,
  state: 'up_to_date',
  current: null,
  lastCompleted: {
    completedAt: '2026-11-23T20:55:00.000Z',
    durationSeconds: 300,
    processed: 20,
    failed: 0,
    outcome: 'complete',
    groups: { processed: 18, failed: 0, remaining: 0, total: 18 },
    events: { processed: 2, failed: 0, remaining: 1638, total: 1640 },
  },
  history: [],
  available: { current: true, lastCompleted: true, history: true },
};

type Exposed = {
  answer: UpdateStatusAnswer | null;
  failed: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

function mountComposable() {
  const wrapper = mount({
    setup() {
      return useUpdateStatus();
    },
    template: '<div />',
  });
  return { wrapper, vm: wrapper.vm as unknown as Exposed };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

let visibility: 'visible' | 'hidden' = 'visible';

beforeEach(() => {
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useUpdateStatus', () => {
  it('loads on mount and polls every 30 seconds while visible', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(ANSWER));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = mountComposable();

    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });

  it('pauses while hidden and refreshes immediately when visible again', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(ANSWER));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = mountComposable();
    await settle();

    visibility = 'hidden';
    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });

  it('keeps the last answer and marks a failed refresh', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(ANSWER))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper, vm } = mountComposable();
    await settle();

    await vm.refresh();
    await settle();

    expect(vm.answer).toEqual(ANSWER);
    expect(vm.failed).toBe(true);
    wrapper.unmount();
  });

  it('stops polling after unmount', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(ANSWER));
    vi.stubGlobal('fetch', fetchMock);
    const { wrapper } = mountComposable();
    await settle();
    wrapper.unmount();

    await vi.advanceTimersByTimeAsync(60_000);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
