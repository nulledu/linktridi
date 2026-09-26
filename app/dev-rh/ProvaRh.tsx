"use client";

// As telas do RH com dados falsos, para medir layout sem login.
//
// Monta as peças REAIS (`RhShell`, `ColaboradoresRhClient`, `CorpoDaFicha`) — um
// clone simplificado aqui mediria um layout que não existe, que é o jeito mais
// eficiente de um banco de provas ficar verde enquanto a tela de verdade
// quebra.

import { useEffect, useState } from "react";
import { PainelLateral } from "../(plataforma)/ui/controles";
import { Avatar } from "../(plataforma)/ui/Avatar";
import { Selo } from "../(plataforma)/financeiro/ui";
import { SELO_SITUACAO } from "@/lib/rh/tipos";
import type { PoderesRh } from "@/lib/rh/gate";
import type {
  AtestadoRh, ColaboradorRh, DocumentoRh, FeriasRh, FichaPayload, FichaRh, HistoricoRh,
} from "@/lib/rh/tipos";
import { resumoDoRh } from "@/lib/rh/tipos";
import { RhShell } from "../(plataforma)/rh/RhShell";
import { ColaboradoresRhClient } from "../(plataforma)/rh/colaboradores/ColaboradoresRhClient";
import { CorpoDaFicha } from "../(plataforma)/rh/colaboradores/ficha/CorpoDaFicha";
import { FormularioCompensacao } from "../(plataforma)/ui/compensacao";
import { CalendarioClient } from "../(plataforma)/rh/calendario/CalendarioClient";
import { montarAno } from "@/lib/rh/calendario/montar";
import { feriadosBase } from "@/lib/rh/calendario/feriados-base";
import { fundirFeriadosDoPonto } from "@/lib/jornada/feriados-regra";
import type { Afastamento, Compensacao } from "@/lib/jornada/tipos";
import type { EventoRh } from "@/lib/rh/calendario/tipos";
import { CurriculosClient } from "../(plataforma)/rh/curriculos/CurriculosClient";
import { CandidatoClient } from "../(plataforma)/rh/curriculos/[id]/CandidatoClient";
import { IntegracaoClient } from "../(plataforma)/rh/curriculos/integracao/IntegracaoClient";
import { ConfiguracoesClient } from "../(plataforma)/rh/curriculos/configuracoes/ConfiguracoesClient";
import { FORMULARIO_PADRAO } from "@/lib/rh/curriculos/formulario";
import { ETAPAS_PADRAO } from "@/lib/rh/curriculos/etapas";
import { type CandidatoDetalhe, type CandidatoResumo, type ConfigIntegracao, type VagaRh } from "@/lib/rh/curriculos/tipos";

const HOJE = "2026-09-16";

/** Tudo ligado: o banco de provas mede o layout CHEIO, que é o pior caso. */
const PODERES: PoderesRh = {
  ver: true, editar: true, documentos: true, documentosEditar: true,
  atestados: true, atestadosEditar: true, ponto: true, bancoHoras: true, compensacoesEditar: true,
  ferias: true, feriasEditar: true, anamnese: true, anamneseEditar: true,
  curriculos: true, curriculosRespostas: true, curriculosArquivo: true, curriculosStatus: true, curriculosEditar: true, curriculosIntegracao: true,
  calendario: true, calendarioEditar: true, calendarioSetores: true, calendarioFeriados: true, acessos: true,
};

