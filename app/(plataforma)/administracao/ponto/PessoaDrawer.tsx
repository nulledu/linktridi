"use client";

// ── Drawer da pessoa ─────────────────────────────────────────────────────────
// Uma porta só pra "ver essa pessoa". Antes, responder "a Bia está atrasada, e
// como está o banco dela?" era: sair do painel, trocar de aba, achar o nome na
// lista, abrir o detalhe — e o caminho de volta ao painel não existia.
//
// O painel lateral não tira a pessoa de onde ela estava: a lista continua atrás,
// e fechar devolve o contexto exatamente como estava. É o mesmo `PainelLateral`
// do resto do sistema, então no celular ele já nasce folha arrastável.

import { useState } from "react";
import { Icon } from "../../Icon";
import { Acoes, Botao, Esp, PainelLateral } from "../../ui/controles";
import { Avatar } from "../../ui/Avatar";
import { MeuPontoClient } from "../../meu-ponto/MeuPontoClient";
import { PessoaModal } from "../PontoPanel";
import { DiaDoPonto } from "./DiaDoPonto";
import { BlocoDeCompensacoes } from "../../ui/compensacao";
import type { PontoPessoa, StatusPessoa } from "@/lib/ponto";

/** Qual batida vem AGORA pra essa pessoa. Mora aqui porque o painel e a gaveta
 *  têm que dizer a mesma coisa — dois rótulos calculados em lugares diferentes
 *  é como a lista acaba oferecendo "saída" e a gaveta "entrada" pra mesma pessoa. */
export function rotuloBatida(p: StatusPessoa): string {
  return p.batidas === 0 ? "Bater entrada" : p.situacao === "almoco" ? "Bater retorno" : "Bater saída";
}

export interface PessoaAlvo {
  id: string;
  nome: string;
  fotoUrl: string | null;
  /** Horário do turno, quando conhecido ("08:00"–"17:00"). */
  entradaPrevista?: string | null;
  saidaPrevista?: string | null;
  /** Linha de contexto do momento (ex.: "Presente desde 08:03"). */
  situacao?: React.ReactNode;
  /** Dia em que a gaveta abre (tocado no calendário do painel). Padrão: hoje. */
  diaInicial?: string;
}

