"use client";

// ── Importar planilha ────────────────────────────────────────────────────────
//
// O galpão controla estoque numa planilha há meses e vai continuar recebendo
// planilha de fornecedor. Esta tela é a porta permanente dessa entrada — não um
// script de carga que roda uma vez.
//
// O desenho é de três passos porque o passo do meio é o que importa:
//
//   1. colar/subir  → a lista crua
//   2. CONFERIR     → o que vai acontecer, item a item ("estoque 0 → 229")
//   3. aplicar      → e dizer o que fez
//
// O passo 2 não é enfeite: sem ele, apertar o botão escreve em 93 itens que
// ninguém viu. E o plano mostrado é o que o SERVIDOR calculou contra o catálogo
// daquele instante — a tela não decide nada, só mostra e pede confirmação.

import { useRef, useState } from "react";
import { Icon } from "../Icon";
import { Acoes, Botao, PainelLateral } from "../ui/controles";
import { useLarguraDeFolha, useTrazerPraVista } from "./painel-visivel";
import type { Plano } from "@/lib/estoque-importacao";
import { Alerta } from "../ui/Alerta";

interface Leitura {
  comCabecalho: boolean;
  colunas: Partial<Record<string, number>>;
  separador: string;
  linhas: number;
}

interface Resultado {
  criados: number;
  atualizados: number;
  fornecedoresCriados: number;
  pulados: number;
  falhas: { linha: number; nome: string; detalhe: string }[];
}

const EXEMPLO = `Item\tEstoque\tMínimo\tUnidade\tFornecedor
ROLO KRAFT\t229\t50\trl\tPapelaria Central
Pallet PBR\t8\t2\tun\tMadeireira Sul`;

const ROTULO_COLUNA: Record<string, string> = {
  nome: "nome", quantidade: "estoque", qtd_minima: "ponto de reposição",
  unidade: "unidade", fornecedor: "fornecedor",
};

