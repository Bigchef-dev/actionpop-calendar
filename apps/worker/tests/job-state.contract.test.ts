import { describe, expect, it } from 'vitest';

import { queueJobState } from '../src/dispatcher/job-state.js';
import { reconciledStatus } from '../src/operations/ledger-reconciliation.js';

function queueWith(state: string | undefined, failedReason?: string) {
  return {
    getJob: async () =>
      state === undefined ? undefined : { getState: async () => state, ...(failedReason === undefined ? {} : { failedReason }) },
  };
}

describe('queue job state', () => {
  it('reports a missing job when the queue no longer holds it', async () => {
    expect(await queueJobState(queueWith(undefined), 'job-1')).toEqual({ kind: 'missing' });
  });

  it('reports a live job while it is waiting, active, delayed or paused', async () => {
    for (const state of ['waiting', 'active', 'delayed', 'prioritized', 'waiting-children', 'paused']) {
      expect(await queueJobState(queueWith(state), 'job-1')).toEqual({ kind: 'live' });
    }
  });

  it('reports the outcome the queue recorded', async () => {
    expect(await queueJobState(queueWith('completed'), 'job-1')).toEqual({ kind: 'completed' });
    expect(await queueJobState(queueWith('failed', 'Upstream HTTP 429'), 'job-1')).toEqual({
      kind: 'failed',
      reason: 'Upstream HTTP 429',
    });
  });
});

describe('ledger reconciliation', () => {
  it('trusts the queue over a stale live ledger status', () => {
    expect(reconciledStatus({ kind: 'completed' })).toEqual({ status: 'succeeded' });
    expect(reconciledStatus({ kind: 'failed', reason: 'Upstream HTTP 429' })).toEqual({
      status: 'failed',
      error: 'Upstream HTTP 429',
    });
    expect(reconciledStatus({ kind: 'missing' })).toEqual({
      status: 'failed',
      error: 'abandoned: the queue no longer holds this job',
    });
  });

  it('leaves a job that is still running untouched', () => {
    expect(reconciledStatus({ kind: 'live' })).toBeUndefined();
  });
});
