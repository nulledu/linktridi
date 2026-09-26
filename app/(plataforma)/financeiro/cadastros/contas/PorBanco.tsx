"use client";

// ── Bancos, cartões e o que há pra pagar em cada um ──────────────────────────
// Um CARTÃO por conta, com saldo, o que vence no período e as duas ações que
// alguém realmente faz olhando pra ela. Em "Visão geral" os cartões saem
// repartidos por EMPRESA: o Itaú da Tridi e o da Gedux são duas contas, com
// dois saldos e duas faturas — aparecem separados porque são separados.
//
// Tudo aqui é desenho sobre dados que a tela já tem; nenhuma consulta nova
// sai daqui.

import { Icon } from "../../../Icon";
import { BotaoIcone } from "../../../ui/controles";
import { BotaoFin, Marca, Selo, Vazio } from "../../ui";
import { Etiqueta, GradeDeEmpresas } from "../../blocos";
import { dataBR, moeda } from "@/lib/financeiro/calculos";
import { agruparPorEmpresa } from "@/lib/financeiro/periodo";
import { SaldoNoGateway, ehPagarme } from "./SaldoNoGateway";
import { ICONE_CONTA_TIPO, LABEL_CONTA_TIPO, type Conta } from "@/lib/financeiro/tipos";

/** Uma conta a pagar (lançada ou prevista) já reduzida ao que o cartão mostra. */
export interface ItemAPagar {
  id: string;
  conta_id: string | null;
  descricao: string;
  vencimento: string;
  valor: number;
  /** Já venceu e está em aberto. */
  atrasado: boolean;
  /** Ainda não é compromisso — é a próxima volta de uma recorrência. */
  previsto: boolean;
}

const MAX_LINHAS = 4;

const SELO_ATIVA = { label: "Ativa", cor: "var(--ok)" };
const SELO_INATIVA = { label: "Inativa", cor: "var(--neutro)" };

