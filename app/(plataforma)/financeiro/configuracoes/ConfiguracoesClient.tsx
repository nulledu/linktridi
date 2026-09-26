"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../Icon";
import { confirmar, toast } from "../../Toast";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral } from "../../ui/controles";
import { BarraSalvar, useBarraSalvar } from "../../ui/BarraSalvar";
import { AvisoSchema, Cabecalho, CampoMarca, Cartao, LinhaKpi, Marca, Selo, Tabela, TituloCartao, Vazio, SeletorEmpresa, SoLeitura, BotaoApagar, Alternativas, type TipoDeMarcaNaTela } from "../ui";
import { FileiraDeAbas, KpiSeta } from "../blocos";
import { ICONES_DE_MARCA } from "@/lib/financeiro/tipos";
import type { Empresa, PapelContato } from "@/lib/financeiro/tipos";

interface Rascunho {
  id: string | null;
  nome: string; razao_social: string; cnpj: string; cor: string; icone: string; ativa: boolean;
}

/** A mesma paleta de nove tons usada em Fornecedores e na Rosca — a marca da
 *  empresa é um acento, não uma escolha de milhares de cores. */
const PALETA = [
  "var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)",
  "var(--cat-6)", "var(--cat-7)", "var(--cat-8)", "var(--cat-9)",
];

const SELO_ATIVA = { label: "Ativa", cor: "var(--ok)" };
const SELO_INATIVA = { label: "Inativa", cor: "var(--neutro)" };

