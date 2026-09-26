"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../(plataforma)/Icon";
import {
  Acao, Busca, Chip, Faixa, FolhaFoto, Grade, Quadro,
  botaoTexto, campo, cartao, type FerramentasDaFolha, type Gravado,
} from "./pecas";
import type { LocalConhecido } from "@/lib/estoque-local-do-item";

// A tela TEMPORÁRIA de faxina — a mesma pros dois catálogos.
//
// Antes eram dois componentes quase idênticos, um por catálogo. Viraram um só
// quando as duas passaram a falar com /api/fotos-faxina: a rota devolve os dois
// catálogos na MESMA forma, então o que sobrava de diferente era o título e um
// par de botões. Duplicar isso significava consertar cada coisa duas vezes.
//
// No ESTOQUE ela deixou de ser só foto: é a ferramenta do mutirão de organizar
// o galpão. Além da foto, cada item recebe ONDE está (que vira linha de
// `estoque_locais` — a tabela vazia que a aba Localização e a etiqueta física
// consomem) e uma ANOTAÇÃO do que é. É trabalho de várias pessoas ao mesmo
// tempo, em pé, com o celular na mão.
//
// Aberta a QUALQUER PESSOA LOGADA no Gaius, sem exigir a área do mercadinho nem
// a do estoque — ver o porquê e o tamanho da abertura em
// app/api/fotos-faxina/route.ts.

export type Catalogo = "mercadinho" | "estoque";

type ItemFoto = {
  id: string; nome: string; foto: string | null; ativo: boolean;
  codigo: string | null; grupo: string | null; extra: string | null;
  local: string | null; nota: string | null; porQuem: string | null;
};

type Faxina = { itens: ItemFoto[]; locais: LocalConhecido[]; nota: boolean; rastro: boolean };

type Sugestao = { codigo: string; nome: string; marca: string | null; imagemUrl: string | null; thumbUrl: string | null };

/** O que se está procurando. No galpão a pergunta não é "quem está sem foto" e
 *  sim "o que ainda falta" — por isso `falta` é o padrão lá. */
type Filtro = "falta" | "sem-foto" | "com-foto" | "sem-local" | "sem-nota" | "todos";

const SEM_GRUPO = " sem";   // valor impossível de digitar: não colide com categoria de verdade

async function api<T>(consulta: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api/fotos-faxina${consulta}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const corpo = await r.json().catch(() => null);
  // Sessão vencida com a aba aberta é o tropeço mais provável aqui: a
  // ferramenta fica aberta o dia todo enquanto se fotografa prateleira. O
  // middleware responde com um REDIRECT pro /login, então o fetch segue e
  // recebe HTML — sem este caso, o corpo não vira JSON e a tela diria só
  // "não deu certo", mandando a pessoa tentar de novo pra sempre.
  if (r.status === 401 || (!corpo && r.redirected && r.url.includes("/login"))) {
    throw new Error("Sua sessão caiu. Recarregue a página e entre de novo no Gaius.");
  }
  if (!r.ok || !corpo?.ok) throw new Error(corpo?.detalhe || corpo?.error || "Não deu certo. Tente de novo.");
  return corpo.data as T;
}

const TEXTOS: Record<Catalogo, { titulo: string; unidade: string; busca: string; vazio: string }> = {
  mercadinho: {
    titulo: "Fotos do mercadinho",
    unidade: "produto",
    busca: "Buscar produto ou código de barras",
    vazio: "Nenhum produto sem foto por aqui.",
  },
  estoque: {
    titulo: "Organizar o estoque",
    unidade: "item",
    busca: "Buscar item, SKU, categoria ou lugar",
    vazio: "Nada faltando por aqui. Bom trabalho.",
  },
};

