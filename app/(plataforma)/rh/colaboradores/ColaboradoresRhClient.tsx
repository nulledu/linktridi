"use client";

// A tela de Colaboradores, no desenho que o dono aprovou.
//
// Quatro blocos, nesta ordem, e cada um responde uma pergunta:
//   cabeçalho  — onde estou e o que posso fazer
//   números    — como a equipe está
//   filtros    — que recorte eu quero
//   lista      — quem são
//
// A ficha continua em POP-UP: clicar numa pessoa não troca de rota.

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/financeiro/calculos";
import type { PoderesRh } from "@/lib/rh/gate";
import { SELO_SITUACAO, type ColaboradorRh, type ResumoRh, type RhSituacao } from "@/lib/rh/tipos";
import { Avatar } from "../../ui/Avatar";
import { useSticky } from "../../useSticky";
import { useParamDaUrl } from "../../ui/useParamDaUrl";
import { Icon } from "../../Icon";
import { Botao, BotaoIcone } from "../../ui/controles";
import { Abas } from "../../ui/Abas";
import { Dropdown } from "../../ui/Dropdown";
import { GlassSelect } from "../../GlassPicker";
import { NumeroVivo } from "../../ui/micro";
import {
  AvisoSchema, Cartao, Rosca, Selo, Tabela, TituloCartao, Vazio, type Coluna,
} from "../../financeiro/ui";
import { TrocaDeVisao } from "../../financeiro/blocos";
import { PainelDoColaborador } from "./PainelDoColaborador";

const TODOS = "todos";
/** Quem não tem setor cai aqui — e o chip só aparece se houver alguém. */
const SEM_SETOR = "__sem__";

type Ordem = "nome" | "recentes" | "cargo" | "setor" | "situacao";
type Visao = "cartoes" | "tabela";

const ORDENS: { valor: Ordem; label: string }[] = [
  { valor: "nome", label: "Nome (A–Z)" },
  { valor: "recentes", label: "Admissão (mais recentes)" },
  { valor: "cargo", label: "Cargo" },
  { valor: "setor", label: "Setor" },
  { valor: "situacao", label: "Situação" },
];

// 24 por padrão, e não 12: uma equipe de vinte e poucos cabia em duas páginas
// só por causa do número, e paginar para esconder dez pessoas é trabalho sem
// resposta. Com a lista rolando dentro do próprio cartão (`.rh-lista-rola`),
// mostrar mais não custa altura de página.
const POR_PAGINA = [24, 48, 96, 0];
const PADRAO_POR_PAGINA = "24";
const rotuloPagina = (n: number) => (n === 0 ? "Todos" : `${n} por página`);

/**
 * A cor do setor.
 *
 * Sai da paleta de CATEGORIA da fundação (`--cat-1..10`), que existe para
 * DISTINGUIR — não da paleta semântica, onde verde significa "deu certo". Setor
 * não é bom nem ruim; é um agrupamento, e pintá-lo de verde faria "Produção"
 * parecer um status. O índice vem da posição na lista ordenada, então a mesma
 * equipe recebe sempre as mesmas cores entre recarregamentos.
 */
const corDoSetor = (i: number) => `var(--cat-${(i % 10) + 1})`;

