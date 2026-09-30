import { describe, expect, it } from 'vitest';

import { IngestionLedgerStore } from '../src/operations/ingestion-ledger.js';

describe('ingestion ledger', () => {
  it('retains lifecycle status and sanitized failure details', () => {
    const ledger = new IngestionLedgerStore();
    ledger.transition('job-1', { scopeId: 'group-1', periodToken: 'period-1', status: 'scheduled' });
    ledger.transition('job-1', { status: 'running', attempts: 1 });
    ledger.transition('job-1', { status: 'failed', error: 'upstream token=secret failed' });
    expect(ledger.get('job-1')).toMatchObject({ status: 'failed', attempts: 1, error: 'upstream failed' });
  });
});