// Nomes longos de propósito: é o que estoura a coluna a 320px.
const EQUIPE: ColaboradorRh[] = [
  { id: "1", nome: "Maria Aparecida de Souza Nascimento", username: "maria", ativo: true, pendente: false, foto: null,
    cargo: "Encarregada de Produção", setor: "Produção", departamento: "Operacional",
    telefone: "(14) 99999-0001", admissao: "2021-03-15", situacao: "ativo" },
  { id: "2", nome: "João Pedro", username: "joao", ativo: true, pendente: true, foto: null,
    cargo: "Auxiliar", setor: "Estoque", departamento: "Operacional",
    telefone: "(14) 99999-0002", admissao: "2026-08-01", situacao: "ativo" },
  { id: "3", nome: "Ana Beatriz Rodrigues", username: "ana", ativo: true, pendente: false, foto: null,
    cargo: "Analista de Marketing", setor: "Marketing", departamento: "Comercial",
    telefone: null, admissao: "2024-11-20", situacao: "ferias" },
  { id: "4", nome: "Carlos Eduardo", username: "carlos", ativo: true, pendente: false, foto: null,
    cargo: "Motorista", setor: "Logística", departamento: "Operacional",
    telefone: "(14) 99999-0004", admissao: "2023-01-09", situacao: "afastado" },
  { id: "5", nome: "Fernanda Lima", username: "fernanda", ativo: false, pendente: false, foto: null,
    cargo: "Vendedora", setor: "Vendas", departamento: "Comercial",
    telefone: null, admissao: "2022-06-30", situacao: "desligado" },
  // Ficha vazia de propósito: é a maioria da equipe de verdade, e é o cartão
  // que desalinhava a grade — sem setor, a fileira da etiqueta sumia e tudo
  // que vem depois subia uma linha em relação a quem tem setor.
  { id: "6", nome: "Letícia Alves", username: "leticia", ativo: true, pendente: false, foto: null,
    cargo: null, setor: null, departamento: null,
    telefone: null, admissao: null, situacao: "ativo" },
];

const FICHA: FichaRh = {
  employee_id: "1", situacao: "ativo", data_nascimento: "1990-04-12",
  cpf: "123.456.789-00", rg: "12.345.678-9", estado_civil: "Casada",
  email_pessoal: "maria.aparecida.nascimento@exemplo.com.br",
  telefone_emergencia: "(14) 98888-7777", contato_emergencia: "José Nascimento (marido)",
  cep: "18760-000", logradouro: "Rua Comendador Antônio Cardoso de Almeida",
  numero: "1024", complemento: "Fundos", bairro: "Centro",
  cidade: "Cerqueira César", uf: "SP",
  observacoes: "Disponível para hora extra no fechamento do mês.",
};

const DOCUMENTOS: DocumentoRh[] = [
  { id: "d1", employee_id: "1", tipo: "contrato", titulo: "Contrato de trabalho por prazo indeterminado",
    arquivo: null, emitido_em: "2021-03-15", validade: null, observacao: null,
    created_at: "2021-03-15T12:00:00Z", autor_nome: "RH" },
  { id: "d2", employee_id: "1", tipo: "exame_periodico", titulo: "ASO periódico",
    arquivo: null, emitido_em: "2026-03-10", validade: "2027-03-10",
    observacao: "Apto sem restrições.", created_at: "2026-03-10T12:00:00Z", autor_nome: "RH" },
];

const ATESTADOS: AtestadoRh[] = [
  { id: "a1", employee_id: "1", de: "2026-08-03", ate: "2026-08-04", dias: 2,
    emitido_em: "2026-08-03", cid: null, profissional: "Clínica São Lucas",
    status: "aceito", arquivo: null, observacao: null,
    created_at: "2026-08-03T12:00:00Z", autor_nome: "RH" },
  { id: "a2", employee_id: "1", de: "2026-09-14", ate: "2026-09-14", dias: 1,
    emitido_em: "2026-09-14", cid: null, profissional: null,
    status: "pendente", arquivo: null, observacao: "Aguardando o documento original.",
    created_at: "2026-09-14T12:00:00Z", autor_nome: "RH" },
];

const FERIAS: FeriasRh[] = [
  { id: "f1", employee_id: "1", aquisitivo_de: "2024-03-15", aquisitivo_ate: "2025-03-14",
    de: "2025-07-01", ate: "2025-07-30", dias: 30, status: "concluida",
    observacao: null, created_at: "2025-05-02T12:00:00Z", autor_nome: "RH" },
  { id: "f2", employee_id: "1", aquisitivo_de: "2025-03-15", aquisitivo_ate: "2026-03-14",
    de: "2026-12-01", ate: "2026-12-20", dias: 20, status: "programada",
    observacao: "Fecha junto com a parada de fim de ano.", created_at: "2026-09-01T12:00:00Z", autor_nome: "RH" },
];

const HISTORICO: HistoricoRh[] = [
  { id: "h1", employee_id: "1", tipo: "situacao", titulo: "Situação alterada",
    detalhe: "ferias → ativo", autor_nome: "RH", created_at: "2026-09-10T12:00:00Z" },
  { id: "h2", employee_id: "1", tipo: "cargo", titulo: "Cargo alterado",
    detalhe: "Auxiliar de Produção → Encarregada de Produção",
    autor_nome: "RH", created_at: "2024-02-01T12:00:00Z" },
  { id: "h3", employee_id: "1", tipo: "admissao", titulo: "Admissão",
    detalhe: null, autor_nome: null, created_at: "2021-03-15T12:00:00Z" },
];

