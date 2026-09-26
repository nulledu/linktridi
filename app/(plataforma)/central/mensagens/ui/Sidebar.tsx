"use client";

// Sidebar: Geral, favoritos, não lidas, categorias, canais, grupos, conversas,
// sugestões de contato e arquivados.
//
// Cada seção é recolhível e o estado fica no localStorage — quem trabalha com
// 40 canais organiza uma vez e não reorganiza todo dia.

import { Tecla } from "@/app/(plataforma)/ui/exibicao";
import { memo, useCallback, useMemo } from "react";
import { Icon } from "../../../Icon";
import { Avatar } from "./Avatar";
import { corDoCanal, eGeral, porRecencia } from "@/lib/chat/regras";
import { usePrefLocal } from "./usePrefLocal";
import { useRascunhos } from "../data/rascunhos";
import type { Canal, Categoria, Pessoa } from "@/lib/chat/tipos";

interface Props {
  canais: Canal[];
  categorias: Categoria[];
  ativo: string | null;
  salvos: number;
  conexao: "conectando" | "ligado" | "off";
  online: Set<string>;
  aoAbrir: (id: string) => void;
  aoFavoritar: (c: Canal) => void;
  aoNovo: () => void;
  /** Pessoas com quem ainda não há conversa — clicar abre uma. */
  sugestoes?: Pessoa[];
  aoFalarCom?: (p: Pessoa) => void;
  aoVerPessoas?: () => void;
  aoBuscar: () => void;
  aoAbrirSalvos: () => void;
  aoProximaNaoLida: () => void;
  aoMenu: (c: Canal, x: number, y: number) => void;
  /** Arrastar a divisa para dar mais (ou menos) espaço à lista. */
  aoRedimensionar: (e: React.PointerEvent) => void;
  redimensionando: boolean;
}

