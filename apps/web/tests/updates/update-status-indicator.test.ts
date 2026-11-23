// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import UpdateStatusIndicator from '../../src/features/updates/components/UpdateStatusIndicator.vue';
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
    groups: { processed: 20, failed: 0, remaining: 0, total: 20 },
    events: { processed: 20, failed: 0, remaining: 0, total: 20 },
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UpdateStatusIndicator', () => {
  it('shows freshness and a collapsed recent history', async () => {
    stub(answer());
    const wrapper = mount(UpdateStatusIndicator);
    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toContain('Données à jour');
    expect(wrapper.get('[role="status"]').text()).toContain('il y a 5 min');
    expect(wrapper.find('details').attributes('open')).toBeUndefined();
    expect(wrapper.get('summary').text()).toBe('Derniers cycles');
    expect(wrapper.get('a').attributes('href')).toBe('/etat');
    expect(wrapper.get('a').text()).toContain('Voir l’état détaillé');
    expect(wrapper.findAll('li')).toHaveLength(3);

    wrapper.unmount();
  });

  it('shows live progress with processed, remaining and failures', async () => {
    stub(
      answer({
        state: 'updating',
        lastCompleted: null,
        current: {
          startedAt: minutesAgo(14),
          processed: 12,
          failed: 1,
          remaining: 7,
          total: 20,
          groups: { processed: 12, failed: 1, remaining: 7, total: 20 },
          events: { processed: 12, failed: 1, remaining: 7, total: 20 },
          takingLongerThanUsual: false,
        },
      }),
    );
    const wrapper = mount(UpdateStatusIndicator);
    await flushPromises();

    const text = wrapper.get('[role="status"]').text();
    expect(text).toContain('Mise à jour en cours');
    expect(text).toContain('Groupes 12/20');
    expect(text).toContain('Événements 12/20');
    expect(text).toContain('1 en échec');

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
    const first = mount(UpdateStatusIndicator);
    await flushPromises();
    expect(first.text()).toContain('Aucune mise à jour connue');
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
    const second = mount(UpdateStatusIndicator);
    await flushPromises();
    expect(second.text()).toContain('État des mises à jour indisponible');
    second.unmount();
  });

  it('refreshes on demand without a page reload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(answer()))
      .mockResolvedValueOnce(
        jsonResponse(
          answer({
            state: 'updating',
            current: {
              startedAt: minutesAgo(2),
              processed: 3,
              failed: 0,
              remaining: 17,
              total: 20,
              groups: { processed: 3, failed: 0, remaining: 17, total: 20 },
              events: { processed: 3, failed: 0, remaining: 17, total: 20 },
              takingLongerThanUsual: false,
            },
          }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(UpdateStatusIndicator);
    await flushPromises();

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.get('[role="status"]').text()).toContain('Mise à jour en cours');
    wrapper.unmount();
  });

  it('keeps the last known line and says so when a refresh fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(answer()))
      .mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mount(UpdateStatusIndicator);
    await flushPromises();

    await wrapper.get('button').trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="status"]').text()).toContain('Données à jour');
    expect(wrapper.text()).toContain('Actualisation impossible');
    wrapper.unmount();
  });

  it('never renders a field outside the public contract', async () => {
    const payload = {
      ...answer(),
      current: {
        startedAt: minutesAgo(2),
        processed: 3,
        failed: 0,
        remaining: 17,
        total: 20,
        groups: { processed: 3, failed: 0, remaining: 17, total: 20 },
        events: { processed: 3, failed: 0, remaining: 17, total: 20 },
        takingLongerThanUsual: false,
        scopeId: 'group-secret',
        lastError: 'upstream token=abc failed',
      },
      scopeId: 'group-secret',
      lastError: 'upstream token=abc failed',
    } as unknown as UpdateStatusAnswer;
    stub(payload);
    const wrapper = mount(UpdateStatusIndicator);
    await flushPromises();

    expect(wrapper.text()).not.toContain('group-secret');
    expect(wrapper.text()).not.toContain('upstream');
    wrapper.unmount();
  });

  it('bounds the disclosed history to five runs', async () => {
    stub(answer({ history: [5, 20, 35, 50, 65, 80, 95].map((minutes) => run(minutes)) }));
    const wrapper = mount(UpdateStatusIndicator);
    await flushPromises();

    expect(wrapper.findAll('li')).toHaveLength(5);
    wrapper.unmount();
  });
});
