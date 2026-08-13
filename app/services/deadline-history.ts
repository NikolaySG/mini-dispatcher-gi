export type DeadlineHistoryEvent = { date: string; title: string; text: string };

export type DeadlineTransfer = {
  changedAt: string;
  from: string;
  to: string;
};

const DATE_PATTERN = "(\\d{2}\\.\\d{2}\\.\\d{4})";
const CHANGE_PATTERN = new RegExp(`Срок(?: измен[её]н| перенес[её]н)(?: с ${DATE_PATTERN})?(?: на| →) ${DATE_PATTERN}`, "i");

export function getDeadlineTransfers(history: DeadlineHistoryEvent[]): DeadlineTransfer[] {
  return [...history].reverse().flatMap((event) => {
    const match = event.text.match(CHANGE_PATTERN);
    if (!match) return [];
    return [{ changedAt: event.date, from: match[1] ?? "не зафиксирован", to: match[2] }];
  });
}

export function formatStoredDate(date: string) {
  if (!date) return "Не определён";
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}.${month}.${year}` : date;
}
