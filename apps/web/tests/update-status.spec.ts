import { expect, test } from '@playwright/test';

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function run(minutes: number, outcome: 'complete' | 'partial' | 'failed') {
  return {
    completedAt: minutesAgo(minutes),
    durationSeconds: 300,
    processed: 20,
    failed: outcome === 'complete' ? 0 : 1,
    outcome,
    groups: { processed: 18, failed: 0, remaining: 0, total: 18 },
    events: { processed: 2, failed: 0, remaining: 1638, total: 1640 },
  };
}

const FRESH = {
  checkedAt: new Date().toISOString(),
  refreshIntervalSeconds: 900,
  state: 'up_to_date',
  current: null,
  lastCompleted: run(5, 'complete'),
  history: [
    run(5, 'complete'),
    run(20, 'complete'),
    run(35, 'partial'),
    run(50, 'complete'),
    run(65, 'complete'),
    run(80, 'complete'),
    run(95, 'failed'),
  ],
  available: { current: true, lastCompleted: true, history: true },
};

const UPDATING = {
  ...FRESH,
  state: 'updating',
  current: {
    startedAt: minutesAgo(2),
    processed: 12,
    failed: 1,
    remaining: 7,
    total: 20,
    groups: { processed: 10, failed: 1, remaining: 5, total: 16 },
    events: { processed: 2, failed: 0, remaining: 1638, total: 1640 },
    takingLongerThanUsual: false,
  },
};

test('shows the freshness line and a collapsed, bounded history', async ({ page }) => {
  await page.route(/\/updates(?:\?.*)?$/, (route) => route.fulfill({ json: FRESH }));
  await page.goto('/');

  const status = page.locator('[aria-label="État des mises à jour"] [role="status"]');
  await expect(status).toContainText('Données à jour');
  await expect(status).toContainText('il y a 5 min');

  const details = page.locator('details');
  await expect(details).not.toHaveAttribute('open', '');
  await details.locator('summary').click();
  await expect(details.locator('li')).toHaveCount(5);
  await expect(page.getByRole('link', { name: 'Voir l’état détaillé' })).toHaveAttribute(
    'href',
    '/etat',
  );
});

test('updates the line on a manual refresh without reloading', async ({ page }) => {
  let calls = 0;
  await page.route(/\/updates(?:\?.*)?$/, (route) => {
    calls += 1;
    return route.fulfill({ json: calls === 1 ? FRESH : UPDATING });
  });
  await page.goto('/');

  const status = page.locator('[aria-label="État des mises à jour"] [role="status"]');
  await expect(status).toContainText('Données à jour');

  await page.getByRole('button', { name: 'Actualiser' }).click();
  await expect(status).toContainText('Mise à jour en cours');
  await expect(status).toContainText('Groupes 10/16');
  await expect(status).toContainText('Événements 2/1 640');
});

test('serves a dedicated page with an accessible visualization', async ({ page }) => {
  await page.route(/\/updates(?:\?.*)?$/, (route) => route.fulfill({ json: UPDATING }));
  await page.goto('/etat');

  await expect(page.getByRole('heading', { name: 'État des données' })).toBeVisible();
  const bars = page.getByRole('progressbar');
  await expect(bars).toHaveCount(2);
  await expect(bars.first()).toHaveAttribute('aria-valuemax', '16');
  await expect(bars.first()).toHaveAttribute('aria-valuenow', '11');
  await expect(page.getByText('Groupes', { exact: true })).toBeVisible();
  await expect(page.getByText('Événements', { exact: true })).toBeVisible();
  await expect(page.getByText('10/16', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid="recent-cycle-bar"]')).toHaveCount(5);
  await expect(page.locator('ol li')).toHaveCount(5);
});
