"use client";

// ── Carrinho e checkout da vitrine ───────────────────────────────────────────
// A ÚNICA parte da vitrine que precisa de JavaScript. O catálogo e a página do
// produto continuam sendo HTML pronto do servidor; só quem clicou em comprar
// carrega isto.
//
// O carrinho mora no `localStorage`, por loja. Não é preguiça de fazer no
// servidor: carrinho no banco exige identificar visitante anônimo (cookie,
// sessão, limpeza de abandonados) pra guardar uma lista que só interessa a
// quem está com a aba aberta. Quando ele vira pedido, aí sim é o servidor que
// manda — e ele recalcula tudo.
//
// Regra que atravessa o arquivo: o preço daqui é PALPITE DE TELA. Quem diz
// quanto custa é o servidor, na hora de fechar. Se divergir, a resposta do
// servidor vence e a tela avisa.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ACEITA_CARRINHO, ACEITA_WHATSAPP, linkWhatsApp, moeda, precoVigente, totalDoCarrinho,
  type ItemCarrinho, type Loja, type Produto,
} from "@/lib/lojas";

const chave = (lojaId: string) => `vt-carrinho:${lojaId}`;

function ler(lojaId: string): ItemCarrinho[] {
  try {
    const cru = localStorage.getItem(chave(lojaId));
    const lista = cru ? JSON.parse(cru) : [];
    return Array.isArray(lista) ? lista.filter((i) => i?.produtoId && i?.quantidade > 0) : [];
  } catch { return []; }
}

/** Muda o carrinho e avisa as outras peças da MESMA aba. */
function gravar(lojaId: string, itens: ItemCarrinho[]) {
  try { localStorage.setItem(chave(lojaId), JSON.stringify(itens)); } catch { /* aba anônima cheia */ }
  // `storage` só dispara em OUTRAS abas. Sem um evento próprio, o botão do
  // topo não saberia que o carrinho mudou nesta aqui.
  window.dispatchEvent(new CustomEvent("vt-carrinho", { detail: lojaId }));
}

/**
 * O carrinho da loja, compartilhado.
 *
 * Exportado porque a vitrine com tema desenha o carrinho com as classes do
 * tema, e não com as da vitrine simples. O que NÃO pode existir são dois
 * carrinhos: a chave do `localStorage` é a mesma, então quem troca de modelo de
 * vitrine não perde o que já tinha posto na sacola.
 */
export function useCarrinho(lojaId: string) {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  // Só depois de montar: no servidor não existe `localStorage`, e ler durante
  // a renderização faria o HTML do servidor divergir do primeiro quadro do
  // cliente (erro de hidratação).
  useEffect(() => {
    const sincronizar = () => setItens(ler(lojaId));
    sincronizar();
    window.addEventListener("vt-carrinho", sincronizar);
    window.addEventListener("storage", sincronizar);
    return () => {
      window.removeEventListener("vt-carrinho", sincronizar);
      window.removeEventListener("storage", sincronizar);
    };
  }, [lojaId]);

  const mudar = useCallback((fn: (a: ItemCarrinho[]) => ItemCarrinho[]) => {
    const novo = fn(ler(lojaId));
    gravar(lojaId, novo);
    setItens(novo);
  }, [lojaId]);

  return { itens, mudar };
}

// ── Botão de comprar (na página do produto) ──────────────────────────────────