export function ColaboradoresRhClient({
  lista, resumo, hoje, poderes, schemaPendente,
}: {
  lista: ColaboradorRh[];
  resumo: ResumoRh;
  /** O dia de São Paulo, resolvido no servidor. */
  hoje: string;
  poderes: PoderesRh;
  schemaPendente: boolean;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [setor, setSetor] = useState<string>(TODOS);
  const [situacao, setSituacao] = useState<string>(TODOS);
  const [cargo, setCargo] = useState<string>(TODOS);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [ordem, setOrdem] = useSticky<Ordem>("rh.colab.ordem", "nome");
  const [visao, setVisao] = useSticky<Visao>("rh.colab.visao", "cartoes");
  // Chave NOVA (`.v2`): quem já usou a tela tem "12" gravado no navegador, e
  // trocar só o padrão não alcançaria justamente quem reclamou da paginação.
  const [porPagina, setPorPagina] = useSticky<string>("rh.colab.porpagina.v2", PADRAO_POR_PAGINA);
  const [pagina, setPagina] = useState(1);
  const [aberta, setAberta] = useState<ColaboradorRh | null>(null);
  const [soPendentes, setSoPendentes] = useState(false);

  // `?pessoa=<id>` abre alguém direto — é o que sobrou de útil da rota antiga:
  // link de tarefa, resultado de busca e favorito seguem valendo.
  useParamDaUrl("pessoa", (id) => setAberta(lista.find((c) => c.id === id) ?? null));
  useParamDaUrl("busca", setBusca);

  // ── Os setores, com a contagem que o chip mostra ───────────────────────────
  const setores = useMemo(() => {
    const conta = new Map<string, number>();
    for (const c of lista) {
      const s = c.setor?.trim() || SEM_SETOR;
      conta.set(s, (conta.get(s) ?? 0) + 1);
    }
    const semSetor = conta.get(SEM_SETOR) ?? 0;
    conta.delete(SEM_SETOR);
    // Por CONTAGEM, não alfabético: o setor com mais gente é o que mais se
    // filtra, e ele merece o primeiro alcance do polegar. "Outros" vai pro fim
    // porque é o resto, não um setor.
    const ordenados = [...conta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"));
    return { ordenados, semSetor };
  }, [lista]);

  const corPorSetor = useMemo(() => {
    const m = new Map<string, string>();
    setores.ordenados.forEach(([nome], i) => m.set(nome, corDoSetor(i)));
    return m;
  }, [setores]);

  const opcoesCargo = useMemo(() => {
    const vistos = new Set<string>();
    for (const c of lista) if (c.cargo?.trim()) vistos.add(c.cargo.trim());
    return [...vistos].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [lista]);

  const temFiltro = setor !== TODOS || situacao !== TODOS || cargo !== TODOS || soPendentes || !!busca.trim();
  const limpar = () => {
    setBusca(""); setSetor(TODOS); setSituacao(TODOS); setCargo(TODOS); setSoPendentes(false); setPagina(1);
  };

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtradas = lista.filter((c) => {
      const s = c.setor?.trim() || SEM_SETOR;
      if (soPendentes && !c.pendente) return false;
      if (setor !== TODOS && s !== setor) return false;
      if (situacao !== TODOS && c.situacao !== situacao) return false;
      if (cargo !== TODOS && (c.cargo?.trim() ?? "") !== cargo) return false;
      if (!q) return true;
      // O que a pessoa DIGITARIA procurando alguém. Telefone entra porque é
      // como se acha "aquele do 9 9…".
      return [c.nome, c.username, c.cargo, c.setor, c.departamento, c.telefone]
        .some((v) => v?.toLowerCase().includes(q));
    });

    const porNome = (a: ColaboradorRh, b: ColaboradorRh) => a.nome.localeCompare(b.nome, "pt-BR");
    const txt = (v: string | null) => v?.trim() || "￿";   // vazio por último, sempre
    return [...filtradas].sort((a, b) => {
      if (ordem === "recentes") {
        if (!a.admissao && !b.admissao) return porNome(a, b);
        if (!a.admissao) return 1;
        if (!b.admissao) return -1;
        return b.admissao.localeCompare(a.admissao) || porNome(a, b);
      }
      if (ordem === "cargo") return txt(a.cargo).localeCompare(txt(b.cargo), "pt-BR") || porNome(a, b);
      if (ordem === "setor") return txt(a.setor).localeCompare(txt(b.setor), "pt-BR") || porNome(a, b);
      if (ordem === "situacao") return a.situacao.localeCompare(b.situacao) || porNome(a, b);
      return porNome(a, b);
    });
  }, [lista, busca, setor, situacao, cargo, ordem, soPendentes]);

  const tamanho = Number(porPagina) || 0;
  const paginas = tamanho ? Math.max(1, Math.ceil(visiveis.length / tamanho)) : 1;
  const paginaAtual = Math.min(pagina, paginas);
  const naPagina = tamanho
    ? visiveis.slice((paginaAtual - 1) * tamanho, paginaAtual * tamanho)
    : visiveis;

  const abrir = (c: ColaboradorRh) => setAberta(c);
  const pendentes = useMemo(() => lista.filter((c) => c.pendente && c.situacao !== "desligado"), [lista]);
  const fatiasDoSetor = useMemo(() => {
    const total = lista.length || 1;
    const linhas = setores.ordenados.map(([nome, n], i) => ({
      id: nome, label: nome, cor: corDoSetor(i), valor: n, proporcao: n / total,
    }));
    if (setores.semSetor) {
      linhas.push({ id: SEM_SETOR, label: "Outros", cor: "var(--neutro)", valor: setores.semSetor, proporcao: setores.semSetor / total });
    }
    return linhas;
  }, [lista.length, setores]);
  const trocarSetor = (v: string) => { setSetor(v); setPagina(1); };

  const vazio = (
    <Vazio
      icone="users"
      titulo={temFiltro ? "Ninguém com esses filtros" : "Nenhum colaborador por aqui"}
      detalhe={
        temFiltro
          ? "Troque o setor, a situação ou limpe os filtros."
          : "A equipe aparece aqui assim que houver gente cadastrada no sistema."
      }
      acao={
        temFiltro
          ? <Botao icone="x" onClick={limpar}>Limpar filtros</Botao>
          : poderes.editar
            ? <Botao variante="primario" icone="plus" onClick={() => router.push("/ti/permissoes?novo=1")}>
                Novo colaborador
              </Botao>
            : undefined
      }
    />
  );

  const colunas: Coluna<ColaboradorRh>[] = [
    {
      chave: "nome", label: "Colaborador", largura: "minmax(min(100%, 190px), 2fr)", titulo: true,
      celula: (c) => (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Avatar url={c.foto} nome={c.nome} size={34} />
          <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <span style={{ overflowWrap: "anywhere" }}>{c.nome}</span>
            <small style={{ color: "var(--text-dim)", fontSize: 11.5 }}>{c.cargo || "sem cargo"}</small>
          </span>
        </span>
      ),
    },
    {
      chave: "setor", label: "Setor", largura: "minmax(min(100%, 110px), 1fr)",
      celula: (c) => (c.setor ? <Etiqueta texto={c.setor} cor={corPorSetor.get(c.setor.trim()) ?? "var(--neutro)"} /> : <span style={{ color: "var(--text-dim)" }}>—</span>),
    },
    {
      chave: "departamento", label: "Departamento", largura: "minmax(min(100%, 110px), 1fr)", soNoComputador: true,
      celula: (c) => c.departamento || <span style={{ color: "var(--text-dim)" }}>—</span>,
    },
    {
      chave: "admissao", label: "Admissão", largura: "104px",
      celula: (c) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{dataBR(c.admissao)}</span>,
    },
    {
      chave: "situacao", label: "Situação", largura: "108px", fim: true,
      celula: (c) => <Selo selo={SELO_SITUACAO[c.situacao]} />,
    },
  ];

  return (
    <>
      {/* ── Cabeçalho ─────────────────────────────────────────────────────────
          Escrito aqui em vez de usar o `Cabecalho` do Financeiro porque este
          tem um bloco a mais: o selo de atualização, à direita da tarja. A
          classe `.page-head` fica: é ela que encolhe o h1 de 32 para 22px no
          celular, e reescrever esse degrau seria o começo de um segundo design
          system.

          A BUSCA NÃO MORA MAIS AQUI. Ela ficava colada no <h1>, a meia tela de
          distância da lista que ela filtra — e no meio do caminho havia cinco
          números e uma fileira de setores. Quem quer achar alguém procura o
          campo perto da lista, não perto do título. Ela desceu pra faixa logo
          acima do cartão, junto dos outros recortes (setor, filtros, visão):
          tudo o que muda O QUE a lista mostra agora vive num lugar só. */}
      <header className="page-head" style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 2 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".12em", color: "var(--text-dim)" }}>RH</span>
          <span className="desk-only" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--text-dim)" }}>
            Atualizado agora
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ok)" }} />
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <h1 style={{ marginBottom: 0, flex: "1 1 auto", minWidth: 0 }}>Colaboradores</h1>

          {poderes.editar && (
            <Botao variante="primario" icone="plus" onClick={() => router.push("/ti/permissoes?novo=1")}>
              Novo colaborador
            </Botao>
          )}
        </div>

        <p style={{ marginTop: 6, maxWidth: "68ch" }}>
          Gerencie sua equipe de forma simples e eficiente. Aqui você encontra informações,
          documentos, ponto, férias e muito mais.
        </p>
      </header>

      {schemaPendente && <AvisoSchema modulo="RH" arquivo="supabase/rh.sql" />}

      {/* ── Os números ────────────────────────────────────────────────────────
          Cinco, e cada um FILTRA a lista ao ser clicado: o número não é só
          informação, é o caminho mais curto até as pessoas que ele conta. */}
      <div
        className="kpi-row"
        style={{
          display: "grid", gap: 14, marginBottom: 18,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 208px), 1fr))",
        }}
      >
        <CartaoNumero
          icone="users" cor="var(--roxo)" rotulo="Total de colaboradores" valor={resumo.total}
          nota="na equipe, fora as pessoas desligadas"
          aoAbrir={() => { setSituacao(TODOS); trocarSetor(TODOS); }}
          titulo="Ver a equipe inteira"
        />
        <CartaoNumero
          icone="briefcase" cor="var(--ok)" rotulo="Ativos" valor={resumo.ativos}
          nota={proporcao(resumo.ativos, resumo.total, "da equipe trabalhando hoje")}
          aoAbrir={() => setSituacao("ativo")}
          titulo="Ver só quem está ativo"
        />
        <CartaoNumero
          icone="calendar-event" cor="var(--azul)" rotulo="Em férias" valor={resumo.ferias}
          nota={resumo.ferias ? proporcao(resumo.ferias, resumo.total, "da equipe fora") : "ninguém de férias agora"}
          aoAbrir={() => setSituacao("ferias")}
          titulo="Ver quem está de férias"
        />
        <CartaoNumero
          icone="clock-hour-4" cor="var(--perigo)" rotulo="Afastados" valor={resumo.afastados}
          nota={resumo.afastados ? proporcao(resumo.afastados, resumo.total, "da equipe em licença") : "ninguém afastado agora"}
          aoAbrir={() => setSituacao("afastado")}
          titulo="Ver quem está afastado"
        />
        <CartaoNumero
          icone="user-plus" cor="var(--roxo)" rotulo="Novos" valor={resumo.novos}
          nota="admitidos nos últimos 90 dias"
          aoAbrir={() => { setOrdem("recentes"); setSituacao(TODOS); }}
          titulo="Ordenar pelos mais recentes"
        />
      </div>

      {/* ── A faixa de recorte: buscar, filtrar, escolher setor, trocar a visão ─
          Tudo o que muda O QUE a lista mostra, encostado nela. A busca vem
          primeiro porque é o atalho de quem já sabe o nome — e ficava lá em
          cima, colada no título, a meia tela da lista que filtra.

          Duas linhas de propósito: a busca precisa de largura para o texto do
          `placeholder` caber, e a fileira de setores precisa da largura inteira
          para não virar duas linhas de chips picados. */}
      <div style={{ display: "grid", gap: 12, marginBottom: 14, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", minWidth: 0 }}>
          <label
            style={{
              display: "flex", alignItems: "center", gap: 9, flex: "1 1 280px", minWidth: 0,
              minHeight: "var(--tap)", padding: "0 14px", borderRadius: "var(--r-pill)",
              background: "var(--surface)", border: "1px solid var(--border)",
            }}
          >
            <Icon name="search" size={16} color="var(--text-dim)" />
            <input
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
              placeholder="Buscar por nome, cargo, setor ou equipe..."
              aria-label="Buscar colaborador"
              style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: "var(--text)", fontSize: 14, outline: "none" }}
            />
            {/* Limpar só existe quando há o que limpar, e o alvo é o campo
                inteiro (44px) — um "×" de 14px não se acerta no toque. */}
            {busca && (
              <button
                type="button" className="ui-toque" aria-label="Limpar busca"
                onClick={() => { setBusca(""); setPagina(1); }}
                style={{ display: "grid", placeItems: "center", flex: "none", border: "none", background: "none", cursor: "pointer" }}
              >
                <Icon name="x" size={15} color="var(--text-dim)" />
              </button>
            )}
          </label>

          {/* `.tab-strip`: no celular estes dois ROLAM de lado em vez de
              empilhar uma fileira de 44px cada. */}
          <div className="tab-strip" style={{ display: "flex", gap: 9, alignItems: "center", padding: 0, minWidth: 0, maxWidth: "100%" }}>
            <Botao
              icone="filter"
              iconeFim={filtrosAbertos ? "chevron-up" : "chevron-down"}
              onClick={() => setFiltrosAbertos((v) => !v)}
              aria-expanded={filtrosAbertos}
            >
              Filtros
            </Botao>
            <TrocaDeVisao
              valor={visao}
              aoTrocar={setVisao}
              opcoes={[
                { id: "cartoes", icone: "layout-grid", titulo: "Ver como cartões" },
                { id: "tabela", icone: "layout-list", titulo: "Ver como tabela" },
              ]}
            />
          </div>
        </div>

        {/* `Abas` e não `Chips`: a escolha é ÚNICA, e a regra do kit é que chip
            é seleção múltipla. Ela rola de lado no celular pela `.tab-strip` da
            fundação, que é o que sete setores exigem numa tela de 320px. */}
        <div style={{ minWidth: 0 }}>
          <Abas
            valor={setor}
            onMuda={trocarSetor}
            ariaLabel="Filtrar por setor"
            itens={[
              { valor: TODOS, rotulo: `Todos (${lista.length})` },
              ...setores.ordenados.map(([nome, n]) => ({ valor: nome, rotulo: `${nome} (${n})` })),
              ...(setores.semSetor ? [{ valor: SEM_SETOR, rotulo: `Outros (${setores.semSetor})` }] : []),
            ]}
          />
        </div>
      </div>

      {/* Os filtros finos ficam atrás do botão "Filtros": setor e situação já
          têm atalho (chips e números), e três seletores sempre abertos comiam
          uma fileira inteira para um uso ocasional. */}
      {filtrosAbertos && (
        <Cartao padding={14} style={{ marginBottom: 14 }}>
          <div className="fin-filtros">
            <Campo rotulo="Situação">
              {(rot) => (
                <GlassSelect
                  aria-labelledby={rot}
                  value={situacao}
                  onChange={(v) => { setSituacao(v); setPagina(1); }}
                  options={[
                    { value: TODOS, label: "Todas" },
                    { value: "ativo", label: "Ativos" },
                    { value: "ferias", label: "Em férias" },
                    { value: "afastado", label: "Afastados" },
                    { value: "desligado", label: "Desligados" },
                  ]}
                />
              )}
            </Campo>
            <Campo rotulo="Cargo">
              {(rot) => (
                <GlassSelect
                  aria-labelledby={rot}
                  value={cargo}
                  onChange={(v) => { setCargo(v); setPagina(1); }}
                  options={[{ value: TODOS, label: "Todos" }, ...opcoesCargo.map((c) => ({ value: c, label: c }))]}
                />
              )}
            </Campo>
            {temFiltro && (
              <Botao icone="x" onClick={limpar} style={{ marginInlineStart: "auto" }}>Limpar filtros</Botao>
            )}
          </div>
        </Cartao>
      )}

      {/* ── A lista + o apoio ─────────────────────────────────────────────────
          `.duo .duo-lista` da fundação: lista grande à esquerda, painel de
          apoio à direita, e UMA coluna abaixo de 900px. A barra lateral é
          apoio de verdade — atalho, pendência e o retrato dos setores —, então
          no celular ela cai DEPOIS da lista, que é o que se veio ver. */}
      <div className="duo duo-lista">
        {/* `.rh-card-lista`: no computador o cartão ganha teto de altura e vira
            uma coluna de flex, para a lista rolar por dentro em vez de esticar
            a página. Ver o bloco no `globals.css`. */}
        <Cartao className="rh-card-lista">
          <TituloCartao
            icone="users"
            direita={
              <span className="tab-strip" style={{ display: "flex", alignItems: "center", gap: 10, padding: 0, minWidth: 0, maxWidth: "100%" }}>
                <Campo rotulo="Ordenar por" embutido>
                  {(rot) => (
                    <GlassSelect
                      aria-labelledby={rot}
                      value={ordem}
                      onChange={(v) => setOrdem(v as Ordem)}
                      options={ORDENS.map((o) => ({ value: o.valor, label: o.label }))}
                    />
                  )}
                </Campo>
                <Campo rotulo="Exibir" embutido>
                  {(rot) => (
                    <GlassSelect
                      aria-labelledby={rot}
                      value={porPagina}
                      onChange={(v) => { setPorPagina(v); setPagina(1); }}
                      options={POR_PAGINA.map((n) => ({ value: String(n), label: rotuloPagina(n) }))}
                    />
                  )}
                </Campo>
              </span>
            }
          >
            Lista de colaboradores
          </TituloCartao>

          {/* A lista rola DENTRO do bloco, não na página (regra da fundação
              para tabela que não cabe). No computador o cartão ganha um teto
              relativo à altura da janela: a tela inteira — cabeçalho, números,
              recortes, lista e a coluna de apoio — passa a caber sem rolagem,
              e quem rola é só a lista. No celular o teto sai: rolagem dentro de
              rolagem num telefone é armadilha, e lá a página rola mesmo. */}
          <div className="rh-lista-rola">
            {!visiveis.length ? vazio : visao === "tabela" ? (
              <Tabela
                colunas={colunas}
                linhas={naPagina}
                chaveDe={(c) => c.id}
                aoClicar={abrir}
                rotuloItem="colaboradores"
                vazio={vazio}
              />
            ) : (
              <div
                className="mt-fila"
                style={{
                  display: "grid", gap: 14,
                  gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 228px), 1fr))",
                }}
              >
                {naPagina.map((c, i) => (
                  <CartaoDoColaborador
                    key={c.id}
                    pessoa={c}
                    indice={i}
                    cor={c.setor ? (corPorSetor.get(c.setor.trim()) ?? "var(--neutro)") : "var(--neutro)"}
                    aoAbrir={() => abrir(c)}
                  />
                ))}
              </div>
            )}
          </div>

          {paginas > 1 && (
            <Paginacao
              pagina={paginaAtual}
              paginas={paginas}
              total={visiveis.length}
              mostrando={naPagina.length}
              aoIr={setPagina}
            />
          )}
        </Cartao>


        <aside style={{ display: "grid", gap: 14, alignContent: "start", minWidth: 0 }}>
          <Cartao padding={16}>
            <TituloCartao icone="bolt">Ações rápidas</TituloCartao>
            <div style={{ display: "grid", gap: 6 }}>
              {poderes.editar && (
                <AcaoRapida
                  icone="users-plus" titulo="Adicionar colaborador" detalhe="Novo cadastro no sistema"
                  href="/ti/permissoes?novo=1"
                />
              )}
              {/* Permissões e cadastro de conta moram na TI (22/09/2026):
                  convite de primeiro acesso, ativar, desativar, a grade de
                  permissões e os aparelhos pareados. */}
              <AcaoRapida
                icone="shield-check" titulo="Cadastro e acessos" detalhe="Contas, convites e aparelhos"
                href="/ti/permissoes"
              />
              {poderes.ponto && (
                <AcaoRapida
                  icone="clock-hour-4" titulo="Ponto & horas" detalhe="Visualizar registros"
                  href="/rh/ponto"
                />
              )}
              {poderes.calendario && (
                <AcaoRapida
                  icone="calendar" titulo="Calendário" detalhe="Férias e afastamentos"
                  href="/rh/calendario"
                />
              )}
            </div>
          </Cartao>

          {/* Só aparece quando HÁ pendência. Um cartão que diz "0 pendentes"
              ocupa o mesmo espaço para não informar nada. */}
          {!!pendentes.length && (
            <Cartao padding={16}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start", minWidth: 0 }}>
                <span
                  aria-hidden
                  style={{
                    width: 40, height: 40, flex: "none", borderRadius: 12, display: "grid", placeItems: "center",
                    background: "color-mix(in srgb, var(--atencao) 14%, transparent)",
                  }}
                >
                  <Icon name="user-off" size={19} color="var(--atencao)" />
                </span>
                <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
                  <strong style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.3 }}>
                    {pendentes.length === 1
                      ? "1 colaborador ainda não entrou"
                      : `${pendentes.length} colaboradores ainda não entraram`}
                  </strong>
                  <small style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.45 }}>
                    A conta existe, mas o convite de acesso nunca foi usado.
                  </small>
                  <Botao
                    tamanho="sm"
                    iconeFim="arrow-right"
                    onClick={() => { setSituacao(TODOS); trocarSetor(TODOS); setBusca(""); setSoPendentes(true); }}
                  >
                    Ver pendentes
                  </Botao>
                </div>
              </div>
            </Cartao>
          )}

          <Cartao padding={16}>
            <TituloCartao icone="chart-pie">Setores</TituloCartao>
            {fatiasDoSetor.length ? (
              <Rosca
                fatias={fatiasDoSetor}
                total={String(lista.length)}
                rotuloTotal="colaboradores"
                tamanho={150}
                formatar={(v) => String(v)}
              />
            ) : (
              <Vazio compacto icone="chart-pie" titulo="Sem setor cadastrado"
                     detalhe="O setor de cada pessoa é definido na ficha." />
            )}
          </Cartao>
        </aside>
      </div>

      {aberta && (
        <PainelDoColaborador
          key={aberta.id}
          pessoa={aberta}
          hoje={hoje}
          poderes={poderes}
          aoFechar={() => setAberta(null)}
          // A ficha mexeu em algo que a LISTA mostra (situação, cargo, setor):
          // sem isto o selo da linha continuaria com o valor de antes até a
          // próxima navegação.
          aoMudar={() => router.refresh()}
        />
      )}
    </>
  );
}

