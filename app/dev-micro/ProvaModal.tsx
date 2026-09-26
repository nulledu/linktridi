"use client";

// Banco de provas do modal do sistema: as variações do Modal do HeroUI v3
// (tamanhos, posição, véus, ícone por tom, formulário, rolagem interna) sobre o
// motor da casa. No celular todas viram a mesma folha presa embaixo.

import { useState } from "react";
import { Modal, type TamanhoModal, type TomModal } from "../(plataforma)/ui/Modal";
import { Acoes, Botao, Campo, Campos } from "../(plataforma)/ui/controles";

type Caso = {
  id: string; rotulo: string; tamanho?: TamanhoModal; tom?: TomModal; icone?: string;
  posicao?: "centro" | "topo"; veu?: "padrao" | "desfocado" | "transparente";
  form?: boolean; longo?: boolean; semIcone?: boolean;
};

const CASOS: Caso[] = [
  { id: "xs", rotulo: "XS", tamanho: "xs" },
  { id: "sm", rotulo: "SM", tamanho: "sm" },
  { id: "md", rotulo: "MD", tamanho: "md" },
  { id: "lg", rotulo: "LG", tamanho: "lg" },
  { id: "cover", rotulo: "Cover", tamanho: "cover" },
  { id: "full", rotulo: "Full", tamanho: "full" },
  { id: "topo", rotulo: "No topo", posicao: "topo" },
  { id: "desf", rotulo: "Véu desfocado", veu: "desfocado" },
  { id: "transp", rotulo: "Véu transparente", veu: "transparente" },
  { id: "ok", rotulo: "Tom ok", tom: "ok", icone: "circle-check" },
  { id: "perigo", rotulo: "Tom perigo", tom: "perigo", icone: "alert-triangle" },
  { id: "form", rotulo: "Formulário", tom: "destaque", icone: "mail", form: true },
  { id: "longo", rotulo: "Rolagem interna", longo: true, semIcone: true },
];

export function ProvaModal() {
  const [aberto, setAberto] = useState<Caso | null>(null);
  const c = aberto;
  return (
    <section style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>Modal</h2>
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2, maxWidth: "62ch" }}>
          Desenho do Modal do HeroUI (superfície opaca, raio 32, ícone de 40px, rodapé à direita) sobre o
          PainelLateral centrado. No celular vira folha presa embaixo, arrastável.
        </p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {CASOS.map((k) => (
          <Botao key={k.id} variante="secundario" tamanho="sm" onClick={() => setAberto(k)}>{k.rotulo}</Botao>
        ))}
      </div>
      {c && (
        <Modal
          onFechar={() => setAberto(null)}
          titulo={c.form ? "Fale com a gente" : `Modal · ${c.rotulo}`}
          subtitulo={c.form ? "Preencha e a gente responde. No celular a folha sobe com o teclado." : undefined}
          icone={c.semIcone ? undefined : (c.icone ?? "rocket")}
          tom={c.tom}
          tamanho={c.tamanho}
          posicao={c.posicao}
          veu={c.veu}
          soFechaNoX={c.form}
          rodape={
            <Acoes>
              <Botao variante="secundario" onClick={() => setAberto(null)}>Cancelar</Botao>
              <Botao variante={c.tom === "perigo" ? "perigo" : "primario"} onClick={() => setAberto(null)}>
                {c.form ? "Enviar" : "Confirmar"}
              </Botao>
            </Acoes>
          }
        >
          {c.form ? (
            <Campos>
              <Campo label="Nome">{(id) => <input id={id} className="ui-input" placeholder="Seu nome" />}</Campo>
              <Campo label="E-mail">{(id) => <input id={id} className="ui-input" type="email" placeholder="voce@empresa.com" />}</Campo>
              <Campo label="Mensagem" largo>{(id) => <textarea id={id} className="ui-input" rows={3} />}</Campo>
            </Campos>
          ) : c.longo ? (
            Array.from({ length: 24 }, (_, i) => (
              <p key={i} style={{ marginBottom: 12 }}>
                Parágrafo {i + 1}: o corpo rola por dentro e o cabeçalho ganha a borda de rolagem; o rodapé fica
                sempre alcançável.
              </p>
            ))
          ) : (
            <p>
              Este modal usa {c.tamanho ? <>o tamanho <b>{c.tamanho}</b></> : "o tamanho padrão"}
              {c.posicao === "topo" ? ", encostado no topo" : ""}
              {c.veu && c.veu !== "padrao" ? `, com véu ${c.veu}` : ""}. Esc, clique no véu ou o X fecham.
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