export function PorBanco({
  contas, itens, atrasadosFora, hoje, rotuloDoPeriodo, empresas, geral, logos, podeEscrever,
  aoAbrir, aoNovaConta, aoNovoCartao, aoPagarFatura, aoAjustar,
}: {
  /** Todas as contas da tela (ativas e inativas; as inativas ficam de fora daqui). */
  contas: Conta[];
  /** O que há pra pagar NO PERÍODO, lançado ou previsto. */
  itens: ItemAPagar[];
  /** O que está atrasado e cai FORA do período — a tela avisa, não esconde. */
  atrasadosFora: ItemAPagar[];
  hoje: string;
  rotuloDoPeriodo: string;
  empresas: { id: string; nome: string }[];
  /** "Visão geral" ligada: um bloco por empresa. */
  geral: boolean;
  logos: Record<string, string>;
  podeEscrever: boolean;
  aoAbrir: (c: Conta) => void;
  aoNovaConta: () => void;
  aoNovoCartao: (banco: Conta) => void;
  aoPagarFatura: (cartao: Conta) => void;
  aoAjustar: (c: Conta) => void;
}) {
  const ativas = contas.filter((c) => c.ativa);

  if (!ativas.length) {
    return (
      <Vazio
        icone="wallet"
        titulo="Nenhuma conta ativa"
        detalhe="Cadastre bancos, gateways e cartões para ver aqui o saldo e o que há pra pagar em cada um."
        acao={podeEscrever ? <BotaoFin icone="plus" primario onClick={aoNovaConta}>Nova conta</BotaoFin> : undefined}
      />
    );
  }

  const marcaDe = (c: Conta) => ({
    nome: c.nome, logo: logos[c.id] ?? null, icone: c.icone ?? ICONE_CONTA_TIPO[c.tipo], cor: c.cor,
  });

  const CartaoDaConta = ({ c }: { c: Conta }) => {
    const meus = itens.filter((i) => i.conta_id === c.id);
    const total = meus.reduce((s, i) => s + i.valor, 0);
    const fora = atrasadosFora.filter((i) => i.conta_id === c.id);
    const banco = c.tipo === "cartao" && c.conta_mae_id
      ? ativas.find((x) => x.id === c.conta_mae_id) ?? null
      : null;
    const fracao = c.tipo === "cartao" && c.usado != null && c.limite ? Math.min(1, c.usado / c.limite) : null;
    const corDaRegua = fracao == null ? "var(--ok)" : fracao >= 0.9 ? "var(--perigo)" : fracao >= 0.7 ? "var(--atencao)" : "var(--ok)";

    return (
      <section
        style={{
          display: "grid", gridTemplateRows: "auto auto 1fr auto", gap: 12, minWidth: 0,
          padding: 16, borderRadius: "var(--r-md)", background: "var(--surface)", border: "1px solid var(--border)",
        }}
      >
        {/* Cabeçalho: quem é a conta, e o atalho pra ficha dela. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Marca marca={marcaDe(c)} tamanho={38} raio={11} />
          <span style={{ display: "grid", gap: 1, flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 14.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.nome}
            </strong>
            <small style={{ fontSize: 11.5, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {LABEL_CONTA_TIPO[c.tipo]}
              {c.instituicao ? ` · ${c.instituicao}` : banco ? ` · ${banco.nome}` : ""}
              {c.final ? ` · final ${c.final}` : ""}
            </small>
          </span>
          <Selo selo={c.ativa ? SELO_ATIVA : SELO_INATIVA} />
          <BotaoIcone icone="dots-vertical" titulo={`Abrir a ficha de ${c.nome}`} onClick={() => aoAbrir(c)} style={{ margin: -6, flex: "none" }} />
        </div>

        {/* O saldo, e — no cartão — a fatura, que é o número que importa nele. */}
        <div style={{ display: "grid", gap: 5, minWidth: 0 }}>
          <small style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
            {c.tipo === "cartao" ? "Fatura aberta" : "Saldo atual"}
          </small>
          <strong
            className="stat"
            style={{
              fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums",
              color: c.tipo === "cartao" ? "var(--text)" : c.saldo < 0 ? "var(--perigo)" : "var(--text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {moeda(c.tipo === "cartao" ? (c.usado ?? 0) : c.saldo)}
          </strong>
          {c.tipo === "cartao" && (
            <>
              <small style={{ fontSize: 11, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                {c.limite != null
                  ? `de ${moeda(c.limite)}${c.disponivel != null ? ` · ${moeda(c.disponivel)} livre` : ""}`
                  : "sem limite cadastrado"}
              </small>
              {fracao != null && (
                <span aria-hidden style={{ display: "block", height: 4, borderRadius: 999, background: "color-mix(in srgb, var(--text) 10%, transparent)", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: `${Math.round(fracao * 100)}%`, borderRadius: 999, background: corDaRegua }} />
                </span>
              )}
            </>
          )}
          {c.tipo !== "cartao" && ehPagarme(c) && <SaldoNoGateway contaId={c.id} saldoDoLivro={c.saldo} />}
        </div>

        {/* O que sai desta conta no período. É a pergunta que faz alguém abrir
            a tela: "quanto ainda vai sair do Itaú este mês?" */}
        <div style={{ display: "grid", gap: 6, alignContent: "start", minWidth: 0 }}>
          <small style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)" }}>
            {meus.length
              ? `${meus.length} ${meus.length === 1 ? "conta" : "contas"} · ${rotuloDoPeriodo.toLocaleLowerCase("pt-BR")}`
              : `Nada a pagar em ${rotuloDoPeriodo.toLocaleLowerCase("pt-BR")}`}
          </small>
          <ol style={{ display: "grid", gap: 2, listStyle: "none", margin: 0, padding: 0 }}>
            {meus.slice(0, MAX_LINHAS).map((i) => (
              <li key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, fontSize: 12.5, minHeight: 24 }}>
                <span style={{ flex: "none", width: 42, fontVariantNumeric: "tabular-nums", color: i.atrasado ? "var(--perigo)" : "var(--text-dim)", fontWeight: 700 }}>
                  {dataBR(i.vencimento, { curta: true })}
                  {/* Vermelho sozinho não diz "atrasado" pra quem não enxerga cor. */}
                  {i.atrasado && <span className="so-leitor">, atrasado</span>}
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: i.previsto ? "var(--text-dim)" : "var(--text)" }}>
                  {i.descricao}
                </span>
                <strong style={{ flex: "none", fontVariantNumeric: "tabular-nums", color: "var(--perigo)" }}>
                  -{moeda(i.valor)}
                </strong>
              </li>
            ))}
          </ol>
          {meus.length > MAX_LINHAS && (
            <a
              href={`/financeiro/compromissos?conta=${encodeURIComponent(c.id)}`}
              style={{ fontSize: 12, fontWeight: 700, color: "var(--primary-texto)", textDecoration: "none" }}
            >
              + {meus.length - MAX_LINHAS} {meus.length - MAX_LINHAS === 1 ? "conta" : "contas"} · total {moeda(total)}
            </a>
          )}
          {meus.length > 0 && meus.length <= MAX_LINHAS && (
            <small style={{ fontSize: 12, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>Total {moeda(total)}</small>
          )}
          {fora.length > 0 && (
            <small style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--perigo)", fontWeight: 700 }}>
              <Icon name="alert-triangle" size={14} />
              {fora.length} {fora.length === 1 ? "atrasada" : "atrasadas"} de outros meses · {moeda(fora.reduce((s, i) => s + i.valor, 0))}
            </small>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <BotaoFin icone="list" href={`/financeiro/compromissos?conta=${encodeURIComponent(c.id)}`}>Ver extrato</BotaoFin>
          {podeEscrever && (c.tipo === "cartao"
            ? (c.usado ?? 0) > 0 && <BotaoFin icone="cash" primario onClick={() => aoPagarFatura(c)}>Pagar fatura</BotaoFin>
            // "Novo lançamento" é o ajuste de saldo com a conta já escolhida:
            // é a única escrita que nasce DESTA tela e move dinheiro nela.
            : <BotaoFin icone="plus" primario onClick={() => aoAjustar(c)}>Novo lançamento</BotaoFin>)}
          {podeEscrever && c.tipo !== "cartao" && (
            <BotaoFin icone="credit-card" onClick={() => aoNovoCartao(c)}>Novo cartão</BotaoFin>
          )}
        </div>
      </section>
    );
  };

  const Adicionar = () => (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12, width: "100%", minWidth: 0, flexWrap: "wrap",
        padding: 16, borderRadius: "var(--r-md)", border: "1px dashed var(--border)",
        background: "color-mix(in srgb, var(--primary) 5%, transparent)", minHeight: 84,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 42, height: 42, flex: "none", display: "grid", placeItems: "center", borderRadius: 13,
          background: "color-mix(in srgb, var(--primary) 14%, transparent)",
        }}
      >
        <Icon name="plus" size={21} color="var(--primary-texto)" />
      </span>
      <span style={{ display: "grid", gap: 2, flex: 1, minWidth: 0 }}>
        <strong style={{ fontSize: 14 }}>Adicionar nova conta ou gateway</strong>
        <small style={{ fontSize: 12, color: "var(--text-dim)" }}>
          Conecte mais bancos e meios de pagamento para ver o caixa inteiro numa tela só.
        </small>
      </span>
      <BotaoFin icone="plus" primario onClick={aoNovaConta}>Nova conta</BotaoFin>
    </div>
  );

  const blocos = geral
    ? agruparPorEmpresa(ativas, empresas)
    : [{ empresa: { id: "", nome: "" }, itens: ativas }];

  return (
    <div style={{ display: "grid", gap: 18, minWidth: 0 }}>
      {blocos.map((b) => (
        <div key={b.empresa.id || "unica"} style={{ display: "grid", gap: 10, minWidth: 0 }}>
          {geral && (
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <Marca marca={{ nome: b.empresa.nome, icone: "building-warehouse" }} tamanho={26} raio={7} />
              <strong style={{ fontSize: 14 }}>{b.empresa.nome}</strong>
              <Etiqueta
                texto={`${b.itens.length} ${b.itens.length === 1 ? "conta" : "contas"}`}
                cor="var(--primary)"
              />
              <small style={{ color: "var(--text-dim)", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                {moeda(b.itens.filter((c) => c.inclui_no_saldo).reduce((t, c) => t + c.saldo, 0))} em caixa
              </small>
            </div>
          )}
          <GradeDeEmpresas largura={300}>
            {b.itens.map((c) => <CartaoDaConta key={c.id} c={c} />)}
          </GradeDeEmpresas>
        </div>
      ))}
      {podeEscrever && <Adicionar />}
    </div>
  );
}
