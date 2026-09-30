import { randomUUID } from 'node:crypto';

interface LockStore {
  set(key: string, value: string, mode: 'PX', duration: number): Promise<'OK' | null>;
  del(key: string): Promise<number>;
}

export class RedisLock {
  private token: string | undefined;
  public constructor(private readonly store: LockStore, private readonly key: string, private readonly ttlMs = 60_000) {}

  public async acquire(): Promise<string | null> {
    const token = randomUUID();
    const result = await this.store.set(this.key, token, 'PX', this.ttlMs);
    if (result !== 'OK') return null;
    this.token = token;
    return token;
  }

  public async release(token: string): Promise<void> {
    if (this.token !== token) return;
    await this.store.del(this.key);
    this.token = undefined;
  }
}