export function Comprar({ loja, produto }: { loja: Loja; produto: Produto }) {
  const { itens, mudar } = useCarrinho(loja.id);
  const [aberto, setAberto] = useState(false);
  const noCarrinho = itens.find((i) => i.produtoId === produto.id)?.quantidade ?? 0;
  const esgotado = produto.estoque === 0 && !produto.venderSemEstoque;

  const adicionar = () => {
    mudar((a) => {
      const achado = a.find((i) => i.produtoId === produto.id);
      if (achado) {
        return a.map((i) => (i.produtoId === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i));
      }
      return [...a, {
        produtoId: produto.id, titulo: produto.titulo,
        quantidade: 1, precoUnitario: precoVigente(produto),
      }];
    });
    setAberto(true);
  };

  // Comprar direto pelo WhatsApp leva SÓ este produto — quem aperta aqui quer
  // este, não o que sobrou no carrinho de ontem.
  const zap = linkWhatsApp(loja, [{
    produtoId: produto.id, titulo: produto.titulo, quantidade: 1, precoUnitario: precoVigente(produto),
  }]);

  if (esgotado) return null;

  return (
    <>
      <div className="vt-acoes">
        {ACEITA_CARRINHO(loja.checkout) && (
          <button type="button" className="vt-btn vt-btn-primario" onClick={adicionar}>
            {noCarrinho ? `No carrinho (${noCarrinho}) — adicionar mais` : "Adicionar ao carrinho"}
          </button>
        )}
        {ACEITA_WHATSAPP(loja.checkout) && zap && (
          <a className="vt-btn vt-btn-zap" href={zap} target="_blank" rel="noreferrer noopener">
            Pedir pelo WhatsApp
          </a>
        )}
      </div>
      {aberto && <Painel loja={loja} aoFechar={() => setAberto(false)} />}
    </>
  );
}

// ── Botão do topo, em toda página ────────────────────────────────────────────

export function BotaoCarrinho({ loja }: { loja: Loja }) {
  const { itens } = useCarrinho(loja.id);
  const [aberto, setAberto] = useState(false);
  const pecas = itens.reduce((s, i) => s + i.quantidade, 0);

  if (!ACEITA_CARRINHO(loja.checkout) || !pecas) return null;
  return (
    <>
      <button type="button" className="vt-carrinho-btn" onClick={() => setAberto(true)}>
        Carrinho <span className="vt-bolha">{pecas}</span>
      </button>
      {aberto && <Painel loja={loja} aoFechar={() => setAberto(false)} />}
    </>
  );
}

// ── Painel do carrinho + checkout ────────────────────────────────────────────

type Fase = "carrinho" | "dados" | "pronto";

