import { validateGroupCatalogue, type GroupCatalogueEntry } from '@actionpop/core';

export class GroupCatalogueRepository {
  private entries = new Map<string, GroupCatalogueEntry>();

  public async synchronize(value: unknown): Promise<void> {
    const entries = validateGroupCatalogue(value);
    const next = new Map(entries.map((entry) => [entry.id, entry]));
    this.entries = next;
  }

  public async synchronizePartial(value: unknown): Promise<void> {
    validateGroupCatalogue(value);
    throw new Error('partial catalogue cannot replace the last complete catalogue');
  }

  public activeScopes(): string[] {
    return [...this.entries.values()].filter((entry) => entry.is_active).map((entry) => entry.id);
  }

  public get(id: string): GroupCatalogueEntry | undefined {
    return this.entries.get(id);
  }
}