/** "85% da equipe trabalhando hoje" — e nunca "NaN%" quando não há ninguém. */
function proporcao(parte: number, total: number, sufixo: string): string {
  if (!total) return sufixo;
  return `${Math.round((parte / total) * 100)}% ${sufixo}`;
}

// ── Peças da tela ────────────────────────────────────────────────────────────

/**
 * Rótulo pequeno acima de um controle. `embutido` deixa os dois na mesma linha.
 *
 * `<div>` e `aria-labelledby`, NUNCA `<label>`: todo controle que entra aqui é
 * um `GlassSelect`, cujo gatilho é um `<button>`. Um `<label>` em volta de um
 * botão dispara o botão ao ser clicado — tocar no texto "Ordenar por" abria a
 * lista sozinho, e no celular, onde o dedo erra o alvo pequeno por 4px, isso
 * acontecia o tempo todo. É a mesma decisão que o `<Filtro>` do Financeiro
 * documenta, e o mesmo defeito que já custou caro neste repositório.
 */
function Campo({ rotulo, embutido, children }: {
  rotulo: string; embutido?: boolean;
  /** Recebe o `id` do rótulo: o controle o devolve em `aria-labelledby`, que é
   *  o vínculo que sobra quando o `for`/`id` do `<label>` sai de cena. */
  children: (idRotulo: string) => React.ReactNode;
}) {
  const idRotulo = useId();
  return (
    <div
      style={{
        display: embutido ? "inline-flex" : "grid",
        alignItems: "center", gap: embutido ? 8 : 5, minWidth: 0,
      }}
    >
      <span id={idRotulo} style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{rotulo}</span>
      {children(idRotulo)}
    </div>
  );
}