export function ImportarPlanilha({ onFechar, onPronto }: {
  onFechar: () => void;
  /** Terminou de gravar: a lista de fora recarrega e vai pros não classificados
   *  (é lá que os itens novos nascem). */
  onPronto: (r: Resultado) => void;
}) {
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [plano, setPlano] = useState<Plano | null>(null);
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const refArquivo = useRef<HTMLInputElement>(null);
  // "Conferir o que vai acontecer" mora no rodapé fixo; a faixa de erro fica
  // depois do texto de ajuda, da área de colar e do aviso. Medido a 320px: 204px
  // abaixo da última linha visível, com o corpo em scrollTop 0.
  const refErro = useTrazerPraVista<HTMLParagraphElement>(erro);
  const largura = useLarguraDeFolha(640);

  // O texto e o plano nunca estão na tela ao mesmo tempo: enquanto o plano está
  // aberto, o campo nem existe (só "Voltar" traz ele de volta, com o conteúdo
  // intacto). É o que garante que o botão de gravar sempre pertence à lista que
  // foi conferida — não existe editar por baixo do plano.
  function mudarTexto(v: string) {
    setTexto(v);
    setErro(null);
  }

  async function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setArquivo(f.name);
    try { mudarTexto(await f.text()); }
    catch { setErro("Não consegui ler o arquivo. Abra a planilha, copie as linhas e cole aqui."); }
    // Zera o input pra que escolher O MESMO arquivo de novo dispare o `change`.
    e.target.value = "";
  }

  async function chamar(confirmar: boolean) {
    setOcupado(true); setErro(null);
    try {
      const r = await fetch("/api/estoque/importar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, ...(confirmar ? { confirmar: true } : {}) }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(String(d.detalhe ?? "Não foi possível ler a lista.")); return; }
      setPlano(d.plano ?? null);
      setLeitura(d.leitura ?? null);
      if (confirmar) {
        const res: Resultado = {
          criados: Number(d.criados ?? 0), atualizados: Number(d.atualizados ?? 0),
          fornecedoresCriados: Number(d.fornecedoresCriados ?? 0), pulados: Number(d.pulados ?? 0),
          falhas: Array.isArray(d.falhas) ? d.falhas : [],
        };
        setResultado(res);
        onPronto(res);
      }
    } catch {
      setErro("A conexão caiu. Nada foi gravado pela metade — confira e tente de novo.");
    } finally { setOcupado(false); }
  }

  const vaiEscrever = !!plano && (plano.novos.length > 0 || plano.atualizados.length > 0);

  return (
    <PainelLateral
      titulo="Importar planilha"
      subtitulo={resultado ? "resultado" : plano ? `${plano.totalLinhas} ${plano.totalLinhas === 1 ? "linha lida" : "linhas lidas"}` : "cole a lista ou escolha o arquivo"}
      largura={largura}
      onFechar={() => { if (!ocupado) onFechar(); }}
      rodape={
        resultado ? (
          <Acoes><Botao variante="primario" onClick={onFechar}>Fechar</Botao></Acoes>
        ) : plano ? (
          <Acoes>
            <Botao variante="sutil" onClick={() => { setPlano(null); setLeitura(null); }} disabled={ocupado}>Voltar</Botao>
            <Botao variante="primario" icone="download" onClick={() => chamar(true)} carregando={ocupado} disabled={!vaiEscrever}>
              {vaiEscrever
                ? `Criar ${plano.novos.length} e atualizar ${plano.atualizados.length}`
                : "Nada a gravar"}
            </Botao>
          </Acoes>
        ) : (
          <Acoes>
            <Botao variante="sutil" onClick={onFechar} disabled={ocupado}>Cancelar</Botao>
            <Botao variante="primario" icone="checks" onClick={() => chamar(false)} carregando={ocupado} disabled={!texto.trim()}>
              Conferir o que vai acontecer
            </Botao>
          </Acoes>
        )
      }
    >
      {resultado ? <Feito resultado={resultado} />
        : plano ? <Conferencia plano={plano} leitura={leitura} erro={erro} refErro={refErro} />
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
              Uma linha por item, nesta ordem: <strong style={{ color: "var(--text)" }}>nome</strong>, estoque atual,
              ponto de reposição, unidade e fornecedor. Se a planilha tiver cabeçalho, os nomes das colunas são
              reconhecidos sozinhos. Item que <strong style={{ color: "var(--text)" }}>já existe é atualizado</strong>,
              nunca duplicado — o nome casa mesmo com acento, maiúscula ou espaço a mais diferentes. Quando só a
              pontuação difere (“ROLO-KRAFT” × “ROLO KRAFT”), a linha é <strong style={{ color: "var(--text)" }}>recusada
              pra você escolher a grafia</strong>: criar as duas racharia o estoque em dois itens.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Botao tamanho="sm" variante="secundario" icone="upload" onClick={() => refArquivo.current?.click()}>
                Escolher arquivo (.csv, .tsv, .txt)
              </Botao>
              {arquivo && <span style={{ fontSize: 11.5, color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{arquivo}</span>}
              <input ref={refArquivo} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain"
                onChange={escolherArquivo} style={{ display: "none" }} />
            </div>
            <label htmlFor="importar-texto" style={{ fontSize: 12, fontWeight: 800 }}>Ou cole aqui (Excel colado já vem certo)</label>
            <textarea id="importar-texto" value={texto} onChange={(e) => mudarTexto(e.target.value)}
              placeholder={EXEMPLO} rows={10} spellCheck={false}
              style={{ width: "100%", minHeight: 180, resize: "vertical", background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: "var(--r-sm)", padding: "10px 12px", color: "var(--text)", fontSize: 13,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.5 }} />
            <Aviso tom="info">
              Item importado nasce <strong>sem hierarquia</strong>, na aba “Não classificados”. É de propósito:
              adivinhar a hierarquia pelo nome erraria em silêncio, e ninguém revisa o que parece pronto.
            </Aviso>
            {erro && <p ref={refErro} role="alert" style={{ fontSize: 12.5, color: "var(--perigo)", margin: 0 }}>{erro}</p>}
          </div>
        )}
    </PainelLateral>
  );
}

// ── Passo 2: o que vai acontecer ─────────────────────────────────────────────

function Conferencia({ plano, leitura, erro, refErro }: {
  plano: Plano; leitura: Leitura | null; erro: string | null;
  /** O mesmo `ref` do passo 1 — só um dos dois está montado por vez. */
  refErro: React.Ref<HTMLParagraphElement>;
}) {
  const nada = plano.novos.length === 0 && plano.atualizados.length === 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Os números primeiro: é o que decide se vale a pena ler a lista. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 116px), 1fr))", gap: 8 }}>
        <Numero n={plano.novos.length} rotulo="itens novos" cor="var(--ok)" />
        <Numero n={plano.atualizados.length} rotulo="atualizados" cor="var(--primary-texto, var(--primary))" />
        <Numero n={plano.iguais.length} rotulo="já iguais" cor="var(--text-dim)" />
        {plano.pulados.length > 0 && <Numero n={plano.pulados.length} rotulo="pulados" cor="var(--atencao)" />}
        {plano.descartes.length > 0 && <Numero n={plano.descartes.length} rotulo="com problema" cor="var(--perigo)" />}
      </div>

      {/* Quais colunas viraram quais campos. Uma planilha com o "mínimo" lido
          como estoque passa despercebida: os números batem, no campo errado. */}
      {leitura && (
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
          {leitura.comCabecalho ? "Cabeçalho reconhecido" : "Sem cabeçalho — colunas na ordem padrão"}:{" "}
          {Object.entries(leitura.colunas)
            .filter(([, j]) => j !== undefined)
            .map(([campo, j]) => `coluna ${Number(j) + 1} = ${ROTULO_COLUNA[campo] ?? campo}`)
            .join(" · ")}
        </p>
      )}

      {nada && <Aviso tom="info">Nada a gravar: nenhum item novo e nenhuma diferença nos que já existem.</Aviso>}

      {plano.fornecedoresNovos.length > 0 && (
        <Aviso tom="info">
          {plano.fornecedoresNovos.length === 1 ? "1 fornecedor novo será cadastrado" : `${plano.fornecedoresNovos.length} fornecedores novos serão cadastrados`}: {plano.fornecedoresNovos.join(", ")}.
        </Aviso>
      )}
      {plano.fornecedoresIgnorados.length > 0 && (
        <Aviso tom="atencao">
          Sem permissão pra cadastrar fornecedor — estes ficam de fora e o item entra sem vínculo:{" "}
          {plano.fornecedoresIgnorados.join(", ")}.
        </Aviso>
      )}

      {plano.atualizados.length > 0 && (
        <Secao titulo={`Vão mudar (${plano.atualizados.length})`} icone="pencil">
          {plano.atualizados.map((a) => (
            <div key={`a-${a.linha}`} style={linhaLista}>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflowWrap: "break-word" }}>{a.nome}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 3 }}>
                {a.mudancas.map((m) => (
                  <span key={m.campo} style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
                    {m.rotulo} <strong style={{ color: "var(--text)" }}>{m.de}</strong>
                    {" → "}
                    <strong style={{ color: "var(--primary-texto, var(--primary))" }}>{m.para}</strong>
                  </span>
                ))}
              </div>
              {a.estoqueTravado && (
                <div style={{ fontSize: 11, color: "var(--atencao)", marginTop: 3 }}>
                  o estoque não muda: este item é contado pelas etiquetas
                </div>
              )}
            </div>
          ))}
        </Secao>
      )}

      {plano.novos.length > 0 && (
        <Secao titulo={`Vão ser criados (${plano.novos.length})`} icone="plus">
          {plano.novos.map((n) => (
            <div key={`n-${n.linha}`} style={linhaLista}>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, overflowWrap: "break-word" }}>{n.nome}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>
                {n.quantidade} {n.unidade}
                {n.qtd_minima > 0 ? ` · repor a partir de ${n.qtd_minima}` : ""}
                {n.fornecedor ? ` · ${n.fornecedor}` : ""}
                {" · sem hierarquia"}
              </div>
            </div>
          ))}
        </Secao>
      )}

      {plano.pulados.length > 0 && (
        <Secao titulo={`Estoque não será tocado (${plano.pulados.length})`} icone="tag">
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "0 0 6px" }}>
            Itens contados pelas etiquetas: a quantidade vem da prateleira bipada, e o banco recusa um número digitado.
            Pra corrigir, gere ou dê baixa nas etiquetas.
          </p>
          {plano.pulados.map((p) => (
            <div key={`p-${p.linha}`} style={linhaLista}>
              <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: "break-word" }}>{p.nome}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>
                planilha diz {p.quantidadePlanilha} · sistema conta {p.quantidadeSistema}
              </div>
            </div>
          ))}
        </Secao>
      )}

      {plano.descartes.length > 0 && (
        <Secao titulo={`Linhas que ficam de fora (${plano.descartes.length})`} icone="alert-triangle">
          {plano.descartes.map((d) => (
            <div key={`d-${d.linha}`} style={linhaLista}>
              <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: "break-word" }}>
                linha {d.linha}{d.nome ? ` · ${d.nome}` : ""}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.4, overflowWrap: "break-word" }}>{d.detalhe}</div>
            </div>
          ))}
        </Secao>
      )}

      {erro && <p ref={refErro} role="alert" style={{ fontSize: 12.5, color: "var(--perigo)", margin: 0 }}>{erro}</p>}
    </div>
  );
}

