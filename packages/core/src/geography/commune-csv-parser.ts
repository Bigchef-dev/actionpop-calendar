export interface CommuneCsvRow {
  inseeCode: string;
  name: string;
  pronounFreeName: string;
  postalCodes: string[];
  departmentCode: string;
  departmentName: string;
  population?: number;
}

export interface CommuneCsvParseResult {
  rows: CommuneCsvRow[];
  errors: string[];
}

export const COMMUNE_CSV_COLUMNS = [
  'code_insee',
  'nom_standard',
  'nom_sans_pronom',
  'code_postal',
  'codes_postaux',
  'dep_code',
  'dep_nom',
] as const;

export function parseCommuneCsvLines(lines: string[]): CommuneCsvParseResult {
  const records = parseRfc4180(lines);
  if (records.length === 0) return { rows: [], errors: ['the CSV file is empty'] };

  const header = records[0] ?? [];
  const indexes = new Map<number, number>();
  const errors: string[] = [];

  for (const column of COMMUNE_CSV_COLUMNS) {
    const index = header.indexOf(column);
    if (index === -1) errors.push(`missing required column "${column}"`);
    else indexes.set(index, COMMUNE_CSV_COLUMNS.indexOf(column));
  }
  if (errors.length > 0) return { rows: [], errors };

  const rows: CommuneCsvRow[] = [];
  for (let lineNumber = 1; lineNumber < records.length; lineNumber += 1) {
    const record = records[lineNumber];
    if (record === undefined) continue;
    if (record.length === 1 && (record[0] ?? '') === '') continue;

    const primary = header.indexOf('code_postal');
    const list = header.indexOf('codes_postaux');
    const postalCodes = expandPostalCodes(
      primary === -1 ? '' : (record[primary] ?? ''),
      list === -1 ? '' : (record[list] ?? ''),
    );
    const row: CommuneCsvRow = {
      inseeCode: valueAt(record, header, 'code_insee'),
      name: valueAt(record, header, 'nom_standard'),
      pronounFreeName: valueAt(record, header, 'nom_sans_pronom'),
      postalCodes,
      departmentCode: valueAt(record, header, 'dep_code'),
      departmentName: valueAt(record, header, 'dep_nom'),
      ...parsePopulation(valueAt(record, header, 'population')),
    };

    const missing = (
      [
        ['code_insee', row.inseeCode],
        ['nom_standard', row.name],
        ['dep_code', row.departmentCode],
        ['dep_nom', row.departmentName],
      ] as const
    ).filter(([, value]) => value === '');
    if (missing.length > 0) {
      errors.push(`row ${lineNumber + 1}: missing ${missing.map(([column]) => column).join(', ')}`);
      continue;
    }

    function parsePopulation(value: string): { population: number } | Record<string, never> {
      if (value === '') return {};
      const population = Number(value);
      return Number.isInteger(population) && population >= 0 ? { population } : {};
    }
    rows.push(row);
  }

  return { rows, errors };
}

function valueAt(record: string[], header: string[], column: string): string {
  const index = header.indexOf(column);
  return index === -1 ? '' : (record[index] ?? '').trim();
}

function expandPostalCodes(primary: string, list: string): string[] {
  const codes = new Set<string>();
  for (const candidate of [...primary.split(','), ...list.split(',')]) {
    const code = candidate.trim();
    if (code !== '') codes.add(code);
  }
  return [...codes].sort();
}

export function parseRfc4180(lines: string[]): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;

  for (const line of lines) {
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (quoted) {
        if (character === '"') {
          if (line[index + 1] === '"') {
            field += '"';
            index += 1;
          } else {
            quoted = false;
          }
        } else {
          field += character;
        }
        continue;
      }

      if (character === '"') {
        quoted = true;
      } else if (character === ',') {
        record.push(field);
        field = '';
      } else {
        field += character;
      }
    }

    if (quoted) {
      field += '\n';
      continue;
    }

    record.push(field);
    records.push(record);
    record = [];
    field = '';
  }

  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records;
}
