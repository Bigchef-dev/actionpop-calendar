/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([,;])/g, '\\$1')
    .replace(/\r?\n/g, '\\n');
}

const MAX_OCTETS = 75;

/**
 * RFC 5545 §3.1 content-line folding: a line longer than 75 octets is split on
 * an octet boundary and every continuation line starts with a single space. The
 * split never lands inside a multi-byte UTF-8 character.
 */
export function foldLine(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= MAX_OCTETS) return line;

  const chunks: string[] = [];
  let current = '';
  let currentOctets = 0;
  let limit = MAX_OCTETS;

  for (const character of line) {
    const octets = Buffer.byteLength(character, 'utf8');
    if (currentOctets + octets > limit) {
      chunks.push(current);
      current = character;
      currentOctets = octets;
      limit = MAX_OCTETS - 1; // continuation lines carry a leading space
      continue;
    }
    current += character;
    currentOctets += octets;
  }
  chunks.push(current);

  return chunks.join('\r\n ');
}

/** UTC basic-format instant, as required by DTSTAMP, DTSTART and DTEND. */
export function formatUtcInstant(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('calendar date is invalid');
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Joins content lines with CRLF and terminates the document with CRLF. */
export function joinLines(lines: readonly string[]): string {
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

export interface ContentLine {
  readonly name: string;
  readonly parameters?: Readonly<Record<string, string>>;
  readonly value: string;
}

/** Serializes one property, quoting parameter values only when RFC 5545 requires it. */
export function formatContentLine(line: ContentLine): string {
  const parameters = Object.entries(line.parameters ?? {})
    .map(([name, value]) => `;${name.toUpperCase()}=${formatParameterValue(value)}`)
    .join('');
  return `${line.name.toUpperCase()}${parameters}:${line.value}`;
}

function formatParameterValue(value: string): string {
  return /[;:,]/.test(value) ? `"${value.replace(/"/g, '')}"` : value;
}
