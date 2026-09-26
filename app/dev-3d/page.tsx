// Banco de provas do módulo 3D (biblioteca + operação das impressoras).
//
// A tela real vive em /3d, atrás de login e da chave `3d` — não dá pra digitar
// credencial nem conferir kanban lendo diff. Aqui a central inteira aparece
// com dado parecido com o real (máquinas, programações em todo status, hoje e
// histórico), nos dois temas e a partir de 320px. O palco 3D roda com um STL
// inline, sem sessão nem B2.
//
// O `npm run rolagem` descobre as rotas /dev-* sozinho: esta entra na medição
// sem ninguém precisar cadastrá-la.
import { notFound } from "next/navigation";
import { Area3DTabs } from "../(plataforma)/3d/Area3DTabs";
import { Biblioteca3D } from "../(plataforma)/3d/Biblioteca3D";
import { Visualizador3D } from "../(plataforma)/3d/Visualizador3D";
import { hojeSP, somaDias } from "@/lib/atividades-visao";
import type { Arquivo3D, Maquina3D, Programacao3D } from "@/lib/impressao3d-const";

export const dynamic = "force-dynamic";

// STL ASCII de uma pecinha em L (dois blocos), gerado aqui mesmo: o palco 3D
// funciona offline, sem sessão e sem B2 — é o three.js de verdade rodando.
function bloco(x: number, y: number, z: number, l: number, p: number, a: number): string {
  const v = [
    [x, y, z], [x + l, y, z], [x + l, y + p, z], [x, y + p, z],
    [x, y, z + a], [x + l, y, z + a], [x + l, y + p, z + a], [x, y + p, z + a],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4],
    [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3],
  ];
  return faces
    .map((f) => `facet normal 0 0 0\nouter loop\n${f.map((i) => `vertex ${v[i].join(" ")}`).join("\n")}\nendloop\nendfacet`)
    .join("\n");
}
const STL_PROVA = `data:model/stl,${encodeURIComponent(
  `solid prova\n${bloco(0, 0, 0, 40, 24, 8)}\n${bloco(0, 0, 8, 12, 24, 22)}\nendsolid prova`,
)}`;

const base = {
  descricao: "",
  mime: "application/octet-stream",
  criadoPor: null,
  atualizadoEm: "2026-09-20T12:00:00Z",
};

const ARQUIVOS: Arquivo3D[] = [
  { ...base, id: "00000000-0000-4000-8000-000000000001", nome: "suporte-bobina-v3.stl", url: "/api/arquivos/modelos/2026/09/prova-1.stl", formato: "stl", tamanho: 4_812_331, tags: ["suporte", "ender-3"], criadoEm: "2026-09-18T09:12:00Z", descricao: "Suporte de bobina reforçado, PLA, 20% de preenchimento." },
  { ...base, id: "00000000-0000-4000-8000-000000000002", nome: "engrenagem-24d.3mf", url: "/api/arquivos/modelos/2026/09/prova-2.3mf", formato: "3mf", tamanho: 1_204_501, tags: ["engrenagem", "petg"], criadoEm: "2026-09-17T15:40:00Z" },
  { ...base, id: "00000000-0000-4000-8000-000000000003", nome: "caixa-sensor-tampa.obj", url: "/api/arquivos/modelos/2026/09/prova-3.obj", formato: "obj", tamanho: 812_400, tags: ["caixa"], criadoEm: "2026-09-15T11:05:00Z" },
  { ...base, id: "00000000-0000-4000-8000-000000000004", nome: "gabarito-furacao.gcode", url: "/api/arquivos/modelos/2026/09/prova-4.gcode", formato: "gcode", tamanho: 22_930_112, tags: ["fatiado", "a1-mini"], criadoEm: "2026-09-12T08:00:00Z", descricao: "Já fatiado pra A1 Mini — 0.2mm, 3h40." },
  { ...base, id: "00000000-0000-4000-8000-000000000005", nome: "prototipo-carcaça.step", url: "/api/arquivos/modelos/2026/09/prova-5.step", formato: "step", tamanho: 9_112_003, tags: ["cad"], criadoEm: "2026-09-10T17:22:00Z" },
  { ...base, id: "00000000-0000-4000-8000-000000000006", nome: "vaso-espiral.glb", url: "/api/arquivos/modelos/2026/09/prova-6.glb", formato: "glb", tamanho: 2_300_119, tags: ["decoração", "vase-mode"], criadoEm: "2026-09-08T10:00:00Z" },
];

