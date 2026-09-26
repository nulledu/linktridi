"use client";

// ── Guardar produto num lugar, e tirar de lá ─────────────────────────────────
//
// "Onde este item mora" sempre existiu como campo dentro da ficha. O que
// faltava era o caminho INVERSO — estar olhando a prateleira e dizer "estes
// cinco moram aqui". É o gesto real do galpão: a pessoa está de pé na frente da
// estante com as caixas na mão, não sentada abrindo ficha por ficha.
//
// A tela tem duas metades, e a ordem é a do trabalho:
//   · o QUE JÁ ESTÁ AQUI (a resposta de "o que tem nesta rua?"), com um "tirar"
//     em cada linha;
//   · o QUE PODE VIR (busca no catálogo), com marcação múltipla e um botão que
//     diz o que vai fazer.
//
// Tudo é do mesmo painel porque é a mesma pergunta vista dos dois lados. Uma
// tela separada de "mover produtos" obrigaria a lembrar de onde veio.

import { useMemo, useState } from "react";
import { Icon } from "../Icon";
import { Botao, BotaoIcone } from "../ui/controles";
import { fraseDeGuardar, fraseDeProdutos, MAX_POR_MUDANCA, problemaDaMudancaDeLugar } from "@/lib/estoque-lugar-dos-itens";
import type { Item } from "./tipos";

interface Local { id: string; nome: string; codigo: string }

