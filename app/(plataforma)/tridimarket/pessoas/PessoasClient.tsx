"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { GlassSelect } from "../../GlassPicker";
import type { MarketEmployee, MarketPerson, MarketProfile } from "../../../../lib/tridimarket/types";
import { SkelTabela } from "../ui";
import { formatMarketCurrency, marketStatusLabel } from "../../../../lib/tridimarket/view";
import { mesPadraoDaBaixa, valorAteOMes } from "../../../../lib/tridimarket/domain";
import { centavosDeReais, centavosDoTexto, reaisDeCentavos, reaisInteirosDoTexto, textoDeCentavos, textoDeReaisInteiros } from "../../../../lib/tridimarket/moeda";
import { Cabecalho, intervaloDe as faturaEscolhida, useCargaAtual, useFiltros } from "../Filtros";
import { Aviso } from "../DashboardClient";
import { Avatar, Badge, Card, Empty, INDIGO, marketRequest } from "../ui";
import { ComSelo } from "../../ui/Avatar";
import { Folha, ModalImportar, ModalPessoa, type Unidade } from "../Cadastro";
import { DataList, type Coluna } from "../../ui/DataList";
import { useIsMobile } from "../../ui/useMediaQuery";
import { atributosDe } from "../../ui/campos";
import { Botao, BotaoIcone, CampoOTP } from "../../ui/controles";

type Settings = { profiles: MarketProfile[]; schemaReady: boolean };
type ConflitoCodigo = { pessoas: Array<{ id: number; nome: string; unidade: string }> };
type SaudeCodigos = { total: number; semCodigo: number; conflitos: ConflitoCodigo[]; pessoasEmConflito: number };

const TOM: Record<MarketEmployee["status"], "pos" | "warn" | "neg"> = {
  good: "pos", near_limit: "warn", overdraft: "warn", overdue: "neg", blocked: "neg",
};

