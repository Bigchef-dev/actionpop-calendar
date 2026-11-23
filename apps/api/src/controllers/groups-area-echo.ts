import type { GroupAreaEcho, ParsedGroupArea } from '@actionpop/core';

/**
 * The territory as the consumer supplied it. `insee_commune` and `commune` are already one
 * deduplicated dimension, and the resolved commune names and EPCI members are deliberately not
 * echoed: the answer states the request it answers, not a derived list of codes.
 */
export function areaEcho(area: ParsedGroupArea): GroupAreaEcho {
  return {
    ...(area.country === undefined ? {} : { country: area.country }),
    ...(area.department === undefined ? {} : { department: area.department }),
    ...(area.communeIds === undefined || area.communeIds.length === 0
      ? {}
      : { communeIds: area.communeIds }),
    ...(area.epciIds === undefined || area.epciIds.length === 0 ? {} : { epci: area.epciIds }),
  };
}
