export type KarmaHistoryEvent = { date: string; title: string; text: string };

export type KarmaTask = {
  id: string;
  owner: string;
  status: string;
  due: string;
  completedAt?: string;
  history: KarmaHistoryEvent[];
  karmaExcluded: boolean;
};

export type KarmaIdentity = {
  id: string;
  name: string;
};

export type KarmaResult = {
  owner: string;
  score: number;
  total: number;
  completed: number;
  onTime: number;
  late: number;
  overdue: number;
  transfers: number;
  volumePoints: number;
  onTimePoints: number;
  latePenalty: number;
  overduePenalty: number;
  transferPenalty: number;
};

export const KARMA_RULES = {
  base: 50,
  volumePerTask: 1,
  volumeCap: 10,
  onTimeCompletion: 6,
  lateCompletion: -4,
  overdue: -9,
  transfer: -3,
  minimum: 0,
  maximum: 100,
} as const;

// Exact aliases confirmed against the responsible directory and the source tasks.
// Do not add surname-only aliases: they can merge different people.
export const CONFIRMED_OWNER_ALIASES: Record<string, string> = {
  "Юнгеров Владимир Викторович": "Юнгеров Владимир Владимирович",
};

export function calculateKarma(tasks: KarmaTask[], now: number, identities: KarmaIdentity[]): KarmaResult[] {
  const identityIndex = buildIdentityIndex(identities);
  const byOwner = new Map<string, { identity: KarmaIdentity; tasks: KarmaTask[] }>();

  for (const task of tasks) {
    if (task.karmaExcluded || task.status === "Снято") continue;
    const taskIdentityIds = new Set<string>();
    for (const owner of splitPeople(task.owner)) {
      const identity = identityIndex.get(ownerLookupKey(owner));
      if (!identity || taskIdentityIds.has(identity.id)) continue;
      taskIdentityIds.add(identity.id);
      const current = byOwner.get(identity.id);
      byOwner.set(identity.id, { identity, tasks: [...(current?.tasks ?? []), task] });
    }
  }

  return [...byOwner.values()].map(({ identity, tasks: ownerTasks }) => {
    let completed = 0;
    let onTime = 0;
    let late = 0;
    let overdue = 0;
    let transfers = 0;

    for (const task of ownerTasks) {
      const completion = findCompletionTime(task.completedAt, task.history);
      const due = task.due ? new Date(`${task.due}T23:59:59`).getTime() : Number.NaN;
      const isCompleted = task.status === "Выполнено";

      transfers += task.history.filter((event) => /Срок(?: измен[её]н| перенес[её]н)/i.test(`${event.title} ${event.text}`)).length;
      if (isCompleted) {
        completed += 1;
        if (completion !== null && Number.isFinite(due)) {
          if (completion <= due) onTime += 1;
          else late += 1;
        }
      } else if (task.status === "Просрочено" || (Number.isFinite(due) && due < now)) {
        overdue += 1;
      }
    }

    const volumePoints = Math.min(KARMA_RULES.volumeCap, ownerTasks.length * KARMA_RULES.volumePerTask);
    const onTimePoints = onTime * KARMA_RULES.onTimeCompletion;
    const latePenalty = late * Math.abs(KARMA_RULES.lateCompletion);
    const overduePenalty = overdue * Math.abs(KARMA_RULES.overdue);
    const transferPenalty = transfers * Math.abs(KARMA_RULES.transfer);
    const score = clamp(
      KARMA_RULES.base + volumePoints + onTimePoints - latePenalty - overduePenalty - transferPenalty,
      KARMA_RULES.minimum,
      KARMA_RULES.maximum,
    );

    return {
      owner: identity.name, score, total: ownerTasks.length, completed, onTime, late, overdue, transfers,
      volumePoints, onTimePoints, latePenalty, overduePenalty, transferPenalty,
    };
  }).sort((left, right) => right.score - left.score || right.onTime - left.onTime || left.owner.localeCompare(right.owner, "ru"));
}

function buildIdentityIndex(identities: KarmaIdentity[]) {
  const index = new Map<string, KarmaIdentity | null>();

  for (const identity of identities) {
    const key = ownerLookupKey(identity.name);
    const existing = index.get(key);
    index.set(key, existing && existing.id !== identity.id ? null : identity);
  }

  for (const [alias, canonicalName] of Object.entries(CONFIRMED_OWNER_ALIASES)) {
    const aliasKey = ownerLookupKey(alias);
    if (index.has(aliasKey)) continue;
    const canonical = index.get(ownerLookupKey(canonicalName));
    if (canonical) index.set(aliasKey, canonical);
  }

  return index;
}

function ownerLookupKey(value: string) {
  return value
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("ru");
}

function findCompletionTime(completedAt: string | undefined, history: KarmaHistoryEvent[]) {
  if (completedAt) {
    const explicit = new Date(`${completedAt}T12:00:00`).getTime();
    if (Number.isFinite(explicit)) return explicit;
  }
  const event = history.find((item) => /Выполнение подтверждено|Отчет исполнителя/i.test(item.title));
  if (!event) return null;
  const match = event.date.match(/(\d{2})\.(\d{2})\.(\d{4})(?:,?\s+(\d{2}):(\d{2}))?/);
  if (!match) return null;
  const [, day, month, year, hours = "12", minutes = "00"] = match;
  const value = new Date(`${year}-${month}-${day}T${hours}:${minutes}:00`).getTime();
  return Number.isFinite(value) ? value : null;
}

function splitPeople(value: string) {
  return value.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
