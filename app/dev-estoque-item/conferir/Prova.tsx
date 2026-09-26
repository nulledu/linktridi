"use client";

// Banco de provas da aba "Conferir". A tela real busca os próprios dados, então
// sem a rede falsa ela abriria num aviso de erro e o conteúdo — que é onde
// moram os defeitos de celular (tabela que vira card, chips que quebram linha,
// a folha virando painel de tela cheia) — nunca apareceria.
//
// A rede falsa só responde GET (é a regra do RedeFalsa): o POST de confirmar
// segue falhando de verdade, o que prova de quebra a faixa de erro traduzida.
// A folha de etiquetas é montada à parte, embaixo, porque ela só existe DEPOIS
// de um POST bem-sucedido.

import { ConferirClient } from "../../(plataforma)/estoque/ConferirClient";
import { GlobalLightbox } from "../../(plataforma)/GlobalLightbox";
import { FolhaDeEtiquetas } from "../../(plataforma)/estoque/Etiqueta";
import { RedeFalsa } from "../../dev-mobile/RedeFalsa";

/**
 * Foto falsa em `data:` — o banco de provas não pode depender da rede nem do
 * Storage, e a foto do trabalho é justamente o bloco mais alto da ficha: sem
 * imagem nenhuma, a medida de 320px sairia mentindo pra menos.
 *
 * 1200×900 de propósito: o `GlobalLightbox` ignora fonte com menos de 200px
 * (avatar e ícone não abrem em tela cheia), então uma prévia pequena aqui não
 * provaria o zoom.
 */
