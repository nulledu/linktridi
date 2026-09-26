"use client";

// ── O editor de aparência ────────────────────────────────────────────────────
// O "Personalizar" da loja: lista de seções à esquerda, prévia ao vivo no meio,
// ajustes à direita. Três decisões sustentam o resto.
//
// 1. O TEMA É UM VALOR. Toda mudança passa pelas funções puras de
//    `lib/vitrine/tema.ts` e devolve um tema novo. Isso dá desfazer de graça
//    (uma pilha de valores) e mantém prévia, painel e "publicar" olhando
//    exatamente o mesmo dado.
//
// 2. A PRÉVIA É UM IFRAME. O `theme.css` da loja manda em `html`, `body` e em
//    seletores de elemento. Dentro da mesma página ele desfiguraria o ERP —
//    e o CSS do ERP desfiguraria a loja. O iframe é a única fronteira que
//    aguenta as duas coisas.
//
// 3. SALVAR ≠ PUBLICAR. O que se mexe é rascunho; a loja no ar só muda quando
//    alguém aperta publicar. Mexer no tema de uma loja que está vendendo não
//    pode ir ao ar meio pronto.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Loja, Produto } from "@/lib/lojas";
import { colecoesDaLoja } from "@/lib/vitrine/colecoes";
import { esquemaDaSecao, secoesDisponiveis } from "@/lib/vitrine/registro";
import {
  adicionarBloco, adicionarSecao, ajustarBloco, ajustarGlobal, ajustarSecao, alternarSecao,
  AJUSTES_GLOBAIS, moverBloco, moverSecao, removerBloco, removerSecao,
} from "@/lib/vitrine/tema";
import { aplicarCorAssinatura, corDeAssinatura } from "@/lib/vitrine/assinatura";
import { ROTULO_TEMPLATE, TEMPLATES, type Tema, type Template } from "@/lib/vitrine/tipos";
import { Icon } from "../../../Icon";
import { Botao, BotaoIcone } from "../../../ui/controles";
import { BotaoPublicar } from "../../../ui/BotaoPublicar";
import { respostaConfiavel } from "../../../ui/rede";
import { Controle, definirCatalogo } from "./Controles";
import "./aparencia.css";

type Selecao =
  | { tipo: "nada" }
  | { tipo: "secao"; secao: string }
  | { tipo: "bloco"; secao: string; bloco: string };

interface Props {
  loja: Loja;
  produtos: Produto[];
  publicado: Tema;
  rascunho: Tema | null;
  persistido: boolean;
  /**
   * Endereço da prévia. Só o banco de provas passa outro — ele roda sem sessão,
   * e a prévia de verdade exige uma.
   */
  previaUrl?: string;
}