export function PessoasClient() {
  // Memória e padrão próprios: aqui o recorte é a FATURA, e ela nasce na aberta.
  const [filtros, setFiltros] = useFiltros({ chave: "tridimarket:filtros:pessoas", padrao: "mes" });
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pessoas, setPessoas] = useState<MarketPerson[]>([]);
  const [, setCodigos] = useState<SaudeCodigos | null>(null);
  const [busca, setBusca] = useState("");
  const [apenasDevendo, setApenasDevendo] = useState(false);
  // QUAL balde a lista mostra. Nasce em "fechado" porque é o que se cobra: no
  // mercadinho se paga em setembro a conta de agosto, então abrir na dívida
  // somada (fechado + o que a pessoa comprou ontem) dava um número que nunca
  // batia com o dinheiro na mão.
  const [recorte, setRecorte] = useState<"fechado" | "aberto">("fechado");
  // Receber direto da linha: antes era abrir a pessoa → aba Carteira → Receber.
  const [recebendoDe, setRecebendoDe] = useState<MarketPerson | null>(null);
  const [mostrarInativas, setMostrarInativas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Uma coisa só ao clicar: o painel da pessoa. Todas as ações (receber,
  // editar, cadastros, empresa, vendas) moram lá dentro — a linha fica calma.
  const [detalhe, setDetalhe] = useState<MarketPerson | null>(null);
  // Cadastro de pessoa nova (antes só dava pra editar quem o ERP antigo mandava).
  const [cadastrando, setCadastrando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [editandoPessoa, setEditandoPessoa] = useState<MarketPerson | null>(null);
  const [puxandoFotos, setPuxandoFotos] = useState(false);

  // Quantas pessoas ainda estão sem foto. O botão de puxar só aparece se
  // houver alguma — não faz sentido oferecer uma ação que não muda nada.
  const semFoto = useMemo(() => pessoas.filter((p) => !p.imageUrl).length, [pessoas]);

  async function puxarFotos() {
    setPuxandoFotos(true);
    try {
      const r = await marketRequest<{ preenchidas: number; semFoto: string[] }>("sincronizar-fotos", { method: "POST" });
      void carregar();
      setAviso(r.preenchidas
        ? `${r.preenchidas} foto${r.preenchidas === 1 ? "" : "s"} do Ponto.${r.semFoto.length ? ` ${r.semFoto.length} sem foto lá: ${r.semFoto.slice(0, 3).join(", ")}${r.semFoto.length > 3 ? "…" : ""}` : ""}`
        : "Ninguém ganhou foto — quem está sem aqui também não tem foto no Ponto.");
      setTimeout(() => setAviso(null), 5000);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível puxar as fotos."); }
    finally { setPuxandoFotos(false); }
  }
  const [empresas, setEmpresas] = useState<Unidade[]>([]);
  const celular = useIsMobile();

  useEffect(() => {
    // Empresas do seletor de cadastro. `unidades` traz também as INATIVAS (pra
    // não sumir a empresa de quem já está cadastrado nela), mas ela NÃO pode ser
    // a única fonte: quando essa chamada falhava, o select ficava vazio e o
    // botão "Cadastrar" nascia desabilitado pra sempre — clicava e não
    // acontecia nada, sem erro nenhum na tela. Então o padrão é a lista que a
    // própria tela já usa no filtro do topo, e `unidades` só melhora em cima.
    marketRequest<Unidade[]>("unidades").then((u) => { if (u.length) setEmpresas(u); }).catch(() => { /* fica o fallback */ });
  }, []);

  // Fallback: as empresas que o filtro do topo já carregou.
  const empresasDoFiltro = useMemo<Unidade[]>(
    () => (settings?.profiles ?? []).map((p) => ({ id: p.id, nome: p.name, ativo: true })),
    [settings],
  );
  const empresasParaCadastro = empresas.length ? empresas : empresasDoFiltro;

  // A lista segue o SELETOR DE PERÍODO: por padrão a fatura aberta (este mês),
  // mas dá pra abrir a de agosto e ver o que cada um deve daquela fatura. O
  // limite e o disponível NÃO mudam com o recorte — quem responde por eles é
  // sempre a fatura aberta (ver employees() no repositório).
  const janela = useMemo(() => faturaEscolhida(filtros), [filtros]);

  const { desatualizado, marcarCarregado } = useCargaAtual(`${janela.de}|${janela.ate}|${filtros.profileId}`);

  const escopo = useMemo(() => {
    const q = new URLSearchParams({ de: janela.de, ate: janela.ate });
    if (filtros.profileId) q.set("profileId", filtros.profileId);
    return `?${q.toString()}`;
  }, [janela, filtros.profileId]);
  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    const [conf, lista] = await Promise.allSettled([
      marketRequest<Settings>("settings"),
      marketRequest<MarketPerson[]>(`employees${escopo}`),
    ]);
    if (conf.status === "fulfilled") setSettings(conf.value);
    if (lista.status === "fulfilled") {
      setPessoas(lista.value); marcarCarregado();
      // Mantém o painel aberto sincronizado com os dados novos.
      setDetalhe((atual) => atual ? (lista.value.find((p) => p.key === atual.key) ?? null) : null);
    } else setErro(lista.reason instanceof Error ? lista.reason.message : "Falha ao carregar as pessoas.");
    try { setCodigos(await marketRequest<SaudeCodigos>("codigos")); } catch { /* informativo */ }
    setCarregando(false);
  }, [escopo]);

  useEffect(() => { void carregar(); }, [carregar]);

  const visiveis = useMemo(() => pessoas
    .filter((p) => p.name.toLowerCase().includes(busca.toLowerCase()))
    // Inativas ficam ESCONDIDAS por padrão (é o ponto de inativar), mas nunca
    // somem de vez: sem o botão abaixo não haveria como reativar ninguém.
    // Quem ainda deve continua aparecendo — a dívida não some com o cadastro.
    .filter((p) => mostrarInativas || p.active || p.open > 0)
    .filter((p) => !apenasDevendo || p.open > 0)
    // `mostrarInativas` PRECISA estar aqui: sem ele o memo devolvia a lista
    // velha e clicar em "Mostrar inativas" só acendia o botão — a lista não
    // mudava, e não havia jeito nenhum de chegar num cadastro inativo.
    .sort((a, b) => valorDoRecorte(b, recorte) - valorDoRecorte(a, recorte) || b.open - a.open),
    [pessoas, busca, apenasDevendo, mostrarInativas, recorte]);

  const totalAberto = visiveis.reduce((s, p) => s + p.open, 0);
  const inativas = pessoas.filter((p) => !p.active).length;
  const unificadas = visiveis.filter((p) => p.unified).length;
  const rotuloRecorte = recorte === "fechado" ? "Até o mês passado" : "Este mês";
  const totalRecorte = visiveis.reduce((s, p) => s + valorDoRecorte(p, recorte), 0);
  const unidades = useMemo(() => Object.fromEntries((settings?.profiles ?? []).map((p) => [p.id, p.name])), [settings]);

  // UMA definição de colunas: tabela no computador, cartões no celular. A tabela
  // antiga tinha 620px de largura mínima — no celular ela rolava de lado e a
  // pessoa perdia justamente a coluna do nome ao arrastar.
  const colunas = useMemo<Coluna<MarketPerson>[]>(() => [
    {
      chave: "pessoa", titulo: "Pessoa", papel: "titulo",
      render: (p) => (
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Avatar name={p.name} url={p.imageUrl} size={30} />
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ fontWeight: 650, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              {/* Sem esta marca, inativar não deixava rastro NENHUM na lista: a
                  pessoa continuava idêntica e parecia que o botão não tinha
                  funcionado (tinha — o banco já estava com ativo=false). */}
              {!p.active && <Badge tone="neutral">inativa</Badge>}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 1, fontSize: 11.5, fontWeight: 500, color: "var(--text-dim)" }}>
              <Icon name="building-warehouse" size={12} color="var(--text-dim)" />
              {unidades[p.mainProfileId] ?? "sem empresa"}
              {p.unified && <span style={{ color: INDIGO, fontWeight: 700 }}>· {p.accounts.length} cadastros</span>}
            </span>
          </span>
        </span>
      ),
    },
    {
      // O NÚMERO PRINCIPAL é o balde escolhido — por padrão o mês fechado, que
      // é o que se cobra. O outro balde nunca some: fica na coluna ao lado.
      chave: "fatura", titulo: rotuloRecorte, papel: "destaque", alinhar: "right",
      render: (p) => {
        const v = valorDoRecorte(p, recorte);
        return <span style={{ fontWeight: 700, color: v > 0 ? "var(--text)" : "var(--text-dim)" }}>{formatMarketCurrency(v)}</span>;
      },
    },
    {
      chave: "outro", titulo: recorte === "fechado" ? "Este mês" : "Até o mês passado", alinhar: "right",
      render: (p) => {
        const v = valorDoRecorte(p, recorte === "fechado" ? "aberto" : "fechado");
        return <span style={{ color: v > 0 ? "var(--text-dim)" : "var(--text-dim)", opacity: v > 0 ? 1 : .55 }}>{formatMarketCurrency(v)}</span>;
      },
    },
    { chave: "limite", titulo: "Limite", alinhar: "right", render: (p) => <span style={{ color: "var(--text-dim)" }}>{formatMarketCurrency(p.normalLimit)}</span> },
    { chave: "disponivel", titulo: "Disponível", alinhar: "right", render: (p) => <span style={{ color: "var(--text-dim)" }}>{formatMarketCurrency(p.available)}</span> },
    { chave: "situacao", titulo: "Situação", render: (p) => <Badge tone={TOM[p.status]}>{marketStatusLabel(p.status)}</Badge> },
    // Receber direto da linha. Antes eram quatro passos (abrir a pessoa → aba
    // Carteira → achar o cadastro → Receber) pra registrar um pagamento que é
    // a coisa mais feita nesta tela.
    {
      chave: "receber", titulo: "", alinhar: "right",
      render: (p) => p.open > 0 ? (
        <Botao tamanho="sm" icone="cash"
          onPointerDown={(e) => { e.stopPropagation(); setRecebendoDe(p); }}
          onClick={(e) => e.stopPropagation()}
          title="Receber pagamento">
          Receber
        </Botao>
      ) : null,
    },
    // Editar direto da linha. Antes era: abrir a pessoa → aba Carteira →
    // clicar na foto. Três passos pra trocar um nome.
    {
      chave: "editar", titulo: "", alinhar: "right",
      render: (p) => (
        <Botao variante="sutil" tamanho="sm" icone="edit"
          onPointerDown={(e) => { e.stopPropagation(); setEditandoPessoa(p); }}
          onClick={(e) => e.stopPropagation()}
          title="Editar cadastro">
          Editar
        </Botao>
      ),
    },
  ], [unidades, rotuloRecorte, recorte]);

  return (
    <>
      <Cabecalho titulo="Pessoas" descricao={`${visiveis.length} de ${pessoas.length} · ${rotuloRecorte.toLowerCase()}: ${formatMarketCurrency(totalRecorte)} · dívida total ${formatMarketCurrency(totalAberto)}${unificadas ? ` · ${unificadas} com cadastro em mais de uma empresa` : ""}`}
        filtros={filtros} setFiltros={setFiltros} perfis={settings?.profiles ?? []} carregando={carregando} onAtualizar={() => void carregar()} />

      {erro && <Aviso tom="neg" icone="circle-x" titulo="Não foi possível concluir">{erro}</Aviso>}
      {aviso && <Aviso tom="pos" icone="circle-check" titulo="Pronto">{aviso}</Aviso>}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Busca valor={busca} onChange={setBusca} placeholder="Buscar pessoa" />
        {/* O recorte da COBRANÇA. Fica ao lado da busca porque é a primeira
            pergunta de quem abre esta tela: "quanto fulano deve do mês
            passado?". A fileira rola de lado no celular. */}
        <div className="tab-strip" style={{ display: "flex", gap: 6, overflowX: "auto" }}>
          {([["fechado", "Até o mês passado"], ["aberto", "Este mês"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setRecorte(k)} aria-pressed={recorte === k}
              style={{
                flex: "none", minHeight: "var(--tap)", padding: "0 14px", borderRadius: "var(--r-sm)", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
                border: `1px solid ${recorte === k ? INDIGO : "var(--border)"}`,
                background: recorte === k ? `color-mix(in srgb, ${INDIGO} 12%, transparent)` : "var(--surface)",
                color: recorte === k ? INDIGO : "var(--text-dim)",
              }}>{label}</button>
          ))}
        </div>
        <button onClick={() => setApenasDevendo((v) => !v)} aria-pressed={apenasDevendo}
          style={{
            padding: "9px 14px", borderRadius: "var(--r-sm)", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
            border: `1px solid ${apenasDevendo ? INDIGO : "var(--border)"}`,
            background: apenasDevendo ? `color-mix(in srgb, ${INDIGO} 12%, transparent)` : "var(--surface)",
            color: apenasDevendo ? INDIGO : "var(--text-dim)",
          }}>Só quem está devendo</button>
        {inativas > 0 && (
          <button onClick={() => setMostrarInativas((v) => !v)} aria-pressed={mostrarInativas}
            style={{
              padding: "9px 14px", borderRadius: "var(--r-sm)", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
              border: `1px solid ${mostrarInativas ? INDIGO : "var(--border)"}`,
              background: mostrarInativas ? `color-mix(in srgb, ${INDIGO} 12%, transparent)` : "var(--surface)",
              color: mostrarInativas ? INDIGO : "var(--text-dim)",
            }}>Mostrar inativas ({inativas})</button>
        )}
        {semFoto > 0 && (
          <Botao icone="camera" onClick={() => void puxarFotos()} carregando={puxandoFotos} style={{ marginLeft: "auto" }}>
            {puxandoFotos ? "Puxando…" : `Puxar fotos (${semFoto} sem)`}
          </Botao>
        )}
        <Botao icone="users" onClick={() => setImportando(true)} style={{ marginLeft: semFoto > 0 ? undefined : "auto" }}>Importar do Gaius</Botao>
        <Botao variante="primario" icone="plus" onClick={() => setCadastrando(true)}>Nova pessoa</Botao>
      </div>

      {desatualizado && !erro ? <SkelTabela n={8} colunas={5} /> : (
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {/* Respiro só no celular: lá o DataList vira cartões e eles não podem
            encostar na borda do Card. No computador a tabela segue rente. */}
        <div style={{ padding: celular && visiveis.length ? 10 : 0 }}>
          <DataList itens={visiveis} colunas={colunas} chaveDe={(p) => p.key} onAbrir={setDetalhe} minWidth={620}
            vazio={<Empty icon="users" title="Nenhuma pessoa encontrada" text="Ajuste a busca ou a empresa selecionada." />} />
        </div>
      </Card>
      )}

      {/* Editar o CADASTRO (foto, nome, código, vínculo) — o "Editar" de dentro
          do painel mexe só em limite e código do cadastro daquela empresa. */}
      {editandoPessoa && (
        <ModalPessoa
          pessoa={{
            id: editandoPessoa.accounts[0].id,
            nome: editandoPessoa.name,
            fotoUrl: editandoPessoa.imageUrl,
            unidadeId: editandoPessoa.mainProfileId,
            ativo: editandoPessoa.active,
            limiteProprio: editandoPessoa.normalLimit ?? null,
            usuarioId: editandoPessoa.accounts[0]?.usuarioId ?? null,
          }}
          unidades={empresasParaCadastro}
          onFechar={() => setEditandoPessoa(null)}
          onSalvo={() => { void carregar(); setAviso("Cadastro atualizado."); setTimeout(() => setAviso(null), 2600); }} />
      )}

      {recebendoDe && (
        <FolhaReceber pessoa={recebendoDe} unidades={unidades}
          onFechar={() => setRecebendoDe(null)}
          onOk={(v) => { setRecebendoDe(null); void carregar(); setAviso(`Pagamento de ${formatMarketCurrency(v)} registrado.`); setTimeout(() => setAviso(null), 2600); }} />
      )}

      {detalhe && (
        <PainelPessoa pessoa={detalhe} unidades={unidades} onEditarCadastro={() => { setEditandoPessoa(detalhe); setDetalhe(null); }}
          onFechar={() => setDetalhe(null)}
          onMudou={() => void carregar()}
          onAviso={(m) => { setAviso(m); setTimeout(() => setAviso(null), 2600); }} />
      )}

      {cadastrando && (
        <ModalPessoa pessoa={null} unidades={empresasParaCadastro} unidadePadrao={filtros.profileId ?? undefined}
          onFechar={() => setCadastrando(false)}
          onSalvo={() => { void carregar(); setAviso("Pessoa cadastrada."); setTimeout(() => setAviso(null), 2600); }} />
      )}

      {importando && (
        <ModalImportar unidades={empresasParaCadastro} unidadePadrao={filtros.profileId ?? undefined}
          onFechar={() => setImportando(false)}
          onImportado={(n) => { void carregar(); setAviso(`${n} conta${n === 1 ? "" : "s"} criada${n === 1 ? "" : "s"} — falta dar o código de acesso a quem for usar o tablet.`); setTimeout(() => setAviso(null), 4000); }} />
      )}
    </>
  );
}

