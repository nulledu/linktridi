"use client";

// "Cadê o pedido?" — a pergunta que aparece quando um pedido some ou dois se
// misturam na separação.
//
// As caixas são reaproveitadas: quando o pedido é despachado o número é
// liberado, então "o que está nela agora" e "por onde ela andou" são duas
// perguntas diferentes — e com custos MUITO diferentes no ERP. A primeira é
// consulta indexada e volta na hora; a segunda varre o log de texto e chega a
// estourar o tempo limite. Antes as duas vinham juntas, então a resposta útil
// ficava presa atrás da lenta. Agora a tela mostra a primeira imediatamente e
// busca a segunda em seguida.

import { useState } from "react";
import { Icon } from "../Icon";
import { Botao } from "../ui/controles";
import { PedidoCard } from "./PedidoCard";
import { Selo } from "../ui/primitives";
import { CartaoPainel, VazioPainel } from "../ui/CartaoPainel";

interface Estadia {
  pedido: number; pedidoIdProprio: string | null;
  de: string | null; ate: string | null; dias: number | null;
  colocou: string | null; tirou: string | null;
}
interface Historico { numero: string; estadias: Estadia[]; ocupadaAgora: Estadia | null; registros: number }
interface Agora {
  numero: string;
  pedidos: Array<{ id: number; idProprio: string | null; nome: string | null; etapa: number | null; dataAprovado: string | null }>;
}

type Contexto = { caixa: string; de: string | null; ate: string | null; colocou: string | null; tirou: string | null };

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

// Quantas passagens mostrar antes do "ver todas". O histórico de uma caixa
// muito usada passa de 40 linhas; despejar tudo de uma vez era o que fazia a
// resposta parecer um dump em vez de uma resposta.
const PASSAGENS_VISIVEIS = 5;

