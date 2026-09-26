"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { dataBR } from "@/lib/financeiro/calculos";
import type { PoderesRh } from "@/lib/rh/gate";
import {
  COR_HISTORICO, DIAS_DE_FERIAS_POR_PERIODO, ICONE_HISTORICO, LABEL_DOC_TIPO,
  RH_DOC_TIPOS, RH_SETORES, RH_SITUACOES, SELO_ATESTADO, SELO_FERIAS, SELO_SITUACAO, diasEntre,
  type AtestadoRh, type ColaboradorRh, type DocumentoRh, type FeriasRh,
  type AnamneseRh, type FichaPayload, type FichaRh, type HistoricoRh,
  type RhDocTipo, type RhSituacao,
} from "@/lib/rh/tipos";
import { Avatar } from "../../../ui/Avatar";
import { Icon } from "../../../Icon";
import { toast } from "../../../Toast";
import { useSticky } from "../../../useSticky";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral, useAcao, type EstadoBotao } from "../../../ui/controles";
import { GlassDate, GlassSelect } from "../../../GlassPicker";
import { NumeroVivo } from "../../../ui/micro";
import { Abas } from "../../../ui/Abas";
import { Secao } from "../../../ui/Secao";
import {
  AvisoSchema, BotaoFin, Cabecalho, Cartao, FichaBloco, FichaLinha, NotaRodape, Selo, TituloCartao, Vazio,
} from "../../../financeiro/ui";
import { KpiSeta } from "../../../financeiro/blocos";
import { AbaPonto } from "./AbaPonto";
import { AbaAnamnese } from "./AbaAnamnese";
import type { ConferenciaDeFerias } from "@/lib/jornada/ferias";

type Aba = "visao" | "cadastro" | "documentacao" | "jornada";

const LABEL_SITUACAO: Record<RhSituacao, string> = {
  ativo: "Ativo", ferias: "Em férias", afastado: "Afastado", desligado: "Desligado",
};

// ── O formulário da ficha ────────────────────────────────────────────────────
// Um objeto só com TUDO o que o PUT grava, porque o PUT grava tudo de uma vez:
// mandar meia ficha não deixa o resto como estava — `texto(undefined)` vira
// `null` e apaga o que não foi enviado. É por isso que não existe "salvar só
// este campo" aqui, por mais que cada campo seja editado sozinho na tela.
type FormFicha = {
  situacao: RhSituacao;
  cargo: string; setor: string; departamento: string; telefone: string;
  data_admissao: string; data_nascimento: string; cpf: string; rg: string;
  estado_civil: string; email_pessoal: string;
  contato_emergencia: string; telefone_emergencia: string;
  cep: string; logradouro: string; numero: string; complemento: string;
  bairro: string; cidade: string; uf: string; observacoes: string;
};

function formDaFicha(colaborador: ColaboradorRh, ficha: FichaRh | null, situacao: RhSituacao): FormFicha {
  return {
    situacao,
    cargo: colaborador.cargo ?? "",
    setor: colaborador.setor ?? "",
    departamento: colaborador.departamento ?? "",
    telefone: colaborador.telefone ?? "",
    data_admissao: colaborador.admissao ?? "",
    data_nascimento: ficha?.data_nascimento ?? "",
    cpf: ficha?.cpf ?? "",
    rg: ficha?.rg ?? "",
    estado_civil: ficha?.estado_civil ?? "",
    email_pessoal: ficha?.email_pessoal ?? "",
    contato_emergencia: ficha?.contato_emergencia ?? "",
    telefone_emergencia: ficha?.telefone_emergencia ?? "",
    cep: ficha?.cep ?? "",
    logradouro: ficha?.logradouro ?? "",
    numero: ficha?.numero ?? "",
    complemento: ficha?.complemento ?? "",
    bairro: ficha?.bairro ?? "",
    cidade: ficha?.cidade ?? "",
    uf: ficha?.uf ?? "",
    observacoes: ficha?.observacoes ?? "",
  };
}

/** Quais campos a pessoa mexeu — é o que a barra de salvar conta. */
function mudados(a: FormFicha, b: FormFicha): (keyof FormFicha)[] {
  return (Object.keys(a) as (keyof FormFicha)[]).filter((k) => a[k] !== b[k]);
}

/** O corpo de um PUT/POST do RH, com o erro já traduzido para a tela. */
async function enviar(url: string, metodo: "POST" | "PUT" | "PATCH" | "DELETE", corpo?: unknown): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: corpo ? { "content-type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    // Rota de API NUNCA redireciona, mas sessão expirada devolve HTML: conferir
    // o tipo evita o "salvou!" de uma tela de login (ver a memória
    // "sessão expirada virava salvo").
    const ehJson = r.headers.get("content-type")?.includes("application/json");
    if (!r.ok || !ehJson) {
      const msg = ehJson ? ((await r.json()) as { erro?: string }).erro : null;
      toast.erro(msg || (r.status === 403 ? "Falta permissão para isso." : "Não deu para salvar."));
      return false;
    }
    return true;
  } catch {
    toast.erro("Sem conexão. Tente de novo.");
    return false;
  }
}

/**
 * O CORPO da ficha — o que vai dentro do pop-up.
 *
 * Não desenha cabeçalho nem moldura: quem abre é o `PainelDoColaborador`, e é
 * ele que põe título, subtítulo e ações. Separado assim porque a ficha deixou
 * de ser uma ROTA e virou painel (o padrão do Financeiro: clicar na linha não
 * troca de tela), e misturar as duas coisas num componente só faria o corpo
 * carregar um `<Cabecalho>` que o painel já tem.
 */