// ── Painel da pessoa: TUDO num lugar só ──────────────────────────────────────
// Duas abas: Vendas (o que ela comprou, editável) e Carteira (dívida, receber,
// editar limite/código, cadastros e empresa principal). Nada disso mora mais na
// linha da tabela.

// Qual dos dois baldes de cobrança a tela está olhando. Não confundir com o
// seletor de período do topo (esse escolhe QUAL fatura antiga inspecionar):
// aqui é sempre o calendário de hoje, fechado × mês novo.
function valorDoRecorte(p: { closedUntil?: number; currentMonth?: number; open: number }, recorte: "fechado" | "aberto"): number {
  return recorte === "fechado" ? (p.closedUntil ?? 0) : (p.currentMonth ?? p.open);
}

// ── Folha de receber: um clique na linha, sem passar pelo painel ─────────────
// Por padrão vem o fechado do MÊS ANTERIOR, que é o que a pessoa veio pagar.
// "Mês atual" quita tudo (o pagamento é FIFO no razão: não existe pagar
// setembro devendo agosto) e "Escolher mês" abre a lista de faturas.
type EscolhaPeriodo = "anterior" | "atual" | "mes";

function FolhaReceber({ pessoa, unidades, onFechar, onOk }: {
  pessoa: MarketPerson; unidades: Record<string, string>; onFechar: () => void; onOk: (valor: number) => void;
}) {
  // Quem tem cadastro em mais de uma empresa paga numa carteira por vez: o
  // dinheiro entra na empresa que vendeu. Começa pela que tem mais dívida.
  const contas = useMemo(() => [...pessoa.accounts].filter((c) => c.open > 0).sort((a, b) => b.open - a.open), [pessoa]);
  const [contaId, setContaId] = useState(() => contas[0]?.id ?? pessoa.accounts[0]?.id ?? 0);
  const conta = contas.find((c) => c.id === contaId) ?? contas[0] ?? pessoa.accounts[0];
  const faturas = useMemo(() => conta?.faturas ?? [], [conta]);
  const fechadas = useMemo(() => faturas.filter((f) => !f.aberta), [faturas]);
  const mesFechado = fechadas[fechadas.length - 1]?.mes ?? null;
  const fechadoDaConta = conta ? (conta.closedUntil ?? 0) : 0;

  const [escolha, setEscolha] = useState<EscolhaPeriodo>(() => (fechadoDaConta > 0 ? "anterior" : "atual"));
  const [mesEscolhido, setMesEscolhido] = useState(() => mesFechado ?? faturas[faturas.length - 1]?.mes ?? "");
  const [metodo, setMetodo] = useState("pix");
  const [valorCent, setValorCent] = useState(() => centavosDeReais(fechadoDaConta > 0 ? fechadoDaConta : (conta?.open ?? 0)));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Trocar de carteira ou de período reescreve o valor sugerido; digitar por
  // cima continua valendo (é só a sugestão que muda).
  const valorSugerido = useCallback((e: EscolhaPeriodo, mes: string): number => {
    if (!conta) return 0;
    if (e === "atual") return conta.open;                       // FIFO: quitar tudo
    if (e === "mes" && mes) return valorAteOMes(faturas, mes);
    return conta.closedUntil ?? 0;                              // até o mês passado
  }, [conta, faturas]);

  const escolher = (e: EscolhaPeriodo, mes = mesEscolhido) => {
    setEscolha(e); if (mes !== mesEscolhido) setMesEscolhido(mes);
    setValorCent(centavosDeReais(valorSugerido(e, mes)));
  };
  const trocarConta = (id: number) => {
    setContaId(id);
    const c = contas.find((x) => x.id === id);
    if (c) setValorCent(centavosDeReais(escolha === "atual" ? c.open : (c.closedUntil ?? 0)));
  };

  const valor = reaisDeCentavos(valorCent);
  const registrar = async () => {
    if (!conta || valorCent <= 0 || salvando) return;
    setSalvando(true); setErro(null);
    try {
      await marketRequest("finance", { method: "POST", body: JSON.stringify({ employeeId: conta.id, profileId: conta.profileId, amount: valor, method: metodo }) });
      onOk(valor);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível registrar."); }
    finally { setSalvando(false); }
  };

  const opcoes: Array<{ id: EscolhaPeriodo; label: string; valor: number }> = [
    { id: "anterior", label: "Mês anterior", valor: conta?.closedUntil ?? 0 },
    { id: "atual", label: "Mês atual", valor: conta?.open ?? 0 },
    { id: "mes", label: "Escolher mês", valor: valorSugerido("mes", mesEscolhido) },
  ];

  return (
    <Folha titulo={`Receber de ${pessoa.name}`} onFechar={onFechar} rodape={
      <>
        <Botao onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" onClick={() => void registrar()} carregando={salvando} disabled={valorCent <= 0}>
          {salvando ? "Registrando…" : `Registrar ${formatMarketCurrency(valor)}`}
        </Botao>
      </>
    }>
      {contas.length > 1 && (
        <div style={{ display: "grid", gap: 6 }}>
          <label style={rot}>Carteira</label>
          <GlassSelect value={String(contaId)} onChange={(v) => trocarConta(Number(v))} style={campo}
            options={contas.map((c) => ({ value: String(c.id), label: `${unidades[c.profileId] ?? "Empresa"} · ${formatMarketCurrency(c.open)}` }))} />
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        <label style={rot}>Período</label>
        {/* Três opções, o padrão já selecionado. No celular a fileira rola. */}
        <div className="tab-strip" role="radiogroup" aria-label="Período" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
          {opcoes.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={escolha === o.id} onClick={() => escolher(o.id)}
              style={{
                flex: "none", minHeight: "var(--tap)", padding: "6px 14px", borderRadius: "var(--r-sm)", cursor: "pointer", textAlign: "left",
                border: `1px solid ${escolha === o.id ? INDIGO : "var(--border)"}`,
                background: escolha === o.id ? `color-mix(in srgb, ${INDIGO} 12%, transparent)` : "var(--surface)",
                color: escolha === o.id ? INDIGO : "var(--text-dim)", fontSize: 12.5, fontWeight: 700, lineHeight: 1.25,
              }}>
              <span style={{ display: "block" }}>{o.label}</span>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, opacity: .85, fontVariantNumeric: "tabular-nums" }}>{formatMarketCurrency(o.valor)}</span>
            </button>
          ))}
        </div>
      </div>

      {escolha === "mes" && (
        <div style={{ display: "grid", gap: 6 }}>
          <label style={rot}>Até qual mês</label>
          <GlassSelect value={mesEscolhido} onChange={(v) => escolher("mes", v)} style={campo}
            options={faturas.map((f) => ({ value: f.mes, label: `${f.aberta ? "Este mês" : rotuloMes(f.mes)} · ${formatMarketCurrency(f.valor)}` }))} />
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            O pagamento quita do mês mais antigo pro mais novo, então o mês escolhido leva os anteriores junto.
          </span>
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        <label style={rot}>Valor recebido</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input {...atributosDe("dinheiro")} value={textoDeCentavos(valorCent)} onChange={(e) => setValorCent(centavosDoTexto(e.target.value))}
            inputMode="numeric" placeholder="R$ 0,00" aria-label="Valor recebido"
            style={{ ...campo, flex: 1, minWidth: 150, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }} />
          <GlassSelect value={metodo} onChange={setMetodo} style={{ ...campo, width: 150, flex: "none" }}
            options={METODOS_PAG.map((m) => ({ value: m.valor, label: m.label }))} />
        </div>
        <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
          Dívida total {formatMarketCurrency(conta?.open ?? 0)} · este mês {formatMarketCurrency(conta?.currentMonth ?? 0)}
        </span>
      </div>

      {erro && <span style={{ fontSize: 12, color: "var(--tf-neg)" }}>{erro}</span>}
    </Folha>
  );
}

function PainelPessoa({ pessoa, unidades, onEditarCadastro, onFechar, onMudou, onAviso }: {
  onEditarCadastro: () => void;
  pessoa: MarketPerson;
  unidades: Record<string, string>;
  onFechar: () => void;
  onMudou: () => void;
  onAviso: (m: string) => void;
}) {
  const [aba, setAba] = useState<"vendas" | "carteira">("vendas");
  const [montado, setMontado] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMontado(true), 10); return () => clearTimeout(t); }, []);

  return (
    <div onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 200, display: "flex", justifyContent: "flex-end" }}>
      <aside onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 100%)", height: "100dvh", background: "var(--surface)", borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column", boxShadow: "-16px 0 40px rgba(0,0,0,.18)",
          transform: montado ? "translateX(0)" : "translateX(100%)", transition: "transform .22s cubic-bezier(.4,0,.2,1)",
        }}>
        {/* Cabeçalho — o padding do topo respeita o notch (no computador dá 0). */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "calc(18px + var(--safe-t)) 20px 14px" }}>
          {/* A própria foto abre a edição do cadastro — é onde a pessoa procura
              quando quer trocar a imagem de alguém. */}
          <button onClick={onEditarCadastro} title="Editar cadastro (foto, nome, código)"
            style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", position: "relative", flex: "none" }}>
            <ComSelo selo={{ conteudo: <Icon name="camera" size={11} />, cor: "default", tamanho: "md", posicao: "bottom-right" }}>
              <Avatar name={pessoa.name} url={pessoa.imageUrl} size={46} />
            </ComSelo>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 18, color: "var(--text)", display: "block", letterSpacing: "-.01em" }}>{pessoa.name}</strong>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
              <Icon name="building-warehouse" size={12} color="var(--text-dim)" />
              {unidades[pessoa.mainProfileId] ?? "sem empresa"}
              {pessoa.unified && <Badge tone="info">{pessoa.accounts.length} cadastros</Badge>}
            </span>
          </div>
          <BotaoIcone icone="x" titulo="Fechar" variante="secundario" onClick={onFechar} />
        </div>

        {/* Números. A rede do globals.css já colapsa "1fr 1fr …" numa coluna só
            abaixo de 560px — aqui não precisa de mais nada. */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "center", padding: "0 20px 14px" }}>
          {/* Os dois baldes, na ordem em que se cobra: primeiro o fechado (o
              que a pessoa veio pagar), depois o que é do mês novo. */}
          <Numero rotulo="Até o mês passado" valor={formatMarketCurrency(pessoa.closedUntil ?? 0)} forte tone={(pessoa.closedUntil ?? 0) > 0 ? "warn" : undefined} />
          <Numero rotulo="Este mês" valor={formatMarketCurrency(pessoa.currentMonth ?? 0)} tone={(pessoa.currentMonth ?? 0) > 0 ? TOM[pessoa.status] : undefined} />
          <Numero rotulo="Dívida total" valor={formatMarketCurrency(pessoa.open)} />
          <Numero rotulo="Disponível" valor={formatMarketCurrency(pessoa.available)} />
          <Badge tone={TOM[pessoa.status]}>{marketStatusLabel(pessoa.status)}</Badge>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: 4, padding: "0 20px", borderBottom: "1px solid var(--border)" }}>
          {([["vendas", "Vendas"], ["carteira", "Carteira"]] as [typeof aba, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setAba(k)}
              style={{
                padding: "10px 4px", marginBottom: -1, background: "none", border: "none", cursor: "pointer",
                fontSize: 13.5, fontWeight: 700, color: aba === k ? "var(--text)" : "var(--text-dim)",
                borderBottom: `2px solid ${aba === k ? INDIGO : "transparent"}`, marginRight: 16,
              }}>{label}</button>
          ))}
        </div>

        {/* Conteúdo — o rodapé sobe acima da barra de gestos do iPhone. */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px calc(24px + var(--safe-b))" }}>
          {aba === "vendas"
            ? <VendasPessoa pessoa={pessoa} unidades={unidades} onMudou={onMudou} />
            : <Carteira pessoa={pessoa} unidades={unidades} onMudou={onMudou} onAviso={onAviso} />}
        </div>
      </aside>
    </div>
  );
}

