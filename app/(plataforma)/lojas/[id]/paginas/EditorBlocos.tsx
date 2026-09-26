"use client";

// ── Construtor de página ─────────────────────────────────────────────────────
// A lista de blocos e o formulário de cada um.
//
// A decisão que dá forma ao resto: um bloco por vez fica ABERTO. Oito blocos
// com todos os campos à mostra viram uma parede de trinta caixas de texto num
// painel de 420px, e a pessoa perde de vista o que está montando. Fechado, o
// bloco mostra o tipo e um resumo de uma linha — que é a informação que serve
// pra reordenar, que é o que se faz mais vezes.

import { CampoCor } from "@/app/(plataforma)/ui/cores";
import { useState } from "react";
import { Icon } from "../../../Icon";
import { Botao, BotaoIcone, Campo, Campos } from "../../../ui/controles";
import {
  ESTILOS_BOTAO, TIPOS_BLOCO, blocoNovo, moverBloco, resumoDoBloco,
  type BlocoPagina, type BotaoBloco, type TipoBloco,
} from "@/lib/lojas-blocos";

export interface GrupoDestino { grupo: string; itens: { titulo: string; destino: string }[] }

const ICONE_DO_TIPO = Object.fromEntries(TIPOS_BLOCO.map((t) => [t.tipo, t.icone])) as Record<TipoBloco, string>;
const NOME_DO_TIPO = Object.fromEntries(TIPOS_BLOCO.map((t) => [t.tipo, t.label])) as Record<TipoBloco, string>;

/** Ícones de benefício do tema, com o nome que o lojista entende. */
const ICONES_DESTAQUE: { valor: string; label: string }[] = [
  { valor: "bi-fast-delivery", label: "Entrega rápida" },
  { valor: "bi-delivery", label: "Entrega" },
  { valor: "bi-secure-payment", label: "Pagamento seguro" },
  { valor: "bi-credit-card", label: "Cartão" },
  { valor: "bi-returns", label: "Troca e devolução" },
  { valor: "bi-customer-support", label: "Atendimento" },
  { valor: "bi-shield", label: "Garantia" },
  { valor: "bi-time", label: "Prazo" },
  { valor: "bi-gift-box", label: "Presente" },
  { valor: "bi-phone", label: "Telefone" },
];

// ── Destino de botão ─────────────────────────────────────────────────────────

const OUTRO = "__outro__";

function EscolherDestino({ valor, destinos, onMudar }: {
  valor: string; destinos: GrupoDestino[]; onMudar: (v: string) => void;
}) {
  const naLista = destinos.some((g) => g.itens.some((d) => d.destino === valor));
  // Endereço externo (ou WhatsApp) não está em lista nenhuma — o campo livre
  // nasce aberto quando o valor guardado é um deles, senão a edição existente
  // seria jogada fora no primeiro render.
  const [livre, setLivre] = useState(!naLista && !!valor);

  return (
    <>
      <select
        value={livre ? OUTRO : valor}
        onChange={(e) => {
          if (e.target.value === OUTRO) { setLivre(true); return; }
          setLivre(false);
          onMudar(e.target.value);
        }}
        aria-label="Para onde o botão leva"
      >
        {destinos.map((g) => (
          <optgroup key={g.grupo} label={g.grupo}>
            {g.itens.map((d) => <option key={d.destino} value={d.destino}>{d.titulo}</option>)}
          </optgroup>
        ))}
        <option value={OUTRO}>Outro endereço…</option>
      </select>
      {livre && (
        <input
          value={valor}
          onChange={(e) => onMudar(e.target.value)}
          placeholder="https://wa.me/5514999999999"
          autoCapitalize="none" autoCorrect="off" spellCheck={false}
          aria-label="Endereço do botão"
          style={{ marginTop: 8 }}
        />
      )}
    </>
  );
}

