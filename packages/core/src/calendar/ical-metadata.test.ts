import { describe, expect, it } from 'vitest';

import type { CalendarEvent } from '../calendar-filters/calendar-event.js';
import { buildMetadataLines, METADATA_PREFIX, METADATA_PROPERTIES } from './ical-metadata.js';
import type { MetadataSettings } from './ical-metadata.js';
import type { MetadataFamily, MetadataLevel } from './metadata-levels.js';

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    sourceEventId: 'event-1',
    summary: 'Tractage',
    description: null,
    startTime: new Date('2026-11-03T09:00:00.000Z'),
    endTime: new Date('2026-11-03T11:00:00.000Z'),
    sequence: 2,
    updatedAt: new Date('2026-10-28T21:00:00.000Z'),
    lastSeenPeriod: '2026-10-28T21:00Z',
    eventType: 'tractage',
    sourceUrl: 'https://example.test/events/event-1',
    geography: {
      status: 'resolved',
      countryCode: 'FR',
      departmentCode: '69',
      communeId: '69123',
      referenceVersion: 'communes-test',
      rawDepartmentCode: '69',
      rawCommuneName: 'Lyon',
      diagnostics: [
        { code: 'commune_ambiguous', field: 'location.commune.name', message: 'two matches', severity: 'warning' },
      ],
    },
    location: null,
    coordinates: null,
    groupIds: ['group-1', 'group-2'],
    ...overrides,
  };
}

function settings(level: MetadataLevel, disabledFamilies: MetadataFamily[] = [], max = 5): MetadataSettings {
  return { level, disabledFamilies, maxGroupsPerEvent: max };
}

function names(lines: readonly string[]): string[] {
  return lines.map((line) => line.slice(0, line.indexOf(':')).split(';')[0] ?? '');
}