/** A pílula de setor. Cor de CATEGORIA — distingue, não julga. */
/**
 * A etiqueta de setor.
 *
 * A variante `fraca` é o "sem setor": mesma caixa, mesmo padding, mesma altura
 * — só a tinta muda. É de propósito que ela não ganhe borda: borda somaria 2px
 * e o cartão sem setor voltaria a ficar 2px fora de linha com os outros.
 */
function Etiqueta({ texto, cor, fraca }: { texto: string; cor: string; fraca?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, maxWidth: "100%",
        padding: "3px 9px", borderRadius: "var(--r-pill)", fontSize: 11.5, fontWeight: 700,
        color: fraca ? "var(--text-dim)" : `color-mix(in srgb, ${cor} 82%, var(--text))`,
        background: fraca
          ? "color-mix(in srgb, var(--text-dim) 12%, transparent)"
          : `color-mix(in srgb, ${cor} 14%, transparent)`,
      }}
    >
      <Icon name="user" size={12} color="currentColor" />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{texto}</span>
    </span>
  );
}

/**
 * O cartão de número.
 *
 * Ícone e rótulo em CIMA, número embaixo ocupando a largura toda. A primeira
 * versão punha os três lado a lado, e com cinco cartões numa tela de 1440 sobra
 * ~130px para o texto — "Total de colaboradores" quebrava em três linhas e o
 * cartão virava um bloco de texto com um número perdido no meio. Assim o rótulo
 * tem a largura inteira menos o ícone e a seta, e o número fica com a dele.
 */