const mq = (n: number) => `00000000-0000-4000-8000-00000000002${n}`;
const MAQUINAS: Maquina3D[] = [
  { id: mq(1), nome: "Impressora 01", identificacao: "IMP-01", modelo: "Ender-3 V3", estado: "ativa", local: "Galpão · bancada A", observacoes: "", fotoUrl: null, criadoEm: "2026-09-01T10:00:00Z", atualizadoEm: "2026-09-01T10:00:00Z" },
  { id: mq(2), nome: "Impressora 02", identificacao: "IMP-02", modelo: "A1 Mini", estado: "ativa", local: "Galpão · bancada A", observacoes: "", fotoUrl: null, criadoEm: "2026-09-01T10:00:00Z", atualizadoEm: "2026-09-01T10:00:00Z" },
  { id: mq(3), nome: "Impressora 03", identificacao: "IMP-03", modelo: "K1 Max", estado: "manutencao", local: "Oficina", observacoes: "Troca do bico.", fotoUrl: null, criadoEm: "2026-09-01T10:00:00Z", atualizadoEm: "2026-09-01T10:00:00Z" },
];

const hoje = hojeSP();
const pr = (n: number) => `00000000-0000-4000-8000-00000000003${n}`;
const pbase = { prioridade: "normal" as const, observacoes: "", responsavelId: "p1", responsavelNome: "Matheus Dias", criadoEm: "2026-09-20T09:00:00Z" };
const PROGRAMACOES: Programacao3D[] = [
  { ...pbase, id: pr(1), arquivoId: ARQUIVOS[0].id, arquivoNome: ARQUIVOS[0].nome, arquivoFormato: "stl", maquinaId: mq(1), maquinaNome: "Impressora 01", quantidade: 10, data: hoje, hora: "07:00", status: "imprimindo", ordem: 1, iniciadoEm: `${hoje}T07:05:00Z`, concluidoEm: null, prioridade: "alta" },
  { ...pbase, id: pr(2), arquivoId: ARQUIVOS[1].id, arquivoNome: ARQUIVOS[1].nome, arquivoFormato: "3mf", maquinaId: mq(1), maquinaNome: "Impressora 01", quantidade: 20, data: hoje, hora: "13:00", status: "programado", ordem: 2, iniciadoEm: null, concluidoEm: null },
  { ...pbase, id: pr(3), arquivoId: ARQUIVOS[2].id, arquivoNome: ARQUIVOS[2].nome, arquivoFormato: "obj", maquinaId: mq(1), maquinaNome: "Impressora 01", quantidade: 4, data: somaDias(hoje, 1), hora: "09:00", status: "programado", ordem: 3, iniciadoEm: null, concluidoEm: null, responsavelNome: "Davi", responsavelId: "p2" },
  { ...pbase, id: pr(4), arquivoId: ARQUIVOS[5].id, arquivoNome: ARQUIVOS[5].nome, arquivoFormato: "glb", maquinaId: mq(2), maquinaNome: "Impressora 02", quantidade: 5, data: hoje, hora: "09:30", status: "pausado", ordem: 1, iniciadoEm: `${hoje}T09:35:00Z`, concluidoEm: null },
  { ...pbase, id: pr(5), arquivoId: ARQUIVOS[3].id, arquivoNome: ARQUIVOS[3].nome, arquivoFormato: "gcode", maquinaId: null, maquinaNome: null, quantidade: 8, data: null, hora: null, status: "a_fazer", ordem: 0, iniciadoEm: null, concluidoEm: null, responsavelId: null, responsavelNome: null },
  { ...pbase, id: pr(6), arquivoId: ARQUIVOS[0].id, arquivoNome: ARQUIVOS[0].nome, arquivoFormato: "stl", maquinaId: mq(2), maquinaNome: "Impressora 02", quantidade: 12, data: hoje, hora: "05:00", status: "concluido", ordem: 0, iniciadoEm: `${hoje}T05:00:00Z`, concluidoEm: `${hoje}T06:40:00Z` },
  { ...pbase, id: pr(7), arquivoId: ARQUIVOS[1].id, arquivoNome: ARQUIVOS[1].nome, arquivoFormato: "3mf", maquinaId: mq(3), maquinaNome: "Impressora 03", quantidade: 2, data: somaDias(hoje, -1), hora: "16:00", status: "cancelado", ordem: 0, iniciadoEm: null, concluidoEm: `${somaDias(hoje, -1)}T16:20:00Z` },
];

const PESSOAS = [
  { id: "p1", nome: "Matheus Dias" },
  { id: "p2", nome: "Davi" },
];

export default function Dev3D() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div style={{ padding: "24px 16px", maxWidth: 1200, margin: "0 auto" }}>
      <Area3DTabs pessoas={PESSOAS} provaMaquinas={MAQUINAS} provaProgramacoes={PROGRAMACOES} />
      <div style={{ marginTop: 48, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Biblioteca com arquivos (aba Arquivos por dentro)</h2>
        <Biblioteca3D inicial={ARQUIVOS} />
      </div>
      <div style={{ marginTop: 48, borderTop: "1px solid var(--border)", paddingTop: 24 }}>
        <h2 style={{ fontSize: 15, marginBottom: 12 }}>Palco 3D (STL inline, sem rede)</h2>
        <Visualizador3D arquivoId="prova" formato="stl" urlDownload="#" urlConteudo={STL_PROVA} />
      </div>
    </div>
  );
}
