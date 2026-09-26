"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_LABEL, ROLE_LEVEL, ROLE_DESC, MODULES, type Role } from "@/lib/rbac";
import { DEPARTAMENTOS, perfisDe, defaultTemplate, setorDoDepartamento } from "@/lib/colaboradores-taxonomia";
import { ESCALAS, getEscala, horasSemana, expedienteHoje } from "@/lib/escalas";
import { NIVEIS, NIVEL_LABEL, modulosDoNivel } from "@/lib/niveis";
import { AREAS, AREAS_RESTRITAS, AREA_KEYS, AREA_CATEGORIAS, mapaDePermissoes, subFullKey, expandirImplicacoes, temPermissoesConfiguradas, cofreHerdado, type Area } from "@/lib/areas";
import { GlassSelect, GlassDate } from "../GlassPicker";
import { useSticky } from "../useSticky";
import { useParamDaUrl } from "../ui/useParamDaUrl";
import { confirmar, toast } from "../Toast";
import { useIsEstreito } from "../ui/useMediaQuery";
import { PessoaModal } from "../administracao/PontoPanel";
import type { PontoPessoa } from "@/lib/ponto";
import { Icon } from "../Icon";
import { Avatar as AvatarBase } from "../ui/Avatar";
import { atributosDe } from "../ui/campos";
import { Abas } from "../ui/Abas";
import { Momento } from "../ui/Momento";
import { Botao, ChaveVisual } from "../ui/controles";

interface ErpUser { id: string; nome: string; apelido: string | null; foto_url: string | null }

export interface EmployeeData {
  photo_url: string | null;
  cargo: string | null;
  departamento: string | null;
  perfil: string | null;
  perfis: string[] | null;
  especialidade: string | null;
  escala: string | null;
  nivel: number | null;
  setor: string | null;
  tablet: boolean | null;
  mesa: string | null;
  mesas: string[] | null;
  telefone: string | null;
  data_admissao: string | null;
  observacoes: string | null;
  erp_user_id: string | null;
  permissoes: Record<string, boolean> | null;
  /** Opcional: o GET cai num select legado quando o SQL da coluna ainda não rodou. */
  pagina_inicial?: string | null;
  /**
   * Login OFFLINE no leitor de estoque do galpão (supabase/estoque_dispositivos.sql).
   * Só diz se HÁ um código — o valor em si nunca sai do servidor (ver
   * app/api/estoque/device/bootstrap/route.ts, que manda só um verificador).
   * Opcional pelo mesmo motivo de `pagina_inicial`: SQL ainda não rodado.
   */
  codigo_acesso?: string | null;
}

interface Template { departamento: string; perfil: string; modulos: string[] }

export interface ColabRow {
  id: string; username: string; name: string; email: string | null; role: Role;
  active: boolean; password_set: boolean; created_at: string;
  employees: EmployeeData | EmployeeData[] | null;
}

export function emp(r: ColabRow): EmployeeData {
  const e = Array.isArray(r.employees) ? r.employees[0] : r.employees;
  return e ?? { photo_url: null, cargo: null, departamento: null, perfil: null, perfis: [], especialidade: null, escala: null, nivel: null, setor: null, tablet: false, mesa: null, mesas: null, telefone: null, data_admissao: null, observacoes: null, erp_user_id: null, permissoes: null, pagina_inicial: null, codigo_acesso: null };
}