function Numero({ rotulo, valor, forte, tone }: { rotulo: string; valor: string; forte?: boolean; tone?: "pos" | "warn" | "neg" }) {
  const cor = tone === "neg" ? "var(--tf-neg)" : tone === "warn" ? "var(--tf-warn)" : "var(--text)";
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: "var(--text-dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".03em" }}>{rotulo}</div>
      {/* A cor do tom vale mesmo sem `forte`: "meses anteriores" precisa
          gritar em laranja num número pequeno. */}
      <strong style={{ fontSize: forte ? 20 : 15, fontWeight: 800, color: cor, letterSpacing: "-.02em" }}>{valor}</strong>
    </div>
  );
}

// ── Aba Carteira: cada cadastro (empresa) com receber/editar/principal ───────
function Carteira({ pessoa, unidades, onMudou, onAviso }: {
  pessoa: MarketPerson; unidades: Record<string, string>; onMudou: () => void; onAviso: (m: string) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);

  const trocarPrincipal = async (profileId: string | null) => {
    setErro(null);
    try {
      await marketRequest("employees", { method: "POST", body: JSON.stringify({ employeeIds: pessoa.accounts.map((c) => c.id), profileId }) });
      onAviso(profileId ? `${pessoa.name} agora aparece como ${unidades[profileId] ?? "essa empresa"}.` : `${pessoa.name} voltou ao automático.`);
      onMudou();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setErro(/migracao_pendente/.test(msg) ? "Falta rodar supabase/tridimarket-empresa-principal.sql." : (msg || "Não foi possível salvar."));
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {erro && <div style={{ fontSize: 12.5, color: "var(--tf-neg)" }}>{erro}</div>}
      {pessoa.accounts.map((conta) => (
        <CadastroCard key={conta.id} conta={conta} unidade={unidades[conta.profileId] ?? "Empresa"}
          principal={conta.profileId === pessoa.mainProfileId && pessoa.unified}
          podeDefinir={pessoa.unified}
          onDefinirPrincipal={() => trocarPrincipal(conta.profileId)}
          onMudou={onMudou} onAviso={onAviso} />
      ))}
      {!pessoa.accounts.length && <Empty icon="wallet" title="Sem cadastro" />}
    </div>
  );
}

function CadastroCard({ conta, unidade, principal, podeDefinir, onDefinirPrincipal, onMudou, onAviso }: {
  conta: MarketEmployee; unidade: string; principal: boolean; podeDefinir: boolean;
  onDefinirPrincipal: () => void; onMudou: () => void; onAviso: (m: string) => void;
}) {
  const [modo, setModo] = useState<null | "receber" | "editar">(null);
  const [mudandoAtivo, setMudandoAtivo] = useState(false);
  const inativo = !conta.active;

  async function alternarAtivo() {
    setMudandoAtivo(true);
    try {
      await marketRequest("employees", { method: "PATCH", body: JSON.stringify({ id: conta.id, active: inativo }) });
      onAviso(inativo ? "Pessoa reativada." : "Pessoa inativada — o histórico dela continua.");
      onMudou();
    } catch (e) { onAviso(e instanceof Error ? e.message : "Não foi possível mudar."); }
    finally { setMudandoAtivo(false); }
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-2)", opacity: inativo ? 0.65 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
        <Icon name="building-warehouse" size={16} color={principal ? INDIGO : "var(--text-dim)"} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)" }}>{unidade}</span>
            {principal && <Badge tone="info">principal</Badge>}
            {inativo && <Badge tone="neutral">inativo</Badge>}
          </div>
          <span style={{ fontSize: 12, color: "var(--text-dim)" }}>
            {formatMarketCurrency(conta.closedUntil ?? 0)} do mês passado · {formatMarketCurrency(conta.currentMonth ?? 0)} deste mês · limite {formatMarketCurrency(conta.normalLimit)}
          </span>
        </div>
      </div>

      {/* Ações do cadastro */}
      <div style={{ display: "flex", gap: 8, padding: "0 14px 12px", flexWrap: "wrap" }}>
        {conta.open > 0 && (
          <Botao tamanho="sm" icone="cash" aria-pressed={modo === "receber"} onClick={() => setModo(modo === "receber" ? null : "receber")}>Receber</Botao>
        )}
        <Botao tamanho="sm" icone="edit" aria-pressed={modo === "editar"} onClick={() => setModo(modo === "editar" ? null : "editar")}>Editar</Botao>
        {podeDefinir && !principal && (
          <Botao tamanho="sm" icone="star" onClick={onDefinirPrincipal}>Tornar principal</Botao>
        )}
        {/* Inativar, nunca apagar: as compras dela continuam no histórico e na
            dívida — ela só deixa de aparecer no tablet e nas listas. É por isso
            que o botão volta como "Reativar" em vez de sumir. */}
        <Botao tamanho="sm" icone={inativo ? "circle-check" : "ban"} onClick={() => void alternarAtivo()} carregando={mudandoAtivo}>
          {inativo ? "Reativar" : "Inativar"}
        </Botao>
      </div>

      {modo === "receber" && (
        <ReceberInline conta={conta} onFechar={() => setModo(null)}
          onOk={(v) => { onAviso(`Pagamento de ${formatMarketCurrency(v)} registrado.`); setModo(null); onMudou(); }} />
      )}
      {modo === "editar" && (
        <EditarInline conta={conta} onFechar={() => setModo(null)}
          onOk={() => { onAviso("Cadastro atualizado."); setModo(null); onMudou(); }} />
      )}
    </div>
  );
}