/**
 * O que o `GET /api/rh/colaboradores/[id]` devolveria.
 *
 * `linha` fica `null` de propósito: as abas Acesso e Desempenho vêm da tela de
 * Pessoas e dependem de dados de sessão (papel, grade salva, métricas do ERP)
 * que não existem sem login. Elas somem aqui, e o banco de provas continua
 * medindo o que ele consegue medir de verdade — o resto da ficha.
 */
const PAYLOAD: FichaPayload = {
  colaborador: EQUIPE[0],
  ficha: FICHA,
  documentos: DOCUMENTOS,
  atestados: ATESTADOS,
  ferias: FERIAS,
  historico: HISTORICO,
  anamnese: {
    employee_id: "1",
    dados: {
      tipo_sanguineo: "O+",
      alergias: "Dipirona e frutos do mar.",
      condicoes: "Hipertensão controlada com medicação.",
      fumante: "Não",
      atividade_fisica: "sim",
      restricoes: "Evitar levantamento de peso acima de 15 kg.",
    },
    atualizado_em: "2026-06-02T12:00:00Z",
    atualizado_por_nome: "RH",
  },
  linha: null,
  empresasFinanceiro: [],
  empresasMarcadas: [],
  areasQueConcedo: [],
  souAdmin: false,
  souEu: false,
  schemaPendente: false,
};

/** O ano do calendário, montado com a mesma função da tela real. */
const EVENTOS_CAL: EventoRh[] = [
  { id: "e1", tipo: "setor", categoria: null, nome: "Dia da Produção", descricao: "Café da manhã com a equipe.", observacoes: null,
    dia: "2025-09-25", hora: null, hora_fim: null, setor: "Produção", colaboradores: [], recorrencia: "anual", ativo: true, autor_nome: "RH", created_at: "" },
  { id: "e2", tipo: "evento", categoria: "treinamento", nome: "Treinamento de Segurança do Trabalho", descricao: "Treinamento obrigatório para colaboradores da produção.", observacoes: null,
    dia: "2026-09-25", hora: "14:00", hora_fim: "16:00", setor: "Produção", colaboradores: ["1", "2"], recorrencia: "nenhuma", ativo: true, autor_nome: "RH", created_at: "" },
  { id: "e3", tipo: "evento", categoria: "reuniao", nome: "Reunião geral", descricao: null, observacoes: null,
    dia: "2026-09-16", hora: "09:00", hora_fim: null, setor: null, colaboradores: [], recorrencia: "nenhuma", ativo: true, autor_nome: "RH", created_at: "" },
  { id: "e4", tipo: "evento", categoria: "integracao", nome: "Integração de novos colaboradores", descricao: null, observacoes: null,
    dia: "2026-09-16", hora: "15:30", hora_fim: null, setor: "Recursos Humanos", colaboradores: ["2"], recorrencia: "nenhuma", ativo: true, autor_nome: "RH", created_at: "" },
  { id: "e5", tipo: "comemorativa", categoria: null, nome: "Aniversário da Tridi", descricao: null, observacoes: null,
    dia: "2020-10-03", hora: null, hora_fim: null, setor: null, colaboradores: [], recorrencia: "anual", ativo: true, autor_nome: "RH", created_at: "" },
];
const FICHAS_CAL = [
  { employee_id: "1", data_nascimento: "1990-04-12" },
  { employee_id: "2", data_nascimento: "2001-09-16" },
  { employee_id: "3", data_nascimento: "1998-09-18" },
  { employee_id: "4", data_nascimento: "1985-02-29" },
  { employee_id: "5", data_nascimento: "1993-09-20" },
];
// ── As camadas de pessoa do calendário ──────────────────────────────────────
// Férias em cima de um feriado (o 07/09 cai dentro) e um par de compensação
// completo: são justamente os casos em que a tela precisa escolher o que
// mostrar, e sem eles o banco de provas mediria só o caso fácil.
const AFASTAMENTOS_CAL = new Map<string, Afastamento[]>([
  ["2", [{ tipo: "ferias", de: "2026-09-01", ate: "2026-09-15", id: "fer-1", situacao: "Em gozo" }]],
  ["4", [{ tipo: "ferias", de: "2026-12-20", ate: "2027-01-05", id: "fer-2", situacao: "Programada" }]],
]);
const COMPENSACOES_CAL = new Map<string, Compensacao[]>([
  ["1", [{
    id: "comp-1", employeeId: "1", tipo: "feriado_trocado",
    diaOrigem: "2026-09-07", diaFolga: "2026-09-08", minutos: 480, status: "aprovada",
    observacao: null, autorNome: "Fulana de Tal", aprovadorNome: "Fulana de Tal",
    aprovadoEm: "2026-09-07T18:00:00Z", createdAt: "2026-09-07T18:00:00Z",
  }]],
  ["3", [{
    id: "comp-2", employeeId: "3", tipo: "folga_compensatoria",
    diaOrigem: "2026-09-12", diaFolga: "2026-09-21", minutos: 240, status: "pendente",
    observacao: "Sábado esticado.", autorNome: "Fulana de Tal", aprovadorNome: null,
    aprovadoEm: null, createdAt: "2026-09-12T18:00:00Z",
  }]],
]);
const ANO_CAL = montarAno({
  ano: 2026, colaboradores: EQUIPE, fichas: FICHAS_CAL, eventos: EVENTOS_CAL,
  feriados: feriadosBase(2026), verInativos: true,
  afastamentos: AFASTAMENTOS_CAL, compensacoes: COMPENSACOES_CAL,
});
// O estado real da janela de revisão: nacional entra sozinho, facultativo e
// estadual/municipal nascem pendentes. Uma decisão gravada pra provar os três
// selos ao mesmo tempo.
const FERIADOS_NO_PONTO = fundirFeriadosDoPonto(
  feriadosBase(2026),
  [{ dia: "2026-07-09", vale: true, tipo: "troca", decididoPor: "Fulana de Tal", decididoEm: "2026-06-01T12:00:00Z" }],
  [],
);