// ── Passo 3: o que foi feito ─────────────────────────────────────────────────

function Feito({ resultado }: { resultado: Resultado }) {
  const { criados, atualizados, fornecedoresCriados, pulados, falhas } = resultado;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.5 }}>
        <strong>{criados} {criados === 1 ? "item criado" : "itens criados"}</strong> e{" "}
        <strong>{atualizados} {atualizados === 1 ? "atualizado" : "atualizados"}</strong>
        {fornecedoresCriados > 0 && <>, além de {fornecedoresCriados} {fornecedoresCriados === 1 ? "fornecedor novo" : "fornecedores novos"}</>}.
      </p>
      {criados > 0 && (
        <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: 0, lineHeight: 1.5 }}>
          Os itens novos estão na aba <strong style={{ color: "var(--text)" }}>Não classificados</strong> do catálogo,
          esperando a hierarquia. Dá pra classificar vários de uma vez por lá.
        </p>
      )}
      {pulados > 0 && (
        <Aviso tom="atencao">
          {pulados === 1 ? "1 item teve o estoque preservado" : `${pulados} itens tiveram o estoque preservado`} — são
          contados pelas etiquetas, e o número deles vem da prateleira bipada.
        </Aviso>
      )}
      {falhas.length > 0 && (
        <Secao titulo={`Não deu pra gravar (${falhas.length})`} icone="alert-triangle">
          {falhas.map((f, i) => (
            <div key={i} style={linhaLista}>
              <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: "break-word" }}>{f.nome || `linha ${f.linha}`}</div>
              <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.4, overflowWrap: "break-word" }}>{f.detalhe}</div>
            </div>
          ))}
        </Secao>
      )}
    </div>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────────

const linhaLista: React.CSSProperties = {
  padding: "8px 10px", borderRadius: "var(--r-sm)",
  border: "1px solid var(--border)", background: "var(--surface)", minWidth: 0,
};

function Numero({ n, rotulo, cor }: { n: number; rotulo: string; cor: string }) {
  return (
    <div style={{ padding: "9px 11px", borderRadius: "var(--r-sm)", background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="stat" style={{ fontSize: 20, lineHeight: 1, color: cor }}>{n}</div>
      <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--text-dim)", marginTop: 3 }}>{rotulo}</div>
    </div>
  );
}

function Secao({ titulo, icone, children }: { titulo: string; icone: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 800, marginBottom: 7 }}>
        <Icon name={icone} size={14} color="var(--text-dim)" /> {titulo}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

// Casca do `Alerta` (ui/Alerta.tsx) — o aviso de sistema é um só no app.
function Aviso({ tom, children }: { tom: "info" | "atencao"; children: React.ReactNode }) {
  return <Alerta tom={tom === "atencao" ? "atencao" : "neutro"}>{children}</Alerta>;
}