function EditarBotoes({ botoes, destinos, onMudar, max = 3 }: {
  botoes: BotaoBloco[]; destinos: GrupoDestino[]; onMudar: (b: BotaoBloco[]) => void; max?: number;
}) {
  const mexer = (i: number, campo: Partial<BotaoBloco>) =>
    onMudar(botoes.map((b, k) => (k === i ? { ...b, ...campo } : b)));

  return (
    <div className="pb-botoes">
      <span className="ui-campo-rot">Botões</span>
      {botoes.map((b, i) => (
        <div className="pb-botao" key={i}>
          <div className="pb-botao-topo">
            <input
              value={b.texto}
              onChange={(e) => mexer(i, { texto: e.target.value })}
              placeholder="Ver produtos"
              aria-label={`Texto do botão ${i + 1}`}
            />
            <BotaoIcone icone="trash" titulo="Remover botão" tamanho="sm"
              onClick={() => onMudar(botoes.filter((_, k) => k !== i))} />
          </div>
          <EscolherDestino valor={b.destino} destinos={destinos} onMudar={(destino) => mexer(i, { destino })} />
          {/* Em <div>, nunca em <label>: rótulo em volta de grupo de botões
              dispara o primeiro ao ser clicado e troca a seleção sozinho. */}
          <div className="pb-estilos">
            {ESTILOS_BOTAO.map((e) => (
              <button key={e.key} type="button" className="ui-btn" data-t="sm"
                data-v={b.estilo === e.key ? "primario" : "sutil"}
                aria-pressed={b.estilo === e.key}
                onClick={() => mexer(i, { estilo: e.key })}>{e.label}</button>
            ))}
          </div>
        </div>
      ))}
      {botoes.length < max && (
        <Botao icone="plus" tamanho="sm"
          onClick={() => onMudar([...botoes, { texto: "Ver produtos", destino: destinos[0]?.itens[0]?.destino ?? "/c", estilo: botoes.length ? "secundario" : "primario" }])}>
          Adicionar botão
        </Botao>
      )}
    </div>
  );
}

// ── Formulário de cada tipo ──────────────────────────────────────────────────

