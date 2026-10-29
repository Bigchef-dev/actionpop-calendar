export interface DirectorySyncOutcome {
  readonly synced: boolean;
  readonly failure?: string;
}

/**
 * Reads and applies the map directory without letting a directory outage escape the
 * step: an unavailable or rejected directory changes nothing, and the cycle still
 * dispatches the listings that can be retrieved (FR-015).
 */
export async function synchronizeDirectory(
  fetchDirectory: () => Promise<unknown>,
  synchronize: (value: unknown) => Promise<void>,
): Promise<DirectorySyncOutcome> {
  try {
    await synchronize(await fetchDirectory());
    return { synced: true };
  } catch (error) {
    return {
      synced: false,
      failure: error instanceof Error ? error.message : 'the map directory could not be read',
    };
  }
}
