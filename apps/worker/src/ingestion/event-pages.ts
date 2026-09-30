export interface PageOptions {
  pageSize?: number;
  expectedPageSize?: number;
}

export async function collectEventPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<T[]>,
  options: PageOptions = {},
): Promise<T[]> {
  const pageSize = Math.min(1000, Math.max(1, options.pageSize ?? 1000));
  const expectedPageSize = options.expectedPageSize ?? pageSize;
  const events: T[] = [];
  let page = 1;
  while (true) {
    const values = await fetchPage(page, pageSize);
    events.push(...values);
    if (values.length === 0 || values.length < expectedPageSize) return events;
    page += 1;
  }
}