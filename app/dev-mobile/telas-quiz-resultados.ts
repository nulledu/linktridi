// TEMPORÁRIO — dados falsos da triagem de candidatos (tela de Resultados do
// quiz, aba "Candidatos"). Serve ao `/dev-mobile?ws=quiz-resultados`, que monta
// o `ResultadosClient` REAL com o template de Candidatura: é a única tela nova
// do quiz que fica atrás de login e, sem isto, nunca entraria no `npm run
// rolagem`.
//
// As respostas guardam o RÓTULO da opção (não a tag): é assim que a rota de
// analytics grava e é o que o `pontuacaoDe` casa (`o.label`) pra dar o score.
// Por isso os textos abaixo batem letra a letra com as opções do template
// `CANDIDATURA` — trocar "Experiente" por "experiente" zera o perfil.
//
// Os nomes e cidades são propositalmente LONGOS: é o card de candidato a 320px
// que esta prova existe pra medir (nome que quebra, chips que embrulham, o
// currículo e o seletor de estágio na largura toda).

interface LeadProva {
  id: string; iniciadaEm: string; concluidaEm: string | null;
  ultimaEtapa: string | null; utm: Record<string, string>; respostas: Record<string, string>;
}

const cv = (n: string) => `/api/arquivos/tridiflow/2026/09/${n}.pdf`;

const LEADS: LeadProva[] = [
  {
    id: "cand-1", iniciadaEm: "2026-09-14T13:02:00Z", concluidaEm: "2026-09-14T13:09:00Z",
    ultimaEtapa: "curriculo", utm: { utm_source: "instagram", utm_campaign: "vagas_setembro" },
    respostas: {
      nome: "Ana Paula Ribeiro do Nascimento", vaga: "Vendas", telefone: "(11) 98123-4567",
      email: "ana.ribeiro@email.com", cidade: "São Bernardo do Campo / SP", idade: "31",
      tem_experiencia: "Sim", tempo_empresa: "Mais de 3 anos", ja_area: "Sim",
      nivel: "Experiente", presencial: "Sim", periodo: "Integral", inicio: "Sim, agora",
      formacao: "Sim", ja_similar: "Sim", estagio_rh: "entrevista", curriculo: cv("ana-paula"),
    },
  },
  {
    id: "cand-2", iniciadaEm: "2026-09-14T10:41:00Z", concluidaEm: "2026-09-14T10:48:00Z",
    ultimaEtapa: "curriculo", utm: { utm_source: "indicacao", utm_campaign: "vagas_setembro" },
    respostas: {
      nome: "Carlos Eduardo Nascimento", vaga: "Atendimento", telefone: "(11) 99711-2233",
      email: "cadu@email.com", cidade: "Guarulhos / SP", idade: "26",
      tem_experiencia: "Sim", tempo_empresa: "6 meses a 1 ano", ja_area: "Não",
      nivel: "Intermediário", presencial: "Sim", periodo: "Manhã", inicio: "Em breve",
      formacao: "Sim", ja_similar: "Sim", estagio_rh: "qualificado", curriculo: cv("carlos-eduardo"),
    },
  },
  {
    id: "cand-3", iniciadaEm: "2026-09-13T19:20:00Z", concluidaEm: "2026-09-13T19:26:00Z",
    ultimaEtapa: "curriculo", utm: { utm_source: "site", utm_campaign: "vagas_setembro" },
    respostas: {
      nome: "Mariana Souza", vaga: "Administrativo", telefone: "(11) 98890-5566",
      email: "mari.souza@email.com", cidade: "São Paulo / SP", idade: "23",
      tem_experiencia: "Sim", tempo_empresa: "Menos de 6 meses", ja_area: "Não",
      nivel: "Intermediário", presencial: "Sim", periodo: "Tarde", inicio: "Em breve",
      formacao: "Não", ja_similar: "Não", estagio_rh: "novo", curriculo: cv("mariana-souza"),
    },
  },
  {
    id: "cand-4", iniciadaEm: "2026-09-13T08:55:00Z", concluidaEm: "2026-09-13T09:04:00Z",
    ultimaEtapa: "curriculo", utm: { utm_source: "instagram", utm_campaign: "vagas_setembro" },
    respostas: {
      nome: "João Vitor de Oliveira Santos Filho", vaga: "Logística", telefone: "(11) 97001-8899",
      email: "joaovitor@email.com", cidade: "Osasco / SP", idade: "19",
      tem_experiencia: "Não", ja_area: "Não",
      nivel: "Iniciante", presencial: "Sim", periodo: "Integral", inicio: "Ainda não",
      formacao: "Não", ja_similar: "Não", estagio_rh: "novo", curriculo: cv("joao-vitor"),
    },
  },
  {
    id: "cand-5", iniciadaEm: "2026-09-12T15:12:00Z", concluidaEm: "2026-09-12T15:19:00Z",
    ultimaEtapa: "curriculo", utm: { utm_source: "indicacao", utm_campaign: "vagas_agosto" },
    respostas: {
      nome: "Beatriz Fernandes Camargo", vaga: "Vendas", telefone: "(11) 98345-1010",
      email: "bia.camargo@email.com", cidade: "Santo André / SP", idade: "34",
      tem_experiencia: "Sim", tempo_empresa: "1 a 3 anos", ja_area: "Sim",
      nivel: "Experiente", presencial: "Sim", periodo: "Integral", inicio: "Sim, agora",
      formacao: "Sim", ja_similar: "Sim", estagio_rh: "aprovado", curriculo: cv("beatriz-fernandes"),
    },
  },
  {
    // Sem currículo de propósito: prova o card sem o botão de CV.
    id: "cand-6", iniciadaEm: "2026-09-11T21:40:00Z", concluidaEm: null,
    ultimaEtapa: "nivel", utm: { utm_source: "outro", utm_campaign: "vagas_agosto" },
    respostas: {
      nome: "Rafael Lima", vaga: "Produção", telefone: "(11) 96677-4321",
      email: "rafael.lima@email.com", cidade: "Diadema / SP", idade: "40",
      tem_experiencia: "Não", nivel: "Sem experiência", presencial: "Não", periodo: "Noite",
      inicio: "Ainda não", formacao: "Não", ja_similar: "Não", estagio_rh: "reprovado",
    },
  },
];

/** Resposta falsa de `/api/tridiflow/analytics` (o que o `ResultadosClient` lê
 *  no primeiro efeito). Só o mínimo pra tela montar: os KPIs, o funil vazio e a
 *  lista de candidatos. */
export const ANALYTICS_CANDIDATOS = {
  nome: "Quiz de Candidatura",
  sessoes: 214,
  concluidas: LEADS.filter((l) => l.concluidaEm).length,
  taxa: 29,
  porEtapa: [] as { etapa: string; titulo: string; abandonos: number }[],
  grupos: [] as { id: string; titulo: string }[],
  leads: LEADS,
};

/** Vendas não existem num funil de candidatura (a aba nem aparece na triagem),
 *  mas o `ResultadosClient` busca a rota mesmo assim — devolver erro é o estado
 *  real e mantém `v = null`. */
export const VENDAS_CANDIDATOS = { error: "sem vendas neste funil" };
