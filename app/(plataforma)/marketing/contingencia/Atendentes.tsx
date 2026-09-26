"use client";

// ── Atendentes ───────────────────────────────────────────────────────────────
// Um cartão por pessoa, crítico primeiro. Clicar abre os números dela embaixo
// do cartão — é a resposta a "quem vai precisar de número novo?".

import { useMemo, useState } from "react";
import { Botao } from "../../ui/controles";
import { PillStatus, Pill } from "../aquecimento/pecas";
import { CartaoAtendente, Bloco, Vazio, PillSaude } from "./pecas";
import { flagsDe, indiceDeProxies, chaveAtendente, SAUDE, type Painel, type Saude } from "@/lib/contingencia-const";

export function Atendentes({ painel, foco, onFoco, onAbrirNumero }: {
  painel: Painel; foco: string | null; onFoco: (k: string | null) => void;
  /** Abre a gaveta do chip: trocar o responsável é justamente o que se quer
   *  fazer olhando o cartão de quem está sem número. */
  onAbrirNumero?: (id: string) => void;
}) {
  const c = painel.consolidado;
  const idx = useMemo(() => indiceDeProxies(painel.proxies), [painel.proxies]);
  const [filtro, setFiltro] = useState<Saude | "todos">("todos");

  const lista = c.atendentes.filter((a) => filtro === "todos" || a.saude === filtro);
  const emFoco = c.atendentes.find((a) => a.chave === foco) ?? null;
  const numerosDele = emFoco
    ? painel.ativos.filter((n) => n.tipo === "numero" && n.status !== "aposentado" && chaveAtendente(n.responsavelId, n.responsavelNome) === emFoco.chave)
    : [];

  const resumo: { key: Saude | "todos"; label: string; n: number }[] = [
    { key: "todos", label: "Todos", n: c.atendentes.length },
    { key: "critico", label: SAUDE.critico.label, n: c.atendentes.filter((a) => a.saude === "critico").length },
    { key: "atencao", label: SAUDE.atencao.label, n: c.atendentes.filter((a) => a.saude === "atencao").length },
    { key: "saudavel", label: SAUDE.saudavel.label, n: c.atendentes.filter((a) => a.saude === "saudavel").length },
  ];

  return (
    <div className="ct-tel ct-secoes">
      <div className="ct-chips">
        {resumo.map((r) => (
          <button key={r.key} type="button" className="ct-chip" aria-pressed={filtro === r.key} onClick={() => setFiltro(r.key)}>
            {r.key !== "todos" && <i style={{ width: 7, height: 7, borderRadius: "50%", background: SAUDE[r.key as Saude].cor }} />}
            {r.label} <b>{r.n}</b>
          </button>
        ))}
      </div>

      <p className="ct-sub" style={{ marginInline: 0 }}>
        Saudável = linhas aquecidas e protegidas suficientes · Atenção = poucas reservas ou poucos protegidos · Crítico = risco de ficar sem número.
        Limites em Configurações (atenção ≤ {painel.limites.reservaAtencao} reservas, crítico ≤ {painel.limites.reservaCritico} e nada aquecendo, protegidos ≤ {painel.limites.protegidosAtencao}).
      </p>

      {lista.length ? (
        <div className="ct-atendentes">
          {lista.map((a) => <CartaoAtendente key={a.chave} a={a} onClick={() => onFoco(foco === a.chave ? null : a.chave)} />)}
        </div>
      ) : (
        <div className="ct-bloco"><Vazio icone="users" titulo="Nenhum atendente aqui" texto={c.atendentes.length ? "Nenhum nesta situação." : "Atribua um responsável aos chips no Aquecimento e os perfis aparecem."} /></div>
      )}

      {emFoco && (
        <Bloco titulo={<>Números de {emFoco.nome} <PillSaude saude={emFoco.saude} /></>} icone="device-mobile"
          sub={emFoco.motivo}
          acoes={<Botao variante="sutil" tamanho="sm" onClick={() => onFoco(null)}>Fechar</Botao>}>
          <div style={{ overflow: "hidden" }}>
            <div className="ct-linha ct-linha-cab"><span>Número</span><span>Operadora</span><span>Aparelho</span><span>Status</span><span>Proxy</span></div>
            {numerosDele.map((n) => {
              const f = flagsDe(n, idx);
              const conteudo = (
                <>
                  <span style={{ fontWeight: 620, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.nome}</span>
                  <span className="ct-c-mid"><span>{n.operadora || "—"}</span><span className="mob-only">·</span><span>{n.aparelho || "sem aparelho"}</span></span>
                  <span className="desk-only" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.aparelho || "—"}</span>
                  <PillStatus status={n.status} />
                  <Pill cor={f.comProxy ? "var(--ok)" : "var(--neutro)"}>{f.comProxy ? "Com proxy" : "Sem proxy"}</Pill>
                </>
              );
              return onAbrirNumero ? (
                <button key={n.id} type="button" className="ct-linha ct-linha-btn" onClick={() => onAbrirNumero(n.id)}
                  title={`Abrir ${n.nome} para editar`}>{conteudo}</button>
              ) : <div key={n.id} className="ct-linha">{conteudo}</div>;
            })}
          </div>
        </Bloco>
      )}
    </div>
  );
}
