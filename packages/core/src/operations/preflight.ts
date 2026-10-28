export interface DependencyProbe {
  readonly name: string;
  probe(): Promise<void>;
}

export interface DependencyFailure {
  readonly name: string;
  readonly message: string;
}

const DEFAULT_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

/**
 * Verifies that required runtime dependencies answer before the service
 * accepts traffic, so startup fails with one actionable message instead of
 * retrying forever against an unreachable service.
 */
export async function runPreflight(
  probes: readonly DependencyProbe[],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<DependencyFailure[]> {
  const results = await Promise.all(probes.map(async (probe): Promise<DependencyFailure | undefined> => {
    try {
      await withTimeout(probe.probe(), timeoutMs);
      return undefined;
    } catch (error) {
      return {
        name: probe.name,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }));
  return results.filter((failure): failure is DependencyFailure => failure !== undefined);
}

export function describeDependencyFailures(
  failures: readonly DependencyFailure[],
  startupCommand = 'pnpm dev:infra',
): string {
  const names = failures.map((failure) => failure.name).join(', ');
  return `unavailable dependencies: ${names}. Start local Redis and Postgres with \`${startupCommand}\` and retry`;
}
