import type { Prisma } from '@prisma/client';

import type { Diagnostic } from '../geography/reference-types.js';

export function readDiagnostics(value: Prisma.JsonValue | null): Diagnostic[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const candidate = entry as Record<string, unknown>;
    const { code, field, message, severity } = candidate;
    if (
      typeof code !== 'string' ||
      typeof field !== 'string' ||
      typeof message !== 'string' ||
      (severity !== 'warning' && severity !== 'error')
    ) {
      return [];
    }
    return [{ code, field, message, severity }];
  });
}
