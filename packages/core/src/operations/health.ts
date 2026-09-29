export type HealthStatus = 'ready' | 'not_ready';

export interface HealthResult {
  name: string;
  status: HealthStatus;
  detail?: string;
}

export type HealthCheck = () => Promise<void> | void;

export async function runHealthCheck(name: string, check: HealthCheck): Promise<HealthResult> {
  try {
    await check();
    return { name, status: 'ready' };
  } catch (error) {
    return { name, status: 'not_ready', detail: error instanceof Error ? error.message : 'unknown failure' };
  }
}

export const livenessCheck = (): HealthResult => ({ name: 'process', status: 'ready' });