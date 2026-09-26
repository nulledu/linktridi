// ── O piso dos feriados: calculado em código, por ano ────────────────────────
// A camada de feriados tem três degraus (ver `feriados.ts`): a fonte externa,
// o cadastro manual e ESTE arquivo. Ele é o que garante que o calendário
// funciona sem rede e sem banco — abrir 2028 mostra Carnaval e Corpus Christi
// no dia certo antes de qualquer sincronização.
//
// A empresa fica em Cerqueira César — São Paulo — Brasil, e a lista é a
// dessa cadeia: Brasil → SP → o município. Feriado nacional é lei federal;
// o estadual é a Revolução Constitucionalista (9 de julho); o municipal é o
// aniversário da cidade (fundação em 10 de outubro de 1917). Padroeiro e
// outras datas locais não estão aqui de propósito: sem confirmação da lei
// municipal, o certo é o cadastro manual — que existe para isso.

import { diaDe, nesimoDiaDaSemana, pascoa, somarDias } from "./datas";
import type { Esfera, FeriadoRh } from "./tipos";

interface FeriadoFixo { mes: number; dia: number; nome: string; esfera: Esfera; facultativo?: boolean }

const FIXOS: FeriadoFixo[] = [
  { mes: 1,  dia: 1,  nome: "Confraternização Universal", esfera: "nacional" },
  { mes: 4,  dia: 21, nome: "Tiradentes", esfera: "nacional" },
  { mes: 5,  dia: 1,  nome: "Dia do Trabalho", esfera: "nacional" },
  { mes: 9,  dia: 7,  nome: "Independência do Brasil", esfera: "nacional" },
  { mes: 10, dia: 12, nome: "Nossa Senhora Aparecida", esfera: "nacional" },
  { mes: 11, dia: 2,  nome: "Finados", esfera: "nacional" },
  { mes: 11, dia: 15, nome: "Proclamação da República", esfera: "nacional" },
  // Lei 14.759/2023: feriado nacional desde 2024.
  { mes: 11, dia: 20, nome: "Dia da Consciência Negra", esfera: "nacional" },
  { mes: 12, dia: 25, nome: "Natal", esfera: "nacional" },
  { mes: 7,  dia: 9,  nome: "Revolução Constitucionalista", esfera: "estadual" },
  { mes: 10, dia: 10, nome: "Aniversário de Cerqueira César", esfera: "municipal" },
];

/** Os feriados do piso para um ano, ordenados por dia. */
export function feriadosBase(ano: number): FeriadoRh[] {
  const p = pascoa(ano);
  const moveis: FeriadoRh[] = [
    { dia: somarDias(p, -48), nome: "Carnaval", esfera: "nacional", origem: "base", facultativo: true },
    { dia: somarDias(p, -47), nome: "Carnaval", esfera: "nacional", origem: "base", facultativo: true },
    { dia: somarDias(p, -2),  nome: "Sexta-feira Santa", esfera: "nacional", origem: "base" },
    { dia: somarDias(p, 60),  nome: "Corpus Christi", esfera: "nacional", origem: "base", facultativo: true },
  ];
  const fixos: FeriadoRh[] = FIXOS
    .filter((f) => !(f.nome === "Dia da Consciência Negra" && ano < 2024))
    .map((f) => ({ dia: diaDe(ano, f.mes, f.dia), nome: f.nome, esfera: f.esfera, origem: "base", facultativo: f.facultativo }));
  return [...fixos, ...moveis].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
}

// ── Datas comemorativas ──────────────────────────────────────────────────────
// Não são folga: são o que o RH lembra de celebrar. Diferentes de feriado na
// tela (pílula, não faixa) e diferentes de evento interno (não têm dono, não
// se editam — quem quer uma data própria cria uma `comemorativa` na tabela).

export interface ComemorativaBase { dia: string; nome: string }

export function comemorativasBase(ano: number): ComemorativaBase[] {
  return [
    { dia: diaDe(ano, 3, 8),  nome: "Dia Internacional da Mulher" },
    { dia: diaDe(ano, 4, 28), nome: "Dia da Educação" },
    { dia: nesimoDiaDaSemana(ano, 5, 0, 2), nome: "Dia das Mães" },
    { dia: diaDe(ano, 6, 12), nome: "Dia dos Namorados" },
    { dia: nesimoDiaDaSemana(ano, 8, 0, 2), nome: "Dia dos Pais" },
    { dia: diaDe(ano, 9, 15), nome: "Dia do Cliente" },
    { dia: diaDe(ano, 10, 12), nome: "Dia das Crianças" },
    { dia: diaDe(ano, 10, 31), nome: "Halloween" },
    { dia: pascoa(ano), nome: "Páscoa" },
    { dia: diaDe(ano, 12, 31), nome: "Véspera de Ano-Novo" },
  ].sort((a, b) => (a.dia < b.dia ? -1 : 1));
}