export function FaxinaDeFotos({ catalogo, demo = false }: { catalogo: Catalogo; demo?: boolean }) {
  const textos = TEXTOS[catalogo];
  // O galpão é o único catálogo com endereço e anotação. No mercadinho a tela
  // continua sendo o que sempre foi: a foto e nada mais.
  const organiza = catalogo === "estoque";

  const [dados, setDados] = useState<Faxina>(demo ? PROVA[catalogo] : { itens: [], locais: [], nota: true, rastro: true });
  const [carregando, setCarregando] = useState(!demo);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>(organiza ? "falta" : "sem-foto");
  const [grupo, setGrupo] = useState("");            // "" = todos
  const [comInativos, setComInativos] = useState(false);
  const [alvo, setAlvo] = useState<ItemFoto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try { setDados(await api<Faxina>(`?catalogo=${catalogo}`)); }
    catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar o catálogo."); }
    finally { setCarregando(false); }
  }, [catalogo]);

  // Uma carga só, na abertura. Sem poll: o catálogo não muda sozinho enquanto
  // a pessoa arruma foto, e tick de fundo é justamente o que já derrubou o
  // projeto duas vezes (ver CLAUDE.md → "o tick comum tem que voltar VAZIO").
  useEffect(() => { if (!demo) void carregar(); }, [carregar, demo]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2800);
    return () => clearTimeout(t);
  }, [aviso]);

  const ativos = useMemo(() => dados.itens.filter((i) => comInativos || i.ativo), [dados.itens, comInativos]);

  // O que ainda falta, em número. É o placar do mutirão: sem ele ninguém sabe
  // onde continuar nem se o trabalho está andando.
  const falta = useMemo(() => ({
    foto: ativos.filter((i) => !i.foto).length,
    local: ativos.filter((i) => !i.local).length,
    nota: ativos.filter((i) => !i.nota).length,
  }), [ativos]);

  const passa = useCallback((i: ItemFoto, f: Filtro): boolean => {
    switch (f) {
      case "sem-foto": return !i.foto;
      case "com-foto": return !!i.foto;
      case "sem-local": return !i.local;
      case "sem-nota": return !i.nota;
      case "falta": return !i.foto || !i.local || (dados.nota && !i.nota);
      default: return true;
    }
  }, [dados.nota]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return ativos
      .filter((i) => passa(i, filtro))
      .filter((i) => !grupo || (grupo === SEM_GRUPO ? !i.grupo : i.grupo === grupo))
      .filter((i) => !termo
        || i.nome.toLowerCase().includes(termo)
        || (i.codigo ?? "").includes(termo)
        || (i.extra ?? "").toLowerCase().includes(termo)
        || (i.local ?? "").toLowerCase().includes(termo)
        || (i.grupo ?? "").toLowerCase().includes(termo))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [ativos, filtro, grupo, busca, passa]);

  // Prateleiras que REALMENTE aparecem, com quantas ainda batem no filtro atual
  // — é o número que diz de longe onde está o trabalho. "Sem categoria" é uma
  // opção de verdade: costuma ser justamente o canto esquecido do catálogo.
  const prateleiras = useMemo(() => {
    const faltando = new Map<string, number>();
    for (const i of ativos) {
      if (!passa(i, filtro)) continue;
      const k = i.grupo || SEM_GRUPO;
      faltando.set(k, (faltando.get(k) ?? 0) + 1);
    }
    return [...new Set(ativos.map((i) => i.grupo || SEM_GRUPO))]
      .sort((a, b) => (a === SEM_GRUPO ? 1 : b === SEM_GRUPO ? -1 : a.localeCompare(b, "pt-BR")))
      .map((chave) => ({ chave, rotulo: chave === SEM_GRUPO ? "Sem categoria" : chave, faltando: faltando.get(chave) ?? 0 }));
  }, [ativos, filtro, passa]);

  const filtros: Array<[Filtro, string]> = organiza
    ? [["falta", "Falta algo"], ["sem-foto", "Sem foto"], ["sem-local", "Sem lugar"],
       ...(dados.nota ? [["sem-nota", "Sem anotação"] as [Filtro, string]] : []), ["todos", "Todos"]]
    : [["sem-foto", "Sem foto"], ["com-foto", "Com foto"], ["todos", "Todos"]];

  return (
    <main style={{
      minHeight: "100dvh", background: "var(--bg)", color: "var(--text)",
      padding: `calc(14px + var(--safe-t)) max(14px, var(--safe-r)) calc(28px + var(--safe-b)) max(14px, var(--safe-l))`,
    }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* .page-head (fundação) vai no INVÓLUCRO, não no <h1>: as regras são
            `.page-head h1` / `.page-head p`, e é o que faz o título de 32px
            virar 22px no celular. */}
        <header className="page-head">
          <h1 style={{ margin: 0 }}>{textos.titulo}</h1>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)" }}>
            {carregando ? "Carregando o catálogo…" : organiza ? (
              <>Fotografe e diga onde cada coisa está. Qualquer pessoa da equipe pode ajudar.</>
            ) : (
              <>
                {ativos.length} {textos.unidade}(s) ·{" "}
                <strong style={{ color: falta.foto ? "var(--atencao)" : "var(--ok)" }}>
                  {falta.foto === 0 ? "todos com foto" : `${falta.foto} sem foto`}
                </strong>
              </>
            )}
          </p>
        </header>

        {/* O placar. Sem ele o mutirão não sabe onde continuar — e é a primeira
            coisa que se olha ao pegar o celular de novo depois do almoço. */}
        {organiza && !carregando && (
          <Placar total={ativos.length} falta={falta} temNota={dados.nota}
            aoEscolher={(f) => { setFiltro(f); setGrupo(""); }} atual={filtro} />
        )}

        {erro && (
          <Faixa tom="neg" icone="circle-x">
            {erro}{" "}
            <button onClick={() => void carregar()} style={{ ...botaoTexto, color: "inherit", textDecoration: "underline" }}>tentar de novo</button>
          </Faixa>
        )}
        {aviso && <Faixa tom="pos" icone="circle-check">{aviso}</Faixa>}

        <Busca valor={busca} onChange={setBusca} placeholder={textos.busca} />

        {/* .tab-strip: a fileira não cabe a 320px e passa a rolar de lado, em
            vez de espremer os rótulos. */}
        <div className="tab-strip" style={{ gap: 8, marginBottom: prateleiras.length > 1 ? 8 : 14 }}>
          {filtros.map(([v, rotulo]) => (
            <Chip key={v} ativo={filtro === v} onClick={() => setFiltro(v)}>{rotulo}</Chip>
          ))}
          <Chip ativo={comInativos} onClick={() => setComInativos((v) => !v)}>Incluir inativos</Chip>
        </div>
        {prateleiras.length > 1 && (
          <div className="tab-strip" style={{ gap: 8, marginBottom: 14 }}>
            <Chip ativo={!grupo} onClick={() => setGrupo("")}>Todas</Chip>
            {prateleiras.map((p) => (
              <Chip key={p.chave} ativo={grupo === p.chave} onClick={() => setGrupo(p.chave)}>
                {p.rotulo}{p.faltando > 0 && <span style={{ opacity: 0.6, marginLeft: 5 }}>{p.faltando}</span>}
              </Chip>
            ))}
          </div>
        )}

        {carregando ? (
          <Grade>{Array.from({ length: 8 }, (_, i) => <div key={i} style={{ ...cartao, height: 190, opacity: 0.5 }} />)}</Grade>
        ) : visiveis.length === 0 ? (
          <div style={{ ...cartao, padding: 34, textAlign: "center" }}>
            <Icon name="photo" size={26} color="var(--text-dim)" />
            <p style={{ margin: "10px 0 0", fontSize: 14, color: "var(--text-dim)" }}>
              {(filtro === "sem-foto" || filtro === "falta") && !busca ? textos.vazio : "Nada encontrado com esse filtro."}
            </p>
          </div>
        ) : (
          // 132 e não 150: a 320px isto ainda dá DUAS colunas (2×132+10 = 274
          // dentro dos 292 úteis), e num mutirão ver mais itens por rolagem vale
          // mais que um cartão maior — o selo do lugar corta com reticências
          // quando o nome é comprido.
          <Grade minimo={132}>
            {visiveis.map((i) => (
              <button key={i.id} onClick={() => setAlvo(i)} style={{ ...cartao, padding: 8, cursor: "pointer", textAlign: "left", font: "inherit", color: "var(--text)" }}>
                <Quadro url={i.foto} nome={i.nome} />
                <span style={{ display: "block", marginTop: 8, fontSize: 13, fontWeight: 650, lineHeight: 1.25 }}>{i.nome}</span>
                <span style={{ display: "block", marginTop: 3, fontSize: 11, color: "var(--text-dim)" }}>
                  {i.codigo || i.grupo || i.extra || "sem código"}{!i.ativo && " · inativo"}
                </span>
                {organiza && <Selos item={i} temNota={dados.nota} />}
              </button>
            ))}
          </Grade>
        )}
      </div>

      {alvo && (
        <FolhaFoto
          // `key` no id: a folha guarda o rascunho em estado interno e só o lê
          // na montagem. Sem isto, abrir outro item sem passar por fechado
          // deixaria o lugar e a nota do item ANTERIOR no formulário.
          key={alvo.id}
          titulo={alvo.nome}
          subtitulo={[alvo.codigo, alvo.grupo, alvo.extra].filter(Boolean).join(" · ")
            || (catalogo === "mercadinho" ? "sem código de barras" : "item do estoque")}
          inicial={{ foto: alvo.foto, local: alvo.local ?? "", nota: alvo.nota ?? "" }}
          organizar={organiza ? { locais: dados.locais, nota: dados.nota, porQuem: alvo.porQuem } : undefined}
          salvar={async (r) => {
            // Só o que a tela edita viaja. No mercadinho o corpo é o de sempre
            // (a rota RECUSA lugar e nota lá), no estoque vão os três campos.
            const corpo = organiza
              ? { catalogo, id: alvo.id, foto: r.foto, local: r.local, ...(dados.nota ? { nota: r.nota } : {}) }
              : { catalogo, id: alvo.id, foto: r.foto };
            const resposta = await api<{ local: LocalConhecido | null }>("", { method: "PATCH", body: JSON.stringify(corpo) });
            // O lugar volta do servidor porque ele pode ter virado outra grafia:
            // digitar "prateleira a3" entra em "Prateleira A3", e a tela tem que
            // mostrar o nome que ficou GRAVADO, não o que foi digitado.
            const local = resposta?.local ?? null;
            return { rascunho: { ...r, local: local?.nome ?? "" }, local };
          }}
          onFechar={() => setAlvo(null)}
          onAplicado={aplicar}
          // Só o mercadinho ganha os caminhos de busca: item de estoque não tem
          // código de barras nem existe em banco aberto nenhum — componente,
          // peça e embalagem são da casa, e os botões abririam vazios.
          extras={catalogo === "mercadinho" ? (f) => <CaminhosDoMercadinho item={alvo} ferramentas={f} /> : undefined}
        />
      )}
    </main>
  );

  function aplicar({ rascunho, local: lugar }: Gravado) {
    const antes = alvo;
    if (!antes) return;
    setDados((d) => ({
      ...d,
      itens: d.itens.map((i) => (i.id === antes.id
        ? { ...i, foto: rascunho.foto, local: lugar?.nome ?? null, nota: rascunho.nota || null }
        : i)),
      // Lugar recém-criado entra na lista na hora: o próximo item da mesma
      // prateleira tem que aparecer como sugestão, não virar uma segunda grafia.
      locais: lugar && !d.locais.some((l) => l.id === lugar.id)
        ? [...d.locais, lugar].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        : d.locais,
    }));
    setAlvo(null);
    setAviso(lugar ? `Salvo em ${lugar.nome}.` : "Salvo.");
  }
}