export function EditorClient({ loja, produtos, publicado, rascunho, persistido, previaUrl }: Props) {
  const [tema, setTemaCru] = useState<Tema>(rascunho ?? publicado);
  const [pilha, setPilha] = useState<Tema[]>([]);
  const [template, setTemplate] = useState<Template>("inicio");
  const [sel, setSel] = useState<Selecao>({ tipo: "nada" });
  const [aba, setAba] = useState<"secoes" | "tema">("secoes");
  const [sujo, setSujo] = useState(!!rascunho);
  const [ocupado, setOcupado] = useState<"" | "salvando" | "publicando">("");
  const [recado, setRecado] = useState("");
  const [estreito, setEstreito] = useState(false);
  const [painelAberto, setPainelAberto] = useState(false);

  const iframe = useRef<HTMLIFrameElement>(null);
  const previaPronta = useRef(false);

  const colecoes = useMemo(() => colecoesDaLoja(produtos), [produtos]);
  definirCatalogo({
    colecoes: colecoes.map((c) => ({ valor: c.handle, label: `${c.titulo} (${c.quantidade})` })),
    produtos: produtos.map((p) => ({ valor: p.id, label: p.titulo })),
  });

  /** Toda mudança de tema passa por aqui: empilha o anterior e marca sujo. */
  const aplicar = useCallback((fn: (t: Tema) => Tema) => {
    setTemaCru((atual) => {
      const novo = fn(atual);
      if (novo === atual) return atual;
      // Teto de 50: desfazer infinito num objeto deste tamanho é memória à toa,
      // e ninguém volta 50 passos num editor visual.
      setPilha((p) => [...p.slice(-49), atual]);
      setSujo(true);
      return novo;
    });
  }, []);

  const desfazer = useCallback(() => {
    setPilha((p) => {
      if (!p.length) return p;
      setTemaCru(p[p.length - 1]);
      setSujo(true);
      return p.slice(0, -1);
    });
  }, []);

  // ── Conversa com a prévia ──────────────────────────────────────────────────
  const mandar = useCallback((t: Tema, tpl: Template, alvo: string | null) => {
    iframe.current?.contentWindow?.postMessage(
      { fonte: "editor-aparencia", tema: t, template: tpl, secao: alvo },
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    const ouvir = (e: MessageEvent<{ fonte?: string }>) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.fonte !== "previa-pronta") return;
      previaPronta.current = true;
      mandar(tema, template, sel.tipo === "nada" ? null : sel.secao);
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, [mandar, tema, template, sel]);

  useEffect(() => {
    if (previaPronta.current) mandar(tema, template, sel.tipo === "nada" ? null : sel.secao);
  }, [tema, template, sel, mandar]);

  // Sair com trabalho não salvo. O aviso do navegador é feio, e é o único que
  // aparece quando a pessoa fecha a aba — que é justamente quando o trabalho
  // some.
  useEffect(() => {
    if (!sujo) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [sujo]);

  // ── Gravar ─────────────────────────────────────────────────────────────────
  async function gravar(acao: "salvar" | "publicar") {
    setOcupado(acao === "salvar" ? "salvando" : "publicando");
    setRecado("");
    try {
      const r = await fetch(`/api/lojas/${loja.id}/tema`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tema, acao: acao === "publicar" ? "publicar" : "salvar" }),
      });
      const corpo = await r.json().catch(() => ({}));
      // Resposta que não é ok NUNCA vira "salvo": foi assim que 129 escritas
      // leram um redirect de login como sucesso.
      if (!r.ok) {
        setRecado(corpo?.detalhe || corpo?.error || "Não deu pra gravar.");
        return false;
      }
      setSujo(false);
      setRecado(acao === "publicar" ? "Publicado. A loja no ar já está com isto." : "Rascunho salvo.");
      return true;
    } catch {
      setRecado("Sem conexão. Nada foi gravado.");
      return false;
    } finally {
      setOcupado("");
    }
  }

  async function descartar() {
    if (!confirm("Jogar fora as alterações e voltar ao que está no ar?")) return;
    // Só volta ao publicado quando o servidor apagou o rascunho — senão, ao
    // recarregar, ele reaparece e a tela terá mentido.
    try {
      const r = await fetch(`/api/lojas/${loja.id}/tema`, { method: "DELETE" });
      if (!respostaConfiavel(r)) {
        setRecado(r.ok
          ? "Sua sessão expirou — recarregue e entre de novo. O rascunho continua salvo."
          : "Não deu pra descartar. O rascunho continua salvo.");
        return;
      }
    } catch {
      setRecado("Sem conexão. O rascunho continua salvo.");
      return;
    }
    setTemaCru(publicado);
    setPilha([]);
    setSujo(false);
    setRecado("Voltou ao tema publicado.");
  }

  // ── Listas ─────────────────────────────────────────────────────────────────
  const linhasFixas = (faixa: "topo" | "rodape") =>
    tema.fixas[faixa].map((id) => ({ id, secao: tema.secoes[id] })).filter((x) => x.secao);
  const linhasCorpo = tema.ordem[template].map((id) => ({ id, secao: tema.secoes[id] })).filter((x) => x.secao);

  const selecionada = sel.tipo !== "nada" ? tema.secoes[sel.secao] : null;
  const esquema = selecionada ? esquemaDaSecao(selecionada.tipo) : null;

  const escolher = (s: Selecao) => { setSel(s); setPainelAberto(true); };

  return (
    <div className="ap">
      <header className="ap-topo">
        <div className="ap-topo-esq">
          <label className="ap-tpl">
            <span className="visually-hidden">Página</span>
            <select className="ui-input" value={template} onChange={(e) => { setTemplate(e.target.value as Template); setSel({ tipo: "nada" }); }}>
              {TEMPLATES.map((t) => <option key={t} value={t}>{ROTULO_TEMPLATE[t]}</option>)}
            </select>
          </label>
          <BotaoIcone icone="arrow-back-up" titulo="Desfazer" onClick={desfazer} disabled={!pilha.length} variante="sutil" />
          <BotaoIcone
            icone={estreito ? "device-desktop" : "device-mobile"}
            titulo={estreito ? "Ver no computador" : "Ver no celular"}
            onClick={() => setEstreito((v) => !v)}
            variante="sutil"
          />
        </div>
        <div className="ap-topo-dir">
          {sujo && <span className="ap-sujo">Não publicado</span>}
          {sujo && <Botao variante="sutil" onClick={descartar}>Descartar</Botao>}
          <Botao variante="secundario" onClick={() => gravar("salvar")} carregando={ocupado === "salvando"} disabled={!sujo}>
            Salvar
          </Botao>
          <BotaoPublicar onPublicar={() => gravar("publicar")} />
        </div>
      </header>

      {!persistido && (
        <p className="ap-aviso">
          <Icon name="alert-triangle" size={16} />
          O tema ainda não grava: rode o <code>supabase/lojas-tema.sql</code> no Supabase. Até lá dá pra mexer e ver,
          mas nada fica salvo.
        </p>
      )}
      {recado && <p className="ap-recado" role="status">{recado}</p>}

      <div className="ap-corpo">
        {/* ── Coluna das seções ── */}
        <aside className="ap-lista">
          <div className="ui-abas ap-abas" role="tablist">
            <button type="button" role="tab" aria-selected={aba === "secoes"} className="ui-abas-item"
              onClick={() => setAba("secoes")}>Seções</button>
            <button type="button" role="tab" aria-selected={aba === "tema"} className="ui-abas-item"
              onClick={() => { setAba("tema"); setSel({ tipo: "nada" }); setPainelAberto(true); }}>Tema</button>
          </div>

          {aba === "secoes" && (
            <div className="ap-lista-corpo">
              <Grupo titulo="Topo">
                {linhasFixas("topo").map(({ id, secao }) => (
                  <LinhaSecao key={id} id={id} tipo={secao.tipo} desativada={secao.desativada}
                    ativa={sel.tipo !== "nada" && sel.secao === id}
                    onEscolher={() => escolher({ tipo: "secao", secao: id })}
                    onAlternar={() => aplicar((t) => alternarSecao(t, id))} />
                ))}
              </Grupo>

              <Grupo titulo={ROTULO_TEMPLATE[template]}>
                {linhasCorpo.map(({ id, secao }, n) => (
                  <LinhaSecao
                    key={id} id={id} tipo={secao.tipo} desativada={secao.desativada}
                    ativa={sel.tipo !== "nada" && sel.secao === id}
                    onEscolher={() => escolher({ tipo: "secao", secao: id })}
                    onAlternar={() => aplicar((t) => alternarSecao(t, id))}
                    onSubir={n > 0 ? () => aplicar((t) => moverSecao(t, template, n, n - 1)) : undefined}
                    onDescer={n < linhasCorpo.length - 1 ? () => aplicar((t) => moverSecao(t, template, n, n + 1)) : undefined}
                    onRemover={() => aplicar((t) => removerSecao(t, id))}
                    aoSoltar={(de) => aplicar((t) => moverSecao(t, template, de, n))}
                    indice={n}
                  />
                ))}
                {linhasCorpo.length === 0 && <p className="ap-vazio">Nenhuma seção nesta página ainda.</p>}
                <AdicionarSecao template={template} onAdicionar={(tipo) => aplicar((t) => adicionarSecao(t, tipo, template))} />
              </Grupo>

              <Grupo titulo="Rodapé">
                {linhasFixas("rodape").map(({ id, secao }) => (
                  <LinhaSecao key={id} id={id} tipo={secao.tipo} desativada={secao.desativada}
                    ativa={sel.tipo !== "nada" && sel.secao === id}
                    onEscolher={() => escolher({ tipo: "secao", secao: id })}
                    onAlternar={() => aplicar((t) => alternarSecao(t, id))} />
                ))}
              </Grupo>
            </div>
          )}

          {aba === "tema" && (
            <div className="ap-lista-corpo">
              <p className="ap-vazio">As configurações do tema abrem no painel de ajustes.</p>
            </div>
          )}
        </aside>

        {/* ── Prévia ── */}
        <div className={`ap-previa ${estreito ? "ap-previa--estreita" : ""}`}>
          <iframe
            ref={iframe}
            src={previaUrl ?? `/previa/loja/${loja.id}`}
            title="Prévia da loja"
            // `sandbox` sem `allow-top-navigation`: um link clicado na prévia
            // não pode arrastar o editor pra fora e levar o rascunho junto.
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </div>

        {/* ── Ajustes ── */}
        <aside className={`ap-ajustes ${painelAberto ? "is-aberto" : ""}`}>
          <header className="ap-ajustes-cab">
            <strong>{aba === "tema" ? "Tema" : esquema?.nome ?? "Ajustes"}</strong>
            <BotaoIcone icone="x" titulo="Fechar os ajustes" variante="sutil" onClick={() => setPainelAberto(false)} />
          </header>

          <div className="ap-ajustes-corpo">
            {aba === "tema" ? (
              AJUSTES_GLOBAIS.map((g) => (
                <section key={g.grupo}>
                  <p className="ap-grupo">{g.grupo}</p>
                  {g.ajustes.map((a) => (
                    <Controle
                      key={a.id}
                      ajuste={a}
                      // A assinatura é a única cor que não guarda só a si
                      // mesma: ela repinta a loja. Por isso lê de
                      // `corDeAssinatura` (que cai no destaque num tema antigo)
                      // e escreve pela transformação, não pelo ajuste solto.
                      valor={a.id === "signature_color" ? corDeAssinatura(tema) : tema.ajustes[a.id]}
                      onChange={(v) => aplicar((t) =>
                        a.id === "signature_color"
                          ? aplicarCorAssinatura(t, String(v))
                          : ajustarGlobal(t, a.id, v))}
                    />
                  ))}
                </section>
              ))
            ) : sel.tipo === "nada" || !selecionada || !esquema ? (
              <p className="ap-vazio">Escolha uma seção à esquerda.</p>
            ) : sel.tipo === "bloco" ? (
              <AjustesDoBloco
                tema={tema} sel={sel}
                onVoltar={() => setSel({ tipo: "secao", secao: sel.secao })}
                onMudar={(chave, v) => aplicar((t) => ajustarBloco(t, sel.secao, sel.bloco, chave, v))}
                onRemover={() => { aplicar((t) => removerBloco(t, sel.secao, sel.bloco)); setSel({ tipo: "secao", secao: sel.secao }); }}
              />
            ) : (
              <>
                {esquema.ajustes.map((a) => (
                  <Controle key={a.id} ajuste={a} valor={selecionada.ajustes[a.id]}
                    onChange={(v) => aplicar((t) => ajustarSecao(t, sel.secao, a.id, v))} />
                ))}

                {esquema.blocos?.length && (
                  <section className="ap-blocos">
                    <p className="ap-grupo">Blocos</p>
                    {(selecionada.ordemBlocos ?? []).map((bid, n) => {
                      const b = selecionada.blocos?.[bid];
                      const eb = esquema.blocos?.find((x) => x.tipo === b?.tipo);
                      if (!b || !eb) return null;
                      return (
                        <div className="ap-bloco" key={bid}>
                          <button type="button" className="ap-bloco-nome" onClick={() => setSel({ tipo: "bloco", secao: sel.secao, bloco: bid })}>
                            <Icon name={eb.icone ?? "square"} size={16} />
                            <span>{eb.nome}</span>
                          </button>
                          <span className="ap-bloco-acoes">
                            <BotaoIcone icone="chevron-up" titulo="Subir" variante="sutil" disabled={n === 0}
                              onClick={() => aplicar((t) => moverBloco(t, sel.secao, n, n - 1))} />
                            <BotaoIcone icone="chevron-down" titulo="Descer" variante="sutil"
                              disabled={n === (selecionada.ordemBlocos?.length ?? 0) - 1}
                              onClick={() => aplicar((t) => moverBloco(t, sel.secao, n, n + 1))} />
                            <BotaoIcone icone="trash" titulo="Remover" variante="sutil"
                              onClick={() => aplicar((t) => removerBloco(t, sel.secao, bid))} />
                          </span>
                        </div>
                      );
                    })}
                    <div className="ap-add-bloco">
                      {esquema.blocos.map((eb) => (
                        <Botao key={eb.tipo} variante="sutil" icone="plus"
                          onClick={() => aplicar((t) => adicionarBloco(t, sel.secao, eb.tipo))}>
                          {eb.nome}
                        </Botao>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Peças ────────────────────────────────────────────────────────────────────

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="ap-grupo-secoes">
      <p className="ap-grupo">{titulo}</p>
      {children}
    </section>
  );
}

function LinhaSecao({
  id, tipo, desativada, ativa, onEscolher, onAlternar, onSubir, onDescer, onRemover, aoSoltar, indice,
}: {
  id: string; tipo: string; desativada?: boolean; ativa: boolean;
  onEscolher: () => void; onAlternar: () => void;
  onSubir?: () => void; onDescer?: () => void; onRemover?: () => void;
  aoSoltar?: (de: number) => void; indice?: number;
}) {
  const e = esquemaDaSecao(tipo);
  const arrastavel = aoSoltar != null && indice != null;

  return (
    <div
      className={`ap-linha ${ativa ? "is-ativa" : ""} ${desativada ? "is-off" : ""}`}
      data-secao={id}
      draggable={arrastavel}
      onDragStart={(ev) => arrastavel && ev.dataTransfer.setData("text/plain", String(indice))}
      onDragOver={(ev) => arrastavel && ev.preventDefault()}
      onDrop={(ev) => {
        if (!arrastavel) return;
        ev.preventDefault();
        const de = Number(ev.dataTransfer.getData("text/plain"));
        if (Number.isInteger(de) && de !== indice) aoSoltar(de);
      }}
    >
      <button type="button" className="ap-linha-nome" onClick={onEscolher}>
        <Icon name={e?.icone ?? "square"} size={16} />
        <span>{e?.nome ?? tipo}</span>
      </button>
      {/* As ações ficam SEMPRE visíveis, nunca no hover: no celular hover não
          existe, e ação que só aparece ao passar o mouse não existe pra quem
          usa o dedo. */}
      <span className="ap-linha-acoes">
        {onSubir && <BotaoIcone icone="chevron-up" titulo="Subir" variante="sutil" onClick={onSubir} />}
        {onDescer && <BotaoIcone icone="chevron-down" titulo="Descer" variante="sutil" onClick={onDescer} />}
        <BotaoIcone icone={desativada ? "eye-off" : "eye"} titulo={desativada ? "Mostrar" : "Esconder"} variante="sutil" onClick={onAlternar} />
        {onRemover && <BotaoIcone icone="trash" titulo="Remover" variante="sutil" onClick={onRemover} />}
      </span>
    </div>
  );
}

function AdicionarSecao({ template, onAdicionar }: { template: Template; onAdicionar: (tipo: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const disponiveis = secoesDisponiveis(template);

  return (
    <div className="ap-add">
      <Botao variante="sutil" icone="plus" onClick={() => setAberto((v) => !v)} aria-expanded={aberto}>
        Adicionar seção
      </Botao>
      {aberto && (
        <div className="ap-add-lista">
          {disponiveis.map((s) => (
            <button type="button" key={s.tipo} className="ap-add-item"
              onClick={() => { onAdicionar(s.tipo); setAberto(false); }}>
              <Icon name={s.icone} size={16} />
              <span>{s.nome}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AjustesDoBloco({ tema, sel, onVoltar, onMudar, onRemover }: {
  tema: Tema;
  sel: { secao: string; bloco: string };
  onVoltar: () => void;
  onMudar: (chave: string, v: unknown) => void;
  onRemover: () => void;
}) {
  const secao = tema.secoes[sel.secao];
  const bloco = secao?.blocos?.[sel.bloco];
  const eb = esquemaDaSecao(secao?.tipo ?? "")?.blocos?.find((x) => x.tipo === bloco?.tipo);
  if (!bloco || !eb) return <p className="ap-vazio">Este bloco não existe mais.</p>;

  return (
    <>
      <Botao variante="sutil" icone="arrow-left" onClick={onVoltar}>Voltar à seção</Botao>
      {eb.ajustes.map((a) => (
        <Controle key={a.id} ajuste={a} valor={bloco.ajustes[a.id]} onChange={(v) => onMudar(a.id, v)} />
      ))}
      <Botao variante="perigo" icone="trash" onClick={onRemover}>Remover o bloco</Botao>
    </>
  );
}
