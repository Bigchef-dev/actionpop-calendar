export type GeographicStatus =
  | 'resolved'
  | 'national'
  | 'international'
  | 'incomplete'
  | 'invalid'
  | 'unavailable';

export type DepartmentSource = 'stated' | 'reference';

export type DiagnosticSeverity = 'warning' | 'error';

export interface Diagnostic {
  code: string;
  field: string;
  message: string;
  severity: DiagnosticSeverity;
}

export interface RawLocationFields {
  country?: string;
  departement?: string;
  communeName?: string;
  city?: string;
  zip?: string;
}

export interface GeographicAttachment {
  geographicStatus: GeographicStatus;
  diagnostics: Diagnostic[];
  referenceVersion?: string;
  countryCode?: string;
  communeId?: string;
  departmentCode?: string;
  departmentSource?: DepartmentSource;
  rawDepartmentCode?: string;
  rawCommuneName?: string;
}

export interface CommuneReferenceRecord {
  inseeCode: string;
  name: string;
  normalizedName: string;
  pronounFreeNormalizedName: string;
  postalCodes: string[];
  departmentCode: string;
  population?: number;
}

export interface DepartmentReferenceRecord {
  code: string;
  name: string;
  communeCount: number;
}

export interface GeographicReferenceVersionRecord {
  version: string;
  status: string;
  source: string;
  publicationDate: string;
  ingestedAt: string;
  license: string;
  communeCount: number;
  departmentCount: number;
  checksum: string;
}