export function CorpoDaFicha({ dados, poderes, hoje, aoMudar, aoSujar }: {
  dados: FichaPayload;
  poderes: PoderesRh;
  hoje: string;
  aoMudar: () => void;
  /** Avisa o pop-up de fora que há edição por salvar — é o que faz o painel
   *  passar a "só fecha no X" e um Esc sem querer deixar de apagar o que foi
   *  digitado. A ficha virou formulário, então ela herda a regra dos
   *  formulários da fundação. */
  aoSujar?: (sujo: boolean) => void;
}) {
  const {
    colaborador, ficha, documentos, atestados, ferias, historico, anamnese,
    schemaPendente,
  } = dados;


  // As abas que existem dependem da CHAVE, não da tela: quem não tem
  // `rh:atestados` não vê a aba porque o servidor não mandou o conteúdo.
  // A lista foi enxugada de onze abas para cinco: cada aba agora reúne o que
  // antes vivia solto. "Cadastro" junta Pessoais + Profissionais; "Documentação"
  // junta Documentos + Atestados + Ficha anamnésica; "Jornada" junta Ponto +
  // Férias. Dentro de cada uma o conteúdo vem EMPILHADO numa rolagem só (cada
  // parte é um Cartão com seu próprio título) — menos cliques para percorrer a
  // ficha inteira. As abas fundidas de conteúdo por-chave só aparecem se ao
  // menos uma das suas partes está liberada, e cada bloco lá dentro continua
  // respeitando a sua chave.
  const abas = useMemo(() => {
    const todas: { id: Aba; label: string; icone: string; contagem?: number; on: boolean }[] = [
      { id: "visao", label: "Visão geral", icone: "layout-grid", on: true },
      { id: "cadastro", label: "Cadastro", icone: "user", on: true },
      {
        id: "documentacao", label: "Documentação", icone: "folder",
        contagem: documentos.length + atestados.length,
        on: poderes.documentos || poderes.atestados || poderes.anamnese,
      },
      {
        id: "jornada", label: "Jornada", icone: "clock-hour-4",
        contagem: ferias.length,
        on: poderes.ponto || poderes.ferias,
      },
      // A aba "Acesso" SAIU da ficha do RH em 22/09/2026: a grade de
      // permissões mora em TI › Permissões (/ti/permissoes), decisão do dono
      // — quem entra no sistema é assunto de TI. A ficha do RH responde quem a
      // pessoa É; o que ela PODE responde-se lá, na mesma grade de sempre.
    ];
    return todas.filter((a) => a.on);
  }, [poderes, documentos.length, atestados.length, ferias.length]);

  const [abaSalva, setAba] = useSticky<string>("rh.ficha.aba", "visao");
  // A aba lembrada pode ter sumido (outra pessoa, outra permissão): cai na
  // visão geral em vez de numa tela em branco.
  const aba = (abas.some((a) => a.id === abaSalva) ? abaSalva : "visao") as Aba;

  const atualizar = aoMudar;
  const situacao = ficha?.situacao ?? colaborador.situacao;

  // ── A ficha É o formulário ─────────────────────────────────────────────────
  // Editar era um pop-up DENTRO do pop-up: uma segunda moldura de 760px por
  // cima de uma de 1180, com os mesmos campos menores e o valor antigo fora de
  // vista — pra trocar o setor de alguém era preciso abrir uma janela, procurar
  // o campo entre outros vinte e fechar pra conferir. Agora ver e alterar são a
  // mesma tela: os campos das abas Pessoais e Profissionais são os controles de
  // verdade, e a barra embaixo só existe quando há algo por salvar.
  const gravado = useMemo(() => formDaFicha(colaborador, ficha, situacao), [colaborador, ficha, situacao]);
  // A chave é por VALOR, não por identidade. Recarregar a ficha depois de
  // anexar um documento devolve um objeto NOVO com exatamente os mesmos campos,
  // e resetar por identidade apagaria o que a pessoa acabou de digitar.
  const chaveGravada = JSON.stringify(gravado);
  const [f, setF] = useState<FormFicha>(gravado);
  useEffect(() => { setF(JSON.parse(chaveGravada) as FormFicha); }, [chaveGravada]);
  const pendentes = mudados(f, gravado);
  const sujo = poderes.editar && pendentes.length > 0;
  useEffect(() => { aoSujar?.(sujo); }, [sujo, aoSujar]);
  const campo = <K extends keyof FormFicha>(k: K, v: FormFicha[K]) => setF((a) => ({ ...a, [k]: v }));
  const mexido = (k: keyof FormFicha) => pendentes.includes(k);
  const podeEditarFicha = poderes.editar;

  // O PUT grava a ficha INTEIRA (ver `FormFicha`): é sempre `f` completo que
  // sobe, mesmo quando só um campo mudou.
  const salvarFicha = useAcao(async () => {
    const ok = await enviar(`/api/rh/colaboradores/${colaborador.id}`, "PUT", f);
    if (ok) { toast.ok(pendentes.length === 1 ? "Alteração salva." : `${pendentes.length} alterações salvas.`); atualizar(); }
    return ok;
  });

  // ⌘S / Ctrl+S salva. Quem preenche ficha vem de planilha e de editor de
  // texto, e a mão já faz isso sozinha — sem o `preventDefault` o navegador
  // abre "salvar página" e a pessoa fecha um diálogo do sistema achando que
  // perdeu o que digitou. Só enquanto há o que salvar: um atalho que não faz
  // nada é pior que atalho nenhum.
  const rodarSalvar = salvarFicha.rodar;
  useEffect(() => {
    if (!sujo) return;
    const ao = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void rodarSalvar(); }
    };
    document.addEventListener("keydown", ao);
    return () => document.removeEventListener("keydown", ao);
  }, [sujo, rodarSalvar]);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Abas
          valor={aba}
          onMuda={(v) => setAba(v)}
          quebra
          ariaLabel="Seções da ficha do colaborador"
          itens={abas.map((a) => ({
            valor: a.id,
            // A contagem entra no RÓTULO com "·", e não no `badge`: aquele
            // slot espera um nó já estilizado e um número cru encostava no
            // texto ("Documentos2"). É a mesma grafia que a tela de Pessoas
            // usava em "Equipe · 12".
            rotulo: (
              <>
                <Icon name={a.icone} size={15} color="currentColor" />
                {" "}{a.label}{a.contagem ? ` · ${a.contagem}` : ""}
              </>
            ),
          }))}
        />
      </div>

      {/* AÇÕES DO COLABORADOR. Fileira própria, logo abaixo das abas, e não
          espalhadas pelos cantos de cada aba: quem abre a ficha para FAZER
          alguma coisa encontra tudo no mesmo lugar, sempre. Cada botão
          respeita a chave que o autoriza — botão que existe e devolve 403 é
          pior que botão ausente. Rola de lado no celular (`.tab-strip`). */}
      {/* "Editar ficha" SAIU daqui: não existe mais um modo de edição pra
          entrar. Os campos das abas já são editáveis pra quem tem a chave, e um
          botão que "liga" o que já está ligado só adiciona um clique. */}
      {(poderes.documentosEditar || poderes.atestadosEditar || poderes.feriasEditar) && (
        <div
          className="tab-strip"
          style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, padding: 0, minWidth: 0, maxWidth: "100%" }}
        >
          {poderes.documentosEditar && (
            <Botao tamanho="sm" icone="folder" onClick={() => setAba("documentacao")}>Documento</Botao>
          )}
          {poderes.atestadosEditar && (
            <Botao tamanho="sm" icone="file-text" onClick={() => setAba("documentacao")}>Atestado</Botao>
          )}
          {poderes.feriasEditar && (
            <Botao tamanho="sm" icone="sun" onClick={() => setAba("jornada")}>Férias</Botao>
          )}
        </div>
      )}

      {schemaPendente && <AvisoSchema modulo="RH" arquivo="supabase/rh.sql" />}

      {/* O CONTEÚDO da aba entra junto com a pílula que viajou até ela. A
          fileira já desliza (Kinetics 005) e o painel embaixo trocava num corte
          seco — o olho acompanha a pílula e reencontra um bloco que já estava
          lá, o que faz a troca parecer um recarregamento.
          `key={aba}` remonta a subárvore, que é o que dispara o keyframe de
          novo; `pageIn` termina em `transform: none` (nunca `translateY(0)`),
          senão este invólucro viraria bloco de contenção do `position: fixed`
          dos painéis que abrem daqui de dentro. */}
      {/* Coluna com respiro FIXO entre as seções. Cada aba fundida empilha
          vários `<Cartao>` (que não têm margem própria), e sem isto eles
          encostavam — o que fazia a ficha parecer amontoada. O `gap` cuida do
          espaçamento de todas as seções de uma vez, então nenhuma peça precisa
          carregar `marginTop` próprio. */}
      <div key={aba} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 18, animation: "pageIn var(--duration-quick, 150ms) var(--ease-out, ease-out) both" }}>

      {aba === "visao" && (
        <VisaoGeral
          colaborador={colaborador} ficha={ficha} situacao={situacao}
          documentos={documentos} atestados={atestados} ferias={ferias}
          historico={historico} poderes={poderes} hoje={hoje}
          aoIrPara={(a) => setAba(a)}
        />
      )}

      {aba === "cadastro" && (podeEditarFicha ? (
        <Cartao>
          <TituloCartao icone="user">Informações pessoais</TituloCartao>
          <BlocoDeCampos titulo="Identificação">
            <CampoFicha label="Nascimento" mudado={mexido("data_nascimento")}>
              {(id) => <GlassDate id={id} value={f.data_nascimento} onChange={(v) => campo("data_nascimento", v)} placeholder="Escolher data" max={hoje} />}
            </CampoFicha>
            <CampoFicha label="CPF" mudado={mexido("cpf")}>
              {(id) => <input id={id} inputMode="numeric" placeholder="000.000.000-00" value={f.cpf} onChange={(e) => campo("cpf", e.target.value)} />}
            </CampoFicha>
            <CampoFicha label="RG" mudado={mexido("rg")}>
              {(id) => <input id={id} value={f.rg} onChange={(e) => campo("rg", e.target.value)} />}
            </CampoFicha>
            <CampoFicha label="Estado civil" mudado={mexido("estado_civil")}>
              {(id) => (
                <GlassSelect id={id} value={f.estado_civil} onChange={(v) => campo("estado_civil", v)}
                  placeholder="Não informado"
                  options={[{ value: "", label: "Não informado" }, ...comOValorGravado(ESTADOS_CIVIS, f.estado_civil).map((s) => ({ value: s, label: s }))]} />
              )}
            </CampoFicha>
          </BlocoDeCampos>

          <BlocoDeCampos titulo="Contato">
            <CampoFicha label="Telefone" mudado={mexido("telefone")}>
              {(id) => <input id={id} type="tel" placeholder="(00) 00000-0000" value={f.telefone} onChange={(e) => campo("telefone", e.target.value)} />}
            </CampoFicha>
            <CampoFicha label="E-mail pessoal" mudado={mexido("email_pessoal")}>
              {(id) => <input id={id} type="email" value={f.email_pessoal} onChange={(e) => campo("email_pessoal", e.target.value)} />}
            </CampoFicha>
            {/* O usuário de login não se troca daqui: ele é do sistema, e a
                porta dele é a aba Acesso. Campo desabilitado seria pior que
                texto — parece que dá pra editar e não dá. */}
            <Campo label="Usuário do sistema" dica="Definido no cadastro de acesso.">
              <p style={{ fontSize: 13.5, minHeight: "var(--ctl-md)", display: "flex", alignItems: "center", overflowWrap: "anywhere" }}>
                {colaborador.username || <span style={{ color: "var(--text-dim)" }}>—</span>}
              </p>
            </Campo>
          </BlocoDeCampos>

          <BlocoDeCampos titulo="Emergência">
            <CampoFicha label="Quem avisar" mudado={mexido("contato_emergencia")}>
              {(id) => <input id={id} placeholder="Nome e parentesco" value={f.contato_emergencia} onChange={(e) => campo("contato_emergencia", e.target.value)} />}
            </CampoFicha>
            <CampoFicha label="Telefone de emergência" mudado={mexido("telefone_emergencia")}>
              {(id) => <input id={id} type="tel" value={f.telefone_emergencia} onChange={(e) => campo("telefone_emergencia", e.target.value)} />}
            </CampoFicha>
          </BlocoDeCampos>

          <BlocoDeCampos titulo="Endereço">
            <CampoFicha label="CEP" mudado={mexido("cep")}>
              {(id) => <input id={id} inputMode="numeric" placeholder="00000-000" value={f.cep} onChange={(e) => campo("cep", e.target.value)} />}
            </CampoFicha>
            <CampoFicha label="Logradouro" largo mudado={mexido("logradouro")}>
              {(id) => <input id={id} value={f.logradouro} onChange={(e) => campo("logradouro", e.target.value)} />}
            </CampoFicha>
            <CampoFicha label="Número" mudado={mexido("numero")}>
              {(id) => <input id={id} value={f.numero} onChange={(e) => campo("numero", e.target.value)} />}
            </CampoFicha>
            <CampoFicha label="Complemento" mudado={mexido("complemento")}>
              {(id) => <input id={id} value={f.complemento} onChange={(e) => campo("complemento", e.target.value)} />}
            </CampoFicha>
            <CampoFicha label="Bairro" mudado={mexido("bairro")}>
              {(id) => <input id={id} value={f.bairro} onChange={(e) => campo("bairro", e.target.value)} />}
            </CampoFicha>
            <CampoFicha label="Cidade" mudado={mexido("cidade")}>
              {(id) => <input id={id} value={f.cidade} onChange={(e) => campo("cidade", e.target.value)} />}
            </CampoFicha>
            <CampoFicha label="UF" mudado={mexido("uf")}>
              {(id) => <input id={id} maxLength={2} value={f.uf} onChange={(e) => campo("uf", e.target.value.toUpperCase())} />}
            </CampoFicha>
          </BlocoDeCampos>
        </Cartao>
      ) : (
        <Cartao>
          <TituloCartao icone="user">Informações pessoais</TituloCartao>
          <FichaBloco titulo="Identificação">
            <FichaLinha rotulo="Nascimento">{ficha?.data_nascimento ? dataBR(ficha.data_nascimento) : null}</FichaLinha>
            <FichaLinha rotulo="CPF">{ficha?.cpf}</FichaLinha>
            <FichaLinha rotulo="RG">{ficha?.rg}</FichaLinha>
            <FichaLinha rotulo="Estado civil">{ficha?.estado_civil}</FichaLinha>
          </FichaBloco>
          <FichaBloco titulo="Contato">
            <FichaLinha rotulo="Telefone">{colaborador.telefone}</FichaLinha>
            <FichaLinha rotulo="E-mail pessoal">{ficha?.email_pessoal}</FichaLinha>
            <FichaLinha rotulo="Usuário">{colaborador.username}</FichaLinha>
          </FichaBloco>
          <FichaBloco titulo="Emergência">
            <FichaLinha rotulo="Quem avisar">{ficha?.contato_emergencia}</FichaLinha>
            <FichaLinha rotulo="Telefone">{ficha?.telefone_emergencia}</FichaLinha>
          </FichaBloco>
          <FichaBloco titulo="Endereço">
            <FichaLinha rotulo="CEP">{ficha?.cep}</FichaLinha>
            <FichaLinha rotulo="Logradouro">
              {[ficha?.logradouro, ficha?.numero].filter(Boolean).join(", ") || null}
            </FichaLinha>
            <FichaLinha rotulo="Complemento">{ficha?.complemento}</FichaLinha>
            <FichaLinha rotulo="Bairro">{ficha?.bairro}</FichaLinha>
            <FichaLinha rotulo="Cidade">
              {[ficha?.cidade, ficha?.uf].filter(Boolean).join(" / ") || null}
            </FichaLinha>
          </FichaBloco>
        </Cartao>
      ))}

      {aba === "cadastro" && (
        <Cartao>
          <TituloCartao icone="briefcase">Informações profissionais</TituloCartao>

          {podeEditarFicha ? (
            <>
              <BlocoDeCampos titulo="Vínculo">
                {/* Situação primeiro: é o campo que muda o que a LISTA mostra, e
                    o motivo mais comum de alguém abrir esta ficha. */}
                <CampoFicha label="Situação" mudado={mexido("situacao")}
                            dica="Quem está de férias ou afastado sai da contagem de ativos.">
                  {(id) => (
                    <GlassSelect id={id} value={f.situacao} onChange={(v) => campo("situacao", v as RhSituacao)}
                      options={RH_SITUACOES.map((s) => ({ value: s, label: LABEL_SITUACAO[s] }))} />
                  )}
                </CampoFicha>
                <CampoFicha label="Cargo" mudado={mexido("cargo")}>
                  {(id) => <input id={id} value={f.cargo} onChange={(e) => campo("cargo", e.target.value)} />}
                </CampoFicha>
                {/* Setor é ESCOLHA, não digitação: a lista de colaboradores
                    agrupa, conta e pinta por essa string, então "Produção" e
                    "produção" viravam dois setores com metade da equipe cada.
                    `comOValorGravado` mantém na lista o que já está no banco —
                    um seletor que não oferece o valor atual o apaga em silêncio
                    no primeiro salvamento. */}
                <CampoFicha label="Setor" mudado={mexido("setor")}>
                  {(id) => (
                    <GlassSelect id={id} value={f.setor} onChange={(v) => campo("setor", v)} placeholder="Sem setor"
                      options={[{ value: "", label: "Sem setor" }, ...comOValorGravado(RH_SETORES, f.setor).map((s) => ({ value: s, label: s }))]} />
                  )}
                </CampoFicha>
                <CampoFicha label="Departamento" mudado={mexido("departamento")}>
                  {(id) => <input id={id} value={f.departamento} onChange={(e) => campo("departamento", e.target.value)} />}
                </CampoFicha>
                <CampoFicha label="Admissão" mudado={mexido("data_admissao")}
                            dica={f.data_admissao ? `Na empresa há ${tempoDeCasa(f.data_admissao, hoje)}.` : undefined}>
                  {(id) => <GlassDate id={id} value={f.data_admissao} onChange={(v) => campo("data_admissao", v)} placeholder="Escolher data" />}
                </CampoFicha>
              </BlocoDeCampos>

              <BlocoDeCampos titulo="Observações">
                <CampoFicha label="Anotações internas do RH" largo mudado={mexido("observacoes")}>
                  {(id) => <textarea id={id} rows={4} value={f.observacoes} onChange={(e) => campo("observacoes", e.target.value)} />}
                </CampoFicha>
              </BlocoDeCampos>
            </>
          ) : (
            <>
              <FichaBloco titulo="Vínculo">
                <FichaLinha rotulo="Cargo">{colaborador.cargo}</FichaLinha>
                <FichaLinha rotulo="Setor">{colaborador.setor}</FichaLinha>
                <FichaLinha rotulo="Departamento">{colaborador.departamento}</FichaLinha>
                <FichaLinha rotulo="Admissão">{colaborador.admissao ? dataBR(colaborador.admissao) : null}</FichaLinha>
                <FichaLinha rotulo="Tempo de casa">{tempoDeCasa(colaborador.admissao, hoje)}</FichaLinha>
                <FichaLinha rotulo="Situação"><Selo selo={SELO_SITUACAO[situacao]} /></FichaLinha>
              </FichaBloco>
              <FichaBloco titulo="Observações">
                <FichaLinha rotulo="Anotações">{ficha?.observacoes}</FichaLinha>
              </FichaBloco>
            </>
          )}

          {/* O histórico profissional é a mesma linha do tempo, filtrada: cargo,
              setor e situação. Uma segunda tabela só para isso faria dois
              lugares contando a mesma história — e elas divergiriam. */}
          <FichaBloco titulo="Histórico na empresa">
            <LinhaDoTempo
              itens={historico.filter((h) => ["admissao", "cargo", "setor", "situacao", "desligamento"].includes(h.tipo))}
              vazio="Nada registrado ainda. Mudanças de cargo, setor e situação passam a aparecer aqui."
            />
          </FichaBloco>
        </Cartao>
      )}

      {aba === "documentacao" && poderes.documentos && (
        <AbaDocumentos
          employeeId={colaborador.id} linhas={documentos}
          podeEditar={poderes.documentosEditar} aoMudar={atualizar}
        />
      )}

      {aba === "documentacao" && poderes.atestados && (
        <AbaAtestados
          employeeId={colaborador.id} linhas={atestados} hoje={hoje}
          podeEditar={poderes.atestadosEditar} aoMudar={atualizar}
        />
      )}

      {aba === "jornada" && poderes.ponto && (
        <AbaPonto colaboradorId={colaborador.id} nome={colaborador.nome} podeVerBanco={poderes.bancoHoras} />
      )}

      {aba === "jornada" && poderes.ferias && (
        <AbaFerias
          employeeId={colaborador.id} linhas={ferias} hoje={hoje}
          admissao={colaborador.admissao}
          podeEditar={poderes.feriasEditar} aoMudar={atualizar}
        />
      )}

      {aba === "documentacao" && poderes.anamnese && (
        <AbaAnamnese
          employeeId={colaborador.id} anamnese={anamnese}
          podeEditar={poderes.anamneseEditar} aoMudar={atualizar}
        />
      )}

      </div>

      {/* A barra só existe quando há o que salvar — e é ela que substitui o
          antigo "Salvar" do pop-up de cima. Fica GRUDADA embaixo (sticky, não
          fixed) porque quem rola é o corpo do painel: `fixed` a ancoraria na
          janela e ela flutuaria por cima da lista atrás. */}
      {podeEditarFicha && pendentes.length > 0 && (
        <BarraDeSalvar
          quantos={pendentes.length}
          estado={salvarFicha.estado}
          aoDescartar={() => setF(JSON.parse(chaveGravada) as FormFicha)}
          aoSalvar={() => salvarFicha.rodar()}
        />
      )}
    </>
  );
}

