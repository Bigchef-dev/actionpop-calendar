import { describe, expect, it } from 'vitest';

import { SnapshotPublisher } from '../src/persistence/snapshot-publisher.js';

describe('snapshot publication', () => {
  it('keeps sequence stable for unchanged content and increments changed content', async () => {
    const publisher = new SnapshotPublisher();
    const first = await publisher.publish('group-1', [{ id: 'event-1', name: 'One', startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T11:00:00Z' }]);
    const same = await publisher.publish('group-1', [{ id: 'event-1', name: 'One', startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T11:00:00Z' }]);
    const changed = await publisher.publish('group-1', [{ id: 'event-1', name: 'Changed', startTime: '2026-10-01T10:00:00Z', endTime: '2026-10-01T11:00:00Z' }]);
    expect(first.events[0]?.sequence).toBe(0);
    expect(same.events[0]?.sequence).toBe(0);
    expect(changed.events[0]?.sequence).toBe(1);
  });

  it('does not replace the current snapshot with a partial result', async () => {
    const publisher = new SnapshotPublisher();
    await publisher.publish('group-1', []);
    await expect(publisher.publish('group-1', [], false)).rejects.toThrow(/complete/i);
    expect(await publisher.current('group-1')).toBeDefined();
  });
});