function useErpUsers(enabled: boolean): ErpUser[] {
  const [users, setUsers] = useState<ErpUser[]>([]);
  useEffect(() => {
    if (!enabled || users.length) return;
    fetch("/api/erp-users", { cache: "no-store" }).then((r) => r.json()).then((d) => setUsers(d?.users ?? [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  return users;
}

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData(); fd.append("file", file); fd.append("bucket", "photos");
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) throw new Error("upload falhou");
  return (await res.json()).url as string;
}

// Chancela/Carimbo/Ambos = quem faz montagem de produção. Máquinas e Preparo
// são FAIXAS exclusivas (Davi/Bruno só máquinas; João só preparo — chapas,
// tintas, montar caixa) — ver lib/atividade-faixa.ts.
const ESPECIALIDADES = ["Chancela", "Carimbo", "Ambos", "Máquinas", "Preparo"];

/** Rótulo do grupo de quem não tem departamento. Vai sempre por último. */
const SEM_AREA = "Sem área";

// Usuário sempre "limpo": tira acento, minúsculas, só a-z0-9._- (o servidor exige
// isso; espaço/acento no username fazia o cadastro falhar com 422).
const slugUser = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9._-]/g, "");

const blankForm = {
  username: "", name: "", email: "", role: "colaborador" as Role,
  departamento: "", perfis: [] as string[], especialidade: "", escala: "", nivel: "1", telefone: "", data_admissao: "", observacoes: "", photo_url: "", erp_user_id: "",
};

// `isAdmin` separa VER a equipe (quem tem a área) de distribuir PODER (criar
// pessoa, resetar senha, ativar/excluir, mexer na grade) — isso segue admin.
export function ColaboradoresClient({
  initial, meId, isAdmin = true, areasQueConcedo = [],
  empresasFinanceiro = [], restricoesFinanceiro = {}, ajustes,
}: {
  initial: ColabRow[]; meId: string; isAdmin?: boolean;
  /**
   * Ajustes da EMPRESA (turnos, tablet do ponto, aparelhos). Moram no fim da
   * lista, e só lá: eles estavam como irmãos desta tela no Hub, então
   * continuavam desenhados embaixo do perfil de uma pessoa — quatro sanfonas
   * sobre a casa inteira debaixo do rosto da Letícia. Passando por aqui, a
   * própria tela decide: some quando alguém está em foco.
   */
  ajustes?: React.ReactNode;
  /** Áreas restritas que quem abriu a tela pode conceder. */
  areasQueConcedo?: string[];
  empresasFinanceiro?: { id: string; nome: string }[];
  restricoesFinanceiro?: Record<string, string[]>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [linkAcesso, setLinkAcesso] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [aberto, setAberto] = useState<string | null>(null);   // colaborador em foco
  const [busca, setBusca] = useState("");
  // `/colaboradores?busca=…` chega da busca universal do Início da Central.
  useParamDaUrl("busca", setBusca);
  // `?novo=1` chega do botão "Novo colaborador" da lista do RH: criar uma
  // conta é ato de SISTEMA (cria login, papel e permissões) e mora aqui, mas
  // quem clica está na tela de Colaboradores — o link abre o formulário já
  // pronto em vez de largar a pessoa numa lista com o botão a procurar.
  useParamDaUrl("novo", (v) => { if (v === "1") setShowForm(true); });
  // O valor tem o mesmo nome do RÓTULO ("Equipe"), e não "todos": quando o
  // código chama de um jeito e a tela de outro, toda leitura futura precisa
  // traduzir. "Equipe" mostra só quem está ATIVO — inativo é arquivo, e tem a
  // própria aba, que só existe quando há alguém lá.
  const [filtro, setFiltro] = useState<"equipe" | "pendentes" | "inativos">("equipe");
  // Área é FILTRO, não organização padrão. Agrupar por setor de saída parte do
  // princípio de que a pessoa está procurando um setor — e quase sempre ela
  // está procurando alguém. Uma lista alfabética única responde "onde está
  // fulano" direto; quem de fato quer ver um setor inteiro escolhe aqui, e aí
  // a lista encolhe pro que ele pediu.
  const [area, setArea] = useState("");
  const [recentes, setRecentes] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const erpUsers = useErpUsers(showForm || aberto !== null);

  useEffect(() => { try { setRecentes(JSON.parse(localStorage.getItem("gaius:colab-recent") || "[]")); } catch { /* */ } }, []);
  useEffect(() => { fetch("/api/perfis", { cache: "no-store" }).then((r) => r.json()).then((d) => setTemplates(d.templates ?? [])).catch(() => {}); }, []);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(null), 3000); }
  function set<K extends keyof typeof blankForm>(k: K, v: (typeof blankForm)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  /**
   * Abre a ficha de SISTEMA da pessoa: conta, jornada, acesso e desempenho.
   *
   * Esta tela é a Gestão do RH, e a pergunta dela é "o que essa pessoa pode
   * fazer" — login, permissões, aparelhos. A ficha de RH (quem a pessoa é:
   * documentos, atestados, férias, ficha anamnésica) é outra, mora em
   * Colaboradores e abre em pop-up sobre a lista de lá. Duas VISTAS de assuntos
   * diferentes, não duas cópias da mesma: o que se edita aqui não aparece lá, e
   * é de propósito.
   */
  function abrir(id: string) {
    setAberto(id);
    // A ficha nasce no topo. Clicando num cartão do meio da lista, a rolagem
    // ficava onde estava e a tela abria já cortada — no celular a pessoa via
    // metade do cartão de identidade e nenhuma aba.
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    setRecentes((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 5);
      localStorage.setItem("gaius:colab-recent", JSON.stringify(next));
      return next;
    });
  }

  const bt = busca.trim().toLowerCase();
  const lista = useMemo(() => initial.filter((r) => {
    const e = emp(r);
    return !bt || `${r.name} ${r.username} ${e.departamento ?? ""} ${(e.perfis ?? []).join(" ")} ${e.perfil ?? ""}`.toLowerCase().includes(bt);
  }), [initial, bt]);

  /**
   * Quem PRECISA de você agora.
   *
   * "aguardando 1º acesso" aparecia como terceira linha de cada cartão — no
   * quadro real, em 16 dos 27. Um estado repetido dezesseis vezes grita, mas
   * não dá pra AGIR sobre ele: pra saber quem falta convidar você lê os 27 e
   * guarda de cabeça. Vira contagem e vira filtro: o número responde "quantos
   * faltam" sem ler nada, e clicar nele reduz a lista a exatamente essas
   * pessoas.
   */
  const pendentes = useMemo(() => initial.filter((r) => r.active && !r.password_set), [initial]);
  const inativos = useMemo(() => initial.filter((r) => !r.active), [initial]);

  const visiveis = useMemo(() => {
    if (filtro === "pendentes") return lista.filter((r) => r.active && !r.password_set);
    if (filtro === "inativos") return lista.filter((r) => !r.active);
    return lista.filter((r) => r.active);
  }, [lista, filtro]);

  /**
   * Agrupado por DEPARTAMENTO, e não numa lista só chamada "Todos".
   *
   * A informação sempre esteve no dado (Produção 7, Comercial 4, Marketing 2…)
   * e não organizava nada. Numa grade única de 27, responder "quem é da
   * Produção?" custa ler os 27 nomes; agrupado, custa achar um título. É a
   * regra de proximidade: coisas relacionadas ficam juntas, e o rótulo diz o
   * que as relaciona.
   *
   * Sem departamento vai pra "Sem área" no fim — e não pra uma etiqueta
   * genérica: o cartão antes caía no rótulo do papel ("Colaborador"), que vale
   * pra quase todo mundo e por isso não informa nada.
   */
  /** Áreas que EXISTEM, com quantas pessoas cada uma tem, pro seletor. */
  const areas = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of initial.filter((x) => x.active)) {
      const d = emp(r).departamento?.trim();
      if (d) m.set(d, (m.get(d) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [initial]);

  /**
   * Uma lista só, em ordem alfabética.
   *
   * Antes ela vinha agrupada por área. Estava organizado, mas resolvia a
   * pergunta errada: agrupar por setor supõe que a pessoa procura um SETOR, e
   * quase sempre ela procura ALGUÉM. Com títulos no meio, achar "Mariana"
   * obriga a saber de que área ela é antes de saber onde olhar — a estrutura
   * cobra um conhecimento que a busca não cobra.
   *
   * Alfabética não cobra nada: a posição de qualquer nome é previsível sem
   * saber mais nada sobre a pessoa. Quem QUER ver um setor inteiro usa o
   * filtro, e aí a lista inteira passa a ser aquele setor.
   */
  const ordenados = useMemo(() => {
    const base = area ? visiveis.filter((r) => (emp(r).departamento?.trim() || "") === area) : visiveis;
    return [...base].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [visiveis, area]);

  const recentesRows = recentes.map((id) => initial.find((r) => r.id === id)).filter(Boolean) as ColabRow[];
  const focado = aberto ? initial.find((r) => r.id === aberto) : null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { ...form, email: form.email.trim() || null, departamento: form.departamento || null, perfis: form.perfis, especialidade: form.especialidade || null, escala: form.escala || null, nivel: Number(form.nivel) || 1, data_admissao: form.data_admissao || null, photo_url: form.photo_url || null, erp_user_id: form.erp_user_id || null };
    const res = await fetch("/api/colaboradores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({ error: "erro" }));
      if (j.error === "username_taken") return flash("Usuário já existe.");
      if (j.error === "email_taken") return flash("E-mail já está em uso.");
      const iss = Array.isArray(j.issues) ? j.issues.map((i: { path?: (string | number)[]; message?: string }) => `${i.path?.join(".") || "?"}: ${i.message}`).join("; ") : "";
      return flash(`Falha ao criar: ${j.detail || iss || j.error || res.status}`);
    }
    setForm(blankForm); setShowForm(false); router.refresh();
    flash("Colaborador criado. A senha será definida no 1º login.");
  }

  // Gera o link de 1º acesso e o guarda pra mostrar. O link vem UMA vez na
  // resposta e não existe em lugar nenhum depois — o banco só tem o hash —,
  // então se esta tela perder o valor, o jeito é gerar outro.
  async function gerarLink(id: string) {
    setBusy(true);
    const res = await fetch(`/api/colaboradores/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resetPassword: true }),
    });
    setBusy(false);
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      if (j?.error === "sql_pendente") return flash("Falta rodar supabase/auth_primeiro_acesso.sql no banco.");
      return flash("Operação não permitida.");
    }
    if (j?.primeiroAcesso?.link) setLinkAcesso(j.primeiroAcesso.link);
    router.refresh();
  }

  async function patch(id: string, body: Record<string, unknown>, ok: string) {
    setBusy(true);
    const res = await fetch(`/api/colaboradores/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      if (j?.error === "username_taken") return flash("Esse usuário já existe. Escolha outro.");
      if (j?.error === "codigo_invalido") return flash("Use de 4 a 8 dígitos, só números.");
      if (j?.error === "codigo_duplicado") return flash("Esse código já é de outra pessoa.");
      return flash("Operação não permitida.");
    }
    router.refresh(); flash(ok);
  }

  async function remove(id: string, uname: string) {
    if (!(await confirmar(`Excluir o colaborador "${uname}"?`, { detalhe: "Esta ação não pode ser desfeita.", perigo: true }))) return;
    setBusy(true);
    const res = await fetch(`/api/colaboradores/${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return flash("Não foi possível excluir.");
    setAberto(null); router.refresh(); flash("Colaborador excluído.");
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { set("photo_url", await uploadFile(file)); } catch { flash("Falha no upload da foto."); }
    setBusy(false);
  }

  // Caixa do link recém-gerado. Fica na tela até a pessoa fechar: o link só
  // existe aqui, uma vez — recarregar a página o perde para sempre, e aí só
  // resta gerar outro. Por isso ela não some sozinha como um toast.
  const caixaDoLink = linkAcesso ? (
    <div className="glass" style={{ marginBottom: 14, padding: "14px 16px", borderRadius: "var(--r-md)", border: "1px solid color-mix(in srgb, var(--primary) 30%, transparent)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <Icon name="key" size={16} color="var(--primary-texto)" />
        <strong style={{ fontSize: 14 }}>Link de primeiro acesso</strong>
      </div>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5, margin: "0 0 10px" }}>
        Envie para a pessoa (WhatsApp, pessoalmente, como preferir). Vale 14 dias e funciona uma vez só.
        Guarde agora: por segurança, ele não pode ser mostrado de novo.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input readOnly value={linkAcesso} onFocus={(e) => e.currentTarget.select()}
          style={{ flex: "1 1 min(100%, 320px)", minHeight: "var(--tap)", padding: "8px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5 }} />
        <Botao variante="primario" icone="copy" onClick={async () => {
          try { await navigator.clipboard.writeText(linkAcesso); flash("Link copiado."); }
          catch { flash("Não consegui copiar — selecione o link e copie na mão."); }
        }}>Copiar</Botao>
        <Botao onClick={() => setLinkAcesso(null)}>Já enviei</Botao>
      </div>
    </div>
  ) : null;

  // ── Detalhe de um colaborador (abas) ──
  if (focado) {
    return (
      <div style={{ maxWidth: 1180 }}>
        {caixaDoLink}
        {msg && <div className="glass" style={{ marginBottom: 14, padding: "12px 16px", borderRadius: "var(--r-md)", fontSize: 14 }}>{msg}</div>}
        <ColaboradorDetalhe row={focado} isSelf={focado.id === meId} isAdmin={isAdmin} busy={busy} erpUsers={erpUsers} templates={templates}
          onBack={() => setAberto(null)} onSave={patch} areasQueConcedo={areasQueConcedo}
          empresasFinanceiro={empresasFinanceiro} restricoesFinanceiro={restricoesFinanceiro}
          onReset={async () => {
            if (!await confirmar("Gerar link de primeiro acesso?", { detalhe: "A senha atual para de valer na hora. Você recebe um link para enviar à pessoa — quem abrir o link escolhe a senha. O link vale 14 dias e serve uma vez só." })) return;
            await gerarLink(focado.id);
          }}
          onToggle={() => patch(focado.id, { active: !focado.active }, focado.active ? "Desativado." : "Ativado.")}
          onDelete={() => remove(focado.id, focado.username)} />
      </div>
    );
  }

  // ── Central de comando ──
  return (
    <div style={{ maxWidth: 1000 }}>
      {/* "Pessoas", e não "Colaboradores": é o nome que o menu usa. A mesma
          coisa com dois nomes obriga a pessoa a confirmar que chegou no lugar
          certo — e ela chegou clicando em "Pessoas". */}
      <h1 style={{ fontSize: "clamp(22px, 6vw, 32px)", fontWeight: 800, letterSpacing: "-0.02em" }}>Pessoas</h1>
      {/* Era "Qual colaborador deseja gerenciar hoje?" — uma pergunta retórica
          no lugar mais nobre da tela, que não informa nem leva a lugar nenhum.
          No mesmo espaço cabe o estado da equipe: quantos são e quantos ainda
          não entraram. */}
      <p style={{ color: "var(--text-dim)", marginTop: 6, fontSize: 15 }}>
        {initial.filter((r) => r.active).length} pessoas na equipe
        {pendentes.length > 0 && <> · <strong style={{ color: "var(--atencao)", fontWeight: 700 }}>
          {pendentes.length} {pendentes.length === 1 ? "ainda não entrou" : "ainda não entraram"}
        </strong></>}
      </p>

      {msg && <div className="glass" style={{ marginTop: 16, padding: "12px 16px", borderRadius: "var(--r-md)", fontSize: 14 }}>{msg}</div>}

      {/* Busca + Novo */}
      <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
        <div className="glass glass-spec" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: "var(--r-md)", flex: "1 1 320px" }}>
          <Icon name="search" size={20} color="var(--text-dim)" />
          <input {...atributosDe("busca")} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, departamento ou perfil…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", boxShadow: "none", color: "var(--text)", fontSize: 16 }} />
        </div>
        {/* Eram DOIS botões lado a lado, com o MESMO ícone: "Novo colaborador"
            e "Adicionar vários". Não são duas tarefas — é a mesma tarefa com
            uma quantidade diferente, e apresentar as duas como iguais obriga a
            escolher antes de saber que a escolha existe. Agora existe um botão
            de adicionar, e "vários de uma vez" é uma opção DENTRO dele: o
            caminho comum primeiro, o avançado um nível abaixo. */}
        {isAdmin && <Botao variante={showForm || showBulk ? "secundario" : "primario"} icone={showForm || showBulk ? "x" : "user-plus"}
          onClick={() => { setShowForm((s) => !s); setShowBulk(false); }}>
          {showForm || showBulk ? "Fechar" : "Adicionar pessoa"}
        </Botao>}
      </div>

      {/* Filtro por ESTADO. Só aparece o que existe: sem ninguém pendente, a
          aba não nasce — um filtro que sempre volta vazio é ruído permanente.
          É a contagem do cabeçalho virando ação: o número diz quantos faltam,
          a aba mostra QUEM. */}
      {/* Os DOIS filtros na mesma linha, porque fazem o mesmo trabalho: reduzir
          a lista. Antes o de área tinha ficado colado na busca — que é outra
          coisa (buscar é procurar UM, filtrar é escolher um recorte). Controle
          e efeito juntos, e controles parecidos perto uns dos outros. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
      {isAdmin && (pendentes.length > 0 || inativos.length > 0) && (
        <div>
          <Abas
            valor={filtro}
            onMuda={(v) => setFiltro(v)}
            ariaLabel="Filtrar pessoas por estado"
            itens={[
              { valor: "equipe" as const, rotulo: `Equipe · ${initial.filter((r) => r.active).length}` },
              ...(pendentes.length ? [{ valor: "pendentes" as const, rotulo: `Não entraram · ${pendentes.length}` }] : []),
              ...(inativos.length ? [{ valor: "inativos" as const, rotulo: `Inativos · ${inativos.length}` }] : []),
            ]}
          />
        </div>
      )}
        {/* Só nasce com mais de uma área: um filtro de uma opção só não filtra
            nada, e ocuparia espaço permanente pra isso. A contagem em cada
            opção deixa escolher sem precisar entrar pra ver quantos são. */}
        {areas.length > 1 && (
          <GlassSelect
            value={area}
            onChange={setArea}
            placeholder="Todas as áreas"
            title="Filtrar por área"
            style={{ width: 200, minHeight: "var(--tap)" }}
            options={[
              { value: "", label: "Todas as áreas" },
              ...areas.map(([nome, n]) => ({ value: nome, label: `${nome} · ${n}` })),
            ]}
          />
        )}
      </div>

      {(showForm || showBulk) && (
        <>
          {/* "Vários de uma vez" é a MESMA tarefa numa quantidade diferente, e
              por isso vive aqui dentro, junto do formulário de um — não como um
              segundo botão disputando espaço com o primeiro. Quem quer cadastrar
              uma pessoa não precisa nem ver esta escolha. */}
          <div style={{ marginTop: 16 }}>
            <Abas
              valor={showBulk ? "varios" : "uma"}
              onMuda={(v) => { setShowBulk(v === "varios"); setShowForm(v === "uma"); }}
              ariaLabel="Quantas pessoas adicionar"
              itens={[
                { valor: "uma" as const, rotulo: "Uma pessoa" },
                { valor: "varios" as const, rotulo: "Vários de uma vez" },
              ]}
            />
          </div>
          {showForm && <NovoForm form={form} set={set} setForm={setForm} erpUsers={erpUsers} busy={busy} onPhoto={onPhoto} onSubmit={create} />}
          {showBulk && <BulkForm onDone={() => router.refresh()} />}
        </>
      )}

      {/* Recentes */}
      {!busca && recentesRows.length > 0 && (
        <>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginTop: 26, marginBottom: 10 }}>Recentes</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {recentesRows.map((r) => <PessoaChip key={r.id} row={r} onClick={() => abrir(r.id)} />)}
          </div>
        </>
      )}

      {/* Uma lista só, em ordem alfabética. O cabeçalho da lista some junto:
          com o filtro de área logo acima, um título repetindo "Equipe" ou o
          nome da área escolhida seria dizer duas vezes a mesma coisa. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 230px), 1fr))", gap: 12, marginTop: 22 }}>
        {ordenados.map((r) => <PessoaCard key={r.id} row={r} contexto={filtro} onClick={() => abrir(r.id)} />)}
      </div>

      {ordenados.length === 0 && (
        <div style={{ marginTop: 20 }}>
          <Momento
            icone={busca ? "search" : filtro === "pendentes" ? "circle-check" : "users"}
            titulo={busca ? "Ninguém com esse nome"
              : filtro === "pendentes" ? "Todo mundo já entrou"
                : filtro === "inativos" ? "Ninguém inativo" : "Nenhuma pessoa ainda"}
            texto={busca ? `Nada encontrado para “${busca.trim()}”. A busca olha nome, usuário, área e perfil.`
              : filtro === "pendentes" ? "Ninguém está esperando o primeiro acesso — a equipe inteira já tem senha."
                : filtro === "inativos" ? "Quem for desativado aparece aqui, e a conta continua guardada."
                  : "Adicione a primeira pessoa e ela recebe acesso no primeiro login."}
            tom={filtro === "pendentes" && !busca ? "sucesso" : "vazio"}
            acao={busca
              ? <Botao icone="x" onClick={() => setBusca("")}>Limpar busca</Botao>
              : filtro !== "equipe"
                ? <Botao icone="users" onClick={() => setFiltro("equipe")}>Ver a equipe</Botao>
                : undefined}
          />
        </div>
      )}

      {/* Ajustes da EMPRESA — depois da equipe, com um título que diz de quem
          é o assunto. Não são "mais quatro coisas da tela": são a configuração
          da casa, e por isso ficam abaixo do que se usa todo dia e somem
          inteiros quando a tela passa a falar de UMA pessoa. */}
      {ajustes && (
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em" }}>Ajustes da empresa</h2>
          {ajustes}
        </div>
      )}
    </div>
  );
}

// ── Aba Atividades do colaborador — lista REAL com filtros funcionais ────────
// (substitui os cards-placeholder que não filtravam nada)
interface AtvRow { id: string; tarefa: string; categoria: string; status: string; prazo: string | null; quantidade_alvo: number; quantidade_feita: number }
function AtividadesTab({ colaboradorId }: { colaboradorId: string }) {
  const [itens, setItens] = useState<AtvRow[] | null>(null);
  const [f, setF] = useState<"todas" | "pendente" | "em_andamento" | "concluida">("todas");
  useEffect(() => {
    setItens(null);
    fetch(`/api/atividades?para=${colaboradorId}`, { cache: "no-store" }).then((r) => r.json())
      .then((d) => setItens(d.atividades ?? [])).catch(() => setItens([]));
  }, [colaboradorId]);
  const lista = itens ?? [];
  const n = (s: string) => lista.filter((a) => a.status === s).length;
  const visiveis = lista.filter((a) => f === "todas" || a.status === f);
  const COR: Record<string, string> = { pendente: "var(--atencao)", em_andamento: "var(--primary-texto)", concluida: "var(--ok)" };
  const LBL: Record<string, string> = { pendente: "Pendente", em_andamento: "Em andamento", concluida: "Concluída" };
  const CHIPS = [["todas", `Todas ${lista.length}`], ["pendente", `Pendentes ${n("pendente")}`], ["em_andamento", `Em andamento ${n("em_andamento")}`], ["concluida", `Concluídas ${n("concluida")}`]] as const;
  return (
    <div className="glass glass-spec" style={{ padding: 20, borderRadius: "var(--r-md)" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {CHIPS.map(([k, l]) => (
          <button key={k} onClick={() => setF(k)} style={{ padding: "7px 13px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: 700, border: f === k ? "none" : "1px solid var(--border)", background: f === k ? "var(--primary-acao, var(--primary))" : "var(--surface)", color: f === k ? "var(--on-primary, #fff)" : "var(--text-dim)" }}>{l}</button>
        ))}
      </div>
      {itens === null ? <div style={{ color: "var(--text-dim)", fontSize: 13, padding: 10 }}>Carregando…</div>
        : visiveis.length === 0 ? <div style={{ color: "var(--text-dim)", fontSize: 13, padding: 10 }}>{f === "todas" ? "Nenhuma atividade pra esta pessoa." : "Nada nesse filtro."}</div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {visiveis.slice(0, 40).map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: "var(--r-sm)", background: "var(--surface)", border: "1px solid var(--border)" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: COR[a.status] ?? "var(--text-dim)", flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.tarefa}</div>
                  <div style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{a.categoria}{a.quantidade_alvo > 0 ? ` · ${a.quantidade_feita}/${a.quantidade_alvo}` : ""}</div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: COR[a.status] ?? "var(--text-dim)" }}>{LBL[a.status] ?? a.status}</span>
              </div>
            ))}
          </div>}
    </div>
  );
}

// ── Cards/Chips de pessoa ──
function PessoaCard({ row, onClick, contexto = "equipe" }: {
  row: ColabRow;
  onClick: () => void;
  /**
   * De qual lista este cartão faz parte. Dentro da aba "Não entraram", dizer
   * "aguardando 1º acesso" em cada um dos 17 cartões é repetir a DEFINIÇÃO da
   * aba dezessete vezes — o rótulo ocupa a linha e não acrescenta nada. Ali o
   * que falta saber é o USUÁRIO, que é o que a pessoa vai digitar pra entrar.
   */
  contexto?: "equipe" | "pendentes" | "inativos";
}) {
  const e = emp(row);
  return (
    // Inativo: NÃO lava o card inteiro (as fotos ficavam "mais claras" que as
    // outras) — só a foto fica em cinza e ganha o selo "inativo".
    <button onClick={onClick} className="glass glass-spec" style={{ display: "flex", alignItems: "center", gap: 12, padding: 14, borderRadius: "var(--r-md)", border: "none", cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
      <span style={{ display: "inline-flex", flex: "none", filter: row.active ? "none" : "grayscale(1)", opacity: row.active ? 1 : 0.8 }}>
        <Avatar url={e.photo_url} name={row.name} size={44} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: row.active ? "var(--text)" : "var(--text-dim)" }}>{row.name}</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {[e.departamento, (e.perfis && e.perfis.length ? e.perfis.join(", ") : e.perfil)].filter(Boolean).join(" · ") || ROLE_LABEL[row.role]}
        </div>
        {contexto === "pendentes"
          ? <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>entra como <strong style={{ color: "var(--text)", fontWeight: 700 }}>{row.username}</strong></div>
          : <>
            {!row.active && contexto !== "inativos" && <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 2 }}>inativo</div>}
            {row.active && !row.password_set && <div style={{ fontSize: 10.5, color: "var(--atencao)", marginTop: 2 }}>aguardando 1º acesso</div>}
          </>}
      </div>
    </button>
  );
}
function PessoaChip({ row, onClick }: { row: ColabRow; onClick: () => void }) {
  const e = emp(row);
  return (
    <button onClick={onClick} className="glass-spec" style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 14px 8px 8px", borderRadius: 999, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text)" }}>
      <Avatar url={e.photo_url} name={row.name} size={28} />
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{row.name.split(" ")[0]}</span>
    </button>
  );
}

// ── Ficha da pessoa: identidade fixa + um assunto ao lado ────────────────────
// Eram SEIS abas (Resumo, Ponto, Permissões, Métricas, Atividades, Dispositivos)
// pra uma pessoa só — e a identidade dela sumia da tela assim que você saía do
// Resumo. Pra conferir de quem era aquela grade de permissões, voltava.
//
// Agora quem é a pessoa fica à ESQUERDA e não sai da vista; à direita troca o
// assunto. Nada foi removido: Métricas e Atividades são a mesma pergunta ("o
// que essa pessoa entregou"), e os aparelhos dela são um detalhe da jornada,
// não uma aba com quatro cartões vazios.
type DetTab = "jornada" | "permissoes" | "desempenho";
const DET_VALIDAS: DetTab[] = ["jornada", "permissoes", "desempenho"];
// Quem tinha uma das seis abas antigas guardada cai no assunto que a engoliu —
// nunca numa tela em branco.
const resolveDet = (v: string): DetTab =>
  (DET_VALIDAS as string[]).includes(v) ? (v as DetTab)
    : v === "metricas" || v === "atividades" || v === "metas" ? "desempenho"
      : "jornada";

function ColaboradorDetalhe({
  row, isSelf, isAdmin, busy, erpUsers, templates, areasQueConcedo,
  empresasFinanceiro, restricoesFinanceiro, onBack, onSave, onReset, onToggle, onDelete,
}: {
  row: ColabRow; isSelf: boolean; isAdmin: boolean; busy: boolean; erpUsers: ErpUser[]; templates: Template[];
  areasQueConcedo: string[];
  empresasFinanceiro: { id: string; nome: string }[];
  restricoesFinanceiro: Record<string, string[]>;
  onBack: () => void; onSave: (id: string, body: Record<string, unknown>, ok: string) => void;
  onReset: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const e = emp(row);
  const [tabRaw, setTab] = useSticky<string>("pessoas.det.tab", "jornada");   // persiste no reload
  const salva = resolveDet(tabRaw);
  // Sem a área de admin a aba de acesso não existe: cair nela deixaria a
  // coluna da direita vazia sem explicação.
  const tab: DetTab = salva === "permissoes" && !isAdmin ? "jornada" : salva;
  const [editando, setEditando] = useState(false);
  // Editar é sobre a PESSOA (o cartão da esquerda), não sobre o assunto aberto
  // — trocar de pessoa com o formulário aberto entregaria o cadastro de uma
  // com os campos preenchidos por outra.
  useEffect(() => { setEditando(false); }, [row.id]);

  const abas: { valor: DetTab; rotulo: React.ReactNode }[] = [
    { valor: "jornada", rotulo: <><Icon name="hourglass-high" size={14} color="currentColor" /> Ponto & jornada</> },
    ...(isAdmin ? [{ valor: "permissoes" as DetTab, rotulo: <><Icon name="shield-check" size={14} color="currentColor" /> Acesso</> }] : []),
    { valor: "desempenho", rotulo: <><Icon name="chart-bar" size={14} color="currentColor" /> Desempenho</> },
  ];

  return (
    <div>
      <Botao variante="sutil" icone="chevron-left" onClick={onBack} style={{ alignSelf: "flex-start" }}>Voltar</Botao>

      <div className="ficha">
        {/* Quem é a pessoa. Fica no mesmo lugar o tempo todo — é a resposta
            permanente pra "de quem é isso que estou mexendo". */}
        <div className="ficha-lado">
          <PerfilCard row={row} data={e} isSelf={isSelf} isAdmin={isAdmin} busy={busy}
            onEditar={() => setEditando(true)} onReset={onReset} onToggle={onToggle} onDelete={onDelete} />
        </div>

        {/* O assunto. Editar o cadastro toma esta coluna inteira: é uma tarefa
            com começo e fim, não um sétimo assunto disputando espaço. */}
        <div style={{ minWidth: 0 }}>
          {editando ? (
            <EditarCadastro row={row} data={e} isAdmin={isAdmin} busy={busy} onSave={onSave} onFim={() => setEditando(false)} />
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <Abas valor={tab} onMuda={(v) => setTab(v)} ariaLabel={`Assuntos de ${row.name}`} itens={abas} />
              </div>
              {tab === "jornada" && <JornadaTab row={row} data={e} />}
              {tab === "permissoes" && isAdmin && <PermissoesTab
                nivel={(row.role === "admin") ? 5 : (e.nivel ?? 1)} permissoes={e.permissoes}
                paginaInicial={e.pagina_inicial ?? null} row={row} isSelf={isSelf} busy={busy}
                areasQueConcedo={areasQueConcedo} empresasFinanceiro={empresasFinanceiro}
                empresasMarcadasInicial={restricoesFinanceiro[row.id] ?? []}
                onSave={onSave}
              />}
              {tab === "desempenho" && <DesempenhoTab row={row} data={e} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Ponto & jornada ─────────────────────────────────────────────────────────
// O ponto da pessoa, a escala que ela cumpre e os aparelhos em que ela aparece.
// Os "Dispositivos" eram uma aba própria com quatro cartões vazios ("—" quatro
// vezes): uma porta inteira que só prometia. Viram uma linha de etiquetas no fim
// do assunto a que pertencem — a promessa continua, sem cobrar um clique.
export function JornadaTab({ row, data }: { row: ColabRow; data: EmployeeData }) {
  const escala = getEscala(data.escala);
  const mesas = data.mesas && data.mesas.length ? data.mesas : (data.mesa ? [data.mesa] : []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <PontoTab colaboradorId={row.id} nome={row.name} />

      <div className="glass glass-spec" style={{ padding: 20, borderRadius: "var(--r-md)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Icon name="clock" size={16} color="var(--text-dim)" />
          <strong style={{ fontSize: 14 }}>Escala</strong>
        </div>
        {escala ? (
          <div style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
            <strong style={{ color: "var(--text)" }}>{escala.nome}</strong> · {horasSemana(escala)}h por semana<br />
            Hoje: {expedienteHoje(escala)} — {escala.descricao}
          </div>
        ) : (
          <div style={{ fontSize: 13.5, color: "var(--text-dim)" }}>Sem escala definida. Defina em <strong style={{ color: "var(--text)" }}>Editar</strong>, no cartão ao lado.</div>
        )}
      </div>

      <div className="glass glass-spec" style={{ padding: 20, borderRadius: "var(--r-md)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Icon name="device-tv" size={16} color="var(--text-dim)" />
          <strong style={{ fontSize: 14 }}>Aparelhos</strong>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.tablet
            ? (mesas.length ? mesas : ["todas as mesas do setor"]).map((m) => (
              <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999, background: "color-mix(in srgb, var(--primary) 12%, var(--surface))", border: "1px solid color-mix(in srgb, var(--primary) 40%, var(--border))" }}>
                <Icon name="device-mobile" size={13} color="var(--primary-texto)" /> {m}
              </span>
            ))
            : <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Não aparece em nenhum tablet de produção.</span>}
        </div>
      </div>
    </div>
  );
}

// ── Desempenho ──────────────────────────────────────────────────────────────
// "Métricas" e "Atividades" respondiam a mesma pergunta em duas portas: quanto
// ela entregou, e o quê. Os números viram o cabeçalho do que os produziu.
export function DesempenhoTab({ row, data }: { row: ColabRow; data: EmployeeData }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MetricasTab row={row} data={data} />
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>Atividades</h3>
        <AtividadesTab colaboradorId={row.id} />
      </div>
    </div>
  );
}

// ── Cartão de identidade (coluna fixa) ──────────────────────────────────────
// Quem é a pessoa, os dados que se consultam sem editar, e o que se FAZ com a
// conta dela. Uma linha por dado, rótulo à esquerda e valor à direita: a mesma
// posição em todas as fichas, então achar "Usuário" não custa leitura.
export function PerfilCard({ row, data, isSelf, isAdmin, busy, onEditar, onReset, onToggle, onDelete }: {
  row: ColabRow; data: EmployeeData; isSelf: boolean; isAdmin: boolean; busy: boolean;
  onEditar: () => void; onReset: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const [dados, setDados] = useState(false);   // só vale no celular (ver globals.css)
  const ehAdmin = !!data.permissoes?.admin || row.role === "admin";
  const funcoes = data.perfis && data.perfis.length ? data.perfis.join(", ") : (data.perfil || "");
  const linhas: [string, string][] = [
    ["Telefone", data.telefone || "—"],
    ["Departamento", data.departamento || "—"],
    ["Funções", funcoes || "—"],
    ...(setorDoDepartamento(data.departamento) === "Produção" ? [["Especialidade", data.especialidade || "Ambos"] as [string, string]] : []),
    ["Escala", getEscala(data.escala)?.nome || "—"],
    ["Expediente hoje", getEscala(data.escala) ? expedienteHoje(getEscala(data.escala)!) : "—"],
    ["Aparece no tablet", data.tablet ? ((data.mesas && data.mesas.length) ? data.mesas.join(", ") : (data.mesa ? data.mesa : "todas do setor")) : "Não"],
    ["Admissão", data.data_admissao ? data.data_admissao.split("-").reverse().join("/") : "—"],
    ["Usuário", `@${row.username}`],
    ["E-mail (login)", row.email || "—"],
  ];
  // Selos: só o que está FORA do normal. "Ativo" em todo mundo é ruído — o
  // normal não precisa de etiqueta, o desvio precisa.
  const selos: [string, string][] = [
    ...(ehAdmin ? [["Administrador", "var(--primary-texto)"] as [string, string]] : []),
    ...(!row.active ? [["Inativo", "var(--perigo)"] as [string, string]] : []),
    ...(row.active && !row.password_set ? [["Aguardando 1º acesso", "var(--atencao)"] as [string, string]] : []),
  ];

  return (
    <div className="glass glass-spec" style={{ padding: 20, borderRadius: "var(--r-md)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ display: "inline-flex", flex: "none", filter: row.active ? "none" : "grayscale(1)" }}>
          <Avatar url={data.photo_url} name={row.name} size={64} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ fontSize: 21, fontWeight: 800, letterSpacing: "-0.015em", lineHeight: 1.15 }}>{row.name}</h1>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>
            {[data.departamento, funcoes].filter(Boolean).join(" · ") || "sem área definida"}
          </div>
        </div>
      </div>

      {selos.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          {selos.map(([txt, cor]) => (
            <span key={txt} style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.2, padding: "4px 10px", borderRadius: 999, color: cor, background: `color-mix(in srgb, ${cor} 14%, transparent)` }}>{txt}</span>
          ))}
        </div>
      )}

      {/* O botão só existe no celular (a regra mora no globals.css): no desktop
          os dados ficam sempre à vista, porque a coluna sobra. */}
      <button onClick={() => setDados((v) => !v)} aria-expanded={dados} className="ficha-verdados"
        style={{ display: "none", alignItems: "center", gap: 8, width: "100%", minHeight: "var(--tap)", marginTop: 12, padding: "0 2px", background: "none", border: "none", borderTop: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
        <span style={{ flex: 1 }}>Dados cadastrais</span>
        <span style={{ display: "grid", placeItems: "center", transform: dados ? "rotate(180deg)" : "none", transition: "transform .2s var(--ease-entra)" }}>
          <Icon name="chevron-down" size={16} color="var(--text-dim)" />
        </span>
      </button>

      <div className={dados ? "ficha-dados aberto" : "ficha-dados"} style={{ marginTop: 16, display: "flex", flexDirection: "column" }}>
        {linhas.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, fontSize: 13, padding: "8px 0", borderTop: "1px solid var(--border)" }}>
            <span style={{ color: "var(--text-dim)", flex: "none" }}>{k}</span>
            <span style={{ fontWeight: 600, textAlign: "right", minWidth: 0, overflowWrap: "anywhere" }}>{v}</span>
          </div>
        ))}
      </div>

      {data.observacoes && <p className={dados ? "ficha-dados aberto" : "ficha-dados"} style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 12, lineHeight: 1.5 }}><strong>Obs:</strong> {data.observacoes}</p>}

      {/* Editar dados de RH: quem tem a área. Senha, ativar e excluir mexem no
          ACESSO da pessoa — seguem só do admin, igual à API. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
        <Botao icone="pencil" variante="primario" bloco onClick={onEditar}>Editar dados</Botao>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isAdmin && <Botao icone="key" tamanho="sm" disabled={busy} onClick={onReset}>Link de acesso</Botao>}
          {isAdmin && !isSelf && <Botao icone={row.active ? "user-off" : "user-check"} tamanho="sm" disabled={busy} onClick={onToggle}>{row.active ? "Desativar" : "Ativar"}</Botao>}
          {isAdmin && !isSelf && <Botao icone="trash" variante="perigo" tamanho="sm" disabled={busy} onClick={onDelete}>Excluir</Botao>}
        </div>
      </div>
    </div>
  );
}

// ── Editar cadastro ─────────────────────────────────────────────────────────
// O mesmo formulário de sempre, agora ocupando a coluna do assunto: enquanto
// se edita, não há aba pra trocar — é uma tarefa só, com Salvar e Cancelar.
export function EditarCadastro({ row, data, isAdmin, busy, onSave, onFim }: {
  row: ColabRow; data: EmployeeData; isAdmin: boolean; busy: boolean;
  onSave: (id: string, body: Record<string, unknown>, ok: string) => void;
  onFim: () => void;
}) {
  const [name, setName] = useState(row.name);
  const [username, setUsername] = useState(row.username);
  const [email, setEmail] = useState(row.email ?? "");
  const [puxandoEmail, setPuxandoEmail] = useState(false);
  // Se o colaborador está ligado ao ERP, puxa o e-mail cadastrado lá (usuarios.email).
  async function puxarEmailDoErp() {
    setPuxandoEmail(true);
    try {
      const r = await fetch(`/api/colaboradores/${row.id}/erp-email`);
      const j = await r.json();
      if (r.ok && j.email) setEmail(j.email);
      else toast(j.error === "sem_vinculo_erp" ? "Sem vínculo com o ERP (defina o erp_user_id)." : j.error === "sem_email_no_erp" ? "O ERP não tem e-mail pra este usuário." : "Não consegui puxar do ERP.", "erro");
    } catch { toast("Não consegui puxar do ERP.", "erro"); }
    setPuxandoEmail(false);
  }
  const [role, setRole] = useState<Role>(row.role);
  const [departamento, setDepartamento] = useState(data.departamento ?? "");
  const [perfis, setPerfis] = useState<string[]>(data.perfis ?? []);
  const [especialidade, setEspecialidade] = useState(data.especialidade ?? "");
  const [escala, setEscala] = useState(data.escala ?? "");
  const [nivel, setNivel] = useState(String(data.nivel ?? 1));
  const [telefone, setTelefone] = useState(data.telefone ?? "");
  const [adm, setAdm] = useState(data.data_admissao ?? "");
  const [obs, setObs] = useState(data.observacoes ?? "");
  const [photo, setPhoto] = useState(data.photo_url ?? "");
  // Código do leitor de estoque: NUNCA chega preenchido do servidor (só se HÁ
  // um definido, ver EmployeeData.codigo_acesso) — "nenhuma" é o estado padrão
  // e significa "não mexer nisso ao salvar". Só "definir" ou "limpar" entram
  // no corpo do PATCH; abrir o campo e não digitar nada não é uma decisão.
  const [codigoAcao, setCodigoAcao] = useState<"nenhuma" | "definir" | "limpar">("nenhuma");
  const [codigoValor, setCodigoValor] = useState("");
  const [tablet, setTablet] = useState(!!data.tablet);
  // Tablets onde a pessoa aparece (multi). Cai pro `mesa` legado quando `mesas` vazio.
  const [mesasSel, setMesasSel] = useState<string[]>(data.mesas && data.mesas.length ? data.mesas : (data.mesa ? [data.mesa] : []));
  const [mesas, setMesas] = useState<string[]>([]);   // tablets disponíveis (dos devices)
  const [up, setUp] = useState(false);
  const toggleMesa = (m: string) => setMesasSel((s) => s.includes(m) ? s.filter((x) => x !== m) : [...s, m]);

  useEffect(() => {
    fetch("/api/devices").then((r) => r.json()).then((d) => {
      // Só tablets de PRODUÇÃO entram no seletor — o de ponto mostra todo mundo do cadastro.
      const nomes = [...new Set(((d.devices ?? []) as { nome_mesa: string | null; ativo?: boolean; tipo?: string }[]).filter((x) => x.ativo !== false && x.tipo !== "ponto").map((x) => x.nome_mesa).filter(Boolean) as string[])];
      setMesas(nomes);
    }).catch(() => {});
  }, []);

  async function onPhoto(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]; if (!file) return;
    setUp(true); try { setPhoto(await uploadFile(file)); } catch { /* */ } setUp(false);
  }

  const perfisDisp = perfisDe(departamento);
  return (
    <div className="glass glass-spec" style={{ padding: 22, borderRadius: "var(--r-md)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: 14 }}>
      <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}>
        <Icon name="pencil" size={16} color="var(--text-dim)" />
        <strong style={{ fontSize: 15 }}>Editar cadastro</strong>
      </div>
      <Field label="Nome"><input value={name} onChange={(ev) => setName(ev.target.value)} /></Field>
      {/* Usuário e e-mail são o LOGIN da pessoa: campo de admin (a API recusa
          dos demais, então mostrá-los seria prometer o que não se cumpre). */}
      {isAdmin && <Field label="Usuário — login (@)"><input value={username} onChange={(ev) => setUsername(slugUser(ev.target.value))} placeholder="ex: joao.silva" /></Field>}
      {isAdmin && <Field label="E-mail (login / recuperação)">
        <div style={{ display: "flex", gap: 6 }}>
          <input {...atributosDe("email")} type="email" value={email} onChange={(ev) => setEmail(ev.target.value)} placeholder="opcional — pra logar por e-mail" style={{ flex: 1, minWidth: 0 }} />
          {data.erp_user_id && <Botao onClick={puxarEmailDoErp} carregando={puxandoEmail} title="Puxar o e-mail cadastrado no ERP" style={{ flex: "none" }}>Puxar do ERP</Botao>}
        </div>
      </Field>}
      {/* Papel/Nível saíram: o ACESSO é controlado na aba "Permissões" (áreas +
          card "Administrador — acesso total"). */}
      <Field label="Departamento">
        <GlassSelect value={departamento} onChange={(v) => { setDepartamento(v); setPerfis([]); if (setorDoDepartamento(v) !== "Produção") setEspecialidade(""); }} placeholder="—"
          options={[{ value: "", label: "—" }, ...DEPARTAMENTOS.map((d) => ({ value: d, label: d }))]} />
      </Field>
      <Field label="Funções (marque uma ou mais)">
        <PerfisChips disponiveis={perfisDisp} selecionados={perfis}
          onToggle={(p) => setPerfis((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p])} />
      </Field>
      {/* Especialidade (Chancela/Carimbo) só faz sentido pra quem é da PRODUÇÃO. */}
      {setorDoDepartamento(departamento) === "Produção" && (
        <Field label="Especialidade (produção)">
          <GlassSelect value={especialidade} onChange={setEspecialidade} placeholder="— nenhuma (faz tudo) —"
            options={[{ value: "", label: "— nenhuma (faz tudo) —" }, ...ESPECIALIDADES.map((e) => ({ value: e, label: e }))]} />
        </Field>
      )}
      <Field label="Escala / expediente">
        <GlassSelect value={escala} onChange={setEscala} placeholder="— não definida —"
          options={[{ value: "", label: "— não definida —" }, ...ESCALAS.map((e) => ({ value: e.key, label: e.nome }))]} />
      </Field>
      <Field label="Tablet de produção">
        <button type="button" onClick={() => setTablet((v) => !v)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: "var(--r-sm)", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%", justifyContent: "flex-start", border: "1px solid var(--border)", color: tablet ? "var(--on-primary, #fff)" : "var(--text-dim)", background: tablet ? "var(--primary-acao, var(--primary))" : "var(--surface)" }}>
          <Icon name={tablet ? "circle-check" : "circle"} size={16} color={tablet ? "#fff" : "var(--text-dim)"} /> {tablet ? "Aparece no tablet" : "Não aparece no tablet"}
        </button>
      </Field>
      {tablet && (
        <Field label="Em quais tablets aparece">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {mesas.length === 0 && <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Nenhum tablet cadastrado ainda.</span>}
            {mesas.map((m) => {
              const on = mesasSel.includes(m);
              return (
                <button key={m} type="button" onClick={() => toggleMesa(m)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: "var(--r-sm)", fontSize: 13, fontWeight: 600, cursor: "pointer", border: "1px solid var(--border)", color: on ? "var(--on-primary, #fff)" : "var(--text-dim)", background: on ? "var(--primary-acao, var(--primary))" : "var(--surface)" }}>
                  <Icon name={on ? "circle-check" : "circle"} size={15} color={on ? "#fff" : "var(--text-dim)"} /> {m}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 6 }}>
            {mesasSel.length === 0 ? "Nenhum selecionado → aparece em todas as mesas do setor." : `Aparece em: ${mesasSel.join(", ")}`}
          </div>
        </Field>
      )}
      <Field label="Telefone / WhatsApp"><input value={telefone} onChange={(ev) => setTelefone(ev.target.value)} /></Field>
      <Field label="Data de admissão"><GlassDate value={adm} onChange={setAdm} placeholder="Selecionar data" /></Field>
      <Field label="Foto">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {photo && <img src={photo} alt="" style={{ width: 36, height: 36, borderRadius: "var(--r-xs)", objectFit: "cover" }} />}
          <input type="file" accept="image/*" onChange={onPhoto} />
        </div>
      </Field>
      {/* Login OFFLINE no leitor de estoque do galpão — campo de PODER (quem
          tem o código pode baixar estoque em nome desta pessoa), então só
          admin vê. O valor NUNCA aparece: só "definido"/"nenhum" (ver
          CodigoLeitorEstoque), pra não virar print numa conversa de grupo. */}
      {isAdmin && (
        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="Código do leitor de estoque">
            <CodigoLeitorEstoque definido={!!data.codigo_acesso} acao={codigoAcao} valor={codigoValor} onAcao={setCodigoAcao} onValor={setCodigoValor} />
          </Field>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 6, lineHeight: 1.5 }}>
            Só serve pra entrar no leitor de estoque do galpão (bipagem offline, sem rede). Não é a senha do ERP e não abre mais nada.
          </p>
        </div>
      )}
      <div style={{ gridColumn: "1 / -1" }}>
        <Field label="Observações"><input value={obs} onChange={(ev) => setObs(ev.target.value)} /></Field>
      </div>
      <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Botao variante="primario" icone="check" disabled={busy || up}
          onClick={() => { onSave(row.id, { name,
            // Campos de PODER (login, papel, nível) só vão no corpo quando quem
            // salva é admin — a API recusa o PUT inteiro se vierem dos demais.
            ...(isAdmin ? { ...(username && username !== row.username ? { username } : {}), email: (email.trim() || null), role, nivel: Number(nivel) || 1 } : {}),
            // Código do leitor: só entra no corpo quando a pessoa de fato agiu
            // ("definir" com algo digitado, ou "limpar") — abrir o campo e
            // desistir sem digitar não pode virar uma limpeza acidental.
            ...(isAdmin && codigoAcao === "limpar" ? { codigo_acesso: null } : {}),
            ...(isAdmin && codigoAcao === "definir" && codigoValor.trim() ? { codigo_acesso: codigoValor.trim() } : {}),
            departamento: departamento || null, perfis, perfil: perfis[0] ?? null, especialidade: especialidade || null, escala: escala || null, tablet, mesas: tablet ? mesasSel : [], mesa: tablet ? (mesasSel[0] || null) : null, telefone: telefone || null, data_admissao: adm || null, observacoes: obs || null, photo_url: photo || null }, "Colaborador atualizado."); onFim(); }}>
          Salvar
        </Botao>
        <Botao icone="x" onClick={onFim}>Cancelar</Botao>
      </div>
    </div>
  );
}

// Acesso por ÁREA (modelo simples): grade de quadradinhos. Ligado = tem acesso;
// desligado = não vê nem acessa. Sem níveis/templates. Admin = tudo (travado).
// Enquanto o admin não configura, os cards mostram o acesso atual (derivado do
// nível antigo) — ao salvar, a grade vira a fonte da verdade.
interface HistItem { id: string; qtd: number; alterado_por_nome: string | null; created_at: string }
export function PermissoesTab({
  nivel, permissoes, paginaInicial, row, isSelf, busy, areasQueConcedo,
  empresasFinanceiro, empresasMarcadasInicial, onSave,
}: {
  nivel: number; permissoes: Record<string, boolean> | null; paginaInicial: string | null;
  row: ColabRow; isSelf: boolean; busy: boolean; areasQueConcedo: string[];
  empresasFinanceiro: { id: string; nome: string }[];
  /** O que já está gravado em `fin_acessos` para esta pessoa. Vazio = sem restrição. */
  empresasMarcadasInicial: string[];
  onSave: (id: string, body: Record<string, unknown>, ok: string) => void;
}) {
  const adminTravado = row.role === "admin";   // legado: admin pelo PAPEL (grade travada)
  const [ehAdmin, setEhAdmin] = useState(!!permissoes?.admin);   // admin pela PERMISSÃO
  const bloqueado = adminTravado || isSelf || ehAdmin;   // grade travada quando admin (papel ou permissão)
  // Área RESTRITA (TridiMarket) NÃO entra em "acesso total": ela continua
  // editável mesmo com a grade travada por admin, porque é a única forma de
  // concedê-la. Travar junto deixaria a área inalcançável justamente para
  // quem mais provavelmente vai recebê-la.
  // A grade inteira trava para admin ("acesso total" já concede tudo) — MENOS
  // as restritas, que não vêm do acesso total e por isso continuam sendo
  // decididas uma a uma. Só o próprio dono da ficha nunca mexe: ninguém se
  // concede o cofre sozinho.
  //
  // E área restrita com administrador próprio (o Financeiro declara
  // `financeiro:acessos`) só é editável por quem TEM essa chave. Sem isso,
  // qualquer admin daria o cofre a si mesmo pela ficha de um colega — a área
  // restrita protegia contra concessão em bloco, não contra alguém marcando
  // de propósito. O `areasQueConcedo` vem do servidor, e a trava que VALE é a
  // do PUT /api/colaboradores/[id]: esta aqui só evita oferecer um clique que
  // seria desfeito na gravação.
  const administro = (a: Area) => !a.restrita || areasQueConcedo.includes(a.key);
  const travadaPara = (a: Area) => a.restrita ? (isSelf || !administro(a)) : bloqueado;
  const subTravada = (a: Area) => a.restrita ? (isSelf || !administro(a)) : bloqueado;

  // Quais empresas esta pessoa vê no Financeiro. Só existe pergunta quando
  // QUEM ESTÁ NA TELA administra a área — mostrar o quadradinho travado para
  // quem não administra seria a mesma pegadinha do resto da grade.
  //
  // Vem da área REAL do catálogo, não de um objeto montado na mão: `administro`
  // olha `.restrita`, e um objeto sem esse campo faria `!a.restrita` dar `true`
  // sozinho — ou seja, "administro" mentindo "sim" pra qualquer um.
  const financeiroArea = AREAS.find((a) => a.key === "financeiro");
  const souAdminDoFinanceiro = !!financeiroArea && administro(financeiroArea);
  const [empresasMarcadas, setEmpresasMarcadas] = useState<string[]>(empresasMarcadasInicial);
  const alternarEmpresa = (id: string) =>
    setEmpresasMarcadas((atual) => (atual.includes(id) ? atual.filter((e) => e !== id) : [...atual, id]));
  const empresasMudaram = souAdminDoFinanceiro
    && JSON.stringify([...empresasMarcadas].sort()) !== JSON.stringify([...empresasMarcadasInicial].sort());

  // Estado inicial. `sel` guarda: chave da área (áreas SEM subs) + chaves de
  // sub-ação "area:sub" (áreas COM subs). Se já configurado, usa o mapa salvo;
  // senão deriva do nível (transição).
  const inicial = useMemo(() => {
    const set = new Set<string>();
    if (temPermissoesConfiguradas(permissoes)) {
      const p = permissoes!;
      for (const a of AREAS) {
        if (a.subs?.length) {
          const ligadas = a.subs.filter((s) => p[subFullKey(a.key, s.key)]);
          if (ligadas.length) ligadas.forEach((s) => set.add(subFullKey(a.key, s.key)));
          // back-compat: área antiga = subs de LEITURA. As SENSÍVEIS (pausar campanha
          // etc.) exigem grant EXPLÍCITO — igual ao resolver (chavesDasAreas). Antes
          // vinham marcadas por back-compat mas o resolver NÃO concedia → o admin
          // achava que tinha liberado "pausar" e o colaborador não conseguia.
          else if (p[a.key]) a.subs.forEach((s) => { if (!s.sensivel) set.add(subFullKey(a.key, s.key)); });
        } else if (p[a.key]) set.add(a.key);
      }
      // Cofre migrado de Pessoas → Infra: quem tinha `colaboradores:cofre` e ainda
      // não teve a chave nova decidida vê o quadradinho de Infra › Cofre marcado,
      // pra um salvamento inocente não revogar o cofre. Espelha `cofreHerdado`.
      if (cofreHerdado(p)) set.add("infraestrutura:cofre");
    } else {
      for (const k of modulosDoNivel(nivel)) {
        const a = AREAS.find((x) => x.key === k);
        if (!a) continue;
        // Nunca configurado (fallback por nível): idem — sensíveis ficam OFF até o
        // admin marcar de propósito (o resolver por nível também não as concede).
        // Visão por setor (`concede: set:*`) só vem pré-marcada no nível 4+, que
        // é o único que enxerga a empresa inteira no modelo por nível; abaixo
        // disso o setor depende do departamento e quem decide é o admin.
        if (a.subs?.length) a.subs.forEach((s) => {
          if (s.sensivel) return;
          if (s.concede?.some((k) => k.startsWith("set:")) && nivel < 4) return;
          set.add(subFullKey(a.key, s.key));
        });
        else set.add(k);
      }
    }
    return set;
  }, [permissoes, nivel]);

  const [sel, setSel] = useState<Set<string>>(inicial);
  useEffect(() => { setSel(new Set(inicial)); }, [inicial]);
  const [q, setQ] = useState("");
  // Categorias e áreas nascem FECHADAS, mostrando quanto está liberado. Abertas
  // de uma vez eram 15 áreas e ~40 quadradinhos empilhados sem hierarquia: pra
  // responder "essa pessoa vê o Financeiro?" a admin lia a tela inteira. Fechado
  // com contagem, a mesma pergunta custa um olhar; abrir é o degrau de quem vai
  // MEXER, não de quem só quer conferir.
  const [catsAbertas, setCatsAbertas] = useState<Set<string>>(new Set());
  const [areasAbertas, setAreasAbertas] = useState<Set<string>>(new Set());
  const alterna = (set: Set<string>, upd: (s: Set<string>) => void, k: string) => {
    const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); upd(n);
  };
  const [hist, setHist] = useState<HistItem[]>([]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/colaboradores/${row.id}/permissoes-historico`).then((r) => r.json())
      .then((d) => { if (vivo) setHist(d.historico ?? []); }).catch(() => {});
    return () => { vivo = false; };
  }, [row.id]);

  // Área "ligada" = área sem subs marcada, OU área com subs com qualquer sub on.
  const areaOn = (a: Area) => a.subs?.length ? a.subs.some((s) => sel.has(subFullKey(a.key, s.key))) : sel.has(a.key);
  // Uma SUB também pode ser restrita dentro de uma área comum (o bônus dos
  // marketplaces é salário numa aba de operação). Ela não vem do "acesso
  // total" — e a grade precisa desenhar isso, senão mostra o quadradinho aceso
  // numa chave que `mapaDePermissoes` grava como `false`: permissão que parece
  // ligada e acesso que volta 403.
  const vemNoBloco = (a: Area, s: { restrita?: boolean }) => adminTravado && !a.restrita && !s.restrita;
  // "Acesso total" liga tudo MENOS as restritas — que contam pelo que está
  // realmente marcado, senão o contador prometeria um acesso que não existe.
  // Restrita: NUNCA herda de "acesso total" — acende só pelo que foi marcado
  // nela. Com subs, quem acende é o conjunto delas (a chave crua da área nunca
  // entra no `sel`, porque quem se marca são os quadradinhos de dentro).
  const ligada = (a: Area) =>
    a.restrita ? (a.subs?.length ? areaOn(a) : sel.has(a.key))
               : ((adminTravado || ehAdmin) || areaOn(a));
  const total = AREA_KEYS.length;
  const liberadas = AREAS.filter(ligada).length;
  // Com subs, a chave crua da área nunca entra no `sel` — comparar só ela
  // fazia marcar/desmarcar o Financeiro não contar como alteração, e o botão
  // Salvar continuava apagado na ficha de um admin.
  const restritasMudaram = AREAS_RESTRITAS.some((a) => a.subs?.length
    ? a.subs.some((s) => sel.has(subFullKey(a.key, s.key)) !== inicial.has(subFullKey(a.key, s.key)))
    : sel.has(a.key) !== inicial.has(a.key))
    // Sub restrita em área comum entra pelo MESMO motivo: numa ficha de admin
    // só `restritasMudaram` acende o Salvar (o resto vem do "acesso total" e
    // nunca muda). Sem esta linha, marcar o bônus dos marketplaces na ficha de
    // um admin não sujava o formulário e o botão ficava apagado.
    || AREAS.some((a) => !a.restrita && (a.subs ?? []).some((s) =>
      s.restrita && sel.has(subFullKey(a.key, s.key)) !== inicial.has(subFullKey(a.key, s.key))));

  // ── Página inicial ────────────────────────────────────────────────────────
  // As opções saem da grade AO VIVO (`sel`), não do que está salvo: quem acabou
  // de ligar o TridiMarket escolhe o TridiMarket como entrada no mesmo save,
  // sem precisar gravar, recarregar e voltar aqui.
  const [inicioSel, setInicioSel] = useState(paginaInicial ?? "");
  useEffect(() => { setInicioSel(paginaInicial ?? ""); }, [paginaInicial]);
  const chavesAtuais = new Set<string>(["central", "minhas-atividades"]);
  for (const a of AREAS) {
    if (!a.restrita && (adminTravado || ehAdmin)) chavesAtuais.add(a.key);
    if (a.restrita ? sel.has(a.key) : areaOn(a)) chavesAtuais.add(a.key);
  }
  // "Central" é o padrão, então não se repete na lista.
  const opcoesInicio = [
    { value: "", label: "Padrão (Central)" },
    ...MODULES.filter((m) => m.ready && m.key !== "central" && chavesAtuais.has(m.key)).map((m) => ({ value: m.key, label: m.label })),
  ];
  // Área tirada depois de virar página inicial: o valor salvo continua no banco
  // mas não vale mais (o `/inicio` confere o acesso). A tela mostra isso em vez
  // de fingir que a escolha sumiu.
  const inicioOrfao = !!inicioSel && !opcoesInicio.some((o) => o.value === inicioSel);

  const dirty = !isSelf && (
    restritasMudaram ||
    empresasMudaram ||
    inicioSel !== (paginaInicial ?? "") ||
    (!adminTravado && (
      ehAdmin !== !!permissoes?.admin ||
      (!ehAdmin && (sel.size !== inicial.size || [...sel].some((k) => !inicial.has(k))))
    ))
  );
  const filtro = q.trim().toLowerCase();
  const bate = (a: Area) => !filtro || a.label.toLowerCase().includes(filtro) || a.descricao.toLowerCase().includes(filtro);

  // Toggle de ÁREA sem subs (liga/desliga a área inteira).
  async function toggle(a: Area) {
    if (travadaPara(a) || a.subs?.length) return;
    const on = sel.has(a.key);
    if (on && a.critica) {
      const ok = await confirmar(`Remover o acesso a ${a.label}?`, { detalhe: "Área sensível — o colaborador deixa de ver e acessar.", perigo: true });
      if (!ok) return;
    }
    setSel((prev) => { const n = new Set(prev); if (on) n.delete(a.key); else n.add(a.key); return n; });
  }
  // Toggle de uma SUB-ação dentro de uma área.
  function toggleSub(a: Area, subKey: string) {
    if (subTravada(a)) return;
    const fk = subFullKey(a.key, subKey);
    // Ligar uma sub liga junto o que ela EXIGE (responder precisa de ver): sem
    // isso o quadradinho fica marcado e a API barra do mesmo jeito.
    setSel((prev) => {
      const n = new Set(prev);
      if (n.has(fk)) { n.delete(fk); return n; }
      n.add(fk);
      return expandirImplicacoes(n);
    });
  }
  // "Liberar todas" NÃO inclui as restritas: entregar a carteira e a dívida de
  // todo mundo não pode ser efeito colateral de um atalho.
  const todasAsChaves = () => {
    const s = new Set<string>();
    for (const a of AREAS) {
      if (a.restrita) { if (sel.has(a.key)) s.add(a.key); continue; }
      a.subs?.length ? a.subs.forEach((x) => s.add(subFullKey(a.key, x.key))) : s.add(a.key);
    }
    return s;
  };

  function salvar() {
    // A regra do mapa mora em `lib/areas.ts` (`mapaDePermissoes`) porque é
    // regra de ACESSO, não de tela — e regra de acesso escondida dentro de um
    // componente não tem como ser testada. `expandirImplicacoes` entra antes:
    // quem marcou "Dar baixa" está marcando também "Ver o financeiro", que é o
    // que a API exige.
    const map = mapaDePermissoes({ ehAdmin, selecionadas: expandirImplicacoes(sel) });
    const corpo: Record<string, unknown> = { permissoes: map, pagina_inicial: inicioSel || null };
    // Só viaja quando ESTA pessoa administra o Financeiro — do contrário nem
    // aparece na tela, então não há o que enviar. O servidor confere de novo
    // (é a trava que vale); isto aqui só evita mandar um campo à toa.
    if (souAdminDoFinanceiro) corpo.financeiro_empresas = empresasMarcadas;
    onSave(row.id, corpo, "Acesso atualizado.");
  }

  const chip = (label: string, onClick: () => void, perigo?: boolean) => (
    <Botao tamanho="sm" variante={perigo ? "perigo" : "secundario"} onClick={onClick} disabled={bloqueado || busy}>{label}</Botao>
  );

  return (
    <div className="glass glass-spec" style={{ padding: 22, borderRadius: "var(--r-md)" }}>
      {/* Cabeçalho: contador + ações + busca */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Acesso às áreas</div>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2 }}>
            {adminTravado || ehAdmin
              ? "Acesso total ao sistema (não editável). As áreas restritas continuam liberáveis uma a uma abaixo."
              : isSelf ? "Você não pode mudar o próprio acesso."
              : "Ligue as áreas que este colaborador pode ver. As pessoais (Central, ponto, atividades, mensagens, perfil) já vêm liberadas."}
          </div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, padding: "8px 14px", borderRadius: 999, background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", whiteSpace: "nowrap" }}>
          {liberadas} de {total} áreas
        </div>
      </div>
      {/* Administrador — acesso total (substitui o antigo papel "admin"). */}
      {!adminTravado && !isSelf && (
        <button type="button" role="switch" aria-checked={ehAdmin} className="ui-chave-dono" onClick={() => setEhAdmin((v) => !v)} disabled={busy}
          style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", margin: "12px 0 4px", padding: "12px 14px", borderRadius: "var(--r-sm)", cursor: "pointer",
            border: `1px solid ${ehAdmin ? "color-mix(in srgb, var(--primary) 55%, var(--border))" : "var(--border)"}`, background: ehAdmin ? "color-mix(in srgb, var(--primary) 10%, var(--surface))" : "var(--surface)" }}>
          <Icon name="shield-check" size={20} color={ehAdmin ? "var(--primary-texto)" : "var(--text-dim)"} />
          <span style={{ flex: 1 }}>
            <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "var(--text)" }}>Administrador — acesso total</span>
            <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", marginTop: 1 }}>Vê e acessa tudo, incluindo Configurações. Substitui as áreas abaixo.</span>
          </span>
          <ChaveVisual ligado={ehAdmin} cor="var(--primary)" />
        </button>
      )}

      {!bloqueado && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "12px 0 16px" }}>
          {chip("Liberar todas", () => setSel(todasAsChaves()))}
          {chip("Remover todas", () => setSel(new Set()), true)}
          <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", display: "grid", placeItems: "center" }}><Icon name="search" size={15} color="var(--text-dim)" /></span>
            <input {...atributosDe("busca")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar área…"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 32px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5 }} />
          </div>
        </div>
      )}

      {/* Grade por categoria — cada módulo é uma sanfona que já diz, fechada,
          quanto está liberado dentro dele. Buscando, tudo abre: quem digitou
          "financeiro" quer ver a linha, não abrir a gaveta que a contém. */}
      {AREA_CATEGORIAS.map((cat) => {
        // `oculta` fica de fora: é área que foi ABSORVIDA por outra (Pessoas
        // pelo RH). A chave ainda gateia rotas, mas oferecer o quadradinho
        // deixaria dois cards fazendo a mesma pergunta — e a grade é onde
        // alguém decide, não onde o histórico do sistema aparece.
        const itens = AREAS.filter((a) => a.categoria === cat && !a.oculta && bate(a));
        if (!itens.length) return null;
        const nOn = itens.filter(ligada).length;
        const aberta = !!filtro || catsAbertas.has(cat);
        return (
          <div key={cat} style={{ marginBottom: 10, borderRadius: "var(--r-md)", border: "1px solid var(--border)", overflow: "hidden", background: "var(--surface)" }}>
            <button onClick={() => alterna(catsAbertas, setCatsAbertas, cat)} aria-expanded={aberta}
              style={{ width: "100%", minHeight: "var(--tap)", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left" }}>
              <strong style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--text)", flex: 1, minWidth: 0 }}>{cat}</strong>
              <span style={{ fontSize: 12, fontWeight: 700, color: nOn ? "var(--primary-texto)" : "var(--text-dim)", whiteSpace: "nowrap" }}>{nOn} de {itens.length}</span>
              <span style={{ display: "grid", placeItems: "center", flex: "none", transform: aberta ? "rotate(180deg)" : "none", transition: "transform .2s var(--ease-entra)" }}>
                <Icon name="chevron-down" size={16} color="var(--text-dim)" />
              </span>
            </button>

            {aberta && (
              /* Linhas uniformes (uma área por linha) — alinhado; as sub-ações
                 ficam um degrau abaixo, com a contagem à mostra. */
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 10px 10px" }}>
                {itens.map((a) => {
                  const on = ligada(a);
                  const temSubs = !!a.subs?.length;
                  const clicavel = !temSubs && !travadaPara(a);
                  // `adminTravado` NÃO marca sub de área restrita: era isso que
                  // deixava as dez do Financeiro acesas e sem como desmarcar na
                  // ficha de qualquer admin.
                  const subsOn = temSubs
                    ? a.subs!.filter((s) => vemNoBloco(a, s) || sel.has(subFullKey(a.key, s.key))).length
                    : 0;
                  const subsAberta = !!filtro || areasAbertas.has(a.key);
                  return (
                    <div key={a.key} style={{ padding: 12, borderRadius: "var(--r-md)", transition: "border-color .12s",
                      border: on ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                      background: on ? "color-mix(in srgb, var(--primary) 8%, var(--surface))" : "var(--surface)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        {/* Identidade da área. minWidth em min(100%, …): no desktop
                            pede os 220px de sempre; em 320px encolhe em vez de
                            estourar a linha. role=button dá o alvo de toque (e o
                            teclado) que um div clicável não tem. */}
                        <div onClick={clicavel ? () => toggle(a) : temSubs ? () => alterna(areasAbertas, setAreasAbertas, a.key) : undefined}
                          role={clicavel || temSubs ? "button" : undefined} tabIndex={clicavel || temSubs ? 0 : undefined}
                          aria-expanded={temSubs ? subsAberta : undefined}
                          onKeyDown={clicavel || temSubs ? (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); clicavel ? toggle(a) : alterna(areasAbertas, setAreasAbertas, a.key); } } : undefined}
                          style={{ display: "flex", alignItems: "center", gap: 11, minHeight: "var(--tap)", cursor: clicavel || temSubs ? "pointer" : "default", flex: "1 1 240px", minWidth: "min(100%, 220px)" }}>
                          <span style={{ width: 36, height: 36, borderRadius: "var(--r-sm)", flex: "none", display: "grid", placeItems: "center", background: on ? "var(--primary)" : "var(--surface-2, rgba(0,0,0,0.05))" }}>
                            <Icon name={a.icon} size={19} color={on ? "#fff" : "var(--text-dim)"} />
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>{a.label}</span>
                              {a.critica && <Icon name="lock" size={12} color="var(--text-dim)" />}
                              {a.restrita && (
                                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", padding: "2px 7px", borderRadius: 999, background: "color-mix(in srgb, var(--danger, var(--perigo)) 12%, transparent)", color: "var(--danger, var(--perigo))" }}>
                                  restrita
                                </span>
                              )}
                              {/* Sem isto, o quadradinho travado é
                                  indistinguível de um quadradinho quebrado. */}
                              {a.restrita && !administro(a) && !isSelf && (
                                <span
                                  title={`Só quem tem "${a.label} — conceder acesso" pode mexer nesta área.`}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10.5, fontWeight: 700, color: "var(--text-dim)" }}
                                >
                                  <Icon name="lock" size={11} color="var(--text-dim)" /> só quem administra a área
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 1, lineHeight: 1.35, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.descricao}</div>
                          </div>
                          {temSubs ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: subsOn ? "var(--primary-texto)" : "var(--text-dim)", whiteSpace: "nowrap" }}>{subsOn} de {a.subs!.length}</span>
                              <span style={{ display: "grid", placeItems: "center", transform: subsAberta ? "rotate(180deg)" : "none", transition: "transform .2s var(--ease-entra)" }}>
                                <Icon name="chevron-down" size={15} color="var(--text-dim)" />
                              </span>
                            </span>
                          ) : (
                            <span style={{ width: 24, height: 24, borderRadius: "var(--r-xs)", flex: "none", display: "grid", placeItems: "center", background: on ? "var(--primary)" : "transparent", border: on ? "none" : "1.5px solid var(--border)" }}>
                              {on && <Icon name="check" size={15} color="#fff" />}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Sub-ações — só quando a pessoa pede pra ver. Com elas
                          vem o atalho da área inteira: marcar seis quadradinhos
                          um a um pra "liberar o TridiChat" é trabalho que a tela
                          devia poupar. */}
                      {temSubs && subsAberta && (
                        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                          {!subTravada(a) && (
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <Botao tamanho="sm" onClick={() => setSel((p) => expandirImplicacoes(new Set([...p, ...a.subs!.filter((s) => !s.sensivel).map((s) => subFullKey(a.key, s.key))])))}>Liberar leitura</Botao>
                              <Botao tamanho="sm" onClick={() => setSel((p) => expandirImplicacoes(new Set([...p, ...a.subs!.map((s) => subFullKey(a.key, s.key))])))}>Acesso total</Botao>
                              <Botao tamanho="sm" variante="sutil" onClick={() => setSel((p) => { const n = new Set(p); a.subs!.forEach((s) => n.delete(subFullKey(a.key, s.key))); return n; })}>Sem acesso</Botao>
                            </div>
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 8 }}>
                            {a.subs!.map((s) => {
                              const subon = vemNoBloco(a, s) || sel.has(subFullKey(a.key, s.key));
                              return (
                                <button key={s.key} onClick={() => toggleSub(a, s.key)} disabled={subTravada(a) || (!!s.restrita && isSelf)}
                                  style={{ display: "flex", alignItems: "center", gap: 9, textAlign: "left", padding: "9px 11px", minHeight: "var(--tap)", borderRadius: "var(--r-sm)", cursor: subTravada(a) ? "default" : "pointer",
                                    border: subon ? "1px solid var(--primary)" : "1px solid var(--border)", background: subon ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)" }}>
                                  <span style={{ width: 18, height: 18, borderRadius: "var(--r-xs)", flex: "none", display: "grid", placeItems: "center", background: subon ? "var(--primary)" : "transparent", border: subon ? "none" : "1.5px solid var(--border)" }}>
                                    {subon && <Icon name="check" size={12} color="#fff" />}
                                  </span>
                                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.descricao}>{s.label}</span>
                                </button>
                              );
                            })}
                          </div>

                          {/* "Quais empresas ela vê" — só existe para o
                              Financeiro, e só na frente de quem administra a
                              área. Ausência de restrição (nenhuma marcada) é o
                              padrão: a pessoa vê todas as empresas ativas —
                              por isso a legenda diz isso com todas as letras
                              em vez de deixar o quadro vazio ser lido como
                              "sem acesso a nenhuma". */}
                          {a.key === "financeiro" && souAdminDoFinanceiro && empresasFinanceiro.length > 0 && (
                            <div style={{ marginTop: 4, paddingTop: 10, borderTop: "1px dashed var(--border)" }}>
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", marginBottom: 6 }}>
                                Em quais empresas
                                {empresasMarcadas.length === 0 && <> — todas, por padrão</>}
                              </div>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {empresasFinanceiro.map((emp) => {
                                  const on = empresasMarcadas.includes(emp.id);
                                  return (
                                    <button
                                      key={emp.id}
                                      type="button"
                                      onClick={() => alternarEmpresa(emp.id)}
                                      style={{
                                        display: "flex", alignItems: "center", gap: 7, minHeight: "var(--tap)",
                                        padding: "6px 12px", borderRadius: "var(--r-pill)", cursor: "pointer",
                                        border: on ? "1px solid var(--primary)" : "1px solid var(--border)",
                                        background: on ? "color-mix(in srgb, var(--primary) 12%, var(--surface))" : "var(--surface)",
                                      }}
                                    >
                                      <span style={{ width: 16, height: 16, borderRadius: "var(--r-xs)", flex: "none", display: "grid", placeItems: "center", background: on ? "var(--primary)" : "transparent", border: on ? "none" : "1.5px solid var(--border)" }}>
                                        {on && <Icon name="check" size={11} color="#fff" />}
                                      </span>
                                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{emp.nome}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Página inicial: onde a pessoa cai DEPOIS de logar. Mora aqui e não na
          aba de jornada porque a lista de destinos é exatamente o que a grade
          acima liberou — e porque uma área discreta (TridiMarket não aparece na
          sidebar) só é alcançável se for a entrada de quem trabalha nela. */}
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="map-pin" size={15} color="var(--text-dim)" />
          <div style={{ fontSize: 14.5, fontWeight: 800 }}>Página inicial</div>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "4px 0 10px" }}>
          Onde esta pessoa cai ao entrar no sistema. Só aparecem as áreas que ela tem.
        </div>
        <GlassSelect
          value={inicioSel}
          onChange={(v) => setInicioSel(v)}
          options={inicioOrfao ? [...opcoesInicio, { value: inicioSel, label: "Área removida — volta pro padrão", disabled: true }] : opcoesInicio}
          disabled={isSelf || busy}
          style={{ width: "min(100%, 320px)" }}
        />
        {inicioSel && !inicioOrfao && (
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 8 }}>
            Entrando, vai direto para <strong style={{ color: "var(--text)" }}>{opcoesInicio.find((o) => o.value === inicioSel)?.label}</strong>.
          </div>
        )}
      </div>

      {/* Salvar. Aparece mesmo com a grade travada por admin: as áreas
          restritas continuam editáveis, e sem o botão não haveria como
          gravá-las. */}
      {!isSelf && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <Botao variante={dirty ? "primario" : "secundario"} onClick={salvar} disabled={!dirty} carregando={busy}>
            {dirty ? "Salvar acesso" : "Tudo salvo"}
          </Botao>
          {dirty && <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>Alterações não salvas.</span>}
        </div>
      )}

      {/* Histórico */}
      {hist.length > 0 && (
        <div style={{ marginTop: 22, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Histórico de alterações</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {hist.map((h) => (
              <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-dim)" }}>
                <Icon name="history" size={13} color="var(--text-dim)" />
                <span><strong style={{ color: "var(--text)" }}>{h.alterado_por_nome || "Alguém"}</strong> deixou {h.qtd} área(s) liberada(s) · {new Date(h.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricasTab({ row, data }: { row: ColabRow; data: EmployeeData }) {
  const [m, setM] = useState<{ horas: number; concluidas: number; itens: number } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetch(`/api/colaboradores/${row.id}/metricas`, { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (d.semana) setM(d.semana); else setErr(true); }).catch(() => setErr(true));
  }, [row.id]);

  const escala = getEscala(data.escala);
  const previstas = escala ? horasSemana(escala) : null;
  const pct = previstas && m ? Math.min(100, Math.round((m.horas / previstas) * 100)) : null;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))", gap: 12 }}>
        <Mcard label="Horas trabalhadas (semana)" value={m ? `${m.horas} h` : "—"} cor="var(--primary-texto)" />
        <Mcard label="Horas previstas (escala)" value={previstas != null ? `${previstas} h` : "—"} cor="var(--info)" />
        <Mcard label="Atividades concluídas" value={m ? String(m.concluidas) : "—"} cor="var(--ok)" />
        <Mcard label="Itens produzidos" value={m ? String(m.itens) : "—"} cor="var(--atencao)" />
      </div>
      {pct != null && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--text-dim)", marginBottom: 5 }}>
            <span>Cumprimento da jornada (semana)</span><strong style={{ color: "var(--text)" }}>{pct}%</strong>
          </div>
          <div style={{ height: 8, background: "var(--surface)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? "var(--ok)" : "var(--primary)", borderRadius: 5 }} />
          </div>
        </div>
      )}
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 12 }}>
        {escala ? <>Escala: <strong>{escala.nome}</strong> — {escala.descricao}.</> : "Sem escala definida (defina no Resumo)."}
        {" "}Horas trabalhadas = ponto batido nesta semana (entrada/saída). Quem não bate ponto aparece 0h.
      </p>
      {err && <p style={{ fontSize: 12, color: "var(--perigo)", marginTop: 6 }}>Não foi possível carregar as métricas.</p>}
    </div>
  );
}
function Mcard({ label, value, cor }: { label: string; value: string; cor: string }) {
  return (
    <div className="glass glass-spec" style={{ padding: 18, borderRadius: "var(--r-md)" }}>
      <div className="stat" style={{ fontSize: 26, color: cor }}>{value}</div>
      <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ── Criar login + ponto pra VÁRIOS (cola nomes, um por linha) ───────────────
function BulkForm({ onDone }: { onDone: () => void }) {
  const [texto, setTexto] = useState("");
  const role: Role = "colaborador";   // novos nascem sem acesso; libera-se depois
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ criados: { nome: string; username: string }[]; erros: { nome: string; erro: string }[] } | null>(null);

  const nomes = texto.split("\n").map((s) => s.trim()).filter((s) => s.length >= 2);

  async function criar() {
    if (nomes.length === 0) { toast.erro("Cole ao menos um nome (um por linha)."); return; }
    setBusy(true); setRes(null);
    try {
      const r = await fetch("/api/colaboradores/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nomes, role }) });
      const d = await r.json();
      if (!r.ok) { toast.erro(d?.error || "Falha ao criar."); return; }
      setRes(d);
      if (d.criados?.length) { toast.ok(`${d.criados.length} criado(s)${d.erros?.length ? `, ${d.erros.length} com erro` : ""}.`); setTexto(""); onDone(); }
      else toast.erro("Nenhum criado — confira os nomes.");
    } finally { setBusy(false); }
  }

  return (
    <div className="glass" style={{ marginTop: 16, padding: 22, borderRadius: "var(--r-lg)", display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800 }}>Criar login + ponto pra vários</div>
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.5 }}>Um nome por linha. Cada um vira um login (usuário automático, senha definida no 1º acesso) e já entra no ponto/banco de horas. Depois é só ajustar o que precisar em cada perfil.</div>
      </div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={8}
        placeholder={"Samuel Jr\nPedro Guilherme\nBruno Alguma Coisa\n…"}
        style={{ width: "100%", padding: "12px 14px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, resize: "vertical", fontFamily: "inherit" }} />
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>{nomes.length} nome(s) · acesso definido depois em cada perfil</span>
        <Botao variante="primario" onClick={criar} disabled={nomes.length === 0} carregando={busy} style={{ marginLeft: "auto" }}>
          {`Criar ${nomes.length || ""} login(s)`}
        </Botao>
      </div>
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          {res.criados.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 700, color: "var(--ok)", marginBottom: 4 }}><Icon name="check" size={13} color="var(--ok)" />Criados ({res.criados.length})</div>
              <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.7 }}>{res.criados.map((c) => `${c.nome} (@${c.username})`).join(" · ")}</div>
            </div>
          )}
          {res.erros.length > 0 && (
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--perigo)", marginBottom: 4 }}>Com erro ({res.erros.length})</div>
              <div style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.7 }}>{res.erros.map((c) => `${c.nome}: ${c.erro}`).join(" · ")}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ponto do colaborador (bate ponto, jornada, foto de reconhecimento) ──────
function InfoPonto({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-spec" style={{ padding: "12px 14px", borderRadius: "var(--r-sm)" }}>
      <div style={{ fontSize: 11.5, color: "var(--text-dim)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}
function PontoTab({ colaboradorId, nome }: { colaboradorId: string; nome: string }) {
  const [carregando, setCarregando] = useState(true);
  const [pessoa, setPessoa] = useState<PontoPessoa | null>(null);
  const [semTabela, setSemTabela] = useState(false);
  const [modal, setModal] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    setCarregando(true); setSemTabela(false);
    fetch("/api/ponto/pessoas", { cache: "no-store" }).then((r) => r.json())
      .then((d) => {
        if (d?.error === "tabela_ausente") { setSemTabela(true); setPessoa(null); return; }
        setPessoa(((d.pessoas ?? []) as PontoPessoa[]).find((x) => x.colaboradorId === colaboradorId) ?? null);
      })
      .catch(() => setPessoa(null))
      .finally(() => setCarregando(false));
  }, [colaboradorId, tick]);

  if (carregando) return <div style={{ color: "var(--text-dim)", fontSize: 13.5, padding: 20 }}>Carregando ponto…</div>;
  if (semTabela) return <div className="glass" style={{ padding: 22, borderRadius: "var(--r-md)", color: "var(--text-dim)" }}>Rode o <b>supabase/ponto.sql</b> pra ativar o controle de ponto.</div>;

  const jornada = pessoa?.jornadaMin && pessoa.jornadaMin > 0 ? `${Math.floor(pessoa.jornadaMin / 60)}h${String(pessoa.jornadaMin % 60).padStart(2, "0")}` : "8h00 (padrão)";
  

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {pessoa ? (
        <div className="glass" style={{ padding: 20, borderRadius: "var(--r-md)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Avatar url={pessoa.fotoUrl} name={nome} size={56} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}>Bate ponto no tablet</div>
              <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
                {pessoa.fotos?.length ? `${pessoa.fotos.length} foto(s) de reconhecimento` : "Sem foto de reconhecimento — cadastre o rosto no tablet ou aqui"}
              </div>
            </div>
            <span style={{ fontSize: 11.5, fontWeight: 800, padding: "4px 12px", borderRadius: 999, color: pessoa.ativo ? "var(--ok)" : "var(--perigo)", background: pessoa.ativo ? "color-mix(in srgb,var(--ok) 15%,transparent)" : "color-mix(in srgb,var(--perigo) 15%,transparent)" }}>
              {pessoa.ativo ? "ATIVO" : "INATIVO"}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 140px),1fr))", gap: 10 }}>
            <InfoPonto label="Jornada / dia" value={jornada} />
            <InfoPonto label="Entrada prevista" value={pessoa.entradaPrevista || "—"} />
            <InfoPonto label="Saída prevista" value={pessoa.saidaPrevista || "—"} />
            <InfoPonto label="PIN" value={pessoa.temPin ? "definido" : "—"} />
          </div>
          <Botao variante="primario" onClick={() => setModal(true)}>Configurar ponto</Botao>
        </div>
      ) : (
        <div className="glass" style={{ padding: 28, borderRadius: "var(--r-md)", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{nome} ainda não bate ponto</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 18, lineHeight: 1.5 }}>Ative pra aparecer no tablet, cadastrar o rosto (reconhecimento facial) e ter banco de horas.</div>
          <Botao variante="primario" onClick={() => setModal(true)}>Ativar ponto de {nome.split(" ")[0]}</Botao>
        </div>
      )}

      {modal && <PessoaModal pessoa={pessoa} colaboradorFixo={{ id: colaboradorId, nome }} onClose={() => setModal(false)} onSaved={() => { setModal(false); setTick((t) => t + 1); }} />}
    </div>
  );
}

function PlaceholderCards({ titulo, itens, nota }: { titulo: string; itens: string[]; nota: string }) {
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))", gap: 12 }}>
        {itens.map((i) => (
          <div key={i} className="glass glass-spec" style={{ padding: 18, borderRadius: "var(--r-md)" }}>
            <div className="stat" style={{ fontSize: 26, color: "var(--text-dim)" }}>—</div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>{i}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 12, opacity: 0.85 }}>{nota}</p>
    </div>
  );
}

// ── Form de novo colaborador (cascata Departamento → Perfil) ──
// Seletor de pessoa do ERP COM BUSCA (nome/apelido) + avatar. Dropdown portado
// pro body (não corta dentro de container com overflow/transform).
const ppTrigger: React.CSSProperties = { width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13.5, cursor: "pointer" };
const ppRow: React.CSSProperties = { width: "100%", display: "flex", alignItems: "center", gap: 8, textAlign: "left", padding: "8px 10px", borderRadius: "var(--r-xs)", border: "none", cursor: "pointer", fontSize: 13.5, color: "var(--text)" };
function PessoaPicker({ value, pessoas, onChange, placeholder = "— Sem vínculo —" }: {
  value: string; pessoas: ErpUser[]; onChange: (u: ErpUser | null) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rect, setRect] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sel = pessoas.find((p) => p.id === value) || null;
  const nome = (p: ErpUser) => p.apelido || p.nome;

  useEffect(() => {
    if (!open) return;
    // O painel é `position: fixed`, então tudo tem que caber na viewport por
    // conta própria: em 320px os 300px mínimos + o `left` do botão jogavam
    // metade da lista pra fora da tela. Largura e lado ficam presos à janela e,
    // sem espaço embaixo (campo no fim do formulário), ele abre pra cima.
    const pos = () => {
      const r = btnRef.current?.getBoundingClientRect(); if (!r) return;
      const vw = window.innerWidth, vh = window.innerHeight;
      const width = Math.min(Math.max(r.width, 300), vw - 16);
      const left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8));
      const abaixo = vh - r.bottom - 14, acima = r.top - 14;
      const paraCima = abaixo < 200 && acima > abaixo;
      const maxH = Math.min(360, Math.max(140, paraCima ? acima : abaixo));
      setRect({ top: paraCima ? Math.max(8, r.top - 6 - maxH) : r.bottom + 6, left, width, maxH });
    };
    pos(); setTimeout(() => inputRef.current?.focus(), 10);
    window.addEventListener("scroll", pos, true); window.addEventListener("resize", pos);
    return () => { window.removeEventListener("scroll", pos, true); window.removeEventListener("resize", pos); };
  }, [open]);

  const ql = q.trim().toLowerCase();
  const filt = (ql ? pessoas.filter((p) => `${p.apelido ?? ""} ${p.nome}`.toLowerCase().includes(ql)) : pessoas).slice(0, 100);
  const pick = (u: ErpUser | null) => { onChange(u); setOpen(false); setQ(""); };
  const Avatar = ({ u, s }: { u: ErpUser; s: number }) => u.foto_url
    ? <AvatarBase url={u.foto_url} nome={u.nome} size={s} formato="redondo" />
    : <span style={{ width: s, height: s, borderRadius: "50%", background: "var(--surface-2)", display: "grid", placeItems: "center", flex: "none" }}><Icon name="user" size={s * 0.55} color="var(--text-dim)" /></span>;

  return (
    <>
      <button type="button" ref={btnRef} onClick={() => setOpen((o) => !o)} style={ppTrigger}>
        {sel ? <Avatar u={sel} s={22} /> : <Icon name="search" size={15} color="var(--text-dim)" />}
        <span style={{ flex: 1, textAlign: "left", color: sel ? "var(--text)" : "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sel ? nome(sel) : placeholder}</span>
        {sel && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); pick(null); }} style={{ display: "inline-flex", padding: 2 }}><Icon name="x" size={14} color="var(--text-dim)" /></span>}
        <Icon name="chevron-down" size={16} color="var(--text-dim)" />
      </button>
      {open && rect && createPortal(
        <div onMouseDown={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 500 }}>
          <div onMouseDown={(e) => e.stopPropagation()} className="glass pop-solid" style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, maxHeight: rect.maxH, overflowY: "auto", overscrollBehavior: "contain", borderRadius: "var(--r-md)", padding: 6, boxShadow: "0 24px 60px -20px rgba(0,0,0,.55)" }}>
            <div style={{ position: "sticky", top: -6, padding: 4, marginBottom: 2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface-2)", borderRadius: "var(--r-sm)", padding: "8px 10px" }}>
                <Icon name="search" size={15} color="var(--text-dim)" />
                <input {...atributosDe("busca")} ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome ou apelido…"
                  style={{ flex: 1, background: "none", border: "none", outline: "none", boxShadow: "none", color: "var(--text)", fontSize: 13.5 }} />
              </div>
            </div>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)} style={{ ...ppRow, background: !value ? "color-mix(in srgb,var(--primary) 16%,transparent)" : "transparent", color: "var(--text-dim)" }}>{placeholder}</button>
            {filt.length === 0 ? <div style={{ padding: 10, fontSize: 13, color: "var(--text-dim)" }}>Ninguém encontrado.</div>
              : filt.map((p) => (
                <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p)} style={{ ...ppRow, background: p.id === value ? "color-mix(in srgb,var(--primary) 16%,transparent)" : "transparent" }}>
                  <Avatar u={p} s={26} />
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nome(p)}{p.apelido && p.apelido !== p.nome ? <span style={{ color: "var(--text-dim)", fontSize: 11.5 }}> · {p.nome}</span> : null}</span>
                  {p.id === value && <Icon name="check" size={15} color="var(--primary-texto)" />}
                </button>
              ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function NovoForm({ form, set, setForm, erpUsers, busy, onPhoto, onSubmit }: {
  form: typeof blankForm; set: <K extends keyof typeof blankForm>(k: K, v: (typeof blankForm)[K]) => void;
  setForm: React.Dispatch<React.SetStateAction<typeof blankForm>>; erpUsers: ErpUser[]; busy: boolean;
  onPhoto: (e: React.ChangeEvent<HTMLInputElement>) => void; onSubmit: (e: React.FormEvent) => void;
}) {
  const perfis = perfisDe(form.departamento);
  return (
    <form onSubmit={onSubmit} className="glass" style={{ marginTop: 16, padding: 22, borderRadius: "var(--r-lg)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: 14 }}>
      <Field label="Usuário (só letras/números, sem espaço)"><input value={form.username} onChange={(e) => set("username", slugUser(e.target.value))} placeholder="ex: joao.silva" required /></Field>
      <Field label="Nome"><input {...atributosDe("nome")} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome completo" required /></Field>
      <Field label="E-mail (login) — opcional"><input {...atributosDe("email")} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="seu@email.com" /></Field>
      {/* Sem Papel/Nível: o colaborador nasce sem acesso a áreas de gestão. Depois
          o admin libera as áreas (ou marca "Administrador") na aba Permissões. */}
      <Field label="Departamento">
        <GlassSelect value={form.departamento} onChange={(v) => setForm((f) => ({ ...f, departamento: v, perfis: [], especialidade: setorDoDepartamento(v) === "Produção" ? f.especialidade : "" }))} placeholder="Escolha o departamento"
          options={[{ value: "", label: "—" }, ...DEPARTAMENTOS.map((d) => ({ value: d, label: d }))]} />
      </Field>
      <Field label="Funções (marque uma ou mais)">
        <PerfisChips disponiveis={perfis} selecionados={form.perfis}
          onToggle={(p) => setForm((f) => ({ ...f, perfis: f.perfis.includes(p) ? f.perfis.filter((x) => x !== p) : [...f.perfis, p] }))} />
      </Field>
      {setorDoDepartamento(form.departamento) === "Produção" && (
        <Field label="Especialidade (produção)">
          <GlassSelect value={form.especialidade} onChange={(v) => set("especialidade", v)} placeholder="— nenhuma (faz tudo) —"
            options={[{ value: "", label: "— nenhuma (faz tudo) —" }, ...ESPECIALIDADES.map((e) => ({ value: e, label: e }))]} />
        </Field>
      )}
      <Field label="Escala / expediente">
        <GlassSelect value={form.escala} onChange={(v) => set("escala", v)} placeholder="— não definida —"
          options={[{ value: "", label: "— não definida —" }, ...ESCALAS.map((e) => ({ value: e.key, label: e.nome }))]} />
        {form.escala && <p style={{ fontSize: 11.5, color: "var(--text-dim)", marginTop: 5, lineHeight: 1.4 }}>{getEscala(form.escala)?.descricao}</p>}
      </Field>
      <Field label="Telefone / WhatsApp"><input {...atributosDe("telefone")} value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(00) 00000-0000" /></Field>
      <Field label="Data de admissão"><GlassDate value={form.data_admissao} onChange={(v) => set("data_admissao", v)} placeholder="Selecionar data" /></Field>
      <Field label="Foto">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {form.photo_url && <img src={form.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: "var(--r-xs)", objectFit: "cover" }} />}
          <input type="file" accept="image/*" onChange={onPhoto} />
        </div>
      </Field>
      <div style={{ gridColumn: "1 / -1" }}>
        <Field label="Vincular a usuário do sistema (ERP) — opcional">
          <PessoaPicker value={form.erp_user_id} pessoas={erpUsers}
            onChange={(u) => setForm((f) => ({ ...f, erp_user_id: u?.id ?? "", name: f.name || (u ? (u.apelido || u.nome) : ""), photo_url: f.photo_url || (u?.foto_url ?? "") }))} />
        </Field>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <Field label="Observações"><input value={form.observacoes} onChange={(e) => set("observacoes", e.target.value)} placeholder="Anotações internas" /></Field>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <Botao variante="primario" type="submit" carregando={busy}>Criar colaborador</Botao>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label>{label}</label>{children}</div>);
}

/**
 * Login OFFLINE no leitor de estoque do galpão. Mostra só se HÁ um código —
 * nunca o código: ele é uma credencial (abre o leitor em nome da pessoa), e
 * ecoar uma credencial de volta numa tela é como ela acaba em print de grupo.
 * Três estados: "nenhuma" (parado, mostra o status), "definir" (campo aberto
 * pra digitar um novo) e "limpar" (confirmação visual de que vai remover).
 */
function CodigoLeitorEstoque({ definido, acao, valor, onAcao, onValor }: {
  definido: boolean;
  acao: "nenhuma" | "definir" | "limpar";
  valor: string;
  onAcao: (a: "nenhuma" | "definir" | "limpar") => void;
  onValor: (v: string) => void;
}) {
  if (acao === "definir") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <input
          inputMode="numeric"
          autoComplete="off"
          value={valor}
          // Só dígitos chegam ao estado — o teclado do leitor é numérico, e
          // deixar letra passar aqui só adiaria o erro pro 400 do servidor.
          onChange={(ev) => onValor(ev.target.value.replace(/\D/g, "").slice(0, 8))}
          placeholder="4 a 8 dígitos"
          style={{ flex: "1 1 160px", minWidth: 0 }}
        />
        <Botao tamanho="sm" icone="x" onClick={() => { onAcao("nenhuma"); onValor(""); }}>Cancelar</Botao>
      </div>
    );
  }
  if (acao === "limpar") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 13, color: "var(--atencao)", fontWeight: 600 }}>O código será removido ao salvar.</span>
        <Botao tamanho="sm" onClick={() => onAcao("nenhuma")}>Desfazer</Botao>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: definido ? "var(--text)" : "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
        {definido ? "•••• definido" : "Nenhum código definido"}
      </span>
      <Botao icone="barcode" tamanho="sm" onClick={() => onAcao("definir")}>{definido ? "Trocar" : "Definir código"}</Botao>
      {definido && <Botao icone="x" tamanho="sm" onClick={() => onAcao("limpar")}>Remover</Botao>}
    </div>
  );
}

// Multi-seleção de funções (chips). Uma pessoa pode ter várias.
function PerfisChips({ disponiveis, selecionados, onToggle }: { disponiveis: string[]; selecionados: string[]; onToggle: (p: string) => void }) {
  if (!disponiveis.length) return <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>Escolha o departamento antes.</p>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
      {disponiveis.map((p) => {
        const on = selecionados.includes(p);
        return (
          <button key={p} type="button" onClick={() => onToggle(p)}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, fontWeight: 600, padding: "7px 13px", borderRadius: 999, cursor: "pointer",
              border: `1px solid ${on ? "var(--primary)" : "var(--border)"}`,
              background: on ? "color-mix(in srgb,var(--primary) 16%,transparent)" : "var(--surface)",
              color: on ? "var(--primary-texto)" : "var(--text)" }}>{on && <Icon name="check" size={13} color="var(--primary-texto)" />}{p}</button>
        );
      })}
    </div>
  );
}

// Esta era a única SEM `.toUpperCase()`: "mikael" virava um "m" minúsculo aqui
// e "M" em todas as outras telas.
function Avatar({ url, name, size = 42 }: { url: string | null; name: string; size?: number }) {
  return <AvatarBase url={url} nome={name} size={size} />;
}
