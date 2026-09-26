"use client";

// ─────────────────────────────────────────────────────────────────────────────
// BIPAR — dar baixa em unidades etiquetadas, em lote.
//
// Esta tela não é usada sentado. É usada EM PÉ, no galpão, com uma mão só, com
// a outra segurando a chapa — e dezenas de vezes seguidas. Todas as outras
// telas do módulo são de escritório; esta é a única em que meio segundo de
// atraso ou uma leitura ambígua faz a pessoa parar de usar. E se ninguém bipa,
// o estoque etiquetado inteiro vira número mentiroso.
//
// Por isso o fluxo é: BIPA MUITO → escolhe o motivo UMA vez → confirma o lote.
// Motivo por item seria um toque por chapa; ninguém faria isso duas vezes.
//
// Três decisões que vieram desse contexto:
//
//  1. **Resposta no `pointerdown`.** Esperar o toque SUBIR pra reagir dá a
//     sensação de tela morta. Tirar da fila, escolher motivo e abrir a câmera
//     acontecem na descida do dedo. O `onClick` companheiro só existe pro
//     teclado (`detail === 0`) — sem ele o Enter/Espaço não ativaria nada.
//     A ÚNICA exceção é o "Dar baixa": escrever no banco 40 unidades por um
//     roçar de dedo é caro demais pra ganhar 80ms.
//
//  2. **Nada bloqueia a entrada.** Quem bipa rápido bipa mais rápido que
//     qualquer transição — nenhum `disabled`, véu ou espera durante a animação
//     de entrada do item.
//
//  3. **A pilha entra criticamente amortecida** (`damping 1.0`, resposta
//     ~0.3s): nada foi *arremessado* aqui, então quique é só ruído. Só
//     `transform`/`opacity`, e o keyframe termina em `transform: none` com
//     `fill-mode: backwards` — um transform identidade residual vira bloco de
//     contenção de `position: fixed` e já ancorou modal na coluna de conteúdo
//     neste repositório mais de uma vez (ver Shell.tsx e globals.css).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { Botao, BotaoIcone, Campo } from "../ui/controles";
import { Alerta } from "../ui/Alerta";
import { GlassSelect } from "../GlassPicker";
import { LeitorCodigo } from "../ui/LeitorCodigo";
import { MOTIVOS_BAIXA, partirCodigo } from "@/lib/estoque-unidades";
import { MAX_POR_AJUSTE } from "@/lib/estoque-ajuste-por-qr";
import { fraseDoCodigoDesconhecido, type CodigoClassificado } from "@/lib/estoque-codigo-lido";
import { carregarAtividadesParaBipar, rotuloDaAtividade, type AtividadeParaBipar } from "./atividades-para-bipar";
import { EscolhaDeLugar } from "./EscolhaDeLugar";
import type { LugarComSaldo } from "@/lib/estoque-transferencia";

type Situacao = "baixada" | "desconhecida" | "ja_baixada";

interface Resultado { codigo: string; situacao: Situacao; item: string | null; pecas?: number }

/** O que o servidor sabe de uma etiqueta ANTES de ela ser baixada. */
interface Etiqueta { codigo: string; item: string | null; pecas: number; status: string }

/**
 * O que o código é. `undefined` = o servidor ainda não respondeu.
 *
 * "produto" é a etiqueta de código fixo — a de 263 dos 274 itens do catálogo.
 * Ela não tem etiqueta de unidade nenhuma no banco, e era exatamente por isso
 * que a tela dizia "Não existe no sistema" para quase tudo que se bipa.
 */
type TipoLido = "unidade" | "produto" | "nenhum";

interface Lido {
  codigo: string;
  /** SKU quando o código tem série; o próprio código quando é etiqueta de produto. */
  sku: string;
  /** Série da etiqueta de unidade. `0` em etiqueta de produto. */
  seq: number;
  tipo?: TipoLido;
  /**
   * Peças desta LINHA quando o código é de produto — rebipar soma, como na
   * entrada por leitura. Na unidade quem manda é `pecas` (a caixa é indivisível).
   */
  quantidade?: number;
  /** Saldo do item no momento da leitura — para avisar antes de deixar negativo. */
  saldo?: number | null;
  /** "un", "ch", "kg" — a régua do item, para o contador não dizer "un" sempre. */
  unidadeItem?: string | null;
  /** Preenchido DEPOIS do PATCH, só em quem não passou. */
  situacao?: Situacao;
  item?: string | null;
  /**
   * Peças que ESTA etiqueta vale, perguntadas ao servidor logo depois da
   * leitura. `undefined` = ainda não voltou; `0` = o servidor respondeu e não
   * conhece este código (não pergunta de novo).
   */
  pecas?: number;
  /** Já não estava em estoque quando foi bipada — avisa ANTES de confirmar. */
  jaFora?: boolean;
  /** O servidor pediu "de qual lugar saiu?" — o item mora em 2+ lugares. A
   *  linha fica na fila com a pergunta até alguém tocar num lugar. */
  precisaLugar?: { frase: string; lugares: LugarComSaldo[] };
}

