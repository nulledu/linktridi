"use client";

import { useMemo, useState } from "react";
import { AvisoSchema, BotaoExportar, Cabecalho, Cartao, Filtro, Filtros, LimparFiltros, Selo, Tabela, TituloCartao, Vazio, BuscaDaLista } from "../ui";
import { dataCSV } from "@/lib/financeiro/csv";
import type { LinhaAuditoria } from "@/lib/financeiro/db";

/**
 * Rótulos das entidades e das ações. O banco guarda a chave crua ("pagar",
 * "compromisso") porque ela é para sempre; a tela traduz. Chave que não estiver
 * aqui aparece como ela mesma em vez de sumir — histórico não se esconde
 * porque alguém esqueceu de cadastrar o rótulo.
 */
const ENTIDADES: Record<string, string> = {
  compra: "Compra", compromisso: "Compromisso", conta: "Conta",
  recorrencia: "Recorrência", nota: "Nota fiscal", patrimonio: "Patrimônio",
  fornecedor: "Fornecedor", colaborador: "Colaborador", movimento: "Movimento",
};

const ACOES: Record<string, { label: string; cor: string }> = {
  criar: { label: "Criou", cor: "var(--azul)" },
  editar: { label: "Editou", cor: "var(--roxo)" },
  confirmar: { label: "Confirmou", cor: "var(--azul)" },
  pagar: { label: "Pagou", cor: "var(--ok)" },
  "pagar-repetido": { label: "Pagou (repetido)", cor: "var(--neutro)" },
  reverter: { label: "Estornou", cor: "var(--atencao)" },
  cancelar: { label: "Cancelou", cor: "var(--perigo)" },
  transferir: { label: "Transferiu", cor: "var(--azul)" },
  "ajustar-saldo": { label: "Ajustou saldo", cor: "var(--atencao)" },
  gerar: { label: "Gerou", cor: "var(--ok)" },
  inativar: { label: "Inativou", cor: "var(--neutro)" },
  desligar: { label: "Desligou", cor: "var(--neutro)" },
};

const rotuloAcao = (a: string) => ACOES[a] ?? { label: a, cor: "var(--neutro)" };