function Formulario({ bloco: b, destinos, colecoes, produtos, onMudar }: {
  bloco: BlocoPagina;
  destinos: GrupoDestino[];
  colecoes: { handle: string; titulo: string }[];
  produtos: { id: string; titulo: string }[];
  onMudar: (b: BlocoPagina) => void;
}) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const mexer = (campo: Record<string, unknown>) => onMudar({ ...b, ...campo } as any);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const AlinharEm = ({ valor }: { valor: "left" | "center" }) => (
    <div className="pb-linha-btn">
      <span className="ui-campo-rot">Alinhamento</span>
      <div>
        {([["left", "À esquerda"], ["center", "Centralizado"]] as const).map(([k, rot]) => (
          <button key={k} type="button" className="ui-btn" data-t="sm"
            data-v={valor === k ? "primario" : "sutil"} aria-pressed={valor === k}
            onClick={() => mexer({ alinhamento: k })}>{rot}</button>
        ))}
      </div>
    </div>
  );

  switch (b.tipo) {
    case "texto":
      return (
        <>
          <Campo label="Título" dica="Deixe vazio para o texto começar direto.">
            {(id) => <input id={id} value={b.titulo} onChange={(e) => mexer({ titulo: e.target.value })} placeholder="Sobre nós" />}
          </Campo>
          <Campo label="Texto" dica="Aceita HTML simples: parágrafo, negrito, lista e link.">
            {(id) => <textarea id={id} rows={7} value={b.conteudo} onChange={(e) => mexer({ conteudo: e.target.value })} />}
          </Campo>
          <AlinharEm valor={b.alinhamento} />
        </>
      );

    case "imagem":
      return (
        <>
          <Campo label="Endereço da imagem" dica="Cole o link da foto. Ela aparece do jeito que está — não é recortada.">
            {(id) => <input id={id} value={b.url} onChange={(e) => mexer({ url: e.target.value })} placeholder="https://…" autoCapitalize="none" spellCheck={false} />}
          </Campo>
          <Campos>
            <Campo label="Descrição da imagem" dica="Lida por quem não enxerga a foto.">
              {(id) => <input id={id} value={b.alt} onChange={(e) => mexer({ alt: e.target.value })} />}
            </Campo>
            <Campo label="Legenda">
              {(id) => <input id={id} value={b.legenda} onChange={(e) => mexer({ legenda: e.target.value })} />}
            </Campo>
          </Campos>
          <div className="pb-linha-btn">
            <span className="ui-campo-rot">Largura</span>
            <div>
              {([["estreita", "Estreita"], ["larga", "Larga"]] as const).map(([k, rot]) => (
                <button key={k} type="button" className="ui-btn" data-t="sm"
                  data-v={b.largura === k ? "primario" : "sutil"} aria-pressed={b.largura === k}
                  onClick={() => mexer({ largura: k })}>{rot}</button>
              ))}
            </div>
          </div>
        </>
      );

    case "imagem-texto":
      return (
        <>
          <Campo label="Endereço da imagem">
            {(id) => <input id={id} value={b.url} onChange={(e) => mexer({ url: e.target.value })} placeholder="https://…" autoCapitalize="none" spellCheck={false} />}
          </Campo>
          <Campo label="Descrição da imagem" dica="Lida por quem não enxerga a foto.">
            {(id) => <input id={id} value={b.alt} onChange={(e) => mexer({ alt: e.target.value })} />}
          </Campo>
          <div className="pb-linha-btn">
            <span className="ui-campo-rot">Foto à</span>
            <div>
              {([["esquerda", "Esquerda"], ["direita", "Direita"]] as const).map(([k, rot]) => (
                <button key={k} type="button" className="ui-btn" data-t="sm"
                  data-v={b.lado === k ? "primario" : "sutil"} aria-pressed={b.lado === k}
                  onClick={() => mexer({ lado: k })}>{rot}</button>
              ))}
            </div>
          </div>
          <Campo label="Título">
            {(id) => <input id={id} value={b.titulo} onChange={(e) => mexer({ titulo: e.target.value })} />}
          </Campo>
          <Campo label="Texto">
            {(id) => <textarea id={id} rows={6} value={b.conteudo} onChange={(e) => mexer({ conteudo: e.target.value })} />}
          </Campo>
          <EditarBotoes botoes={b.botoes} destinos={destinos} onMudar={(botoes) => mexer({ botoes })} max={2} />
        </>
      );

    case "botoes":
      return (
        <>
          <EditarBotoes botoes={b.botoes} destinos={destinos} onMudar={(botoes) => mexer({ botoes })} max={4} />
          <AlinharEm valor={b.alinhamento} />
        </>
      );

    case "produtos":
      return (
        <>
          <Campo label="Título" dica="Deixe vazio para mostrar só a grade.">
            {(id) => <input id={id} value={b.titulo} onChange={(e) => mexer({ titulo: e.target.value })} />}
          </Campo>
          <div className="pb-linha-btn">
            <span className="ui-campo-rot">Quais produtos</span>
            <div>
              {([["colecao", "De uma categoria"], ["escolhidos", "Escolhidos a dedo"]] as const).map(([k, rot]) => (
                <button key={k} type="button" className="ui-btn" data-t="sm"
                  data-v={b.fonte === k ? "primario" : "sutil"} aria-pressed={b.fonte === k}
                  onClick={() => mexer({ fonte: k })}>{rot}</button>
              ))}
            </div>
          </div>

          {b.fonte === "colecao" ? (
            <>
              <Campo label="Categoria" dica="Produto novo na categoria entra sozinho — a página não envelhece.">
                {(id) => (
                  <select id={id} value={b.colecao} onChange={(e) => mexer({ colecao: e.target.value })}>
                    <option value="">Todos os produtos</option>
                    {colecoes.map((c) => <option key={c.handle} value={c.handle}>{c.titulo}</option>)}
                  </select>
                )}
              </Campo>
              <Campo label="Quantos mostrar">
                {(id) => (
                  <select id={id} value={String(b.limite)} onChange={(e) => mexer({ limite: Number(e.target.value) })}>
                    {[2, 3, 4, 6, 8, 12].map((n) => <option key={n} value={n}>{n} produtos</option>)}
                  </select>
                )}
              </Campo>
            </>
          ) : (
            <Campo label="Produtos" dica={`${b.produtos.length} escolhidos. Toque para incluir ou tirar.`}>
              <div className="pb-produtos">
                {produtos.length === 0 && <p className="pb-nada">Esta loja ainda não tem produtos.</p>}
                {produtos.map((p) => {
                  const dentro = b.produtos.includes(p.id);
                  return (
                    <button key={p.id} type="button" className="ui-btn" data-t="sm"
                      data-v={dentro ? "primario" : "sutil"} aria-pressed={dentro}
                      onClick={() => mexer({
                        produtos: dentro ? b.produtos.filter((x) => x !== p.id) : [...b.produtos, p.id].slice(0, 12),
                      })}>
                      {p.titulo}
                    </button>
                  );
                })}
              </div>
            </Campo>
          )}
          <EditarBotoes botoes={b.botoes} destinos={destinos} onMudar={(botoes) => mexer({ botoes })} max={1} />
        </>
      );

    case "destaques":
      return (
        <>
          <Campo label="Título">
            {(id) => <input id={id} value={b.titulo} onChange={(e) => mexer({ titulo: e.target.value })} />}
          </Campo>
          {b.itens.map((it, i) => (
            <div className="pb-sub" key={i}>
              <div className="pb-sub-topo">
                <strong>Diferencial {i + 1}</strong>
                <BotaoIcone icone="trash" titulo="Remover" tamanho="sm"
                  onClick={() => mexer({ itens: b.itens.filter((_, k) => k !== i) })} />
              </div>
              <Campos min={170}>
                <Campo label="Ícone">
                  {(id) => (
                    <select id={id} value={it.icone}
                      onChange={(e) => mexer({ itens: b.itens.map((x, k) => (k === i ? { ...x, icone: e.target.value } : x)) })}>
                      {ICONES_DESTAQUE.map((o) => <option key={o.valor} value={o.valor}>{o.label}</option>)}
                    </select>
                  )}
                </Campo>
                <Campo label="Título">
                  {(id) => <input id={id} value={it.titulo}
                    onChange={(e) => mexer({ itens: b.itens.map((x, k) => (k === i ? { ...x, titulo: e.target.value } : x)) })} />}
                </Campo>
              </Campos>
              <Campo label="Texto">
                {(id) => <input id={id} value={it.texto}
                  onChange={(e) => mexer({ itens: b.itens.map((x, k) => (k === i ? { ...x, texto: e.target.value } : x)) })} />}
              </Campo>
            </div>
          ))}
          {b.itens.length < 6 && (
            <Botao icone="plus" tamanho="sm"
              onClick={() => mexer({ itens: [...b.itens, { icone: "bi-shield", titulo: "", texto: "" }] })}>
              Adicionar diferencial
            </Botao>
          )}
        </>
      );

    case "perguntas":
      return (
        <>
          <Campo label="Título" dica="Deixe vazio se o título já está num bloco de texto acima.">
            {(id) => <input id={id} value={b.titulo} onChange={(e) => mexer({ titulo: e.target.value })} />}
          </Campo>
          {b.itens.map((it, i) => (
            <div className="pb-sub" key={i}>
              <div className="pb-sub-topo">
                <strong>Pergunta {i + 1}</strong>
                <BotaoIcone icone="trash" titulo="Remover" tamanho="sm"
                  onClick={() => mexer({ itens: b.itens.filter((_, k) => k !== i) })} />
              </div>
              <Campo label="Pergunta">
                {(id) => <input id={id} value={it.pergunta}
                  onChange={(e) => mexer({ itens: b.itens.map((x, k) => (k === i ? { ...x, pergunta: e.target.value } : x)) })} />}
              </Campo>
              <Campo label="Resposta">
                {(id) => <textarea id={id} rows={3} value={it.resposta}
                  onChange={(e) => mexer({ itens: b.itens.map((x, k) => (k === i ? { ...x, resposta: e.target.value } : x)) })} />}
              </Campo>
            </div>
          ))}
          {b.itens.length < 30 && (
            <Botao icone="plus" tamanho="sm"
              onClick={() => mexer({ itens: [...b.itens, { pergunta: "", resposta: "" }] })}>
              Adicionar pergunta
            </Botao>
          )}
        </>
      );

    case "chamada":
      return (
        <>
          <Campo label="Título">
            {(id) => <input id={id} value={b.titulo} onChange={(e) => mexer({ titulo: e.target.value })} />}
          </Campo>
          <Campo label="Texto">
            {(id) => <textarea id={id} rows={3} value={b.conteudo} onChange={(e) => mexer({ conteudo: e.target.value })} />}
          </Campo>
          <Campo label="Cor de fundo" dica="Vazio segue a cor do tema — e continua seguindo quando você trocar a cor da loja.">
            {(id) => (
              <div className="pb-cor">
                <CampoCor id={id} rotulo="Cor de fundo" valor={b.fundo || "#f4f4f5"} aoMudar={(v) => mexer({ fundo: v })} />
                <input value={b.fundo} onChange={(e) => mexer({ fundo: e.target.value })} placeholder="Cor do tema"
                  autoCapitalize="none" spellCheck={false} aria-label="Cor de fundo em hexadecimal" />
                {b.fundo && <Botao tamanho="sm" onClick={() => mexer({ fundo: "" })}>Usar a do tema</Botao>}
              </div>
            )}
          </Campo>
          <EditarBotoes botoes={b.botoes} destinos={destinos} onMudar={(botoes) => mexer({ botoes })} max={2} />
        </>
      );
  }
}

