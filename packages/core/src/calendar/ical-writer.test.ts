import { describe, expect, it } from 'vitest';

import {
  escapeText,
  foldLine,
  formatContentLine,
  formatUtcInstant,
  joinLines,
} from './ical-writer.js';

describe('iCalendar writer', () => {
  it('escapes backslash, comma, semicolon and line breaks', () => {
    expect(escapeText('a\\b,c;d\ne')).toBe('a\\\\b\\,c\\;d\\ne');
    expect(escapeText('line one\r\nline two')).toBe('line one\\nline two');
  });

  it('leaves a short line untouched', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds a long line at 75 octets with a leading space per continuation', () => {
    const folded = foldLine(`DESCRIPTION:${'a'.repeat(200)}`);
    const lines = folded.split('\r\n');

    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0]).toHaveLength(75);
    for (const continuation of lines.slice(1)) {
      expect(continuation.startsWith(' ')).toBe(true);
      expect(Buffer.byteLength(continuation, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(lines.join('\r\n').replace(/\r\n /g, '')).toBe(`DESCRIPTION:${'a'.repeat(200)}`);
  });

  it('never splits a multi-byte character', () => {
    const value = `SUMMARY:${'é'.repeat(60)}`;
    const folded = foldLine(value);

    expect(folded).not.toContain('\uFFFD');
    for (const line of folded.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n /g, '')).toBe(value);
  });

  it('formats instants in UTC basic format', () => {
    expect(formatUtcInstant('2026-10-01T10:00:00+02:00')).toBe('20261001T080000Z');
    expect(formatUtcInstant(new Date('2026-09-30T12:00:00.000Z'))).toBe('20260930T120000Z');
    expect(() => formatUtcInstant('not-a-date')).toThrow(/calendar date is invalid/);
  });

  it('joins lines with CRLF and terminates the document', () => {
    expect(joinLines(['BEGIN:VEVENT', 'END:VEVENT'])).toBe('BEGIN:VEVENT\r\nEND:VEVENT\r\n');
  });

  it('serializes parameters and quotes values that contain reserved characters', () => {
    expect(
      formatContentLine({
        name: 'x-actionpop-geo-diagnostic',
        parameters: { code: 'commune_ambiguous', field: 'location.commune.name', severity: 'warning' },
        value: 'several communes match',
      }),
    ).toBe(
      'X-ACTIONPOP-GEO-DIAGNOSTIC;CODE=commune_ambiguous;FIELD=location.commune.name;SEVERITY=warning:several communes match',
    );
  });

  it('quotes a parameter value that contains a reserved character', () => {
    expect(
      formatContentLine({
        name: 'x-actionpop-note',
        parameters: { field: 'a:b' },
        value: 'v',
      }),
    ).toBe('X-ACTIONPOP-NOTE;FIELD="a:b":v');
  });
});