function Painel({ loja, aoFechar }: { loja: Loja; aoFechar: () => void }) {
  const { itens, mudar } = useCarrinho(loja.id);
  const [fase, setFase] = useState<Fase>("carrinho");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [numero, setNumero] = useState<number | null>(null);
  const [dados, setDados] = useState({ nome: "", telefone: "", email: "", observacao: "" });

  const total = useMemo(() => totalDoCarrinho(itens), [itens]);
  const zap = linkWhatsApp(loja, itens);

  // Esc fecha. Numa folha que cobre a tela inteira, não ter Esc é obrigar o
  // teclado a caçar o X.
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", t);
    return () => document.removeEventListener("keydown", t);
  }, [aoFechar]);

  const trocarQtd = (produtoId: string, delta: number) =>
    mudar((a) => a
      .map((i) => (i.produtoId === produtoId ? { ...i, quantidade: i.quantidade + delta } : i))
      .filter((i) => i.quantidade > 0));

  async function fechar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      const r = await fetch(`/api/l/${loja.slug}/pedido`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Só o que o servidor precisa pra decidir. Preço e total NÃO vão —
          // quem calcula é ele, senão bastaria abrir o DevTools.
          itens: itens.map((i) => ({ produtoId: i.produtoId, quantidade: i.quantidade })),
          ...dados,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error ?? "Não deu para enviar o pedido."); return; }
      setNumero(j.numero ?? null);
      gravar(loja.id, []);      // pedido feito: o carrinho vai junto
      setFase("pronto");
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally { setEnviando(false); }
  }

  return (
    <div className="vt-veu" onClick={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="vt-folha" role="dialog" aria-modal="true" aria-label="Carrinho">
        <div className="vt-folha-topo">
          <strong>
            {fase === "pronto" ? "Pedido enviado" : fase === "dados" ? "Seus dados" : "Seu carrinho"}
          </strong>
          <button type="button" className="vt-x" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>

        <div className="vt-folha-corpo">
          {fase === "pronto" ? (
            <div className="vt-pronto">
              <p className="vt-pronto-num">{numero ? `Pedido #${numero}` : "Pedido registrado"}</p>
              <p>Recebemos seu pedido. A loja entra em contato para combinar pagamento e entrega.</p>
              {zap && (
                <a className="vt-btn vt-btn-zap" href={zap} target="_blank" rel="noreferrer noopener">
                  Falar no WhatsApp agora
                </a>
              )}
            </div>
          ) : itens.length === 0 ? (
            <p className="vt-vazio">Seu carrinho está vazio.</p>
          ) : fase === "carrinho" ? (
            <>
              <ul className="vt-lista">
                {itens.map((i) => (
                  <li key={i.produtoId}>
                    <span className="vt-lista-nome">{i.titulo}</span>
                    <span className="vt-qtd">
                      <button type="button" onClick={() => trocarQtd(i.produtoId, -1)} aria-label={`Menos um ${i.titulo}`}>−</button>
                      <b>{i.quantidade}</b>
                      <button type="button" onClick={() => trocarQtd(i.produtoId, +1)} aria-label={`Mais um ${i.titulo}`}>+</button>
                    </span>
                    <strong className="vt-lista-preco">{moeda(i.precoUnitario * i.quantidade)}</strong>
                  </li>
                ))}
              </ul>
              <p className="vt-obs">
                O valor final é confirmado pela loja — frete e prazo são combinados no contato.
              </p>
            </>
          ) : (
            <form className="vt-form" id="vt-form-pedido" onSubmit={fechar}>
              <label>
                Nome
                <input required minLength={2} maxLength={120} value={dados.nome}
                  autoComplete="name" autoCapitalize="words" enterKeyHint="next"
                  onChange={(e) => setDados({ ...dados, nome: e.target.value })} />
              </label>
              <label>
                Telefone / WhatsApp
                <input required minLength={8} maxLength={40} value={dados.telefone}
                  type="tel" inputMode="tel" autoComplete="tel" enterKeyHint="next"
                  onChange={(e) => setDados({ ...dados, telefone: e.target.value })} />
              </label>
              <label>
                E-mail <span>(opcional)</span>
                <input type="email" maxLength={160} value={dados.email}
                  inputMode="email" autoComplete="email" autoCapitalize="none" enterKeyHint="next"
                  onChange={(e) => setDados({ ...dados, email: e.target.value })} />
              </label>
              <label>
                Observação <span>(opcional)</span>
                <textarea rows={3} maxLength={2000} value={dados.observacao}
                  placeholder="Cor, tamanho, prazo…" enterKeyHint="done"
                  onChange={(e) => setDados({ ...dados, observacao: e.target.value })} />
              </label>
              {erro && <p className="vt-erro" role="alert">{erro}</p>}
            </form>
          )}
        </div>

        {fase !== "pronto" && itens.length > 0 && (
          <div className="vt-folha-pe">
            <div className="vt-total"><span>Total</span><strong>{moeda(total)}</strong></div>
            {fase === "carrinho" ? (
              <div className="vt-acoes">
                {ACEITA_CARRINHO(loja.checkout) && (
                  <button type="button" className="vt-btn vt-btn-primario" onClick={() => setFase("dados")}>
                    Fechar pedido
                  </button>
                )}
                {ACEITA_WHATSAPP(loja.checkout) && zap && (
                  <a className="vt-btn vt-btn-zap" href={zap} target="_blank" rel="noreferrer noopener">
                    Pedir pelo WhatsApp
                  </a>
                )}
              </div>
            ) : (
              <div className="vt-acoes">
                <button type="button" className="vt-btn" onClick={() => setFase("carrinho")}>Voltar</button>
                <button type="submit" form="vt-form-pedido" className="vt-btn vt-btn-primario" disabled={enviando}>
                  {enviando ? "Enviando…" : "Enviar pedido"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