// ── A barra de "tem coisa por salvar" ────────────────────────────────────────
// Kinetics 069 (notification slide-in) com o tempo e a curva da escala do
// projeto: sobe do rodapé e assenta. Sobe, e não entra de lado — percurso
// horizontal empurraria o bloco pra fora do pai e a sobra viraria largura do
// documento. O keyframe termina em `transform: none` (nunca `translateY(0)`),
// senão a barra vira bloco de contenção do `position: fixed` de quem estiver
// dentro dela.
//
// O botão é o `useAcao` do kit, que já é o Kinetics 072/063 (ocioso →
// carregando → ok): não há "salvando…" escrito em lugar nenhum, o próprio
// botão conta.
function BarraDeSalvar({ quantos, estado, aoDescartar, aoSalvar }: {
  quantos: number;
  estado: EstadoBotao;
  aoDescartar: () => void;
  aoSalvar: () => void;
}) {
  return (
    <div
      style={{
        position: "sticky", bottom: 0, zIndex: 2, marginTop: 18,
        padding: "12px 14px",
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", rowGap: 10,
        borderRadius: "var(--r-md)",
        border: "1px solid color-mix(in srgb, var(--primary) 34%, var(--border))",
        background: "color-mix(in srgb, var(--primary) 9%, var(--surface))",
        boxShadow: "0 10px 30px -18px rgba(0,0,0,.55)",
        animation: "riseIn var(--duration-fast, 250ms) var(--ease-out, ease-out) both",
      }}
    >
      <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, flex: "none", background: "color-mix(in srgb, var(--primary) 16%, transparent)" }}>
        <Icon name="pencil" size={16} color="var(--primary)" />
      </span>
      <span style={{ flex: "1 1 180px", minWidth: 0, display: "grid", gap: 1 }}>
        <strong style={{ fontSize: 13.5, fontWeight: 800 }}>
          {/* `NumeroVivo`: o contador PULA a cada campo novo (Kinetics 083),
              que é o que faz a barra reagir enquanto se digita em vez de ficar
              parada com um número trocando em silêncio. */}
          <NumeroVivo valor={quantos} duracao={240} /> {quantos === 1 ? "alteração" : "alterações"} por salvar
        </strong>
        <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Nada é gravado até você salvar.</span>
      </span>
      {/* 14 de respiro entre as duas, e não os 8 de uma fileira comum:
          "Descartar" joga fora o que foi digitado, e a fundação pede que
          destrutiva não fique colada na clicável vizinha — no celular esta
          fileira quebra pra própria linha e as duas ficam sob o polegar. */}
      <span style={{ display: "flex", gap: 14, flex: "none" }}>
        <Botao variante="sutil" onClick={aoDescartar}>Descartar</Botao>
        <Botao variante="primario" icone="check" estado={estado} onClick={aoSalvar} title="⌘S">Salvar</Botao>
      </span>
    </div>
  );
}