// ── Currículos ───────────────────────────────────────────────────────────────
const VAGAS_CV: VagaRh[] = [
  { id: "11111111-1111-4111-8111-111111111111", titulo: "Assistente Administrativo", setor: "Administrativo", descricao: null, status: "aberta", created_at: "", candidatos: 2 },
  { id: "22222222-2222-4222-8222-222222222222", titulo: "Auxiliar de Produção", setor: "Produção", descricao: null, status: "aberta", created_at: "", candidatos: 1 },
];
const CANDIDATOS: CandidatoResumo[] = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nome: "Maria Oliveira dos Santos Nascimento", email: "maria.oliveira.nascimento@email.com", telefone: "14999990001", cidade: "Cerqueira César, SP",
    vaga_id: VAGAS_CV[0].id, vaga: VAGAS_CV[0].titulo, status: "novo", origem: "tridiflow", recebido_em: "2026-09-16T14:32:00Z", visto_em: null, tem_curriculo: true,
    tags: ["Excel", "Retornar"], etapa_em: "2026-09-16T14:32:00Z", updated_at: "2026-09-16T15:10:00Z", curriculo_url: "/api/arquivos/curriculos/2026/09/x.pdf", curriculo_nome: "curriculo-maria.pdf",
    entrevista_em: null, perfil: { escolaridade: "Superior", ocupacao: "Trabalho e estudo", formacao: "Administração — 4º período · Uninove (EAD)", experiencia: "Assistente administrativo · Contabilidade Silva · 1 a 2 anos", disponibilidade: "Manhã, Tarde · Período integral · Imediatamente", tags: ["Trabalha e estuda", "Ensino superior", "Com experiência", "Experiência na área", "Disponível imediatamente", "Currículo enviado"] } },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nome: "Douglas Ferreira", email: "douglas@email.com", telefone: "14999990002", cidade: "Avaré, SP",
    vaga_id: VAGAS_CV[1].id, vaga: VAGAS_CV[1].titulo, status: "em_analise", origem: "tridiflow", recebido_em: "2026-09-15T10:05:00Z", visto_em: "2026-09-15T15:10:00Z", tem_curriculo: true,
    tags: [], etapa_em: "2026-09-01T10:05:00Z", updated_at: "2026-09-01T10:05:00Z", curriculo_url: "/api/arquivos/curriculos/2026/09/y.pdf", curriculo_nome: "douglas.pdf",
    entrevista_em: null, perfil: { escolaridade: "Ensino médio completo", ocupacao: "Estou procurando emprego", formacao: "Ensino médio completo", experiencia: "Primeiro emprego", disponibilidade: "Noite · Meio período · Em até 15 dias", tags: ["Procurando emprego", "Sem experiência", "Currículo enviado"] } },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", nome: "Ana Júlia", email: null, telefone: "14999990003", cidade: null,
    vaga_id: null, vaga: null, status: "entrevista", origem: "tridiflow", recebido_em: "2026-09-10T09:20:00Z", visto_em: "2026-09-10T09:30:00Z", tem_curriculo: false,
    tags: [], etapa_em: "2026-09-15T09:30:00Z", updated_at: "2026-09-15T09:30:00Z", curriculo_url: null, curriculo_nome: null,
    entrevista_em: "2026-09-22T17:30:00Z", perfil: { escolaridade: "Técnico", ocupacao: "Estou estudando", formacao: "Técnico em Informática · Etec (Presencial)", experiencia: null, disponibilidade: "Tarde · Estágio · Imediatamente", tags: ["Estudando", "Disponível imediatamente"] } },
  { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", nome: "Carlos Henrique", email: "carlos@email.com", telefone: null, cidade: "Cerqueira César, SP",
    vaga_id: VAGAS_CV[0].id, vaga: VAGAS_CV[0].titulo, status: "arquivado", origem: "tridiflow", recebido_em: "2026-08-30T18:00:00Z", visto_em: "2026-08-31T08:00:00Z", tem_curriculo: true,
    tags: [], etapa_em: "2026-08-31T08:00:00Z", updated_at: null, curriculo_url: null, curriculo_nome: null,
    entrevista_em: null, perfil: null },
  { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", nome: "Patrícia Gomes", email: "pati@email.com", telefone: "14999990005", cidade: "Avaré, SP",
    vaga_id: VAGAS_CV[1].id, vaga: VAGAS_CV[1].titulo, status: "contratado", origem: "tridiflow", recebido_em: "2026-08-20T11:00:00Z", visto_em: "2026-08-20T12:00:00Z", tem_curriculo: true,
    tags: [], etapa_em: "2026-09-10T12:00:00Z", updated_at: null, curriculo_url: null, curriculo_nome: null, entrevista_em: null,
    perfil: { ocupacao: "Trabalho atualmente", formacao: "Ensino médio completo", escolaridade: "Ensino médio completo", experiencia: "Operador de máquina · Metal X · 2 a 5 anos", disponibilidade: null, tags: ["Trabalhando", "Com experiência", "Experiência na área"] } },
  { id: "ffffffff-ffff-4fff-8fff-ffffffffffff", nome: "Rafael Souza", email: "rafa@email.com", telefone: "14999990006", cidade: "Cerqueira César, SP",
    vaga_id: VAGAS_CV[0].id, vaga: VAGAS_CV[0].titulo, status: "novo", origem: "tridiflow", recebido_em: "2026-09-18T09:10:00Z", visto_em: null, tem_curriculo: true,
    tags: [], etapa_em: "2026-09-18T09:10:00Z", updated_at: null, curriculo_url: null, curriculo_nome: null, entrevista_em: null,
    perfil: { ocupacao: "Estou estudando", formacao: "Administração — 2º período · Unip (EAD)", escolaridade: "Superior", experiencia: "Primeiro emprego", disponibilidade: null, tags: ["Estudando", "Sem experiência", "Disponível imediatamente"] } },
];
const INTEGRACAO: ConfigIntegracao = {
  formulario_ativo: true, webhook_configurado: true, webhook_token_dica: "k9Qz", webhook_gerado_em: "2026-09-01T12:00:00Z",
  vaga_padrao_id: VAGAS_CV[0].id, ultima_recepcao_em: "2026-09-16T14:32:00Z", ultima_recepcao_fonte: "formulário de candidatura",
  ultimo_erro: null, ultimo_erro_em: null,
};
const CANDIDATO: CandidatoDetalhe = {
  ...CANDIDATOS[0],
  origem_detalhe: { fonte: "formulario" }, dados: { area_interesse: "producao" }, arquivado_em: null,
  respostas: [
    { chave: "ocupacao", pergunta: "O que você faz atualmente?", resposta: "Trabalho e estudo", etapa: "conhecer" },
    { chave: "idade", pergunta: "Idade", resposta: "21", etapa: "conhecer" },
    { chave: "curso", pergunta: "O que você está estudando?", resposta: "Administração", etapa: "formacao" },
    { chave: "instituicao", pergunta: "Onde você estuda?", resposta: "Uninove", etapa: "formacao" },
    { chave: "nivel", pergunta: "Qual o nível do curso?", resposta: "Superior", etapa: "formacao" },
    { chave: "periodo", pergunta: "Em que período ou ano você está?", resposta: "4º período", etapa: "formacao" },
    { chave: "modalidade", pergunta: "Modalidade", resposta: "EAD", etapa: "formacao" },
    { chave: "cargo_atual", pergunta: "Com o que você trabalha atualmente?", resposta: "Assistente administrativo", etapa: "experiencia" },
    { chave: "empresa_atual", pergunta: "Onde você trabalha?", resposta: "Contabilidade Silva", etapa: "experiencia" },
    { chave: "tempo_atual", pergunta: "Há quanto tempo?", resposta: "1 a 2 anos", etapa: "experiencia" },
    { chave: "horario", pergunta: "Em quais horários você pode trabalhar?", resposta: "Manhã, Tarde", etapa: "disponibilidade" },
    { chave: "jornada", pergunta: "Que jornada você procura?", resposta: "Período integral", etapa: "disponibilidade" },
    { chave: "inicio", pergunta: "Quando você pode começar?", resposta: "Imediatamente", etapa: "disponibilidade" },
    { chave: "v_excel", pergunta: "Você possui experiência com Excel?", resposta: "Sim", etapa: "vaga" },
    { chave: "aprender", pergunta: "Tem alguma coisa que você gostaria muito de aprender ou melhorar em você?", resposta: "Quero melhorar minha comunicação e aprender mais sobre tecnologia e automação." },
    { chave: "orgulho", pergunta: "Conte algo que você criou, melhorou ou resolveu e que te dá orgulho.", resposta: "Na minha última experiência, identifiquei que o processo de organização de arquivos era manual e tomava muito tempo da equipe. Criei uma estrutura de pastas e um modelo padrão, o que reduziu o tempo de busca de informações em cerca de 50%." },
    { chave: "conhece_alguem", pergunta: "Conhece alguém da Tridi?", resposta: "Sim — Ana Beatriz" },
  ],
  curriculo: { chave: "curriculos/2026/09/x.pdf", url: "/api/arquivos/curriculos/2026/09/x.pdf", nome: "curriculo-maria-oliveira-2026.pdf", tipo: "application/pdf", tamanho: 412_000, enviado_em: "2026-09-16T14:31:00Z" },
  observacoes: [{ id: "o1", texto: "Candidata possui experiência relevante na área de produção.", autor_nome: "Fulana de Tal", created_at: "2026-09-16T15:10:00Z" }],
  historico: [
    { id: "h2", tipo: "observacao", titulo: "Observação adicionada.", detalhe: null, autor_nome: "Fulana de Tal", created_at: "2026-09-16T15:10:00Z" },
    { id: "h1", tipo: "recebido", titulo: "Candidatura recebida pelo formulário de candidatura.", detalhe: null, autor_nome: null, created_at: "2026-09-16T14:32:00Z" },
  ],
};