describe('metadata emission', () => {
  it('emits nothing at the off level', () => {
    expect(buildMetadataLines(event(), settings('off')).lines).toEqual([]);
  });

  it('emits only identity properties at the identity level', () => {
    const lines = buildMetadataLines(event(), settings('identity')).lines;

    expect(names(lines)).toEqual([
      'X-ACTIONPOP-EVENT-ID',
      'X-ACTIONPOP-UPDATED-AT',
      'X-ACTIONPOP-PERIOD',
    ]);
    expect(lines[0]).toBe('X-ACTIONPOP-EVENT-ID:event-1');
    expect(lines[1]).toBe('X-ACTIONPOP-UPDATED-AT:20261028T210000Z');
    expect(lines[2]).toBe('X-ACTIONPOP-PERIOD:2026-10-28T21:00Z');
  });

  it('defaults to identity, classification and provenance at the standard level', () => {
    const lines = buildMetadataLines(event(), settings('standard')).lines;

    expect(names(lines)).toEqual([
      'X-ACTIONPOP-EVENT-ID',
      'X-ACTIONPOP-UPDATED-AT',
      'X-ACTIONPOP-PERIOD',
      'X-ACTIONPOP-EVENT-TYPE',
      'X-ACTIONPOP-SOURCE-URL',
      'X-ACTIONPOP-GROUP',
      'X-ACTIONPOP-GROUP',
    ]);
    expect(lines).not.toContain('X-ACTIONPOP-GEO-STATUS:resolved');
  });

  it('adds geography, diagnostics and raw source values at the full level', () => {
    const lines = buildMetadataLines(event(), settings('full')).lines;
    const emitted = names(lines);

    expect(emitted).toContain('X-ACTIONPOP-GEO-STATUS');
    expect(emitted).toContain('X-ACTIONPOP-COUNTRY');
    expect(emitted).toContain('X-ACTIONPOP-DEPARTMENT');
    expect(emitted).toContain('X-ACTIONPOP-INSEE-COMMUNE');
    expect(emitted).toContain('X-ACTIONPOP-GEO-REFERENCE');
    expect(emitted).toContain('X-ACTIONPOP-GEO-DIAGNOSTIC-COUNT');
    expect(emitted).toContain('X-ACTIONPOP-GEO-DIAGNOSTIC');
    expect(emitted).toContain('X-ACTIONPOP-RAW-DEPARTMENT');
    expect(emitted).toContain('X-ACTIONPOP-RAW-COMMUNE');
  });

  it('keeps leading zeroes and alphanumeric department codes', () => {
    const lines = buildMetadataLines(
      event({
        geography: {
          ...event().geography!,
          departmentCode: '01',
          communeId: '01001',
        },
      }),
      settings('full'),
    ).lines;

    expect(lines).toContain('X-ACTIONPOP-DEPARTMENT:01');
    expect(lines).toContain('X-ACTIONPOP-INSEE-COMMUNE:01001');
  });

  it('honours disabled families at the full level', () => {
    const lines = buildMetadataLines(event(), settings('full', ['geography'])).lines;

    expect(names(lines).some((name) => name.includes('GEO-STATUS'))).toBe(false);
    expect(names(lines)).toContain('X-ACTIONPOP-EVENT-ID');
  });

  it('omits a property whose value is unknown', () => {
    const lines = buildMetadataLines(
      event({ eventType: null, sourceUrl: null, lastSeenPeriod: null, geography: null }),
      settings('full'),
    ).lines;

    expect(names(lines)).toEqual(['X-ACTIONPOP-EVENT-ID', 'X-ACTIONPOP-UPDATED-AT', 'X-ACTIONPOP-GROUP', 'X-ACTIONPOP-GROUP']);
  });

  it('encodes a diagnostic with parameters and the message as value', () => {
    const lines = buildMetadataLines(event(), settings('full')).lines;
    const diagnostic = lines.find((line) => line.startsWith('X-ACTIONPOP-GEO-DIAGNOSTIC;'));

    expect(diagnostic).toBe(
      'X-ACTIONPOP-GEO-DIAGNOSTIC;CODE=commune_ambiguous;FIELD=location.commune.name;SEVERITY=warning:two matches',
    );
  });

  it('orders repeated diagnostics deterministically', () => {
    const diagnostics = [
      { code: 'b_code', field: 'z', message: 'b', severity: 'warning' as const },
      { code: 'a_code', field: 'z', message: 'a', severity: 'warning' as const },
      { code: 'a_code', field: 'a', message: 'c', severity: 'error' as const },
    ];
    const lines = buildMetadataLines(
      event({ geography: { ...event().geography!, diagnostics } }),
      settings('full'),
    ).lines;
    const emitted = lines.filter((line) => line.startsWith('X-ACTIONPOP-GEO-DIAGNOSTIC;'));

    expect(emitted.map((line) => line.split(';')[1])).toEqual([
      'CODE=a_code',
      'CODE=a_code',
      'CODE=b_code',
    ]);
  });

  it('caps group properties and reports truncation', () => {
    const emission = buildMetadataLines(
      event({ groupIds: ['a', 'b', 'c', 'd', 'e', 'f'] }),
      settings('standard', [], 5),
    );

    expect(emission.lines.filter((line) => line.startsWith('X-ACTIONPOP-GROUP:'))).toHaveLength(5);
    expect(emission.groupsTruncated).toBe(true);
  });

  it('never leaks a token, connection string or internal identifier', () => {
    const body = buildMetadataLines(event(), settings('full')).lines.join('\n');

    expect(body).not.toMatch(/postgres(ql)?:\/\//);
    expect(body).not.toMatch(/redis:\/\//);
    expect(body).not.toMatch(/TOKEN|SECRET|PASSWORD/i);
  });

  it('documents every emitted property in the declarative table', () => {
    const produced = new Set(
      buildMetadataLines(event(), settings('full')).lines.map(
        (line) => line.slice(0, line.indexOf(':')).split(';')[0]?.replace(METADATA_PREFIX, '') ?? '',
      ),
    );
    const documented = new Set(METADATA_PROPERTIES.map((property) => property.name));

    for (const name of produced) expect(documented.has(name)).toBe(true);
    for (const name of documented) expect(produced.has(name)).toBe(true);
  });
});
