"use client";

// Cabeçalho + filtros do workspace.
//
// O painel antigo errava exatamente aqui: os cartões do topo mostravam
// "Faturamento R$ 0,00" enquanto o gráfico logo abaixo estava cheio de vendas,
// porque cada bloco buscava seu próprio recorte de tempo. Aqui o período é UM
// só, aplicado a tudo, e a faixa de datas fica escrita na tela — se o número
// parecer errado, dá pra ver o intervalo que o gerou sem adivinhar.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { TrocaIcone } from "../ui/micro";
import { Dropdown } from "../ui/Dropdown";
import { BotaoIcone } from "../ui/controles";
import type { MarketProfile } from "../../../lib/tridimarket/types";
import { montarPeriodo, PERIODO_PADRAO, ehChavePeriodo, rotuloPeriodo, type ChavePeriodo, type Periodo } from "../../../lib/tridimarket/periodo";
import { SeletorPeriodo } from "./PeriodoModal";
import { INDIGO } from "./ui";

const CHAVE_PADRAO = "tridimarket:filtros";

export type Filtros = {
  periodo: ChavePeriodo;
  de: string;          // usado só quando periodo === "custom" (YYYY-MM-DD)
  ate: string;
  profileId: string;
};

// HOJE é o padrão: quem abre o painel quer saber o que está acontecendo agora.
// Um recorte de 30 dias como entrada esconde o movimento do dia no meio da
// média do mês.
const PADRAO_BASE: Filtros = { periodo: PERIODO_PADRAO, de: "", ate: "", profileId: "" };

// Lembrar o filtro entre visitas evita reconfigurar o painel toda vez. Fica no
// navegador porque é preferência de leitura, não dado do negócio.
// `opcoes` deixa uma tela ter memória e padrão PRÓPRIOS. A de Pessoas usa isso:
// ali o recorte é a FATURA, e herdar o "hoje" do painel faria a tela de
// cobrança mostrar só quem comprou hoje — parecendo que a dívida sumiu.
export function useFiltros(opcoes?: { chave?: string; padrao?: ChavePeriodo }): [Filtros, (f: Partial<Filtros>) => void] {
  const CHAVE = opcoes?.chave ?? CHAVE_PADRAO;
  const PADRAO: Filtros = { ...PADRAO_BASE, periodo: opcoes?.padrao ?? PADRAO_BASE.periodo };
  const [filtros, setFiltros] = useState<Filtros>(PADRAO);
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE) || "null");
      if (salvo && ehChavePeriodo(salvo.periodo)) {
        setFiltros({
          periodo: salvo.periodo, de: String(salvo.de || ""), ate: String(salvo.ate || ""),
          profileId: String(salvo.profileId || ""),
        });
      }
    } catch { /* preferência corrompida: segue no padrão */ }
  }, []);
  return [filtros, (parcial) => setFiltros((atual) => {
    const proximo = { ...atual, ...parcial };
    try { localStorage.setItem(CHAVE, JSON.stringify(proximo)); } catch { /* modo privado */ }
    return proximo;
  })];
}

/** Intervalo real das consultas, derivado dos filtros. */
export function intervaloDe(filtros: Filtros): Periodo {
  return montarPeriodo(filtros.periodo, new Date(), { de: filtros.de, ate: filtros.ate });
}

/**
 * Assinatura do que os dados na tela DEVERIAM refletir: intervalo + empresa.
 * Serve para detectar "dado velho": se a chave dos dados carregados difere
 * desta, a tela está mostrando o recorte ANTERIOR e deve exibir o esqueleto —
 * em vez de manter os números de ontem parados até a nova resposta chegar.
 */
export function chaveDosFiltros(filtros: Filtros): string {
  const j = intervaloDe(filtros);
  return `${j.de}|${j.ate}|${filtros.profileId}`;
}

/**
 * Controla o "dado velho" contra uma CHAVE arbitrária. Devolve `desatualizado`
 * (os dados na tela não são desta chave) e `marcarCarregado` (chame ao aceitar
 * dados novos, gravando de qual chave eles vieram).
 *
 * A chave tem que refletir SÓ o que a tela realmente consulta: telas por
 * período usam `chaveDosFiltros`; telas que ignoram o dia (Pessoas, Produtos,
 * Tablets) usam só a empresa — senão trocar de dia deixaria o esqueleto preso,
 * porque nenhuma nova busca aconteceria para marcá-lo como carregado.
 */
