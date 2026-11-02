import { expect, test, type Page } from '@playwright/test';

const EPCI_ID = '200000001';
const EPCI_LABEL = 'Métropole du Grand Exemple';

const EPCI_SUBJECT = {
  kind: 'epci',
  id: EPCI_ID,
  label: EPCI_LABEL,
  qualifier: 'Métropole · 01',
  calendar: { path: '/calendar.ics', params: { epci: EPCI_ID } },
};

const COMMUNE_SUBJECT = {
  kind: 'commune',
  id: '01001',
  label: 'Ambérieu-en-Bugey',
  qualifier: 'Ain',
  calendar: { path: '/calendar.ics', params: { insee_commune: '01001' } },
};

function answer(subjects: readonly unknown[]) {
  return {
    query: 'metropole',
    subjects,
    total: subjects.length,
    kindCounts: {},
  };
}

function ical(events: readonly { id: string; summary: string }[]): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ActionPop//Calendar//FR'];
  for (const event of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}@actionpop-calendar`,
      'DTSTAMP:20261101T120000Z',
      'DTSTART:20261105T100000Z',
      'DTEND:20261105T110000Z',
      `SUMMARY:${event.summary}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR', '');
  return lines.join('\r\n');
}

interface ApiOptions {
  readonly calendarStatus?: number;
  readonly events?: readonly { id: string; summary: string }[];
}

async function mockApi(page: Page, options: ApiOptions = {}) {
  await page.route('**/search/subjects**', async (route) => {
    const url = new URL(route.request().url());
    const kind = url.searchParams.get('kind');
    const query = (url.searchParams.get('q') ?? '').toLowerCase();
    // Address resolution re-reads the subject by its exact identifier.
    if (kind === 'epci') {
      const matches = query.includes('metropole') || query === EPCI_ID.toLowerCase();
      await route.fulfill({ json: answer(matches ? [EPCI_SUBJECT] : []) });
      return;
    }
    if (kind === 'commune') {
      const matches = query.includes('amberieu') || query === COMMUNE_SUBJECT.id;
      await route.fulfill({ json: answer(matches ? [COMMUNE_SUBJECT] : []) });
      return;
    }
    await route.fulfill({ json: answer([EPCI_SUBJECT, COMMUNE_SUBJECT]) });
  });

  await page.route('**/calendar.ics**', async (route) => {
    if (options.calendarStatus !== undefined && options.calendarStatus !== 200) {
      await route.fulfill({
        status: options.calendarStatus,
        json: {
          error: 'calendar scope unavailable',
          diagnostics: [
            {
              code: 'epci_membership_incomplete',
              field: 'epci',
              message: 'EPCI membership data is incomplete',
              severity: 'error',
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/calendar; charset=utf-8',
      body: ical(options.events ?? []),
    });
  });
}

async function searchTerritory(page: Page): Promise<void> {
  await page.getByRole('combobox').fill('metropole');
  const option = page.getByRole('option').filter({ hasText: EPCI_LABEL });
  await expect(option).toBeVisible();
  await option.click();
}

test.describe('intercommunal calendar', () => {
  test('finds a territory and labels it apart from a city', async ({ page }) => {
    await mockApi(page);
    await page.goto('');

    await page.getByRole('combobox').fill('metropole');

    const option = page.getByRole('option').filter({ hasText: EPCI_LABEL });
    await expect(option).toBeVisible();
    await expect(option).toContainText('Intercommunalité');
    await expect(option).toContainText('Métropole · 01');
  });

  test('opens the territory calendar and keeps it in the address', async ({ page }) => {
    await mockApi(page, {
      events: [
        { id: 'event-a', summary: 'Action Ambérieu' },
        { id: 'event-b', summary: 'Action Bellegarde' },
      ],
    });
    await page.goto('');
    await searchTerritory(page);

    await expect(page).toHaveURL(new RegExp(`sujets=epci%3A${EPCI_ID}`));
    await expect(page.getByRole('heading', { level: 1, name: EPCI_LABEL })).toBeVisible();
    await expect(page.getByText('Action Ambérieu')).toBeVisible();
    await expect(page.getByText('Action Bellegarde')).toBeVisible();
  });

  test('survives a reload of a filtered territory link', async ({ page }) => {
    await mockApi(page, { events: [{ id: 'event-a', summary: 'Action Ambérieu' }] });
    await page.goto(`?sujets=epci%3A${EPCI_ID}&types=tractage&groups=e2e-group`);

    await expect(page.getByRole('heading', { level: 1, name: EPCI_LABEL })).toBeVisible();
    await expect(page).toHaveURL(/types=tractage/);
    await expect(page).toHaveURL(/groups=e2e-group/);

    await page.reload();

    await expect(page.getByRole('heading', { level: 1, name: EPCI_LABEL })).toBeVisible();
    await expect(page).toHaveURL(/types=tractage/);
    await expect(page).toHaveURL(/groups=e2e-group/);
  });

  test('offers a subscribable link for a territory with no event', async ({ page }) => {
    await mockApi(page, { events: [] });
    await page.goto(`?sujets=epci%3A${EPCI_ID}`);

    await expect(page.getByText('Aucune action prévue pour le moment')).toBeVisible();
    await expect(page.locator('#ap-subscription')).toContainText(`epci=${EPCI_ID}`);
  });

  test('explains an incomplete territory instead of showing unrelated events', async ({ page }) => {
    await mockApi(page, { calendarStatus: 503 });
    await page.goto(`?sujets=epci%3A${EPCI_ID}`);

    await expect(page.getByText('Territoire indisponible')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await expect(page.getByText('Aucune action prévue pour le moment')).toHaveCount(0);
  });

  test('returns to search when the territory is unknown', async ({ page }) => {
    await mockApi(page);
    await page.goto(`?sujets=epci%3A299999999`);

    await expect(page.getByRole('combobox')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: EPCI_LABEL })).toHaveCount(0);
  });

  test('keeps the existing city calendar working', async ({ page }) => {
    await mockApi(page, { events: [{ id: 'event-city', summary: 'Action Ambérieu' }] });
    await page.goto(`?sujets=commune%3A01001`);

    await expect(page.getByRole('heading', { level: 1, name: 'Ambérieu-en-Bugey' })).toBeVisible();
    await expect(page.getByText('Action Ambérieu')).toBeVisible();
    await expect(page.locator('#ap-subscription')).toContainText('insee_commune=01001');
  });

  test('removes the territory back to the search screen', async ({ page }) => {
    await mockApi(page, { events: [] });
    await page.goto(`?sujets=epci%3A${EPCI_ID}`);

    await page.getByRole('button', { name: 'Enlever' }).first().click();

    await expect(page.getByRole('combobox')).toBeVisible();
    await expect(page).not.toHaveURL(/sujets=/);
  });
});
