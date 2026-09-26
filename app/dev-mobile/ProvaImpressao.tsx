"use client";

// TEMPORÁRIO — a tela de impressão de etiquetas montada com a rede falsa.
//
// Ela é a que mais precisa de medida no celular, e por um motivo que nenhuma
// outra tela do Estoque tem: o conteúdo dela é uma ETIQUETA DE 72mm, e 72mm não
// encolhem. A 320px a prévia é mais larga que a coluna, e é ali que se confere
// que ela rola DENTRO do bloco em vez de estourar a página.
//
// Sem sessão, `/api/estoque/impressao/trabalhos` volta 403 e a fila nasceria
// vazia — sem seletor de tablet, sem lista, sem o aviso do aparelho sumido. Ou
// seja, exatamente as três peças que têm mais risco de estourar a largura.

import { RedeFalsa } from "./RedeFalsa";
import { ImpressaoClient } from "../(plataforma)/estoque/impressao/ImpressaoClient";

const AGORA = Date.now();
const HA = (min: number) => new Date(AGORA - min * 60_000).toISOString();

const TRABALHOS = {
  ok: true,
  tetoPendentes: 10,
  pendente: null,
  tablets: [
    { id: "tab-1", nome: "Tablet do galpão", vistoEm: HA(2) },
    // O segundo aparelho existe pra prova mostrar o SELETOR de verdade (com um
    // só ele viria escolhido e a pergunta some), e este está sumido há dois dias
    // — é o que dispara o aviso de "não dá sinal", uma das linhas mais longas
    // da tela.
    { id: "tab-2", nome: "Tablet da expedição — bancada do fundo", vistoEm: HA(60 * 52) },
  ],
  trabalhos: [
    {
      id: "t1", titulo: "PRATELEIRA A3", dispositivoId: "tab-1", copias: 1,
      status: "fila", detalhe: null, porNome: "Ana", criadoEm: HA(3), resolvidoEm: null,
    },
    {
      id: "t2", titulo: "GAL-A-C3 — Perfis de alumínio anodizado", dispositivoId: "tab-1", copias: 3,
      status: "impresso", detalhe: null, porNome: "Caio", criadoEm: HA(40), resolvidoEm: HA(38),
    },
    // Falha COM motivo: é a linha mais comprida que a fila pode ter, e a que
    // decide se o cartão quebra ou vaza a 320px.
    {
      id: "t3", titulo: "Área de descarte", dispositivoId: "tab-2", copias: 1,
      status: "falhou", detalhe: "a impressora Bluetooth não respondeu — confira se ela está ligada",
      porNome: "Ana", criadoEm: HA(120), resolvidoEm: HA(118),
    },
    {
      id: "t4", titulo: "PRATELEIRA B7", dispositivoId: "tab-2", copias: 1,
      status: "expirado", detalhe: null, porNome: "Caio", criadoEm: HA(60 * 9), resolvidoEm: null,
    },
  ],
};

const LOCAIS = {
  locais: [
    { id: "l1", nome: "Galpão A — corredor central", codigo: "GAL-A", pai_id: null, ativo: true, ordem: 0 },
    { id: "l2", nome: "Prateleira A3", codigo: "A3", pai_id: "l1", ativo: true, ordem: 1 },
    { id: "l3", nome: "Bancada de expedição", codigo: "EXP-1", pai_id: null, ativo: true, ordem: 2 },
  ],
  podeGerir: true,
};

const CONFIG = {
  ok: true,
  config: { alturaMm: 15, copias: 1 },
  definida: true,
  atualizadoEm: null,
  caixas: [],
  pendente: null,
};

export function ProvaImpressao() {
  return (
    // `/api/estoque/impressao` por último: o casamento é por `startsWith` e ele
    // é prefixo de `/api/estoque/impressao/trabalhos`.
    <RedeFalsa mapa={{
      "/api/estoque/impressao/trabalhos": TRABALHOS,
      "/api/estoque/impressao/tipos": { ok: true, itens: [], pendente: null },
      "/api/estoque/locais": LOCAIS,
      "/api/estoque/impressao": CONFIG,
    }}>
      <ImpressaoClient podeConfigurar podeVerItens />
    </RedeFalsa>
  );
}