function CartaoNumero({
  icone, cor, rotulo, valor, nota, aoAbrir, titulo,
}: {
  icone: string; cor: string; rotulo: string; valor: number; nota: string;
  aoAbrir: () => void; titulo: string;
}) {
  return (
    <Cartao padding={16}>
      <div style={{ display: "grid", gap: 10, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: 40, height: 40, flex: "none", borderRadius: 12, display: "grid", placeItems: "center",
              background: `color-mix(in srgb, ${cor} 14%, transparent)`,
            }}
          >
            <Icon name={icone} size={19} color={cor} />
          </span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)", overflowWrap: "anywhere" }}>
            {rotulo}
          </span>
          {/* A seta é o alvo e tem 44px de verdade; o que se vê é só o ícone.
              Alvo de 20px reprova a regra de toque. */}
          <BotaoIcone icone="chevron-right" titulo={titulo} onClick={aoAbrir} style={{ flex: "none", margin: "-10px -10px -10px 0" }} />
        </div>

        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <NumeroVivo
            valor={valor}
            as="strong"
            style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.05 }}
          />
          <small style={{ fontSize: 11.5, color: "var(--text-dim)", overflowWrap: "anywhere", lineHeight: 1.4 }}>
            {nota}
          </small>
        </div>
      </div>
    </Cartao>
  );
}