const METODOS_PAG = [
  { valor: "pix", label: "Pix" }, { valor: "cash", label: "Dinheiro" },
  { valor: "card", label: "Cartão" }, { valor: "transfer", label: "Transferência" }, { valor: "other", label: "Outro" },
];

// Rótulo curto do mês ("ago/26") pra caber num chip no celular.
function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(ano, m - 1, 1))).replace(".", "");
  return `${nome}/${String(ano).slice(2)}`;
}

function ReceberInline({ conta, onFechar, onOk }: { conta: MarketEmployee; onFechar: () => void; onOk: (valor: number) => void }) {
  // As pessoas pagam em setembro a fatura de AGOSTO. Por isso o valor nasce
  // com as faturas fechadas, e não com a dívida inteira — misturar o que já
  // foi comprado este mês fazia o gestor perder o controle de quem pagou o
  // quê. Escolher um mês leva os anteriores junto: o pagamento é FIFO, então
  // não existe quitar agosto e deixar julho.
  const faturas = useMemo(() => conta.faturas ?? [{ mes: new Date().toISOString().slice(0, 7), valor: conta.open, aberta: true }], [conta]);
  const [ateMes, setAteMes] = useState(() => mesPadraoDaBaixa(faturas));
  const [valorCent, setValorCent] = useState(() => centavosDeReais(valorAteOMes(faturas, mesPadraoDaBaixa(faturas))));
  const [metodo, setMetodo] = useState("pix");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const valor = reaisDeCentavos(valorCent);
  const escolherMes = (mes: string) => { setAteMes(mes); setValorCent(centavosDeReais(valorAteOMes(faturas, mes))); };
  const registrar = async () => {
    if (valorCent <= 0 || salvando) return;
    setSalvando(true); setErro(null);
    try {
      await marketRequest("finance", { method: "POST", body: JSON.stringify({ employeeId: conta.id, profileId: conta.profileId, amount: valor, method: metodo }) });
      onOk(valor);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível registrar."); }
    finally { setSalvando(false); }
  };
  const ultimoMes = faturas[faturas.length - 1]?.mes;
  return (
    <div style={{ padding: "0 14px 14px", display: "grid", gap: 8 }}>
      {/* Fatura por mês: chip mais antigo à esquerda, o mês aberto por último.
          Selecionado = este mês e os anteriores. A fileira rola de lado no
          celular quando não cabe. */}
      <div className="tab-strip" role="radiogroup" aria-label="Fatura" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {faturas.map((f) => {
          const ativo = f.mes <= ateMes;
          const atual = f.mes === ateMes;
          return (
            <button key={f.mes} type="button" role="radio" aria-checked={atual} onClick={() => escolherMes(f.mes)}
              style={{
                flex: "none", minHeight: "var(--tap)", padding: "6px 12px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${ativo ? INDIGO : "var(--border)"}`,
                background: ativo ? "color-mix(in srgb, " + INDIGO + " 12%, transparent)" : "var(--surface)",
                color: ativo ? INDIGO : "var(--text-dim)", fontSize: 12, fontWeight: 700, lineHeight: 1.2, textAlign: "left",
              }}>
              <span style={{ display: "block" }}>{f.aberta ? "Este mês" : rotuloMes(f.mes)}</span>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums", opacity: .85 }}>{formatMarketCurrency(f.valor)}</span>
            </button>
          );
        })}
      </div>
      {/* Valor e método na mesma linha só enquanto couberem: no celular o campo
          de valor sozinho já ocupa a largura útil e o método desce. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input {...atributosDe("dinheiro")} value={textoDeCentavos(valorCent)} onChange={(e) => setValorCent(centavosDoTexto(e.target.value))}
          inputMode="numeric" placeholder="R$ 0,00" style={{ ...campo, flex: 1, minWidth: 150, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }} />
        <GlassSelect value={metodo} onChange={setMetodo} style={{ ...campo, width: 140, flex: "none" }}
          options={METODOS_PAG.map((m) => ({ value: m.valor, label: m.label }))} />
      </div>
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
        {ateMes === ultimoMes ? "Quitando tudo, incluindo o que foi comprado este mês." : `Até ${rotuloMes(ateMes)}: quita do mês mais antigo pro mais novo.`}
      </span>
      {erro && <span style={{ fontSize: 12, color: "var(--tf-neg)" }}>{erro}</span>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
        {ultimoMes && ateMes !== ultimoMes && (
          <button onClick={() => escolherMes(ultimoMes)} style={{ background: "none", border: "none", cursor: "pointer", color: INDIGO, fontWeight: 700, fontSize: 12, minHeight: "var(--tap)" }}>Quitar tudo</button>
        )}
        <Botao tamanho="sm" onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" tamanho="sm" onClick={registrar} carregando={salvando} disabled={valorCent <= 0}>Registrar</Botao>
      </div>
    </div>
  );
}

function EditarInline({ conta, onFechar, onOk }: { conta: MarketEmployee; onFechar: () => void; onOk: () => void }) {
  // Reais inteiros: limite é 50/100/500, não R$ 137,42. Ver moeda.ts.
  const [limiteReais, setLimiteReais] = useState(Math.round(conta.normalLimit));
  const [codigo, setCodigo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const salvar = async () => {
    setSalvando(true); setErro(null); setTentativa((n) => n + 1);
    try {
      await marketRequest("employees", { method: "PATCH", body: JSON.stringify({ id: conta.id, normalLimit: limiteReais, ...(codigo ? { pin: codigo } : {}) }) });
      onOk();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setErro(/codigo_em_uso/.test(msg) ? "Esse código já está em uso." : (msg || "Não foi possível salvar."));
    } finally { setSalvando(false); }
  };
  return (
    <div style={{ padding: "0 14px 14px", display: "grid", gap: 8 }}>
      <label style={rot}>Limite normal</label>
      <input {...atributosDe("dinheiro")} value={textoDeReaisInteiros(limiteReais)} onChange={(e) => setLimiteReais(reaisInteirosDoTexto(e.target.value))}
        inputMode="numeric" placeholder="R$ 500" style={{ ...campo, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }} />
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Em reais inteiros — digite 500 pra R$ 500.</span>
      <label style={rot}>Novo código de acesso (opcional)</label>
      <CampoOTP length={6} tipo="numeros" valor={codigo} aoMudar={setCodigo}
        estado={erro ? "erro" : "ocioso"} sinal={tentativa} />
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Seis números, um por casa. É o mesmo código que a pessoa usa em qualquer tablet — trocar aqui troca em todo lugar.</span>
      {erro && <span style={{ fontSize: 12, color: "var(--tf-neg)" }}>{erro}</span>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Botao tamanho="sm" onClick={onFechar}>Cancelar</Botao>
        <Botao variante="primario" tamanho="sm" onClick={salvar} carregando={salvando}>Salvar</Botao>
      </div>
    </div>
  );
}

// ── Aba Vendas: tudo que a pessoa comprou no período (editável) ──────────────
type ItemVenda = { productId: number | null; name: string; imageUrl: string | null; quantity: number; total: number; unitPrice: number; rowIds: number[] };
type VendaPessoa = { id: number; at: string; paid: boolean; employeeId: number; unitName: string | null; items: ItemVenda[]; total: number };
type Periodo = "mes" | "90" | "tudo";

function intervaloDe(p: Periodo): { from: string; to: string } {
  const agora = new Date();
  const to = agora.toISOString();
  if (p === "mes") return { from: new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString(), to };
  if (p === "90") return { from: new Date(Date.now() - 90 * 86_400_000).toISOString(), to };
  return { from: new Date(2000, 0, 1).toISOString(), to };
}

function VendasPessoa({ pessoa, unidades, onMudou }: { pessoa: MarketPerson; unidades: Record<string, string>; onMudou: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [vendas, setVendas] = useState<VendaPessoa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [movendo, setMovendo] = useState<VendaPessoa | null>(null);

  const query = useMemo(() => {
    const { from, to } = intervaloDe(periodo);
    const emp = pessoa.accounts.map((c) => `employeeId=${c.id}`).join("&");
    return `vendas?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&${emp}`;
  }, [periodo, pessoa]);

  const carregar = useCallback(async () => {
    setErro(null);
    try { const d = await marketRequest<{ vendas: VendaPessoa[] }>(query); setVendas(d.vendas); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível carregar as vendas."); }
  }, [query]);
  useEffect(() => { setVendas(null); void carregar(); }, [carregar]);

  const total = (vendas ?? []).reduce((s, v) => s + v.total, 0);

  const agir = async (vendaId: number, fn: () => Promise<unknown>) => {
    setOcupado(vendaId); setErro(null);
    try { await fn(); await carregar(); onMudou(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível concluir."); }
    finally { setOcupado(null); setConfirmar(null); }
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([["mes", "Mês atual"], ["90", "90 dias"], ["tudo", "Tudo"]] as [Periodo, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setPeriodo(k)}
              style={{
                padding: "6px 11px", borderRadius: "var(--r-xs)", fontSize: 12, fontWeight: 700, cursor: "pointer",
                border: `1px solid ${periodo === k ? INDIGO : "var(--border)"}`,
                background: periodo === k ? `color-mix(in srgb, ${INDIGO} 12%, transparent)` : "var(--surface-2)",
                color: periodo === k ? INDIGO : "var(--text-dim)",
              }}>{label}</button>
          ))}
        </div>
        {vendas && <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Gastou <strong style={{ color: "var(--text)" }}>{formatMarketCurrency(total)}</strong></span>}
      </div>

      {erro && <div style={{ fontSize: 12.5, color: "var(--tf-neg)", marginBottom: 10 }}>{erro}</div>}

      <div style={{ display: "grid", gap: 10 }}>
        {!vendas ? <div style={{ padding: 24, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Carregando…</div>
          : vendas.length === 0 ? <Empty icon="shopping-cart" title="Nenhuma venda no período" text="Troque o período acima." />
          : vendas.map((v) => (
            <VendaCard key={v.id} venda={v} unidade={unidades[String(v.employeeId)] ?? v.unitName}
              ocupado={ocupado === v.id} confirmando={confirmar === v.id}
              onPago={() => agir(v.id, () => marketRequest("vendas", { method: "PATCH", body: JSON.stringify({ id: v.id, paid: !v.paid }) }))}
              onExcluir={() => confirmar === v.id ? agir(v.id, () => marketRequest(`vendas?id=${v.id}`, { method: "DELETE" })) : setConfirmar(v.id)}
              onCancelarExcluir={() => setConfirmar(null)}
              onMover={() => setMovendo(v)}
              onItemQtd={(it, q) => agir(v.id, () => marketRequest("vendas/edit", { method: "POST", body: JSON.stringify({ action: "setQty", vendaId: v.id, produtoId: it.productId, unitPrice: it.unitPrice, quantity: q, rowIds: it.rowIds }) }))}
              onItemRemover={(it) => agir(v.id, () => marketRequest("vendas/edit", { method: "POST", body: JSON.stringify({ action: "removeItem", vendaId: v.id, rowIds: it.rowIds }) }))}
            />
          ))}
      </div>

      {movendo && (
        <SeletorMover atual={pessoa} unidades={unidades}
          onFechar={() => setMovendo(null)}
          onMover={async (toEmployeeId) => { const venda = movendo; setMovendo(null); await agir(venda.id, () => marketRequest("vendas/edit", { method: "POST", body: JSON.stringify({ action: "move", vendaId: venda.id, toEmployeeId }) })); }} />
      )}
    </div>
  );
}

function VendaCard({ venda, unidade, ocupado, confirmando, onPago, onExcluir, onCancelarExcluir, onMover, onItemQtd, onItemRemover }: {
  venda: VendaPessoa; unidade: string | null; ocupado: boolean; confirmando: boolean;
  onPago: () => void; onExcluir: () => void; onCancelarExcluir: () => void; onMover: () => void;
  onItemQtd: (it: ItemVenda, q: number) => void; onItemRemover: (it: ItemVenda) => void;
}) {
  const data = new Date(venda.at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  const hora = new Date(venda.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-md)", background: "var(--surface-2)", opacity: ocupado ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 130 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}>{data} · {hora}</span>
          {unidade && <span style={{ fontSize: 11.5, color: "var(--text-dim)", marginLeft: 8 }}>{unidade}</span>}
        </div>
        <Badge tone={venda.paid ? "pos" : "warn"}>{venda.paid ? "Pago" : "Em aberto"}</Badge>
        <strong style={{ fontSize: 14, fontWeight: 800, color: INDIGO }}>{formatMarketCurrency(venda.total)}</strong>
      </div>

      <div style={{ padding: "6px 13px" }}>
        {venda.items.map((it, i) => (
          // No celular os três botões (−, +, lixeira) crescem pros 44px de toque
          // e sobrariam ~2px pro nome do produto: por isso a linha quebra e o
          // nome fica sozinho em cima. No computador tudo cabe e nada muda.
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderTop: i ? "1px solid var(--border)" : "none", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 120, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {/* NÃO desabilitar no 1. Já tentei "proteger" a venda travando o
                  botão aí, e o resultado foi um "−" que não responde a clique
                  nenhum na maioria das linhas — que é exatamente o defeito que
                  eu estava consertando. No 1, diminuir TIRA o item, igual à
                  lixeira ao lado. Botão que existe tem que responder. */}
              <BotaoIcone icone="minus" titulo={it.quantity <= 1 ? "Tirar este item" : "Menos um"} variante="secundario" tamanho="sm" disabled={ocupado}
                onClick={() => (it.quantity <= 1 ? onItemRemover(it) : onItemQtd(it, it.quantity - 1))} />
              <span style={{ minWidth: 22, textAlign: "center", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{it.quantity}</span>
              <BotaoIcone icone="plus" titulo="Mais um" variante="secundario" tamanho="sm" disabled={ocupado} onClick={() => onItemQtd(it, it.quantity + 1)} />
            </div>
            <span style={{ width: 74, textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{formatMarketCurrency(it.total)}</span>
            <BotaoIcone icone="trash" titulo="Tirar este item" variante="perigo" tamanho="sm" disabled={ocupado} onClick={() => onItemRemover(it)} />
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 13px", borderTop: "1px solid var(--border)" }}>
        <Botao tamanho="sm" icone={venda.paid ? "refresh" : "check"} disabled={ocupado} onClick={onPago}>{venda.paid ? "Reabrir" : "Marcar pago"}</Botao>
        <Botao tamanho="sm" icone="arrows-split" disabled={ocupado} onClick={onMover}>Mover</Botao>
        <span style={{ flex: 1 }} />
        {confirmando ? (
          <>
            <Botao tamanho="sm" disabled={ocupado} onClick={onCancelarExcluir}>Cancelar</Botao>
            <Botao variante="perigo" tamanho="sm" disabled={ocupado} onClick={onExcluir}>Confirmar exclusão</Botao>
          </>
        ) : (
          <Botao variante="perigo" tamanho="sm" icone="trash" disabled={ocupado} onClick={onExcluir}>Excluir venda</Botao>
        )}
      </div>
    </div>
  );
}

function SeletorMover({ atual, unidades, onFechar, onMover }: {
  atual: MarketPerson; unidades: Record<string, string>;
  onFechar: () => void; onMover: (toEmployeeId: number) => void;
}) {
  const [lista, setLista] = useState<MarketEmployee[] | null>(null);
  const [busca, setBusca] = useState("");
  useEffect(() => { void marketRequest<MarketEmployee[]>("employees?porCadastro=1").then(setLista).catch(() => setLista([])); }, []);
  const proprios = new Set(atual.accounts.map((c) => c.id));
  const visiveis = (lista ?? []).filter((c) => c.name.toLowerCase().includes(busca.toLowerCase())).filter((c) => !proprios.has(c.id)).slice(0, 40);
  return (
    <div onClick={onFechar} className="sheet-host" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", zIndex: 210, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="sheet" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", width: "min(440px, 100%)", maxHeight: "80dvh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 18px 10px" }}>
          <strong style={{ fontSize: 15, color: "var(--text)" }}>Mover venda para…</strong>
          <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "4px 0 10px" }}>A venda sai de {atual.name} e entra na dívida de quem você escolher.</p>
          <input {...atributosDe("busca")} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa" autoFocus style={{ ...campo, background: "var(--surface-2)" }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 10px 12px" }}>
          {!lista ? <div style={{ padding: 20, textAlign: "center", color: "var(--text-dim)", fontSize: 13 }}>Carregando…</div>
            : visiveis.map((c) => (
              <button key={c.id} onClick={() => onMover(c.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 10px", borderRadius: "var(--r-sm)", border: "none", background: "none", cursor: "pointer", color: "var(--text)" }}>
                <Avatar name={c.name} url={c.imageUrl} size={28} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 650 }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{unidades[c.profileId] ?? "Empresa"}</span>
                </span>
              </button>
            ))}
        </div>
        <div style={{ padding: "10px 18px", borderTop: "1px solid var(--border)", textAlign: "right" }}>
          <Botao onClick={onFechar}>Cancelar</Botao>
        </div>
      </div>
    </div>
  );
}

export function Busca({ valor, onChange, placeholder }: { valor: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 380 }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
        <Icon name="search" size={16} color="var(--text-dim)" />
      </span>
      <input value={valor} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ ...campo, paddingLeft: 36, background: "var(--surface)" }} />
    </div>
  );
}

const campo: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text)", fontSize: 14,
};
const rot: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-dim)" };
