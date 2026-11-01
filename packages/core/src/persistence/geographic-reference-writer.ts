import type { Prisma, PrismaClient } from '@prisma/client';

import type { IndexedReference } from '../geography/commune-name-index.js';
import type { Diagnostic } from '../geography/reference-types.js';

export interface StageReferenceInput {
  version: string;
  source: string;
  publicationDate: string;
  license: string;
  index: IndexedReference;
}

export type ActivationResult =
  { status: 'active' } | { status: 'retryable'; diagnostics: Diagnostic[] };

const BATCH_SIZE = 1000;

// Staging inserts every commune of the dataset (tens of thousands of rows) inside one
// transaction. The Prisma default of five seconds is too tight for that volume through a
// driver adapter, and a rollback must still cover the whole staging step.
const STAGE_TRANSACTION_TIMEOUT_MS = 60_000;

export class PostgresGeographicReferenceWriter {
  public constructor(private readonly prisma: PrismaClient) {}

  public async stage(input: StageReferenceInput): Promise<void> {
    const existing = await this.prisma.geographicReferenceVersion.findUnique({
      where: { version: input.version },
    });
    if (existing !== null) return;

    const stageAll = async (transaction: Prisma.TransactionClient): Promise<void> => {
      await transaction.geographicReferenceVersion.create({
        data: {
          version: input.version,
          status: 'staged',
          source: input.source,
          publicationDate: input.publicationDate,
          ingestedAt: new Date(),
          license: input.license,
          communeCount: input.index.communes.length,
          departmentCount: input.index.departments.length,
          checksum: input.index.checksum,
          validationErrors: [],
        },
      });

      for (const chunk of chunked(input.index.departments, BATCH_SIZE)) {
        await transaction.departmentReference.createMany({
          data: chunk.map((department) => ({
            versionId: input.version,
            code: department.code,
            name: department.name,
            communeCount: department.communeCount,
          })),
        });
      }

      for (const chunk of chunked(input.index.communes, BATCH_SIZE)) {
        await transaction.communeReference.createMany({
          data: chunk.map((commune) => ({
            versionId: input.version,
            inseeCode: commune.inseeCode,
            name: commune.name,
            normalizedName: commune.normalizedName,
            pronounFreeNormalizedName: commune.pronounFreeNormalizedName,
            postalCodes: commune.postalCodes,
            departmentCode: commune.departmentCode,
            ...(commune.population === undefined ? {} : { population: commune.population }),
          })),
        });
      }
    };

    await this.prisma.$transaction(stageAll, { timeout: STAGE_TRANSACTION_TIMEOUT_MS });
  }

  public async activate(version: string): Promise<ActivationResult> {
    try {
      await this.prisma.$transaction(async (transaction) => {
        await transaction.geographicReferenceVersion.updateMany({
          where: { status: 'active' },
          data: { status: 'superseded' },
        });
        await transaction.geographicReferenceVersion.update({
          where: { version },
          data: { status: 'active' },
        });
      });
      return { status: 'active' };
    } catch (error) {
      return { status: 'retryable', diagnostics: [activationFailure(error)] };
    }
  }

  public async reject(version: string, diagnostics: Diagnostic[]): Promise<void> {
    await this.prisma.geographicReferenceVersion.update({
      where: { version },
      data: {
        status: 'rejected',
        validationErrors: JSON.parse(JSON.stringify(diagnostics)),
      },
    });
  }
}

function chunked<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function activationFailure(error: unknown): Diagnostic {
  const message = error instanceof Error ? error.message : 'activation failed';
  const isUniqueViolation =
    message.includes('geographic_reference_version_one_active') ||
    message.includes('Unique constraint');
  return {
    code: isUniqueViolation ? 'reference_activation_conflict' : 'reference_activation_failed',
    field: 'geographic_reference_version.status',
    message,
    severity: 'error',
  };
}
