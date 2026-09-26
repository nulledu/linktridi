"use client";

// ── Cofre de acessos ─────────────────────────────────────────────────────────
// As credenciais que a empresa entrega pra cada colaborador, agrupadas POR
// PESSOA — e não por serviço. A pergunta que esta tela responde no dia a dia é
// "o fulano saiu, o que precisa ser revogado?", e essa pergunta é sobre gente.
// Uma lista plana de 200 linhas ordenada por serviço só responderia "quem tem
// GitHub?", que quase ninguém pergunta.
//
// A senha NUNCA vem na listagem. Ela chega por uma chamada própria, no clique
// do olho ou do copiar, e essa chamada grava auditoria antes de responder. É
// por isso que revelar tem uma espera perceptível: é uma ida ao servidor, não
// um `display: none` que qualquer inspetor desfaz.

import { use, useCallback, useEffect, useMemo, useState } from "react";
import type { DadosDaEquipe } from "./GestaoDeEquipe";
import { Icon } from "../Icon";
import { toast, confirmar } from "../Toast";
import { GlassSelect } from "../GlassPicker";
import { Botao, BotaoIcone, Acoes, Campo, Campos, PainelLateral } from "../ui/controles";
import { Secao } from "../ui/Secao";
import { Fila } from "../ui/micro";
import { CATEGORIAS, TIPOS_DE_CREDENCIAL, TIPO_ROTULO, type TipoDeCredencial } from "@/lib/acessos-categorias";
import type { ColabRow } from "./ColaboradoresClient";

interface Credencial {
  id: string; colaboradorId: string; tipo: TipoDeCredencial; servico: string; categoria: string;
  url: string | null; login: string | null; notas: string | null;
  criadoEm: string; atualizadoEm: string;
}
interface LinhaLog {
  id: string; credencialId: string | null; atorNome: string | null;
  acao: string; servico: string | null; colaboradorNome: string | null; criadoEm: string;
}

// Rascunho do formulário. `senha` vazia na edição significa "não mexi nela" —
// a API não sobrescreve o que não veio. Sem isso, abrir a ficha pra corrigir
// uma URL apagaria a senha de quem não digitou nada no campo.
type Rascunho = {
  id?: string; colaboradorId: string; tipo: TipoDeCredencial; servico: string; categoria: string;
  url: string; login: string; senha: string; notas: string;
};

const vazio = (colaboradorId = ""): Rascunho =>
  ({ colaboradorId, tipo: "funcionario", servico: "", categoria: "Outros", url: "", login: "", senha: "", notas: "" });

const emp = (r: ColabRow) => (Array.isArray(r.employees) ? r.employees[0] : r.employees) ?? null;

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

const ACAO_ROTULO: Record<string, string> = {
  revelar: "revelou", copiar: "copiou", criar: "cadastrou", editar: "editou", apagar: "apagou",
};

// Faixa da "tabela" de cada pessoa. `minmax(min(100%, Npx), …)` e não
// `minmax(Npx, …)`: mínimo fixo é largura que a faixa não negocia, e a 320px
// isso vira rolagem da página. Abaixo de 700px a `.tab-linha` da fundação
// substitui esta faixa por um card de duas colunas.
const GRID = "minmax(min(100%, 150px), 1.2fr) minmax(min(100%, 160px), 1.4fr) minmax(min(100%, 150px), 1fr) auto";

