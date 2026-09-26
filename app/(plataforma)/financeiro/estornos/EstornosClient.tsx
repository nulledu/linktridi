"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "../../Toast";
import { Alternativas, Barras, BotaoApagar, BotaoFin, Cabecalho, Cartao, Escolha, Filtro, Filtros, LimparFiltros, LinhaKpi, Marca, ModalFormulario, Selo, SeletorEmpresa, SoLeitura, Tabela, TituloCartao, Vazio, moeda, FaixaDePaineis } from "../ui";
import { ColunasPorEmpresa, KpiSeta } from "../blocos";
import { dataBR, fatias } from "@/lib/financeiro/calculos";
import {
  ESTORNO_STATUS, ESTORNO_TIPOS, LABEL_ESTORNO_TIPO, SELO_ESTORNO,
  type Estorno, type EstornoStatus, type EstornoTipo,
} from "@/lib/financeiro/tipos";

// ── Campos (o mesmo vocabulário visual das irmãs) ────────────────────────────

const CAIXA: React.CSSProperties = {
  width: "100%", minWidth: 0, minHeight: "var(--tap)", padding: "0 12px",
  borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text)", fontSize: 14, outline: "none",
};

function Campo({ rotulo, largo, erro, children }: {
  rotulo: string; largo?: boolean;
  /** Erro EMBAIXO do campo, não no fim do formulário — a pessoa vê onde errou. */
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className="ui-campo"
      data-erro={erro ? "1" : undefined}
      style={{ display: "grid", gap: 6, gridColumn: largo ? "1 / -1" : undefined, minWidth: 0 }}
    >
      <span style={{ fontSize: 12.5, fontWeight: 600, color: erro ? "var(--perigo)" : "var(--text-dim)" }}>{rotulo}</span>
      {children}
      {erro && <span role="alert" style={{ fontSize: 12, fontWeight: 600, color: "var(--perigo)" }}>{erro}</span>}
    </label>
  );
}

/** Grupo de botões NÃO mora em `<label>`: clicar no rótulo acionaria o primeiro botão. */
function Grupo({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0, gridColumn: largo ? "1 / -1" : undefined }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-dim)" }}>{rotulo}</span>
      {children}
    </div>
  );
}

// ── O caso em edição ─────────────────────────────────────────────────────────

interface Rascunho {
  id: string | null;
  empresa_id: string;
  tipo: EstornoTipo;
  status: EstornoStatus;
  referencia: string;
  cliente: string;
  motivo: string;
  observacao: string;
  conta_id: string;
  valor: string;
  aberto_em: string;
  resolvido_em: string;
}

/**
 * Os motivos que a operação já conhece. Lista de PARTIDA, não gaiola: o campo
 * aceita criar um motivo novo na hora — obrigar "Outro" e um campo à parte
 * seria burocracia para o caso mais comum de todos, o inesperado.
 */
const MOTIVOS = [
  "Arrependimento",
  "Produto não recebido",
  "Produto com defeito",
  "Não reconhece a compra",
  "Cobrança duplicada",
  "Endereço errado",
];

