// TEMPORÁRIO — dados falsos da tela "A produção de verdade" (/atividades/historico).
//
// A tela nasce com o primeiro período RENDERIZADO NO SERVIDOR e o rastro vem de
// `/api/atividades/genealogia`. Sem sessão as duas coisas falham, e a prova
// mediria um estado de erro — que é justamente o único estado sem tabela, sem
// árvore e sem nada largo pra estourar a largura.
//
// Os nomes são longos de propósito: "Chapa de policarbonato 3 mm — alveolar
// cristal" é o tipo de rótulo que o galpão usa de verdade, e é ele que decide
// se a linha vira card legível a 320px ou se empurra a página de lado.
import type { Tempos } from "@/lib/atividades-tempo-consulta";
import type { Rastro } from "@/lib/atividades-genealogia";

const semDescarte = {
  sem_fim: 0, sem_inicio: 0, relogio_invertido: 0, instantanea: 0, esquecida: 0, sem_producao: 0,
};

export const TEMPOS_PROVA: Tempos = {
  dias: 30,
  escopo: "equipe",
  // `truncado` ligado de propósito: é uma das duas tarjas largas da tela, e
  // tarja com texto comprido é onde a largura estoura primeiro.
  truncado: true,
  resumo: {
    ordensMedidas: 46,
    ordensDescartadas: 31,
    fracaoDescartada: 0.4,
    pecas: 1284,
    horas: 92.5,
    acimaDoPrevisto: 2,
    maiorDescarte: { motivo: "sem_inicio", n: 19 },
  },
  // A saída de emergência acima do limite: é o estado que a tela precisa dizer
  // em voz alta, e o bloco mais largo dela (frase comprida + lista de motivos).
  aberturas: {
    semLivro: false,
    exigido: true,
    comBipe: 21,
    semBipe: 25,
    porMotivo: [
      { motivo: "sem_material", rotulo: "Esta atividade não usa material", ordens: 14 },
      { motivo: "sem_etiqueta", rotulo: "O material não tem etiqueta", ordens: 7 },
      { motivo: "leitor_parado", rotulo: "O leitor não está funcionando", ordens: 4 },
    ],
    truncado: false,
  },
  grupos: [
    {
      chave: "p:Chancela", rotulo: "Chapa de policarbonato 3 mm — alveolar cristal",
      categoria: "Corte e dobra", ehProduto: true,
      amostras: 22, descartadas: 9, descartes: { ...semDescarte, sem_inicio: 7, esquecida: 2 },
      poucosDados: false, pecas: 640, totalMin: 2860,
      medianaMinPorPeca: 3.4, mediaMinPorPeca: 6.2, p90MinPorPeca: 11.8,
      medianaOrdemMin: 96.5, estimadoMin: 40, aderencia: 2.41, ultima: "2026-08-14T18:22:00.000Z",
    },
    {
      chave: "t:Lavar borrachas", rotulo: "Lavar borrachas de vedação (lote pequeno)",
      categoria: "Preparo", ehProduto: false,
      amostras: 18, descartadas: 4, descartes: { ...semDescarte, instantanea: 4 },
      poucosDados: false, pecas: 520, totalMin: 1240,
      medianaMinPorPeca: 2.1, mediaMinPorPeca: 2.3, p90MinPorPeca: 4.1,
      medianaOrdemMin: 62, estimadoMin: 40, aderencia: 1.55, ultima: "2026-08-13T11:02:00.000Z",
    },
    {
      chave: "t:Chancela", rotulo: "Chancela", categoria: "Acabamento", ehProduto: false,
      amostras: 6, descartadas: 2, descartes: { ...semDescarte, sem_fim: 2 },
      poucosDados: false, pecas: 124, totalMin: 480,
      medianaMinPorPeca: 3.9, mediaMinPorPeca: 3.9, p90MinPorPeca: 5,
      medianaOrdemMin: 41, estimadoMin: 40, aderencia: 1.03, ultima: "2026-08-15T09:10:00.000Z",
    },
    // Grupo SÓ com descarte: continua na lista com "sem medição" — é o estado
    // que a tela existe pra não esconder, e o que a fundação precisa desenhar
    // com metade das células vazias.
    {
      chave: "t:Montagem da base", rotulo: "Montagem da base articulada com alavanca reforçada",
      categoria: "Montagem", ehProduto: false,
      amostras: 0, descartadas: 16, descartes: { ...semDescarte, sem_inicio: 12, esquecida: 4 },
      poucosDados: true, pecas: 0, totalMin: 0,
      medianaMinPorPeca: 0, mediaMinPorPeca: 0, p90MinPorPeca: 0,
      medianaOrdemMin: 0, estimadoMin: null, aderencia: null, ultima: "2026-08-12T20:40:00.000Z",
    },
  ],
};

/** Rastro de 3 níveis com nomes compridos — é a árvore que precisa virar pilha. */
export const RASTRO_PROVA: Rastro = {
  direcao: "tras",
  raiz: {
    id: "u0", codigo: "CHANC-000042-2026", item: "Chancela montada — modelo reforçado",
    pecas: 50, status: "em_estoque",
    criadoPor: "Maria Aparecida de Souza", criadoEm: "2026-08-14T17:40:00.000Z",
    baixadoPor: null, baixadoEm: null,
  },
  niveis: [
    {
      profundidade: 0,
      elos: [{
        atividade: {
          id: "a1", tarefa: "Chancela — colagem e prensagem do conjunto",
          categoria: "Acabamento", quem: "Maria Aparecida de Souza", quemId: "p1",
          produto: "Chancela", quando: "2026-08-14T17:40:00.000Z",
        },
        reprovada: true,
        unidades: [
          {
            id: "u1", codigo: "ALAV-000117-2026", item: "Folha de alavanca cortada 3 mm",
            pecas: 12, status: "consumido",
            criadoPor: "José Carlos Ferreira", criadoEm: "2026-08-13T10:05:00.000Z",
            baixadoPor: "Maria Aparecida de Souza", baixadoEm: "2026-08-14T14:02:00.000Z",
          },
          {
            id: "u2", codigo: "BORR-000998-2026", item: "Borracha de vedação lavada",
            pecas: 1, status: "consumido",
            criadoPor: "Ana Paula", criadoEm: "2026-08-12T08:30:00.000Z",
            baixadoPor: "Maria Aparecida de Souza", baixadoEm: "2026-08-14T14:02:00.000Z",
          },
        ],
      }],
    },
    {
      profundidade: 1,
      elos: [{
        atividade: {
          id: "a2", tarefa: "Corte da folha de alavanca", categoria: "Corte e dobra",
          quem: "José Carlos Ferreira", quemId: "p2", produto: null,
          quando: "2026-08-13T10:05:00.000Z",
        },
        unidades: [{
          id: "u3", codigo: "PCARB-004421-2026", item: "Chapa de policarbonato 3 mm — alveolar cristal",
          pecas: 4, status: "consumido",
          criadoPor: null, criadoEm: "2026-08-10T09:00:00.000Z",
          baixadoPor: "José Carlos Ferreira", baixadoEm: "2026-08-13T09:12:00.000Z",
        }],
      }],
    },
  ],
  truncado: true,
  semVinculo: false,
  consultas: 8,
};
