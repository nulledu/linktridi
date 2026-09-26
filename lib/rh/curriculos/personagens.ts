// ── Os dois personagens do módulo de Currículos ──────────────────────────────
// Ele (cabelo curto, acenando) recebe e orienta; ela (cabelo longo) aparece
// no que é formação e na conclusão. Os arquivos são recortes em WebP com
// fundo transparente, em `public/curriculo/personagens/` — as ilustrações
// oficiais, sem retoque de roupa, proporção ou expressão.
//
// Cada pose tem um USO. A tela escolhe pelo uso ("recepção", "sucesso"), não
// pelo arquivo — trocar a arte de um uso é mudar uma linha aqui.

export type Pose =
  | "ele-acenando" | "ele-celular" | "ele-ideia" | "ele-joinha"
  | "ela-pensando" | "ela-estudando" | "ela-curriculo" | "ela-comemorando";

export const POSES: { id: Pose; nome: string; uso: string }[] = [
  { id: "ele-acenando", nome: "Ele, acenando", uso: "Recepção" },
  { id: "ela-pensando", nome: "Ela, pensando", uso: "Explicação e estado vazio" },
  { id: "ela-estudando", nome: "Ela, com caderno", uso: "Formação" },
  { id: "ele-celular", nome: "Ele, com celular", uso: "Orientação e contato" },
  { id: "ele-ideia", nome: "Ele, com tablet e ideia", uso: "Perguntas abertas e carregamento" },
  { id: "ela-curriculo", nome: "Ela, com currículo", uso: "Envio do currículo" },
  { id: "ela-comemorando", nome: "Ela, comemorando", uso: "Sucesso" },
  { id: "ele-joinha", nome: "Ele, joinha", uso: "Confirmação" },
];

export const ehPose = (v: unknown): v is Pose => typeof v === "string" && POSES.some((p) => p.id === v);

/**
 * Versão dos arquivos: entra na URL pra o navegador (e a CDN) guardarem a
 * imagem por um ano sem perguntar de novo. Trocou a arte? Suba o número.
 */
export const VERSAO_PERSONAGENS = 2;
export const srcDaPose = (p: Pose) => `/curriculo/personagens/${p}.webp?v=${VERSAO_PERSONAGENS}`;

/** Tamanho real de cada arquivo (recortado rente, 440px de altura, ~15 KB).
 *  Vai no `<img width height>`: o espaço fica reservado antes de a imagem
 *  chegar, e nada pula na tela quando ela aparece. */
export const DIMENSOES: Record<Pose, [number, number]> = {
  "ela-pensando": [420, 440], "ele-acenando": [339, 440], "ela-estudando": [360, 440], "ele-joinha": [326, 440],
  "ele-ideia": [361, 440], "ela-comemorando": [372, 440], "ele-celular": [328, 440], "ela-curriculo": [430, 440],
};

/** Pose por SITUAÇÃO de interface — o painel do RH e o formulário usam a mesma. */
export const POSE_DO_USO = {
  recepcao: "ele-acenando",
  explicacao: "ela-pensando",
  orientacao: "ele-celular",
  carregando: "ele-ideia",
  vazio: "ela-pensando",
  sucesso: "ela-comemorando",
  confirmacao: "ele-joinha",
} as const satisfies Record<string, Pose>;