function fotoFalsa(rotulo: string, fundo: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">`
    + `<rect width="1200" height="900" fill="${fundo}"/>`
    + `<rect x="180" y="200" width="840" height="500" rx="24" fill="#00000022"/>`
    + `<text x="600" y="470" font-family="system-ui,sans-serif" font-size="64" font-weight="700"`
    + ` fill="#ffffffdd" text-anchor="middle">${rotulo}</text>`
    + `<text x="600" y="545" font-family="system-ui,sans-serif" font-size="34"`
    + ` fill="#ffffffaa" text-anchor="middle">foto que a pessoa tirou ao concluir</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const ROSTO = (letra: string, fundo: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="240" height="240" fill="${fundo}"/>`
    + `<text x="120" y="152" font-family="system-ui,sans-serif" font-size="112" font-weight="700"`
    + ` fill="#ffffffdd" text-anchor="middle">${letra}</text></svg>`,
  )}`;

const PENDENTES = {
  atividades: [
    {
      // O caso comum do galpão: atividade SEM produto, com a tarefa em texto e
      // a instrução no detalhe. 103 das 104 concluídas em produção são assim.
      id: "a1", produtoNome: null, tarefa: "Montar alavancas",
      detalhe: "Colar o PS nas 30 bases e montar com o parafuso curto.",
      itemId: "i1", itemSerializado: true,
      preparo: {
        estado: "ja_etiquetado", quantidade: 60, unidade: "un",
        motivo: "Item etiquetado. Ao aprovar, o sistema gera a etiqueta da caixa lacrada com a quantidade conferida — é só colar e guardar na prateleira.",
      },
      categoria: "Produção", quantidadeAlvo: 30, quantidadeFeita: 19,
      executorId: "u2", executorNome: "João Vitor", executorFotoUrl: ROSTO("J", "#3d5a80"),
      concluidaEm: new Date(Date.now() - 3 * 3600_000).toISOString(), souEuQuemFez: false,
      // A FALTA: 19 de 30. É o caso que muda a decisão e o que a tela escondia.
      fotoUrl: fotoFalsa("Alavancas montadas", "#2f4858"),
      tempoRealMin: 34, tempoEstimadoMin: 40,
      // O material que a pessoa bipou no começo. Duas caixas de 30 pra 19 peças
      // prontas: a sobra aparece na frase, e é a conta que o gerente faz de
      // cabeça olhando a caixa.
      consumo: { etiquetas: 2, pecas: 60 },
    },
    {
      id: "a2", produtoNome: "Prateleira MDF 6mm", tarefa: null,
      detalhe: null, itemId: "i2", itemSerializado: true,
      categoria: "Produção", quantidadeAlvo: 30, quantidadeFeita: 28,
      executorId: "u1", executorNome: "Você mesmo", executorFotoUrl: null,
      concluidaEm: new Date(Date.now() - 26 * 3600_000).toISOString(), souEuQuemFez: true,
      fotoUrl: fotoFalsa("Prateleiras", "#4a5043"),
      tempoRealMin: 95, tempoEstimadoMin: 60,
      consumo: { etiquetas: 1, pecas: 30 },
    },
    {
      // SEM foto: a única maneira de conferir é caminhar até a caixa, e a fila
      // diz isso antes de a pessoa abrir.
      id: "a3", produtoNome: "Suporte de parede reforçado (nome antigo)", tarefa: null,
      detalhe: null, itemId: null, itemSerializado: null,
      categoria: "Produção", quantidadeAlvo: 12, quantidadeFeita: 12,
      executorId: "u3", executorNome: "Rogério Nascimento", executorFotoUrl: ROSTO("R", "#7d4f50"),
      concluidaEm: new Date(Date.now() - 20 * 86400_000).toISOString(), souEuQuemFez: false,
      fotoUrl: null, tempoRealMin: null, tempoEstimadoMin: 45,
      // Nenhum material bipado: a tela DIZ isso em vez de omitir — caixa que
      // nasce sem bipe é material que saiu do estoque sem registro.
      consumo: null,
    },
    // Item A GRANEL: aprovar só soma a quantidade no catálogo e não sai papel
    // nenhum — e nunca vai sair. É a promessa que muda no painel, e a que,
    // errada, deixava o gerente esperando na frente da impressora. Aqui o
    // "Preparar este item pra etiqueta" NÃO pode aparecer: converter 12,5 kg
    // truncaria pra 12 e os 500 gramas sumiriam do sistema pra sempre.
    {
      id: "a4", produtoNome: "Cola PVA extra branca (frasco 1kg)", tarefa: null,
      detalhe: "Envasar 40 frascos de 1kg — pesar cada um antes de tampar.",
      itemId: "i9", itemSerializado: false,
      preparo: {
        estado: "nao_etiquetavel", quantidade: 12.5, unidade: "kg",
        motivo: "Este item é medido em quilos, e isso não se conta em caixas fechadas. A aprovação soma na contagem do estoque, como sempre — etiqueta é só pra item que se conta em peças.",
      },
      categoria: "Produção", quantidadeAlvo: 40, quantidadeFeita: 0,
      executorId: "u5", executorNome: "Tarsila Moura", executorFotoUrl: ROSTO("T", "#5c4b8a"),
      concluidaEm: new Date(Date.now() - 5 * 3600_000).toISOString(), souEuQuemFez: false,
      // Ninguém contou: diferente de "fez zero", e a tela não pode acusar.
      fotoUrl: fotoFalsa("Frascos envasados", "#33475b"),
      tempoRealMin: 210, tempoEstimadoMin: null,
      consumo: { etiquetas: 3, pecas: 3 },
    },
    // A PILHA ANTIGA — o caso de 219 dos 219 itens do galpão. O item se conta em
    // peças, mas tem 191 na contagem digitada e nenhuma etiqueta colada: virar
    // uma caixa única de 191 sozinho criaria um fantasma (a baixa é
    // tudo-ou-nada e não há papel em nada pra bipar). Aqui o painel oferece a
    // ESCOLHA — e é o único caso em que ela aparece.
    {
      id: "a6", produtoNome: "Folha de alavanca limpa", tarefa: "Limpar folhas de alavanca",
      detalhe: "Limpar as 40 folhas da caixa 3 e empilhar na bancada.",
      itemId: "i7", itemSerializado: false,
      preparo: {
        estado: "precisa_preparo", quantidade: 191, unidade: "un",
        motivo: "Este item ainda tem 191 na contagem antiga. Prepare-o pra etiqueta antes, pra pilha da prateleira virar papel colado: escolha se a pilha inteira é uma caixa só ou se cada peça leva a sua etiqueta. Enquanto isso, a aprovação continua somando na contagem.",
      },
      categoria: "Produção", quantidadeAlvo: 40, quantidadeFeita: 40,
      executorId: "u7", executorNome: "Marina Alves", executorFotoUrl: ROSTO("M", "#6b4f2a"),
      concluidaEm: new Date(Date.now() - 90 * 60_000).toISOString(), souEuQuemFez: false,
      fotoUrl: fotoFalsa("Folhas limpas", "#3b4a3f"),
      tempoRealMin: 52, tempoEstimadoMin: 60,
      consumo: { etiquetas: 1, pecas: 40 },
    },
  ],
  travadas: 2,
  proximoCursor: null,
  qcDesligado: false,
  consumoIndisponivel: false,
  // Quem abre a prova tem poder de ajuste — é o que faz o gesto de preparo
  // aparecer. Troque pra `false` pra ver a tela de quem só confere.
  podePreparar: true,
  // A fila do dia a dia é a SEMANA. O que ficou pra trás é CONTADO — e o
  // botão que abre a lista inteira só existe quando este número existe.
  dias: 7,
  anteriores: 83,
  acervo: false,
};

/** O mesmo, no modo acervo: sem limite de data e sem nada "pra trás". */
const ACERVO = {
  ...PENDENTES,
  atividades: [
    ...PENDENTES.atividades,
    {
      id: "a5", produtoNome: null, tarefa: "Lixar bordas do lote de março",
      detalhe: null, itemId: "i3", itemSerializado: true,
      categoria: "Produção", quantidadeAlvo: 80, quantidadeFeita: 80,
      executorId: "u6", executorNome: "Davi", executorFotoUrl: ROSTO("D", "#2e6f5e"),
      concluidaEm: new Date(Date.now() - 34 * 86400_000).toISOString(), souEuQuemFez: false,
      fotoUrl: null, tempoRealMin: 480, tempoEstimadoMin: 420,
      consumo: { etiquetas: 4, pecas: 80 },
    },
  ],
  anteriores: 0,
  acervo: true,
};

// A segunda via, que sai pelo histórico: a etiqueta vem MONTADA pelo servidor.
// Sem esta rota no mapa, o painel de reimpressão da prova abriria no aviso de
// falha e o que ele desenha no celular ficaria por conferir.
const ETIQUETA_SERVIDOR = {
  etiquetas: [{
    codigo: "PNL-RIP-BR-00042", unidadeId: "u-42", itemId: "i1",
    nome: "Painel Ripado 2750×1840 Branco", quantidade: 50,
    corDimensoes: "Branco · 2750×1840", local: "GAL-A", localDetalhe: "C3 · B2",
    responsavel: "Marina Alves", data: new Date(Date.now() - 2 * 86400_000).toISOString(),
  }],
};

// A primeira atividade aparece TRÊS vezes de propósito — errada, errada, certa.
// É o histórico do refazer, o caso que mais quebra layout no celular (três
// tentativas empilhadas num card só) e o que a aba precisa contar direito.
const HISTORICO = {
  conferencias: [
    {
      id: "c1c", atividadeId: "a9", itemId: "i1", itemNome: "Painel Ripado 2750×1840 Branco",
      executorId: "u2", executorNome: "Marina Alves",
      conferidoPorId: "u1", conferidoPorNome: "Caio Silva",
      resultado: "certo", quantidade: 50, unidadeCodigo: "PNL-RIP-BR-00042",
      defeitos: [], obs: "Terceira volta, agora saiu redondo.",
      conferidoEm: new Date(Date.now() - 2 * 86400_000).toISOString(),
      tentativa: 3, tentativas: 3,
    },
    {
      id: "c1b", atividadeId: "a9", itemId: "i1", itemNome: "Painel Ripado 2750×1840 Branco",
      executorId: "u2", executorNome: "Marina Alves",
      conferidoPorId: "u1", conferidoPorNome: "Caio Silva",
      resultado: "errado", quantidade: 0, unidadeCodigo: null,
      defeitos: ["acabamento_ruim"],
      obs: "Ainda com a borda lascada em duas — pedi pra lixar antes de fechar a caixa.",
      conferidoEm: new Date(Date.now() - 3 * 86400_000).toISOString(),
      tentativa: 2, tentativas: 3,
    },
    {
      id: "c1a", atividadeId: "a9", itemId: "i1", itemNome: "Painel Ripado 2750×1840 Branco",
      executorId: "u2", executorNome: "Marina Alves",
      conferidoPorId: "u1", conferidoPorNome: "Caio Silva",
      resultado: "errado", quantidade: 0, unidadeCodigo: null,
      defeitos: ["acabamento_ruim", "peca_suja"],
      obs: "Chegaram com a borda lascada e cola secando por fora, falei com quem produziu.",
      conferidoEm: new Date(Date.now() - 4 * 86400_000).toISOString(),
      tentativa: 1, tentativas: 3,
    },
    {
      id: "c2", atividadeId: "a8", itemId: "i2", itemNome: "Prateleira MDF 6mm",
      executorId: "u3", executorNome: "Rogério Nascimento",
      conferidoPorId: "u1", conferidoPorNome: "Caio Silva",
      resultado: "certo", quantidade: 30, unidadeCodigo: null,
      defeitos: [], obs: null,
      conferidoEm: new Date(Date.now() - 5 * 86400_000).toISOString(),
      tentativa: 1, tentativas: 1,
    },
    {
      id: "c3", atividadeId: "a7", itemId: null, itemNome: null,
      executorId: "u4", executorNome: "Equipe da tarde",
      conferidoPorId: "u1", conferidoPorNome: "Caio Silva",
      resultado: "errado", quantidade: 0, unidadeCodigo: null,
      defeitos: ["medida_errada", "montagem_incompleta", "faltou_quantidade"],
      obs: "Lote inteiro fora de medida.",
      conferidoEm: new Date(Date.now() - 9 * 86400_000).toISOString(),
      tentativa: 2, tentativas: 4,
    },
  ],
  proximoCursor: null,
  qcDesligado: false,
};

const VAZIO_QC = { atividades: [], travadas: 0, proximoCursor: null, qcDesligado: true };
const VAZIO_QC_HIST = { conferencias: [], proximoCursor: null, qcDesligado: true };

// UMA etiqueta, valendo as 50 peças da primeira atividade da fila (`a1`) — é
// exatamente o que `registrarConferencia` devolve ao aprovar, e é o retrato que
// esta prova precisa mostrar.
//
// Aqui havia SEIS etiquetas de uma peça cada, sem `quantidade`. Isso era o
// mundo de antes da caixa lacrada, e sobreviveu ao redesenho: quem abrisse esta
// página pra julgar a feature veria a folha contradizendo a própria fila logo
// acima ("50 peças") e o aviso do painel ("vai nascer uma etiqueta só"). Prova
// que mostra o modelo errado é pior que prova nenhuma — ela CONFIRMA o errado.
const ETIQUETAS = [{
  codigo: "PNL-RIP-BR-000042",
  nome: "Painel Ripado 2750×1840 Branco",
  quantidade: 50,
  corDimensoes: "Branco · 2750×1840",
  local: "GAL-A",
  localDetalhe: "C3 · B2",
  responsavel: "Marina Alves",
  // Data FIXA. `new Date()` no escopo do módulo é avaliado uma vez no servidor
  // e outra no navegador: os dois carimbos diferem por milissegundos, a
  // etiqueta imprime textos diferentes e o React derrubava a hidratação da
  // página inteira ("2 Issues" no canto). Numa prova, o alerta que não é do
  // que se está provando é o alerta que ensina a ignorar alerta.
  impressoEm: "2026-08-15T13:40:00.000Z",
}];

export function Prova({ qcDesligado }: { qcDesligado: boolean }) {
  // A ordem das chaves importa: `find` devolve o PRIMEIRO prefixo que casa, e
  // "/api/estoque/conferencias" casaria também a rota de pendentes.
  const mapa: Record<string, Record<string, unknown>> = qcDesligado
    ? { "/api/estoque/conferencias/pendentes": VAZIO_QC, "/api/estoque/conferencias": VAZIO_QC_HIST }
    : {
        "/api/estoque/conferencias/pendentes": PENDENTES,
        "/api/estoque/conferencias": HISTORICO,
        "/api/estoque/unidades/etiqueta": ETIQUETA_SERVIDOR,
      };

  // O acervo precisa de HANDLER e não de mapa: o mapa casa por PREFIXO, e
  // "/pendentes" é prefixo de "/pendentes?acervo=1" — os dois cairiam na mesma
  // resposta e o botão "Ver as mais antigas" pareceria não fazer nada.
  const handlers = qcDesligado ? undefined : {
    "/api/estoque/conferencias/pendentes": ({ url }: { url: string }) => ({
      corpo: url.includes("acervo=1") ? ACERVO : PENDENTES,
    }),
    // Preparar item pra etiqueta é POST, e o mapa só responde GET. Sem simular,
    // o gesto pararia na faixa de falha e o que ele desenha DEPOIS (a promessa
    // virando "uma etiqueta só", sem recarregar) ficaria por conferir — que é
    // metade do que esta prova existe pra mostrar. O corpo é o mesmo formato da
    // rota real: um resultado por item, com a frase pronta quando dá errado.
    "/api/estoque/unidades/preparar": ({ corpo }: { corpo: unknown }) => {
      const modo = (corpo as { modo?: string } | undefined)?.modo;
      return {
        corpo: {
          ok: true,
          resultados: [{
            item_id: "i7", nome: "Folha de alavanca limpa", ok: true,
            geradas: modo === "pilha" ? 1 : 191, sku: "FLH-ALV",
          }],
          resumo: { itens: 1, etiquetas: modo === "pilha" ? 1 : 191, falhas: 0 },
        },
      };
    },
  };

  return (
    <div style={{ padding: 20, minHeight: "100dvh", maxWidth: 1120 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Prova — aba Conferir do Estoque</h1>
      <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 20, lineHeight: 1.55 }}>
        Meça <code>scrollWidth − clientWidth</code> a 320/390/430 e os alvos por{" "}
        <code>offsetHeight</code>. <code>?qc=off</code> prova a tela de &quot;o controle
        de qualidade ainda não foi ligado&quot;. As fotos são <code>data:</code> — o banco
        de provas não pode depender do Storage.
      </p>

      <RedeFalsa mapa={mapa} handlers={handlers}>
        <ConferirClient />
      </RedeFalsa>
      {/* O zoom da foto do trabalho vem do lightbox do Shell, e esta página mora
          FORA de `(plataforma)`. Sem montá-lo aqui, clicar na foto não faria
          nada e a prova esconderia justamente o gesto que ela deveria provar. */}
      <GlobalLightbox />

      <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "32px 0 20px" }} />
      <h2 style={{ fontSize: 15, fontWeight: 750, marginBottom: 10 }}>Folha de etiquetas (o que aparece depois de confirmar CERTO)</h2>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.55, margin: "0 0 12px" }}>
        Uma atividade aprovada gera <strong>uma etiqueta só</strong> — a caixa lacrada,
        com o selo dizendo quantas peças vão dentro. É a etiqueta da primeira
        atividade da fila acima, valendo as 50 peças que Marina Alves registrou.
      </p>
      <FolhaDeEtiquetas etiquetas={ETIQUETAS} />
    </div>
  );
}
