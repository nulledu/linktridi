"use client";

// Seletor de pessoa com BUSCA. O <select> nativo virava uma lista enorme de
// nomes (21+ carteiras), sem foto e sem como pesquisar — e no tema claro ele
// sai com a cara do sistema operacional, cinza sobre cinza. Aqui é um painel
// próprio: campo de busca no topo, foto, empresa e valor em cada linha.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { formatMarketCurrency } from "../../../lib/tridimarket/view";
import { Avatar, INDIGO } from "./ui";
import { atributosDe } from "../ui/campos";
import { TrocaIcone } from "../ui/micro";

export type OpcaoPessoa = {
  id: number;
  nome: string;
  imagem: string | null;
  detalhe?: string | null;   // empresa, quando a pessoa tem mais de um cadastro
  valor: number;
};

export function SeletorPessoa({ opcoes, valor, onEscolher, placeholder = "Selecione a pessoa" }: {
  opcoes: OpcaoPessoa[];
  valor: string;
  onEscolher: (id: string) => void;
  placeholder?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  const escolhida = opcoes.find((o) => String(o.id) === valor);

  // Fecha ao clicar fora e no Esc — um painel que só fecha escolhendo alguém
  // prende quem abriu por engano.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!caixa.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    // O teclado já vem no campo: quem abre a lista quer digitar o nome.
    const t = setTimeout(() => campo.current?.focus(), 30);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", tecla); clearTimeout(t); };
  }, [aberto]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return opcoes;
    return opcoes.filter((o) => `${o.nome} ${o.detalhe ?? ""}`.toLowerCase().includes(termo));
  }, [opcoes, busca]);

  return (
    <div ref={caixa} style={{ position: "relative" }}>
      <button type="button" onClick={() => { setAberto((v) => !v); setBusca(""); }}
        aria-haspopup="listbox" aria-expanded={aberto}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
          padding: escolhida ? "8px 12px" : "12px", borderRadius: "var(--r-sm)", cursor: "pointer",
          border: `1px solid ${aberto ? INDIGO : "var(--border)"}`, background: "var(--surface-2)",
          color: "var(--text)", fontSize: 14, minHeight: 46,
        }}>
        {escolhida ? (
          <>
            <Avatar name={escolhida.nome} url={escolhida.imagem} size={28} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{escolhida.nome}</span>
              {escolhida.detalhe && <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{escolhida.detalhe}</span>}
            </span>
            <strong style={{ fontSize: 13.5 }}>{formatMarketCurrency(escolhida.valor)}</strong>
          </>
        ) : (
          <span style={{ flex: 1, color: "var(--text-dim)" }}>{placeholder}</span>
        )}
        <TrocaIcone ligado={aberto} a="chevron-down" b="chevron-up" size={16} corA="var(--text-dim)" corB="var(--text-dim)" />
      </button>

      {aberto && (
        <div role="listbox" style={{
          position: "absolute", zIndex: 60, top: "calc(100% + 6px)", left: 0, right: 0,
          // Fundo SÓLIDO: --surface é rgba no tema escuro do ERP e, empilhado
          // sobre o card, o painel virava um borrão cinza.
          background: "var(--tm-menu, var(--surface))",
          border: "1px solid var(--border)", borderRadius: "var(--r-md)",
          boxShadow: "0 18px 40px -12px rgba(0,0,0,.45)", overflow: "hidden",
        }} className="tm-menu">
          <div style={{ padding: 10, borderBottom: "1px solid var(--border)", position: "relative" }}>
            <span style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
              <Icon name="search" size={15} color="var(--text-dim)" />
            </span>
            <input {...atributosDe("busca")} ref={campo} value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pessoa"
              style={{
                width: "100%", padding: "9px 12px 9px 34px", borderRadius: "var(--r-xs)",
                border: "1px solid var(--border)", background: "var(--surface-2)",
                color: "var(--text)", fontSize: 13.5,
              }} />
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {visiveis.length ? visiveis.map((o) => {
              const ativa = String(o.id) === valor;
              return (
                <button key={o.id} type="button" role="option" aria-selected={ativa}
                  onClick={() => { onEscolher(String(o.id)); setAberto(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                    padding: "9px 12px", border: "none", cursor: "pointer",
                    background: ativa ? `color-mix(in srgb, ${INDIGO} 14%, transparent)` : "transparent",
                    color: "var(--text)",
                  }}>
                  <Avatar name={o.nome} url={o.imagem} size={30} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.nome}</span>
                    {o.detalhe && <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{o.detalhe}</span>}
                  </span>
                  <strong style={{ fontSize: 13, flex: "none" }}>{formatMarketCurrency(o.valor)}</strong>
                </button>
              );
            }) : (
              <div style={{ padding: "22px 14px", textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>
                Ninguém encontrado para “{busca}”.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
