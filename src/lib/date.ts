import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";

export function daysTogether(startDate: string) {
  return Math.max(0, differenceInCalendarDays(new Date(), parseISO(startDate)) + 1);
}

export function prettyDate(date: string) {
  return format(parseISO(date), "yyyy年M月d日", { locale: zhCN });
}

export function daysUntil(date: string) {
  const now = new Date();
  const parsed = parseISO(date);
  const next = new Date(now.getFullYear(), parsed.getMonth(), parsed.getDate());
  if (next < now) next.setFullYear(now.getFullYear() + 1);
  return differenceInCalendarDays(next, now);
}