export function EstornosClient({
  empresas, empresaId, empresaNome, casos, contas, logosContas, hoje, podeEscrever, schemaPendente,
}: {
  empresas: { id: string; nome: string }[];
  empresaId: string;
  empresaNome: string;
  casos: Estorno[];
  contas: { id: string; empresa_id: string; nome: string; icone: string | null }[];
  logosContas: Record<string, string>;
  hoje: string;
  podeEscrever: boolean;
  schemaPendente: boolean;
}) {
  const router = useRouter();

  // ── Filtros ────────────────────────────────────────────────────────────────
  const [statusFiltro, setStatusFiltro] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const filtrados = useMemo(
    () => casos.filter((c) =>
      (!statusFiltro || c.status === statusFiltro) && (!tipoFiltro || c.tipo === tipoFiltro)),
    [casos, statusFiltro, tipoFiltro]);
  const temFiltro = !!(statusFiltro || tipoFiltro);

  // ── A manchete: risco AGORA, resultado do MÊS ─────────────────────────────
  const mes = hoje.slice(0, 7);
  const emDisputa = casos.filter((c) => c.status === "em_disputa");
  const doMes = (status: EstornoStatus) =>
    casos.filter((c) => c.status === status && (c.resolvido_em ?? "").startsWith(mes));
  const soma = (lista: Estorno[]) => lista.reduce((s, c) => s + c.valor, 0);
  const devolvidoMes = doMes("devolvido");
  const perdidoMes = doMes("perdido");
  const ganhoMes = doMes("ganho");

  // ── As duas leituras ao lado da lista ─────────────────────────────────────
  // Tinta MONO (--graf-1): motivo e mês são rótulos dinâmicos, sem paleta
  // própria — e a pergunta das barras é "qual é a maior", que o comprimento
  // responde sozinho. Cor por fatia aqui seria decoração disputando atenção.
  const porMotivo = useMemo(
    () => fatias(filtrados, (c) => c.motivo ?? "", (c) => c.valor,
      (id) => ({ label: id === "outros" || !id ? "Sem motivo" : id, cor: "var(--graf-1)" })),
    [filtrados]);

  // Os últimos 6 meses POR ABERTURA: "está piorando?" se responde por quando
  // o caso surgiu, não por quando alguém achou tempo de resolver.
  const porMes = useMemo(() => {
    const chaves: string[] = [];
    const [anoHoje, mesHoje] = hoje.slice(0, 7).split("-").map(Number);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.UTC(anoHoje, mesHoje - 1 - i, 1));
      chaves.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    }
    const soma = new Map(chaves.map((k) => [k, 0]));
    for (const c of filtrados) {
      const k = c.aberto_em.slice(0, 7);
      if (soma.has(k)) soma.set(k, (soma.get(k) ?? 0) + c.valor);
    }
    const maior = Math.max(1, ...soma.values());
    const nomeDoMes = (k: string) =>
      new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
        .format(new Date(`${k}-15T00:00:00Z`)).replace(".", "");
    return chaves.map((k) => ({
      id: k, label: nomeDoMes(k), cor: "var(--graf-1)",
      valor: soma.get(k) ?? 0, proporcao: (soma.get(k) ?? 0) / maior,
    }));
  }, [filtrados, hoje]);
  const teveCaso = porMes.some((m) => m.valor > 0);

  // ── Cadastro ───────────────────────────────────────────────────────────────
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erros, setErros] = useState<{ referencia?: string; valor?: string; empresa?: string }>({});
  const [salvando, setSalvando] = useState(false);
  // Motivos criados na sessão, para o Escolha continuar mostrando o texto novo.
  const [motivosExtras, setMotivosExtras] = useState<string[]>([]);

  const novo = (): Rascunho => ({
    id: null, empresa_id: empresaId, tipo: "chargeback", status: "em_disputa",
    referencia: "", cliente: "", motivo: "", observacao: "", conta_id: "",
    valor: "", aberto_em: hoje, resolvido_em: "",
  });
  const doCaso = (c: Estorno): Rascunho => ({
    id: c.id, empresa_id: c.empresa_id, tipo: (c.tipo as EstornoTipo) || "estorno",
    status: (c.status as EstornoStatus) || "em_disputa",
    referencia: c.referencia, cliente: c.cliente ?? "", motivo: c.motivo ?? "",
    observacao: c.observacao ?? "", conta_id: c.conta_id ?? "",
    valor: c.valor ? String(c.valor) : "", aberto_em: c.aberto_em,
    resolvido_em: c.resolvido_em ?? "",
  });

  const contasDoFormulario = contas.filter((c) => c.empresa_id === (rascunho?.empresa_id || empresaId));
  const motivos = useMemo(() => {
    const todos = [...MOTIVOS, ...motivosExtras];
    // O motivo gravado SEMPRE aparece, mesmo vindo de outra sessão.
    for (const c of casos) if (c.motivo && !todos.includes(c.motivo)) todos.push(c.motivo);
    return todos;
  }, [casos, motivosExtras]);

  async function salvar() {
    if (!rascunho || salvando) return;
    // Validação NO CAMPO, não num aviso genérico no rodapé.
    const pendentes: typeof erros = {};
    if (!rascunho.referencia.trim()) pendentes.referencia = "Diga o pedido ou a venda do estorno.";
    const valor = Number(rascunho.valor.replace(/\./g, "").replace(",", ".")) || Number(rascunho.valor) || 0;
    if (valor <= 0) pendentes.valor = "O valor precisa ser maior que zero.";
    if (!rascunho.empresa_id) pendentes.empresa = "Escolha a empresa.";
    setErros(pendentes);
    if (Object.keys(pendentes).length) return;

    setSalvando(true);
    try {
      const r = await fetch("/api/financeiro/estornos", {
        method: rascunho.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(rascunho.id ? { id: rascunho.id } : { empresa_id: rascunho.empresa_id }),
          tipo: rascunho.tipo, status: rascunho.status,
          referencia: rascunho.referencia.trim(), cliente: rascunho.cliente.trim() || null,
          motivo: rascunho.motivo || null, observacao: rascunho.observacao.trim() || null,
          conta_id: rascunho.conta_id || null, valor,
          aberto_em: rascunho.aberto_em, resolvido_em: rascunho.resolvido_em || null,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) { toast.erro(d.erro ?? "Não deu para salvar o estorno."); return; }
      toast.ok(rascunho.id ? "Estorno atualizado." : "Estorno registrado.");
      setRascunho(null);
      router.refresh();
    } catch {
      toast.erro("Sem resposta do servidor.");
    } finally {
      setSalvando(false);
    }
  }

  const caseFechado = rascunho && rascunho.status !== "em_disputa";

  return (
    <>
      <Cabecalho
        titulo="Estornos"
        sub="Chargebacks e devoluções: onde dói e quanto voltou."
        acoes={podeEscrever
          ? <BotaoFin primario icone="arrow-back-up" onClick={() => { setErros({}); setRascunho(novo()); }}>Registrar estorno</BotaoFin>
          : undefined}
      />

      {schemaPendente && (
        <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--atencao-texto, var(--text-dim))" }}>
          Falta rodar <code>supabase/financeiro_estornos.sql</code> — a tela abre, mas nada pode ser gravado ainda.
        </p>
      )}

      <LinhaKpi>
        <KpiSeta
          icone="alert-triangle"
          rotulo="Em disputa agora"
          valor={moeda(soma(emDisputa))}
          tom={emDisputa.length ? "atencao" : "ok"}
          detalhe={emDisputa.length ? `${emDisputa.length} caso${emDisputa.length > 1 ? "s" : ""} aberto${emDisputa.length > 1 ? "s" : ""}` : "nenhum caso aberto"}
          aoAbrir={emDisputa.length ? () => setStatusFiltro("aberto") : undefined}
          tituloDaSeta="Ver os casos abertos"
        />
        <KpiSeta
          icone="arrow-back-up"
          rotulo="Devolvido no mês"
          valor={moeda(soma(devolvidoMes))}
          detalhe={`${devolvidoMes.length} reembolso${devolvidoMes.length === 1 ? "" : "s"}`}
          aoAbrir={() => setStatusFiltro("devolvido")}
          tituloDaSeta="Ver o que foi devolvido"
        />
        <KpiSeta
          icone="shield-check"
          rotulo="Recuperado no mês"
          valor={moeda(soma(ganhoMes))}
          tom="ok"
          detalhe={`${ganhoMes.length} disputa${ganhoMes.length === 1 ? "" : "s"} ganha${ganhoMes.length === 1 ? "" : "s"}`}
          aoAbrir={() => setStatusFiltro("ganho")}
          tituloDaSeta="Ver as disputas ganhas"
        />
        <KpiSeta
          icone="alert-triangle"
          rotulo="Perdido no mês"
          valor={moeda(soma(perdidoMes))}
          tom={perdidoMes.length ? "perigo" : "ok"}
          detalhe={`${perdidoMes.length} caso${perdidoMes.length === 1 ? "" : "s"}`}
          aoAbrir={perdidoMes.length ? () => setStatusFiltro("perdido") : undefined}
          tituloDaSeta="Ver os casos perdidos"
        />
      </LinhaKpi>

      {/* Os painéis em CIMA, na horizontal: a lista fica com a largura toda
          e, em Visão geral, vira uma coluna por empresa. */}
      <FaixaDePaineis>
      <Cartao>
        <TituloCartao icone="chart-bar">Onde dói</TituloCartao>
        <Barras
          fatias={porMotivo}
          vazio={
            <Vazio compacto icone="chart-bar" titulo="Sem motivos ainda"
              detalhe="Registre o motivo em cada caso e o padrão aparece aqui." />
          }
        />
        <p style={{ margin: "14px 0 22px", fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
          Segue o filtro ao lado. A barra é proporcional ao maior motivo — é o
          motivo campeão que diz onde a operação sangra.
        </p>

        <TituloCartao icone="chart-bar">Últimos 6 meses</TituloCartao>
        {teveCaso ? (
          <Barras fatias={porMes} />
        ) : (
          <Vazio compacto icone="chart-bar" titulo="Nenhum caso no semestre"
            detalhe="A curva dos meses aparece com o primeiro registro." />
        )}
        <p style={{ marginTop: 14, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
          Pelo mês de ABERTURA do caso — "está piorando?" se responde por quando
          o problema surgiu, não por quando deu tempo de resolver.
        </p>
      </Cartao>
      </FaixaDePaineis>

      <Cartao>
        <TituloCartao icone="arrow-back-up">Casos de {empresaNome} — clique para editar ou resolver</TituloCartao>
        <Filtros>
          <Filtro rotulo="Situação" valor={statusFiltro} aoMudar={setStatusFiltro}
            opcoes={ESTORNO_STATUS.map((s) => ({ valor: s, label: SELO_ESTORNO[s].label }))} />
          <Filtro rotulo="Tipo" valor={tipoFiltro} aoMudar={setTipoFiltro}
            opcoes={ESTORNO_TIPOS.map((t) => ({ valor: t, label: LABEL_ESTORNO_TIPO[t] }))} />
          <LimparFiltros ativo={temFiltro} aoLimpar={() => { setStatusFiltro(""); setTipoFiltro(""); }} />
        </Filtros>

        <ColunasPorEmpresa linhas={filtrados} empresas={empresas} empresaId={empresaId} empresaNome={empresaNome} rotulo={{ um: "caso", muitos: "casos" }}>
          {(l) => (
            <Tabela<Estorno>
              linhas={l}
              chaveDe={(c) => c.id}
              paginar={15}
              rotuloItem="estornos"
              aoClicar={(c) => { setErros({}); setRascunho(doCaso(c)); }}
              vazio={
                <Vazio
                  icone="arrow-back-up"
                  titulo={temFiltro ? "Nada com esses filtros" : "Nenhum estorno registrado"}
                  detalhe={temFiltro
                    ? "Limpe os filtros para ver todos os casos."
                    : "Quando um cliente pedir reembolso ou abrir uma contestação, registre aqui para acompanhar até o fim."}
                />
              }
              colunas={[
                // SEM rolagem lateral aqui — pedido literal. Em vez de esconder
                // colunas atrás de scroll, a linha empilha: data · tipo · cliente
                // viram o subtítulo da referência, e o motivo já tem casa no
                // gráfico "Onde dói" e na ficha.
                { chave: "referencia", label: "Referência", titulo: true, largura: "minmax(min(100%, 150px), 1.6fr)",
                  celula: (c) => (
                    <span style={{ display: "grid", minWidth: 0 }}>
                      <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.referencia}</strong>
                      <span style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {dataBR(c.aberto_em)} · {LABEL_ESTORNO_TIPO[c.tipo as EstornoTipo] ?? c.tipo}{c.cliente ? ` — ${c.cliente}` : ""}
                      </span>
                    </span>
                  ) },
                { chave: "conta", label: "Por onde", largura: "minmax(min(100%, 112px), 1fr)",
                  celula: (c) => {
                    const conta = c.conta_id ? contas.find((x) => x.id === c.conta_id) : null;
                    return conta
                      ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                          <Marca marca={{ nome: conta.nome, logo: logosContas[conta.id] ?? null, icone: conta.icone ?? "wallet" }} tamanho={22} raio={6} />
                          <span style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conta.nome}</span>
                        </span>
                      )
                      : <span style={{ color: "var(--text-dim)" }}>—</span>;
                  } },
                { chave: "valor", label: "Valor", fim: true, largura: "minmax(min(100%, 96px), .7fr)",
                  celula: (c) => <strong style={{ fontVariantNumeric: "tabular-nums" }}>{moeda(c.valor)}</strong> },
                { chave: "status", label: "Situação", fim: true, largura: "minmax(min(100%, 104px), .7fr)",
                  celula: (c) => <Selo selo={SELO_ESTORNO[c.status as EstornoStatus] ?? { label: c.status, cor: "var(--neutro)" }} /> },
              ]}
            />
          )}
        </ColunasPorEmpresa>
      </Cartao>

      {rascunho && (
        <ModalFormulario
          icone="arrow-back-up"
          titulo={rascunho.id ? "Editar estorno" : "Registrar estorno"}
          subtitulo="Registro e acompanhamento — a baixa no caixa continua no extrato da conta."
          aoFechar={() => setRascunho(null)}
          rodape={
            <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
              {rascunho.id && podeEscrever && (
                <BotaoApagar
                  tipo="estorno" id={rascunho.id} nome={rascunho.referencia}
                  aoApagar={() => { setRascunho(null); router.refresh(); }}
                />
              )}
              <span style={{ flex: 1 }} />
              <BotaoFin onClick={() => setRascunho(null)}>{podeEscrever ? "Cancelar" : "Fechar"}</BotaoFin>
              {podeEscrever && (
                <BotaoFin primario icone="check" onClick={() => void salvar()}>
                  {salvando ? "Salvando…" : rascunho.id ? "Salvar" : "Registrar"}
                </BotaoFin>
              )}
            </div>
          }
        >
          <SoLeitura ativo={!podeEscrever} motivo="Você pode ver os estornos, mas registrar e resolver pede a permissão de compromissos.">
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}>
            {!empresaId && empresas.length > 0 && !rascunho.id && (
              <Campo rotulo="Empresa" largo erro={erros.empresa}>
                <SeletorEmpresa empresas={empresas} valor={rascunho.empresa_id}
                  aoMudar={(v) => setRascunho({ ...rascunho, empresa_id: v, conta_id: "" })} />
              </Campo>
            )}

            <Grupo rotulo="Tipo" largo>
              <Alternativas
                valor={rascunho.tipo}
                aoEscolher={(v) => setRascunho({ ...rascunho, tipo: v as EstornoTipo })}
                opcoes={ESTORNO_TIPOS.map((t) => ({ id: t, label: LABEL_ESTORNO_TIPO[t] }))}
              />
            </Grupo>

            <Campo rotulo="Referência (pedido ou venda)" erro={erros.referencia}>
              <input
                value={rascunho.referencia}
                onChange={(e) => { setRascunho({ ...rascunho, referencia: e.target.value }); if (erros.referencia) setErros({ ...erros, referencia: undefined }); }}
                placeholder="Ex.: pedido 8412"
                style={CAIXA}
              />
            </Campo>
            <Campo rotulo="Cliente">
              <input
                value={rascunho.cliente}
                onChange={(e) => setRascunho({ ...rascunho, cliente: e.target.value })}
                placeholder="Quem pediu ou contestou"
                style={CAIXA}
              />
            </Campo>

            <Campo rotulo="Valor (R$)" erro={erros.valor}>
              <input
                inputMode="decimal"
                value={rascunho.valor}
                onChange={(e) => { setRascunho({ ...rascunho, valor: e.target.value }); if (erros.valor) setErros({ ...erros, valor: undefined }); }}
                placeholder="0,00"
                style={CAIXA}
              />
            </Campo>
            <Campo rotulo="Aberto em">
              <input
                type="date" value={rascunho.aberto_em}
                onChange={(e) => setRascunho({ ...rascunho, aberto_em: e.target.value })}
                style={CAIXA}
              />
            </Campo>

            <Campo rotulo="Por onde (banco ou gateway)">
              <Escolha
                valor={rascunho.conta_id}
                vazio="Sem conta"
                placeholder="Buscar conta…"
                aoEscolher={(v) => setRascunho({ ...rascunho, conta_id: v })}
                opcoes={contasDoFormulario.map((c) => ({
                  id: c.id, nome: c.nome,
                  marca: { nome: c.nome, logo: logosContas[c.id] ?? null, icone: c.icone ?? "wallet" },
                }))}
              />
            </Campo>
            <Campo rotulo="Motivo">
              <Escolha
                valor={rascunho.motivo}
                vazio="Sem motivo"
                placeholder="Buscar ou criar…"
                aoEscolher={(v) => setRascunho({ ...rascunho, motivo: v })}
                opcoes={motivos.map((m) => ({ id: m, nome: m }))}
                rotuloCriar="Usar motivo"
                aoCriar={(nome) => {
                  const limpo = nome.trim();
                  if (!limpo) return Promise.resolve(null);
                  setMotivosExtras((lista) => (lista.includes(limpo) ? lista : [...lista, limpo]));
                  return Promise.resolve(limpo);
                }}
              />
            </Campo>

            <Grupo rotulo="Situação" largo>
              <Alternativas
                valor={rascunho.status}
                aoEscolher={(v) => setRascunho({
                  ...rascunho,
                  status: v as EstornoStatus,
                  // Fechar preenche a data com hoje (editável); reabrir limpa —
                  // caso em disputa com data de resolução é contradição.
                  resolvido_em: v === "em_disputa" ? "" : rascunho.resolvido_em || hoje,
                })}
                opcoes={ESTORNO_STATUS.map((s) => ({ id: s, label: SELO_ESTORNO[s].label }))}
              />
            </Grupo>

            {caseFechado && (
              <Campo rotulo="Resolvido em">
                <input
                  type="date" value={rascunho.resolvido_em}
                  onChange={(e) => setRascunho({ ...rascunho, resolvido_em: e.target.value })}
                  style={CAIXA}
                />
              </Campo>
            )}

            <Campo rotulo="Observação" largo>
              <textarea
                value={rascunho.observacao}
                onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })}
                placeholder="Protocolo da operadora, prazo da disputa, o que foi enviado de prova…"
                rows={3}
                style={{ ...CAIXA, minHeight: 84, padding: "10px 12px", resize: "vertical" }}
              />
            </Campo>
          </div>
          </SoLeitura>
        </ModalFormulario>
      )}
    </>
  );
}
