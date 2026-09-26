"use client";

import { useState } from "react";
import { Alerta } from "../(plataforma)/ui/Alerta";
import { Botao } from "../(plataforma)/ui/controles";
import { toast } from "../(plataforma)/Toast";

// Prova do `Alerta` (ui/Alerta.tsx): os seis tons, com e sem título, com ação,
// dispensável, carregando — e o toast, que é o mesmo componente flutuando.
// A coluna estreita existe pra ver a ação descer pra baixo do texto pela
// container query (um painel lateral de 400px no computador).
export function ProvaAlertas() {
  const [fechado, setFechado] = useState(false);
  return (
    <section style={{ display: "grid", gap: 14, minWidth: 0 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>Alertas</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 4, maxWidth: "64ch" }}>
          Alert do HeroUI com ícone Tabler e a paleta semântica do tema. Ação à direita quando cabe, embaixo quando o bloco é estreito.
        </p>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        <Alerta titulo="Novidades no painel">Agora dá pra fixar o período e escolher a página inicial pela sua conta.</Alerta>
        <Alerta tom="destaque" titulo="Atualização disponível" acao={<Botao tamanho="sm" variante="primario">Recarregar</Botao>}>
          Uma versão nova do sistema está no ar. Recarregue pra pegar as correções.
        </Alerta>
        <Alerta tom="info" titulo="Sincronizando com o ERP" carregando>Os pedidos de hoje estão chegando. Pode levar alguns segundos.</Alerta>
        {!fechado
          ? <Alerta tom="ok" titulo="Perfil atualizado" aoFechar={() => setFechado(true)} />
          : <Botao tamanho="sm" onClick={() => setFechado(false)}>Mostrar de novo o alerta dispensado</Botao>}
        <Alerta tom="atencao" titulo="Manutenção programada">O sistema fica fora do ar no domingo, das 2h às 6h.</Alerta>
        <Alerta tom="perigo" titulo="Sem conexão com o servidor" acao={<Botao tamanho="sm" variante="perigo">Tentar de novo</Botao>}>
          Tente o seguinte:
          <ul><li>Confira a internet</li><li>Recarregue a página</li></ul>
        </Alerta>
        <Alerta tom="atencao">Só texto, sem título: 3 itens estão abaixo do estoque mínimo.</Alerta>
      </div>
      <div style={{ maxWidth: 380, display: "grid", gap: 10 }}>
        <Alerta tom="perigo" titulo="Coluna estreita" acao={<Botao tamanho="sm" variante="perigo">Tentar de novo</Botao>} aoFechar={() => {}}>
          A ação desce pra baixo do texto e o dispensar fica no canto.
        </Alerta>
      </div>
      {/* Notificação = Toast do HeroUI: pilha que expande no hover, pausa com o
          mouse em cima, Alt+T foca a região. */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Botao tamanho="sm" onClick={() => toast.ok("Pedido salvo")}>Toast ok</Botao>
        <Botao tamanho="sm" onClick={() => toast.neutro("Você foi convidado pra equipe", { descricao: "A Paola te adicionou no quadro de Produção.", icone: "users-plus" })}>Toast neutro</Botao>
        <Botao tamanho="sm" onClick={() => toast.info("Versão nova no ar", { descricao: "Recarregue pra pegar as correções.", acao: { rotulo: "Recarregar", onClick: () => {} } })}>Toast info + ação</Botao>
        <Botao tamanho="sm" onClick={() => toast.atencao("Estoque baixo", { descricao: "Fita 12 mm: sobram 4 rolos." })}>Toast atenção</Botao>
        <Botao tamanho="sm" onClick={() => toast.erro("Não deu pra salvar", { descricao: "Sem conexão com o servidor.", acao: { rotulo: "Tentar de novo", onClick: () => toast.ok("Salvo") } })}>Toast erro + ação</Botao>
        <Botao tamanho="sm" onClick={() => {
          const id = toast.neutro("Enviando a nota…", { carregando: true });
          setTimeout(() => toast.atualizar(id, "Nota enviada", "ok", { descricao: "NF 4821 entrou no estoque." }), 2200);
        }}>Carregando → ok</Botao>
        <Botao tamanho="sm" onClick={() => toast.promessa(new Promise((_, r) => setTimeout(() => r(new Error("O ERP não respondeu")), 1800)), { carregando: "Sincronizando pedidos…", ok: "Sincronizado", erro: (e) => e.message })}>Promessa que falha</Botao>
        <Botao tamanho="sm" onClick={() => { toast.ok("Pedido 1 salvo"); setTimeout(() => toast.info("Nova mensagem"), 300); setTimeout(() => toast.atencao("Meta em risco"), 600); }}>Pilha de 3</Botao>
      </div>
    </section>
  );
}