function CartaoDoColaborador({
  pessoa, indice, cor, aoAbrir,
}: {
  pessoa: ColaboradorRh; indice: number; cor: string; aoAbrir: () => void;
}) {
  const tel = pessoa.telefone?.replace(/\D/g, "") ?? "";

  return (
    <div
      className="mt-linha"
      style={{
        ["--mt-i" as string]: indice,
        // Coluna FLEX, não grade: é o `marginTop: auto` do rodapé que o prende
        // embaixo. Numa grade com `align-content: start` a margem automática não
        // empurra nada — as fileiras já estão empacotadas no topo.
        display: "flex", flexDirection: "column", gap: 10, minWidth: 0,
        padding: 14, borderRadius: "var(--r-md)",
        border: "1px solid var(--border)", background: "var(--surface)",
      }}
    >
      {/* Altura travada na do avatar. Nome e cargo cabem numa linha cada e
          passam a cortar com reticências em vez de quebrar: nome comprido
          empurrava tudo que vem depois e o cartão do lado ficava 60px fora de
          linha. O nome inteiro continua no `title` e na ficha. */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 11, minWidth: 0, minHeight: 48 }}>
        <Avatar url={pessoa.foto} nome={pessoa.nome} size={48} formato="redondo" />
        <div style={{ display: "grid", gap: 1, minWidth: 0, flex: 1 }}>
          <strong
            title={pessoa.nome}
            style={{
              fontSize: 14, fontWeight: 700, minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {pessoa.nome}
          </strong>
          <small
            title={pessoa.cargo || undefined}
            style={{
              fontSize: 12, color: "var(--text-dim)", minWidth: 0,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {pessoa.cargo || "sem cargo"}
          </small>
        </div>

        {/* O "⋮" existe porque no celular não há `:hover`: ação que só aparece
            ao passar o mouse não existe no dedo. O menu é o `Dropdown` do
            sistema (portal pro body, folha no celular). */}
        <div style={{ flex: "none" }}>
          <Dropdown
            titulo={`Ações de ${pessoa.nome}`}
            alinhar="fim"
            largura={210}
            itens={[
              { id: "ficha", rotulo: "Abrir ficha", icone: "id-badge", onSelect: aoAbrir },
              ...(tel ? [
                { id: "whatsapp", rotulo: "WhatsApp", icone: "brand-whatsapp", href: `https://wa.me/${tel.length <= 11 ? `55${tel}` : tel}`, novaAba: true },
                { id: "ligar", rotulo: "Ligar", icone: "phone", href: `tel:${tel}` },
              ] : []),
              { id: "email", rotulo: "Enviar e-mail", icone: "mail", href: `mailto:${pessoa.username}` },
            ]}
            gatilho={(p) => (
              <BotaoIcone icone="dots" titulo={`Ações de ${pessoa.nome}`} {...p} style={{ marginTop: -8, marginRight: -8 }} />
            )}
          />
        </div>
      </div>

      {/* A fileira do setor existe SEMPRE. Antes ela sumia quando a pessoa não
          tinha setor — e como o `gap` do cartão continuava valendo, selo,
          admissão e rodapé subiam uma etiqueta inteira em relação a quem tinha.
          Quem não tem ganha a mesma etiqueta em cinza, igual "sem cargo". */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        {pessoa.setor
          ? <Etiqueta texto={pessoa.setor} cor={cor} />
          : <Etiqueta texto="sem setor" cor={cor} fraca />}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between", minWidth: 0 }}>
        <Selo selo={SELO_SITUACAO[pessoa.situacao]} />
        <small style={{ fontSize: 11.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {pessoa.admissao ? `Desde ${dataBR(pessoa.admissao)}` : "sem admissão"}
        </small>
      </div>

      <div
        style={{
          display: "flex", alignItems: "center", gap: 4, minWidth: 0,
          // `auto` e não 2px: o cartão estica até a altura do mais alto da
          // fileira, e sem isso a sobra ficaria embaixo do rodapé em vez de
          // acima dele.
          borderTop: "1px solid var(--border)", marginTop: "auto", paddingTop: 4,
        }}
      >
        <AcaoDoCartao icone="mail" titulo={`E-mail de ${pessoa.nome}`} href={`mailto:${pessoa.username}`} />
        <AcaoDoCartao icone="phone" titulo={tel ? `Ligar para ${pessoa.nome}` : "Sem telefone"} href={tel ? `tel:${tel}` : undefined} />
        <Botao variante="sutil" icone="id-badge" onClick={aoAbrir} style={{ marginInlineStart: "auto", minWidth: 0 }}>Ver ficha</Botao>
      </div>
    </div>
  );
}

function AcaoDoCartao({ icone, titulo, href }: { icone: string; titulo: string; href?: string }) {
  const estilo: React.CSSProperties = {
    width: "var(--tap)", minHeight: "var(--tap)", display: "grid", placeItems: "center",
    borderRadius: "var(--r-sm)", flex: "none",
  };
  if (!href) {
    return (
      <span aria-hidden title={titulo} style={{ ...estilo, opacity: 0.35 }}>
        <Icon name={icone} size={16} color="var(--text-dim)" />
      </span>
    );
  }
  return (
    <a href={href} title={titulo} aria-label={titulo} style={{ ...estilo, textDecoration: "none" }}>
      <Icon name={icone} size={16} color="var(--text-dim)" />
    </a>
  );
}

function Paginacao({
  pagina, paginas, total, mostrando, aoIr,
}: {
  pagina: number; paginas: number; total: number; mostrando: number; aoIr: (p: number) => void;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        flexWrap: "wrap", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)",
      }}
    >
      <small style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
        Mostrando {mostrando} de {total} colaboradores
      </small>
      <div className="tab-strip" style={{ display: "flex", alignItems: "center", gap: 8, padding: 0, minWidth: 0, maxWidth: "100%" }}>
        <Botao tamanho="sm" icone="chevron-left" disabled={pagina <= 1} onClick={() => aoIr(pagina - 1)}>
          Anterior
        </Botao>
        <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          {pagina} de {paginas}
        </span>
        <Botao tamanho="sm" iconeFim="chevron-right" disabled={pagina >= paginas} onClick={() => aoIr(pagina + 1)}>
          Próxima
        </Botao>
      </div>
    </div>
  );
}

/** Uma linha da lista de atalhos: ícone, o que é, e o que acontece ao clicar. */
function AcaoRapida({ icone, titulo, detalhe, href }: {
  icone: string; titulo: string; detalhe: string; href: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: "flex", alignItems: "center", gap: 11, minHeight: "var(--tap)", minWidth: 0,
        padding: "9px 10px", borderRadius: "var(--r-sm)", textDecoration: "none", color: "var(--text)",
      }}
      className="ui-card-alvo"
    >
      <span
        aria-hidden
        style={{
          width: 36, height: 36, flex: "none", borderRadius: 11, display: "grid", placeItems: "center",
          background: "color-mix(in srgb, var(--primary-texto) 12%, transparent)",
        }}
      >
        <Icon name={icone} size={17} color="var(--primary-texto)" />
      </span>
      <span style={{ display: "grid", gap: 1, minWidth: 0, flex: 1 }}>
        <strong style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{titulo}</strong>
        <small style={{ fontSize: 11.5, color: "var(--text-dim)", overflowWrap: "anywhere" }}>{detalhe}</small>
      </span>
      <Icon name="chevron-right" size={15} color="var(--text-dim)" />
    </a>
  );
}