export function CaixaBusca() {
  const [numero, setNumero] = useState("");
  const [agora, setAgora] = useState<Agora | null>(null);
  const [hist, setHist] = useState<Historico | null>(null);
  const [buscandoAgora, setBuscandoAgora] = useState(false);
  const [buscandoHist, setBuscandoHist] = useState(false);
  const [erroHist, setErroHist] = useState<string | null>(null);
  const [tudo, setTudo] = useState(false);
  // Pedido aberto no card, com a passagem que originou o clique.
  const [aberto, setAberto] = useState<{ pedido: number; contexto: Contexto } | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const n = numero.replace(/\D/g, "");
    if (!n) return;
    setAgora(null); setHist(null); setErroHist(null); setTudo(false);

    // Fase 1 — responde na hora e resolve a urgência na maioria das vezes.
    setBuscandoAgora(true);
    try {
      const r = await fetch(`/api/logistica/caixa?numero=${n}&fase=agora`, { cache: "no-store" });
      if (r.ok) setAgora(await r.json());
    } catch { /* a fase 2 ainda pode responder */ } finally { setBuscandoAgora(false); }

    // Fase 2 — a leitura cara, sem travar a tela.
    setBuscandoHist(true);
    try {
      const r = await fetch(`/api/logistica/caixa?numero=${n}&fase=historico`, { cache: "no-store" });
      if (!r.ok) throw new Error("falha");
      setHist(await r.json());
    } catch {
      // O log do ERP não tem índice de texto: a consulta varre a tabela e
      // esbarra no limite de tempo dele quando o sistema está carregado. Dizer
      // isso é melhor que "erro desconhecido" — o problema não é o número
      // digitado, e o "quem está com ela agora" acima continua valendo.
      setErroHist("O histórico completo não respondeu a tempo (o log do ERP não é indexado por texto). Tente de novo em alguns minutos.");
    } finally { setBuscandoHist(false); }
  }

  const estadias = hist?.estadias ?? [];
  const visiveis = tudo ? estadias : estadias.slice(0, PASSAGENS_VISIVEIS);

  const etapaNome = (e: number | null) => (e === 10 ? "Entrada" : e === 11 ? "Logística" : e != null ? `Etapa ${e}` : null);
  const buscou = agora || hist || buscandoHist || erroHist;

  return (
    <CartaoPainel icone="box" titulo="Histórico da caixa" sub="Quem está nela agora e por onde ela andou">
      <form onSubmit={buscar} className="cx-form" role="search">
        <label className="cx-campo">
          <Icon name="search" size={16} color="var(--text-dim)" />
          <input id="caixa-numero" className="ui-input" value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
            inputMode="numeric" placeholder="Nº da caixa" aria-label="Número da caixa separadora" />
        </label>
        <Botao type="submit" variante="primario" disabled={!numero} carregando={buscandoAgora}>Buscar</Botao>
      </form>

      {!buscou && <VazioPainel texto="Digite o número da caixa separadora pra ver o pedido que está nela e as passagens do último ano." />}

      {/* Fase 1 — o que importa primeiro */}
      {agora && (
        <div className="cx-bloco">
          <div className="cx-rotulo">Agora na caixa #{agora.numero}</div>
          {agora.pedidos.length === 0 ? (
            <p className="og-limpo"><Icon name="circle-check" size={16} color="var(--ok)" /> Livre — nenhum pedido nela.</p>
          ) : (
            <ul className="og-lista">
              {agora.pedidos.map((p) => (
                <li key={p.id}>
                  <button type="button" className="og-proxima lg-alerta"
                    onClick={() => setAberto({ pedido: p.id, contexto: { caixa: agora.numero, de: null, ate: null, colocou: null, tirou: null } })}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="og-linha-tit">#{p.idProprio ?? p.id}{p.nome ? ` · ${p.nome}` : ""}</span>
                      {p.dataAprovado && <span className="og-linha-sub">Aprovado em {dataCurta(p.dataAprovado)}</span>}
                    </span>
                    {etapaNome(p.etapa) && <Selo tom="destaque">{etapaNome(p.etapa)}</Selo>}
                    <Icon name="chevron-right" size={16} color="var(--text-dim)" style={{ flex: "none" }} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {buscandoHist && <p className="og-limpo">Buscando as passagens anteriores…</p>}

      {erroHist && (
        <div role="alert" className="cx-erro">
          <Icon name="alert-triangle" size={16} color="var(--perigo)" style={{ flex: "none" }} /><span>{erroHist}</span>
        </div>
      )}

      {hist && (
        <div className="cx-bloco">
          <div className="cx-rotulo">
            {estadias.length === 0 ? "Nenhuma passagem no último ano" : `${estadias.length} passage${estadias.length === 1 ? "m" : "ns"} no último ano`}
          </div>
          {/* Linha do tempo: a pergunta que vem depois de "por onde a caixa
              andou" é sempre "e esse pedido, o que era?" — cada passagem abre. */}
          {estadias.length > 0 && (
            <ol className="cx-tempo">
              {visiveis.map((e, i) => (
                <li key={`${e.pedido}-${e.de ?? i}`} data-atual={!e.ate ? "1" : undefined}>
                  <button type="button" className="cx-passagem lg-alerta"
                    onClick={() => setAberto({ pedido: e.pedido, contexto: { caixa: hist.numero, de: e.de, ate: e.ate, colocou: e.colocou, tirou: e.tirou } })}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="og-linha-tit">Pedido #{e.pedidoIdProprio ?? e.pedido}</span>
                      <span className="og-linha-sub">
                        {dataCurta(e.de)} → {e.ate ? dataCurta(e.ate) : "agora"}{e.dias != null ? ` · ${e.dias} d` : ""}{e.colocou ? ` · ${e.colocou}` : ""}
                      </span>
                    </span>
                    {!e.ate && <Selo tom="ok">Na caixa</Selo>}
                    <Icon name="chevron-right" size={16} color="var(--text-dim)" style={{ flex: "none" }} />
                  </button>
                </li>
              ))}
            </ol>
          )}
          {estadias.length > PASSAGENS_VISIVEIS && (
            <Botao variante="sutil" tamanho="sm" onClick={() => setTudo((v) => !v)} style={{ justifySelf: "start" }}>
              {tudo ? "Mostrar menos" : `Ver todas as ${estadias.length}`}
            </Botao>
          )}
        </div>
      )}

      {aberto && (
        <PedidoCard pedido={aberto.pedido} contexto={aberto.contexto} onClose={() => setAberto(null)} />
      )}
    </CartaoPainel>
  );
}