// ── Peças do formulário da ficha ─────────────────────────────────────────────

/** Bloco de campos com o mesmo título do `FichaBloco` — a ficha continua
 *  parecendo uma ficha, e não um formulário de cadastro de dez colunas. */
function BlocoDeCampos({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 18, minWidth: 0 }}>
      <h3 style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", color: "var(--text-dim)", textTransform: "uppercase", marginBottom: 10 }}>
        {titulo}
      </h3>
      {/* 250 e não os 220 padrão: o pop-up tem 1180px e a queixa era campo
          pequeno demais. Aqui dá três a quatro colunas largas em vez de cinco
          estreitas. */}
      <Campos min={250}>{children}</Campos>
    </section>
  );
}

/** Um `Campo` do kit que se MARCA quando foi mexido e ainda não salvo. Sem a
 *  marca, a barra embaixo diz "3 alterações" e não há como saber quais — e a
 *  pessoa salva no escuro ou descarta por medo. */
function CampoFicha({ label, dica, largo, mudado, children }: {
  label: string;
  dica?: string;
  largo?: boolean;
  mudado?: boolean;
  children: (id: string) => React.ReactNode;
}) {
  return (
    <div className="rh-campo" data-mudado={mudado ? "1" : undefined} style={{ minWidth: 0, gridColumn: largo ? "1 / -1" : undefined }}>
      <Campo
        label={label}
        dica={mudado ? "Alterado — salve embaixo." : dica}
        largo={largo}
      >
        {children}
      </Campo>
    </div>
  );
}

/** A lista oferecida MAIS o que já está gravado. Um seletor que não contém o
 *  valor atual mostra o primeiro item (ou o vazio) como se fosse o dele — e o
 *  salvamento seguinte grava esse, apagando o original sem ninguém pedir. */
