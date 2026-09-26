"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon } from "../Icon";
import { PeriodPicker, DEFAULT_PERIOD, type PeriodState } from "../PeriodPicker";
import { useSticky } from "../useSticky";
import { VendasClient, abasDeVendas } from "../vendas/VendasClient";
import { CATALOGO_TRAFEGO, CATEGORIA_TRAFEGO, TrafegoPago, gradeInicialTrafego } from "./TrafegoPanel";
import { PageHead } from "../ui/mobile";
import { Abas } from "../ui/Abas";
import { Botao } from "../ui/controles";
import { CATALOGO_OPERACAO, CATEGORIA, PainelOperacao, gradeInicialOperacao } from "./PainelOperacao";
import { CATALOGO_VENDAS, CATEGORIA_VENDAS, PainelVendas, gradeInicialVendas } from "./PainelVendas";
import { CATALOGO_PRODUTOS, CATEGORIA_PRODUTOS, PainelProdutos, gradeInicialProdutos } from "./PainelProdutos";
import { AdicionarAnalise, itemDe, useVisoes, type DefWidget, type ItemNaGrade, type VisaoSalva } from "./widgets";
import "./central.css";

/** "22/09/2026 às 10:42" — e "—" enquanto o dado da aba não chegou. */
function horaDe(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// Analytics = só análise, em QUATRO portas.
//
// Eram cinco no topo mais seis por dentro de "Setores", e duas confusões
// concretas nasciam daí:
//
//  1. "Visão geral" existia nos DOIS níveis significando coisas diferentes —
//     em cima era produção, embaixo era venda por canal. O mesmo rótulo pra
//     dois assuntos, na mesma tela.
//  2. "Faturamento" (topo) e "Setores › Visão geral" mostravam o MESMO
//     dinheiro do mesmo snapshot, em telas separadas.
//
// Agora: Operação (o que a fábrica está fazendo), Vendas (de onde veio o
// dinheiro, em vários recortes), Produtos e Tráfego pago. Venda tem MESMO
// vários cortes — vendedora, canal, marketplace —, e é só ali que o segundo
// nível existe, em vez de ser a estrutura da tela inteira.
//
// O FINANCEIRO saiu daqui (ago/2026). Custo, imposto e comissão são o assunto
// de um módulo inteiro (`/financeiro`), com o próprio acesso restrito — nem o
// dono entra por padrão. Repetir um pedaço dele numa aba do Analytics dava
// duas portas para o mesmo número com regras de acesso diferentes, que é
// exatamente o tipo de duplicação que esta tela veio desfazer.
type Aba = "operacao" | "vendas" | "produtos" | "trafego";

// O h1 é sempre "Analytics" — quem diz onde a pessoa está é a aba acesa, e o
// subtítulo conta o que ela vai encontrar ali.
const SUB: Record<Aba, string> = {
  operacao: "O que a operação está fazendo agora — ao vivo do ERP.",
  vendas: "De onde veio o dinheiro no período, por canal, pessoa e marketplace.",
  produtos: "Itens vendidos no período (ERP).",
  trafego: "O que o anúncio gastou e trouxe no período — panorama do Meta Ads.",
};

export function AnalyticsClient({ canVendas = false, canEmpresa = false, canTrafego = false, views = [] }: { canVendas?: boolean; canEmpresa?: boolean; canTrafego?: boolean; views?: string[] }) {
  const [abaSalva, setAbaSalva] = useSticky<Aba>("analytics.aba", "operacao");
  const [subSalva, setSubSalva] = useSticky<string>("analytics.sub", "faturamento");

  const tabs: [Aba, string, string][] = [["operacao", "Operação", "chart-line"]];
  if (canVendas) tabs.push(["vendas", "Vendas", "cash"]);
  tabs.push(["produtos", "Produtos", "box"]);
  if (canTrafego) tabs.push(["trafego", "Tráfego pago", "target"]);

  // O segundo nível mora SÓ aqui dentro. "Faturamento" abre a lista porque é a
  // pergunta mais ampla — o total da empresa e de onde ele veio; os outros são
  // recortes dele. Ele exige as quatro chaves de setor (mesma regra de antes):
  // quem só enxerga um setor não pode ler o faturamento inteiro por uma porta
  // lateral.
  //
  // "Faturamento" e "Canais" respondem a mesma pergunta em recortes diferentes:
  // o primeiro é a empresa inteira (exige as quatro chaves de setor), o segundo
  // é o corte de quem só enxerga o comercial. Quem tem acesso amplo vê SÓ o
  // Faturamento — ele é superconjunto do outro, e as duas juntas eram a
  // duplicação que sobrou da reorganização. Quem tem só `set:comercial`
  // continua vendo Canais, que é a versão que a permissão dele permite.
  const subs: { key: string; nome: string; icon: string }[] = [
    ...(canEmpresa ? [{ key: "faturamento", nome: "Faturamento", icon: "chart-line" }] : []),
    ...abasDeVendas(views)
      .filter((t) => !(canEmpresa && t.key === "geral"))
      .map((t) => ({ key: t.key, nome: t.nome, icon: t.icon })),
  ];
  const sub = subs.some((x) => x.key === subSalva) ? subSalva : (subs[0]?.key ?? "geral");

  // `?aba=` manda na primeira pintura: um link mandado a um colega precisa
  // abrir onde o remetente estava, não onde ESTE navegador esteve por último.
  // Roda depois do efeito do `useSticky` (declarado antes), então vence ele.
  const params = useSearchParams();
  const daUrl = params.get("aba") as Aba | null;
  const [urlLida, setUrlLida] = useState(false);
  useEffect(() => {
    if (!urlLida && daUrl && tabs.some(([k]) => k === daUrl)) setAbaSalva(daUrl);
    if (!urlLida) setUrlLida(true);
  });

  // Aba salva de uma versão anterior ("geral", "empresa", "financeiro") não
  // existe mais: cai em Operação em vez de deixar a tela em branco. É por aqui
  // que passa quem tinha o Financeiro aberto quando a aba saiu.
  const aba: Aba = tabs.some(([k]) => k === abaSalva) ? abaSalva : "operacao";

  const setAba = (v: Aba) => {
    setAbaSalva(v);
    // `history.replaceState` e não `router.replace`: a página é force-dynamic e
    // o page.tsx resolve permissões no banco, então navegar de verdade custaria
    // um round-trip por clique de aba. Aqui a URL vira endereço compartilhável
    // sem nenhuma requisição.
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("aba", v);
      window.history.replaceState(null, "", u);
    } catch { /* sem history */ }
  };

  // Uma tela, um período. Antes cada aba tinha o próprio `useState`, então
  // escolher "últimos 30 dias" e trocar de aba devolvia a pessoa ao padrão.
  const [period, setPeriod] = useState<PeriodState>(DEFAULT_PERIOD);

  // A marca de atualização é do dado que está na tela, e cada aba busca de uma
  // API diferente — por isso quem a informa é o filho. Zera ao trocar de aba
  // para não exibir a hora do dado anterior enquanto o novo não chegou.
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  useEffect(() => { setUpdatedAt(undefined); }, [aba]);

  // "Atualizar agora": remonta o painel da aba (o `key` muda, o componente
  // nasce de novo e busca). Não é `router.refresh()` — a página é
  // force-dynamic e resolve permissões no banco, então recarregar de verdade
  // custaria um round-trip inteiro pra rebuscar UM endpoint.
  const [recarga, setRecarga] = useState(0);

  // ── A visão da pessoa, por CATEGORIA ─────────────────────────────────────
  // Cada aba tem a própria grade e as próprias análises salvas — é o que a
  // torna uma categoria de verdade, e não a mesma tela com outro dado. Tudo na
  // mesma chave de `user_prefs`: um PUT por mudança, não um por aba.
  //
  // Enquanto a pref não chega (`pronto`), vale a grade padrão da categoria.
  // Gravar nesse instante apagaria a visão montada pela pessoa — por isso todo
  // `mudarItens` só sai depois que a leitura voltou (ver `useVisoes`).
  const { estado, pronto, persistir } = useVisoes();

  // A categoria ativa: em Vendas, só o recorte "faturamento" tem grade própria
  // — os outros são as telas do VendasClient, que têm estrutura própria.
  const categoria = aba === "operacao" ? CATEGORIA
    : aba === "produtos" ? CATEGORIA_PRODUTOS
    : aba === "trafego" ? CATEGORIA_TRAFEGO
    : aba === "vendas" && sub === "faturamento" ? CATEGORIA_VENDAS
    : null;
  const padraoDaCategoria: Record<string, () => ItemNaGrade[]> = {
    [CATEGORIA]: gradeInicialOperacao,
    [CATEGORIA_PRODUTOS]: gradeInicialProdutos,
    [CATEGORIA_VENDAS]: gradeInicialVendas,
    [CATEGORIA_TRAFEGO]: gradeInicialTrafego,
  };
  const catalogoDaCategoria: Record<string, DefWidget[]> = {
    [CATEGORIA]: CATALOGO_OPERACAO,
    [CATEGORIA_PRODUTOS]: CATALOGO_PRODUTOS,
    [CATEGORIA_VENDAS]: CATALOGO_VENDAS,
    [CATEGORIA_TRAFEGO]: CATALOGO_TRAFEGO,
  };
  const itensDe = (cat: string) => estado.layout[cat] ?? padraoDaCategoria[cat]?.() ?? [];
  const itens = categoria ? itensDe(categoria) : [];

  const mudarItens = (cat: string) => (novos: ItemNaGrade[]) =>
    persistir({ ...estado, layout: { ...estado.layout, [cat]: novos } });

  const salvarVisao = (cat: string) => (nome: string) => persistir({
    ...estado,
    salvas: [...estado.salvas, {
      id: Math.random().toString(36).slice(2, 9), nome, categoria: cat,
      itens: itensDe(cat), em: new Date().toLocaleDateString("pt-BR"),
    }],
  });
  const aplicarVisao = (v: VisaoSalva) =>
    // `uid` novo a cada aplicação: dois widgets com o mesmo uid na grade fariam
    // o arrasto mover os dois juntos.
    persistir({ ...estado, layout: { ...estado.layout, [v.categoria]: v.itens.map((i) => ({ ...i, uid: Math.random().toString(36).slice(2, 9) })) } });
  const apagarVisao = (id: string) => persistir({ ...estado, salvas: estado.salvas.filter((s) => s.id !== id) });

  /** As props que toda grade de categoria recebe — mesmas quatro, sempre. */
  const propsDaGrade = (cat: string) => ({
    itens: itensDe(cat),
    salvas: pronto ? estado.salvas : [],
    onMudarItens: mudarItens(cat),
    onSalvar: salvarVisao(cat),
    onAplicar: aplicarVisao,
    onApagar: apagarVisao,
  });

  return (
    <div style={{ width: "100%", minWidth: 0 }}>
      {/* A hora do dado e o "atualizar" moram no cabeçalho, à direita do h1: é
          meta-informação da tela inteira, não de um bloco. */}
      <PageHead title="Analytics" sub={SUB[aba]}
        right={
          <span className="an-atualizacao">
            <span className="an-atualizacao-ponto" aria-hidden />
            <span className="desk-only">Última atualização: {horaDe(updatedAt)}</span>
            <Botao tamanho="sm" variante="sutil" icone="refresh" onClick={() => setRecarga((n) => n + 1)}>
              Atualizar agora
            </Botao>
          </span>
        } />

      {tabs.length > 1 && (
        <div style={{ marginBottom: 18 }}>
          <Abas valor={aba} onMuda={setAba} ariaLabel="Seções do Analytics"
            itens={tabs.map(([k, lbl, ic]) => ({
              valor: k,
              rotulo: <><Icon name={ic} size={15} color="currentColor" /> {lbl}</>,
            }))} />
        </div>
      )}

      {/* Período e "adicionar análise" na MESMA linha: os dois mudam o que se
          vê, e separá-los em duas faixas fazia a segunda parecer cabeçalho de
          outra coisa. A 320px a linha quebra sozinha. */}
      <div className="an-topo">
        <div className="an-topo-periodo"><PeriodPicker value={period} onChange={setPeriod} /></div>
        {/* "Adicionar análise" só onde há grade — em Tráfego pago e nos
            recortes do VendasClient o botão não teria onde colocar a peça, e
            botão que não faz nada é pior que botão ausente. */}
        {categoria && (
          <div className="an-topo-acoes">
            <AdicionarAnalise catalogo={catalogoDaCategoria[categoria]} itens={itens}
              onAdicionar={(d) => mudarItens(categoria)([...itens, itemDe(d)])} />
          </div>
        )}
      </div>

      {aba === "operacao" && (
        <PainelOperacao key={`op-${recarga}`} period={period} aoAtualizar={setUpdatedAt} {...propsDaGrade(CATEGORIA)} />
      )}
      {aba === "produtos" && (
        <PainelProdutos key={`pr-${recarga}`} period={period} aoAtualizar={setUpdatedAt} {...propsDaGrade(CATEGORIA_PRODUTOS)} />
      )}
      {aba === "trafego" && <TrafegoPago key={`tf-${recarga}`} period={period} aoAtualizar={setUpdatedAt} {...propsDaGrade(CATEGORIA_TRAFEGO)} />}

      {aba === "vendas" && (
        <>
          {/* O SEGUNDO nível, um degrau abaixo (`ui-abas--sub`) — e ele existe
              só aqui, onde o assunto realmente tem vários recortes. */}
          {subs.length > 1 && (
            <div style={{ marginBottom: 16 }}>
              <Abas className="ui-abas--sub" valor={sub} onMuda={setSubSalva} ariaLabel="Recortes de vendas"
                itens={subs.map((t) => ({
                  valor: t.key,
                  rotulo: <><Icon name={t.icon} size={14} color="currentColor" /> {t.nome}</>,
                }))} />
            </div>
          )}
          {sub === "faturamento"
            ? <PainelVendas key={`vd-${recarga}`} period={period} aoAtualizar={setUpdatedAt} {...propsDaGrade(CATEGORIA_VENDAS)} />
            /* Sem `isAdmin`: esta tela não edita mais nada. A config de
               marketing (carteira das contas e teto) mudou de endereço — vive
               em Tráfego Pago › Integrações, com o portão daquele módulo. */
            : <VendasClient views={views} period={period} aoAtualizar={setUpdatedAt} abaFixa={sub} />}
        </>
      )}
    </div>
  );
}