export function CofreAcessos({ equipe, tipoFixo }: {
  equipe: Promise<DadosDaEquipe>;
  /** Trava a tela num tipo só (a aba "E-mails" de Acessos & Infra usa
   *  `tipoFixo="email"`): o filtro some, o formulário nasce no tipo certo e a
   *  listagem só mostra aquele tipo. Mesmo componente, mesma API, mesma chave
   *  de permissão — é só um recorte. */
  tipoFixo?: TipoDeCredencial;
}) {
  // Mesma promessa da aba de equipe: a lista chega por streaming e esta aba
  // espera dentro da fronteira de Suspense do `dynamic` que a trouxe — em vez
  // de a PÁGINA inteira esperar por ela antes de pintar o Ponto.
  const { colaboradores } = use(equipe);
  const [credenciais, setCredenciais] = useState<Credencial[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState("");
  const [tipoLivre, setTipoLivre] = useState("");
  const tipoF = tipoFixo ?? tipoLivre;
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [importar, setImportar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // id → senha revelada nesta sessão. Some ao recarregar a tela de propósito:
  // senha aberta na tela é senha que fica aberta no monitor da sala.
  const [reveladas, setReveladas] = useState<Record<string, string>>({});
  const [carregandoId, setCarregandoId] = useState<string | null>(null);
  const [log, setLog] = useState<LinhaLog[] | null>(null);

  const carregar = useCallback(() => {
    fetch("/api/acessos", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.error) { setAviso(d.detalhe || d.error); setCredenciais([]); return; }
        // O aviso da chave vem junto da listagem: melhor dizer antes que a
        // pessoa digite uma senha e leve erro no submit.
        setAviso(d?.configurado === false
          ? "Falta a variável de ambiente ACESSOS_CRYPTO_KEY. Sem ela o cofre não grava senha nenhuma."
          : null);
        setCredenciais(d?.credenciais ?? []);
      })
      .catch(() => { setAviso("Não consegui carregar o cofre."); setCredenciais([]); });
  }, []);
  useEffect(carregar, [carregar]);

  const porId = useMemo(() => new Map(colaboradores.map((c) => [c.id, c])), [colaboradores]);
  const nomeDe = useCallback((id: string) => porId.get(id)?.name ?? "—", [porId]);

  // Agrupa por pessoa depois de filtrar — e não antes. Filtrando depois, uma
  // busca por "AWS" mostraria a pessoa com a contagem cheia e uma linha só.
  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = (credenciais ?? []).filter((c) => {
      if (cat && c.categoria !== cat) return false;
      if (tipoF && c.tipo !== tipoF) return false;
      if (!q) return true;
      return `${c.servico} ${c.login ?? ""} ${nomeDe(c.colaboradorId)}`.toLowerCase().includes(q);
    });
    const mapa = new Map<string, Credencial[]>();
    for (const c of lista) {
      const arr = mapa.get(c.colaboradorId);
      if (arr) arr.push(c); else mapa.set(c.colaboradorId, [c]);
    }
    return [...mapa.entries()]
      .map(([id, itens]) => ({ id, pessoa: porId.get(id) ?? null, itens }))
      .sort((a, b) => (a.pessoa?.name ?? "").localeCompare(b.pessoa?.name ?? ""));
  }, [credenciais, busca, cat, tipoF, porId, nomeDe]);

  // ── Revelar / copiar ───────────────────────────────────────────────────────
  // Uma função só pros dois: a diferença é o que se faz com a senha depois, e
  // a `acao` que a auditoria grava.
  const pedirSenha = useCallback(async (c: Credencial, acao: "revelar" | "copiar"): Promise<string | null> => {
    setCarregandoId(c.id);
    try {
      const r = await fetch("/api/acessos/revelar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, acao, colaboradorNome: nomeDe(c.colaboradorId) }),
      });
      const d = await r.json();
      if (!r.ok || d?.error) { toast(d?.detalhe || "Não consegui revelar a senha.", "erro"); return null; }
      return d.senha as string;
    } catch { toast("Não consegui revelar a senha.", "erro"); return null; }
    finally { setCarregandoId(null); }
  }, [nomeDe]);

  const alternar = useCallback(async (c: Credencial) => {
    // Esconder é local e instantâneo — não gasta ida ao servidor nem gera
    // linha de auditoria: ninguém "viu menos" a senha ao clicar de novo.
    if (reveladas[c.id]) { setReveladas((r) => { const { [c.id]: _, ...resto } = r; void _; return resto; }); return; }
    const senha = await pedirSenha(c, "revelar");
    if (senha != null) setReveladas((r) => ({ ...r, [c.id]: senha }));
  }, [reveladas, pedirSenha]);

  const copiar = useCallback(async (c: Credencial) => {
    const senha = reveladas[c.id] ?? await pedirSenha(c, "copiar");
    if (senha == null) return;
    try { await navigator.clipboard.writeText(senha); toast("Senha copiada."); }
    catch { toast("O navegador bloqueou a cópia.", "erro"); }
  }, [reveladas, pedirSenha]);

  // ── Escrita ────────────────────────────────────────────────────────────────
  const salvar = useCallback(async () => {
    if (!rascunho) return;
    if (!rascunho.colaboradorId) { toast("Escolha de quem é o acesso.", "erro"); return; }
    if (!rascunho.servico.trim()) { toast("Diga qual é o serviço.", "erro"); return; }
    if (!rascunho.id && !rascunho.senha) { toast("A senha é obrigatória.", "erro"); return; }
    setSalvando(true);
    try {
      const corpo = { ...rascunho, colaboradorNome: nomeDe(rascunho.colaboradorId) };
      const r = await fetch("/api/acessos", {
        method: rascunho.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok || d?.error) { toast(d?.detalhe || "Não consegui salvar.", "erro"); return; }
      toast(rascunho.id ? "Credencial atualizada." : "Credencial cadastrada.");
      setRascunho(null);
      // A senha revelada da credencial editada sai da tela: ela pode ter
      // mudado, e mostrar a antiga como se fosse a atual é pior que não mostrar.
      if (rascunho.id) setReveladas((s) => { const { [rascunho.id!]: _, ...resto } = s; void _; return resto; });
      carregar();
      setLog(null);
    } finally { setSalvando(false); }
  }, [rascunho, nomeDe, carregar]);

  const apagar = useCallback(async (c: Credencial) => {
    const ok = await confirmar(`Apagar o acesso "${c.servico}" de ${nomeDe(c.colaboradorId)}?`, {
      detalhe: "A senha some do cofre. O registro de auditoria continua.", perigo: true,
    });
    if (!ok) return;
    const qs = new URLSearchParams({ id: c.id, servico: c.servico, colaborador: nomeDe(c.colaboradorId) });
    const r = await fetch(`/api/acessos?${qs}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d?.error) { toast(d?.detalhe || "Não consegui apagar.", "erro"); return; }
    toast("Credencial apagada.");
    carregar();
    setLog(null);
  }, [nomeDe, carregar]);

  const opcoesPessoa = useMemo(
    () => colaboradores.filter((c) => c.active).map((c) => ({ value: c.id, label: c.name })),
    [colaboradores],
  );
  const opcoesCategoria = CATEGORIAS.map((c) => ({ value: c, label: c }));

  const total = credenciais?.length ?? 0;

  return (
    <div>
      {aviso && (
        <div role="status" style={{
          display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16, padding: "12px 14px",
          borderRadius: "var(--r-md)", border: "1px solid var(--border)", background: "var(--surface-2)",
        }}>
          <Icon name="alert-triangle" size={17} color="var(--warn, var(--text-dim))" />
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>{aviso}</p>
        </div>
      )}

      {/* ── Barra: buscar, filtrar, adicionar ────────────────────────────────
          `min(100%, …)` nas duas faixas: a 320px a busca e o seletor viram
          uma coluna só, e o botão continua com os 44px de alvo da fundação. */}
      <div style={{
        display: "grid", gap: 10, marginBottom: 18,
        gridTemplateColumns: tipoFixo
          ? "minmax(min(100%, 220px), 2fr) minmax(min(100%, 180px), 1fr) auto"
          : "minmax(min(100%, 220px), 2fr) minmax(min(100%, 150px), 1fr) minmax(min(100%, 180px), 1fr) auto",
        alignItems: "center",
      }}>
        <label style={{ position: "relative", display: "block", minWidth: 0 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}>
            <Icon name="search" size={16} color="var(--text-dim)" />
          </span>
          <input
            value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder={tipoFixo === "email" ? "Buscar por e-mail ou finalidade…" : "Buscar por colaborador ou serviço…"}
            aria-label="Buscar no cofre"
            style={{ width: "100%", minWidth: 0, height: "var(--tap)", paddingLeft: 36 }}
          />
        </label>
        {/* Com o tipo travado (aba E-mails) o filtro de tipo não existe —
            seria um seletor com uma opção só. */}
        {!tipoFixo && (
          <GlassSelect
            value={tipoLivre} onChange={setTipoLivre}
            options={[{ value: "", label: "Todos os tipos" },
              ...TIPOS_DE_CREDENCIAL.map((t) => ({ value: t, label: TIPO_ROTULO[t] }))]}
            placeholder="Todos os tipos"
          />
        )}
        <GlassSelect
          value={cat} onChange={setCat}
          options={[{ value: "", label: "Todas as categorias" }, ...opcoesCategoria]}
          placeholder="Todas as categorias"
        />
        <span style={{ display: "flex", gap: 8 }}>
          {/* Importar em LOTE: cola-se a planilha (login e senha por linha) e
              o servidor cifra uma a uma — pra planilha de senhas morrer aqui
              em vez de continuar circulando por chat e drive. */}
          <Botao icone="clipboard-list" onClick={() => setImportar(true)}>
            <span className="desk-only">Importar</span>
          </Botao>
          <Botao variante="primario" icone="plus"
            onClick={() => setRascunho({ ...vazio(), tipo: tipoFixo ?? "funcionario" })}>
            <span className="desk-only">{tipoFixo === "email" ? "Adicionar e-mail" : "Adicionar credencial"}</span>
            <span className="mob-only">Adicionar</span>
          </Botao>
        </span>
      </div>

      {credenciais === null ? (
        <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando o cofre…</p>
      ) : grupos.length === 0 ? (
        <div style={{ padding: "40px 16px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "var(--r-md)" }}>
          <Icon name="lock" size={26} color="var(--text-dim)" />
          <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--text-dim)" }}>
            {total === 0
              ? "Nenhuma credencial no cofre ainda."
              : "Nenhuma credencial com esse filtro."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {grupos.map((g) => (
            <GrupoDaPessoa
              key={g.id}
              nome={g.pessoa?.name ?? "Colaborador removido"}
              cargo={g.pessoa ? emp(g.pessoa)?.cargo ?? null : null}
              foto={g.pessoa ? emp(g.pessoa)?.photo_url ?? null : null}
              itens={g.itens}
              reveladas={reveladas}
              carregandoId={carregandoId}
              onAlternar={alternar}
              onCopiar={copiar}
              onEditar={(c) => setRascunho({
                id: c.id, colaboradorId: c.colaboradorId, tipo: c.tipo, servico: c.servico, categoria: c.categoria,
                url: c.url ?? "", login: c.login ?? "", senha: "", notas: c.notas ?? "",
              })}
              onApagar={apagar}
              onAdicionar={() => setRascunho({ ...vazio(g.id), tipo: tipoFixo ?? "funcionario" })}
              rotuloServico={tipoFixo === "email" ? "Finalidade" : "Serviço"}
            />
          ))}
        </div>
      )}

      {/* ── Auditoria ────────────────────────────────────────────────────────
          Seção fechada, carregada só quando alguém abre. Sem poll: log que se
          atualiza sozinho é invocação paga a cada ciclo pra ler uma tabela que
          só muda quando alguém clica num olho. */}
      <div style={{ marginTop: 22 }}>
        <Secao icone="history" titulo="Registro de acessos" resumo="Quem revelou, copiou ou alterou cada credencial.">
          <Auditoria log={log} onCarregar={setLog} />
        </Secao>
      </div>

      {rascunho && (
        <PainelLateral
          titulo={rascunho.id
            ? (rascunho.tipo === "email" ? "Editar e-mail" : "Editar credencial")
            : (rascunho.tipo === "email" ? "Novo e-mail" : "Nova credencial")}
          subtitulo={rascunho.id ? "Deixe a senha em branco para mantê-la como está." : undefined}
          onFechar={() => setRascunho(null)}
          soFechaNoX
          centrado
          largura={480}
          rodape={
            <Acoes>
              <Botao onClick={() => setRascunho(null)}>Cancelar</Botao>
              <Botao variante="primario" carregando={salvando} onClick={salvar}>Salvar</Botao>
            </Acoes>
          }
        >
          <Campos>
            {/* O tipo muda o SENTIDO do vínculo com a pessoa: no funcionário é
                o dono do acesso; no aplicativo e no e-mail é quem responde por
                ele. Com o tipo travado (aba E-mails) o seletor não aparece. */}
            {!tipoFixo && (
              <Campo label="Tipo" largo>
                {(id) => (
                  <GlassSelect
                    id={id} value={rascunho.tipo}
                    onChange={(v) => setRascunho((r) => r && { ...r, tipo: v as TipoDeCredencial })}
                    options={TIPOS_DE_CREDENCIAL.map((t) => ({ value: t, label: TIPO_ROTULO[t] }))}
                  />
                )}
              </Campo>
            )}
            <Campo label={rascunho.tipo === "funcionario" ? "Colaborador" : "Responsável"} largo>
              {(id) => (
                <GlassSelect
                  id={id} value={rascunho.colaboradorId}
                  onChange={(v) => setRascunho((r) => r && { ...r, colaboradorId: v })}
                  options={opcoesPessoa} placeholder="Escolher pessoa…" searchable
                />
              )}
            </Campo>
            {/* No e-mail, o "serviço" é a FINALIDADE — a resposta de "este
                e-mail é pra quê?", que é a pergunta que a aba existe pra
                responder. */}
            <Campo label={rascunho.tipo === "email" ? "Finalidade (pra que serve)"
              : rascunho.tipo === "aplicativo" ? "Nome do serviço" : "Serviço"}>
              {(id) => (
                <input id={id} value={rascunho.servico}
                  placeholder={rascunho.tipo === "email" ? "Aprovação de arte, conta reserva…"
                    : rascunho.tipo === "aplicativo" ? "Meta Business, Hostinger…" : "GitHub, AWS Console…"}
                  onChange={(e) => setRascunho((r) => r && { ...r, servico: e.target.value })} />
              )}
            </Campo>
            <Campo label="Categoria">
              {(id) => (
                <GlassSelect id={id} value={rascunho.categoria}
                  onChange={(v) => setRascunho((r) => r && { ...r, categoria: v })}
                  options={opcoesCategoria} />
              )}
            </Campo>
            <Campo label={rascunho.tipo === "email" ? "Endereço de e-mail" : "Usuário / e-mail"} largo>
              {(id) => (
                <input id={id} value={rascunho.login} autoComplete="off"
                  onChange={(e) => setRascunho((r) => r && { ...r, login: e.target.value })} />
              )}
            </Campo>
            <Campo label="Senha" largo dica={rascunho.id ? "Em branco = mantém a senha atual." : "Guardada cifrada; só sai por revelação registrada."}>
              {(id) => (
                <input id={id} type="password" value={rascunho.senha} autoComplete="new-password"
                  onChange={(e) => setRascunho((r) => r && { ...r, senha: e.target.value })} />
              )}
            </Campo>
            <Campo label="Endereço (URL)" largo>
              {(id) => (
                <input id={id} value={rascunho.url} placeholder="https://…" inputMode="url"
                  onChange={(e) => setRascunho((r) => r && { ...r, url: e.target.value })} />
              )}
            </Campo>
            <Campo label="Observação" largo dica="Não é segredo: fica em claro. Serve pra contexto (qual 2FA, de quem é a conta-mãe).">
              {(id) => (
                <textarea id={id} rows={3} value={rascunho.notas}
                  onChange={(e) => setRascunho((r) => r && { ...r, notas: e.target.value })} />
              )}
            </Campo>
          </Campos>
        </PainelLateral>
      )}

      {importar && (
        <ImportarLote
          tipoInicial={tipoFixo}
          opcoesPessoa={opcoesPessoa}
          opcoesCategoria={opcoesCategoria}
          nomeDe={nomeDe}
          onFechar={() => setImportar(false)}
          onPronto={() => { setImportar(false); carregar(); setLog(null); }}
        />
      )}
    </div>
  );
}

// ── Importar em lote ─────────────────────────────────────────────────────────
// Cola-se a planilha (uma credencial por linha: usuário e senha separados por
// TAB, ponto e vírgula ou vírgula) e cada linha vira um POST no /api/acessos —
// a MESMA porta do cadastro manual: cifra no servidor, auditoria de "criar",
// nada novo pra revisar de segurança. Serviço, tipo, categoria e responsável
// valem pra todas as linhas; pra misturar donos, importa-se em levas.
function ImportarLote({ tipoInicial, opcoesPessoa, opcoesCategoria, nomeDe, onFechar, onPronto }: {
  /** Aberto pela aba E-mails, a leva já nasce do tipo certo. */
  tipoInicial?: TipoDeCredencial;
  opcoesPessoa: { value: string; label: string }[];
  opcoesCategoria: { value: string; label: string }[];
  nomeDe: (id: string) => string;
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [tipo, setTipo] = useState<TipoDeCredencial>(tipoInicial ?? "aplicativo");
  const [categoria, setCategoria] = useState("Outros");
  const [servico, setServico] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feitas, setFeitas] = useState(0);

  // Uma linha = uma credencial. A 3ª coluna (se houver) vira observação.
  // Cabeçalho colado junto ("EMAIL  SENHA…") é reconhecido e pulado.
  const linhas = useMemo(() => {
    return texto.split(/\r?\n/)
      .map((l) => l.split(/\t|;|,/).map((c) => c.trim()))
      .filter((c) => c.length >= 2 && c[0] && c[1])
      .filter((c) => !/^(e-?mail|login|usu[aá]rio)$/i.test(c[0]) && !/senha/i.test(c[1]))
      .map((c) => ({ login: c[0], senha: c[1], notas: c.slice(2).filter(Boolean).join(" · ") || null }));
  }, [texto]);

  const enviar = useCallback(async () => {
    if (!servico.trim()) { toast("Diga qual é o serviço (vale pra todas as linhas).", "erro"); return; }
    if (!colaboradorId) { toast(tipo === "aplicativo" ? "Escolha o responsável." : "Escolha o colaborador.", "erro"); return; }
    if (!linhas.length) { toast("Nenhuma linha válida — o formato é usuário e senha separados por TAB.", "erro"); return; }
    setEnviando(true);
    let ok = 0; const falhas: string[] = [];
    // Uma por vez, de propósito: 30 POSTs em paralelo contra a mesma rota é
    // rajada à toa, e a contagem de progresso deixaria de fazer sentido.
    for (const l of linhas) {
      try {
        const r = await fetch("/api/acessos", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            colaboradorId, tipo, servico, categoria,
            login: l.login, senha: l.senha, notas: l.notas,
            colaboradorNome: nomeDe(colaboradorId),
          }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.ok && !d?.error) ok += 1; else falhas.push(l.login);
      } catch { falhas.push(l.login); }
      setFeitas((f) => f + 1);
    }
    setEnviando(false);
    if (falhas.length === 0) { toast(`${ok} credenciais importadas.`); onPronto(); return; }
    toast(`${ok} importadas; ${falhas.length} falharam (${falhas.slice(0, 3).join(", ")}${falhas.length > 3 ? "…" : ""}). As que falharam continuam no texto — confira e tente de novo.`, "erro");
  }, [servico, colaboradorId, tipo, categoria, linhas, nomeDe, onPronto]);

  return (
    <PainelLateral
      titulo="Importar credenciais"
      subtitulo="Uma por linha: usuário e senha separados por TAB (colar da planilha já vem assim). A senha é cifrada no servidor, linha a linha."
      onFechar={onFechar}
      soFechaNoX
      centrado
      largura={520}
      rodape={
        <Acoes>
          <Botao onClick={onFechar} disabled={enviando}>Cancelar</Botao>
          <Botao variante="primario" carregando={enviando} onClick={enviar}>
            {enviando ? `Importando ${feitas}/${linhas.length}…` : `Importar ${linhas.length || ""} ${linhas.length === 1 ? "credencial" : "credenciais"}`}
          </Botao>
        </Acoes>
      }
    >
      <Campos>
        <Campo label="Tipo">
          {(id) => (
            <GlassSelect id={id} value={tipo} onChange={(v) => setTipo(v as TipoDeCredencial)}
              options={TIPOS_DE_CREDENCIAL.map((t) => ({ value: t, label: TIPO_ROTULO[t] }))} />
          )}
        </Campo>
        <Campo label="Categoria">
          {(id) => (
            <GlassSelect id={id} value={categoria} onChange={setCategoria} options={opcoesCategoria} />
          )}
        </Campo>
        <Campo label="Serviço (vale pra todas)" largo>
          {(id) => (
            <input id={id} value={servico} placeholder="Conta Google reserva, E-mail corporativo…"
              onChange={(e) => setServico(e.target.value)} />
          )}
        </Campo>
        <Campo label={tipo === "aplicativo" ? "Responsável (vale pra todas)" : "Colaborador (vale pra todas)"} largo
          dica="Pra credenciais de pessoas diferentes, importe em levas — uma por dono.">
          {(id) => (
            <GlassSelect id={id} value={colaboradorId} onChange={setColaboradorId}
              options={opcoesPessoa} placeholder="Escolher pessoa…" searchable />
          )}
        </Campo>
        <Campo label="Linhas" largo dica={`${linhas.length} ${linhas.length === 1 ? "linha válida" : "linhas válidas"} reconhecidas. Terceira coluna (se houver) vira observação.`}>
          {(id) => (
            <textarea id={id} rows={10} value={texto} spellCheck={false} autoComplete="off"
              placeholder={"fulano@empresa.com\tSenhaF0rte!\nciclano@empresa.com\tOutraSenha#2"}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
              onChange={(e) => setTexto(e.target.value)} />
          )}
        </Campo>
      </Campos>
    </PainelLateral>
  );
}

// ── Cartão de uma pessoa ─────────────────────────────────────────────────────
function GrupoDaPessoa({
  nome, cargo, foto, itens, reveladas, carregandoId,
  onAlternar, onCopiar, onEditar, onApagar, onAdicionar, rotuloServico = "Serviço",
}: {
  nome: string; cargo: string | null; foto: string | null; itens: Credencial[];
  reveladas: Record<string, string>; carregandoId: string | null;
  onAlternar: (c: Credencial) => void; onCopiar: (c: Credencial) => void;
  onEditar: (c: Credencial) => void; onApagar: (c: Credencial) => void;
  onAdicionar: () => void;
  /** A aba E-mails troca a coluna por "Finalidade". */
  rotuloServico?: string;
}) {
  return (
    <section style={{
      border: "1px solid var(--border)", borderRadius: "var(--r-md)",
      background: "var(--surface)", overflow: "hidden",
    }}>
      {/* Cabeça da pessoa. No computador ela ficaria à esquerda da tabela, mas
          uma coluna fixa de 240px a 320px come 3/4 da tela — então ela é uma
          FAIXA em cima nos dois tamanhos, e a tabela ocupa a largura inteira. */}
      <header style={{
        display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
        borderBottom: "1px solid var(--border)", background: "var(--surface-2)",
      }}>
        {foto
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={foto} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          : <span style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, display: "grid", placeItems: "center", background: "var(--surface)", border: "1px solid var(--border)" }}>
              <Icon name="user-check" size={18} color="var(--text-dim)" />
            </span>}
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 14.5, fontWeight: 800, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</p>
          <p style={{ margin: 0, fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {cargo || "Sem cargo"} · {itens.length} {itens.length === 1 ? "acesso" : "acessos"}
          </p>
        </div>
        <BotaoIcone icone="plus" titulo={`Adicionar acesso de ${nome}`} onClick={onAdicionar} />
      </header>

      <div className="tab-linha-head" style={{
        display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "8px 16px",
        fontSize: 11, fontWeight: 800, color: "var(--text-dim)",
        textTransform: "uppercase", letterSpacing: ".03em",
      }}>
        <span>{rotuloServico}</span><span>Usuário</span><span>Senha</span><span style={{ textAlign: "right" }}>Ações</span>
      </div>

      {/* `<Fila>` (.mt-fila): as linhas entram escalonadas — kinetics na
          escala do app. */}
      <Fila>
      {itens.map((c, i) => {
        const aberta = reveladas[c.id];
        const ocupada = carregandoId === c.id;
        return (
          <div key={c.id} className="tab-linha" style={{
            display: "grid", gridTemplateColumns: GRID, gap: 10, padding: "10px 16px",
            alignItems: "center", borderTop: i > 0 ? "1px solid var(--border)" : "none",
          }}>
            <span className="tl-titulo" style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <Icon name={c.tipo === "aplicativo" ? "world" : c.tipo === "email" ? "mail" : "user-check"} size={15} color="var(--text-dim)" />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.url
                  ? <a href={c.url} target="_blank" rel="noreferrer noopener" style={{ color: "inherit" }}>{c.servico}</a>
                  : c.servico}
              </span>
              {/* O selo só existe no que é EXCEÇÃO na tela: credencial de
                  aplicativo/serviço ou conta de e-mail da empresa. Funcionário
                  é o caso comum e não precisa se anunciar. */}
              {c.tipo !== "funcionario" && (
                <span style={{
                  flexShrink: 0, padding: "2px 7px", borderRadius: 999, fontSize: 10.5, fontWeight: 800,
                  letterSpacing: ".03em", textTransform: "uppercase",
                  border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-dim)",
                }}>{c.tipo === "email" ? "E-mail" : "App"}</span>
              )}
            </span>

            {/* O login não é segredo (já sai na listagem), então copiar é local
                e instantâneo — sem ida ao servidor nem linha de auditoria. */}
            <span data-l="Usuário" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ flex: 1, fontSize: 12.5, color: "var(--text-dim)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.login || "—"}
              </span>
              {c.login && (
                <BotaoIcone icone="copy" titulo={`Copiar o usuário de ${c.servico}`}
                  onClick={async () => {
                    try { await navigator.clipboard.writeText(c.login!); toast("Usuário copiado."); }
                    catch { toast("O navegador bloqueou a cópia.", "erro"); }
                  }} />
              )}
            </span>

            {/* A senha ocupa a linha inteira no celular: em meia coluna uma
                senha longa racha no meio e o rótulo racha junto. */}
            <span className="tl-largo" data-l="Senha" style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <code style={{
                flex: 1, minWidth: 0, padding: "7px 10px", borderRadius: "var(--r-sm)",
                background: "var(--surface-2)", fontSize: 12.5, letterSpacing: aberta ? 0 : ".14em",
                color: aberta ? "var(--text)" : "var(--text-dim)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {aberta ?? "••••••••"}
              </code>
              <BotaoIcone
                icone={aberta ? "eye-off" : "eye"}
                titulo={aberta ? `Ocultar a senha de ${c.servico}` : `Revelar a senha de ${c.servico}`}
                carregando={ocupada}
                onClick={() => onAlternar(c)}
              />
              <BotaoIcone icone="copy" titulo={`Copiar a senha de ${c.servico}`} onClick={() => onCopiar(c)} />
            </span>

            <span className="tl-largo" data-l="Ações" style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              <BotaoIcone icone="pencil" titulo={`Editar ${c.servico}`} onClick={() => onEditar(c)} />
              {/* Um vão maior antes do apagar: no celular dois alvos de 44px
                  colados fazem o polegar errar pro lado destrutivo. */}
              <BotaoIcone icone="trash" variante="perigo" titulo={`Apagar ${c.servico}`}
                style={{ marginLeft: 8 }} onClick={() => onApagar(c)} />
            </span>
          </div>
        );
      })}
      </Fila>
    </section>
  );
}

// ── Auditoria ────────────────────────────────────────────────────────────────
function Auditoria({ log, onCarregar }: { log: LinhaLog[] | null; onCarregar: (l: LinhaLog[]) => void }) {
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (log) return;
    fetch("/api/acessos/log", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d?.error) setErro(d.detalhe || d.error); else onCarregar(d?.log ?? []); })
      .catch(() => setErro("Não consegui carregar o registro."));
  }, [log, onCarregar]);

  if (erro) return <p style={{ fontSize: 13, color: "var(--text-dim)" }}>{erro}</p>;
  if (!log) return <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Carregando…</p>;
  if (!log.length) return <p style={{ fontSize: 13, color: "var(--text-dim)" }}>Nada registrado ainda.</p>;

  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 2 }}>
      {log.map((l) => (
        <li key={l.id} style={{
          display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "2px 6px",
          padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5,
        }}>
          <strong style={{ color: "var(--text)", fontWeight: 700 }}>{l.atorNome || "Alguém"}</strong>
          <span style={{ color: "var(--text-dim)" }}>{ACAO_ROTULO[l.acao] ?? l.acao}</span>
          <span style={{ color: "var(--text)", fontWeight: 600 }}>{l.servico || "—"}</span>
          {l.colaboradorNome && <span style={{ color: "var(--text-dim)" }}>de {l.colaboradorNome}</span>}
          <span style={{ marginLeft: "auto", color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>{dataHora(l.criadoEm)}</span>
        </li>
      ))}
    </ul>
  );
}
