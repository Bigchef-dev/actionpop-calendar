import { expect, test, type Page, type Request } from '@playwright/test';

const COMMUNE = {
  kind: 'commune',
  id: '35238',
  label: 'Rennes',
  qualifier: 'Ille-et-Vilaine',
  calendar: { path: '/calendar.ics', params: { insee_commune: '35238' } },
};

function answer(subjects: readonly unknown[], query = 'rennes') {
  return { query, subjects, total: subjects.length, kindCounts: {} };
}

function ical(summaries: readonly string[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ActionPop//Calendar//FR'];
  for (const [index, summary] of summaries.entries()) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:event-${index}@actionpop-calendar`,
      'DTSTAMP:20261101T120000Z',
      'DTSTART:20261105T100000Z',
      'DTEND:20261105T110000Z',
      `SUMMARY:${summary}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR', '');
  return lines.join('\r\n');
}

interface MockOptions {
  readonly events?: readonly string[];
  readonly searchResults?: readonly unknown[];
  readonly trackBatches?: Request[];
}

async function mockApi(page: Page, options: MockOptions = {}): Promise<void> {
  await page.route('**/search/subjects**', async (route) => {
    await route.fulfill({
      json: answer(options.searchResults ?? [COMMUNE], new URL(route.request().url()).searchParams.get('q') ?? ''),
    });
  });
  await page.route('**/calendar.ics**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/calendar; charset=utf-8',
      body: ical(options.events ?? ['Réunion mensuelle']),
    });
  });
  if (options.trackBatches !== undefined) {
    await page.route('**/telemetry/journey', async (route) => {
      options.trackBatches?.push(route.request());
      await route.fulfill({ status: 204, body: '' });
    });
  }
}

function sentSteps(requests: readonly Request[]): string[] {
  return requests.flatMap((request) => {
    const payload = request.postDataJSON() as { steps?: Array<{ s: string }> };
    return (payload.steps ?? []).map((step) => step.s);
  });
}

test.describe('journey reporting', () => {
  test('never breaks the calendar when reporting is blocked', async ({ page }) => {
    await mockApi(page, { events: ['Réunion mensuelle', 'Tractage'] });
    // Every telemetry attempt fails at the network layer, as a blocker would.
    await page.route('**/telemetry/journey', (route) => route.abort());

    await page.goto('');
    await page.getByRole('combobox').fill('rennes');
    await page.getByRole('option').filter({ hasText: COMMUNE.label }).click();

    await expect(page.getByText('Réunion mensuelle')).toBeVisible();
    await expect(page.getByText('Tractage')).toBeVisible();
  });

  test('counts a visit once and reports the journey steps in order', async ({ page }) => {
    const batches: Request[] = [];
    await mockApi(page, { trackBatches: batches });

    await page.goto('');
    await page.getByRole('combobox').fill('rennes');
    await page.getByRole('option').filter({ hasText: COMMUNE.label }).click();
    await expect(page.getByText('Réunion mensuelle')).toBeVisible();
    await page.waitForTimeout(2300);

    const steps = sentSteps(batches);
    expect(steps.filter((step) => step === 'arrival')).toHaveLength(1);
    expect(steps).toContain('search');
    expect(steps).toContain('subject_selected');
    expect(steps).toContain('calendar_shown');
  });

  test('counts an unfruitful search separately from a fruitful one', async ({ page }) => {
    const batches: Request[] = [];
    await mockApi(page, { trackBatches: batches, searchResults: [] });

    await page.goto('');
    await page.getByRole('combobox').fill('zzzz');
    await page.waitForTimeout(2600);

    expect(sentSteps(batches)).toContain('search_empty');
  });

  test('one visit across two tabs, a new visit after thirty idle minutes', async ({ context }) => {
    const batches: Request[] = [];
    const first = await context.newPage();
    await mockApi(first, { trackBatches: batches });
    await first.goto('');
    await first.waitForTimeout(2300);

    const second = await context.newPage();
    await mockApi(second, { trackBatches: batches });
    await second.goto('');
    await second.waitForTimeout(2300);

    const arrivals = sentSteps(batches).filter((step) => step === 'arrival');
    expect(arrivals.length).toBeLessThanOrEqual(1);

    const visits = batches
      .map((request) => (request.postDataJSON() as { visit?: string }).visit)
      .filter((visit): visit is string => typeof visit === 'string');
    expect(new Set(visits).size).toBe(1);

    // A fresh tab whose stored visit is older than the idle timeout starts a new visit.
    await second.evaluate(() => {
      const raw = window.localStorage.getItem('actionpop.visit');
      if (raw === null) return;
      const visit = JSON.parse(raw) as { lastActivityAt: string };
      visit.lastActivityAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      window.localStorage.setItem('actionpop.visit', JSON.stringify(visit));
    });
    await second.reload();
    await second.waitForTimeout(2300);

    const identifiers = batches
      .map((request) => (request.postDataJSON() as { visit?: string }).visit)
      .filter((visit): visit is string => typeof visit === 'string');
    expect(new Set(identifiers).size).toBe(2);
  });
});