function comOValorGravado(lista: readonly string[], atual: string): string[] {
  const t = atual.trim();
  return t && !lista.includes(t) ? [...lista, t] : [...lista];
}

const ESTADOS_CIVIS = ["Solteiro(a)", "Casado(a)", "União estável", "Divorciado(a)", "Separado(a)", "Viúvo(a)"] as const;

// ── Visão geral ──────────────────────────────────────────────────────────────

function VisaoGeral({
  colaborador, ficha, situacao, documentos, atestados, ferias, historico, poderes, hoje, aoIrPara,
}: {
  colaborador: ColaboradorRh;
  ficha: FichaRh | null;
  situacao: RhSituacao;
  documentos: DocumentoRh[];
  atestados: AtestadoRh[];
  ferias: FeriasRh[];
  historico: HistoricoRh[];
  poderes: PoderesRh;
  hoje: string;
  aoIrPara: (a: Aba) => void;
}) {
  const feriasNoAno = ferias.filter((f) => f.status !== "cancelada" && f.de.slice(0, 4) === hoje.slice(0, 4));
  const diasGozados = feriasNoAno.reduce((t, f) => t + f.dias, 0);

  return (
    <>
      {/* O topo da ficha: quem é a pessoa, em uma olhada. Foto grande porque
          identificar é a primeira tarefa de quem abre a ficha de alguém. */}
      <Cartao>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", minWidth: 0 }}>
          <Avatar url={colaborador.foto} nome={colaborador.nome} size={72} formato="redondo" />
          <div style={{ display: "grid", gap: 4, minWidth: 0, flex: "1 1 200px" }}>
            <strong style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", overflowWrap: "anywhere" }}>
              {colaborador.nome}
            </strong>
            <span style={{ fontSize: 13, color: "var(--text-dim)", overflowWrap: "anywhere" }}>
              {[colaborador.cargo, colaborador.setor, colaborador.departamento].filter(Boolean).join(" · ") || "Sem cargo definido"}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
              <Selo selo={SELO_SITUACAO[situacao]} />
              <small style={{ fontSize: 11.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                Na empresa desde {dataBR(colaborador.admissao)} · {tempoDeCasa(colaborador.admissao, hoje)}
              </small>
            </span>
          </div>
        </div>
      </Cartao>

      {/* Os números que respondem "como está essa pessoa" sem abrir aba. Cada um
          LEVA à aba que o explica — é o "detalhe a um clique". O espaçamento
          entre as seções vem do `gap` da coluna, não de margem própria. */}
      <div>
        <LinhaKpiDaFicha>
          {poderes.documentos && (
            <KpiSeta
              icone="folder" rotulo="Documentos" valor={String(documentos.length)}
              detalhe={documentos.length === 1 ? "arquivo na ficha" : "arquivos na ficha"}
              aoAbrir={() => aoIrPara("documentacao")} tituloDaSeta="Ver documentos"
            />
          )}
          {poderes.atestados && (
            <KpiSeta
              icone="file-text" rotulo="Atestados" valor={String(atestados.length)}
              tom={atestados.some((a) => a.status === "pendente") ? "atencao" : "neutro"}
              detalhe={atestados.some((a) => a.status === "pendente") ? "há um para analisar" : "no histórico"}
              aoAbrir={() => aoIrPara("documentacao")} tituloDaSeta="Ver atestados"
            />
          )}
          {poderes.ferias && (
            <KpiSeta
              icone="sun" rotulo="Férias no ano" valor={`${diasGozados} d`}
              detalhe={`de ${DIAS_DE_FERIAS_POR_PERIODO} dias por período`}
              aoAbrir={() => aoIrPara("jornada")} tituloDaSeta="Ver férias"
            />
          )}
          {poderes.ponto && (
            <KpiSeta
              icone="clock-hour-4" rotulo="Ponto" valor="Abrir"
              detalhe="batidas e banco de horas"
              aoAbrir={() => aoIrPara("jornada")} tituloDaSeta="Ver o ponto"
            />
          )}
        </LinhaKpiDaFicha>
      </div>

      <Cartao>
        <TituloCartao icone="user">Resumo</TituloCartao>
        <FichaBloco titulo="Contato">
          <FichaLinha rotulo="Telefone">{colaborador.telefone}</FichaLinha>
          <FichaLinha rotulo="E-mail pessoal">{ficha?.email_pessoal}</FichaLinha>
          <FichaLinha rotulo="Emergência">
            {[ficha?.contato_emergencia, ficha?.telefone_emergencia].filter(Boolean).join(" · ") || null}
          </FichaLinha>
        </FichaBloco>
        <FichaBloco titulo="Últimas movimentações">
          <LinhaDoTempo itens={historico.slice(0, 5)} vazio="Nada registrado ainda." />
        </FichaBloco>
      </Cartao>
    </>
  );
}

/** A mesma fileira do módulo, com o teto menor: aqui são até quatro números. */
function LinhaKpiDaFicha({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="kpi-row"
      style={{
        display: "grid", gap: 14,
        gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
      }}
    >
      {children}
    </div>
  );
}

// ── Linha do tempo ───────────────────────────────────────────────────────────

function LinhaDoTempo({ itens, vazio }: { itens: HistoricoRh[]; vazio: string }) {
  if (!itens.length) {
    return <Vazio compacto icone="history" titulo="Sem histórico" detalhe={vazio} />;
  }
  return (
    <ol className="mt-fila" style={{ display: "grid", gap: 2, listStyle: "none", margin: 0, padding: 0, minWidth: 0 }}>
      {itens.map((h, i) => {
        const cor = COR_HISTORICO[h.tipo] ?? "var(--neutro)";
        return (
          <li
            key={h.id}
            className="mt-linha"
            style={{
              ["--mt-i" as string]: i,
              display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 12,
              padding: "10px 0", borderTop: i ? "1px solid var(--border)" : "none", minWidth: 0,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center",
                background: `color-mix(in srgb, ${cor} 14%, transparent)`,
              }}
            >
              <Icon name={ICONE_HISTORICO[h.tipo] ?? "message"} size={15} color={cor} />
            </span>
            <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
              <strong style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{h.titulo}</strong>
              {h.detalhe && (
                <span style={{ fontSize: 12.5, color: "var(--text-dim)", overflowWrap: "anywhere" }}>{h.detalhe}</span>
              )}
              <small style={{ fontSize: 11.5, color: "var(--text-dim)", fontVariantNumeric: "tabular-nums" }}>
                {dataBR(h.created_at.slice(0, 10))}
                {h.autor_nome ? ` · ${h.autor_nome}` : ""}
              </small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ── Documentos ───────────────────────────────────────────────────────────────

function AbaDocumentos({
  employeeId, linhas, podeEditar, aoMudar,
}: {
  employeeId: string; linhas: DocumentoRh[]; podeEditar: boolean; aoMudar: () => void;
}) {
  const [novo, setNovo] = useState(false);

  return (
    <Cartao>
      <TituloCartao
        icone="folder"
        direita={podeEditar ? <BotaoFin icone="plus" primario onClick={() => setNovo(true)}>Novo documento</BotaoFin> : undefined}
      >
        Documentos
      </TituloCartao>

      {!linhas.length ? (
        <Vazio
          icone="folder"
          titulo="Nenhum documento na ficha"
          detalhe="Contrato, RG, comprovantes e certificados desta pessoa ficam guardados aqui."
          acao={podeEditar ? <BotaoFin icone="plus" primario onClick={() => setNovo(true)}>Cadastrar o primeiro</BotaoFin> : undefined}
        />
      ) : (
        <ul className="mt-fila" style={{ display: "grid", gap: 2, listStyle: "none", margin: 0, padding: 0 }}>
          {linhas.map((d, i) => (
            <ItemDaLista
              key={d.id} indice={i} icone="file-text" cor="var(--azul)"
              titulo={d.titulo}
              detalhe={LABEL_DOC_TIPO[d.tipo] ?? d.tipo}
              rodape={[
                d.emitido_em ? `Emitido em ${dataBR(d.emitido_em)}` : null,
                d.validade ? `Vence em ${dataBR(d.validade)}` : null,
                d.autor_nome ? `Por ${d.autor_nome}` : null,
              ].filter(Boolean).join(" · ")}
              observacao={d.observacao}
              aoApagar={podeEditar ? async () => {
                if (await enviar(`/api/rh/documentos?id=${encodeURIComponent(d.id)}`, "DELETE")) {
                  toast.ok("Documento removido."); aoMudar();
                }
              } : undefined}
            />
          ))}
        </ul>
      )}

      {novo && (
        <PainelNovoDocumento
          employeeId={employeeId}
          aoFechar={() => setNovo(false)}
          aoSalvar={() => { setNovo(false); aoMudar(); }}
        />
      )}
    </Cartao>
  );
}

function PainelNovoDocumento({
  employeeId, aoFechar, aoSalvar,
}: {
  employeeId: string; aoFechar: () => void; aoSalvar: () => void;
}) {
  const [tipo, setTipo] = useState<RhDocTipo>("contrato");
  const [titulo, setTitulo] = useState("");
  const [emitido, setEmitido] = useState("");
  const [validade, setValidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);

  const salvar = useAcao(async () => {
    setTentativa((t) => t + 1);
    if (!titulo.trim()) { setErro("Dê um nome ao documento."); return false; }
    setErro("");
    const ok = await enviar("/api/rh/documentos", "POST", {
      employee_id: employeeId, tipo, titulo: titulo.trim(),
      emitido_em: emitido || null, validade: validade || null,
      observacao: observacao.trim() || null,
    });
    if (ok) { toast.ok("Documento cadastrado."); aoSalvar(); }
    return ok;
  });

  return (
    <PainelLateral
      centrado soFechaNoX
      titulo="Novo documento"
      subtitulo="O registro entra na ficha da pessoa e no histórico."
      largura={620}
      onFechar={aoFechar}
      rodape={
        <Acoes>
          <Botao onClick={aoFechar}>Fechar</Botao>
          <Esp />
          <Botao variante="primario" icone="check" estado={salvar.estado} onClick={() => salvar.rodar()}>
            Cadastrar
          </Botao>
        </Acoes>
      }
    >
      <Campos>
        <Campo label="Tipo" largo>
          {(id) => (
            <GlassSelect id={id} value={tipo} onChange={(v) => setTipo(v as RhDocTipo)}
              options={RH_DOC_TIPOS.map((t) => ({ value: t, label: LABEL_DOC_TIPO[t] }))} />
          )}
        </Campo>
        <Campo label="Nome do documento" largo erro={erro} sinal={tentativa}>
          {(id) => (
            <input id={id} value={titulo} onChange={(e) => { setTitulo(e.target.value); if (erro) setErro(""); }}
                   placeholder="Contrato de experiência, CNH..." />
          )}
        </Campo>
        <Campo label="Emitido em">
          {(id) => <GlassDate id={id} value={emitido} onChange={setEmitido} placeholder="Escolher data" max={validade || undefined} />}
        </Campo>
        <Campo label="Validade" dica="Deixe vazio se não vence.">
          {(id) => <GlassDate id={id} value={validade} onChange={setValidade} placeholder="Não vence" min={emitido || undefined} />}
        </Campo>
        <Campo label="Observação" largo>
          {(id) => <textarea id={id} rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} />}
        </Campo>
      </Campos>
      <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5, maxWidth: "68ch" }}>
        O envio do arquivo entra na próxima etapa do módulo. Por enquanto, o registro guarda o que o
        documento é, de quando ele é e até quando vale.
      </p>
    </PainelLateral>
  );
}

// ── Atestados ────────────────────────────────────────────────────────────────

function AbaAtestados({
  employeeId, linhas, hoje, podeEditar, aoMudar,
}: {
  employeeId: string; linhas: AtestadoRh[]; hoje: string; podeEditar: boolean; aoMudar: () => void;
}) {
  const [novo, setNovo] = useState(false);
  const diasNoAno = linhas
    .filter((a) => a.status === "aceito" && a.de.slice(0, 4) === hoje.slice(0, 4))
    .reduce((t, a) => t + a.dias, 0);

  return (
    <Cartao>
      <TituloCartao
        icone="file-text"
        direita={podeEditar ? <BotaoFin icone="plus" primario onClick={() => setNovo(true)}>Registrar atestado</BotaoFin> : undefined}
      >
        Atestados
      </TituloCartao>

      {/* Uma linha de contexto, não um painel: o que importa é quantos dias
          foram abonados no ano — o resto está na lista. */}
      {!!linhas.length && (
        <p style={{ marginTop: -8, marginBottom: 14, fontSize: 12.5, color: "var(--text-dim)" }}>
          {diasNoAno === 0 ? "Nenhum dia abonado neste ano." :
            `${diasNoAno} ${diasNoAno === 1 ? "dia abonado" : "dias abonados"} em ${hoje.slice(0, 4)}.`}
        </p>
      )}

      {!linhas.length ? (
        <Vazio
          icone="file-text"
          titulo="Nenhum atestado registrado"
          detalhe="Atestados médicos desta pessoa, com período e dias abonados, ficam aqui."
          acao={podeEditar ? <BotaoFin icone="plus" primario onClick={() => setNovo(true)}>Registrar o primeiro</BotaoFin> : undefined}
        />
      ) : (
        <ul className="mt-fila" style={{ display: "grid", gap: 2, listStyle: "none", margin: 0, padding: 0 }}>
          {linhas.map((a, i) => (
            <ItemDaLista
              key={a.id} indice={i} icone="file-text" cor="var(--atencao)"
              titulo={`${dataBR(a.de)} a ${dataBR(a.ate)}`}
              detalhe={`${a.dias} ${a.dias === 1 ? "dia" : "dias"}${a.profissional ? ` · ${a.profissional}` : ""}`}
              selo={<Selo selo={SELO_ATESTADO[a.status]} />}
              rodape={[
                a.emitido_em ? `Emitido em ${dataBR(a.emitido_em)}` : null,
                a.cid ? `CID ${a.cid}` : null,
                a.autor_nome ? `Lançado por ${a.autor_nome}` : null,
              ].filter(Boolean).join(" · ")}
              observacao={a.observacao}
              acoes={podeEditar && a.status === "pendente" ? (
                <>
                  <BotaoFin icone="check" onClick={async () => {
                    if (await enviar("/api/rh/atestados", "PATCH", { id: a.id, status: "aceito" })) {
                      toast.ok("Atestado aceito."); aoMudar();
                    }
                  }}>Aceitar</BotaoFin>
                  <BotaoFin icone="x" onClick={async () => {
                    if (await enviar("/api/rh/atestados", "PATCH", { id: a.id, status: "recusado" })) {
                      toast.ok("Atestado recusado."); aoMudar();
                    }
                  }}>Recusar</BotaoFin>
                </>
              ) : undefined}
              aoApagar={podeEditar ? async () => {
                if (await enviar(`/api/rh/atestados?id=${encodeURIComponent(a.id)}`, "DELETE")) {
                  toast.ok("Atestado removido."); aoMudar();
                }
              } : undefined}
            />
          ))}
        </ul>
      )}

      {novo && (
        <PainelNovoAtestado
          employeeId={employeeId} hoje={hoje}
          aoFechar={() => setNovo(false)}
          aoSalvar={() => { setNovo(false); aoMudar(); }}
        />
      )}
    </Cartao>
  );
}

function PainelNovoAtestado({
  employeeId, hoje, aoFechar, aoSalvar,
}: {
  employeeId: string; hoje: string; aoFechar: () => void; aoSalvar: () => void;
}) {
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [profissional, setProfissional] = useState("");
  const [cid, setCid] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);

  // Os dias saem do período e a pessoa pode corrigir: nem todo atestado abona o
  // intervalo inteiro (meio período, dia que já estava de folga).
  const sugeridos = diasEntre(de, ate);
  const [dias, setDias] = useState<string>("");
  const diasFinal = dias.trim() === "" ? sugeridos : Math.max(0, Number(dias) || 0);

  const salvar = useAcao(async () => {
    setTentativa((t) => t + 1);
    if (!de || !ate) { setErro("Informe o período."); return false; }
    if (ate < de) { setErro("A data final não pode ser antes da inicial."); return false; }
    setErro("");
    const ok = await enviar("/api/rh/atestados", "POST", {
      employee_id: employeeId, de, ate, dias: diasFinal,
      profissional: profissional.trim() || null, cid: cid.trim() || null,
      observacao: observacao.trim() || null,
    });
    if (ok) { toast.ok("Atestado registrado."); aoSalvar(); }
    return ok;
  });

  return (
    <PainelLateral
      centrado soFechaNoX
      titulo="Registrar atestado"
      subtitulo="Fica visível só para quem tem a chave de atestados do RH."
      largura={620}
      onFechar={aoFechar}
      rodape={
        <Acoes>
          <Botao onClick={aoFechar}>Fechar</Botao>
          <Esp />
          <Botao variante="primario" icone="check" estado={salvar.estado} onClick={() => salvar.rodar()}>
            Registrar
          </Botao>
        </Acoes>
      }
    >
      <Campos>
        <Campo label="De" erro={erro} sinal={tentativa}>
          {(id) => <GlassDate id={id} value={de} onChange={(v) => { setDe(v); if (erro) setErro(""); }} placeholder="Escolher data" max={ate || undefined} />}
        </Campo>
        <Campo label="Até">
          {(id) => <GlassDate id={id} value={ate} onChange={(v) => { setAte(v); if (erro) setErro(""); }} placeholder="Escolher data" min={de || undefined} />}
        </Campo>
        <Campo label="Dias abonados" dica={`Vazio usa o período: ${sugeridos} ${sugeridos === 1 ? "dia" : "dias"}.`}>
          {(id) => (
            <input id={id} type="number" min="0" inputMode="numeric" value={dias}
                   onChange={(e) => setDias(e.target.value)} placeholder={String(sugeridos)} />
          )}
        </Campo>
        <Campo label="Profissional / clínica">
          {(id) => <input id={id} value={profissional} onChange={(e) => setProfissional(e.target.value)} placeholder="Dr. ..." />}
        </Campo>
      </Campos>
      <Secao icone="lock" titulo="Dados clínicos" resumo="CID e observação — opcionais, e só para quem tem a chave de atestados.">
        <Campos>
          <Campo label="CID">
            {(id) => <input id={id} value={cid} onChange={(e) => setCid(e.target.value)} placeholder="Opcional" />}
          </Campo>
          <Campo label="Observação" largo>
            {(id) => <textarea id={id} rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} />}
          </Campo>
        </Campos>
      </Secao>
    </PainelLateral>
  );
}

// ── Férias ───────────────────────────────────────────────────────────────────

function AbaFerias({
  employeeId, linhas, hoje, admissao, podeEditar, aoMudar,
}: {
  employeeId: string; linhas: FeriasRh[]; hoje: string;
  admissao: string | null; podeEditar: boolean; aoMudar: () => void;
}) {
  const [novo, setNovo] = useState(false);

  const validas = linhas.filter((f) => f.status !== "cancelada");
  const gozados = validas.filter((f) => f.status === "concluida").reduce((t, f) => t + f.dias, 0);
  const programados = validas.filter((f) => f.status === "programada" || f.status === "em_gozo")
    .reduce((t, f) => t + f.dias, 0);
  // Períodos aquisitivos completos desde a admissão: um por ano de casa.
  const periodos = admissao ? Math.max(0, Math.floor(diasEntre(admissao, hoje) / 365)) : 0;
  const direito = periodos * DIAS_DE_FERIAS_POR_PERIODO;
  const disponiveis = Math.max(0, direito - gozados - programados);

  return (
    <>
      <LinhaKpiDaFicha>
        <KpiSeta icone="calendar" rotulo="Direito acumulado" valor={`${direito} d`}
                 detalhe={`${periodos} ${periodos === 1 ? "período" : "períodos"} desde a admissão`} />
        <KpiSeta icone="checks" rotulo="Já gozadas" valor={`${gozados} d`} detalhe="períodos concluídos" />
        <KpiSeta icone="calendar-event" rotulo="Programadas" valor={`${programados} d`} tom="ok" detalhe="ainda vão acontecer" />
        <KpiSeta icone="sun" rotulo="Disponíveis" valor={`${disponiveis} d`}
                 tom={disponiveis > DIAS_DE_FERIAS_POR_PERIODO ? "atencao" : "neutro"}
                 detalhe={disponiveis > DIAS_DE_FERIAS_POR_PERIODO ? "acumulando período" : "a programar"} />
      </LinhaKpiDaFicha>

      <Cartao>
        <TituloCartao
          icone="sun"
          direita={podeEditar ? <BotaoFin icone="plus" primario onClick={() => setNovo(true)}>Programar férias</BotaoFin> : undefined}
        >
          Períodos de férias
        </TituloCartao>

        {!validas.length && !linhas.length ? (
          <Vazio
            icone="calendar-off"
            titulo="Nenhum período registrado"
            detalhe="Férias programadas, em andamento e já gozadas aparecem aqui, com o saldo de dias."
            acao={podeEditar ? <BotaoFin icone="plus" primario onClick={() => setNovo(true)}>Programar o primeiro</BotaoFin> : undefined}
          />
        ) : (
          <ul className="mt-fila" style={{ display: "grid", gap: 2, listStyle: "none", margin: 0, padding: 0 }}>
            {linhas.map((f, i) => (
              <ItemDaLista
                key={f.id} indice={i} icone="sun" cor="var(--azul)"
                titulo={`${dataBR(f.de)} a ${dataBR(f.ate)}`}
                detalhe={`${f.dias} ${f.dias === 1 ? "dia" : "dias"}`}
                selo={<Selo selo={SELO_FERIAS[f.status]} />}
                rodape={[
                  f.aquisitivo_de && f.aquisitivo_ate
                    ? `Aquisitivo ${dataBR(f.aquisitivo_de)} – ${dataBR(f.aquisitivo_ate)}` : null,
                  f.autor_nome ? `Por ${f.autor_nome}` : null,
                ].filter(Boolean).join(" · ")}
                observacao={f.observacao}
                acoes={podeEditar && (f.status === "programada" || f.status === "em_gozo") ? (
                  <>
                    {f.status === "programada" && (
                      <BotaoFin icone="player-play" onClick={async () => {
                        if (await enviar("/api/rh/ferias", "PATCH", { id: f.id, status: "em_gozo" })) {
                          toast.ok("Férias iniciadas."); aoMudar();
                        }
                      }}>Iniciar</BotaoFin>
                    )}
                    <BotaoFin icone="check" onClick={async () => {
                      if (await enviar("/api/rh/ferias", "PATCH", { id: f.id, status: "concluida" })) {
                        toast.ok("Período concluído."); aoMudar();
                      }
                    }}>Concluir</BotaoFin>
                    <BotaoFin icone="ban" onClick={async () => {
                      if (await enviar("/api/rh/ferias", "PATCH", { id: f.id, status: "cancelada" })) {
                        toast.ok("Período cancelado."); aoMudar();
                      }
                    }}>Cancelar</BotaoFin>
                  </>
                ) : undefined}
                aoApagar={podeEditar ? async () => {
                  if (await enviar(`/api/rh/ferias?id=${encodeURIComponent(f.id)}`, "DELETE")) {
                    toast.ok("Período removido."); aoMudar();
                  }
                } : undefined}
              />
            ))}
          </ul>
        )}

        {novo && (
          <PainelNovasFerias
            employeeId={employeeId} hoje={hoje}
            aoFechar={() => setNovo(false)}
            aoSalvar={() => { setNovo(false); aoMudar(); }}
          />
        )}
      </Cartao>
    </>
  );
}

function PainelNovasFerias({
  employeeId, hoje, aoFechar, aoSalvar,
}: {
  employeeId: string; hoje: string; aoFechar: () => void; aoSalvar: () => void;
}) {
  const [de, setDe] = useState(hoje);
  const [ate, setAte] = useState(hoje);
  const [aqDe, setAqDe] = useState("");
  const [aqAte, setAqAte] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const [conf, setConf] = useState<ConferenciaDeFerias | null>(null);

  const dias = diasEntre(de, ate);

  // ── O que tem dentro do período, antes de salvar ───────────────────────────
  // Duas perguntas que o RH fazia de cabeça: "tem feriado aí dentro?" (muda
  // quantos dias úteis a pessoa realmente para) e "isso bate em alguma coisa?"
  // (outro período, atestado, folga compensatória já aprovada). Programar por
  // cima criava dois donos pro mesmo dia, e o cálculo escolhia um sem avisar.
  useEffect(() => {
    if (!de || !ate || ate < de) { setConf(null); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ employee_id: employeeId, de, ate });
        const r = await fetch(`/api/rh/ferias/conflitos?${q}`, { signal: ctrl.signal });
        const j = (await r.json().catch(() => null)) as ConferenciaDeFerias | null;
        if (!ctrl.signal.aborted) setConf(r.ok ? j : null);
      } catch { /* abortado ou rede: a tela segue sem o aviso */ }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [employeeId, de, ate]);

  const bloqueios = conf?.conflitos.filter((c) => c.bloqueia) ?? [];
  const avisos = conf?.conflitos.filter((c) => !c.bloqueia) ?? [];

  const salvar = useAcao(async () => {
    setTentativa((t) => t + 1);
    if (!de || !ate) { setErro("Informe o período."); return false; }
    if (ate < de) { setErro("A data final não pode ser antes da inicial."); return false; }
    if (bloqueios.length) { setErro(bloqueios[0].detalhe); return false; }
    setErro("");
    const ok = await enviar("/api/rh/ferias", "POST", {
      employee_id: employeeId, de, ate, dias,
      aquisitivo_de: aqDe || null, aquisitivo_ate: aqAte || null,
      observacao: observacao.trim() || null,
    });
    if (ok) { toast.ok("Férias programadas."); aoSalvar(); }
    return ok;
  });

  return (
    <PainelLateral
      centrado soFechaNoX
      titulo="Programar férias"
      subtitulo={`${dias} ${dias === 1 ? "dia" : "dias"} no período escolhido.`}
      largura={620}
      onFechar={aoFechar}
      rodape={
        <Acoes>
          <Botao onClick={aoFechar}>Fechar</Botao>
          <Esp />
          <Botao variante="primario" icone="check" estado={salvar.estado} disabled={bloqueios.length > 0} onClick={() => salvar.rodar()}>
            Programar
          </Botao>
        </Acoes>
      }
    >
      <Campos>
        <Campo label="Saída" erro={erro} sinal={tentativa}>
          {(id) => <GlassDate id={id} value={de} onChange={(v) => { setDe(v); if (erro) setErro(""); }} placeholder="Escolher data" max={ate || undefined} />}
        </Campo>
        <Campo label="Retorno">
          {(id) => <GlassDate id={id} value={ate} onChange={(v) => { setAte(v); if (erro) setErro(""); }} placeholder="Escolher data" min={de || undefined} />}
        </Campo>
      </Campos>
      {bloqueios.map((c, i) => (
        <p key={`b${i}`} role="alert" style={{ margin: "10px 0 0", display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }}>
          <Icon name="alert-triangle" size={15} /> {c.detalhe}
        </p>
      ))}
      {avisos.map((c, i) => (
        <div key={`a${i}`} style={{ marginTop: 10 }}><NotaRodape icone="info-circle" destaque>{c.detalhe}</NotaRodape></div>
      ))}
      {conf && conf.feriados.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <NotaRodape icone="flag">
            {conf.feriados.length === 1 ? "1 feriado dentro do período: " : `${conf.feriados.length} feriados dentro do período: `}
            {conf.feriados.map((f) => `${dataBR(f.dia).slice(0, 5)} ${f.nome}`).join(" · ")}.
          </NotaRodape>
        </div>
      )}

      <Secao
        icone="calendar"
        titulo="Período aquisitivo"
        resumo="Os 12 meses que deram direito a estas férias. Opcional."
      >
        <Campos>
          <Campo label="Aquisitivo de">
            {(id) => <GlassDate id={id} value={aqDe} onChange={setAqDe} placeholder="Escolher data" max={aqAte || undefined} />}
          </Campo>
          <Campo label="Aquisitivo até">
            {(id) => <GlassDate id={id} value={aqAte} onChange={setAqAte} placeholder="Escolher data" min={aqDe || undefined} />}
          </Campo>
          <Campo label="Observação" largo>
            {(id) => <textarea id={id} rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} />}
          </Campo>
        </Campos>
      </Secao>
    </PainelLateral>
  );
}