type Tela = "lista" | "ficha" | "calendario" | "curriculos" | "candidato" | "integracao" | "cv-config" | "compensacao";
const TELAS: [Tela, string][] = [["lista", "Lista"], ["ficha", "Ficha"], ["calendario", "Calendário"], ["curriculos", "Currículos"], ["candidato", "Candidato"], ["integracao", "Integração"], ["cv-config", "Config. currículos"], ["compensacao", "Compensação"]];

export function ProvaRh() {
  const [tela, setTela] = useState<Tela>("lista");
  // `?tela=calendario` abre direto no calendário — lido DEPOIS de hidratar, ou
  // o servidor renderiza a lista e o cliente o calendário e o React reclama.
  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("tela");
      if (t && TELAS.some(([k]) => k === t)) setTela(t as Tela);
    } catch { /* sem URL */ }
  }, []);

  return (
    <RhShell name="Fulana de Tal" role="admin" photoUrl={null} poderes={PODERES} curriculosNovos={1}>
      {/* O alternador é do banco de provas, não do módulo: sem login não há
          rota, então trocar de tela aqui é estado local. */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {TELAS.map(([t, rotulo]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTela(t)}
            style={{
              minHeight: "var(--tap)", padding: "0 16px", borderRadius: "var(--r-pill)",
              cursor: "pointer", fontSize: 13, fontWeight: 700,
              border: "1px solid var(--border)",
              background: tela === t ? "var(--surface-2)" : "transparent",
              color: "var(--text)",
            }}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {tela === "curriculos" ? (
        <CurriculosClient lista={CANDIDATOS} vagas={VAGAS_CV} etapas={ETAPAS_PADRAO} saturou={false} hoje={HOJE} poderes={PODERES} integracao={INTEGRACAO} schemaPendente={false} />
      ) : tela === "candidato" ? (
        <CandidatoClient inicial={CANDIDATO} vagas={VAGAS_CV} poderes={PODERES} etapas={ETAPAS_PADRAO} />
      ) : tela === "compensacao" ? (
        // O formulário sozinho, aberto. É pop-up: sem uma tela atrás, a prova
        // media o painel no vazio — e no celular ele é folha presa embaixo,
        // que é exatamente o que precisa caber em 320px.
        <FormularioCompensacao
          employeeId="1" nome="Ana Beatriz Rodrigues"
          diaOrigem="2026-09-07" diaFolga="2026-09-08"
          onFechar={() => setTela("ficha")}
        />
      ) : tela === "integracao" ? (
        <IntegracaoClient inicial={INTEGRACAO} vagas={VAGAS_CV} base="https://gaius.tridi.com.br" poderes={PODERES} schemaPendente={false} />
      ) : tela === "cv-config" ? (
        <ConfiguracoesClient inicial={FORMULARIO_PADRAO} personalizado={false} schemaPendente={false} etapasProcesso={ETAPAS_PADRAO}
          vagas={VAGAS_CV.map((v, i) => (i === 0 ? { ...v, perguntas: [{ id: "v_excel", titulo: "Você possui experiência com *Excel?*", tipo: "simnao" as const, obrigatoria: true, ativa: true, opcoes: [{ valor: "sim", label: "Sim", tag: "Excel" }, { valor: "nao", label: "Não" }] }] } : v))} />
      ) : tela === "calendario" ? (
        <CalendarioClient
          ano={2026} hoje={HOJE} acontecimentos={ANO_CAL} colaboradores={EQUIPE}
          setores={["Produção", "Estoque", "Marketing", "Logística", "Vendas"]}
          sync={{ ano: 2026, fonte: "brasilapi", atualizado_em: "2026-09-01T12:00:00Z", ok: true, erro: null }}
          poderes={PODERES} schemaPendente={false}
          feriadosNoPonto={FERIADOS_NO_PONTO.lista}
          feriadosPendentes={FERIADOS_NO_PONTO.pendentes}
        />
      ) : tela === "lista" ? (
        <ColaboradoresRhClient
          lista={EQUIPE}
          resumo={resumoDoRh(EQUIPE, HOJE)}
          hoje={HOJE}
          poderes={PODERES}
          schemaPendente={false}
        />
      ) : (
        // A ficha DENTRO do painel, como ela aparece de verdade: o que precisa
        // ser medido é a composição (painel de 980px que vira tela inteira no
        // celular + o corpo), não o corpo solto. O `PainelDoColaborador` não
        // serve aqui porque ele busca a ficha na API, que exige sessão.
        <PainelLateral
          centrado
          largura={1180}
          onFechar={() => setTela("lista")}
          titulo={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 11, minWidth: 0, maxWidth: "100%" }}>
              <Avatar url={EQUIPE[0].foto} nome={EQUIPE[0].nome} size={34} />
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>{EQUIPE[0].nome}</span>
            </span>
          }
          subtitulo={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Selo selo={SELO_SITUACAO[FICHA.situacao]} />
              <span>{[EQUIPE[0].cargo, EQUIPE[0].setor].filter(Boolean).join(" · ")}</span>
            </span>
          }
        >
          <div style={{ minHeight: "min(70dvh, 720px)", display: "flex", flexDirection: "column", minWidth: 0 }}>
            <CorpoDaFicha dados={PAYLOAD} hoje={HOJE} poderes={PODERES} aoMudar={() => {}} />
          </div>
        </PainelLateral>
      )}
    </RhShell>
  );
}