// ── O placar do mutirão ─────────────────────────────────────────────────────
// Três números e um toque: cada um é também o filtro correspondente, porque o
// próximo movimento depois de ler "142 sem lugar" é sempre ver quais são.
function Placar({ total, falta, temNota, atual, aoEscolher }: {
  total: number;
  falta: { foto: number; local: number; nota: number };
  temNota: boolean;
  atual: string;
  aoEscolher: (f: Filtro) => void;
}) {
  const pecas: Array<{ f: Filtro; rotulo: string; n: number }> = [
    { f: "sem-foto", rotulo: "sem foto", n: falta.foto },
    { f: "sem-local", rotulo: "sem lugar", n: falta.local },
    ...(temNota ? [{ f: "sem-nota" as Filtro, rotulo: "sem anotação", n: falta.nota }] : []),
  ];
  return (
    // .kpi-row (fundação): grade no computador, carrossel com encaixe no
    // celular — a regra do globals.css troca o `display` com `!important`, por
    // isso o grid vai inline e os filhos NÃO levam `flex` inline (inline
    // ganharia da classe e mataria o encaixe).
    <div className={`kpi-row${pecas.length === 2 ? " kpi-2" : ""}`}
      style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 140px), 1fr))",
        gap: 12, marginBottom: 12,
      }}>
      {pecas.map((p) => {
        const pronto = p.n === 0;
        const ativo = atual === p.f;
        return (
          <button key={p.f} onClick={() => aoEscolher(p.f)} aria-pressed={ativo}
            style={{
              ...cartao, minWidth: 0, padding: "10px 12px", textAlign: "left", font: "inherit",
              cursor: "pointer", color: "var(--text)", minHeight: "var(--tap)",
              borderColor: ativo ? "var(--primary-texto)" : "var(--border)",
            }}>
            <span style={{ display: "block", fontSize: 20, fontWeight: 800, lineHeight: 1.1, color: pronto ? "var(--ok)" : "var(--atencao)" }}>
              {pronto ? "0" : p.n}
            </span>
            <span style={{ display: "block", marginTop: 2, fontSize: 11.5, color: "var(--text-dim)" }}>
              {p.rotulo} <span style={{ opacity: 0.7 }}>de {total}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** O que já está preenchido, direto no cartão: sem isso a pessoa precisa abrir
 *  o item pra descobrir que ele já tem lugar. */
function Selos({ item, temNota }: { item: ItemFoto; temNota: boolean }) {
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
      <span style={{
        display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0, maxWidth: "100%",
        padding: "2px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 700,
        border: `1px solid ${item.local ? "var(--ok)" : "var(--border)"}`,
        color: item.local ? "var(--ok)" : "var(--text-dim)",
      }}>
        <Icon name="map-pin" size={11} color={item.local ? "var(--ok)" : "var(--text-dim)"} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.local || "sem lugar"}
        </span>
      </span>
      {temNota && (
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          padding: "2px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 700,
          border: `1px solid ${item.nota ? "var(--ok)" : "var(--border)"}`,
          color: item.nota ? "var(--ok)" : "var(--text-dim)",
        }}>
          <Icon name="file-text" size={11} color={item.nota ? "var(--ok)" : "var(--text-dim)"} />
          {item.nota ? "anotado" : "sem anotação"}
        </span>
      )}
    </span>
  );
}

