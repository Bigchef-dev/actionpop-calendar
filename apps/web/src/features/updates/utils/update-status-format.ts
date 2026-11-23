import type { UpdateCounts, UpdateState, UpdateStatusAnswer } from '../../../types';

const PARIS_TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const STATE_LABELS: Record<UpdateState, string> = {
  updating: 'Mise à jour en cours',
  up_to_date: 'Données à jour',
  stale: 'Données anciennes',
  partial: 'Dernière mise à jour partielle',
  unknown: 'État des mises à jour indisponible',
};

const OUTCOME_LABELS = {
  complete: 'réussi',
  partial: 'partiel',
  failed: 'échoué',
} as const;

export function stateLabel(state: UpdateState): string {
  return STATE_LABELS[state];
}

export function outcomeLabel(outcome: keyof typeof OUTCOME_LABELS): string {
  return OUTCOME_LABELS[outcome];
}

/** Groups thousands with a normal space so the figure stays readable in every browser. */
export function formatCount(value: number): string {
  const safe = Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  return String(safe).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** "n/total" for one kind: what the visitor asked to see explicitly. */
export function kindProgress(counts: UpdateCounts): string {
  return `${formatCount(counts.processed)}/${formatCount(counts.total)}`;
}

/** Relative French age, never in the future. */
export function formatAge(iso: string, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - Date.parse(iso));
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days} j`;
}

export function formatUpdateTime(iso: string): string {
  return PARIS_TIME.format(new Date(iso));
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}

function kindFigures(groups: UpdateCounts, events: UpdateCounts): string {
  return `Groupes ${kindProgress(groups)} · Événements ${kindProgress(events)}`;
}

/** One compact line: state, then the explicit group and event n/total figures. */
export function statusLine(answer: UpdateStatusAnswer, now: Date): string {
  const current = answer.current;
  if (answer.state === 'updating' && current !== null) {
    const failures =
      current.groups.failed > 0 ? ` · ${formatCount(current.groups.failed)} en échec` : '';
    const longer = current.takingLongerThanUsual ? ' · plus longue que prévu' : '';
    return `${stateLabel(answer.state)} · ${kindFigures(current.groups, current.events)}${failures}${longer}`;
  }
  if (answer.lastCompleted !== null) {
    const age = formatAge(answer.lastCompleted.completedAt, now);
    return `${stateLabel(answer.state)} · ${age} · ${kindFigures(
      answer.lastCompleted.groups,
      answer.lastCompleted.events,
    )}`;
  }
  if (!answer.available.lastCompleted) {
    return 'État des mises à jour indisponible';
  }
  return 'Aucune mise à jour connue';
}