export function Sidebar(p: Props) {
  const [recolhidas, setRecolhidas] = usePrefLocal<string[]>("gaius:chat:secoes", []);
  const rascunhos = useRascunhos();

  const alternar = useCallback((chave: string) => {
    setRecolhidas((r) => (r.includes(chave) ? r.filter((x) => x !== chave) : [...r, chave]));
  }, [setRecolhidas]);

  const geral = useMemo(() => p.canais.find(eGeral) ?? null, [p.canais]);
  const grupos = useMemo(() => montarGrupos(p.canais, p.categorias), [p.canais, p.categorias]);
  const naoLidas = p.canais.reduce((s, c) => s + c.nao_lidas, 0);
  const sugestoes = p.sugestoes ?? [];

  return (
    <aside className="ch-lateral">
      <button className="ch-puxador" aria-label="Ajustar largura da lista"
        data-arrastando={p.redimensionando ? "1" : undefined}
        onPointerDown={p.aoRedimensionar} />
      <div className="ch-lateral__topo">
        <div className="ch-marca">
          <Icon name="message" size={17} color="var(--primary-texto)" />
          Mensagens
          <span className="ch-marca__sino" title={rotuloConexao(p.conexao)}>
            <Icon
              name={p.conexao === "ligado" ? "circle-dot" : p.conexao === "off" ? "wifi-off" : "loader"}
              size={13}
              color={p.conexao === "ligado" ? "var(--ok)" : p.conexao === "off" ? "var(--atencao)" : "var(--text-dim)"}
            />
          </span>
        </div>

        <button type="button" className="ch-buscar" onClick={p.aoBuscar}>
          <Icon name="search" size={14} color="var(--text-dim)" />
          Buscar
          <Tecla mods={["command"]}>K</Tecla>
        </button>

        <button type="button" className="ch-novo" onClick={p.aoNovo}>
          <Icon name="plus" size={15} color="#fff" /> Nova conversa
        </button>
      </div>

      <div className="ch-lateral__rolagem">
        {/* O Geral é de todo mundo e fica sempre à mão, fora das seções que
            recolhem e da ordenação por recência. */}
        {geral && (
          <ItemCanal
            c={geral} ativo={p.ativo === geral.id} online={false} rascunho={rascunhos.has(geral.id)}
            aoAbrir={p.aoAbrir} aoFavoritar={p.aoFavoritar} aoMenu={p.aoMenu}
          />
        )}
        <button type="button" className="ch-item" onClick={p.aoAbrirSalvos}>
          <Icon name="bookmark" size={15} color="var(--text-dim)" />
          <span className="ch-item__nome">Salvos</span>
          {p.salvos > 0 && <span className="ch-item__badge">{p.salvos}</span>}
        </button>
        {/* Era um número morto. Agora é o "resumo do que está pendente": leva
            ao próximo canal com mensagem nova, e vai passando por eles. */}
        {naoLidas > 0 && (
          <button type="button" className="ch-item ch-item--naolido" onClick={p.aoProximaNaoLida}>
            <Icon name="inbox" size={15} color="var(--primary-texto)" />
            <span className="ch-item__nome">Não lidas</span>
            <span className="ch-item__badge">{naoLidas > 99 ? "99+" : naoLidas}</span>
          </button>
        )}

        {grupos.map((g) => {
          if (!g.canais.length) return null;
          const fechada = recolhidas.includes(g.chave);
          return (
            <section key={g.chave}>
              <button type="button" className="ch-secao" aria-expanded={!fechada}
                onClick={() => alternar(g.chave)}>
                <span className="ch-secao__seta" style={{ display: "flex" }}>
                  <Icon name="chevron-down" size={12} color="var(--text-dim)" />
                </span>
                {g.titulo}
                <span className="ch-secao__acao">{g.canais.length}</span>
              </button>
              {!fechada && g.canais.map((c) => (
                <ItemCanal
                  key={c.id} c={c} ativo={p.ativo === c.id} rascunho={rascunhos.has(c.id)}
                  online={c.parceiro_id ? p.online.has(c.parceiro_id) : false}
                  aoAbrir={p.aoAbrir} aoFavoritar={p.aoFavoritar} aoMenu={p.aoMenu}
                />
              ))}
            </section>
          );
        })}

        {sugestoes.length > 0 && p.aoFalarCom && (
          <section>
            <button type="button" className="ch-secao" aria-expanded={!recolhidas.includes("sugestoes")}
              onClick={() => alternar("sugestoes")}>
              <span className="ch-secao__seta" style={{ display: "flex" }}>
                <Icon name="chevron-down" size={12} color="var(--text-dim)" />
              </span>
              Sugestões
            </button>
            {!recolhidas.includes("sugestoes") && (
              <>
                {sugestoes.map((s) => (
                  <button key={s.id} type="button" className="ch-item ch-item--sugestao" onClick={() => p.aoFalarCom!(s)}
                    title={`Conversar com ${s.name}`}>
                    <Avatar nome={s.name} src={s.avatar} size={32} />
                    <span className="ch-item__nome">
                      {s.name}
                      {s.setor && <span className="ch-item__sub">{s.setor}</span>}
                    </span>
                    <Icon name="message-circle" size={15} color="var(--text-dim)" />
                  </button>
                ))}
                {p.aoVerPessoas && (
                  <button type="button" className="ch-item ch-item--acao" onClick={p.aoVerPessoas}>
                    <Icon name="users" size={15} color="var(--text-dim)" />
                    <span className="ch-item__nome">Ver todas as pessoas</span>
                  </button>
                )}
              </>
            )}
          </section>
        )}

        {p.canais.length === 0 && sugestoes.length === 0 && (
          <div className="ch-vazio" style={{ minHeight: 0, padding: "40px 16px" }}>
            <span className="ch-vazio__icone"><Icon name="hash" size={22} color="var(--text-dim)" /></span>
            <p>Você ainda não participa de nenhum canal. Crie o primeiro ou fale com alguém.</p>
          </div>
        )}
      </div>
    </aside>
  );
}

function rotuloConexao(c: "conectando" | "ligado" | "off") {
  return c === "ligado" ? "Tempo real ligado"
    : c === "off" ? "Sem tempo real — atualizando periodicamente"
    : "Conectando…";
}

