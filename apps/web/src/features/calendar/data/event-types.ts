import catalogue from '@data/event-types.json';

import type { ActionType } from '../../../types';

export const NEUTRAL_EMOJI = '📅';
const NEUTRAL_COLOR = '#4C0297';

interface CatalogueEntry {
  label?: unknown;
  emoji?: unknown;
  color?: unknown;
  description?: unknown;
}

const MAX_DESCRIPTION_LABEL = 40;

/** The upstream description is the readable name when it stays short; otherwise the slug is used. */
function readableLabel(slug: string, description: string): string {
  if (description !== '' && description.length <= MAX_DESCRIPTION_LABEL) return description;
  const words = slug.replace(/-/g, ' ').trim();
  return words === '' ? slug : words.charAt(0).toUpperCase() + words.slice(1);
}

function toActionType(entry: CatalogueEntry): ActionType | null {
  if (typeof entry.label !== 'string' || entry.label.trim() === '') return null;
  const description = typeof entry.description === 'string' ? entry.description : '';
  return {
    slug: entry.label.trim(),
    label: readableLabel(entry.label.trim(), description),
    emoji: typeof entry.emoji === 'string' && entry.emoji !== '' ? entry.emoji : NEUTRAL_EMOJI,
    color: typeof entry.color === 'string' && entry.color !== '' ? entry.color : NEUTRAL_COLOR,
    description,
  };
}

const entries = Array.isArray(catalogue) ? (catalogue as CatalogueEntry[]) : [];

/** The action-type catalogue shipped with the site, keyed by the slug the feed publishes. */
export const ACTION_TYPES: readonly ActionType[] = entries
  .map(toActionType)
  .filter((entry): entry is ActionType => entry !== null);

const BY_SLUG = new Map(ACTION_TYPES.map((entry) => [entry.slug, entry]));

/** Known type, or a neutral fallback carrying the de-slugified name. */
export function actionTypeFor(slug: string | null): ActionType {
  if (slug === null) {
    return {
      slug: '',
      label: 'Action',
      emoji: NEUTRAL_EMOJI,
      color: NEUTRAL_COLOR,
      description: '',
    };
  }
  const known = BY_SLUG.get(slug);
  if (known !== undefined) return known;
  const words = slug.replace(/-/g, ' ').trim();
  return {
    slug,
    label: words === '' ? slug : words.charAt(0).toUpperCase() + words.slice(1),
    emoji: NEUTRAL_EMOJI,
    color: NEUTRAL_COLOR,
    description: '',
  };
}
