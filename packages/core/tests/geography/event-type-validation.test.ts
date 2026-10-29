import { describe, expect, it } from 'vitest';

import {
  validateEventType,
  type EventTypeReader,
  type ObservedEventType,
} from '../../src/geography/event-types.js';

class FakeEventTypeReader implements EventTypeReader {
  public readonly recorded: string[] = [];

  public constructor(known: string[] = ['tractage']) {
    this.known = new Set(known);
  }

  private readonly known: Set<string>;

  public async findEventType(value: string): Promise<ObservedEventType | null> {
    return this.known.has(value)
      ? { value, firstSeenAt: '2026-10-28T00:00:00.000Z', source: 'action-populaire' }
      : null;
  }

  public async recordObservedEventTypes(values: string[]): Promise<void> {
    for (const value of values) {
      this.known.add(value);
      this.recorded.push(value);
    }
  }
}

describe('validateEventType', () => {
  it('accepts a label already observed', async () => {
    const reader = new FakeEventTypeReader(['tractage']);
    expect(await validateEventType('tractage', reader)).toEqual({
      eventType: 'tractage',
      diagnostics: [],
    });
    expect(reader.recorded).toEqual([]);
  });

  it('accepts and registers a newly published label', async () => {
    const reader = new FakeEventTypeReader(['tractage']);
    const result = await validateEventType('meeting-presidentielle-2027', reader);

    expect(result).toEqual({ eventType: 'meeting-presidentielle-2027', diagnostics: [] });
    expect(reader.recorded).toEqual(['meeting-presidentielle-2027']);
  });

  it('registers a label only once', async () => {
    const reader = new FakeEventTypeReader();
    await validateEventType('porte-a-porte', reader);
    await validateEventType('porte-a-porte', reader);
    expect(reader.recorded).toEqual(['porte-a-porte']);
  });

  it('accepts the labels the source actually publishes', async () => {
    const reader = new FakeEventTypeReader();
    for (const label of [
      'diffusion-tracts',
      'porte-a-porte',
      'presentation-livre',
      'reunion-groupe',
      'boitage',
    ]) {
      const result = await validateEventType(label, reader);
      expect(result.diagnostics).toEqual([]);
      expect(result.eventType).toBe(label);
    }
  });

  it('normalizes the accented labels the source publishes', async () => {
    const reader = new FakeEventTypeReader();

    expect(await validateEventType('fête-locale', reader)).toEqual({
      eventType: 'fete-locale',
      diagnostics: [],
    });
    expect(await validateEventType('Événement ILB', reader)).toEqual({
      eventType: 'evenement-ilb',
      diagnostics: [],
    });
    expect(await validateEventType('Cœur de quartier', reader)).toEqual({
      eventType: 'coeur-de-quartier',
      diagnostics: [],
    });
    expect(reader.recorded).toEqual(['fete-locale', 'evenement-ilb', 'coeur-de-quartier']);
  });

  it('registers the normalized label, not the raw one', async () => {
    const reader = new FakeEventTypeReader(['fete-locale']);
    expect(await validateEventType('Fête-locale', reader)).toEqual({
      eventType: 'fete-locale',
      diagnostics: [],
    });
    expect(reader.recorded).toEqual([]);
  });

  it('rejects a label with no usable characters, naming the field and cause', async () => {
    const reader = new FakeEventTypeReader();
    const result = await validateEventType('!!!', reader);

    expect(result.eventType).toBeUndefined();
    expect(result.diagnostics).toEqual([
      {
        code: 'event_type_invalid',
        field: 'subtype.label',
        message:
          '"!!!" cannot be normalized into an event-type label (expected letters, digits and hyphens)',
        severity: 'error',
      },
    ]);
    expect(reader.recorded).toEqual([]);
  });

  it('accepts an event without a stated type', async () => {
    for (const value of [undefined, '', '   ']) {
      expect(await validateEventType(value, new FakeEventTypeReader())).toEqual({
        diagnostics: [],
      });
    }
  });
});
