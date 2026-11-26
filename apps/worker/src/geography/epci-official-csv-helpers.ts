import type { EpciKind } from '@actionpop/core';

export interface MutableReference {
  name: string;
  kind: EpciKind;
  departmentCodes: Set<string>;
  active: boolean;
}

export function readActive(
  value: string | undefined,
  activeIds: ReadonlySet<string> | undefined,
  epciId: string,
): boolean {
  const stated = (value ?? '').trim().toLowerCase();
  if (stated !== '' && ['false', '0', 'inactive', 'supprime', 'supprimé'].includes(stated)) {
    return false;
  }
  if (activeIds !== undefined && !activeIds.has(epciId)) return false;
  return true;
}

export function findColumn(header: readonly string[], candidates: readonly string[]): number {
  for (const candidate of candidates) {
    const index = header.indexOf(candidate);
    if (index !== -1) return index;
  }
  return -1;
}

/** Minimal CSV splitter: official exports quote with `"` and escape by doubling it. */
export function splitRow(row: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < row.length; index += 1) {
    const character = row[index] ?? '';
    if (quoted) {
      if (character === '"') {
        if (row[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      values.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  values.push(current);
  return values;
}
