"use client";

// ── Marketing · Geral ────────────────────────────────────────────────────────
// Painel do setor de marketing: acompanhamento da produção de criativos e do
// resultado do orgânico. Duas abas — Painel (indicadores) e Criativos (controle
// com numeração automática).
//
// Estrutura pensada pra crescer: o criativo já nasce com plataforma/campanha/
// produto, então uma integração futura com a Meta/TikTok (ou anexo de arquivo)
// entra como coluna nova, sem refazer a tela.
import { useCallback, useEffect, useState } from "react";
import { Botao } from "../ui/controles";
import { PainelGeral } from "./PainelGeral";
import { CriativosLista } from "./CriativosLista";
import { CriativoModal, type Eu } from "./CriativoModal";
import { DesempenhoTrafego } from "./DesempenhoTrafego";
import { StoriesClient } from "./stories/StoriesClient";
import { LinkTridiLista } from "./linktridi/LinkTridiLista";
import { TutoriaisClient } from "./tutoriais/TutoriaisClient";
import { CabecalhoMarketing, SeletorPaginas, abasDoMarketing, paginasDoMarketing, type AbaMarketing, type PaginaMarketing } from "./CabecalhoMarketing";
import { PRODUTOS, type Criativo, type ProdutoCriativo } from "@/lib/marketing-criativos-const";
import type { ArquivoCriativo } from "@/lib/criativos/regras";
import type { Desempenho, PainelMarketing } from "./tipos";

export type Editor = { id: string; nome: string; departamento: string | null };

type Aba = AbaMarketing;

