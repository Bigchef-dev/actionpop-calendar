import {
  activeGroupScopeIds,
  normalizeScopeIdentity,
  PostgresGroupRegistry,
  synchronizeGroupDirectory,
  validateGroupCatalogue,
  type GroupCatalogueEntry,
} from '@actionpop/core';
import type { PrismaClient } from '@prisma/client';

const CATALOGUE_SYNC_TIMEOUT_MS = 60_000;

interface RedisValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
}

export class GroupCatalogueRepository {
  private entries = new Map<string, GroupCatalogueEntry>();

  public async synchronize(value: unknown): Promise<void> {
    const entries = validateGroupCatalogue(value);
    this.entries = new Map(entries.map((entry) => [entry.id, entry]));
  }

  public async synchronizePartial(value: unknown): Promise<void> {
    validateGroupCatalogue(value);
    throw new Error('partial catalogue cannot replace the last complete catalogue');
  }

  public allIds(): string[] {
    return [...this.entries.values()].map((entry) => entry.id);
  }

  public get(id: string): GroupCatalogueEntry | undefined {
    return this.entries.get(id);
  }

  public activeScopes(): string[] {
    return [...this.entries.values()].filter((entry) => entry.is_active).map((entry) => entry.id);
  }
}

export class RedisGroupCatalogueRepository {
  public constructor(
    private readonly redis: RedisValueStore,
    private readonly key = 'actionpop:catalogue:groups',
  ) {}

  public async synchronize(value: unknown): Promise<void> {
    const entries = validateGroupCatalogue(value);
    await this.redis.set(this.key, JSON.stringify(entries));
  }

  public async synchronizePartial(value: unknown): Promise<void> {
    validateGroupCatalogue(value);
    throw new Error('partial catalogue cannot replace the last complete catalogue');
  }

  public async allIds(): Promise<string[]> {
    return (await this.read()).map((entry) => entry.id);
  }

  public async get(id: string): Promise<GroupCatalogueEntry | undefined> {
    return (await this.read()).find((entry) => entry.id === id);
  }

  public async activeScopes(): Promise<string[]> {
    return (await this.read()).filter((entry) => entry.is_active).map((entry) => entry.id);
  }

  private async read(): Promise<GroupCatalogueEntry[]> {
    const value = await this.redis.get(this.key);
    return value === null ? [] : validateGroupCatalogue(JSON.parse(value) as unknown);
  }
}

export class PostgresGroupCatalogueRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * The directory is the source of truth for what the map advertises. A group
   * listed as active always becomes retrievable, which is also the recovery path
   * after a systemic unknown-group outage; an inactive one stops being retrieved
   * while keeping its history.
   */
  public async synchronize(value: unknown): Promise<void> {
    const entries = [
      ...new Map(
        validateGroupCatalogue(value).map((entry) => [normalizeScopeIdentity(entry.id), entry]),
      ).values(),
    ];

    const stoppedAt = new Date();
    await this.prisma.$transaction(
      (transaction) =>
        synchronizeGroupDirectory(
          transaction,
          entries.map((entry) => ({
            id: entry.id,
            name: entry.name,
            isActive: entry.is_active,
          })),
          stoppedAt,
        ),
      { timeout: CATALOGUE_SYNC_TIMEOUT_MS },
    );
  }

  public async synchronizePartial(value: unknown): Promise<void> {
    validateGroupCatalogue(value);
    throw new Error('partial catalogue cannot replace the last complete catalogue');
  }

  public async allIds(): Promise<string[]> {
    return this.activeScopes();
  }

  public async get(id: string): Promise<GroupCatalogueEntry | undefined> {
    return new PostgresGroupRegistry(this.prisma).findGroup(id);
  }

  /** Group identifiers only: the catalogue never exposes an event ingestion. */
  public async activeScopes(): Promise<string[]> {
    return [...(await activeGroupScopeIds(this.prisma))];
  }
}
