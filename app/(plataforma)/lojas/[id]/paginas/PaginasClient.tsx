"use client";

// ── Páginas da loja ──────────────────────────────────────────────────────────
// Sobre nós, trocas e devoluções, política de privacidade. A vitrine já sabia
// desenhar o template `pagina` desde o porte do tema — o que faltava era onde
// escrever.
//
// O conteúdo é HTML simples, e ele é guardado CRU: quem higieniza é a
// renderização (`higienizar`), na saída. Higienizar na entrada perderia o
// original, e uma regra de segurança nova não conseguiria reprocessar o que já
// foi salvo mutilado.

import { useMemo, useState } from "react";
import { Icon } from "../../../Icon";
import { DataList, type Coluna } from "../../../ui/DataList";
import { Bloco, Cabecalho, Vazio } from "../../ui";
import { Acoes, Botao, Campo, Esp, PainelLateral } from "../../../ui/controles";
import { confirmar, toast } from "../../../Toast";
import { slugDe } from "@/lib/lojas";
import { ROTULO_PAGINA, validarPagina, type Pagina, type StatusPagina } from "@/lib/lojas-conteudo";
import { MODELOS_PAGINA, type BlocoPagina } from "@/lib/lojas-blocos";
import { EditorBlocos, type GrupoDestino } from "./EditorBlocos";
import "./paginas.css";

type Filtro = "todas" | "publicada" | "rascunho";
const FILTROS: { key: Filtro; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "publicada", label: "Publicadas" },
  { key: "rascunho", label: "Rascunhos" },
];

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export interface Catalogo {
  destinos: GrupoDestino[];
  colecoes: { handle: string; titulo: string }[];
  produtos: { id: string; titulo: string }[];
}