export function GuardarNoLugar({ local, dentro, catalogo, locais, podeMover, aoMudar }: {
  local: Local;
  /** O que já mora aqui. */
  dentro: Item[];
  /** O catálogo inteiro — a busca acontece nele, em memória. */
  catalogo: Item[];
  /** Pra dizer DE ONDE cada candidato está saindo, quando já tem dono. */
  locais: Local[];
  podeMover: boolean;
  aoMudar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [recado, setRecado] = useState<{ ok: boolean; frase: string } | null>(null);

  const nomeDoLocal = useMemo(() => new Map(locais.map((l) => [l.id, l.codigo])), [locais]);

  // Candidatos: tudo que NÃO está aqui. Item que já tem outro dono continua na
  // lista — mudar de prateleira é o caso mais comum, e escondê-lo faria a busca
  // devolver "nada encontrado" pro item que a pessoa tem na mão.
  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const fora = catalogo.filter((i) => i.local_id !== local.id && i.ativo !== false);
    if (!termo) {
      // Sem busca a lista NÃO é o catálogo inteiro: 244 linhas num painel de
      // celular é rolagem, não escolha. Mostra as primeiras e manda buscar.
      return { lista: fora.slice(0, 8), truncou: fora.length > 8 };
    }
    const achados = fora.filter((i) =>
      i.nome.toLowerCase().includes(termo) || (i.sku ?? "").toLowerCase().includes(termo));
    return { lista: achados.slice(0, 40), truncou: achados.length > 40 };
  }, [busca, catalogo, local.id]);

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
    setRecado(null);
  }

  async function mover(itemIds: string[], destino: string | null, comoDizer: (n: number) => string) {
    // Ao TIRAR, diz de onde a tela achava que o item estava: o servidor só
    // apaga o endereço que ainda bate (ver a rota). Sem isto, um retrato velho
    // apagava o lugar NOVO que outra pessoa acabou de dar ao item.
    const problema = problemaDaMudancaDeLugar(itemIds);
    if (problema) { setRecado({ ok: false, frase: problema }); return; }
    setSalvando(true);
    setRecado(null);
    try {
      const r = await fetch("/api/estoque/locais/itens", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localId: destino, itemIds, ...(destino === null ? { deOnde: local.id } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRecado({ ok: false, frase: d.detalhe ?? "Não deu pra salvar agora. Tente de novo." });
        return;
      }
      setMarcados(new Set());
      setBusca("");
      // O aviso do servidor GANHA da frase otimista: ele sabe quantos de fato
      // mudaram, a tela só sabe quantos pediu.
      setRecado(d.aviso ? { ok: false, frase: String(d.aviso) } : { ok: true, frase: comoDizer(d.movidos ?? itemIds.length) });
      aoMudar();
    } catch {
      setRecado({ ok: false, frase: "Sem conexão. Nada foi movido — tente de novo quando a rede voltar." });
    } finally { setSalvando(false); }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {recado && (
        <p role="status" style={{
          margin: 0, padding: "10px 12px", borderRadius: "var(--r-sm)", fontSize: 13,
          lineHeight: 1.45, border: `1.5px solid ${recado.ok ? "var(--ok)" : "var(--perigo)"}`,
          background: "var(--surface)", color: "var(--text)",
        }}>{recado.frase}</p>
      )}

      {/* ── O que já mora aqui ────────────────────────────────────────────── */}
      <section style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: ".02em", color: "var(--text-dim)" }}>
          GUARDADO AQUI ({dentro.length})
        </h3>
        {dentro.length === 0 ? (
          <p style={{ margin: 0, color: "var(--text-dim)", fontSize: 13.5 }}>
            Nada guardado aqui ainda. {podeMover ? "Use a busca abaixo pra dizer o que mora nesta prateleira." : ""}
          </p>
        ) : (
          <>
            <div style={{ display: "grid", gap: 8 }}>
              {dentro.map((i) => (
                <div key={i.id} style={linhaDeItem}>
                  <Icon name="box" size={16} color="var(--text-dim)" />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflowWrap: "anywhere" }}>
                    {i.nome}
                    {i.sku && <span style={{ color: "var(--text-dim)", fontWeight: 500 }}> · {i.sku}</span>}
                  </span>
                  <span style={{ fontSize: 12.5, color: "var(--text-dim)", flex: "none" }}>{i.quantidade} {i.unidade}</span>
                  {podeMover && (
                    <BotaoIcone
                      icone="x" titulo={`Tirar ${i.nome} daqui`} variante="sutil" tamanho="sm"
                      disabled={salvando}
                      onClick={() => void mover([i.id], null, () => `${i.nome} saiu de ${local.codigo}.`)}
                    />
                  )}
                </div>
              ))}
            </div>
            {podeMover && dentro.length > 1 && (
              // "Esvaziar" existe porque desmontar uma estante é uma tarefa
              // real, e fazê-la um a um em vinte itens é onde a pessoa desiste.
              // Fica embaixo e discreto: é destrutivo de endereço, não do item.
              <Botao
                variante="sutil" tamanho="sm" icone="arrow-back-up" disabled={salvando}
                onClick={() => void mover(dentro.map((i) => i.id), null,
                  (n) => `${fraseDeProdutos(n)} saíram de ${local.codigo}. Eles continuam no catálogo, sem lugar definido.`)}
                style={{ justifySelf: "start" }}
              >
                Tirar todos daqui
              </Botao>
            )}
          </>
        )}
      </section>

      {/* ── O que pode vir ────────────────────────────────────────────────── */}
      {podeMover ? (
        <section style={{ display: "grid", gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: ".02em", color: "var(--text-dim)" }}>
            GUARDAR MAIS AQUI
          </h3>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value.slice(0, 60))}
            placeholder="Busque por nome ou código"
            aria-label="Buscar produto no catálogo"
            style={{
              minHeight: "var(--tap)", padding: "10px 14px", fontSize: 16, width: "100%",
              borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
              background: "var(--surface)", color: "var(--text)",
            }}
          />

          {candidatos.lista.length === 0 ? (
            <p style={{ margin: 0, color: "var(--text-dim)", fontSize: 13 }}>
              {busca.trim() ? "Nenhum produto com esse nome ou código." : "Todo o catálogo já está guardado aqui."}
            </p>
          ) : (
            <div style={{ display: "grid", gap: 6 }}>
              {candidatos.lista.map((i) => {
                const marcado = marcados.has(i.id);
                const donoAtual = i.local_id ? nomeDoLocal.get(i.local_id) : null;
                return (
                  <button
                    key={i.id} type="button" aria-pressed={marcado} onClick={() => alternar(i.id)}
                    style={{
                      ...linhaDeItem, cursor: "pointer", textAlign: "left", width: "100%",
                      borderColor: marcado ? "var(--primary)" : "var(--border)",
                      background: marcado ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)",
                    }}
                  >
                    <Icon name={marcado ? "circle-check" : "circle"} size={18}
                      color={marcado ? "var(--primary-texto)" : "var(--text-dim)"} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: "var(--text)", overflowWrap: "anywhere" }}>
                      {i.nome}
                      {i.sku && <span style={{ color: "var(--text-dim)", fontWeight: 500 }}> · {i.sku}</span>}
                      {/* DE ONDE ele sai. Sem isto, mover um item que já mora
                          noutra prateleira é uma mudança silenciosa: some de lá
                          e ninguém que trabalha naquele corredor fica sabendo. */}
                      {donoAtual && (
                        <span style={{ display: "block", fontSize: 12, color: "var(--atencao, var(--text-dim))", fontWeight: 600, marginTop: 2 }}>
                          sai de {donoAtual}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 12.5, color: "var(--text-dim)", flex: "none" }}>{i.quantidade} {i.unidade}</span>
                  </button>
                );
              })}
            </div>
          )}

          {candidatos.truncou && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)" }}>
              Mostrando os primeiros. Busque pra achar o resto — o catálogo inteiro não cabe aqui.
            </p>
          )}

          <Botao
            variante="primario" icone="map-pin" carregando={salvando}
            disabled={salvando || marcados.size === 0}
            onClick={() => void mover([...marcados], local.id,
              (n) => `${fraseDeProdutos(n)} agora moram em ${local.codigo}.`)}
            style={{ minHeight: "var(--tap)" }}
          >
            {fraseDeGuardar(marcados.size, local.codigo)}
          </Botao>
          {marcados.size >= MAX_POR_MUDANCA && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--atencao, var(--text-dim))" }}>
              {MAX_POR_MUDANCA} é o máximo por vez.
            </p>
          )}
        </section>
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Você vê o que está guardado aqui, mas não pode mudar o lugar dos produtos. Isso pede a
          permissão <code>estoque:cadastrar</code> (“Cadastrar e apagar item”), que o admin libera
          em Permissões.
        </p>
      )}
    </div>
  );
}

const linhaDeItem: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10,
  padding: "10px 12px", borderRadius: "var(--r-sm)",
  border: "1px solid var(--border)", background: "var(--surface)",
  minHeight: "var(--tap)",
};