// ── A linha reaproveitada por documentos, atestados e férias ─────────────────
//
// As três listas têm a MESMA forma — ícone, título, detalhe, selo, rodapé e
// ações — e escrever três versões faria as três divergirem no que ninguém
// revisa (o tamanho do ícone, o alinhamento do selo, o alvo de toque).

function ItemDaLista({
  indice, icone, cor, titulo, detalhe, selo, rodape, observacao, acoes, aoApagar,
}: {
  indice: number;
  icone: string;
  cor: string;
  titulo: string;
  detalhe?: string;
  selo?: React.ReactNode;
  rodape?: string;
  observacao?: string | null;
  acoes?: React.ReactNode;
  aoApagar?: () => Promise<void>;
}) {
  const apagar = useAcao(async () => { await aoApagar?.(); });

  return (
    <li
      className="mt-linha"
      style={{
        ["--mt-i" as string]: indice,
        display: "grid", gap: 10, padding: "12px 0", minWidth: 0,
        borderTop: indice ? "1px solid var(--border)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: 34, height: 34, flex: "none", borderRadius: 10, display: "grid", placeItems: "center",
            background: `color-mix(in srgb, ${cor} 14%, transparent)`,
          }}
        >
          <Icon name={icone} size={17} color={cor} />
        </span>
        <div style={{ display: "grid", gap: 3, minWidth: 0, flex: 1 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
            <strong style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere" }}>{titulo}</strong>
            {selo}
          </span>
          {detalhe && (
            <span style={{ fontSize: 12.5, color: "var(--text-dim)", overflowWrap: "anywhere" }}>{detalhe}</span>
          )}
          {rodape && (
            <small style={{ fontSize: 11.5, color: "var(--text-dim)", overflowWrap: "anywhere" }}>{rodape}</small>
          )}
          {observacao && (
            <p style={{ margin: "4px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--text)", maxWidth: "68ch", overflowWrap: "anywhere" }}>
              {observacao}
            </p>
          )}
        </div>
      </div>

      {/* As ações ficam numa fileira PRÓPRIA, que rola de lado no celular. Ao
          lado do texto, elas espremiam o título a 320px; embaixo, cada uma
          mantém os 44px de alvo e a destrutiva fica longe das outras. */}
      {(acoes || aoApagar) && (
        <div className="tab-strip" style={{ display: "flex", gap: 8, alignItems: "center", padding: 0, minWidth: 0, maxWidth: "100%" }}>
          {acoes}
          {aoApagar && (
            <>
              <span style={{ flex: 1, minWidth: 0 }} />
              <Botao variante="perigo" tamanho="sm" icone="trash" estado={apagar.estado}
                     onClick={() => apagar.rodar()}>
                Apagar
              </Botao>
            </>
          )}
        </div>
      )}
    </li>
  );
}

// ── Ajuda ────────────────────────────────────────────────────────────────────

/** "3 anos e 2 meses". Conta em meses para não cair no erro do ano bissexto. */
function tempoDeCasa(admissao: string | null, hoje: string): string {
  if (!admissao) return "—";
  const [ai, ami] = admissao.split("-").map(Number);
  const [hi, hmi, hd] = hoje.split("-").map(Number);
  const ad = Number(admissao.slice(8, 10));
  let meses = (hi - ai) * 12 + (hmi - ami);
  if (hd < ad) meses -= 1;
  if (meses < 0) return "—";
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes: string[] = [];
  if (anos) partes.push(`${anos} ${anos === 1 ? "ano" : "anos"}`);
  if (resto) partes.push(`${resto} ${resto === 1 ? "mês" : "meses"}`);
  return partes.length ? partes.join(" e ") : "menos de um mês";
}
