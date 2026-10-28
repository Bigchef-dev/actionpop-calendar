import { validateGroupCatalogue, type GroupCatalogueEntry } from '@actionpop/core';
import { Prisma, type PrismaClient } from '@prisma/client';

const CATALOGUE_UPSERT_CHUNK_SIZE = 500;

function catalogueValues(entries: GroupCatalogueEntry[]): Prisma.Sql {
  return Prisma.join(entries.map(entry => Prisma.sql`(
    ${entry.id},
    ${entry.name},
    ${entry.is_active},
    ${entry.type ?? null},
    ${typeof entry.subtype === 'number' ? entry.subtype : null},
    ${entry.is_certified ?? null},
    ${entry.link ?? null},
    ${entry.filter ?? null}
  )`));
}

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
  public constructor(private readonly redis: RedisValueStore, private readonly key = 'actionpop:catalogue:groups') {}

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

  public async synchronize(value: unknown): Promise<void> {
    const entries = [...new Map(validateGroupCatalogue(value).map(entry => [entry.id, entry])).values()];
    if (entries.length === 0) return;

    await this.prisma.$transaction(async (transaction) => {
      for (let offset = 0; offset < entries.length; offset += CATALOGUE_UPSERT_CHUNK_SIZE) {
        const chunk = entries.slice(offset, offset + CATALOGUE_UPSERT_CHUNK_SIZE);
        await transaction.$executeRaw(Prisma.sql`
          INSERT INTO "group_scope" (
            "scope_id", "display_name", "active", "scope_type",
            "source_subtype", "certified", "source_link", "source_filter"
          )
          VALUES ${catalogueValues(chunk)}
          ON CONFLICT ("scope_id") DO UPDATE SET
            "display_name" = EXCLUDED."display_name",
            "active" = EXCLUDED."active",
            "scope_type" = COALESCE(EXCLUDED."scope_type", "group_scope"."scope_type"),
            "source_subtype" = EXCLUDED."source_subtype",
            "certified" = COALESCE(EXCLUDED."certified", "group_scope"."certified"),
            "source_link" = COALESCE(EXCLUDED."source_link", "group_scope"."source_link"),
            "source_filter" = COALESCE(EXCLUDED."source_filter", "group_scope"."source_filter")
        `);
      }
    }, { timeout: 60_000 });
  }

  public async synchronizePartial(value: unknown): Promise<void> {
    validateGroupCatalogue(value);
    throw new Error('partial catalogue cannot replace the last complete catalogue');
  }

  public async allIds(): Promise<string[]> {
    const entries = await this.prisma.groupScope.findMany({
      where: { active: true },
      select: { scopeId: true },
    });
    return entries.map((entry) => entry.scopeId);
  }

  public async get(id: string): Promise<GroupCatalogueEntry | undefined> {
    const entry = await this.prisma.groupScope.findUnique({ where: { scopeId: id } });
    if (entry === null) return undefined;
    return {
      id: entry.scopeId,
      name: entry.displayName ?? entry.scopeId,
      is_active: entry.active,
      ...(entry.scopeType === null ? {} : { type: entry.scopeType }),
      ...(entry.sourceSubtype === null ? {} : { subtype: entry.sourceSubtype }),
      ...(entry.certified === null ? {} : { is_certified: entry.certified }),
      ...(entry.sourceLink === null ? {} : { link: entry.sourceLink }),
      ...(entry.sourceFilter === null ? {} : { filter: entry.sourceFilter }),
    };
  }

  public async activeScopes(): Promise<string[]> {
    return this.allIds();
  }
}