/** `{valor: 350, conta_id: "…"}` → `valor: 350 · conta: …`, legível numa linha. */
function resumirDados(dados: unknown): string {
  if (dados == null) return "";
  if (typeof dados !== "object") return String(dados);
  const partes: string[] = [];
  for (const [k, v] of Object.entries(dados as Record<string, unknown>)) {
    if (v == null || v === "") continue;
    const chave = k.replace(/_id$/, "").replace(/_/g, " ");
    const valor = typeof v === "object" ? JSON.stringify(v) : String(v);
    partes.push(`${chave}: ${valor.length > 40 ? valor.slice(0, 40) + "…" : valor}`);
    if (partes.length >= 4) break;
  }
  return partes.join(" · ");
}

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function AuditoriaClient({ empresaNome, linhas, podeVerFolha, schemaPendente }: {
  empresaNome: string;
  linhas: LinhaAuditoria[];
  podeVerFolha: boolean;
  schemaPendente: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [entidade, setEntidade] = useState("");
  const [acao, setAcao] = useState("");

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (entidade && l.entidade !== entidade) return false;
      if (acao && l.acao !== acao) return false;
      if (!t) return true;
      return [l.user_nome, ENTIDADES[l.entidade] ?? l.entidade, rotuloAcao(l.acao).label, resumirDados(l.dados)]
        .filter(Boolean).join(" ").toLowerCase().includes(t);
    });
  }, [linhas, busca, entidade, acao]);

  // As opções saem do que EXISTE no período, não de uma lista fixa: um filtro
  // que oferece "Patrimônio" e devolve zero linhas faz a pessoa achar que a
  // tela está quebrada.
  const opcoesEntidade = useMemo(() => {
    const vistos = [...new Set(linhas.map((l) => l.entidade))];
    return vistos.map((e) => ({ valor: e, label: ENTIDADES[e] ?? e }));
  }, [linhas]);

  const opcoesAcao = useMemo(() => {
    const vistos = [...new Set(linhas.map((l) => l.acao))];
    return vistos.map((a) => ({ valor: a, label: rotuloAcao(a).label }));
  }, [linhas]);

  return (
    <>
      <Cabecalho
        titulo="Auditoria"
        sub="Quem mexeu em quê, quando, e o que mudou."
        busca={busca}
        aoBuscar={setBusca}
        acoes={
          <BotaoExportar
            assunto="Auditoria" empresa={empresaNome} linhas={visiveis}
            colunas={[
              { cabecalho: "Quando", valor: (l) => quando(l.created_at) },
              { cabecalho: "Quem", valor: (l) => l.user_nome ?? "" },
              { cabecalho: "O quê", valor: (l) => ENTIDADES[l.entidade] ?? l.entidade },
              { cabecalho: "Ação", valor: (l) => rotuloAcao(l.acao).label },
              { cabecalho: "Detalhe", valor: (l) => resumirDados(l.dados) },
              { cabecalho: "Data", valor: (l) => dataCSV(l.created_at) },
            ]}
          />
        }
      />

      {schemaPendente && <AvisoSchema />}

      <Cartao>
        <TituloCartao icone="history">Últimos 90 dias</TituloCartao>

        <BuscaDaLista valor={busca} aoBuscar={setBusca} placeholder="Buscar por pessoa, entidade ou ação…" />

        <Filtros>
          <Filtro rotulo="O quê" valor={entidade} aoMudar={setEntidade} opcoes={opcoesEntidade} />
          <Filtro rotulo="Ação" valor={acao} aoMudar={setAcao} opcoes={opcoesAcao} />
          <LimparFiltros
            ativo={!!entidade || !!acao || !!busca}
            aoLimpar={() => { setEntidade(""); setAcao(""); setBusca(""); }}
          />
        </Filtros>

        <Tabela
          linhas={visiveis}
          chaveDe={(l) => l.id}
          vazio={
            <Vazio
              icone="history"
              titulo="Nada registrado ainda"
              detalhe="Confirmar compra, dar baixa, estornar e ajustar saldo aparecem aqui assim que acontecerem."
            />
          }
          colunas={[
            {
              chave: "quando", label: "Quando", largura: "124px",
              celula: (l) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{quando(l.created_at)}</span>,
            },
            {
              chave: "quem", label: "Quem", largura: "minmax(min(100%, 104px), 1fr)",
              celula: (l) => l.user_nome ?? "—",
            },
            {
              chave: "oque", label: "O quê", largura: "minmax(min(100%, 96px), 1fr)", titulo: true,
              celula: (l) => ENTIDADES[l.entidade] ?? l.entidade,
            },
            {
              chave: "acao", label: "Ação", largura: "116px",
              celula: (l) => <Selo selo={rotuloAcao(l.acao)} />,
            },
            {
              // `largo`, e não `soNoComputador`: no celular o detalhe ocupa a
              // linha inteira do card em vez de sumir. Uma auditoria sem o
              // detalhe responde "Douglas mexeu em alguma coisa" — que é
              // exatamente o que a tela existe para não fazer.
              chave: "detalhe", label: "Detalhe", largura: "minmax(min(100%, 140px), 1.6fr)", largo: true,
              celula: (l) => (
                <span style={{ color: "var(--text-dim)", fontSize: 12.5 }}>
                  {l.entidade === "colaborador" && !podeVerFolha
                    ? "— (exige permissão de folha)"
                    : resumirDados(l.dados) || "—"}
                </span>
              ),
            },
          ]}
        />
      </Cartao>

      <p style={{ marginTop: 16, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
        O registro é gravado junto com o fato e nunca é apagado — nem quando o compromisso é
        estornado ou a compra cancelada. É o que permite responder <em>quem mudou este valor</em> meses depois.
        {!podeVerFolha && " O detalhe das alterações de colaborador exige a permissão de folha."}
      </p>
    </>
  );
}