async function chamar(url: string, metodo: "POST" | "PATCH", corpo?: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(url, {
    method: metodo,
    headers: corpo === undefined ? undefined : { "content-type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(dados.erro ?? "Não deu para salvar."));
  return dados;
}

const recado = (e: unknown) => (e instanceof Error ? e.message : "Não deu para salvar.");

const cnpjBonito = (v: string | null): string => {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length !== 14) return v ?? "";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

const novoRascunho = (): Rascunho => ({
  id: null, nome: "", razao_social: "", cnpj: "", cor: PALETA[0], icone: ICONES_DE_MARCA[0], ativa: true,
});

const daEmpresa = (e: Empresa): Rascunho => ({
  id: e.id, nome: e.nome, razao_social: e.razao_social ?? "", cnpj: e.cnpj ?? "",
  cor: e.cor ?? PALETA[0], icone: e.icone ?? "", ativa: e.ativa,
});

/**
 * A única tela do sistema em que criar empresa é possível.
 *
 * `financeiro:config` — quem chegou aqui já provou essa chave no servidor
 * (ver `page.tsx`); o que esta tela decide é só o QUE mostrar, nunca o SE.
 *
 * Logo sobe por rota própria (multipart) e SÓ depois de a empresa existir —
 * por isso "Nova empresa" não oferece upload: o formulário de criação não tem
 * um `id` ainda para o arquivo apontar. Criar, depois reabrir para editar e
 * anexar o logo é dois passos, mas o alternativo (subir o arquivo pra um "id"
 * que nem existe no banco) é pior — cria um vínculo que pode nunca fechar se o
 * POST de criação falhar no meio.
 */
export interface ItemDaGaleria {
  id: string; nome: string; logo: string | null; icone: string | null; cor: string | null;
  papeis?: PapelContato[];
}

export interface GrupoDaGaleria {
  tipo: TipoDeMarcaNaTela;
  titulo: string;
  icone: string;
  itens: ItemDaGaleria[];
}

const SELO_PAPEL: Record<PapelContato, { label: string; cor: string }> = {
  contato: { label: "Contato", cor: "var(--azul)" },
  fornecedor: { label: "Fornecedor", cor: "var(--atencao)" },
  cliente: { label: "Cliente", cor: "var(--ok)" },
  parceiro: { label: "Parceiro", cor: "var(--roxo)" },
  prestador: { label: "Prestador", cor: "var(--primary-texto)" },
  outro: { label: "Outro", cor: "var(--neutro)" },
};

export interface CategoriaDoCatalogo { id: string; empresa_id: string; escopo: "fornecedor" | "contato"; nome: string }

export interface ConfigNaTela {
  patrimonio_prefixo: string; alerta_dias: number; formas_pagamento: string[]; folha_dia_padrao: number;
}

export interface PessoaNaTela {
  id: string; nome: string; username: string | null; subs: string[]; superusuario: boolean; empresas: string[];
}

type AbaDaConfig = "empresas" | "preferencias" | "categorias" | "fotos" | "acessos";

/** As cinco coisas que esta tela faz. Uma aba por assunto, na ordem em que se
 *  precisa delas: a empresa existe antes de tudo; o acesso é o último degrau. */
const ABAS_DA_CONFIG: { id: AbaDaConfig; label: string; icone: string }[] = [
  { id: "empresas", label: "Empresas", icone: "building-warehouse" },
  { id: "preferencias", label: "Preferências", icone: "adjustments-horizontal" },
  { id: "categorias", label: "Categorias", icone: "tag" },
  { id: "fotos", label: "Fotos e logos", icone: "photo" },
  { id: "acessos", label: "Quem tem acesso", icone: "lock" },
];

export function ConfiguracoesClient({
  empresas, logos, galeria, geral, categorias = [], empresaId = null, podeCategorias = false,
  configs = {}, configPendente = false, acessos = null, schemaPendente,
}: {
  empresas: Empresa[];
  /** empresaId → link do logo, já assinado pelo servidor. */
  logos: Record<string, string>;
  /** Tudo que tem foto no módulo, agrupado por tipo. Vazio nos grupos que esta
   *  pessoa não pode ler — o corte é no servidor, não aqui. */
  galeria: GrupoDaGaleria[];
  /** "Visão geral" ligado: sem empresa, a galeria de contas some. */
  geral: boolean;
  /** O catálogo (`fin_categorias`) das duas famílias. Vazio antes do SQL. */
  categorias?: CategoriaDoCatalogo[];
  /** A empresa aberta — categoria nasce NUMA empresa; em "geral" não dá. */
  empresaId?: string | null;
  /** `financeiro:cadastros` — é a mesma chave de quem cadastra fornecedor. */
  podeCategorias?: boolean;
  /** A configuração de cada empresa, por id (`fin_config`). */
  configs?: Record<string, ConfigNaTela>;
  /** `financeiro_config.sql` ainda não rodou: o card avisa em vez de salvar no vazio. */
  configPendente?: boolean;
  /** Quem entra no Financeiro — só para quem tem `financeiro:acessos`; `null` esconde o card. */
  acessos?: PessoaNaTela[] | null;
  schemaPendente: boolean;
}) {
  const router = useRouter();
  /**
   * Cinco assuntos sem parentesco nenhum moravam empilhados na mesma rolagem:
   * empresas, fotos, categorias, preferências e acessos. Quem vinha mudar o
   * dia da folha passava por três blocos que não tinham nada a ver. Agora cada
   * um é uma ABA — e a tela responde "onde eu mexo nisso?" antes de rolar.
   */
  const [aba, setAba] = useState<AbaDaConfig>("empresas");
  /**
   * UM seletor de empresa, não dois. Categorias e Preferências perguntavam a
   * mesma coisa em dois campos com dois estados: escolher a empresa num não
   * mudava o outro, e a tela mostrava as categorias da Tridi ao lado das
   * preferências da Gedux.
   */
  const [empresaDaConfig, setEmpresaDaConfig] = useState("");
  const empresaEmFoco = empresaId || empresaDaConfig;
  const empresaDasPreferencias = empresaEmFoco;
  const empresasAtivas = empresas.filter((e) => e.ativa).map((e) => ({ id: e.id, nome: e.nome }));
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [subindoLogo, setSubindoLogo] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const ativas = empresas.filter((e) => e.ativa);
  const comLogo = empresas.filter((e) => e.logo_url).length;

  async function salvar() {
    if (!rascunho) return;
    setSalvando(true);
    setErro("");
    try {
      const corpo = {
        nome: rascunho.nome,
        razao_social: rascunho.razao_social || null,
        cnpj: rascunho.cnpj || null,
        cor: rascunho.cor || null,
        icone: rascunho.icone || null,
        ...(rascunho.id ? { ativa: rascunho.ativa } : {}),
      };
      if (rascunho.id) {
        await chamar(`/api/financeiro/empresas/${rascunho.id}`, "PATCH", corpo);
        toast.ok("Empresa atualizada.");
      } else {
        await chamar("/api/financeiro/empresas", "POST", corpo);
        toast.ok("Empresa criada.");
      }
      setRascunho(null);
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setSalvando(false);
    }
  }

  async function inativar(e: Empresa) {
    if (!(await confirmar(`Tirar "${e.nome}" de circulação?`, {
      detalhe: "Ela some do seletor de quem lança compra e conta. O histórico dela continua intacto, e reativar é o mesmo clique.",
      perigo: true,
    }))) return;
    setSalvando(true);
    try {
      await chamar(`/api/financeiro/empresas/${e.id}`, "PATCH", { ativa: false });
      setRascunho(null);
      toast.ok("Empresa fora de circulação.");
      router.refresh();
    } catch (err) {
      setErro(recado(err));
    } finally {
      setSalvando(false);
    }
  }

  async function subirLogo(file: File) {
    if (!rascunho?.id) return;
    setSubindoLogo(true);
    setErro("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("tipo", "empresa");
      form.append("id", rascunho.id);
      const r = await fetch("/api/financeiro/marca", { method: "POST", body: form });
      const dados = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) throw new Error(dados.erro ?? "Não deu para subir a imagem.");
      toast.ok("Logo atualizado.");
      router.refresh();
    } catch (e) {
      setErro(recado(e));
    } finally {
      setSubindoLogo(false);
    }
  }

  return (
    <>
      <Cabecalho
        titulo="Configurações"
        sub="Empresas, marca e as regras que valem para o módulo inteiro."
        abas={
          <FileiraDeAbas
            abas={ABAS_DA_CONFIG.filter((a) => (a.id !== "categorias" || podeCategorias) && (a.id !== "acessos" || !!acessos))}
            valor={aba}
            aoTrocar={setAba}
          />
        }
        acoes={
          // O botão de criar acompanha a ABA: "Nova empresa" enquanto se olha
          // as preferências não cria nada que a pessoa esteja pensando.
          aba === "empresas" ? (
            <Botao variante="primario" icone="plus" onClick={() => { setErro(""); setRascunho(novoRascunho()); }}>
              Nova empresa
            </Botao>
          ) : undefined
        }
      />

      {schemaPendente && <AvisoSchema />}

      <LinhaKpi>
        <KpiSeta
          icone="building-warehouse" rotulo="Empresas cadastradas" valor={String(empresas.length)}
          detalhe="no seletor do topo"
          aoAbrir={() => setAba("empresas")}
          tituloDaSeta="Ver as empresas"
        />
        <KpiSeta
          icone="circle-check" rotulo="Ativas" valor={String(ativas.length)} tom="ok"
          detalhe={ativas.length < empresas.length ? `${empresas.length - ativas.length} fora de circulação` : "todas em uso"}
          aoAbrir={() => setAba("empresas")}
          tituloDaSeta="Ver as empresas ativas"
        />
        <KpiSeta
          icone="photo" rotulo="Com logo próprio" valor={String(comLogo)}
          tom={comLogo < empresas.length ? "atencao" : "ok"}
          detalhe={comLogo < empresas.length ? `${empresas.length - comLogo} ainda no ícone` : "nenhuma no ícone de reserva"}
          aoAbrir={() => setAba("fotos")}
          tituloDaSeta="Arrumar as fotos"
        />
      </LinhaKpi>

        {aba === "empresas" && (
          <Cartao>
            <TituloCartao icone="building-warehouse">Empresas</TituloCartao>
            <Tabela
              linhas={empresas}
              chaveDe={(e) => e.id}
              rotuloItem="empresas"
              aoClicar={(e) => { setErro(""); setRascunho(daEmpresa(e)); }}
              vazio={
                <Vazio
                  icone="building-warehouse"
                  titulo="Nenhuma empresa cadastrada"
                  detalhe="Tridi e Gedux nascem do arquivo de instalação — outra empresa entra por aqui."
                  acao={<Botao variante="primario" icone="plus" onClick={() => setRascunho(novoRascunho())}>Nova empresa</Botao>}
                />
              }
              colunas={[
                {
                  chave: "marca", label: "", largura: "48px",
                  celula: (e) => (
                    <Marca marca={{ nome: e.nome, logo: logos[e.id] ?? null, icone: e.icone, cor: e.cor }} tamanho={32} raio={9} />
                  ),
                },
                {
                  chave: "nome", label: "Nome", largura: "minmax(min(100%, 140px), 1.6fr)", titulo: true,
                  celula: (e) => e.nome,
                },
                {
                  chave: "cnpj", label: "CNPJ", largura: "minmax(min(100%, 116px), 1.1fr)", soNoComputador: true,
                  celula: (e) => <span style={{ fontVariantNumeric: "tabular-nums" }}>{cnpjBonito(e.cnpj ?? null) || "—"}</span>,
                },
                {
                  chave: "status", label: "Status", largura: "96px", fim: true,
                  celula: (e) => <Selo selo={e.ativa ? SELO_ATIVA : SELO_INATIVA} />,
                },
              ]}
            />
          </Cartao>
        )}

      {/* A GALERIA DE FOTOS — tudo que tem imagem, numa tela só.
          Estava espalhado: logo de empresa aqui, de conta na tela de contas, de
          fornecedor no cadastro dele. Quem quer arrumar as imagens de uma vez
          tinha de passar por cinco telas e lembrar de todas. */}
      {aba === "fotos" && (
        <Cartao style={{ marginTop: 14 }}>
          <TituloCartao icone="photo">Fotos e logos</TituloCartao>
          <p style={{ margin: "0 0 4px", fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
            A imagem aparece em toda lista do módulo. Sem ela entra o ícone; sem os dois, a inicial
            do nome — nada fica em branco. Os arquivos são privados: só abrem para quem tem o
            Financeiro desta empresa.
          </p>

          {galeria.length === 0 ? (
            <Vazio
              icone="photo"
              titulo={geral ? "Escolha uma empresa" : "Nada para ilustrar ainda"}
              detalhe={geral
                ? "Em “Visão geral” não há empresa escolhida, e conta/fornecedor/pessoa são por empresa. Troque no seletor para arrumar as fotos."
                : "Cadastre uma empresa, conta, contato ou pessoa da folha — a foto entra depois."}
              compacto
            />
          ) : galeria.map((g) => (
            <section key={g.tipo} style={{ marginTop: 16, minWidth: 0 }}>
              <h3
                style={{
                  display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 800,
                  letterSpacing: ".04em", color: "var(--text-dim)", textTransform: "uppercase",
                }}
              >
                <Icon name={g.icone} size={14} color="var(--text-dim)" />
                {g.titulo}
                <span style={{ fontWeight: 700, opacity: 0.7 }}>· {g.itens.length}</span>
              </h3>

              {/* `minmax(min(100%, …))` e não `minmax(240px, …)`: a segunda forma
                  não colapsa no celular e a fileira vaza a tela de 320px. */}
              <div
                style={{
                  marginTop: 8, display: "grid", gap: 10,
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
                }}
              >
                {g.itens.map((i) => (
                  <div
                    key={i.id}
                    style={{
                      border: "1px solid var(--border)", borderRadius: 12, padding: 12, minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 700, overflowWrap: "anywhere", marginBottom: 8 }}>
                      {i.nome}
                    </div>
                    {i.papeis?.length ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "-2px 0 10px" }}>
                        {i.papeis.map((papel) => <Selo key={papel} selo={SELO_PAPEL[papel]} />)}
                      </div>
                    ) : null}
                    <CampoMarca
                      tipo={g.tipo}
                      id={i.id}
                      nome={i.nome}
                      logo={i.logo}
                      icone={i.icone}
                      cor={i.cor}
                      aoTrocar={() => router.refresh()}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </Cartao>
      )}

      {/* CATEGORIAS — "configuração interna, sem página própria" (§14 da
          especificação). Antes eram texto solto, e o filtro mostrava "Matéria
          Prima" e "matéria prima" como duas coisas sem como corrigir. O catálogo
          aprende sozinho quando alguém digita um nome novo num cadastro; aqui é
          onde se ARRUMA: tirar a errada, cadastrar a que ainda não existe. */}
      {aba === "categorias" && podeCategorias && (
          <Cartao style={{ marginTop: 14 }}>
            <TituloCartao icone="tag">Categorias</TituloCartao>
            <p style={{ margin: "0 0 4px", fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
              O vocabulário dos cadastros. Fornecedor e contato têm listas separadas — “Peças” de
              quem vende não é “Peças” de quem conserta. Tirar uma daqui não apaga o rótulo de quem
              já a usa: ela só deixa de ser sugerida.
            </p>
            {/* Em "Visão geral" a tela não tem empresa: a pessoa escolhe AQUI, em
                vez de ser mandada trocar o seletor lá em cima e voltar. */}
            {!empresaId && empresasAtivas.length > 0 && (
              <div style={{ maxWidth: 360, marginBottom: 14 }}>
                <Campo label="Empresa" dica="Categoria nasce numa empresa. Escolha em qual.">
                  {(id) => <SeletorEmpresa id={id} empresas={empresasAtivas} valor={empresaDaConfig} aoMudar={setEmpresaDaConfig} />}
                </Campo>
              </div>
            )}
            {!empresaEmFoco ? (
              <Vazio
                icone="tag"
                titulo="Escolha uma empresa"
                detalhe="As categorias de cada empresa aparecem assim que você escolher acima."
                compacto
              />
            ) : (
              <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
                <Catalogo escopo="fornecedor" titulo="De fornecedor" empresaId={empresaEmFoco as string}
                  itens={categorias.filter((c) => c.escopo === "fornecedor" && c.empresa_id === empresaEmFoco)} />
                <Catalogo escopo="contato" titulo="De contato" empresaId={empresaEmFoco as string}
                  itens={categorias.filter((c) => c.escopo === "contato" && c.empresa_id === empresaEmFoco)} />
              </div>
            )}
        </Cartao>
      )}

      {/* PREFERÊNCIAS — quatro números que cada tela decidia sozinha, com um
          valor escrito no código, e que o dono não tinha como mudar sem pedir. */}
      {aba === "preferencias" && (
        <Cartao style={{ marginTop: 14 }}>
          <TituloCartao icone="adjustments-horizontal">Preferências</TituloCartao>
          {configPendente && (
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--atencao)", lineHeight: 1.55 }}>
              Os valores abaixo são os padrões: o banco de preferências ainda não existe. Rode
              <code> supabase/financeiro_config.sql</code> para poder mudá-los.
            </p>
          )}
          {!empresaId && empresasAtivas.length > 0 && (
            <div style={{ maxWidth: 360, marginBottom: 14 }}>
              <Campo label="Empresa" dica="Cada empresa tem as suas. Escolha qual ajustar.">
                {(id) => <SeletorEmpresa id={id} empresas={empresasAtivas} valor={empresaDaConfig} aoMudar={setEmpresaDaConfig} />}
              </Campo>
            </div>
          )}
          {!empresaDasPreferencias ? (
            <Vazio icone="adjustments-horizontal" titulo="Escolha uma empresa" detalhe="As preferências são por empresa." compacto />
          ) : (
            <Preferencias
              key={empresaDasPreferencias}
              empresaId={empresaDasPreferencias}
              inicial={configs[empresaDasPreferencias] ?? CONFIG_PADRAO_NA_TELA}
              travado={configPendente}
            />
          )}
        </Cartao>
      )}

      {/* QUEM TEM ACESSO — leitura. Quem concede é Pessoas › Gestão de equipe;
          esta lista existe para responder "quem vê a folha hoje?" sem abrir a
          ficha de cada um. */}
      {aba === "acessos" && acessos && (
          <Cartao style={{ marginTop: 14 }}>
            <TituloCartao icone="lock">Quem tem acesso</TituloCartao>
            <p style={{ margin: "0 0 8px", fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
              O Financeiro é área restrita: nem quem é admin entra por padrão. Liberar ou tirar é em{" "}
              <a href="/colaboradores" style={{ color: "var(--primary-texto)", fontWeight: 700 }}>Pessoas › Gestão de equipe</a>,
              pessoa por pessoa. Aqui é só a lista do que está valendo agora.
            </p>
            {acessos.length === 0 ? (
              <Vazio icone="lock" titulo="Ninguém além de você" detalhe="Nenhuma outra pessoa tem chave do Financeiro ligada na grade." compacto />
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
                {acessos.map((p) => (
                  <li
                    key={p.id}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0,
                      padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)",
                    }}
                  >
                    <Icon name={p.superusuario ? "crown" : "user"} size={16} color="var(--text-dim)" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ display: "block", fontSize: 13.5, overflowWrap: "anywhere" }}>
                        {p.nome}
                        {p.username && <span style={{ fontWeight: 500, color: "var(--text-dim)" }}> · {p.username}</span>}
                      </strong>
                      <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.5 }}>
                        {p.superusuario ? "Superusuário — porta e governança pela lista fixa; o resto pela grade. " : ""}
                        {p.subs.length ? p.subs.join(" · ") : "Só a porta, sem nenhuma sub."}
                      </span>
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--text-dim)", marginTop: 2 }}>
                        {p.empresas.length ? `Empresas: ${p.empresas.join(", ")}` : "Todas as empresas"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
          )}
        </Cartao>
      )}

      {rascunho && (
        <PainelLateral
          centrado
          titulo={rascunho.id ? "Editar empresa" : "Nova empresa"}
          soFechaNoX
          subtitulo={rascunho.id ? undefined : "O logo entra depois de criar — reabra para anexar."}
          onFechar={() => setRascunho(null)}
          largura={520}
          rodape={
            <Acoes>
              <Botao onClick={() => setRascunho(null)}>Cancelar</Botao>
              {rascunho.id && rascunho.ativa && (
                <Botao variante="perigo" icone="ban" onClick={() => inativar(empresas.find((e) => e.id === rascunho.id)!)} disabled={salvando}>
                  Tirar de circulação
                </Botao>
              )}
              {rascunho.id && (
                <BotaoApagar
                  tipo="empresa" id={rascunho.id} nome={rascunho.nome ?? ""}
                  aoApagar={() => { setRascunho(null); router.refresh(); }}
                />
              )}
              <Esp />
              <Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar</Botao>
            </Acoes>
          }
        >
          {erro && (
            <p style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
          )}

          {rascunho.id && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              <Marca marca={{ nome: rascunho.nome, logo: logos[rascunho.id] ?? null, icone: rascunho.icone, cor: rascunho.cor }} tamanho={56} raio={14} />
              <div style={{ display: "grid", gap: 6 }}>
                <input
                  ref={arquivoRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  style={{ display: "none" }}
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void subirLogo(f); e.target.value = ""; }}
                />
                <Botao icone="upload" onClick={() => arquivoRef.current?.click()} carregando={subindoLogo}>
                  {logos[rascunho.id] ? "Trocar logo" : "Subir logo"}
                </Botao>
                <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>JPG, PNG, WEBP ou SVG — até 2 MB.</span>
              </div>
            </div>
          )}

          <Campos>
            <Campo label="Nome" largo>
              {(id) => (
                <input id={id} value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} placeholder="Tridi" />
              )}
            </Campo>

            <Campo label="Razão social">
              {(id) => (
                <input id={id} value={rascunho.razao_social} onChange={(e) => setRascunho({ ...rascunho, razao_social: e.target.value })} placeholder="Tridi Comércio Ltda" />
              )}
            </Campo>

            <Campo label="CNPJ" dica="Pode digitar com ponto e barra.">
              {(id) => (
                <input id={id} inputMode="numeric" value={rascunho.cnpj} onChange={(e) => setRascunho({ ...rascunho, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
              )}
            </Campo>

            <Campo label="Cor de acento" largo>
              {() => (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
                  {PALETA.map((cor) => (
                    <button
                      key={cor}
                      type="button"
                      aria-label={`Usar esta cor`}
                      onClick={() => setRascunho({ ...rascunho, cor })}
                      style={{
                        width: 30, height: 30, borderRadius: "50%", background: cor, cursor: "pointer",
                        border: rascunho.cor === cor ? "2.5px solid var(--text)" : "2.5px solid transparent",
                        boxShadow: rascunho.cor === cor ? `0 0 0 2px ${cor}` : "none",
                      }}
                    />
                  ))}
                </div>
              )}
            </Campo>

            <Campo label="Ícone (quando não há logo)" largo dica="Aparece nas listas até você subir uma imagem.">
              {() => (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
                  {ICONES_DE_MARCA.map((nome) => {
                    const on = rascunho.icone === nome;
                    return (
                      <button
                        key={nome}
                        type="button"
                        title={nome}
                        onClick={() => setRascunho({ ...rascunho, icone: nome })}
                        style={{
                          width: 38, height: 38, borderRadius: "var(--r-sm)", display: "grid", placeItems: "center",
                          cursor: "pointer", background: on ? "color-mix(in srgb, var(--primary) 16%, var(--surface))" : "var(--surface)",
                          border: on ? "1.5px solid var(--primary)" : "1.5px solid var(--border)",
                        }}
                      >
                        <Icon name={nome} size={18} color={on ? "var(--primary-texto)" : "var(--text-dim)"} />
                      </button>
                    );
                  })}
                </div>
              )}
            </Campo>

            {rascunho.id && (
              <Campo label="Situação">
                {(id) => (
                  <Alternativas
  id={id}
  valor={rascunho.ativa ? "1" : "0"}
  aoEscolher={(v) => setRascunho({ ...rascunho, ativa: v === "1" })}
  opcoes={[{ id: "1", label: "Ativa" }, { id: "0", label: "Inativa" }]}
/>
                )}
              </Campo>
            )}
          </Campos>
        </PainelLateral>
      )}
    </>
  );
}


/**
 * Uma das duas listas do catálogo, com o campo de cadastrar embaixo.
 *
 * Sem botão de salvar: cada nome entra e sai na hora. Um rascunho de
 * categorias esperando confirmação seria uma segunda verdade em cima da
 * primeira — e a primeira já está sendo usada pelos cadastros.
 */
function Catalogo({ escopo, titulo, empresaId, itens }: {
  escopo: "fornecedor" | "contato"; titulo: string; empresaId: string;
  itens: CategoriaDoCatalogo[];
}) {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function cadastrar() {
    const n = nome.trim();
    if (!n) return;
    setOcupado(true); setErro("");
    try {
      await chamar("/api/financeiro/categorias", "POST", { empresa_id: empresaId, escopo, nome: n });
      setNome("");
      toast.ok(`“${n}” cadastrada.`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para cadastrar.");
    } finally { setOcupado(false); }
  }

  async function tirar(c: CategoriaDoCatalogo) {
    if (!(await confirmar(`Tirar “${c.nome}” do catálogo?`, {
      detalhe: "Quem já está marcado com ela continua assim. Ela só para de ser sugerida.",
    }))) return;
    setOcupado(true); setErro("");
    try {
      const r = await fetch(`/api/financeiro/categorias?id=${c.id}`, { method: "DELETE" });
      const dados = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) throw new Error(dados.erro ?? "Não deu para tirar.");
      toast.ok("Categoria retirada.");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para tirar.");
    } finally { setOcupado(false); }
  }

  return (
    <section style={{ minWidth: 0 }}>
      <h3 style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", color: "var(--text-dim)", textTransform: "uppercase" }}>
        {titulo} <span style={{ fontWeight: 700, opacity: 0.7 }}>· {itens.length}</span>
      </h3>

      {itens.length === 0 ? (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--text-dim)" }}>
          Nenhuma ainda. A primeira entra pelo campo abaixo — ou sozinha, quando alguém digitar uma
          num cadastro.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {itens.map((c) => (
            <li key={c.id}>
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4, minHeight: "var(--tap)",
                  padding: "3px 3px 3px 11px", borderRadius: "var(--r-pill)",
                  border: "1px solid var(--border)", background: "var(--surface-2)",
                  fontSize: 12.5, fontWeight: 700, maxWidth: "100%",
                }}
              >
                <span style={{ overflowWrap: "anywhere" }}>{c.nome}</span>
                <button
                  type="button"
                  title={`Tirar “${c.nome}”`}
                  onClick={() => tirar(c)}
                  disabled={ocupado}
                  style={{
                    display: "grid", placeItems: "center", width: 36, height: 36, flex: "none",
                    borderRadius: "var(--r-pill)", border: "none", background: "transparent", cursor: "pointer",
                  }}
                >
                  <Icon name="x" size={13} color="var(--text-dim)" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10, minWidth: 0 }}>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void cadastrar(); } }}
          placeholder={escopo === "fornecedor" ? "Matéria-prima, embalagem…" : "Encanador, eletricista…"}
          style={{ flex: "1 1 160px", minWidth: 0 }}
          aria-label={`Nova categoria ${titulo.toLowerCase()}`}
        />
        <Botao icone="plus" carregando={ocupado} onClick={cadastrar}>Cadastrar</Botao>
      </div>
      {erro && (
        <p style={{ margin: "8px 0 0", fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
      )}
    </section>
  );
}


const CONFIG_PADRAO_NA_TELA: ConfigNaTela = {
  patrimonio_prefixo: "PAT", alerta_dias: 7,
  formas_pagamento: ["PIX", "Boleto", "Cartão", "Transferência", "Dinheiro"], folha_dia_padrao: 5,
};

/**
 * O formulário das preferências de UMA empresa.
 *
 * Salva tudo de uma vez, num PATCH só: são quatro campos e a pessoa costuma
 * mexer em dois. Um botão por campo viraria quatro confirmações para uma
 * decisão. A lista de formas de pagamento é o único campo composto — chips com
 * "tirar" e um campo para acrescentar, o mesmo desenho das categorias.
 */
function Preferencias({ empresaId, inicial, travado }: {
  empresaId: string; inicial: ConfigNaTela; travado: boolean;
}) {
  const router = useRouter();
  const [prefixo, setPrefixo] = useState(inicial.patrimonio_prefixo);
  const [alerta, setAlerta] = useState(String(inicial.alerta_dias));
  const [diaFolha, setDiaFolha] = useState(String(inicial.folha_dia_padrao));
  const [formas, setFormas] = useState<string[]>(inicial.formas_pagamento);
  const [novaForma, setNovaForma] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const mudou = prefixo !== inicial.patrimonio_prefixo
    || Number(alerta) !== inicial.alerta_dias
    || Number(diaFolha) !== inicial.folha_dia_padrao
    || formas.join("|") !== inicial.formas_pagamento.join("|");

  const acrescentarForma = () => {
    const f = novaForma.trim();
    if (!f || formas.some((x) => x.toLowerCase() === f.toLowerCase()) || formas.length >= 12) return;
    setFormas([...formas, f]);
    setNovaForma("");
  };

  async function salvar() {
    setOcupado(true); setErro("");
    try {
      await chamar("/api/financeiro/config", "PATCH", {
        empresa_id: empresaId,
        patrimonio_prefixo: prefixo,
        alerta_dias: Number(alerta),
        folha_dia_padrao: Number(diaFolha),
        formas_pagamento: formas,
      });
      toast.ok("Preferências salvas.");
      router.refresh();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para salvar.");
      return false;
    } finally { setOcupado(false); }
  }

  function desfazer() {
    setPrefixo(inicial.patrimonio_prefixo);
    setAlerta(String(inicial.alerta_dias));
    setDiaFolha(String(inicial.folha_dia_padrao));
    setFormas(inicial.formas_pagamento);
    setErro("");
  }
  const barra = useBarraSalvar({ sujo: mudou && !travado, salvar, desfazer });

  return (
    <SoLeitura ativo={travado} motivo="Rode supabase/financeiro_config.sql para poder mudar as preferências.">
      <Campos>
        <Campo label="Prefixo do patrimônio" dica="Vira o começo do código de cada bem: PAT-001, PAT-002…">
          {(id) => (
            <input
              id={id} maxLength={6}
              value={prefixo}
              onChange={(e) => setPrefixo(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
              placeholder="PAT"
              style={{ textTransform: "uppercase", fontVariantNumeric: "tabular-nums" }}
            />
          )}
        </Campo>

        <Campo label="Alerta de vencimento (dias)" dica="Quantos dias antes um compromisso vira “vence em breve” na Visão Geral.">
          {(id) => (
            <input
              id={id} type="number" min="1" max="90" inputMode="numeric"
              value={alerta}
              onChange={(e) => setAlerta(e.target.value)}
            />
          )}
        </Campo>

        <Campo label="Dia padrão da folha" dica="O dia de pagamento que uma pessoa nova já traz preenchido.">
          {(id) => (
            <input
              id={id} type="number" min="1" max="31" inputMode="numeric"
              value={diaFolha}
              onChange={(e) => setDiaFolha(e.target.value)}
            />
          )}
        </Campo>

        <Campo label="Formas de pagamento" largo dica="Sugeridas nos cadastros. Texto livre continua valendo — isto só evita “Pix”, “PIX” e “pix” virarem três coisas.">
          {(id) => (
            <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
              {formas.length > 0 && (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {formas.map((f) => (
                    <li key={f}>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 4, minHeight: 36,
                        padding: "3px 3px 3px 11px", borderRadius: "var(--r-pill)",
                        border: "1px solid var(--border)", background: "var(--surface-2)", fontSize: 12.5, fontWeight: 700,
                      }}>
                        {f}
                        <button
                          type="button" title={`Tirar “${f}”`}
                          onClick={() => setFormas(formas.filter((x) => x !== f))}
                          style={{ display: "grid", placeItems: "center", width: 32, height: 32, border: "none", background: "transparent", borderRadius: "var(--r-pill)", cursor: "pointer" }}
                        >
                          <Icon name="x" size={13} color="var(--text-dim)" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                <input
                  id={id}
                  value={novaForma}
                  onChange={(e) => setNovaForma(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); acrescentarForma(); } }}
                  placeholder="Débito automático, cheque…"
                  style={{ flex: "1 1 160px", minWidth: 0 }}
                />
                <Botao icone="plus" onClick={acrescentarForma}>Acrescentar</Botao>
              </div>
            </div>
          )}
        </Campo>
      </Campos>

      {erro && (
        <p style={{ margin: "10px 0 0", fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
      )}

      <Acoes>
        <Esp />
        <Botao variante="primario" icone="check" carregando={ocupado} disabled={!mudou} onClick={salvar}>
          Salvar preferências
        </Botao>
      </Acoes>
      <BarraSalvar {...barra} />
    </SoLeitura>
  );
}
