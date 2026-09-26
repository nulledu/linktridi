import { z } from "zod";
import { layoutSchema, perfisSchema } from "./painel-layout";

export const themeSchema = z.object({
  primary: z.string(),
  secondary: z.string(),
  background: z.string(),
  logoUrl: z.string().url().nullable(),
});

/**
 * Um AVISO de parede: o recado que alguém escreve aqui e que aparece na TV.
 *
 * Três decisões que moram no formato, e não na tela:
 *
 * • `ate` é uma DATA, não um botão de desligar. Aviso de parede sem prazo vira
 *   paisagem — em uma semana ninguém mais lê "reunião amanhã às 15h", e o
 *   recado seguinte nasce descrente. Quem escreve diz até quando vale, e a
 *   parede se limpa sozinha.
 * • `assumeTela` separa "mais uma tela no rodízio" de "PARE tudo e leia isto".
 *   O segundo existe para o caso raro (queda de sistema, evacuação) e por isso
 *   é uma escolha explícita, nunca o padrão.
 * • `perfis` vazio = todas as paredes. Um aviso da doca não precisa aparecer
 *   na TV do comercial, e obrigar a escolher em toda vez faria o caminho comum
 *   (avisar todo mundo) custar mais que o incomum.
 */
export const avisoSchema = z.object({
  id: z.string().min(1),
  titulo: z.string().max(60).default(""),
  texto: z.string().min(1).max(280),
  ativo: z.boolean().default(true),
  /** `aviso` (roxo), `alerta` (âmbar), `parada` (vermelho), `festa` (verde). */
  tom: z.enum(["aviso", "alerta", "parada", "festa"]).default("aviso"),
  /** Vale a partir de / até (YYYY-MM-DD). Vazio = sem limite daquele lado. */
  de: z.string().max(10).nullable().optional(),
  ate: z.string().max(10).nullable().optional(),
  /** Ids dos perfis que mostram este aviso. Vazio = todas as paredes. */
  perfis: z.array(z.string()).max(16).default([]),
  /** Toma a tela inteira e para o rodízio enquanto estiver valendo. */
  assumeTela: z.boolean().default(false),
});

export type AvisoInput = z.infer<typeof avisoSchema>;

export const panelConfigSchema = z.object({
  theme: themeSchema,
  slideIntervalMs: z.number().int().min(3000).max(120000),
  refreshIntervalMs: z.number().int().min(5000).max(600000),
  goalSoundUrl: z.string().url().nullable(),
  monthlyRevenueGoal: z.number().min(0),
  trafficTaxPct: z.number().min(0).max(100),
  /**
   * Layout dos slides. OPCIONAL de propósito: config antiga (sem layout) segue
   * válida e a TV cai no `layoutPadrao()`, que reproduz o painel de sempre.
   * Sem isso, salvar a configuração de uma versão antiga apagaria o painel.
   */
  layout: layoutSchema.nullable().optional(),
  /**
   * Os PERFIS — os modelos de tela que existem para escolher.
   *
   * Também opcional: uma configuração antiga (só com `layout`) continua válida,
   * e a TV que já está na parede não muda de aparência sozinha. Quando `perfis`
   * existe, é ele que manda, e o `layout` fica como o desenho da TV que ainda
   * não escolheu perfil nenhum.
   */
  perfis: perfisSchema.nullable().optional(),
  /**
   * Os AVISOS que entram nas paredes — recado escrito aqui, no computador, que
   * aparece na TV sem ninguém ir até ela.
   *
   * Vive no mesmo JSON da configuração de propósito: a TV já lê `/api/config`
   * a cada ciclo, então o aviso chega pelo caminho que existe, sem tabela
   * nova, sem rota nova e sem uma requisição a mais por TV — que é a conta que
   * já pausou este projeto uma vez (ver CLAUDE.md, "poll é RITMO").
   */
  avisos: z.array(avisoSchema).max(20).nullable().optional(),
});

export type PanelConfigInput = z.infer<typeof panelConfigSchema>;
