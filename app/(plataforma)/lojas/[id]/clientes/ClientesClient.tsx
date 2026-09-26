"use client";

// ── Clientes ─────────────────────────────────────────────────────────────────
// A lista sai dos pedidos, então ela responde as perguntas que os pedidos
// respondem: quem já comprou, quantas vezes, quanto gastou e há quanto tempo
// sumiu. Nada de "segmento" configurável — segmento que ninguém preenche vira
// uma aba vazia, e os quatro daqui se deduzem sozinhos.

import { useMemo, useState } from "react";
import { Icon } from "../../../Icon";
import { DataList, type Coluna } from "../../../ui/DataList";
import { Bloco, Cabecalho, Numeros, Vazio } from "../../ui";
import { moeda } from "@/lib/lojas";
import {
  DIAS_PARA_SUMIR, ROTULO_SEGMENTO, classificar, filtrarPorSegmento,
  type Cliente, type Segmento,
} from "@/lib/lojas-clientes";
import "./clientes.css";

const SEGMENTOS: Segmento[] = ["todos", "novos", "recorrentes", "inativos"];

const dataCurta = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

const iniciais = (nome: string) =>
  nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";

export function ClientesClient({ clientes, resumo, hoje, truncado }: {
  clientes: Cliente[];
  resumo: ReturnType<typeof import("@/lib/lojas-clientes").resumoDeClientes>;
  hoje: string;
  /** A listagem de pedidos tem teto; acima dele a conta fica incompleta. */
  truncado: boolean;
}) {
  const [segmento, setSegmento] = useState<Segmento>("todos");
  const [busca, setBusca] = useState("");

  const visiveis = useMemo(() => {
    const porSegmento = filtrarPorSegmento(clientes, segmento, hoje);
    const termo = busca.trim().toLowerCase();
    if (!termo) return porSegmento;
    return porSegmento.filter((c) =>
      `${c.nome} ${c.email} ${c.telefone}`.toLowerCase().includes(termo));
  }, [clientes, segmento, busca, hoje]);

  const contar = (s: Segmento) => filtrarPorSegmento(clientes, s, hoje).length;

  // Uma definição: tabela no computador, cartão no celular. A pessoa (com o
  // contato e o selo de "sumido") é o título do cartão e o gasto o número em
  // evidência. Data ordena pelo ISO, não pelo texto "12 de mar.".
  const colunas: Coluna<Cliente>[] = [
    {
      chave: "cliente", titulo: "Cliente", papel: "titulo",
      ordenar: (c) => c.nome || null,
      render: (c) => (
        <span className="cl-pessoa">
          <span className="cl-avatar" aria-hidden="true">{iniciais(c.nome)}</span>
          <span className="cl-pessoa-txt">
            <strong>{c.nome || "Sem nome"}</strong>
            <small>{c.email || c.telefone || "sem contato"}</small>
          </span>
          {classificar(c, hoje).includes("inativos") && (
            <span className="cl-selo" title={`Sem comprar há ${DIAS_PARA_SUMIR} dias ou mais`}>sumido</span>
          )}
        </span>
      ),
    },
    { chave: "pedidos", titulo: "Pedidos", alinhar: "right", ordenar: (c) => c.pedidos, render: (c) => c.pedidos },
    {
      chave: "gasto", titulo: "Gasto total", papel: "destaque", alinhar: "right", ordenar: (c) => c.gasto,
      render: (c) => <strong style={{ fontWeight: 750 }}>{moeda(c.gasto)}</strong>,
    },
    {
      chave: "ultimo", titulo: "Último pedido", alinhar: "right", ordenar: (c) => c.ultimoEm,
      render: (c) => <span style={{ whiteSpace: "nowrap" }}>{dataCurta(c.ultimoEm)}</span>,
    },
  ];

  return (
    <div className="lj-tela">
      <Cabecalho
        titulo="Clientes"
        sub={`${clientes.length} ${clientes.length === 1 ? "pessoa já comprou" : "pessoas já compraram"} — a lista se monta sozinha a partir dos pedidos`}
      />

      {truncado && (
        <p className="ap-aviso">
          <Icon name="alert-triangle" size={16} />
          A conta usa os últimos 200 pedidos. Acima disso os totais por pessoa ficam incompletos — é o
          teto da listagem, e ele existe pra a tela não puxar a tabela inteira.
        </p>
      )}

      <Numeros
        itens={[
          { rotulo: "Clientes", valor: resumo.total },
          { rotulo: "Voltaram a comprar", valor: resumo.recorrentes },
          { rotulo: "Gasto médio", valor: moeda(resumo.gastoMedio), nota: "por pessoa, não por pedido" },
          { rotulo: "Pedidos por pessoa", valor: resumo.pedidosPorCliente.toFixed(1).replace(".", ",") },
        ]}
      />

      {/* `.tab-strip` rola de lado quando não cabe — a 320px quatro abas não
          entram na largura. */}
      <div className="tab-strip cl-abas">
        {SEGMENTOS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSegmento(s)}
            aria-pressed={segmento === s}
            className="ui-btn"
            data-t="sm"
            data-v={segmento === s ? "primario" : "sutil"}
          >
            {ROTULO_SEGMENTO[s]} <span className="cl-conta">{contar(s)}</span>
          </button>
        ))}
      </div>

      <label className="cl-busca">
        <Icon name="search" size={15} color="var(--text-dim)" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          type="search"
          placeholder="Buscar por nome, e-mail ou telefone"
          aria-label="Buscar cliente"
        />
      </label>

      {visiveis.length === 0 ? (
        <Bloco>
          <Vazio
            icone="users"
            titulo={clientes.length === 0 ? "Ninguém comprou ainda" : "Nenhum cliente neste filtro"}
            texto={clientes.length === 0 ? "A lista se monta sozinha assim que o primeiro pedido entrar." : undefined}
          />
        </Bloco>
      ) : (
        <DataList
          itens={visiveis}
          colunas={colunas}
          chaveDe={(c) => c.chave}
          rotulo="Clientes da loja"
          minWidth={560}
        />
      )}
    </div>
  );
}