// O PATCH recusa lote acima de 200 (`lote_grande`). Em vez de barrar quem bipou
// 240 chapas — que teria de apagar 40 na mão e bipá-las de novo depois — a tela
// FATIA em chamadas de 200. Sequencial, nunca em paralelo: duas varreduras
// simultâneas de 200 códigos no mesmo índice é exatamente o que o teto existe
// pra evitar. Se uma fatia falhar, as anteriores JÁ gravaram: o resumo mostra
// quantas passaram e o resto continua na fila, nunca some calado.
const TETO_POR_CHAMADA = 200;

const TEXTO_SITUACAO: Record<Situacao, string> = {
  baixada: "Baixada",
  desconhecida: "Não existe no sistema",
  ja_baixada: "Já tinha saído do estoque",
};

/**
 * Ação que acontece na DESCIDA do dedo.
 *
 * `pointerdown` cobre toque, caneta e mouse. O `onClick` de par só dispara
 * quando `detail === 0`, que é o clique sintético do teclado (Enter/Espaço) —
 * assim a ação não roda duas vezes no dedo e continua existindo no teclado.
 */
function acaoJa(fn: () => void) {
  return {
    // `> 0` e não `=== 0`: botão do meio (1) e direito (2) ficam de fora, mas
    // um evento sintético sem `button` (jsdom, teclado virtual antigo) ainda
    // passa. Exigir a igualdade transformaria "não tenho essa propriedade" em
    // "botão não funciona".
    onPointerDown: (e: React.PointerEvent) => { if (!(e.button > 0)) fn(); },
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) fn(); },
  };
}

function mensagemDeErro(j: Record<string, unknown>, status: number): string {
  const e = String(j?.error ?? "");
  if (e === "schema_desatualizado") return String(j?.detalhe ?? "O banco ainda não tem a tabela das unidades.");
  if (e === "forbidden" || status === 403) return "Você não tem permissão para dar baixa em unidades.";
  if (e === "motivo_invalido") return "Esse motivo de baixa não existe mais. Escolha outro.";
  if (e === "sem_codigos") return "Não havia nenhum código para baixar.";
  if (e === "lote_grande") return "O servidor recusou o tamanho do lote.";
  return "Não deu para gravar a baixa agora. Tente de novo.";
}

/**
 * @param atividade Amarra TODA baixa desta tela a uma atividade e esconde o
 *   seletor — é o modo usado de dentro do quadro de Atividades, onde a
 *   atividade já é a razão de estar bipando. Sem ela a tela é a de sempre:
 *   baixa avulsa por padrão, com o vínculo à mão de quem quiser.
 */
