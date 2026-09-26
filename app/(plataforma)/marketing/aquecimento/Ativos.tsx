"use client";

// ── Aquecimento · Ativos ─────────────────────────────────────────────────────
// O inventário. É o MAPA, não a ferramenta — por isso não é a visão padrão.
//
// Estrutura Meta e WhatsApp têm o mesmo formato (container → itens), então um
// componente só resolve as duas: o container é a BM ou o APARELHO. Agrupar
// número por aparelho responde de graça a pergunta que importa quando algo cai
// — o que morreu junto? — sem precisar de cadastro de aparelho.
//
// ── Por que BLOCO e não linha ────────────────────────────────────────────────
// Isto era uma tabela de cinco colunas. Tabela responde "qual o estado da linha
// 7"; quem cuida de aquecimento pergunta outra coisa — "qual celular eu pego
// agora, e o que ele tem dentro". Essa pergunta é sobre o CONTAINER, e numa
// tabela o container era só um cabeçalho fino entre linhas iguais.
//
// No bloco o container é o objeto: a foto do aparelho (é por ela que se acha o
// celular certo na mesa), o rosto de quem responde, os números do que está
// dentro e só então os chips. O que era coluna estreita virou linha inteira, e
// de quebra sumiu o defeito que a tabela tinha por construção — pílula de
// largura variável em coluna de largura fixa, que cobria o progresso.

import { useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { BotaoIcone } from "../../ui/controles";
import { Avatar, Barra, FotoAparelho, PillRitmo, Rostos } from "./pecas";
import { EditarAparelho } from "./EditarAparelho";
import {
  progressoDe, resumoGrupo, ritmoDe, corStatus, piorStatus, rotuloStatus,
  type Aparelho, type Ativo, type Etapa, type Marco, type ResumoGrupo,
} from "@/lib/marketing-aquecimento-const";

interface Props {
  ativos: Ativo[];
  /** Fichas de aparelho (foto, modelo, lugar). Vazio quando o SQL da ficha ainda
   *  não rodou — a tela cai na ilustração e nada mais muda. */
  aparelhos?: Aparelho[];
  etapasPorRoteiro: Map<string, Etapa[]>;
  marcosPorAtivo: Map<string, Marco[]>;
  filtro: "meta" | "whatsapp";
  podeEditar?: boolean;
  onAbrir: (a: Ativo) => void;
  /** Cadastrar um ativo JÁ dentro deste container. */
  onNovo?: (pre: { aparelho?: string; paiId?: string }) => void;
  /** Fichas recarregadas depois de salvar uma. */
  onFichas?: (as: Aparelho[]) => void;
}

interface Grupo {
  chave: string;
  nome: string;
  sub: string;
  icone: string;
  filhos: Ativo[];
  /** A ficha do aparelho, quando o grupo é um aparelho e ela existe. */
  ficha: Aparelho | null;
  /** Grupo que é um aparelho de verdade (dá pra fotografar e renomear). */
  eAparelho: boolean;
  /** A BM em si, quando o grupo é uma BM. Ela também aquece e também pode ser
   *  banida, então tem linha própria — o aparelho, que é só uma caixa, não tem. */
  proprio: Ativo | null;
}

export function Ativos({
  ativos, aparelhos = [], etapasPorRoteiro, marcosPorAtivo, filtro,
  podeEditar = false, onAbrir, onNovo, onFichas,
}: Props) {
  const [editando, setEditando] = useState<Grupo | null>(null);
  const grupos = useMemo(() => agrupar(ativos, aparelhos, filtro), [ativos, aparelhos, filtro]);

  if (!grupos.length) {
    return (
      <div className="ct-sec" style={{
        padding: "38px 22px", textAlign: "center", color: "var(--text-dim)",
      }}>
        <Icon name={filtro === "meta" ? "brand-meta" : "brand-whatsapp"} size={26} color="var(--text-dim)" />
        {/* `marginInline: auto` nos dois: `text-align: center` centra o texto
            DENTRO do bloco de 68ch que o `globals.css` impõe a todo `p`, não o
            bloco — sem isto o ícone fica no meio e o texto num eixo próprio. */}
        <p style={{ margin: "10px auto 0", fontWeight: 600, color: "var(--text)" }}>
          Nada cadastrado {filtro === "meta" ? "na estrutura Meta" : "no WhatsApp"} ainda
        </p>
        <p style={{ margin: "3px auto 0", fontSize: 13, maxWidth: 400 }}>
          Cadastre {filtro === "meta" ? "uma BM ou conta de anúncio" : "um número"} para começar o aquecimento.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="aq-blocos">
        {grupos.map((g) => (
          <Bloco key={g.chave} grupo={g} etapasPorRoteiro={etapasPorRoteiro}
            marcosPorAtivo={marcosPorAtivo} podeEditar={podeEditar}
            onAbrir={onAbrir} onNovo={onNovo}
            onEditarFicha={g.eAparelho ? () => setEditando(g) : undefined} />
        ))}
      </div>

      {editando && (
        <EditarAparelho nome={editando.nome} ficha={editando.ficha}
          quantos={editando.filhos.length}
          onFechar={() => setEditando(null)}
          onSalvo={(as) => { onFichas?.(as); setEditando(null); }} />
      )}
    </>
  );
}

/** BM vira grupo com as contas dentro; número agrupa pelo aparelho. Ativo sem
 *  container (conta órfã, número sem aparelho) cai num grupo "Sem vínculo" em
 *  vez de sumir da tela — ativo invisível é ativo que ninguém aquece. */
function agrupar(ativos: Ativo[], fichas: Aparelho[], filtro: "meta" | "whatsapp"): Grupo[] {
  if (filtro === "whatsapp") {
    const numeros = ativos.filter((a) => a.tipo === "numero");
    const porAparelho = new Map<string, Ativo[]>();
    for (const n of numeros) {
      const k = n.aparelho?.trim() || "";
      const lista = porAparelho.get(k);
      if (lista) lista.push(n); else porAparelho.set(k, [n]);
    }
    // Aparelho com ficha mas SEM chip nenhum continua aparecendo: celular vazio
    // é estoque disponível, e some da tela justamente quando alguém precisa
    // saber onde tem aparelho livre pra começar um chip novo.
    for (const f of fichas) if (f.nome && !porAparelho.has(f.nome)) porAparelho.set(f.nome, []);

    const ficha = (nome: string) => fichas.find((f) => f.nome === nome) ?? null;
    return [...porAparelho.entries()]
      .sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || a[0].localeCompare(b[0]))
      .map(([aparelho, filhos]) => {
        const f = aparelho ? ficha(aparelho) : null;
        return {
          chave: `ap:${aparelho}`,
          nome: aparelho || "Sem aparelho definido",
          // Só o que o NOME ainda não diz. O nome do aparelho costuma ser
          // "Redmi 12 · mesa 1" — exatamente modelo e lugar —, e repeti-los
          // embaixo escreve a mesma coisa duas vezes em duas fontes. Nome de
          // pessoa também sai: a fileira de rostos logo abaixo já o diz.
          sub: novidade(aparelho, [f?.modelo, f?.lugar]),
          icone: "device-mobile",
          filhos, ficha: f, eAparelho: !!aparelho, proprio: null,
        };
      });
  }

  const bms = ativos.filter((a) => a.tipo === "bm");
  const contas = ativos.filter((a) => a.tipo === "conta");
  const grupos: Grupo[] = bms.map((bm) => ({
    chave: bm.id, nome: bm.nome,
    sub: [bm.identificador, `desde ${curto(bm.iniciadoEm)}`].filter(Boolean).join(" · "),
    icone: "brand-meta",
    filhos: contas.filter((c) => c.paiId === bm.id),
    ficha: null, eAparelho: false, proprio: bm,
  }));
  const soltas = contas.filter((c) => !c.paiId || !bms.some((b) => b.id === c.paiId));
  if (soltas.length) {
    grupos.push({
      chave: "sem-bm", nome: "Sem BM vinculada", sub: "",
      icone: "wallet", filhos: soltas, ficha: null, eAparelho: false, proprio: null,
    });
  }
  return grupos;
}

/** Junta só os pedaços que o título ainda não contém, sem diferenciar caixa nem
 *  acento — "Redmi 12 · mesa 1" já diz o modelo e o lugar, e escrevê-los de novo
 *  na linha de baixo é a mesma informação em duas fontes. */
function novidade(titulo: string, partes: (string | null | undefined)[]): string {
  const t = titulo.toLowerCase();
  return partes
    .filter((x): x is string => !!x && !t.includes(x.toLowerCase()))
    .join(" · ");
}

/** Uma entrada por PESSOA, com a foto de quem tem. Dedup pelo nome e não pelo
 *  id: ativo cadastrado com o responsável digitado à mão não tem id, e sem o
 *  dedup por nome a mesma pessoa apareceria duas vezes na pilha de rostos. */
function pessoasDe(as: Ativo[]): { nome: string; foto: string | null }[] {
  const m = new Map<string, { nome: string; foto: string | null }>();
  for (const a of as) {
    if (!a.responsavelNome) continue;
    const atual = m.get(a.responsavelNome);
    if (!atual) m.set(a.responsavelNome, { nome: a.responsavelNome, foto: a.responsavelFoto });
    else if (!atual.foto && a.responsavelFoto) atual.foto = a.responsavelFoto;
  }
  return [...m.values()];
}

const curto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** "3 chips" / "1 chip". Só tira o "s" — todas as palavras usadas aqui (chips,
 *  contas, itens) fazem plural assim. */
const plural = (n: number, palavra: string) => (n === 1 ? palavra.replace(/s$/, "") : palavra);

// ── O bloco ──────────────────────────────────────────────────────────────────

function Bloco({ grupo, etapasPorRoteiro, marcosPorAtivo, podeEditar, onAbrir, onNovo, onEditarFicha }: {
  grupo: Grupo;
  etapasPorRoteiro: Map<string, Etapa[]>;
  marcosPorAtivo: Map<string, Marco[]>;
  podeEditar: boolean;
  onAbrir: (a: Ativo) => void;
  onNovo?: (pre: { aparelho?: string; paiId?: string }) => void;
  onEditarFicha?: () => void;
}) {
  const [aberto, setAberto] = useState(true);
  const dentro = useMemo(
    () => (grupo.proprio ? [grupo.proprio, ...grupo.filhos] : grupo.filhos),
    [grupo.proprio, grupo.filhos]);

  // Os números contam o CONTEÚDO, sem a BM. Contando-a junto, uma BM com três
  // contas dizia "4 contas" — e o número que a pessoa usa pra conferir o parque
  // passava a incluir o container, o que não bate com nada.
  const resumo = useMemo(
    () => resumoGrupo(grupo.filhos, etapasPorRoteiro, marcosPorAtivo),
    [grupo.filhos, etapasPorRoteiro, marcosPorAtivo]);

  // A cor do quadro, essa sim, olha o bloco inteiro: BM restrita com contas
  // saudáveis é exatamente o caso em que o bloco precisa gritar.
  const cor = corStatus(piorStatus(dentro.map((a) => a.status)) ?? "novo");
  const pessoas = useMemo(() => pessoasDe(dentro), [dentro]);
  // Duas palavras diferentes de propósito: a fileira de números conta o CONTEÚDO
  // ("3 contas") e o botão conta o que a lista mostra, que inclui a própria BM
  // quando ela existe ("4 itens"). Usar a mesma palavra nos dois faria um deles
  // mentir por um.
  const itens = grupo.icone === "device-mobile" ? "chips" : "contas";
  const dentroLabel = grupo.proprio ? "itens" : itens;

  return (
    <section className="aq-bloco">
      <header className="aq-bloco-topo">
        {grupo.eAparelho || grupo.icone === "device-mobile" ? (
          <FotoAparelho foto={grupo.ficha?.fotoUrl} cor={cor} rotulo={grupo.nome} />
        ) : (
          <Selo icone={grupo.icone} cor={cor} />
        )}

        <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{
              margin: 0, fontSize: 15, fontWeight: 640, letterSpacing: "-.014em",
              overflowWrap: "anywhere",
            }}>{grupo.nome}</h3>
            {grupo.sub && (
              <p style={{
                margin: "1px 0 0", fontSize: 12.5, color: "var(--text-dim)",
                fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere",
              }}>{grupo.sub}</p>
            )}
          </div>
          {pessoas.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
              <Rostos pessoas={pessoas} tam={22} />
              <span style={{
                fontSize: 12, color: "var(--text-dim)", overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {pessoas.length === 1 ? pessoas[0].nome : `${pessoas.length} responsáveis`}
              </span>
            </div>
          )}
        </div>

        {podeEditar && onEditarFicha && (
          <BotaoIcone icone={grupo.ficha?.fotoUrl ? "pencil" : "camera"}
            titulo={grupo.ficha?.fotoUrl ? "Editar aparelho" : "Adicionar foto do aparelho"}
            variante="sutil" tamanho="sm" onClick={onEditarFicha} />
        )}
      </header>

      <Numeros resumo={resumo} itens={itens} />

      {dentro.length > 0 && (
        <button type="button" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}
          className="aq-bloco-abre">
          <span style={{ display: "inline-flex", transform: aberto ? "none" : "rotate(-90deg)", transition: "transform .24s cubic-bezier(.32,.72,0,1)" }}>
            <Icon name="chevron-down" size={15} color="var(--text-dim)" />
          </span>
          {aberto ? "Esconder" : "Ver"} {dentro.length} {plural(dentro.length, dentroLabel)}
        </button>
      )}

      {aberto && dentro.map((a) => (
        <Item key={a.id} ativo={a}
          etapas={etapasPorRoteiro.get(a.roteiroId ?? "") ?? []}
          marcos={marcosPorAtivo.get(a.id) ?? []}
          destaque={a === grupo.proprio}
          // A BM não repete o próprio nome: o título do bloco JÁ é ela, e ler
          // "BM Tridi · Principal" duas vezes seguidas, uma como cabeçalho e
          // outra como primeira linha, lê como defeito. O que a linha acrescenta
          // é o estado dela — status, progresso, ritmo —, não a identidade.
          titulo={a === grupo.proprio ? "Esta BM" : undefined}
          onAbrir={onAbrir} />
      ))}

      {!dentro.length && (
        <p style={{
          margin: 0, padding: "13px 15px", borderTop: "1px solid var(--border)",
          color: "var(--text-dim)", fontSize: 13,
        }}>
          {grupo.eAparelho
            ? "Nenhum chip neste aparelho — ele está livre."
            : "Nenhuma conta pendurada nesta BM ainda."}
        </p>
      )}

      {podeEditar && onNovo && (grupo.eAparelho || grupo.proprio) && (
        <button type="button" className="aq-bloco-mais"
          onClick={() => onNovo(grupo.eAparelho ? { aparelho: grupo.nome } : { paiId: grupo.proprio!.id })}>
          <Icon name="plus" size={14} color="var(--text-dim)" />
          {grupo.eAparelho ? "Número neste aparelho" : "Conta nesta BM"}
        </button>
      )}
    </section>
  );
}

