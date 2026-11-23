// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import UpdateStatusPage from '../../src/features/updates/components/UpdateStatusPage.vue';
import type { CompletedUpdateRun, UpdateStatusAnswer } from '../../src/types';

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function run(
  minutes: number,
  outcome: CompletedUpdateRun['outcome'] = 'complete',
): CompletedUpdateRun {
  return {
    completedAt: minutesAgo(minutes),
    durationSeconds: 300,
    processed: 20,
    failed: outcome === 'complete' ? 0 : 1,
    outcome,
    groups: { processed: 18, failed: 0, remaining: 0, total: 18 },
    events: { processed: 2, failed: 0, remaining: 1638, total: 1640 },
  };
}

function answer(overrides: Partial<UpdateStatusAnswer> = {}): UpdateStatusAnswer {
  const lastCompleted = run(5);
  return {
    checkedAt: new Date().toISOString(),
    refreshIntervalSeconds: 900,
    state: 'up_to_date',
    current: null,
    lastCompleted,
    history: [lastCompleted, run(20), run(35)],
    available: { current: true, lastCompleted: true, history: true },
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function stub(payload: UpdateStatusAnswer): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => jsonResponse(payload));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const UPDATING: UpdateStatusAnswer = answer({
  state: 'updating',
  current: {
    startedAt: minutesAgo(12),
    processed: 12,
    failed: 1,
    remaining: 7,
    total: 20,
    groups: { processed: 10, failed: 1, remaining: 5, total: 16 },
    events: { processed: 2, failed: 0, remaining: 1638, total: 1640 },
    takingLongerThanUsual: false,
  },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UpdateStatusPage', () => {
  it('renders the dedicated page, freshness details and the cycle strip', async () => {
    stub(answer());
    const wrapper = mount(UpdateStatusPage);
    await flushPromises();

    expect(wrapper.get('h1').text()).toBe('État des données');
    expect(wrapper.text()).toContain('Données à jour');
    expect(wrapper.text()).toContain('Dernière mise à jour');
    expect(wrapper.text()).toContain('Ancienneté');
    expect(wrapper.text()).toContain('Groupes');
    expect(wrapper.text()).toContain('Événements');
    expect(wrapper.text()).toContain('18/18');
    expect(wrapper.text()).toContain('2/1 640');
    expect(wrapper.findAll('[data-testid="recent-cycle-bar"]')).toHaveLength(3);
    expect(wrapper.findAll('[role="progressbar"]')).toHaveLength(2);
    wrapper.unmount();
  });

  it('exposes an accessible progress bar for a live run', async () => {
    stub(UPDATING);
    const wrapper = mount(UpdateStatusPage);
    await flushPromises();

    const bars = wrapper.findAll('[role="progressbar"]');
    expect(bars).toHaveLength(2);
    const bar = bars[0]!; // Groupes
    expect(bar.attributes('aria-valuemin')).toBe('0');
    expect(bar.attributes('aria-valuemax')).toBe('16');
    expect(bar.attributes('aria-valuenow')).toBe('11');
    expect(bar.attributes('aria-valuetext')).toBe('11 sur 16');
    expect(bar.attributes('aria-label')).toBe('Progression des groupes');
    wrapper.unmount();
  });

  it('bounds both the page history and the visual strip to five cycles', async () => {
    stub(
      answer({
        history: [5, 20, 35, 50, 65, 80, 95].map((minutes) => run(minutes)),
      }),
    );
    const wrapper = mount(UpdateStatusPage);
    await flushPromises();

    expect(wrapper.findAll('[data-testid="recent-cycle-bar"]')).toHaveLength(5);
    expect(wrapper.findAll('ol li')).toHaveLength(5);
    wrapper.unmount();
  });

  it('distinguishes a never-updated system from an unreadable one', async () => {
    stub(
      answer({
        state: 'unknown',
        lastCompleted: null,
        history: [],
        available: { current: true, lastCompleted: true, history: true },
      }),
    );
    const first = mount(UpdateStatusPage);
    await flushPromises();
    expect(first.text()).toContain('Aucune mise à jour connue');
    expect(first.text()).toContain('Aucun cycle terminé n’est connu.');
    first.unmount();

    vi.unstubAllGlobals();
    stub(
      answer({
        state: 'unknown',
        lastCompleted: null,
        history: [],
        available: { current: false, lastCompleted: false, history: false },
      }),
    );
    const second = mount(UpdateStatusPage);
    await flushPromises();
    expect(second.text()).toContain('État des mises à jour indisponible');
    expect(second.text()).toContain('Indisponible');
    second.unmount();
  });

  it('refreshes the page on demand', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(answer()))
      .mockResolvedValueOnce(jsonResponse(UPDATING));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(UpdateStatusPage);
    await flushPromises();

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('[role="progressbar"]')).toHaveLength(2);
    wrapper.unmount();
  });
});
