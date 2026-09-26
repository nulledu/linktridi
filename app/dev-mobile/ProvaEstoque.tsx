"use client";

// TEMPORÁRIO — as SETE abas do Estoque montadas com a rede falsa.
//
// Existe como componente de CLIENTE (e não como um trecho dentro do
// `page.tsx`, que é servidor) por um motivo só: os handlers de POST são
// FUNÇÕES, e função não atravessa a fronteira servidor → cliente como prop. Sem
// este arquivo, o banco de provas só conseguiria simular GET — e os dois fluxos
// que mais precisam de prova (importar planilha, classificar em lote) têm o
// miolo num POST.

import { RedeFalsa } from "./RedeFalsa";
import { EstoqueTabs } from "../(plataforma)/estoque/EstoqueTabs";
import { HANDLERS_ESTOQUE } from "./estoque-servidor-falso";
import { REDE_ESTOQUE } from "./telas-estoque";
import { ESTOQUE } from "./telas";

export function ProvaEstoque() {
  return (
    // `/api/estoque` (a base de custos legada) por último: o casamento é por
    // `startsWith` e ele é prefixo de quase todas as outras chaves.
    <RedeFalsa mapa={{ ...REDE_ESTOQUE, "/api/estoque": ESTOQUE }} handlers={HANDLERS_ESTOQUE}>
      {/* `bipar: true`: é a aba usada de pé, no galpão, com uma mão — a que
          MAIS precisa ser medida a 320px. Desligada aqui, o banco de provas não
          cobre justamente a tela de maior risco. */}
      <EstoqueTabs perms={{ itens: true, precos: true, compras: true, fornecedores: true, locais: true, bipar: true }} />
    </RedeFalsa>
  );
}
