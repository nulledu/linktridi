"use client";

/* ── Calendário do sistema — o Calendar / RangeCalendar do HeroUI v3 ─────────
   Uma grade só pro app inteiro: `CalendarioDia` (uma data, com seletor de ano)
   e `CalendarioIntervalo` (de..até). Quem abre a folha continua sendo o dono
   dela — `FolhaAncorada` do PeriodPicker, `Panel` do GlassPicker —, então
   portal, folha presa embaixo no celular e "tocou fora" não mudam.

   A API é de string "YYYY-MM-DD", igual ao resto do app: o `CalendarDate` do
   `@internationalized/date` não sai daqui. Sem fuso: `parseDate` é data civil,
   não `new Date`. Visual e tokens em `calendario.css`. */

import { Calendar, RangeCalendar } from "@heroui/react";
import { parseDate, type CalendarDate, type DateValue } from "@internationalized/date";
import { I18nProvider } from "react-aria-components";
import "./calendario.css";

const data = (iso?: string): CalendarDate | undefined => {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  try { return parseDate(iso); } catch { return undefined; }
};
const iso = (d: DateValue) => d.toString().slice(0, 10);

/** Uma data. `min`/`max` apagam o dia fora da faixa (não somem). O cabeçalho
 *  abre a grade de anos — nascimento em 1990 não custa 432 toques na seta. */
export function CalendarioDia({ valor, onChange, min, max, rotulo = "Data" }: {
  valor: string;
  onChange: (iso: string) => void;
  min?: string; max?: string; rotulo?: string;
}) {
  const v = data(valor);
  return (
    <I18nProvider locale="pt-BR">
      <Calendar aria-label={rotulo} className="ui-calendario" value={v ?? null}
        defaultFocusedValue={v} minValue={data(min)} maxValue={data(max)}
        onChange={(d) => d && onChange(iso(d))}>
        <Calendar.Header>
          <Calendar.YearPickerTrigger>
            <Calendar.YearPickerTriggerHeading />
            <Calendar.YearPickerTriggerIndicator />
          </Calendar.YearPickerTrigger>
          <Calendar.NavButton slot="previous" />
          <Calendar.NavButton slot="next" />
        </Calendar.Header>
        <Calendar.Grid>
          <Calendar.GridHeader>{(dia) => <Calendar.HeaderCell>{dia}</Calendar.HeaderCell>}</Calendar.GridHeader>
          <Calendar.GridBody>{(d) => <Calendar.Cell date={d} />}</Calendar.GridBody>
        </Calendar.Grid>
        <Calendar.YearPickerGrid>
          <Calendar.YearPickerGridBody>{({ year }) => <Calendar.YearPickerCell year={year} />}</Calendar.YearPickerGridBody>
        </Calendar.YearPickerGrid>
      </Calendar>
    </I18nProvider>
  );
}

/** Intervalo de..até. Dois toques: o primeiro fixa a ponta, o segundo fecha
 *  (em qualquer ordem — a grade põe o menor no início). */
export function CalendarioIntervalo({ de, ate, onChange, min, max, rotulo = "Período" }: {
  de: string; ate: string;
  onChange: (de: string, ate: string) => void;
  min?: string; max?: string; rotulo?: string;
}) {
  const a = data(de), b = data(ate);
  return (
    <I18nProvider locale="pt-BR">
      <RangeCalendar aria-label={rotulo} className="ui-calendario" value={a && b ? { start: a, end: b } : null}
        defaultFocusedValue={a} minValue={data(min)} maxValue={data(max)}
        onChange={(r) => r && onChange(iso(r.start), iso(r.end))}>
        <RangeCalendar.Header>
          <RangeCalendar.YearPickerTrigger>
            <RangeCalendar.YearPickerTriggerHeading />
            <RangeCalendar.YearPickerTriggerIndicator />
          </RangeCalendar.YearPickerTrigger>
          <RangeCalendar.NavButton slot="previous" />
          <RangeCalendar.NavButton slot="next" />
        </RangeCalendar.Header>
        <RangeCalendar.Grid>
          <RangeCalendar.GridHeader>{(dia) => <RangeCalendar.HeaderCell>{dia}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
          <RangeCalendar.GridBody>{(d) => <RangeCalendar.Cell date={d} />}</RangeCalendar.GridBody>
        </RangeCalendar.Grid>
        <RangeCalendar.YearPickerGrid>
          <RangeCalendar.YearPickerGridBody>{({ year }) => <RangeCalendar.YearPickerCell year={year} />}</RangeCalendar.YearPickerGridBody>
        </RangeCalendar.YearPickerGrid>
      </RangeCalendar>
    </I18nProvider>
  );
}
