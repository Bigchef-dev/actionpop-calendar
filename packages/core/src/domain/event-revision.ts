import { createHash } from 'node:crypto';

export interface NormalizedCalendarContent {
  sourceEventId: string;
  summary: string;
  startTime: string;
  endTime: string;
  locationId?: string;
  sourceUrl?: string;
  description?: string;
}

export interface EventRevision extends NormalizedCalendarContent {
  contentHash: string;
  sequence: number;
}

function normalizeCalendarContent(content: NormalizedCalendarContent): NormalizedCalendarContent {
  const normalizedContent: NormalizedCalendarContent = {
    sourceEventId: content.sourceEventId,
    summary: content.summary,
    startTime: content.startTime,
    endTime: content.endTime,
  };

  if (content.locationId !== undefined) normalizedContent.locationId = content.locationId;
  if (content.sourceUrl !== undefined) normalizedContent.sourceUrl = content.sourceUrl;
  if (content.description !== undefined) normalizedContent.description = content.description;

  return normalizedContent;
}

export function hashCalendarContent(content: NormalizedCalendarContent): string {
  const normalizedContent = normalizeCalendarContent(content);
  return createHash('sha256').update(JSON.stringify(normalizedContent)).digest('hex');
}

export function nextEventRevision(
  content: NormalizedCalendarContent,
  previous?: Pick<EventRevision, 'contentHash' | 'sequence'>,
): EventRevision {
  const contentHash = hashCalendarContent(content);
  let sequence = 0;

  if (previous !== undefined) {
    const contentChanged = previous.contentHash !== contentHash;
    sequence = contentChanged ? previous.sequence + 1 : previous.sequence;
  }

  return {
    ...normalizeCalendarContent(content),
    contentHash,
    sequence,
  };
}