/** Selo do container que não é um celular (BM, grupo sem vínculo). Mesma
 *  pegada da foto pra que os blocos das duas visões alinhem na mesma grade. */
function Selo({ icone, cor }: { icone: string; cor: string }) {
  return (
    <span aria-hidden style={{
      width: 74, height: 96, flex: "0 0 auto", borderRadius: 13,
      display: "grid", placeItems: "center", border: "1px solid var(--border)",
      background: `color-mix(in srgb, ${cor} 9%, var(--surface-2))`,
    }}>
      <Icon name={icone} size={30} color={cor} />
    </span>
  );
}

/** Os números do bloco. Quatro contagens e, quando há, a faixa do que pede ação.
 *  Zero não vira coluna: "0 caídos" ocupa o mesmo espaço de um número que
 *  importa e ensina a ignorar a fileira inteira. */
function Numeros({ resumo, itens }: { resumo: ResumoGrupo; itens: string }) {
  const cols: { n: number; label: string; cor?: string }[] = [
    { n: resumo.total, label: plural(resumo.total, itens) },
    { n: resumo.aquecendo, label: "aquecendo", cor: "var(--atencao)" },
    { n: resumo.prontos, label: resumo.prontos === 1 ? "pronto" : "prontos", cor: "var(--ok)" },
    { n: resumo.caidos, label: resumo.caidos === 1 ? "caído" : "caídos", cor: "var(--perigo)" },
  ].filter((c, i) => i === 0 || c.n > 0);

  return (
    <div className="aq-bloco-num">
      {cols.map((c) => (
        <span key={c.label} style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <b style={{
            fontSize: 17, fontWeight: 660, letterSpacing: "-.02em",
            fontVariantNumeric: "tabular-nums", color: c.cor ?? "var(--text)",
          }}>{c.n}</b>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.label}</span>
        </span>
      ))}

      {(resumo.vencendo > 0 || resumo.apressados > 0) && (
        <span style={{
          marginLeft: "auto", alignSelf: "center", display: "inline-flex",
          alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999,
          fontSize: 12, fontWeight: 600, whiteSpace: "nowrap",
          background: `color-mix(in srgb, ${resumo.apressados ? "var(--rosa)" : "var(--atencao)"} 14%, transparent)`,
          color: resumo.apressados ? "var(--rosa)" : "var(--atencao)",
        }}>
          <Icon name={resumo.apressados ? "bolt" : "alert-triangle"} size={13}
            color={resumo.apressados ? "var(--rosa)" : "var(--atencao)"} />
          {resumo.apressados
            ? `${resumo.apressados} apressado${resumo.apressados > 1 ? "s" : ""}`
            : `${resumo.vencendo} etapa${resumo.vencendo > 1 ? "s" : ""} vencendo`}
        </span>
      )}
    </div>
  );
}

