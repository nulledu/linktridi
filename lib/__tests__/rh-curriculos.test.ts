/**
 * RH → Currículos — as travas do módulo.
 *
 *  1. O payload do TridiFlow vira candidato (nome/contato pelos apelidos,
 *     currículo pelo link privado, resto vira resposta, utm sai do meio).
 *  2. O formulário configurável: perguntas condicionais pela ocupação,
 *     validação igual no cliente e no servidor, respostas legíveis com a
 *     etapa, triagem (perfil + etiquetas), e a normalização que não deixa
 *     a config apagar nome/contato/currículo.
 *  3. Tokens: carimbo de início expira, token do webhook confere só pelo hash.
 *  4. Privacidade: a lista nunca seleciona resposta/arquivo/observação, e a
 *     área `curriculos` do B2 abre pra chave certa do RH.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { candidatoDoWebhook, vagaPeloTexto } from "../rh/curriculos/receber";
import {
  FORMULARIO_PADRAO, PERGUNTAS_FIXAS, limparRespostas, normalizarFormulario, normalizarPerguntasDaVaga, partesDoTitulo,
  pendenciaDoEnvio, perfilDoCandidato, respostasLegiveis, semGabarito, telasDoFormulario, type Respostas,
} from "../rh/curriculos/formulario";
import { POSES } from "../rh/curriculos/personagens";
import { existsSync } from "node:fs";
import { ICONS } from "../../app/(plataforma)/Icon";
import { LEITURA_POR_AREA, AREAS_DO_NAVEGADOR } from "../armazenamento/referencia";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

describe("webhook do TridiFlow → candidato", () => {
  const corpo = {
    evento: "lead", bot: "Quiz de Candidatura", bot_id: "b1", sessao_id: "s1", quando: "2026-09-16T12:00:00.000Z",
    seu_nome: "Maria Oliveira", whatsapp: "(14) 99999-9999", email: "maria@email.com", cidade: "Cerqueira César, SP",
    vaga: "Auxiliar de Produção", experiencia: "Sim, 3 anos", disponibilidade: "Período integral",
    curriculo: "https://gaius.tridi.com.br/api/arquivos/curriculos/2026/09/abc.pdf",
    utm_source: "instagram", tags: ["forte"],
  };

  it("acha nome, contato e cidade pelos apelidos do CRM", () => {
    const r = candidatoDoWebhook(corpo);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.candidato.nome).toBe("Maria Oliveira");
    expect(r.candidato.email).toBe("maria@email.com");
    expect(r.candidato.telefone).toBe("(14) 99999-9999");
    expect(r.candidato.cidade).toBe("Cerqueira César, SP");
    expect(r.candidato.vaga_texto).toBe("Auxiliar de Produção");
    expect(r.candidato.externo_id).toBe("tridiflow:s1");
    expect(r.candidato.recebido_em).toBe("2026-09-16T12:00:00.000Z");
  });

  it("o currículo vira anexo pela chave da área privada, e sai das respostas", () => {
    const r = candidatoDoWebhook(corpo);
    if (!r.ok) throw new Error(r.erro);
    expect(r.candidato.curriculo?.chave).toBe("curriculos/2026/09/abc.pdf");
    expect(r.candidato.curriculo?.url).toBe("/api/arquivos/curriculos/2026/09/abc.pdf");
    expect(r.candidato.curriculo?.tipo).toBe("application/pdf");
    expect(r.candidato.respostas.map((x) => x.chave)).toEqual(["experiencia", "disponibilidade"]);
  });

  it("utm e tags vão pra origem, não pra resposta", () => {
    const r = candidatoDoWebhook(corpo);
    if (!r.ok) throw new Error(r.erro);
    expect(r.candidato.origem_detalhe).toMatchObject({ fonte: "webhook", bot: "Quiz de Candidatura", utm: { utm_source: "instagram" }, tags: ["forte"] });
    expect(r.candidato.respostas.some((x) => x.chave.startsWith("utm_"))).toBe(false);
  });

  it("sem nome nem contato não é candidato", () => {
    expect(candidatoDoWebhook({ evento: "lead", pergunta: "x" }).ok).toBe(false);
    expect(candidatoDoWebhook("lixo").ok).toBe(false);
    expect(candidatoDoWebhook(null).ok).toBe(false);
  });

  it("link que não é da área curriculos NÃO vira currículo", () => {
    const r = candidatoDoWebhook({ nome: "A", cv: "/api/arquivos/ponto/2026/09/selfie.jpg" });
    if (!r.ok) throw new Error(r.erro);
    expect(r.candidato.curriculo).toBeNull();
  });

  it("acha a vaga pelo texto, sem acento e sem caixa", () => {
    const vagas = [{ id: "1", titulo: "Auxiliar de Produção" }, { id: "2", titulo: "Designer" }];
    expect(vagaPeloTexto(vagas, "auxiliar de producao")?.id).toBe("1");
    expect(vagaPeloTexto(vagas, "Vaga: Designer")?.id).toBe("2");
    expect(vagaPeloTexto(vagas, "Piloto")).toBeNull();
    expect(vagaPeloTexto(vagas, null)).toBeNull();
  });
});

describe("o fluxo padrão é o das referências (12 telas)", () => {
  it("abertura + 15 telas — as 16 das referências (o detalhe do momento só entra quando vale), na ordem das referências, com personagem em cada uma", () => {
    const { telas, totalEtapas } = telasDoFormulario(FORMULARIO_PADRAO, {});
    expect(totalEtapas + 1).toBe(16);
    expect(telas.map((t) => t.etapa.rotulo)).toEqual([
      "Vamos começar", "Seu momento", "Aprendizado", "Sua história", "Relacionamento", "Como você pensa",
      "Iniciativa", "Persistência", "Simplificação", "Priorização", "Motivação", "Na prática",
      "Contato", "Origem e indicação", "Currículo",
    ]);
    expect(telas.find((t) => t.etapa.id === "contato")!.perguntas.map((p) => p.id)).toEqual(["email", "telefone"]);
    // "Se sim, qual o nome?" só aparece pra quem disse que conhece alguém.
    expect(telas.find((t) => t.etapa.id === "origem")!.perguntas.map((p) => p.id)).toEqual(["como_conheceu", "conhece_alguem"]);
    for (const t of telas) expect(t.etapa.personagem).toBeTruthy();
    expect(FORMULARIO_PADRAO.abertura.personagem).toBe("ela-pensando");
  });
});

describe("o formulário configurável de candidatura (com as etapas condicionais ligadas)", () => {
  const LIGAR = new Set(["conhecer", "formacao", "experiencia", "disponibilidade", "indicacao"]);
  const cfg = normalizarFormulario({ ...FORMULARIO_PADRAO, etapas: FORMULARIO_PADRAO.etapas.map((e) => (LIGAR.has(e.id) ? { ...e, ativa: true } : e)) });
  const base: Respostas = {
    nome: "Ana Souza", telefone: "(14) 99999-8888", email: "ana@email.com", cidade: "Cerqueira César", idade: "21",
    momento: "faculdade", area: "comercial", aprender: "comunicação", historia: "voluntariado", orgulho: "pastas",
    social: "aproximo", persistencia: "entendo", simplificacao: "simples", priorizacao: "urgência",
    horario: ["manha", "tarde"], jornada: "integral", inicio: "imediato",
    como_conheceu: "indicacao", conhece_alguem: "nao", tarefa: "pesquiso", iniciativa: "entendo", motivo: "propósito",
    curriculo: "curriculos/2026/09/abc.pdf",
  };
  const ids = (r: Respostas) => telasDoFormulario(cfg, r).telas.flatMap((t) => t.perguntas.map((p) => p.id));

  // O detalhe do "Seu momento" (19/09/26) — no fluxo PADRÃO.
  const padrao = (r: Respostas) => telasDoFormulario(FORMULARIO_PADRAO, r).telas.flatMap((t) => t.perguntas.map((p) => p.id));
  const detalhe = (r: Respostas) => {
    const ts = telasDoFormulario(FORMULARIO_PADRAO, r).telas.filter((t) => t.etapa.id.startsWith("momento_"));
    return ts.length ? ts.flatMap((t) => t.perguntas.map((p) => p.id)) : null;
  };

  it("ensino médio: só pergunta onde estuda", () => {
    expect(detalhe({ ...base, momento: "ensino_medio" })).toEqual(["instituicao"]);
  });
  it("técnico/faculdade: o que estuda e onde", () => {
    expect(detalhe({ ...base, momento: "faculdade" })).toEqual(["curso", "instituicao"]);
    expect(detalhe({ ...base, momento: "curso_tecnico" })).toEqual(["curso", "instituicao"]);
  });
  it("trabalhando: onde, cargo e há quanto tempo (opcional)", () => {
    expect(detalhe({ ...base, momento: "trabalhando" })).toEqual(["empresa_atual", "cargo_atual", "tempo_atual"]);
    expect(FORMULARIO_PADRAO.perguntas.find((p) => p.id === "tempo_atual")!.obrigatoria).toBe(false);
  });
  it("trabalho e estudo: os dois blocos em duas telas curtas, sem repetir pergunta", () => {
    const telas = telasDoFormulario(FORMULARIO_PADRAO, { ...base, momento: "trabalho_estudo" }).telas.filter((t) => t.etapa.id.startsWith("momento_"));
    expect(telas.map((t) => t.etapa.id)).toEqual(["momento_estudo", "momento_trabalho"]);
    const v = detalhe({ ...base, momento: "trabalho_estudo" })!;
    expect(v).toEqual(["curso", "instituicao", "empresa_atual", "cargo_atual", "tempo_atual"]);
    const todas = padrao({ ...base, momento: "trabalho_estudo" });
    expect(new Set(todas).size).toBe(todas.length);
  });
  it("já concluiu ou outro momento: a tela de detalhe nem aparece", () => {
    expect(detalhe({ ...base, momento: "concluido" })).toBeNull();
    expect(detalhe({ ...base, momento: "outro" })).toBeNull();
  });

  it("quem procura emprego não vê empresa atual; 'já trabalhou? sim' abre a última ocupação", () => {
    const nao = ids({ ...base, ocupacao: "procurando", ja_trabalhou: "nao" });
    expect(nao).not.toContain("empresa_atual");
    expect(nao).not.toContain("ultima_ocupacao");
    const sim = ids({ ...base, ocupacao: "procurando", ja_trabalhou: "sim" });
    for (const id of ["ultima_ocupacao", "ultima_empresa", "ultimo_tempo"]) expect(sim).toContain(id);
  });

  it("resposta de pergunta escondida não reabre a dependente (ja_trabalhou velho de quem virou trabalhador)", () => {
    const v = ids({ ...base, ocupacao: "trabalho", ja_trabalhou: "sim" });
    expect(v).not.toContain("ultima_ocupacao");
  });

  it("'Qual o nome?' aparece na tela de origem quando a pessoa conhece alguém", () => {
    const { telas } = telasDoFormulario(cfg, { ...base, ocupacao: "estudo", conhece_alguem: "sim" });
    const tela = telas.find((t) => t.perguntas.some((p) => p.id === "conhece_alguem"))!;
    expect(tela.perguntas.map((p) => p.id)).toEqual(["como_conheceu", "conhece_alguem", "conhece_quem"]);
  });

  it("perguntas da vaga entram no começo da etapa marcada", () => {
    const daVaga = normalizarPerguntasDaVaga([{ id: "excel", titulo: "Você sabe Excel?", tipo: "simnao", obrigatoria: true }]);
    expect(daVaga[0].id).toBe("v_excel");
    const { telas } = telasDoFormulario(cfg, { ...base, ocupacao: "estudo" }, daVaga);
    const mais = telas.filter((t) => t.etapa.recebe_vaga);
    expect(mais[0].perguntas[0].id).toBe("v_excel");
  });

  it("o servidor confere só o que está visível — e barra o que falta", () => {
    const completo = { ...base, momento: "faculdade", curso: "Adm", instituicao: "Uninove" };
    expect(pendenciaDoEnvio(FORMULARIO_PADRAO, completo)).toBeNull();
    expect(pendenciaDoEnvio(FORMULARIO_PADRAO, { ...completo, curso: "" })).toMatch(/Seu momento/);
    expect(pendenciaDoEnvio(FORMULARIO_PADRAO, { ...completo, email: "x" })).toMatch(/e-mail/i);
    expect(pendenciaDoEnvio(FORMULARIO_PADRAO, { ...completo, telefone: "999" })).toMatch(/WhatsApp/);
    // Quem só estuda não precisa dizer onde trabalha (está escondido).
    expect(pendenciaDoEnvio(FORMULARIO_PADRAO, { ...completo, empresa_atual: "" })).toBeNull();
    // Quem trabalha precisa; o tempo é opcional.
    const trab = { ...base, momento: "trabalhando", empresa_atual: "Silva", cargo_atual: "Auxiliar" };
    expect(pendenciaDoEnvio(FORMULARIO_PADRAO, trab)).toBeNull();
    expect(pendenciaDoEnvio(FORMULARIO_PADRAO, { ...trab, cargo_atual: "" })).toBeTruthy();
  });

  it("limparRespostas descarta pergunta escondida e chave desconhecida", () => {
    const r = limparRespostas(FORMULARIO_PADRAO, { ...base, momento: "faculdade", cargo_atual: "Gerente", hack: "x", curso: "Adm" });
    expect(r.cargo_atual).toBeUndefined();
    expect((r as Record<string, unknown>).hack).toBeUndefined();
    expect(r.curso).toBe("Adm");
  });

  it("as respostas que o RH lê são legíveis e trazem a etapa; contato não vira resposta", () => {
    const r = respostasLegiveis(FORMULARIO_PADRAO, { ...base, momento: "trabalho_estudo", curso: "Adm", instituicao: "Uninove", empresa_atual: "Silva", cargo_atual: "Assistente", tempo_atual: "1a_2a" });
    const por = Object.fromEntries(r.map((x) => [x.chave, x]));
    expect(por.momento.resposta).toBe("Trabalho e estudo");
    expect(por.tempo_atual).toMatchObject({ resposta: "1 a 2 anos", etapa: "momento_trabalho" });
    expect(por.como_conheceu.pergunta).not.toContain("*");
    for (const k of ["nome", "email", "telefone", "cidade", "curriculo"]) expect(por[k]).toBeUndefined();
  });

  it("a triagem resume formação e experiência a partir do detalhe do momento", () => {
    const p = perfilDoCandidato(FORMULARIO_PADRAO, {
      ...base, momento: "trabalho_estudo", curso: "Administração", instituicao: "Uninove",
      cargo_atual: "Assistente administrativo", empresa_atual: "Silva", tempo_atual: "1a_2a",
    }, { vaga: "Assistente Administrativo", temCurriculo: true });
    expect(p.formacao).toBe("Administração · Uninove");
    expect(p.experiencia).toBe("Assistente administrativo · Silva · 1 a 2 anos");
    for (const t of ["Trabalha e estuda", "Com experiência", "Experiência na área", "Currículo enviado"]) expect(p.tags).toContain(t);
  });

  it("no fluxo antigo por ocupação (etapas ligadas), quem procura emprego sem experiência vira 'Primeiro emprego'", () => {
    const semExp = perfilDoCandidato(cfg, { ...base, ocupacao: "procurando", escolaridade: "medio", ja_trabalhou: "nao" });
    expect(semExp.tags).toContain("Sem experiência");
    expect(semExp.experiencia).toBe("Primeiro emprego");
  });

  it("a etiqueta configurada na opção vira etiqueta do candidato", () => {
    const daVaga = normalizarPerguntasDaVaga([{ id: "v_excel", titulo: "Excel?", tipo: "simnao", obrigatoria: true, opcoes: [{ valor: "sim", label: "Sim", tag: "Excel" }] }]);
    const p = perfilDoCandidato(cfg, { ...base, ocupacao: "estudo", v_excel: "sim" }, { daVaga });
    expect(p.tags).toContain("Excel");
  });

  it("normalizar não deixa a config apagar nome, contato nem currículo — e é idempotente", () => {
    const quebrada = normalizarFormulario({ perguntas: [{ id: "idade", titulo: "Idade", tipo: "numero" }], etapas: [{ id: "x", rotulo: "X", perguntas: ["idade"] }] });
    for (const id of PERGUNTAS_FIXAS) expect(quebrada.perguntas.some((p) => p.id === id)).toBe(true);
    expect(quebrada.etapas.at(-1)?.id).toBe("curriculo");
    expect(quebrada.etapas.filter((e) => e.recebe_vaga)).toHaveLength(1);
    expect(normalizarFormulario(quebrada)).toEqual(quebrada);
    expect(normalizarFormulario(FORMULARIO_PADRAO)).toEqual(FORMULARIO_PADRAO);
    expect(normalizarFormulario(null)).toEqual(FORMULARIO_PADRAO);
  });

  it("pergunta do sistema não troca de tipo nem desliga", () => {
    const c = normalizarFormulario({ ...FORMULARIO_PADRAO, perguntas: FORMULARIO_PADRAO.perguntas.map((p) => (p.id === "email" ? { ...p, tipo: "texto", ativa: false, obrigatoria: false } : p)) });
    const email = c.perguntas.find((p) => p.id === "email")!;
    expect(email).toMatchObject({ tipo: "email", ativa: true, obrigatoria: true });
  });

  it("todo ícone de opção existe no mapa Tabler", () => {
    const faltando = cfg.perguntas.flatMap((p) => [p.icone, ...(p.opcoes ?? []).map((o) => o.icone)]).filter((n): n is string => !!n && !ICONS[n]);
    expect(faltando).toEqual([]);
  });

  it("todo personagem tem o arquivo em public/", () => {
    for (const p of POSES) expect(existsSync(`${RAIZ}/public/curriculo/personagens/${p.id}.webp`)).toBe(true);
  });

  it("o título separa o miolo roxo e troca {nome}", () => {
    expect(partesDoTitulo("Candidatura enviada, *{nome}!*", { nome: "Douglas" }))
      .toEqual([{ texto: "Candidatura enviada, ", destaque: false }, { texto: "Douglas!", destaque: true }]);
  });
});

describe("tokens", () => {
  it("carimbo de início vale 6 h e não aceita forjado", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= "teste";
    const { emitirInicio, inicioValido } = await import("../rh/curriculos/token");
    const t = emitirInicio(1_000_000);
    expect(inicioValido(t, 1_000_000 + 60_000)).toBe(true);
    expect(inicioValido(t, 1_000_000 + 7 * 60 * 60 * 1000)).toBe(false);
    expect(inicioValido(t + "x", 1_000_000)).toBe(false);
    expect(inicioValido("1000000.abc.def", 1_000_000)).toBe(false);
    expect(inicioValido(null)).toBe(false);
  });

  it("token do webhook: só o hash é guardado e a comparação é pelo hash", async () => {
    const { gerarTokenWebhook, tokenConfere } = await import("../rh/curriculos/token");
    const { token, hash, dica } = gerarTokenWebhook();
    expect(token.startsWith("rhc_")).toBe(true);
    expect(hash).not.toContain(token);
    expect(dica).toBe(token.slice(-4));
    expect(tokenConfere(token, hash)).toBe(true);
    expect(tokenConfere(token + "a", hash)).toBe(false);
    expect(tokenConfere(null, hash)).toBe(false);
  });
});

describe("privacidade", () => {
  const dados = readFileSync(`${RAIZ}/lib/rh/curriculos/dados.ts`, "utf8");

  it("a LISTA nunca seleciona respostas, dados nem observação", () => {
    for (const nome of ["COLUNAS_RESUMO", "COLUNAS_V2"]) {
      const m = dados.match(new RegExp(`const ${nome} = "([^"]+)"`));
      expect(m).toBeTruthy();
      for (const col of ["respostas", "dados", "origem_detalhe", "perfil"]) expect(m![1].split(",")).not.toContain(col);
    }
  });

  it("o resumo da triagem (perfil) só entra no SELECT de quem tem a gaveta das respostas", () => {
    expect(dados).toMatch(/opts\.comPerfil \? \["perfil"\]/);
    expect(dados).toMatch(/poderes\.curriculosRespostas \? \["perfil"\]/);
  });

  it("o arquivo do candidato abre pra chave do RH, e o navegador não cria nessa área", () => {
    expect(LEITURA_POR_AREA.curriculos).toContain("rh:curriculos_arquivo");
    expect(AREAS_DO_NAVEGADOR.curriculos).toBeUndefined();
  });

  it("o histórico da observação não carrega o texto", () => {
    const rota = readFileSync(`${RAIZ}/app/api/rh/curriculos/[id]/observacoes/route.ts`, "utf8");
    const bloco = rota.match(/anotarHistorico\(\{[\s\S]*?\}\)/)?.[0] ?? "";
    expect(bloco).not.toMatch(/detalhe:\s*texto/);
  });
});

describe("gabarito: a resposta certa pontua e nunca vai pro candidato", () => {
  const base: Respostas = {
    nome: "Ana", telefone: "(14) 99999-8888", email: "a@e.com", momento: "faculdade", area: "comercial", aprender: "x", historia: "x",
    social: "espero", persistencia: "desisto", simplificacao: "x", priorizacao: "x",
    motivo: "x", orgulho: "x", como_conheceu: "google", curriculo: "curriculos/2026/09/abc.pdf",
  };

  it("o padrão marca as respostas certas dos prints do dono", () => {
    const certa = (id: string) => FORMULARIO_PADRAO.perguntas.find((p) => p.id === id)!.opcoes!.filter((o) => o.certa).map((o) => o.valor);
    expect(certa("tarefa")).toEqual(["pesquiso"]);
    expect(certa("iniciativa")).toEqual(["entendo"]);
    expect(certa("persistencia")).toEqual(["entendo"]);
    expect(certa("social")).toEqual(["aproximo"]);
  });

  it("conta acertos só nas perguntas com gabarito", () => {
    expect(perfilDoCandidato(FORMULARIO_PADRAO, { ...base, tarefa: "pesquiso", iniciativa: "entendo", social: "aproximo", persistencia: "entendo" })).toMatchObject({ acertos: 4, pontuaveis: 4 });
    expect(perfilDoCandidato(FORMULARIO_PADRAO, { ...base, tarefa: "espero", iniciativa: "entendo" })).toMatchObject({ acertos: 1, pontuaveis: 4 });
  });

  it("semGabarito tira o `certa` de tudo — é a config que vai pro navegador", () => {
    expect(JSON.stringify(semGabarito(FORMULARIO_PADRAO))).not.toContain("\"certa\"");
    expect(JSON.stringify(FORMULARIO_PADRAO)).toContain("\"certa\"");
  });

  it("a página e a rota pública só entregam a config via dadosDaCandidatura (sem gabarito)", () => {
    const pag = readFileSync(`${RAIZ}/app/curriculo/page.tsx`, "utf8");
    expect(pag).toMatch(/dadosDaCandidatura\(/);
    expect(pag).not.toMatch(/lerFormulario/);
    const pub = readFileSync(`${RAIZ}/lib/rh/curriculos/publico.ts`, "utf8");
    expect((pub.match(/config: semGabarito\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("normalizar preserva o gabarito (o RH salva e ele fica)", () => {
    expect(JSON.stringify(normalizarFormulario(FORMULARIO_PADRAO))).toContain('"certa":true');
  });
});
