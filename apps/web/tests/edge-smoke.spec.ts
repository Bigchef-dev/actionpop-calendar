import { expect, test } from '@playwright/test';

/**
 * Smoke test of the published site through the real edge.
 *
 * It needs a running stack, so it is skipped unless `EDGE_BASE_URL` is set; the exploitation CI
 * job sets it. Running it against Vite would prove nothing about the headers and routing that
 * this feature changes.
 */
const EDGE_BASE_URL = process.env.EDGE_BASE_URL;

test.describe('published edge', () => {
  test.skip(EDGE_BASE_URL === undefined, 'needs a running edge (EDGE_BASE_URL)');

  test('renders the site with no content security policy violation', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error' && /content security policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });

    const response = await page.goto(`${EDGE_BASE_URL}/`);

    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    await expect(page.locator('#app')).toBeVisible();
    expect(violations).toEqual([]);
  });

  test('publishes the update status and its dedicated page', async ({ request, page }) => {
    // A stale edge image is the failure this catches: the site can be current while the routing
    // table baked into the edge predates the routes the site links to.
    const status = await request.get(`${EDGE_BASE_URL}/updates`);
    expect(status.status()).toBe(200);
    expect(status.headers()['content-type']).toContain('application/json');
    const body = (await status.json()) as { state?: string; history?: unknown[] };
    expect(['updating', 'up_to_date', 'stale', 'partial', 'unknown']).toContain(body.state);
    expect(Array.isArray(body.history)).toBe(true);

    const dedicated = await page.goto(`${EDGE_BASE_URL}/etat`);
    expect(dedicated?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'État des données' })).toBeVisible();
  });

  test('refuses an internal surface through the edge', async ({ request }) => {
    for (const path of ['/internal/metrics', '/reference', '/openapi.json', '/nope']) {
      const response = await request.get(`${EDGE_BASE_URL}${path}`);
      expect(response.status(), path).toBe(404);
    }
  });
});
