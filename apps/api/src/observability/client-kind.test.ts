import { describe, expect, it } from 'vitest';

import { clientKind } from './client-kind.js';

describe('client kind', () => {
  it('recognizes calendar applications before their browser-like signature', () => {
    expect(clientKind('Mozilla/5.0 (X11; Linux) Thunderbird/115.0')).toBe('agenda');
    expect(clientKind('Google-Calendar-Importer')).toBe('agenda');
    expect(clientKind('Mac OS X/14.0 dataaccessd/1.0')).toBe('agenda');
    expect(clientKind('CalDAVClient/2.1')).toBe('agenda');
  });

  it('recognizes automated clients', () => {
    expect(clientKind('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe('automated');
    expect(clientKind('curl/8.4.0')).toBe('automated');
    expect(clientKind('python-requests/2.31.0')).toBe('automated');
    expect(clientKind('node-fetch/1.0')).toBe('automated');
  });

  it('recognizes browsers', () => {
    expect(
      clientKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'),
    ).toBe('browser');
    expect(clientKind('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0')).toBe('browser');
  });

  it('keeps an unknown or absent signature indeterminate instead of guessing', () => {
    expect(clientKind(undefined)).toBe('indeterminate');
    expect(clientKind('   ')).toBe('indeterminate');
    expect(clientKind('SomeCustomThing/1.0')).toBe('indeterminate');
  });
});