// Produto de supermercado está no Open Food Facts (banco aberto, sem chave),
// então dá pra achar a foto pelo código de barras ou pelo nome em vez de
// fotografar a prateleira inteira.
function CaminhosDoMercadinho({ item, ferramentas }: { item: ItemFoto; ferramentas: FerramentasDaFolha }) {
  const { setFoto, ocupado, tentar } = ferramentas;
  const [termo, setTermo] = useState(item.nome);
  // `buscaAberta` é separado de `sugestoes` de propósito: se a busca falhar (o
  // banco aberto responde 503 com frequência), o painel PRECISA continuar na
  // tela — senão o erro aparece e some junto com o campo onde se reescreve o
  // termo, e não sobra o que fazer além de desistir.
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);

  const buscarNome = () => {
    setBuscaAberta(true);
    return tentar("busca", async () => {
      setSugestoes(await api<Sugestao[]>(`?buscar=${encodeURIComponent(termo.trim())}`));
    });
  };

  const buscarCodigo = () => tentar("codigo", async () => {
    const achado = await api<{ nome: string | null; imagemUrl: string | null } | null>(`?codigo=${encodeURIComponent(item.codigo ?? "")}`);
    if (!achado?.imagemUrl) throw new Error("Esse código não tem foto no banco aberto. Tente pelo nome ou envie do aparelho.");
    setFoto(achado.imagemUrl);
    setSugestoes(null); setBuscaAberta(false);
  });

  // A imagem da sugestão é o link DELES. Copiar pro nosso bucket antes de
  // gravar: link de terceiro quebra e o tablet ficaria dependendo de um site
  // de fora pra desenhar a tela. (A rota também RECUSA gravar link de fora.)
  const escolher = (s: Sugestao) => tentar("copiar", async () => {
    const origem = s.imagemUrl ?? s.thumbUrl;
    if (!origem) throw new Error("Essa opção não tem imagem.");
    const r = await api<{ imagemUrl: string | null }>(`?copiar=${encodeURIComponent(origem)}`);
    if (!r?.imagemUrl) throw new Error("Não consegui copiar essa imagem. Tente outra.");
    setFoto(r.imagemUrl);
    setSugestoes(null); setBuscaAberta(false);
  });

  return (
    <>
      {item.codigo && (
        <Acao icone="qrcode" onClick={buscarCodigo} ocupado={ocupado === "codigo"}>Buscar pelo código de barras</Acao>
      )}
      <Acao icone="world" onClick={buscarNome} ocupado={ocupado === "busca"}>Procurar por nome</Acao>

      {buscaAberta && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              value={termo} onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void buscarNome(); }}
              placeholder="Ex.: coca lata"
              style={{ ...campo, flex: 1, minWidth: 0 }} />
            <button onClick={buscarNome} disabled={ocupado === "busca"}
              style={{ ...campo, cursor: "pointer", fontWeight: 650, padding: "0 14px", opacity: ocupado === "busca" ? 0.6 : 1 }}>
              {ocupado === "busca" ? "…" : "Buscar"}
            </button>
          </div>
          {!sugestoes ? null : sugestoes.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-dim)" }}>
              Nada encontrado. Tente outro termo (marca + sabor costuma achar) ou envie a foto do aparelho.
            </p>
          ) : (
            <Grade minimo={96}>
              {sugestoes.map((s, i) => (
                <button key={`${s.codigo}-${i}`} onClick={() => escolher(s)} disabled={!!ocupado}
                  title={[s.marca, s.nome].filter(Boolean).join(" · ")}
                  style={{ ...cartao, padding: 6, cursor: "pointer", textAlign: "left", font: "inherit", color: "var(--text)" }}>
                  <Quadro url={s.thumbUrl ?? s.imagemUrl} nome={s.nome} />
                  <span style={{ marginTop: 5, fontSize: 10.5, lineHeight: 1.25, color: "var(--text-dim)", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>
                    {s.nome}
                  </span>
                </button>
              ))}
            </Grade>
          )}
        </div>
      )}
    </>
  );
}