export function PaginasClient({ lojaId, slug, paginas, disponivel, comBlocos, catalogo }: {
  lojaId: string; slug: string; paginas: Pagina[]; disponivel: boolean;
  /** A coluna `blocos` já existe no banco. */
  comBlocos: boolean;
  catalogo: Catalogo;
}) {
  const [lista, setLista] = useState(paginas);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [editando, setEditando] = useState<Pagina | "nova" | null>(null);

  const visiveis = useMemo(
    () => (filtro === "todas" ? lista : lista.filter((p) => p.status === filtro)),
    [lista, filtro],
  );
  const contar = (f: Filtro) => (f === "todas" ? lista.length : lista.filter((p) => p.status === f).length);

  async function excluir(p: Pagina) {
    if (!(await confirmar(`Excluir "${p.titulo}"?`, { detalhe: "A página sai do ar na hora.", perigo: true }))) return;
    const r = await fetch(`/api/lojas/${lojaId}/paginas?pagina=${p.id}`, { method: "DELETE" });
    if (!r.ok) { toast.erro("Não deu para excluir."); return; }
    setLista((antes) => antes.filter((x) => x.id !== p.id));
    toast.ok("Página excluída.");
  }

  // Uma definição: tabela no computador, cartão no celular. A linha inteira
  // abre o editor; "ver na loja" e "excluir" são da célula (o DataList não
  // deixa o toque neles abrir a linha) e no celular descem pro rodapé do
  // cartão — antes o cartão nem tinha como excluir.
  const colunas: Coluna<Pagina>[] = [
    {
      chave: "titulo", titulo: "Título", papel: "titulo", ordenar: (p) => p.titulo,
      render: (p) => (
        <span className="pg-titulo">
          <strong>{p.titulo}</strong>
          <small>/p/{p.handle}</small>
        </span>
      ),
    },
    {
      chave: "status", titulo: "Visibilidade", papel: "destaque", ordenar: (p) => ROTULO_PAGINA[p.status].txt,
      render: (p) => (
        <span className="pg-selo" style={{
          background: `color-mix(in srgb, ${ROTULO_PAGINA[p.status].cor} 16%, transparent)`,
          color: ROTULO_PAGINA[p.status].cor,
        }}>{ROTULO_PAGINA[p.status].txt}</span>
      ),
    },
    {
      chave: "atualizada", titulo: "Última atualização", ordenar: (p) => p.atualizadoEm,
      render: (p) => <span className="pg-quando">{quando(p.atualizadoEm)}</span>,
    },
    {
      chave: "acoes", titulo: "Ações", papel: "acoes", alinhar: "right",
      render: (p) => (
        <span className="pg-acoes">
          {p.status === "publicada" && (
            <a href={`/l/${slug}/p/${p.handle}`} target="_blank" rel="noreferrer noopener"
              className="pg-acao" title="Ver na loja" aria-label="Ver na loja">
              <Icon name="external-link" size={15} color="var(--text-dim)" />
            </a>
          )}
          <button type="button" className="pg-acao" onClick={() => excluir(p)} title="Excluir" aria-label="Excluir">
            <Icon name="trash" size={15} color="var(--text-dim)" />
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="lj-tela">
      <Cabecalho
        titulo="Páginas"
        sub="Sobre nós, trocas e devoluções, política de privacidade — o que a vitrine mostra fora do catálogo."
        acao={<Botao variante="primario" icone="plus" onClick={() => setEditando("nova")}>Adicionar página</Botao>}
      />

      {!disponivel && (
        <p className="ap-aviso">
          <Icon name="alert-triangle" size={16} />
          O cadastro de páginas ainda não existe no banco: rode o{" "}
          <code>supabase/lojas-paginas-menus.sql</code> no Supabase.
        </p>
      )}

      {disponivel && !comBlocos && (
        <p className="ap-aviso">
          <Icon name="alert-triangle" size={16} />
          O construtor monta a página, mas os blocos ainda não sobem: rode o{" "}
          <code>supabase/lojas-paginas-blocos.sql</code> no Supabase. Título, endereço
          e visibilidade gravam normalmente.
        </p>
      )}

      <div className="tab-strip pg-abas">
        {FILTROS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFiltro(f.key)} aria-pressed={filtro === f.key}
            className="ui-btn" data-t="sm" data-v={filtro === f.key ? "primario" : "sutil"}>
            {f.label} <span className="pg-conta">{contar(f.key)}</span>
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <Bloco>
          <Vazio
            icone="file-text"
            titulo={lista.length === 0 ? "Nenhuma página ainda" : "Nenhuma página neste filtro"}
            texto={lista.length === 0 ? "Comece pela que todo cliente procura: trocas e devoluções." : undefined}
            acao={lista.length === 0 ? <Botao variante="primario" icone="plus" onClick={() => setEditando("nova")}>Adicionar página</Botao> : undefined}
          />
        </Bloco>
      ) : (
        <DataList
          itens={visiveis}
          colunas={colunas}
          chaveDe={(p) => p.id}
          onAbrir={setEditando}
          rotulo="Páginas da loja"
          minWidth={560}
        />
      )}

      {editando && (
        <EditorDePagina
          lojaId={lojaId}
          slug={slug}
          pagina={editando === "nova" ? null : editando}
          comBlocos={comBlocos}
          catalogo={catalogo}
          usados={lista.map((p) => p.handle)}
          onFechar={() => setEditando(null)}
          onSalvo={(p) => {
            setLista((antes) => {
              const semEla = antes.filter((x) => x.id !== p.id);
              return [p, ...semEla];
            });
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function EditorDePagina({ lojaId, slug, pagina, comBlocos, catalogo, usados, onFechar, onSalvo }: {
  lojaId: string;
  slug: string;
  pagina: Pagina | null;
  comBlocos: boolean;
  catalogo: Catalogo;
  usados: string[];
  onFechar: () => void;
  onSalvo: (p: Pagina) => void;
}) {
  // Página nova começa escolhendo o MODELO. Uma tela em branco com "adicionar
  // bloco" transfere pra pessoa a pergunta que a gente já sabe responder: uma
  // página "Sobre a empresa" tem foto, diferenciais e um caminho pro catálogo.
  const [modelo, setModelo] = useState<string | null>(pagina ? "pronta" : null);
  const [blocos, setBlocos] = useState<BlocoPagina[]>(pagina?.blocos ?? []);
  const [titulo, setTitulo] = useState(pagina?.titulo ?? "");
  // O endereço acompanha o título ENQUANTO ninguém o tocou. Depois de editado à
  // mão ele para de seguir: um endereço já divulgado não pode mudar sozinho
  // porque alguém corrigiu uma vírgula no título.
  const [handle, setHandle] = useState(pagina?.handle ?? "");
  const [soltou, setSoltou] = useState(!!pagina);
  const [conteudo, setConteudo] = useState(pagina?.conteudo ?? "");
  const [status, setStatus] = useState<StatusPagina>(pagina?.status ?? "rascunho");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const trocarTitulo = (v: string) => {
    setTitulo(v);
    if (!soltou) setHandle(slugDe(v));
    setErro("");
  };

  async function salvar() {
    const problema = validarPagina(titulo, handle);
    if (problema) { setErro(problema); return; }
    if (!pagina && usados.includes(handle)) { setErro("Já existe uma página com esse endereço."); return; }

    setSalvando(true);
    try {
      const r = await fetch(`/api/lojas/${lojaId}/paginas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pagina?.id, titulo, handle, conteudo, blocos, status }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j?.detalhe ?? j?.error ?? "Não deu para salvar."); return; }
      // Gravou tudo menos os blocos: a página existe, e dizer só "salvo" faria
      // a pessoa descobrir a perda ao recarregar.
      if (j?.aviso === "blocos_sem_coluna") {
        toast.erro("Salvo, mas os blocos não subiram — falta rodar o lojas-paginas-blocos.sql.");
      } else {
        toast.ok(status === "publicada" ? "Página no ar." : "Rascunho salvo.");
      }
      onSalvo(j.pagina);
    } finally { setSalvando(false); }
  }

  if (!modelo) {
    return (
      <PainelLateral
        titulo="Nova página"
        subtitulo="Escolha por onde começar. Dá para mudar tudo depois."
        onFechar={onFechar}
      >
        <div className="pg-modelos">
          {MODELOS_PAGINA.map((m) => (
            <button key={m.chave} type="button" className="pg-modelo"
              onClick={() => {
                setModelo(m.chave);
                setBlocos(m.blocos());
                if (m.chave !== "vazia" && !titulo) trocarTitulo(m.titulo);
              }}>
              <Icon name={m.icone} size={20} color="var(--text-dim)" />
              <strong>{m.titulo}</strong>
              <small>{m.explica}</small>
            </button>
          ))}
        </div>
      </PainelLateral>
    );
  }

  return (
    <PainelLateral
      titulo={pagina ? "Editar página" : "Nova página"}
      subtitulo={handle ? `Vai atender em /p/${handle}` : "O endereço sai do título."}
      onFechar={onFechar}
      rodape={
        <Acoes>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Esp />
          {pagina?.status === "publicada" && (
            <Botao icone="external-link" onClick={() => window.open(`/l/${slug}/p/${pagina.handle}`, "_blank", "noopener")}>
              Ver na loja
            </Botao>
          )}
          <Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar</Botao>
        </Acoes>
      }
    >
      <Campo label="Título" erro={erro}>
        {(id) => (
          <input id={id} value={titulo} onChange={(e) => trocarTitulo(e.target.value)}
            placeholder="Trocas e devoluções" autoFocus />
        )}
      </Campo>

      <Campo label="Endereço" dica="Só letras minúsculas, números e hífen.">
        {(id) => (
          <input id={id} value={handle}
            onChange={(e) => { setSoltou(true); setHandle(e.target.value.toLowerCase()); setErro(""); }}
            placeholder="trocas-e-devolucoes" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        )}
      </Campo>

      <div className="pg-construtor">
        <span className="ui-campo-rot">Conteúdo da página</span>
        <EditorBlocos
          blocos={blocos}
          destinos={catalogo.destinos}
          colecoes={catalogo.colecoes}
          produtos={catalogo.produtos}
          onMudar={setBlocos}
        />
      </div>

      {/* O HTML antigo continua editável ENQUANTO existir. Some assim que a
          página passa a ser feita de blocos — dois lugares para escrever a
          mesma coisa, com só um deles aparecendo na loja, é armadilha. */}
      {(!blocos.length || !!conteudo) && (
        <details className="pg-html" open={!blocos.length}>
          <summary>Escrever em HTML {blocos.length ? "(não aparece — a página usa blocos)" : ""}</summary>
          <Campo label="HTML" dica="Aceita parágrafo, negrito, lista e link.">
            {(id) => (
              <textarea id={id} value={conteudo} onChange={(e) => setConteudo(e.target.value)} rows={10}
                placeholder="<p>Você tem 7 dias para trocar…</p>" />
            )}
          </Campo>
          {!!conteudo && !!blocos.length && (
            <Botao icone="trash" tamanho="sm" onClick={() => setConteudo("")}>Apagar o HTML antigo</Botao>
          )}
        </details>
      )}

      {/* Botões num <div>, nunca num <label>: rótulo em volta de grupo de
          botões dispara o primeiro ao ser clicado e troca a seleção sozinho. */}
      <div className="pg-status">
        <span className="ui-campo-rot">Visibilidade</span>
        <div>
          {(["rascunho", "publicada"] as StatusPagina[]).map((s) => (
            <button key={s} type="button" onClick={() => setStatus(s)} aria-pressed={status === s}
              className="ui-btn" data-t="sm" data-v={status === s ? "primario" : "sutil"}>
              {ROTULO_PAGINA[s].txt}
            </button>
          ))}
        </div>
      </div>
    </PainelLateral>
  );
}