// ── Um item dentro do bloco ──────────────────────────────────────────────────
// Três linhas, não cinco colunas. O número do chip é a IDENTIDADE dele e não
// pode ser truncado pra caber ao lado de uma pílula — era o que acontecia a
// 320px, onde "(62) 9 9331-7745" virava "(62) 9 9331-…". Empilhado, ele cabe
// inteiro em qualquer largura, e o status vira a tarja colorida da esquerda
// mais a palavra na linha de baixo.

function Item({ ativo, etapas, marcos, onAbrir, destaque, titulo }: {
  ativo: Ativo;
  etapas: Etapa[];
  marcos: Marco[];
  onAbrir: (a: Ativo) => void;
  destaque?: boolean;
  /** Substitui o nome do ativo. Só o container que é ele mesmo um ativo (a BM)
   *  usa isto — ver a chamada. */
  titulo?: string;
}) {
  const prog = progressoDe(etapas, marcos);
  const ritmo = ritmoDe(ativo, etapas, marcos);
  const cor = corStatus(ativo.status);

  return (
    <button type="button" onClick={() => onAbrir(ativo)} className="aq-item"
      style={{ background: destaque ? "var(--surface-2)" : "transparent" }}>
      <span aria-hidden className="aq-item-tarja" style={{ background: cor }} />

      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            flex: 1, minWidth: 0, fontWeight: 580, letterSpacing: "-.006em",
            fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere",
          }}>{titulo ?? ativo.nome}</span>
          {ativo.responsavelNome && (
            <Avatar nome={ativo.responsavelNome} foto={ativo.responsavelFoto} tam={22} />
          )}
        </span>

        <span style={{
          fontSize: 12, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums",
          overflowWrap: "anywhere",
        }}>
          <span style={{ color: cor, fontWeight: 600 }}>{rotuloStatus(ativo.status)}</span>
          {[ativo.operadora, ativo.identificador].filter(Boolean).length > 0 && " · "}
          {[ativo.operadora, ativo.identificador].filter(Boolean).join(" · ")}
          {ativo.pausadoEm && ` · congelado em ${curto(ativo.pausadoEm)}`}
        </span>

        <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <span style={{ flex: 1, minWidth: 40 }}><Barra fracao={prog.fracao} cor={cor} /></span>
          <span style={{
            flex: "0 0 auto", fontSize: 11.5, color: "var(--text-dim)",
            fontVariantNumeric: "tabular-nums",
          }}>{prog.total ? `${prog.feito} de ${prog.total}` : "sem roteiro"}</span>
          <span style={{ flex: "0 0 auto" }}><PillRitmo ritmo={ritmo} /></span>
        </span>
      </span>
    </button>
  );
}
