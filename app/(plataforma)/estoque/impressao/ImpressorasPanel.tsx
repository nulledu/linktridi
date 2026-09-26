"use client";

// ── As impressoras desta máquina ─────────────────────────────────────────────
//
// A tela que faltava pro galpão ter Zebra. O que ela resolve não é "cadastrar
// impressora" — é o conjunto de falhas MUDAS que cercam impressão local:
//
//   · a API de USB não existe no Safari;
//   · o driver do Windows segura o cabo e `claimInterface` falha;
//   · o agente Zebra está fechado;
//   · o DPI cadastrado está errado e a etiqueta sai com 2/3 do tamanho.
//
// Nenhuma dessas se anuncia. Todas chegam como "não imprime". Por isso a tela
// mede o ambiente ao abrir e escreve o diagnóstico ANTES do primeiro clique, e
// por isso a tira de teste tem régua — é o único jeito de flagrar o DPI errado
// sem conferir cem etiquetas.
//
// A lista mora em `localStorage`, e o porquê está em lib/impressora-local.ts: a
// autorização de USB é do navegador daquela máquina e não há como transferi-la.

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { Botao, Caixa } from "../../ui/controles";
import {
  SAIDAS, defDaSaida, diagnosticarSaida, saidaRecomendada, validarImpressora,
  normalizarImpressora, DPI_SUPORTADOS_ROTULO,
  type Ambiente, type ImpressoraLocal, type SaidaDeImpressao,
} from "@/lib/impressora-local";
import { LARGURA_MAXIMA_MM, LARGURA_MINIMA_MM, ALTURA_MAXIMA_MM, ALTURA_MINIMA_MM } from "@/lib/estoque-etiqueta-config";
import { lerImpressoras, salvarImpressora, apagarImpressora, novoId, TETO_DE_IMPRESSORAS } from "./impressoras-guardadas";
import { lerAjustes } from "../Etiqueta";
import {
  medirAmbiente, aparelhosDoAgente, escolherImpressoraUsb, imprimirTeste,
  type AparelhoDoAgente,
} from "./enviar-para-impressora";

