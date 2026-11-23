export type {
  AttachmentOutcome,
  GroupAttachmentRefresher,
  GroupDetailSource,
} from './group-attachment-outcome.js';

import {
  DEFAULT_STALE_AFTER_MS,
  PostgresGeographicReferenceRepository,
  enrichEventGeography,
  groupAttachmentFromGeography,
  persistAttachments,
  selectAttachmentCandidates,
  groupAddressOf,
  writeGroupLocations,
  type GeographicReferenceReader,
  type GroupAttachment,
  type AttachmentWrite,
  type GroupLocationInput,
} from '@actionpop/core';
import type { PrismaClient } from '@prisma/client';

import { toRawLocationFields } from '../ingestion/event-mapper.js';
import type {
  AttachmentOutcome,
  GroupAttachmentRefresher,
  GroupDetailSource,
  RefresherOptions,
} from './group-attachment-outcome.js';

/**
 * Attaches the listed groups of one reference version to a commune, department and country.
 *
 * The rule is the event rule, unchanged: the group detail states the same `location` shape as an
 * event, so its address goes through the same enricher and the same reference data. Nothing here
 * invents a second way to decide where a place is.
 *
 * A read failure is never fatal: the group keeps its previous attachment and is retried on the
 * next cycle, because an unreachable source must not cost the catalogue.
 */
const ZERO_COUNTS = {
  resolved: 0,
  incomplete: 0,
  international: 0,
  invalid: 0,
  skipped: 0,
  failed: 0,
};

export class PostgresGroupAttachmentRefresher implements GroupAttachmentRefresher {
  public constructor(
    private readonly prisma: PrismaClient,
    private readonly source: GroupDetailSource,
    private readonly options: RefresherOptions = {},
  ) {}

  public async refresh(version: string): Promise<AttachmentOutcome> {
    const reference = new PostgresGeographicReferenceRepository(this.prisma);
    const now = this.options.now?.() ?? new Date();
    const staleBefore = new Date(
      now.getTime() - (this.options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS),
    );
    const candidates = await selectAttachmentCandidates(this.prisma, version, staleBefore);
    if (candidates.length === 0) return { version, ...ZERO_COUNTS };

    const counts = { ...ZERO_COUNTS };
    const writes: AttachmentWrite[] = [];
    const locations: GroupLocationInput[] = [];

    for (const candidate of candidates) {
      const read = await this.attachOne(candidate.scopeId, version, reference).catch(
        () => undefined,
      );
      if (read === undefined) {
        counts.failed += 1;
        continue;
      }
      if (read === null) {
        counts.skipped += 1;
        continue;
      }

      counts[read.attachment.status] += 1;
      writes.push({
        scopeId: candidate.scopeId,
        attachment: await this.describe(read.attachment, version, reference),
      });
      locations.push({
        scopeId: candidate.scopeId,
        ...(read.address === undefined ? {} : { address: read.address }),
      });
    }

    // The address and its point are written in one transaction with the attachment, so a read
    // never sees a group attached to a place it does not yet state.
    await this.prisma.$transaction(async (transaction) => {
      await writeGroupLocations(transaction, locations);
      await persistAttachments(transaction, writes);
    });

    return { version, ...counts };
  }

  /** `null` means "nothing to write"; `undefined` means "the read failed". */
  private async attachOne(
    scopeId: string,
    version: string,
    reference: GeographicReferenceReader,
  ): Promise<{ attachment: GroupAttachment; address?: GroupLocationInput['address'] } | null> {
    const detail = await this.source.fetchGroupDetail(scopeId);
    const attachment = groupAttachmentFromGeography(
      await enrichEventGeography(toRawLocationFields(detail.location), reference),
    );
    if (attachment === undefined) return null;

    const address = groupAddressOf(detail.location);
    return { attachment, ...(address === undefined ? {} : { address }) };
  }

  /** Presentation names come from the same reference the identifiers were resolved against. */
  private async describe(
    attachment: GroupAttachment,
    version: string,
    reference: GeographicReferenceReader,
  ): Promise<GroupAttachment & { communeName?: string; departmentName?: string }> {
    const commune =
      attachment.communeId === undefined
        ? undefined
        : (await reference.findCommunesByCodes?.(version, [attachment.communeId]))?.[0];
    const department =
      attachment.departmentCode === undefined
        ? null
        : await reference.findDepartment(version, attachment.departmentCode);

    return {
      ...attachment,
      ...(commune === undefined ? {} : { communeName: commune.name }),
      ...(department === null || department === undefined
        ? {}
        : { departmentName: department.name }),
    };
  }
}
