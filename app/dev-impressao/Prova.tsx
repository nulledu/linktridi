"use client";

// Banco de provas da tela de Impressão de etiquetas.
//
// A tela real só existe atrás de login e credencial não se digita aqui — e a
// regra do celular (funcionar a partir de 320px) não é verificável lendo
// código: alvo de toque, fileira que estoura a largura e prévia que não cabe só
// aparecem medindo. A `RedeFalsa` (a mesma do /dev-mobile) responde às rotas que
// esta tela busca; POST/PATCH continuam falhando de verdade, senão a prova
// mentiria sobre o que acontece ao gravar.

import { RedeFalsa } from "../dev-mobile/RedeFalsa";
import { ImpressaoClient } from "../(plataforma)/estoque/impressao/ImpressaoClient";

const MAPA = {
  // A configuração como o galpão a tem hoje: 72×15mm, uma via.
  "/api/estoque/impressao/tipos": {
    itens: [
      { id: "i1", nome: "Chapa MDF 6mm branca 2750x1840", sku: "MDF6MM-BR-18", categoria: "Matéria-prima", serializado: true, tipo: "unica" },
      { id: "i2", nome: "Caixa de chancelas sortidas", sku: "CHAN-0001", categoria: "Acabamento", serializado: true, tipo: "caixa" },
      { id: "i3", nome: "Cola branca 5kg", sku: null, categoria: "Colas", serializado: false, tipo: "unica" },
    ],
    pendente: null,
  },
  "/api/estoque/impressao/trabalhos": {
    tablets: [{ id: "t1", nome: "Tablet do galpão", vistoEm: new Date().toISOString() }],
    trabalhos: [],
    pendente: null,
  },
  "/api/estoque/impressao": {
    ok: true,
    config: { alturaMm: 15, larguraMm: 72, copias: 1, ocultos: [] },
    definida: true,
    atualizadoEm: null,
    caixas: ["CHAN-0001"],
    pendente: null,
  },
  "/api/estoque/locais": {
    locais: [
      { id: "l1", nome: "Galpão A · corredor 3", codigo: "GAL-A-C3", ativo: true },
      { id: "l2", nome: "Almoxarifado", codigo: "ALM", ativo: true },
    ],
  },
};

export function Prova() {
  return (
    <RedeFalsa mapa={MAPA}>
      <div style={{ padding: 16 }}>
        <ImpressaoClient podeConfigurar podeVerItens />
      </div>
    </RedeFalsa>
  );
}
