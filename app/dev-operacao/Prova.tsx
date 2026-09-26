"use client";

// Banco de provas da Operação. Monta a tela com TODAS as permissões ligadas —
// é a configuração mais larga, e portanto a que estoura primeiro a 320px.
//
// Os painéis de dentro batem em `/api/estoque/*` e voltariam 401 aqui (não há
// sessão). Isso é o certo: o que se mede nesta rota é GEOMETRIA — largura,
// alvo de toque, faixa que rola —, e um painel em estado de erro ocupa o mesmo
// espaço que um painel cheio.
import { OperacaoClient } from "../(plataforma)/operacao/OperacaoClient";

export function Prova() {
  return (
    <div style={{ padding: 16, minHeight: "100dvh", background: "var(--bg)" }}>
      <OperacaoClient
        perms={{ itens: true, bipar: true, ajustar: true, compras: true, configurarImpressao: true }}
      />
    </div>
  );
}
