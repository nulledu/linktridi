import type { CreativePeriod } from "./types";

export type CreativePeriodPreset = "panel" | "today" | "yesterday" | "7" | "14" | "30" | "custom";

export interface CreativePeriodSelection extends CreativePeriod {
  preset: CreativePeriodPreset;
}

const SP_OFFSET_MS = 3 * 60 * 60 * 1000;
const pad = (value: number) => String(value).padStart(2, "0");

function dateInSaoPaulo(now: Date): Date {
  return new Date(now.getTime() - SP_OFFSET_MS);
}

function isoDay(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function periodForPreset(preset: Exclude<CreativePeriodPreset, "panel" | "custom">, now = new Date()): CreativePeriod {
  const anchor = dateInSaoPaulo(now);
  const until = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
  if (preset === "yesterday") until.setUTCDate(until.getUTCDate() - 1);
  const since = new Date(until);
  const days = preset === "today" || preset === "yesterday" ? 1 : Number(preset);
  since.setUTCDate(since.getUTCDate() - days + 1);
  return { since: isoDay(since), until: isoDay(until) };
}
