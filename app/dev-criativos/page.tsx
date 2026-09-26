// Banco de provas da Biblioteca de Criativos.
//
// A tela real vive em /marketing/criativo/<id>, atrás de login e da permissão
// de marketing — não dá pra digitar credencial nem conferir grade de peças
// lendo diff. Aqui a biblioteca aparece com dado parecido com o real, nos dois
// temas e a partir de 320px, tanto para quem pode enviar quanto para quem só
// olha, e também vazia (que é como um criativo antigo nasce).
//
// O `npm run rolagem` descobre as rotas /dev-* sozinho: esta entra na medição
// sem ninguém precisar cadastrá-la.
import { notFound } from "next/navigation";
import { BibliotecaCriativo } from "../(plataforma)/marketing/BibliotecaCriativo";
import { ProvaVisor } from "./ProvaVisor";
import { ProvaSubir } from "./ProvaSubir";
import { ProvaLista } from "./ProvaLista";
import type { ArquivoCriativo } from "@/lib/criativos/regras";

export const dynamic = "force-dynamic";

// Peças de mentira, com as medidas que os formatos de anúncio realmente têm —
// é o que faz o rótulo ("Story", "Retrato") aparecer como apareceria de verdade.
// As imagens são SVG em data: URI: não dependem de rede nem do bucket, então o
// banco de provas funciona offline e sem o B2 configurado.
const arte = (cor: string, texto: string, l: number, a: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${l}" height="${a}" viewBox="0 0 ${l} ${a}">` +
      `<rect width="${l}" height="${a}" fill="${cor}"/>` +
      `<text x="50%" y="50%" fill="#fff" font-family="system-ui" font-size="${Math.round(l / 8)}"` +
      ` font-weight="700" text-anchor="middle" dominant-baseline="middle">${texto}</text></svg>`,
  )}`;

const PECA = (p: Partial<ArquivoCriativo> & { id: string }): ArquivoCriativo => ({
  criativoId: "prova",
  url: arte("#5b46f0", "1:1", 1080, 1080),
  nome: "peca.png",
  mime: "image/png",
  tipo: "imagem",
  tamanho: 1_200_000,
  largura: 1080,
  altura: 1080,
  duracao: null,
  formato: "1:1",
  principal: false,
  autorNome: "Equipe",
  createdAt: new Date().toISOString(),
  ...p,
});

const EXEMPLOS: ArquivoCriativo[] = [
  PECA({ id: "a", principal: true, nome: "JL-041 feed quadrado.png" }),
  PECA({
    id: "b", nome: "JL-041 story.jpg", mime: "image/jpeg", formato: "9:16",
    largura: 1080, altura: 1920, tamanho: 620_000, url: arte("#0f9d58", "9:16", 1080, 1920),
  }),
  PECA({
    id: "c", nome: "JL-041 retrato.jpg", mime: "image/jpeg", formato: "4:5",
    largura: 1080, altura: 1350, tamanho: 7_900_000, url: arte("#d93025", "4:5", 1080, 1350),
  }),
  // Vídeo: sem `src` de verdade o player fica preto, que é justamente como
  // ele se comporta com um arquivo que não carrega — serve pra conferir que a
  // moldura, a duração e os botões continuam no lugar mesmo assim.
  PECA({
    id: "d", nome: "JL-041 corte 28s.mp4", mime: "video/mp4", tipo: "video",
    formato: "9:16", largura: 1080, altura: 1920, duracao: 28.4, tamanho: 18_400_000,
    url: "/dev-criativos/sem-video.mp4",
  }),
];

export default function DevCriativos() {
  // DUPLA TRAVA, igual às outras /dev-*: o middleware só a torna PÚBLICA fora
  // de produção — não a faz sumir. Sem este 404 qualquer pessoa logada abriria
  // a página em produção, e como /dev-* fica FORA de (plataforma) ela não tem
  // gate de sessão próprio.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main style={{ padding: 16, display: "flex", flexDirection: "column", gap: 24, maxWidth: 900, margin: "0 auto" }}>
      <Bloco titulo="Subir criativo" nota="Mês (já no corrente), número, produto e quem fez. O nome SET 01 - {CRB} - {L} se monta no topo.">
        <ProvaSubir />
      </Bloco>

      <Bloco titulo="Lista de criativos" nota="Marketing › Geral: cartões escalonados, capa saindo do esqueleto, filtro que pula, copiar o nome e a vista deslizante.">
        <ProvaLista />
      </Bloco>

      <Bloco titulo="Com peças · pode enviar" nota="Grade, capa marcada, duração no vídeo e as três ações sempre visíveis.">
        <BibliotecaCriativo criativoId="prova" codigo="JL-041" inicial={EXEMPLOS} podeEditar />
      </Bloco>

      <Bloco titulo="Com peças · só leitura" nota="Sem marketing:criar: some o envio e somem as ações de capa e excluir. Sobra baixar.">
        <BibliotecaCriativo criativoId="prova" codigo="JL-041" inicial={EXEMPLOS} podeEditar={false} />
      </Bloco>

      <Bloco titulo="Vazia · pode enviar" nota="Como nasce um criativo novo: só a área de envio e os limites escritos.">
        <BibliotecaCriativo criativoId="prova-vazio" codigo="JL-042" inicial={[]} podeEditar />
      </Bloco>

      <Bloco titulo="Vazia · só leitura" nota="Criativo antigo visto por quem não edita: uma frase, nenhuma moldura vazia.">
        <BibliotecaCriativo criativoId="prova-vazio" codigo="JL-042" inicial={[]} podeEditar={false} />
      </Bloco>

      <Bloco titulo="Visor (folha)" nota="O que abre da lista de criativos e dos rankings do Tridify: abas Biblioteca / Na Meta, portal no body, Esc fecha.">
        <ProvaVisor />
      </Bloco>
    </main>
  );
}

function Bloco({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>{titulo}</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.45 }}>{nota}</p>
      <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 12 }}>{children}</div>
    </section>
  );
}