const ItemCanal = memo(function ItemCanal({
  c, ativo, online, rascunho = false, aoAbrir, aoFavoritar, aoMenu,
}: {
  c: Canal; ativo: boolean; online: boolean; rascunho?: boolean;
  aoAbrir: (id: string) => void; aoFavoritar: (c: Canal) => void;
  aoMenu: (c: Canal, x: number, y: number) => void;
}) {
  const direta = c.tipo === "direta";
  const grupo = c.tipo === "grupo";
  const geral = eGeral(c);
  const cor = corDoCanal(c);
  return (
    // Não é <button> porque tem um botão dentro (a estrela) — botão aninhado
    // em botão é HTML inválido e o clique interno vira imprevisível.
    <div
      role="button"
      tabIndex={0}
      className={"ch-item" + (c.nao_lidas > 0 && !ativo ? " ch-item--naolido" : "")}
      aria-current={ativo}
      onClick={() => aoAbrir(c.id)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoAbrir(c.id); } }}
      onContextMenu={(e) => { e.preventDefault(); aoMenu(c, e.clientX, e.clientY); }}
      title={c.descricao || c.nome}
    >
      {!direta && !grupo && !geral && cor !== "transparent" && (
        <span className="ch-item__contexto" style={{ background: cor }} aria-hidden />
      )}

      {direta
        ? <Avatar nome={c.nome} src={c.avatar} size={32} status={online ? "online" : "offline"} />
        : grupo
          ? <Avatar nome={c.nome} grupo icone="users" size={32} cor={c.cor} />
          : geral
            ? <Icon name="speakerphone" size={17} color={ativo ? "var(--primary-texto)" : "var(--text-dim)"} />
            : <Icon name={c.privado ? "lock" : "hash"} size={17}
                    color={ativo ? "var(--primary-texto)" : "var(--text-dim)"} />}

      <span className="ch-item__nome">{c.nome}</span>

      {/* Texto parado no campo desta conversa: some ao enviar ou apagar. */}
      {rascunho && !ativo && (
        <span title="Rascunho não enviado" style={{ display: "grid" }}>
          <Icon name="pencil" size={13} color="var(--atencao)" />
        </span>
      )}
      {c.mudo_ate && <Icon name="bell-off" size={13} color="var(--text-dim)" />}
      {c.mencoes > 0
        ? <span className="ch-item__badge ch-item__badge--mencao">@{c.mencoes}</span>
        : c.nao_lidas > 0 && <span className="ch-item__badge">{c.nao_lidas > 99 ? "99+" : c.nao_lidas}</span>}

      <button
        type="button"
        className="ch-item__estrela"
        data-on={c.favorita ? "1" : undefined}
        aria-label={c.favorita ? "Desfavoritar" : "Favoritar"}
        onClick={(e) => { e.stopPropagation(); aoFavoritar(c); }}
        style={{ border: "none", background: "none", boxShadow: "none", cursor: "pointer", padding: 0, display: "grid" }}
      >
        <Icon name="star" size={13} color={c.favorita ? "var(--atencao)" : "var(--text-dim)"} />
      </button>
    </div>
  );
});

interface Grupo { chave: string; titulo: string; canais: Canal[] }

/** Favoritos primeiro, depois as categorias na ordem, depois o resto. O Geral é fixo no topo, fora daqui. */
function montarGrupos(canais: Canal[], categorias: Categoria[]): Grupo[] {
  const vivos = canais.filter((c) => !c.arquivado && !eGeral(c)).sort(porRecencia);
  const favoritos = vivos.filter((c) => c.favorita);
  const usados = new Set(favoritos.map((c) => c.id));

  const porCategoria: Grupo[] = categorias.map((cat) => {
    const lista = vivos.filter((c) => !usados.has(c.id) && c.categoria_id === cat.id);
    for (const c of lista) usados.add(c.id);
    return { chave: `cat:${cat.id}`, titulo: cat.nome, canais: lista };
  });

  const canaisSoltos = vivos.filter((c) => !usados.has(c.id) && c.tipo !== "direta" && c.tipo !== "grupo");
  for (const c of canaisSoltos) usados.add(c.id);
  const gruposDePessoas = vivos.filter((c) => !usados.has(c.id) && c.tipo === "grupo");
  for (const c of gruposDePessoas) usados.add(c.id);
  const diretas = vivos.filter((c) => !usados.has(c.id));
  const arquivados = canais.filter((c) => c.arquivado);

  return [
    { chave: "fav", titulo: "Favoritos", canais: favoritos },
    ...porCategoria,
    { chave: "canais", titulo: "Canais", canais: canaisSoltos },
    { chave: "grupos", titulo: "Grupos", canais: gruposDePessoas },
    { chave: "diretas", titulo: "Conversas", canais: diretas },
    { chave: "arquivados", titulo: "Arquivados", canais: arquivados },
  ];
}
