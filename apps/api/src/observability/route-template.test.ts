import { describe, expect, it } from 'vitest';

import { methodLabel, requestPath, routeTemplate, statusClass } from './route-template.js';

describe('route templates', () => {
  it('maps each documented route to its template', () => {
    expect(routeTemplate('/calendar.ics')).toBe('/calendar.ics');
    expect(routeTemplate('/events')).toBe('/events');
    expect(routeTemplate('/search/subjects')).toBe('/search/subjects');
    expect(routeTemplate('/feed/abc123')).toBe('/feed/:scopeId');
    expect(routeTemplate('/telemetry/journey')).toBe('/telemetry/journey');
    expect(routeTemplate('/internal/live')).toBe('/internal/live');
    expect(routeTemplate('/internal/ready')).toBe('/internal/ready');
    expect(routeTemplate('/internal/metrics')).toBe('/internal/metrics');
    expect(routeTemplate('/openapi.json')).toBe('/openapi.json');
  });

  it('never leaks the query string or the fragment into the template', () => {
    expect(routeTemplate('/calendar.ics?insee_commune=35238&types=tractage')).toBe('/calendar.ics');
    expect(routeTemplate('/search/subjects?q=strasbourg')).toBe('/search/subjects');
    expect(routeTemplate('/feed/scope-1?x=1#frag')).toBe('/feed/:scopeId');
    expect(requestPath('/events?department=35')).toBe('/events');
  });

  it('falls back to /other for anything unknown', () => {
    expect(routeTemplate('/search/other')).toBe('/other');
    expect(routeTemplate('/feed/a/b')).toBe('/other');
    expect(routeTemplate('/')).toBe('/other');
    expect(routeTemplate('/admin')).toBe('/other');
  });

  it('labels methods and status classes with bounded values', () => {
    expect(methodLabel('GET')).toBe('GET');
    expect(methodLabel('get')).toBe('GET');
    expect(methodLabel('TRACE')).toBe('other');
    expect(methodLabel(undefined)).toBe('other');
    expect(statusClass(204)).toBe('2xx');
    expect(statusClass(304)).toBe('3xx');
    expect(statusClass(404)).toBe('4xx');
    expect(statusClass(503)).toBe('5xx');
    expect(statusClass(0)).toBe('5xx');
  });
});