// ── A lista ──────────────────────────────────────────────────────────────────

export function EditorBlocos({ blocos, destinos, colecoes, produtos, onMudar }: {
  blocos: BlocoPagina[];
  destinos: GrupoDestino[];
  colecoes: { handle: string; titulo: string }[];
  produtos: { id: string; titulo: string }[];
  onMudar: (b: BlocoPagina[]) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(blocos[0]?.id ?? null);
  const [escolhendo, setEscolhendo] = useState(false);

  const trocar = (b: BlocoPagina) => onMudar(blocos.map((x) => (x.id === b.id ? b : x)));

  return (
    <div className="pb">
      {blocos.map((b, i) => {
        const expandido = aberto === b.id;
        return (
          <div className="pb-item" key={b.id} data-aberto={expandido ? "1" : undefined}>
            <div className="pb-cab">
              <button type="button" className="pb-abrir"
                onClick={() => setAberto(expandido ? null : b.id)}
                aria-expanded={expandido}>
                <Icon name={ICONE_DO_TIPO[b.tipo]} size={16} color="var(--text-dim)" />
                <span className="pb-cab-txt">
                  <small>{NOME_DO_TIPO[b.tipo]}</small>
                  <strong>{resumoDoBloco(b)}</strong>
                </span>
              </button>
              <div className="pb-cab-acoes">
                <BotaoIcone icone="chevron-up" titulo="Subir" tamanho="sm" disabled={i === 0}
                  onClick={() => onMudar(moverBloco(blocos, b.id, -1))} />
                <BotaoIcone icone="chevron-down" titulo="Descer" tamanho="sm" disabled={i === blocos.length - 1}
                  onClick={() => onMudar(moverBloco(blocos, b.id, 1))} />
                <BotaoIcone icone="trash" titulo="Remover bloco" tamanho="sm"
                  onClick={() => onMudar(blocos.filter((x) => x.id !== b.id))} />
              </div>
            </div>
            {expandido && (
              <div className="pb-corpo">
                <Formulario bloco={b} destinos={destinos} colecoes={colecoes} produtos={produtos} onMudar={trocar} />
              </div>
            )}
          </div>
        );
      })}

      {escolhendo ? (
        <div className="pb-tipos">
          {TIPOS_BLOCO.map((t) => (
            <button key={t.tipo} type="button" className="pb-tipo"
              onClick={() => {
                const novo = blocoNovo(t.tipo);
                onMudar([...blocos, novo]);
                setAberto(novo.id);
                setEscolhendo(false);
              }}>
              <Icon name={t.icone} size={18} color="var(--text-dim)" />
              <strong>{t.label}</strong>
              <small>{t.explica}</small>
            </button>
          ))}
          <Botao tamanho="sm" onClick={() => setEscolhendo(false)}>Cancelar</Botao>
        </div>
      ) : (
        <Botao icone="plus" onClick={() => setEscolhendo(true)}>Adicionar bloco</Botao>
      )}
    </div>
  );
}