export function PessoaDrawer({ pessoa, cadastro, status, podeGerir, onBater, onRemover, onArquivar, onFechar, onMudou }: {
  pessoa: PessoaAlvo;
  /** Cadastro completo, quando a tela que abriu já tem — habilita "Editar cadastro". */
  cadastro?: PontoPessoa | null;
  /** Situação de HOJE, viva (vem da lista que faz poll) — é ela que decide se a
   *  próxima batida é entrada, retorno ou saída. */
  status?: StatusPessoa | null;
  podeGerir: boolean;
  /** Registrar a batida de agora. Sem isso o botão não aparece. */
  onBater?: (p: StatusPessoa) => Promise<void> | void;
  /** Tirar a pessoa do ponto. Fica AQUI e não na lista: apagar o cadastro (e as
   *  batidas junto) não pode ficar a um dedo de distância de "abrir". */
  onRemover?: () => void;
  onArquivar?: () => void;
  onFechar: () => void;
  /** Chamado quando algo mudou lá dentro (a lista de fora precisa recarregar). */
  onMudou: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [diaEmTela, setDiaEmTela] = useState<string | undefined>(pessoa.diaInicial);
  const [batendo, setBatendo] = useState(false);
  // Bater ponto muda o dia da pessoa, e o banco de horas embaixo é uma tela com
  // estado próprio: sem remontar, a batida acontecia e o calendário continuava
  // mostrando o dia de antes. O contador troca a `key` e a tela nasce de novo.
  const [geracao, setGeracao] = useState(0);
  const turno = pessoa.entradaPrevista && pessoa.saidaPrevista ? `${pessoa.entradaPrevista}–${pessoa.saidaPrevista}` : null;
  // Quem já saiu não tem próxima batida — oferecer "bater saída" de novo abriria
  // um par novo e inventaria uma segunda jornada no mesmo dia.
  const podeBater = podeGerir && !!onBater && !!status && status.situacao !== "saiu";

  async function bater() {
    if (!status || !onBater || batendo) return;
    setBatendo(true);
    try { await onBater(status); setGeracao((g) => g + 1); }
    finally { setBatendo(false); }
  }

  return (
    <>
      <PainelLateral
        titulo={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Avatar url={pessoa.fotoUrl} nome={pessoa.nome} size={32} formato="redondo" />
            {/* Sem `nowrap` o nome longo é CORTADO seco no fim da linha em vez
                de reticenciar — parece texto quebrado, não texto encurtado. */}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pessoa.nome}</span>
          </span>
        }
        subtitulo={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {pessoa.situacao}
            {turno && <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="clock" size={13} color="var(--text-dim)" /> {turno}</span>}
          </span>
        }
        onFechar={onFechar}
        // CENTRADO: pop-up no meio da tela, não gaveta encostada na direita.
        // O painel da pessoa já ocupa a coluna da direita, e abrir "Gerenciar
        // ponto e horas" ali fazia a gaveta nascer POR CIMA do próprio painel
        // que a chamou — a pessoa perdia de vista o que estava olhando. No
        // meio, o calendário do mês também ganha as duas margens.
        centrado
        largura={1180}
        rodape={
          <Acoes>
            {onRemover && <Botao variante="perigo" icone="trash" onClick={onRemover}>Remover do ponto</Botao>}
            {/* Arquivar fica ao lado do Remover porque é a versão que NÃO
                apaga o histórico — e é a que quase todo mundo quer. */}
            {onArquivar && <Botao icone="archive" onClick={onArquivar}>{cadastro?.ativo === false ? "Voltar pro ponto" : "Arquivar"}</Botao>}
            <Esp />
            <Botao variante="sutil" onClick={onFechar}>Fechar</Botao>
            {podeGerir && cadastro && (
              <Botao variante={podeBater ? "sutil" : "secundario"} icone="pencil" onClick={() => setEditando(true)}>Editar cadastro</Botao>
            )}
            {/* Último no JSX = ação principal, a ordem que o `Acoes` espera (no
                celular o `column-reverse` sobe o que confirma e deixa embaixo,
                colado no polegar, o que só fecha). Antes, bater a batida de
                alguém era fechar a gaveta, achar a linha na lista e bater lá —
                sendo que a gaveta já sabia de quem estava falando. */}
            {podeBater && (
              <Botao variante="primario" icone="clock" carregando={batendo} onClick={bater}>{rotuloBatida(status!)}</Botao>
            )}
          </Acoes>
        }
      >
        {/* ── O dia, editável ────────────────────────────────────────────
            Primeiro bloco do pop-up porque é o que se vem fazer: ver as
            batidas de um dia e arrumar a hora errada. O "Espelho" existia só
            pra isso, com o custo de escolher a pessoa de novo num filtro. */}
        {podeGerir && (
          <div style={{ marginBottom: 16 }}>
            <DiaDoPonto pessoaId={pessoa.id} cadastro={cadastro} dia={diaEmTela} onDia={setDiaEmTela} onMudou={() => setGeracao((g) => g + 1)} />
          </div>
        )}

        {/* O banco de horas da pessoa inteiro — saldo, prazos, calendário do mês,
            justificar dia, marcar feriado, pagar horas. É a MESMA tela do
            "Banco de horas", montada aqui em vez de duplicada: uma regra só,
            um lugar só pra consertar. */}
        <MeuPontoClient key={geracao} isAdmin nome="" podeLancar={podeGerir} pessoaFixa={pessoa.id} embutido />

        {/* ── Feriado trocado, folga compensatória, compensação de jornada ──
            Fica AQUI, e não só no RH, porque é olhando o mês da pessoa que se
            descobre que a terça sem batida era a folga do feriado da segunda.
            Precisa do colaborador vinculado: férias e compensação são do
            `profiles.id`, e a pessoa do Ponto sozinha não diz de quem é. */}
        {cadastro?.colaboradorId && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <BlocoDeCompensacoes
              employeeId={cadastro.colaboradorId}
              nome={pessoa.nome}
              aoMudar={() => setGeracao((g) => g + 1)}
            />
          </div>
        )}
      </PainelLateral>

      {editando && cadastro && (
        <PessoaModal pessoa={cadastro} onClose={() => setEditando(false)} onSaved={() => { setEditando(false); onMudou(); }} />
      )}
    </>
  );
}