export function MarketingClient({ eu, podeCriar, podeDesempenho, podeContingencia, podeLinkTridiLista = false, podeLinkTridi = false, podeTutoriais = false }: {
  eu: Eu; podeCriar: boolean; podeDesempenho: boolean; podeContingencia: boolean;
  /** `tridiflow:projetos` — ver a lista de LinkTridi. */
  podeLinkTridiLista?: boolean;
  /** `tridiflow:linktridi` — criar e mexer num LinkTridi. */
  podeLinkTridi?: boolean;
  /** `tridiflow:tutoriais` — gerenciar a Central de Tutoriais. */
  podeTutoriais?: boolean;
}) {
  const [aba, setAba] = useState<Aba>("painel");
  // Período do PAINEL e do DESEMPENHO é o mesmo: trocar numa aba vale na outra,
  // senão a pessoa compara 30 dias de produção com 7 de faturamento sem notar.
  const [dias, setDias] = useState(30);
  const [desempenho, setDesempenho] = useState<Desempenho | null>(null);
  const [painel, setPainel] = useState<PainelMarketing | null>(null);
  const [criativos, setCriativos] = useState<Criativo[] | null>(null);
  // Capa da biblioteca de cada criativo — é a miniatura da lista.
  const [capas, setCapas] = useState<Record<string, ArquivoCriativo>>({});
  // Primeiro dia em que o anúncio com o nome do criativo rodou na Meta, por id.
  const [estreias, setEstreias] = useState<Record<string, string>>({});
  const [editores, setEditores] = useState<Editor[]>([]);
  const [produtos, setProdutos] = useState<ProdutoCriativo[]>(PRODUTOS);
  const [novo, setNovo] = useState(false);

  // `d` entra sempre por parâmetro (nunca pelo estado): assim as funções não
  // mudam de identidade a cada troca de período e o efeito de montagem não
  // dispara um segundo fetch por cima do que `trocarDias` já pediu.
  const carregarPainel = useCallback(async (d: number) => {
    const r = await fetch(`/api/marketing/painel?dias=${d}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setPainel(r.data as PainelMarketing);
    else setPainel((p) => p ?? vazioPainel(d));
  }, []);

  const carregarDesempenho = useCallback(async (d: number) => {
    if (!podeDesempenho) return;
    const r = await fetch(`/api/marketing/desempenho?dias=${d}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) setDesempenho(r.data as Desempenho);
  }, [podeDesempenho]);

  // Uma troca de período recarrega as duas fontes. Sem poll: nada aqui muda
  // sozinho (ver CLAUDE.md · dados).
  const trocarDias = (d: number) => {
    if (d === dias) return;
    setDias(d);
    setPainel(null);
    setDesempenho(null);
    void carregarPainel(d);
    void carregarDesempenho(d);
  };

  const carregarCriativos = useCallback(async (qs = "") => {
    const r = await fetch(`/api/marketing/criativos${qs}`).then((x) => x.json()).catch(() => null);
    if (r?.ok) {
      setCriativos(r.criativos as Criativo[]);
      setCapas((r.capas ?? {}) as Record<string, ArquivoCriativo>);
      setEstreias((r.estreias ?? {}) as Record<string, string>);
    } else setCriativos([]);
  }, []);

  useEffect(() => {
    void carregarPainel(30);
    void carregarCriativos();
    void carregarDesempenho(30);
    void fetch("/api/marketing/editores").then((x) => x.json()).then((r) => { if (r?.ok) setEditores(r.editores); }).catch(() => {});
    void fetch("/api/marketing/criativos/produtos").then((x) => x.json()).then((r) => { if (r?.ok) setProdutos(r.produtos); }).catch(() => {});
  }, [carregarPainel, carregarCriativos, carregarDesempenho]);

  // Criou um criativo → a lista e o painel mudaram de verdade. Sem poll: esta
  // tela não muda sozinha, quem muda é quem está nela (ver CLAUDE.md · dados).
  const aposCriar = (c: Criativo) => {
    setCriativos((cur) => [c, ...(cur ?? [])]);
    setNovo(false);
    void carregarPainel(dias);
  };

  const permissoes = { podeDesempenho, podeContingencia, podeLinkTridiLista, podeTutoriais };
  const abas = abasDoMarketing(permissoes);
  // Dentro de "Páginas": LinkTridi | Central de Tutoriais, cada um pela sua chave.
  const paginas = paginasDoMarketing(permissoes);
  type Pagina = PaginaMarketing;
  const [pagina, setPagina] = useState<Pagina>(podeLinkTridiLista ? "linktridi" : "tutoriais");

  // A aba aberta vai na URL (`/marketing?aba=stories`): recarregar ou mandar o
  // link pra alguém cai no mesmo lugar — quem registra dezenas de stories não
  // pode voltar pro Painel a cada F5. Lida do `location` e escrita com
  // `replaceState`, sem `useSearchParams`: não suspende a página nem empilha
  // uma entrada de histórico por troca (mesmo jeito da Contingência).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const pedida = q.get("aba");
    if (pedida && abas.some((a) => a.key === pedida)) setAba(pedida as Aba);
    const ver = q.get("ver");
    if (pedida === "paginas" && paginas.some((p) => p.valor === ver)) setPagina(ver as Pagina);
    // Só ao montar: depois quem manda na aba é o clique.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const irPara = (a: Aba) => {
    setAba(a);
    const u = new URL(window.location.href);
    if (a === "painel") u.searchParams.delete("aba");
    else u.searchParams.set("aba", a);
    if (a !== "paginas") u.searchParams.delete("ver");
    window.history.replaceState(null, "", u);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* A ação do cabeçalho pertence à ABA aberta: "Subir criativo" só onde
          existe criativo pra subir. */}
      <CabecalhoMarketing permissoes={permissoes} aba={aba} onAba={irPara} acoes={podeCriar && (aba === "painel" || aba === "criativos") && (
        <Botao variante="primario" icone="upload" onClick={() => setNovo(true)}>Subir criativo</Botao>
      )} />

      {aba === "painel"
        ? <PainelGeral painel={painel} dias={dias} onDias={trocarDias} onVerCriativos={() => irPara("criativos")} />
        : aba === "desempenho"
          ? <DesempenhoTrafego dados={desempenho} dias={dias} onDias={trocarDias} />
          : aba === "paginas"
              ? <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <SeletorPaginas permissoes={permissoes} valor={pagina} onMuda={(v) => {
                    setPagina(v);
                    const u = new URL(window.location.href);
                    u.searchParams.set("ver", v);
                    window.history.replaceState(null, "", u);
                  }} />
                  {pagina === "linktridi" && podeLinkTridiLista
                    ? <LinkTridiLista podeEditar={podeLinkTridi} />
                    : <TutoriaisClient embutido />}
                </div>
            : aba === "stories"
              // Monta só quando a aba abre: quem nunca abre Stories não paga
              // a busca do mês nem o código do quadro.
              ? <StoriesClient podeCriar={podeCriar} produtos={produtos} onProdutoCriado={(p) => setProdutos((l) => [...l, p])} />
              : <CriativosLista criativos={criativos} capas={capas} estreias={estreias} editores={editores} produtos={produtos} recarregar={carregarCriativos} podeCriar={podeCriar} onNovo={() => setNovo(true)} />}

      {novo && (
        <CriativoModal
          modo="novo"
          editores={editores}
          produtos={produtos}
          onProdutoCriado={(p) => setProdutos((l) => [...l, p])}
          eu={eu}
          onFechar={() => setNovo(false)}
          onSalvo={aposCriar}
        />
      )}
    </div>
  );
}

function vazioPainel(dias: number): PainelMarketing {
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    hoje,
    producao: { total: 0, hoje: 0, semana: 0, mes: 0, mediaDiaria: 0, dias, ultimo: null, serie: [] },
    equipe: [],
    resultados: { hoje: 0, semana: 0, mes: 0, hojeAnterior: 0, semanaAnterior: 0, mesAnterior: 0, pedidosMes: 0, serie: [], indisponivel: true },
  };
}