// Catálogos de mentira do banco de provas (/dev-fotos-*). Nomes longos de
// propósito: nome curto nunca estoura largura nenhuma, e é o comprido que
// quebra o cartão a 320px. O mesmo vale pro nome de lugar.
const PROVA: Record<Catalogo, Faxina> = {
  mercadinho: {
    itens: [
      "Refrigerante de cola em lata 350 ml zero açúcar",
      "Biscoito recheado sabor chocolate 130 g",
      "Água mineral sem gás garrafa 500 ml",
      "Pão de queijo congelado pacote 400 g",
      "Detergente líquido neutro 500 ml",
      "Café torrado e moído tradicional 500 g",
    ].map((nome, i) => ({
      id: String(i + 1), nome, foto: null, ativo: i !== 5,
      codigo: i % 3 === 0 ? null : `789${String(100000000 + i)}`,
      grupo: null, extra: null, local: null, nota: null, porQuem: null,
    })),
    locais: [], nota: false, rastro: false,
  },
  estoque: {
    itens: ([
      ["Borracha de carimbo autoentintado 38×14 mm", "Insumos", "Prateleira A3"],
      ["Cabo plástico para carimbo redondo 40 mm", "Peças", null],
      ["Almofada de tinta preta reposição", "Insumos", null],
      ["Carimbo personalizado retangular montado", null, "Corredor do fundo, estante de cima"],
      ["Caixa de papelão pequena para envio", "Embalagem", null],
      ["Fita adesiva transparente 45 mm rolo", "Embalagem", null],
    ] as Array<[string, string | null, string | null]>).map(([nome, grupo, local], i) => ({
      id: `prova-${i}`, nome, foto: null, ativo: i !== 5,
      codigo: null, grupo, extra: i % 3 === 0 ? "un" : `SKU-${100 + i} · un`,
      local, nota: i === 0 ? "Serve nos carimbos de bolso; a de 38 mm não encaixa no redondo." : null,
      porQuem: i === 0 ? "Ana" : null,
    })),
    locais: [
      { id: "l1", nome: "Prateleira A3", codigo: "A3" },
      { id: "l2", nome: "Prateleira A4", codigo: "A4" },
      { id: "l3", nome: "Corredor do fundo, estante de cima", codigo: "COR-FUNDO-CIMA" },
    ],
    nota: true, rastro: true,
  },
};