export function BiparClient({ atividade, motivoInicial, compacto, onBaixou }: {
  atividade?: AtividadeParaBipar;
  motivoInicial?: string;
  /** Dentro de um painel: sem rodapé grudado na tela nem barra de abas embaixo. */
  compacto?: boolean;
  /** Alguma etiqueta saiu do estoque agora — quem embute recarrega o que mostra. */
  onBaixou?: () => void;
} = {}) {
  const [pilha, setPilha] = useState<Lido[]>([]);
  const [motivo, setMotivo] = useState(motivoInicial ?? "");
  const [obs, setObs] = useState("");
  const [digitado, setDigitado] = useState("");
  const [camera, setCamera] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [recusa, setRecusa] = useState<{ codigo: string; texto: string } | null>(null);
  const [repetido, setRepetido] = useState<string | null>(null);
  const [resumo, setResumo] = useState<{ ok: number; pecas: number; ruins: Resultado[] } | null>(null);
  const [erro, setErro] = useState("");
  const [confirmandoLimpar, setConfirmandoLimpar] = useState(false);

  // ── Vínculo com a atividade ────────────────────────────────────────────────
  // Fixo quando a tela é aberta de dentro de uma atividade; escolhido aqui
  // quando não. "Nenhuma" continua sendo o padrão: metade das baixas do galpão
  // (perda, expedição, devolução) não tem atividade nenhuma no meio.
  const [vinculo, setVinculo] = useState<AtividadeParaBipar | null>(atividade ?? null);
  const [opcoes, setOpcoes] = useState<AtividadeParaBipar[] | null>(null);
  const [carregandoAtividades, setCarregandoAtividades] = useState(false);
  useEffect(() => { if (atividade) setVinculo(atividade); }, [atividade]);

  // Quem já está na fila. Vive num ref (e não derivado da `pilha`) porque a
  // decisão "é repetido?" precisa ser tomada DENTRO do mesmo evento da leitura,
  // antes do próximo render — e porque efeito colateral (vibrar) dentro de um
  // updater de estado roda duas vezes no StrictMode.
  const vistos = useRef<Set<string>>(new Set());
  // Códigos cujo tamanho de caixa já foi perguntado ao servidor (com ou sem
  // resposta). Ref, não estado: mudar isto não pode redesenhar a fila.
  const perguntados = useRef<Set<string>>(new Set());
  const campo = useRef<HTMLInputElement | null>(null);
  const relogioRepetido = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (relogioRepetido.current) clearTimeout(relogioRepetido.current); }, []);

  // Leitor de pistola (USB/Bluetooth) é teclado: ele DIGITA o código no campo
  // que estiver focado e manda Enter. Focar sozinho deixa a pistola funcionar
  // sem ninguém tocar em nada. No celular/tablet não: `autofocus` ali abre o
  // teclado virtual e come metade da tela de quem veio usar a CÂMERA.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(pointer: coarse)")?.matches) return;
    campo.current?.focus();
  }, []);

  const adicionar = useCallback((bruto: string) => {
    const codigo = bruto.trim();
    if (!codigo) return;

    /*
     * 1) NADA é recusado aqui pelo formato.
     *
     * Esta era a primeira metade do defeito: a tela exigia o `-000042` no fim e
     * respondia "não é uma etiqueta de unidade". Só que a etiqueta de PRODUTO
     * — a de 263 dos 274 itens — é o SKU puro, e é ela que o galpão bipa o dia
     * inteiro. Quem decide o que o código é agora é o servidor, que olha as
     * duas tabelas; e enquanto ele não responde a linha já está na fila, com o
     * código à vista.
     *
     * O EAN do fornecedor continua sendo recusado — só que com a verdade
     * ("não é de nenhum produto do catálogo") e depois de procurar, não antes.
     */
    const partes = partirCodigo(codigo);

    /*
     * 2) Repetido depende do TIPO.
     *
     * Numa etiqueta de unidade, bipar duas vezes é a mesma peça: engolir é o
     * certo, senão a unidade sairia duas vezes do estoque. Numa etiqueta de
     * produto é o oposto — vinte almofadas têm o MESMO código, e cada bipe é
     * uma peça a mais. Somar é o que a etiqueta de produto pede (é o que a
     * entrada por leitura já faz).
     */
    const jaNaFila = pilha.find((l) => l.codigo === codigo);
    if (jaNaFila) {
      if (jaNaFila.tipo === "produto") {
        navigator.vibrate?.(30);
        setPilha((p) => p.map((l) => (
          l.codigo === codigo ? { ...l, quantidade: Math.min(MAX_POR_AJUSTE, (l.quantidade ?? 1) + 1) } : l
        )));
        return;
      }
      setRepetido(codigo);
      if (relogioRepetido.current) clearTimeout(relogioRepetido.current);
      relogioRepetido.current = setTimeout(() => setRepetido(null), 1800);
      return;
    }

    vistos.current.add(codigo);
    // Vibrar ANTES do setState: é a resposta que a pessoa sente no mesmo quadro
    // em que o cartão entra. Leitura que não "aterrissa" faz bipar de novo.
    navigator.vibrate?.(30);
    setRecusa(null);
    setResumo(null);
    setPilha((p) => [{ codigo, sku: partes?.sku ?? codigo, seq: partes?.seq ?? 0, quantidade: 1 }, ...p]);
  }, [pilha]);

  const remover = useCallback((codigo: string) => {
    vistos.current.delete(codigo);
    perguntados.current.delete(codigo);
    setPilha((p) => p.filter((l) => l.codigo !== codigo));
  }, []);

  const limpar = useCallback(() => {
    // Dois toques. Apagar 40 leituras sem querer custa a caminhada inteira de
    // volta pelo galpão.
    if (!confirmandoLimpar) {
      setConfirmandoLimpar(true);
      setTimeout(() => setConfirmandoLimpar(false), 3000);
      return;
    }
    vistos.current.clear();
    perguntados.current.clear();
    setPilha([]);
    setResumo(null);
    setConfirmandoLimpar(false);
  }, [confirmandoLimpar]);

  // ── Quanto vale cada etiqueta ──────────────────────────────────────────────
  //
  // A etiqueta É a caixa: uma caixa lacrada de 50 folhas é UMA etiqueta valendo
  // 50, e bipar tira as 50 de uma vez. A tela precisa dizer isso ANTES de
  // confirmar — "1 etiqueta na fila" pra uma caixa de 50 faz a pessoa achar que
  // tirou uma folha, e ela bipa mais 49.
  //
  // O código não carrega o tamanho, então quem sabe é o servidor. Em LOTE e com
  // um respiro de 180ms: quem bipa 40 caixas seguidas faz uma consulta, não 40.
  // O `perguntados` garante que nenhum código é perguntado duas vezes — sem ele
  // um código que o servidor não conhece faria o efeito pedir de novo pra
  // sempre. Falhar aqui não atrapalha nada: a fila e a baixa funcionam sem o
  // número, ele só não aparece.
  useEffect(() => {
    const faltando = pilha.filter((l) => l.tipo === undefined && !perguntados.current.has(l.codigo)).map((l) => l.codigo);
    if (!faltando.length) return;
    let vivo = true;
    const t = setTimeout(async () => {
      for (const c of faltando) perguntados.current.add(c);
      let achadas: CodigoClassificado[] = [];
      try {
        const r = await fetch(`/api/estoque/unidades?codigos=${encodeURIComponent(faltando.join(","))}`, { cache: "no-store" });
        if (!r.ok) return;
        achadas = (((await r.json()) as { classificacao?: CodigoClassificado[] }).classificacao ?? []);
      } catch { return; }
      if (!vivo) return;
      const mapa = new Map(achadas.map((e) => [e.codigo, e]));
      setPilha((p) => p.map((l) => {
        const e = mapa.get(l.codigo);
        if (!e || l.tipo !== undefined) return l;
        return {
          ...l,
          tipo: e.tipo,
          item: e.item,
          // A caixa é indivisível; o produto conta pela quantidade da linha.
          pecas: e.tipo === "unidade" ? e.pecas : undefined,
          saldo: e.saldo,
          unidadeItem: e.unidade,
          jaFora: e.tipo === "unidade" && e.status !== "em_estoque",
        };
      }));
    }, 180);
    return () => { vivo = false; clearTimeout(t); };
  }, [pilha]);

  // Peças na fila. Etiqueta sem resposta conta 1 — que é o que ela valia antes
  // da caixa existir; ler ausência como zero diria "0 peças" com a fila cheia.
  const totalPecas = useMemo(
    () => pilha.reduce((s, l) => s + (l.tipo === "produto" ? (l.quantidade ?? 1) : (l.pecas ?? 1)), 0),
    [pilha],
  );
  /** As linhas que vão sair por quantidade (etiqueta de produto). */
  const daQuantidade = useMemo(() => pilha.filter((l) => l.tipo === "produto"), [pilha]);
  /** As que vão sair baixando a etiqueta. Sem tipo ainda = tratada como unidade. */
  const daEtiqueta = useMemo(() => pilha.filter((l) => l.tipo !== "produto" && l.tipo !== "nenhum"), [pilha]);
  // O número de peças só aparece quando diz algo que o número de etiquetas não
  // diz — ou seja, quando há caixa na fila.
  const temCaixa = useMemo(() => pilha.some((l) => (l.pecas ?? 1) > 1 || (l.quantidade ?? 1) > 1), [pilha]);

  async function abrirSeletorDeAtividade() {
    if (opcoes || carregandoAtividades) return;
    setCarregandoAtividades(true);
    try {
      setOpcoes(await carregarAtividadesParaBipar());
    } catch {
      setOpcoes([]);
      setErro("Não deu para carregar as atividades agora. A baixa avulsa continua funcionando.");
    } finally { setCarregandoAtividades(false); }
  }

  function escolherAtividade(id: string) {
    const a = (opcoes ?? []).find((x) => x.id === id) ?? null;
    setVinculo(a);
    // Bipar material DE uma atividade é consumo na produção. Fica escolhido, mas
    // continua trocável: material perdido durante aquele trabalho também sai
    // por ali, e a perda tem que ficar amarrada à mesma atividade.
    if (a && !motivo) setMotivo("consumido");
  }

  async function confirmar() {
    if (!pilha.length || !motivo || enviando) return;
    setEnviando(true);
    setErro("");
    setResumo(null);

    /*
     * DUAS SAÍDAS, UM BOTÃO.
     *
     * A etiqueta de unidade é baixada (a etiqueta some do estoque); a etiqueta
     * de produto diminui o SALDO do item. São rotas diferentes porque são
     * escritas diferentes no banco — mas isso é assunto do sistema, não de quem
     * está com a peça na mão: a pessoa bipou o que estava colado e mandou sair.
     *
     * A ordem importa: as etiquetas primeiro, em lote, porque é a chamada que
     * pode falhar inteira (teto de lote, motivo inválido). As quantidades vão
     * uma a uma logo depois — cada código é um item diferente.
     */
    const codigos = daEtiqueta.map((l) => l.codigo);
    const lotes: string[][] = [];
    for (let i = 0; i < codigos.length; i += TETO_POR_CHAMADA) lotes.push(codigos.slice(i, i + TETO_POR_CHAMADA));

    const feitos: Resultado[] = [];
    let falha = "";
    for (const lote of lotes) {
      try {
        const r = await fetch("/api/estoque/unidades", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigos: lote, motivo, obs: obs.trim() || undefined, atividadeId: vinculo?.id }),
        });
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        if (!r.ok) { falha = mensagemDeErro(j, r.status); break; }
        feitos.push(...((j.resultado ?? []) as Resultado[]));
      } catch {
        falha = "Sem resposta do servidor.";
        break;
      }
    }

    /*
     * As etiquetas de PRODUTO: uma chamada por código, com a quantidade da
     * linha. `sentido: "saida"` — é a mesma rota do ajuste pelo QR, e a
     * permissão dela para SAÍDA aceita `estoque:bipar` (ver `podeBiparSaida`),
     * que é a chave de quem opera esta tela.
     */
    const pedirLugar = new Map<string, { frase: string; lugares: LugarComSaldo[] }>();
    for (const linha of daQuantidade) {
      try {
        const r = await fetch("/api/estoque/ajuste-qr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo: linha.codigo,
            sentido: "saida",
            quantidade: linha.quantidade ?? 1,
            motivo,
            obs: obs.trim() || undefined,
          }),
        });
        const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        // Item em mais de um lugar: não é falha, é a pergunta "de qual saiu?".
        // A linha fica na fila com os lugares pra tocar.
        if (!r.ok && d.error === "precisa_lugar") {
          pedirLugar.set(linha.codigo, {
            frase: String(d.detalhe ?? "Diga de qual lugar saiu."),
            lugares: (d.lugares ?? []) as LugarComSaldo[],
          });
          continue;
        }
        feitos.push(r.ok
          ? { codigo: linha.codigo, situacao: "baixada", item: String(d.item ?? linha.item ?? ""), pecas: linha.quantidade ?? 1 }
          : { codigo: linha.codigo, situacao: "desconhecida", item: linha.item ?? null, pecas: 0 });
        // A frase do servidor é mais precisa que qualquer resumo daqui: saldo
        // insuficiente, item serializado, permissão. Vale a primeira que vier.
        if (!r.ok && !falha) falha = String(d.detalhe ?? "Não deu para tirar do estoque.");
      } catch {
        if (!falha) falha = "Sem resposta do servidor.";
      }
    }

    const ok = feitos.filter((r) => r.situacao === "baixada");
    const ruins = feitos.filter((r) => r.situacao !== "baixada");
    const baixados = new Set(ok.map((r) => r.codigo));
    const porCodigo = new Map(ruins.map((r) => [r.codigo, r]));
    for (const c of baixados) { vistos.current.delete(c); perguntados.current.delete(c); }

    // Quem passou sai da fila. Quem NÃO passou fica — marcado, com o motivo na
    // linha. Quem bipou 40 chapas precisa ver exatamente quais 2 falharam, e
    // uma lista que se esvazia inteira esconde justamente isso.
    setPilha((p) => p
      .filter((l) => !baixados.has(l.codigo))
      .map((l) => {
        const r = porCodigo.get(l.codigo);
        if (r) return { ...l, situacao: r.situacao, item: r.item };
        const pergunta = pedirLugar.get(l.codigo);
        return pergunta ? { ...l, precisaLugar: pergunta } : l;
      }));

    if (feitos.length) {
      // Peças, não etiquetas: 3 caixas de 50 são 150 folhas fora da prateleira.
      // O servidor é quem sabe (a etiqueta pode ter mudado desde a leitura), e
      // sem `pecas` na resposta cada uma vale 1, como antes da caixa existir.
      setResumo({ ok: ok.length, pecas: ok.reduce((s, r) => s + (r.pecas ?? 1), 0), ruins });
      if (ok.length) {
        navigator.vibrate?.([18, 45, 18]);
        setObs(""); // a observação é DAQUELE lote; o motivo costuma se repetir e fica.
        onBaixou?.();
      }
    }
    setErro(falha
      ? feitos.length
        ? `${falha} Só ${ok.length} de ${codigos.length} deram baixa — o resto continua na fila.`
        : falha
      : "");
    setEnviando(false);
  }

  /** A resposta de "de qual lugar saiu?": refaz SÓ aquele código, com o lugar. */
  async function responderLugarDaLinha(linha: Lido, localId: string) {
    try {
      const r = await fetch("/api/estoque/ajuste-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: linha.codigo, sentido: "saida", quantidade: linha.quantidade ?? 1,
          motivo, obs: obs.trim() || undefined, localId,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (r.ok) {
        const pecas = linha.quantidade ?? 1;
        setPilha((p) => p.filter((x) => x.codigo !== linha.codigo));
        setResumo((v) => v
          ? { ...v, ok: v.ok + 1, pecas: v.pecas + pecas }
          : { ok: 1, pecas, ruins: [] });
        navigator.vibrate?.([18, 45, 18]);
        setErro("");
        onBaixou?.();
        return;
      }
      setPilha((p) => p.map((x) => x.codigo === linha.codigo
        ? { ...x, precisaLugar: undefined, situacao: "desconhecida" } : x));
      setErro(String(d.detalhe ?? "Não deu para tirar do estoque."));
    } catch {
      setErro("Sem resposta do servidor.");
    }
  }

  const motivoEscolhido = MOTIVOS_BAIXA.find((m) => m.key === motivo);

  return (
    <div className="bip-wrap">
      <style>{CSS}</style>

      <div className="bip-topo">
        <div className="bip-conta">
          <b>{pilha.length}</b>
          <span>
            {pilha.length === 1 ? "etiqueta na fila" : "etiquetas na fila"}
            {/* A etiqueta é a CAIXA. Sem este número, bipar uma caixa lacrada
                de 50 folhas parece ter tirado uma folha. */}
            {temCaixa && <b className="bip-pecas">{totalPecas} peças</b>}
          </span>
        </div>
        <Botao variante="primario" tamanho="lg" icone="camera" {...acaoJa(() => setCamera(true))}>
          Ler com a câmera
        </Botao>
      </div>

      {/* ── De qual trabalho é este material ─────────────────────────────────
          O ciclo do galpão começa aqui: pega a caixa lacrada, BIPA, e só então
          rompe o lacre e monta. Amarrar a baixa à atividade é o que liga "esta
          caixa de folhas virou aquelas alavancas" — e é o que faz a perda de
          uma reprovação se contabilizar sozinha.

          Continua OPCIONAL, e "nenhuma" é o padrão: o galpão também dá baixa
          sem atividade nenhuma no meio (perda, expedição, devolução). */}
      {atividade ? (
        // Embutido, quem diz de qual atividade se trata é o cabeçalho do painel
        // — repetir aqui empurraria o campo de leitura pra fora da primeira
        // dobra do celular só pra dizer o que a pessoa acabou de ler.
        compacto ? null : (
          <div className="bip-ativ" data-fixa="1">
            <Icon name="checklist" size={17} color="var(--primary-texto)" />
            <div style={{ minWidth: 0 }}>
              <div className="bip-ativ-nome">{rotuloDaAtividade(atividade)}</div>
              <div className="bip-sub">Tudo que você bipar aqui sai do estoque por conta desta atividade.</div>
            </div>
          </div>
        )
      ) : vinculo || opcoes ? (
        <div className="bip-ativ">
          <Icon name="checklist" size={17} color={vinculo ? "var(--primary-texto)" : "var(--text-dim)"} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <Campo
              label="Atividade que vai consumir"
              dica={vinculo
                ? "A baixa fica amarrada a ela — quem conferir depois vê o que entrou."
                : "Deixe em nenhuma para baixa avulsa (perda, expedição, devolução)."}
            >
              {(id) => (
                <GlassSelect
                  id={id}
                  value={vinculo?.id ?? ""}
                  onChange={escolherAtividade}
                  placeholder="Nenhuma — baixa avulsa"
                  options={[
                    { value: "", label: "Nenhuma — baixa avulsa" },
                    ...(opcoes ?? (vinculo ? [vinculo] : [])).map((a) => ({ value: a.id, label: rotuloDaAtividade(a) })),
                  ]}
                />
              )}
            </Campo>
          </div>
        </div>
      ) : (
        <Botao
          tamanho="lg"
          icone="checklist"
          carregando={carregandoAtividades}
          {...acaoJa(abrirSeletorDeAtividade)}
        >
          Vincular a uma atividade
        </Botao>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          adicionar(digitado);
          setDigitado("");
          campo.current?.focus();
        }}
      >
        <Campo label="Código da etiqueta" dica="O leitor de pistola escreve aqui sozinho — Enter registra.">
          {(id) => (
            <input
              id={id}
              ref={campo}
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              placeholder="MDF6MM-BR-18-000042"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
            />
          )}
        </Campo>
      </form>

      {recusa && (
        <Alerta tom="perigo" titulo={<span className="bip-cod">{recusa.codigo}</span>} aoFechar={() => setRecusa(null)}>
          {recusa.texto}
        </Alerta>
      )}

      {resumo && (
        <Alerta
          tom={resumo.ruins.length ? "atencao" : "ok"}
          role="status"
          aoFechar={() => setResumo(null)}
          titulo={<>
            {resumo.ok} {resumo.ok === 1 ? "etiqueta baixada" : "etiquetas baixadas"}
            {resumo.pecas > resumo.ok ? ` · ${resumo.pecas} peças` : ""}
            {motivoEscolhido ? ` — ${motivoEscolhido.label.toLowerCase()}` : ""}
            {vinculo ? ` · ${vinculo.tarefa}` : ""}
          </>}
        >
          {resumo.ruins.length > 0 && (
            <>
              <div>
                {resumo.ruins.length === 1 ? "1 etiqueta não deu baixa:" : `${resumo.ruins.length} etiquetas não deram baixa:`}
              </div>
              <ul className="bip-falhas">
                {resumo.ruins.map((r) => (
                  <li key={r.codigo}>
                    <span className="bip-cod">{r.codigo}</span>
                    <span className="bip-sub">{TEXTO_SITUACAO[r.situacao]}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Alerta>
      )}

      {erro && <Alerta tom="perigo">{erro}</Alerta>}

      {pilha.length > 0 && (
        <div className="bip-cab">
          <span className="bip-sub">Mais recente primeiro</span>
          {/* `lg` (44px) como todo o resto: 32px é alvo de mouse, e esta tela é
              usada de pé, com uma mão. O toque errado já está coberto pelos dois
              passos ("Apagar as N?"), então crescer aqui não custa nada. */}
          <Botao variante="perigo" tamanho="lg" icone="trash" {...acaoJa(limpar)}>
            {confirmandoLimpar ? `Apagar as ${pilha.length}?` : "Limpar fila"}
          </Botao>
        </div>
      )}

      {pilha.length === 0 ? (
        <div className="bip-vazio">
          <Icon name="barcode" size={30} color="var(--text-dim)" />
          <p>
            Bipe as etiquetas, escolha o motivo uma vez e confirme o lote inteiro.
            Nada sai do estoque antes de você confirmar — e a caixa sai inteira:
            uma etiqueta de 50 tira as 50.
          </p>
        </div>
      ) : (
        <ul className="bip-pilha">
          {pilha.map((l) => (
            <li
              key={l.codigo}
              className="bip-lin"
              data-ruim={l.situacao || l.jaFora || l.tipo === "nenhum" ? "1" : undefined}
            >
              <div style={{ minWidth: 0 }}>
                <div className="bip-cod">
                  {l.codigo}
                  {/* A caixa inteira sai. Aqui, colado no código, porque é o
                      momento em que a pessoa ainda pode tirar da fila. */}
                  {(l.pecas ?? 1) > 1 && <span className="bip-caixa">Caixa · {l.pecas} un</span>}
                  {/* Etiqueta de produto: o contador do que já foi bipado deste
                      mesmo código. É o número que vai sair do saldo, e ele
                      cresce a cada bipe — sem isto, vinte leituras iguais
                      pareceriam uma. */}
                  {l.tipo === "produto" && (
                    <span className="bip-caixa">{l.quantidade ?? 1} {l.unidadeItem ?? "un"}</span>
                  )}
                </div>
                <div className="bip-sub">
                  {l.tipo === "nenhum"
                    ? fraseDoCodigoDesconhecido(l.codigo)
                    : l.situacao
                      ? TEXTO_SITUACAO[l.situacao]
                      : l.jaFora
                        ? "Esta etiqueta já saiu do estoque"
                        : l.item
                          ? l.tipo === "produto"
                            // O saldo entra na linha porque é a informação que
                            // decide se dá pra tirar: bipar 5 de um item com 3
                            // é o erro que o servidor recusa lá na frente.
                            ? `${l.item}${l.saldo != null ? ` · tem ${l.saldo}` : ""}`
                            : l.item
                          : l.seq > 0
                            ? `${l.sku} · peça ${l.seq}`
                            : "procurando…"}
                  {repetido === l.codigo && <span className="bip-ja">já na fila</span>}
                </div>
                {l.precisaLugar && (
                  <div style={{ marginTop: 8 }}>
                    <EscolhaDeLugar
                      frase={l.precisaLugar.frase}
                      lugares={l.precisaLugar.lugares}
                      onEscolher={(localId) => { void responderLugarDaLinha(l, localId); }}
                    />
                  </div>
                )}
              </div>
              <BotaoIcone
                icone="x"
                titulo={`Tirar ${l.codigo} da fila`}
                tamanho="lg"
                {...acaoJa(() => remover(l.codigo))}
              />
            </li>
          ))}
        </ul>
      )}

      <Campo label="Observação do lote (opcional)" dica="Vale para todas as etiquetas desta baixa.">
        {(id) => (
          <input
            id={id}
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: pedido 1842, corte da manhã"
            maxLength={180}
          />
        )}
      </Campo>

      {/* Rodapé preso embaixo: o motivo e o confirmar têm que estar debaixo do
          polegar, não no alto da tela. `bottom` desconta a barra de abas do
          celular — grudar em 0 põe o botão principal ATRÁS dela. */}
      <div className="bip-pe" data-compacto={compacto ? "1" : undefined}>
        <div className="tab-strip bip-motivos" role="radiogroup" aria-label="Motivo da baixa">
          {MOTIVOS_BAIXA.map((m) => (
            <Botao
              key={m.key}
              tamanho="lg"
              icone={m.icon}
              variante={motivo === m.key ? "primario" : "secundario"}
              role="radio"
              aria-checked={motivo === m.key}
              {...acaoJa(() => setMotivo(m.key))}
            >
              {m.label}
            </Botao>
          ))}
        </div>
        {/* O ÚNICO controle que espera o `click`: baixa é escrita no banco e
            não tem desfazer — não pode sair na descida do dedo. */}
        <Botao
          variante="primario"
          tamanho="lg"
          bloco
          icone="check"
          carregando={enviando}
          disabled={!pilha.length || !motivo}
          onClick={confirmar}
        >
          {!pilha.length
            ? "Bipe alguma etiqueta"
            : !motivo
              ? "Escolha o motivo da baixa"
              // O botão diz o que vai SAIR da prateleira, não quantos códigos
              // estão na tela: confirmar 3 etiquetas pode tirar 150 folhas.
              : temCaixa
                ? `Dar baixa em ${pilha.length} · ${totalPecas} peças`
                : `Dar baixa em ${pilha.length}`}
        </Botao>
      </div>

      {camera && (
        <LeitorCodigo
          continuo
          // O título carrega o contador: com a folha da câmera cobrindo a tela,
          // é ele que diz "entrou mais uma" sem fechar nada.
          titulo={`Bipar — ${pilha.length} na fila`}
          onLer={adicionar}
          onFechar={() => setCamera(false)}
        />
      )}
    </div>
  );
}

const CSS = `
/* ── minmax(0, 1fr): a coluna não pode ser esticada por um filho ────────────
   Era só \`display: grid\`, e um grid de coluna única dá \`min-width: auto\` aos
   filhos: a coluna cresce até caber o item mais largo. Acima de 900px a
   \`.tab-strip\` da fundação PARA de rolar sozinha, então a fileira dos cinco
   motivos passa a medir 896px de min-content — e levava a coluna inteira
   junto. Medido a 1024px, numa coluna de 676px: a faixa do grid nascia com
   918px, TODOS os blocos da tela (contador, "Vincular", campo do código,
   vazio, rodapé) vazavam 242px pra fora e a página ganhava 208px de rolagem
   lateral — a barra lateral do sistema saía da tela junto. Com o \`minmax\`
   nenhum filho estica a coluna; com a quebra dos motivos (regra de 901px
   abaixo) nada precisa esticar. */
.bip-wrap { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }

.bip-topo {
  display: grid; gap: 10px; align-items: center;
  padding: 14px; border-radius: var(--r-md);
  border: 1px solid var(--border); background: var(--surface);
}
/* minmax(min(100%, N)) e não minmax(N): idêntico no computador, colapsa
   sozinho a 320px em vez de estourar a largura. */
@media (min-width: 620px) {
  .bip-topo { grid-template-columns: minmax(min(100%, 200px), 1fr) auto; }
}

.bip-conta { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.bip-conta b { font-size: 30px; font-weight: 800; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.bip-conta span { font-size: 13px; color: var(--text-dim); min-width: 0; }
/* Peças na fila: mesma linha do "N etiquetas", peso próprio. É o número que
   diz o que sai da prateleira. */
.bip-pecas {
  display: inline-block; margin-left: 6px; padding: 1px 8px; border-radius: 999px;
  font-size: 12px; font-weight: 800; letter-spacing: -0.01em;
  font-variant-numeric: tabular-nums;
  color: var(--primary-texto);
  background: color-mix(in srgb, var(--primary) 14%, transparent);
}

/* Faixa "de qual atividade é este material". */
.bip-ativ {
  display: flex; align-items: flex-start; gap: 10px;
  padding: 12px; border-radius: var(--r-md);
  border: 1px solid var(--border); background: var(--surface);
}
.bip-ativ[data-fixa="1"] {
  border-color: color-mix(in srgb, var(--primary) 42%, transparent);
  background: color-mix(in srgb, var(--primary) 8%, var(--surface));
  align-items: center;
}
.bip-ativ-nome { font-size: 13.5px; font-weight: 750; overflow-wrap: anywhere; }

/* "Caixa · 50 un" ao lado do código, na hora da leitura. */
.bip-caixa {
  display: inline-block; margin-left: 7px; padding: 1px 7px; border-radius: 999px;
  font-family: inherit; font-size: 11px; font-weight: 800; letter-spacing: 0;
  color: var(--primary-texto);
  background: color-mix(in srgb, var(--primary) 15%, transparent);
  white-space: nowrap;
}

.bip-cab { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

.bip-cod {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 14px; font-weight: 700; letter-spacing: -0.01em;
  overflow-wrap: anywhere;
}
.bip-sub { font-size: 12px; color: var(--text-dim); line-height: 1.45; overflow-wrap: anywhere; }

.bip-pilha { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }

.bip-lin {
  display: grid; grid-template-columns: minmax(0, 1fr) auto;
  align-items: center; gap: 8px;
  padding: 7px 7px 7px 12px; border-radius: 14px;
  border: 1px solid var(--border); background: var(--surface);
  animation: bipEntra 0.3s var(--ease-entra) backwards;
}
.bip-lin[data-ruim="1"] {
  border-color: color-mix(in srgb, var(--perigo) 48%, transparent);
  background: color-mix(in srgb, var(--perigo) 10%, var(--surface));
}
.bip-lin[data-ruim="1"] .bip-sub { color: var(--perigo); font-weight: 650; }

.bip-ja {
  display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px;
  background: color-mix(in srgb, var(--atencao) 18%, transparent);
  color: var(--atencao); font-weight: 700; font-size: 11px;
}

.bip-falhas { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 5px; }
.bip-falhas li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }

.bip-vazio {
  display: grid; justify-items: center; gap: 10px; text-align: center;
  padding: 26px 16px; border-radius: var(--r-md);
  border: 1px dashed var(--border); background: var(--surface);
}
.bip-vazio p { margin: 0; max-width: 34ch; font-size: 13px; color: var(--text-dim); line-height: 1.5; }

/* Rodapé pregado embaixo. Nenhuma unidade de viewport aqui de propósito: a
   altura é a do conteúdo. O que precisa de cuidado é o encosto de baixo no
   celular — ver a regra de 700px. */
.bip-pe {
  position: sticky; bottom: 0; z-index: 2;
  display: grid; gap: 10px;
  margin: 4px -2px 0; padding: 10px 12px calc(10px + var(--safe-b));
  border-radius: 16px 16px 0 0;
  border: 1px solid var(--border); border-bottom: none;
  background: var(--bg);
  box-shadow: 0 -12px 30px rgba(0, 0, 0, 0.16);
}
.bip-motivos { max-width: 100%; padding: 0; }
/* No celular a fileira ROLA de lado (é a \`.tab-strip\` da fundação, até 900px):
   uma linha só, debaixo do polegar. No computador a fundação não rola mais e
   rolar seria pior — há espaço vertical e mouse. Os cinco motivos quebram em
   duas linhas e ficam todos visíveis, sem esconder nenhum atrás de um arrasto
   que ninguém descobre. */
@media (min-width: 901px) {
  .bip-motivos { flex-wrap: wrap; }
}

/* Dentro de um painel lateral quem rola é o painel, e a barra de abas do
   celular fica ATRÁS dele — descontar a barra ali empurraria o botão principal
   pra dentro do nada. O rodapé do painel já é o encosto de baixo. */
.bip-pe[data-compacto="1"] {
  position: static; box-shadow: none; border: none;
  padding-left: 0; padding-right: 0;
  /* A variável --bg é o fundo da PÁGINA. Dentro de um painel (que é mais
     claro) ela vira uma tarja preta atravessada no meio do conteúdo. */
  background: transparent;
}

@media (max-width: 700px) {
  /* A barra de abas do celular é fixa e cobriria o botão principal. */
  .bip-pe { bottom: calc(var(--tabbar-h) + var(--safe-b)); padding-bottom: 10px; }
  .bip-pe[data-compacto="1"] { bottom: auto; }
  .bip-conta b { font-size: 26px; }
}

/* Criticamente amortecido: nada foi arremessado, então não há momento pra
   devolver — sobe, encosta e para. Termina em "transform: none" (nunca
   "translateY(0)") e com fill-mode "backwards", não "both": transform
   identidade que fica grudado vira bloco de contenção de position:fixed. */
@keyframes bipEntra {
  from { opacity: 0; transform: translateY(-10px); }
  to   { opacity: 1; transform: none; }
}

/* Movimento reduzido não é "sem resposta": a linha ainda precisa AVISAR que
   entrou. Troca o deslocamento por um esmaecido curto. */
@media (prefers-reduced-motion: reduce) {
  .bip-lin { animation: bipSurge 0.16s linear backwards; }
}
@keyframes bipSurge {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`;