export function ImpressorasPanel({ podeConfigurar }: { podeConfigurar: boolean }) {
  const [lista, setLista] = useState<ImpressoraLocal[]>([]);
  const [ambiente, setAmbiente] = useState<Ambiente | null>(null);
  const [aparelhos, setAparelhos] = useState<AparelhoDoAgente[]>([]);
  const [editando, setEditando] = useState<Partial<ImpressoraLocal> | null>(null);
  const [recado, setRecado] = useState<{ ok: boolean; frase: string } | null>(null);
  const [testando, setTestando] = useState<string | null>(null);

  // Uma medição só, ao abrir. Sem poll: o que muda aqui (ligar o agente, plugar
  // o cabo) é gesto da própria pessoa, e o botão "Conferir de novo" está ao
  // lado. Um `setInterval` batendo em `localhost` de segundo em segundo seria
  // ruído no console de toda máquina que não tem o agente.
  const medir = useCallback(async () => {
    setAmbiente(await medirAmbiente());
    setAparelhos(await aparelhosDoAgente());
  }, []);

  useEffect(() => { setLista(lerImpressoras()); void medir(); }, [medir]);

  function salvar() {
    if (!editando) return;
    const problemas = validarImpressora(editando);
    if (problemas.length) { setRecado({ ok: false, frase: problemas[0] }); return; }
    setLista(salvarImpressora(editando));
    setEditando(null);
    setRecado({ ok: true, frase: "Impressora salva nesta máquina." });
  }

  async function testar(p: ImpressoraLocal) {
    setTestando(p.id);
    setRecado(null);
    const r = await imprimirTeste(p);
    setTestando(null);
    setRecado(r.ok
      ? { ok: true, frase: "Mandei a tira de teste. Confira a régua: se a marca dos 10mm não cai no centímetro de uma régua de verdade, o DPI cadastrado está errado." }
      : { ok: false, frase: r.frase });
  }

  const recomendada = ambiente ? saidaRecomendada(ambiente) : "navegador";

  /*
   * As Zebras que o agente está vendo e que AINDA NÃO TÊM FICHA.
   *
   * Casa por `agenteUid` porque é assim que o Browser Print endereça: a mesma
   * máquina pode ter duas Zebras, e o nome que a pessoa deu à ficha não tem
   * relação nenhuma com o nome do aparelho.
   */
  const jaCadastrados = new Set(lista.map((p) => p.agenteUid).filter(Boolean));
  const encontradas = aparelhos.filter((a) => !jaCadastrados.has(a.uid));

  /**
   * A Zebra encontrada vira cadastro em UM toque.
   *
   * Este era o buraco entre "o sistema já sabe que a impressora existe" e "o
   * sistema imprime nela": a tela mostrava o aparelho na lista do agente e,
   * mesmo assim, exigia preencher nome, saída, resolução e tamanho à mão antes
   * de qualquer etiqueta sair. Quem chegou aqui porque o botão de imprimir
   * pediu configuração encontrava outro formulário.
   *
   * Os campos que dá para saber, o app preenche: nome e endereço vêm do
   * próprio agente, a saída é `zebra_agente` por construção, e o tamanho é o do
   * galpão — o mesmo que a folha usa. Sobra UM palpite, a resolução da cabeça,
   * que ninguém consegue descobrir conversando com a impressora; ele nasce em
   * 203dpi (o comum nas Zebras de mesa) e a tira de teste com régua existe
   * justamente para conferi-lo. Errar por 203 e corrigir depois de uma tira é
   * melhor que não imprimir nada hoje.
   */
  async function usarEncontrada(a: AparelhoDoAgente) {
    const t = (await lerAjustes()).config;
    const nova: ImpressoraLocal = {
      id: novoId(),
      nome: a.name.slice(0, 40),
      saida: "zebra_agente",
      agenteUid: a.uid,
      dpi: 203,
      larguraMm: t.larguraMm,
      alturaMm: t.alturaMm,
    };
    setLista(salvarImpressora(nova));
    setRecado({
      ok: true,
      frase: `${nova.nome} cadastrada. Mande a tira de teste e confira a régua: se a marca dos 10mm ` +
        "não cai no centímetro de uma régua de verdade, troque a resolução em Editar.",
    });
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <EstadoDaMaquina ambiente={ambiente} aoRemedir={medir} />

      {podeConfigurar && encontradas.length > 0 && (
        <section className="glass" style={{ padding: 14, borderRadius: "var(--r-md)", display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>
            {encontradas.length === 1 ? "Achei uma Zebra nesta máquina" : `Achei ${encontradas.length} Zebras nesta máquina`}
          </h3>
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45 }}>
            O Browser Print está enxergando {encontradas.length === 1 ? "ela" : "elas"} agora. Usar aqui já
            deixa a etiqueta saindo pela impressora em vez do diálogo do navegador.
          </p>
          {encontradas.map((a) => (
            <div
              key={a.uid}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 10, flexWrap: "wrap", padding: "10px 12px",
                borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <Icon name="printer" size={16} color="var(--primary-texto)" />
                <span style={{ fontSize: 13.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {a.name}
                  {a.connection && <span style={{ color: "var(--text-dim)", fontWeight: 500 }}> · {a.connection}</span>}
                </span>
              </span>
              <Botao type="button" variante="secundario" tamanho="sm" icone="plug" onClick={() => void usarEncontrada(a)}>
                Usar esta
              </Botao>
            </div>
          ))}
        </section>
      )}

      {recado && (
        <p role="status" style={{
          margin: 0, padding: "10px 12px", borderRadius: "var(--r-sm)", fontSize: 13.5,
          border: `1.5px solid ${recado.ok ? "var(--ok)" : "var(--perigo)"}`,
          background: "var(--surface)", color: "var(--text)",
        }}>{recado.frase}</p>
      )}

      {lista.length === 0 && !editando && (
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-dim)" }}>
          Nenhuma impressora cadastrada nesta máquina. Sem cadastro, a etiqueta sai pelo diálogo de
          impressão do navegador — que funciona, mas passa por um rasterizador que não sabe o que é
          código de barras. Numa Zebra, cadastrar aqui faz a própria impressora desenhar o código.
        </p>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {lista.map((p) => (
          <LinhaDaImpressora
            key={p.id} p={p} ambiente={ambiente} testando={testando === p.id}
            podeConfigurar={podeConfigurar}
            aoTestar={() => void testar(p)}
            aoEditar={() => setEditando(p)}
            aoApagar={() => setLista(apagarImpressora(p.id))}
          />
        ))}
      </div>

      {editando ? (
        <FichaDaImpressora
          valor={editando} aparelhos={aparelhos} recomendada={recomendada}
          aoMudar={(v) => setEditando({ ...editando, ...v })}
          aoSalvar={salvar} aoCancelar={() => { setEditando(null); setRecado(null); }}
        />
      ) : podeConfigurar && lista.length < TETO_DE_IMPRESSORAS ? (
        <Botao
          type="button" variante="secundario" icone="plus"
          onClick={() => setEditando({ id: novoId(), nome: "", saida: recomendada, dpi: 203, larguraMm: 72, alturaMm: 18 })}
        >
          Adicionar impressora
        </Botao>
      ) : null}
    </div>
  );
}

// ── O que esta máquina consegue fazer ────────────────────────────────────────

function EstadoDaMaquina({ ambiente, aoRemedir }: { ambiente: Ambiente | null; aoRemedir: () => Promise<void> }) {
  if (!ambiente) return <p style={{ fontSize: 13, color: "var(--text-dim)", margin: 0 }}>Vendo o que esta máquina consegue fazer…</p>;

  const linhas: { pronto: boolean; texto: string }[] = [
    { pronto: ambiente.temWebUsb && ambiente.seguro, texto: ambiente.temWebUsb ? "Este navegador fala USB" : "Este navegador não fala USB (Safari e Firefox não falam)" },
    { pronto: ambiente.temAgente, texto: ambiente.temAgente ? "Zebra Browser Print está rodando" : "Zebra Browser Print não respondeu" },
  ];

  return (
    <section className="glass" style={{ padding: 14, borderRadius: "var(--r-md)", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Nesta máquina</h3>
        <Botao type="button" variante="sutil" tamanho="sm" icone="refresh" onClick={() => void aoRemedir()}>
          Conferir de novo
        </Botao>
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
        {linhas.map((l) => (
          <li key={l.texto} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <Icon name={l.pronto ? "circle-check" : "circle-x"} size={16} color={l.pronto ? "var(--ok)" : "var(--text-dim)"} />
            <span style={{ color: l.pronto ? "var(--text)" : "var(--text-dim)" }}>{l.texto}</span>
          </li>
        ))}
      </ul>
      {ambiente.ehWindows && ambiente.temWebUsb && !ambiente.temAgente && (
        // O aviso que economiza a investigação inteira. O erro que o Windows
        // devolve quando o driver segura o cabo não menciona driver nenhum.
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.45 }}>
          No Windows, se a impressora não aparecer na lista ao clicar, é o driver da Zebra segurando o
          cabo — instale o <strong>Zebra Browser Print</strong>, que fala com o driver em vez de disputar
          o cabo com ele.
        </p>
      )}
    </section>
  );
}

// ── Uma impressora cadastrada ────────────────────────────────────────────────

function LinhaDaImpressora({ p, ambiente, testando, podeConfigurar, aoTestar, aoEditar, aoApagar }: {
  p: ImpressoraLocal;
  ambiente: Ambiente | null;
  testando: boolean;
  podeConfigurar: boolean;
  aoTestar: () => void;
  aoEditar: () => void;
  aoApagar: () => void;
}) {
  const def = defDaSaida(p.saida);
  const diag = ambiente ? diagnosticarSaida(p.saida, ambiente) : null;

  return (
    <article className="glass" style={{ padding: 14, borderRadius: "var(--r-md)", display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <Icon name={def.icon} size={20} color="var(--text-dim)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
            {p.nome}{p.padrao && <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: "var(--primary-texto)" }}>PADRÃO</span>}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-dim)" }}>
            {def.label} · {p.dpi} dpi · {p.larguraMm}×{p.alturaMm}mm
            {p.agenteUid ? ` · ${p.agenteUid}` : ""}
          </p>
        </div>
      </div>

      {diag && diag.veredito !== "pronta" && (
        <p style={{
          margin: 0, fontSize: 12.5, lineHeight: 1.45, padding: "8px 10px",
          borderRadius: "var(--r-sm)", border: "1px solid var(--border)", color: "var(--text-dim)",
        }}>{diag.frase}</p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Botao type="button" variante="secundario" tamanho="sm" icone="printer" carregando={testando} onClick={aoTestar}>
          Tira de teste
        </Botao>
        {podeConfigurar && (
          <>
            <Botao type="button" variante="sutil" tamanho="sm" icone="pencil" onClick={aoEditar}>Editar</Botao>
            <Botao type="button" variante="sutil" tamanho="sm" icone="trash" onClick={aoApagar}>Remover</Botao>
          </>
        )}
      </div>
    </article>
  );
}

// ── O cadastro ───────────────────────────────────────────────────────────────

function FichaDaImpressora({ valor, aparelhos, recomendada, aoMudar, aoSalvar, aoCancelar }: {
  valor: Partial<ImpressoraLocal>;
  aparelhos: AparelhoDoAgente[];
  recomendada: SaidaDeImpressao;
  aoMudar: (v: Partial<ImpressoraLocal>) => void;
  aoSalvar: () => void;
  aoCancelar: () => void;
}) {
  const p = normalizarImpressora({ ...valor, nome: valor.nome ?? "" });
  const saida = valor.saida ?? recomendada;

  return (
    <section className="glass" style={{ padding: 16, borderRadius: "var(--r-md)", display: "grid", gap: 14 }}>
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Impressora</h3>

      <label style={{ display: "grid", gap: 5 }}>
        <span style={rotulo}>Nome</span>
        <input
          value={valor.nome ?? ""}
          onChange={(e) => aoMudar({ nome: e.target.value.slice(0, 40) })}
          placeholder="Zebra do galpão"
          style={campo}
        />
      </label>

      {/* Grupo de botões em <div>, nunca dentro de <label>: clicar no rótulo
          dispararia o primeiro botão e trocaria a escolha sozinho. */}
      <div style={{ display: "grid", gap: 6 }}>
        <span style={rotulo}>Por onde a etiqueta sai</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 8 }}>
          {SAIDAS.map((s) => (
            <button
              key={s.key} type="button" aria-pressed={saida === s.key}
              onClick={() => aoMudar({ saida: s.key })}
              style={{ ...opcaoGrande, ...(saida === s.key ? opcaoAtiva : null) }}
            >
              {/* O selo em LINHA PRÓPRIA. Ao lado do nome ele entrava na
                  quebra do texto e o título passava a ler "Zebra no cabo
                  RECOMENDADA USB" — o selo cortando o nome ao meio. */}
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 800, fontSize: 13.5 }}>
                <Icon name={s.icon} size={16} color="currentColor" />
                <span>{s.label}</span>
              </span>
              {s.key === recomendada && (
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".04em", opacity: .75 }}>RECOMENDADA</span>
              )}
              <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.4 }}>{s.resumo}</span>
            </button>
          ))}
        </div>
      </div>

      {saida === "zebra_agente" && (
        <label style={{ display: "grid", gap: 5 }}>
          <span style={rotulo}>Aparelho do Browser Print</span>
          {aparelhos.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)" }}>
              O Browser Print não respondeu, então não há aparelho pra escolher. Abra o aplicativo
              (ele fica na bandeja do sistema) e use “Conferir de novo” lá em cima.
            </p>
          ) : (
            <select
              value={valor.agenteUid ?? ""}
              onChange={(e) => aoMudar({ agenteUid: e.target.value })}
              style={campo}
            >
              <option value="">Escolha…</option>
              {aparelhos.map((a) => <option key={a.uid} value={a.uid}>{a.name}</option>)}
            </select>
          )}
        </label>
      )}

      {saida === "zebra_usb" && (
        <Botao
          type="button" variante="secundario" icone="plug"
          onClick={() => void escolherImpressoraUsb()}
        >
          Autorizar a impressora no navegador
        </Botao>
      )}

      {/* Resolução: o campo que ninguém pensa em conferir e que estraga tudo. */}
      <div style={{ display: "grid", gap: 6 }}>
        <span style={rotulo}>Resolução da cabeça</span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DPI_SUPORTADOS_ROTULO.map((d) => (
            <button
              key={d.dpi} type="button" aria-pressed={p.dpi === d.dpi}
              onClick={() => aoMudar({ dpi: d.dpi })}
              style={{ ...opcao, ...(p.dpi === d.dpi ? opcaoAtiva : null) }}
            >
              {d.rotulo}
            </button>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.45 }}>
          Está escrita na etiqueta de identificação do aparelho. Errar este número faz a etiqueta sair
          com dois terços do tamanho, encolhida no canto — a tira de teste tem régua justamente pra
          flagrar isso antes de gastar o rolo.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))", gap: 10 }}>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={rotulo}>Largura da etiqueta (mm)</span>
          <input type="number" inputMode="numeric" min={LARGURA_MINIMA_MM} max={LARGURA_MAXIMA_MM}
            value={p.larguraMm} onChange={(e) => aoMudar({ larguraMm: Number(e.target.value) })} style={campo} />
        </label>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={rotulo}>Altura da etiqueta (mm)</span>
          <input type="number" inputMode="numeric" min={ALTURA_MINIMA_MM} max={ALTURA_MAXIMA_MM}
            value={p.alturaMm} onChange={(e) => aoMudar({ alturaMm: Number(e.target.value) })} style={campo} />
        </label>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: "var(--tap)" }}>
        {/* O alvo de toque é o <label> inteiro (44px); a caixinha nativa tem
            13px e some ao lado do texto. 20px é o que a deixa visível sem
            virar outro controle. */}
        <Caixa marcado={p.padrao === true} onChange={(marc) => aoMudar({ padrao: marc })} />
        <span style={{ fontSize: 13.5 }}>É a impressora de todo dia desta máquina</span>
      </label>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Botao type="button" variante="primario" onClick={aoSalvar}>Salvar</Botao>
        <Botao type="button" variante="sutil" onClick={aoCancelar}>Cancelar</Botao>
      </div>
    </section>
  );
}

const rotulo: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-dim)", letterSpacing: ".02em" };

const campo: React.CSSProperties = {
  minHeight: "var(--tap)", padding: "9px 12px", fontSize: 15, width: "100%",
  borderRadius: "var(--r-sm)", border: "1.5px solid var(--border)",
  background: "var(--surface)", color: "var(--text)",
};

const opcao: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 14px",
  minHeight: "var(--tap)", borderRadius: "var(--r-sm)", cursor: "pointer",
  border: "1.5px solid var(--border)", background: "var(--surface)",
  color: "var(--text)", fontSize: 13.5, fontWeight: 700,
};

const opcaoGrande: React.CSSProperties = {
  ...opcao, display: "grid", gap: 4, textAlign: "left", padding: "11px 13px", alignItems: "start",
};

const opcaoAtiva: React.CSSProperties = {
  borderColor: "var(--primary)",
  background: "color-mix(in srgb, var(--primary) 12%, transparent)",
  color: "var(--primary-texto)",
};