export function useCargaAtual(chave: string): { chave: string; desatualizado: boolean; marcarCarregado: () => void } {
  const [carregada, setCarregada] = useState<string | null>(null);
  // A chave vai por REF porque quem chama `marcarCarregado` costuma ser um
  // `useCallback` memoizado por outra lista de dependências: sem a ref, o
  // callback grava a chave do render em que foi criado e a tela registra
  // "carregado" para um recorte que não é o da vez — esqueleto eterno.
  const atual = useRef(chave);
  atual.current = chave;
  const marcarCarregado = useCallback(() => setCarregada(atual.current), []);
  // A chave sai daqui pra quem busca poder DEPENDER dela. Era a outra metade do
  // "carrega e volta a carregar pra sempre": se a chave mudava sem mudar os
  // parâmetros da consulta (ex.: o filtro de unidade fantasma sendo limpo), o
  // efeito não disparava de novo, ninguém marcava como carregado e o esqueleto
  // ficava preso — sem erro na tela e sem botão pra sair dali.
  return { chave, desatualizado: carregada !== chave, marcarCarregado };
}

/** Atalho para telas que consultam por período + empresa (Painel, Vendas). */
export function useDadosDoFiltro(filtros: Filtros) {
  return useCargaAtual(chaveDosFiltros(filtros));
}

export function Cabecalho({ titulo, descricao, filtros, setFiltros, perfis, periodo, carregando, onAtualizar, acoes }: {
  titulo: string;
  descricao: string;
  filtros: Filtros;
  setFiltros: (f: Partial<Filtros>) => void;
  perfis: MarketProfile[];
  periodo?: { inicio: string; fim: string } | null;
  carregando?: boolean;
  onAtualizar: () => void;
  acoes?: React.ReactNode;
}) {
  // O intervalo real fica SEMPRE escrito, em qualquer tela: é o que permite
  // conferir um número estranho sem adivinhar de onde ele veio.
  const janela = intervaloDe(filtros);
  const dia = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const faixa = filtros.periodo === "hoje" || filtros.periodo === "ontem"
    ? dia(janela.de)
    : `${dia(janela.de)} a ${dia(janela.ate)}`;
  return (
    <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.025em", color: "var(--text)", margin: 0 }}>{titulo}</h1>
        <p style={{ fontSize: 13, color: "var(--text-dim)", margin: "4px 0 0" }}>
          {descricao} · <strong style={{ color: "var(--text-dim)", fontWeight: 700 }}>{rotuloPeriodo(janela)} ({faixa})</strong>
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {acoes}
        <SeletorPeriodo filtros={filtros} setFiltros={setFiltros} />
        <SeletorEmpresa perfis={perfis} valor={filtros.profileId} onEscolher={(id) => setFiltros({ profileId: id })} />
        <BotaoAtualizar onAtualizar={onAtualizar} carregando={carregando} />
      </div>
    </header>
  );
}

// (SeletorPeriodo vive em ./PeriodoModal — modal com presets + calendário de faixa.)

// Escolha curta de empresa: o `<Dropdown>` do sistema com seção de seleção
// única. Portal, folha presa embaixo no celular, "tocou fora", Esc e setas
// moram lá; aqui fica só o botão com a cara de antes.
function SeletorEmpresa({ perfis, valor, onEscolher }: { perfis: MarketProfile[]; valor: string; onEscolher: (id: string) => void }) {
  const escolhida = perfis.find((p) => p.id === valor);
  const opcoes: Array<{ id: string; nome: string }> = [{ id: "", nome: "Todas as empresas" }, ...perfis.map((p) => ({ id: p.id, nome: p.name }))];
  // O Dropdown usa o `id` do item como chave; "" (todas) vira um id próprio.
  const TODAS = "__todas";

  return (
    <Dropdown titulo="Empresa" alinhar="fim" largura={230}
      secoes={[{
        selecao: "unica",
        selecionados: [valor || TODAS],
        onSelecao: ([id]) => onEscolher(id === TODAS ? "" : id),
        itens: opcoes.map((o) => ({ id: o.id || TODAS, rotulo: o.nome })),
      }]}
      gatilho={({ ref, ...p }) => (
        <button ref={ref} type="button" aria-label="Empresa" {...p}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: "var(--r-sm)", cursor: "pointer",
            border: `1px solid ${p["aria-expanded"] ? INDIGO : "var(--border)"}`, background: "var(--surface)",
            color: "var(--text)", fontSize: 12.5, fontWeight: 600, maxWidth: 230,
          }}>
          <Icon name="building-warehouse" size={15} color="var(--text-dim)" />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{escolhida?.name ?? "Todas as empresas"}</span>
          <TrocaIcone ligado={p["aria-expanded"]} a="chevron-down" b="chevron-up" size={14} corA="var(--text-dim)" corB="var(--text-dim)" />
        </button>
      )} />
  );
}

function BotaoAtualizar({ onAtualizar, carregando }: { onAtualizar: () => void; carregando?: boolean }) {
  return (
    <BotaoIcone icone="refresh" titulo="Atualizar" variante="secundario" onClick={onAtualizar} disabled={carregando} />
  );
}
