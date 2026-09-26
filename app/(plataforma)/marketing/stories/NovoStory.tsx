"use client";

// ── Adicionar story ──────────────────────────────────────────────────────────
// O caminho que tem de caber em segundos, sem cara de sistema burocrático:
//
//     mídia → data → produto → cliques → vendas → Salvar
//
// O resto (campanha, CTA, link, status, observação) mora em "Mais detalhes",
// fechado. Três coisas fazem dezenas de stories caberem numa sentada:
//  • o arquivo começa a subir no instante em que é escolhido;
//  • "Salvar e adicionar outro" mantém data, produto, tipo e campanha — o
//    próximo story quase sempre é da mesma leva;
//  • vários arquivos soltos no quadro viram FILA: salvou um, o próximo já
//    está na tela ("2 de 5").
//
// A data vem sugerida pelo próprio arquivo (o print é tirado logo depois de
// postar) até a pessoa mexer nela. O aviso de "já postamos algo assim?" roda
// enquanto se preenche e nunca impede o Salvar.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../../Icon";
import { toast } from "../../Toast";
import { Acoes, Botao, Campo, Campos, Esp, PainelLateral } from "../../ui/controles";
import { McPills } from "../../ui/monocharts/lib";
import { Produtos } from "../CriativoModal";
import type { ProdutoCriativo } from "@/lib/marketing-criativos-const";
import { hojeSP, isoDeDataHoraSP, partesSP, rotuloDia, semanaDoDia } from "@/lib/marketing-stories/calendario";
import { conversao, formatarConversao } from "@/lib/marketing-stories/metricas";
import {
  CTAS_SUGERIDOS, STATUS_STORY, TIPOS_STORY, type StatusStory, type Story, type TipoStory,
} from "@/lib/marketing-stories/tipos";
import type { Semelhantes, StoriesApi } from "./api";
import { DropMidia, type EstadoMidia } from "./DropMidia";
import { liberarMidia, mensagemDeEnvio, prepararMidia, type MidiaPreparada } from "./midiaStory";
import { AvisoParecidos } from "./Parecidos";
import { mapaDeProdutos } from "./pecas";

/** "" → 0; "1.240" → 1240; qualquer outra coisa → NaN. */
function numero(t: string): number {
  const x = t.replace(/[.\s]/g, "");
  if (!x) return 0;
  const n = Number(x);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Os tipos como fichas: um toque escolhe, outro toque desmarca (Kinetics · choice chips). */
export function ChipsTipo({ valor, onChange }: { valor: TipoStory | ""; onChange: (t: TipoStory | "") => void }) {
  return (
    <div className="sto-chips" role="radiogroup" aria-label="Tipo de story">
      {TIPOS_STORY.map((t) => (
        <button key={t.valor} type="button" role="radio" aria-checked={valor === t.valor} className="sto-chip"
          onClick={() => onChange(valor === t.valor ? "" : t.valor)}>
          <Icon name={t.icone} size={14} /> {t.rotulo}
        </button>
      ))}
    </div>
  );
}

type Envio = { m: MidiaPreparada; envio: Promise<{ midiaUrl: string; capaUrl: string | null }> };

export function NovoStory({ api, produtos, onProdutoCriado, campanhas, fila, dataInicial, onFechar, onCriado }: {
  api: StoriesApi;
  produtos: ProdutoCriativo[];
  onProdutoCriado?: (p: ProdutoCriativo) => void;
  campanhas: string[];
  /** Arquivos soltos no quadro: o primeiro já abre aqui, os outros vêm em fila. */
  fila: File[];
  /** Dia sugerido — o "Adicionar" de uma semana ou de um dia do calendário. */
  dataInicial?: string;
  onFechar: () => void;
  onCriado: (s: Story) => void;
}) {
  const hoje = hojeSP();
  const [data, setData] = useState(dataInicial ?? hoje);
  const [hora, setHora] = useState(() => (dataInicial && dataInicial !== hoje ? "12:00" : partesSP(new Date()).hora));
  // A pessoa escolheu a data ela mesma: dali em diante o arquivo não sugere mais.
  const dataEscolhida = useRef(!!dataInicial);
  const [dataDoArquivo, setDataDoArquivo] = useState(false);
  const [produto, setProduto] = useState("");
  const [tipo, setTipo] = useState<TipoStory | "">("");
  const [tema, setTema] = useState("");
  const [cliques, setCliques] = useState("");
  const [vendas, setVendas] = useState("");
  const [campanha, setCampanha] = useState("");
  const [cta, setCta] = useState("");
  const [link, setLink] = useState("");
  const [obs, setObs] = useState("");
  const [status, setStatus] = useState<StatusStory | null>(null);
  const [midia, setMidia] = useState<EstadoMidia>({ fase: "vazio" });
  const [parecidos, setParecidos] = useState<Semelhantes | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const [erroData, setErroData] = useState<string | undefined>();
  const [restantes, setRestantes] = useState<File[]>(() => fila.slice(1));
  const [feitos, setFeitos] = useState(0);
  const idCampanhas = useId();
  const idCtas = useId();
  const nomes = useMemo(() => mapaDeProdutos(produtos), [produtos]);

  // ── Mídia ──
  // `token` descarta o que chegar atrasado (a pessoa trocou o arquivo no meio).
  const token = useRef(0);
  const atual = useRef<Envio | null>(null);
  // URLs que subiram e ainda não viraram story: saem do bucket se ninguém salvar.
  const soltas = useRef<string[]>([]);

  const largar = () => {
    token.current++;
    if (atual.current) liberarMidia(atual.current.m);
    atual.current = null;
    if (soltas.current.length) {
      api.descartarMidia(soltas.current);
      soltas.current = [];
    }
  };

  function subir(m: MidiaPreparada, meu: number) {
    const envio = api.enviarMidia(m, (fr) => {
      if (meu === token.current) setMidia((e) => (e.fase === "pronta" && e.m === m ? { ...e, progresso: fr } : e));
    });
    atual.current = { m, envio };
    setMidia({ fase: "pronta", m, progresso: 0, enviada: false });
    envio.then((u) => {
      const urls = [u.midiaUrl, u.capaUrl].filter((x): x is string => !!x);
      if (meu !== token.current) { api.descartarMidia(urls); return; }
      soltas.current.push(...urls);
      setMidia((e) => (e.fase === "pronta" && e.m === m ? { ...e, progresso: 1, enviada: true, erroEnvio: undefined } : e));
    }).catch((err) => {
      if (meu !== token.current) return;
      setMidia((e) => (e.fase === "pronta" && e.m === m ? { ...e, erroEnvio: mensagemDeEnvio(err) } : e));
    });
  }

  async function escolher(f: File) {
    largar();
    const meu = token.current;
    setMidia({ fase: "preparando", nome: f.name });
    const r = await prepararMidia(f);
    if (meu !== token.current) { if (r.ok) liberarMidia(r.midia); return; }
    if (!r.ok) { setMidia({ fase: "vazio", erro: r.erro }); return; }
    if (!dataEscolhida.current && r.midia.modificadoEm) {
      const p = partesSP(r.midia.modificadoEm);
      if (p.data <= hojeSP()) { setData(p.data); setHora(p.hora); setDataDoArquivo(true); }
    }
    subir(r.midia, meu);
  }

  // O primeiro arquivo da fila entra ao abrir; colar um print (Ctrl+V) em
  // qualquer ponto do cadastro também — colar TEXTO num campo segue normal.
  const escolherRef = useRef(escolher);
  escolherRef.current = escolher;
  const largarRef = useRef(largar);
  largarRef.current = largar;
  useEffect(() => {
    if (fila[0]) void escolherRef.current(fila[0]);
    const colar = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => /^(image|video)\//.test(x.type));
      if (!f) return;
      e.preventDefault();
      void escolherRef.current(f);
    };
    document.addEventListener("paste", colar);
    return () => {
      document.removeEventListener("paste", colar);
      largarRef.current();
    };
    // Só na montagem: a fila é a do momento em que o cadastro abriu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── "Já postamos algo assim?" ──
  const produtoId = produtos.find((p) => p.nome === produto)?.id ?? null;
  const hash = midia.fase === "pronta" ? midia.m.hashVisual : null;
  useEffect(() => {
    if (!produtoId && !tipo && !tema.trim() && !hash) { setParecidos(null); return; }
    let vivo = true;
    const t = setTimeout(() => {
      api.semelhantes({ produtoId, tipo: tipo || null, tema, cta, campanha, hashVisual: hash })
        .then((r) => { if (vivo) setParecidos(r); })
        .catch(() => {});
    }, 450);
    return () => { vivo = false; clearTimeout(t); };
  }, [api, produtoId, tipo, tema, cta, campanha, hash]);

  // ── Salvar ──
  const iso = isoDeDataHoraSP(data, hora);
  // Status automático pela data: futuro é planejado. A pessoa pode trocar.
  const statusFinal: StatusStory = status ?? (iso && iso > new Date().toISOString() ? "planejado" : "publicado");
  const nCliques = numero(cliques);
  const nVendas = numero(vendas);

  async function salvar(depois: "fechar" | "outro") {
    if (salvando) return;
    if (!iso) { setErroData("Data ou horário inválido."); setTentativa((t) => t + 1); return; }
    if (Number.isNaN(nCliques) || Number.isNaN(nVendas)) {
      toast("Cliques e vendas são números inteiros (ex.: 124).", "erro");
      return;
    }
    const pronta = midia.fase === "pronta" ? atual.current : null;
    setSalvando(true);
    let urls: { midiaUrl: string; capaUrl: string | null } | null = null;
    if (pronta) {
      try { urls = await pronta.envio; } catch (e) {
        setSalvando(false);
        toast(mensagemDeEnvio(e), "erro");
        return;
      }
    }
    const m = pronta?.m;
    const r = await api.criar({
      publicadoEm: iso, status: statusFinal, produtoId, tipo: tipo || null,
      tema: tema.trim() || null, cta: cta.trim() || null, campanha: campanha.trim() || null,
      linkUrl: link.trim() || null, observacoes: obs.trim() || null, cliques: nCliques, vendas: nVendas,
      ...(m && urls ? {
        midiaUrl: urls.midiaUrl, capaUrl: urls.capaUrl, midiaTipo: m.tipo,
        largura: m.largura, altura: m.altura, duracao: m.duracao, hashVisual: m.hashVisual,
      } : {}),
    });
    setSalvando(false);
    if (!r.ok) { toast(r.erro, "erro"); return; }
    const salvas = urls;
    if (salvas) soltas.current = soltas.current.filter((u) => u !== salvas.midiaUrl && u !== salvas.capaUrl);
    onCriado(r.story);

    const proximo = restantes[0];
    if (depois === "fechar" && !proximo) { largar(); onFechar(); return; }
    // Próximo da leva: fica data, produto, tipo, campanha e CTA; sai o que é
    // só deste story (mídia, tema, números, link, observação).
    setFeitos((n) => n + 1);
    largar();
    setMidia({ fase: "vazio" });
    setTema(""); setCliques(""); setVendas(""); setObs(""); setLink("");
    setParecidos(null); setDataDoArquivo(false); setErroData(undefined);
    if (proximo) {
      setRestantes((l) => l.slice(1));
      void escolher(proximo);
      toast.ok(`Story salvo. Agora o ${feitos + 2}º de ${fila.length}.`);
    } else {
      toast.ok("Story salvo. Pode mandar o próximo.");
    }
  }

  const fechar = () => { largar(); onFechar(); };
  const semana = semanaDoDia(data.slice(0, 7), Number(data.slice(8, 10)) || 1);
  const subtitulo = fila.length > 1
    ? `${Math.min(feitos + 1, fila.length)} de ${fila.length} arquivos`
    : iso ? `${capitalizar(rotuloDia(data))} · Semana ${semana}` : undefined;

  return (
    <PainelLateral
      titulo="Adicionar story"
      subtitulo={subtitulo}
      largura={780}
      centrado
      soFechaNoX
      onFechar={fechar}
      rodape={
        <Acoes>
          <Botao variante="sutil" onClick={fechar}>{feitos ? "Fechar" : "Cancelar"}</Botao>
          <Esp />
          {!restantes.length && (
            <Botao onClick={() => void salvar("outro")} disabled={salvando}>Salvar e adicionar outro</Botao>
          )}
          <Botao variante="primario" icone="check" carregando={salvando} onClick={() => void salvar("fechar")}>
            {restantes.length ? "Salvar e ir pro próximo" : "Salvar"}
          </Botao>
        </Acoes>
      }
    >
      <div
        className="sto-form"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void salvar("fechar"); }
        }}
      >
        <div className="sto-form-midia">
          <DropMidia
            estado={midia}
            onArquivo={(f) => void escolher(f)}
            onRemover={() => { largar(); setMidia({ fase: "vazio" }); }}
            onTentarDeNovo={() => {
              const a = atual.current;
              if (!a) return;
              token.current++;
              subir(a.m, token.current);
            }}
          />
        </div>

        <div className="sto-form-campos">
          <Campos min={150}>
            <Campo label="Data" erro={erroData} sinal={tentativa} dica={dataDoArquivo ? "Sugerida pela data do arquivo" : undefined}>
              {(id) => (
                <input id={id} type="date" value={data} max="2099-12-31"
                  onChange={(e) => { dataEscolhida.current = true; setDataDoArquivo(false); setErroData(undefined); setData(e.target.value); }} />
              )}
            </Campo>
            <Campo label="Horário">
              {(id) => (
                <input id={id} type="time" value={hora}
                  onChange={(e) => { dataEscolhida.current = true; setDataDoArquivo(false); setErroData(undefined); setHora(e.target.value); }} />
              )}
            </Campo>
          </Campos>

          <Campo label="Produto">
            <Produtos
              produtos={produtos}
              valor={produto}
              onChange={(n) => setProduto((p) => (p === n ? "" : n))}
              onCriado={(p) => { onProdutoCriado?.(p); setProduto(p.nome); }}
            />
          </Campo>

          <Campo label="Tipo de story">
            <ChipsTipo valor={tipo} onChange={setTipo} />
          </Campo>

          <Campo label="Tema" dica="O assunto em poucas palavras. É por ele que o sistema avisa quando algo parecido já saiu.">
            {(id) => (
              <input id={id} value={tema} maxLength={120} autoComplete="off" placeholder="Ex.: Desconto de 20% no kit"
                onChange={(e) => setTema(e.target.value)} />
            )}
          </Campo>

          <Campos min={120}>
            <Campo label="Cliques no link" erro={Number.isNaN(nCliques) ? "Só número inteiro." : undefined}>
              {(id) => (
                <input id={id} inputMode="numeric" value={cliques} placeholder="0" autoComplete="off"
                  onChange={(e) => setCliques(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
              )}
            </Campo>
            <Campo label="Vendas" erro={Number.isNaN(nVendas) ? "Só número inteiro." : undefined}>
              {(id) => (
                <input id={id} inputMode="numeric" value={vendas} placeholder="0" autoComplete="off"
                  onChange={(e) => setVendas(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
              )}
            </Campo>
          </Campos>
          <p className="sto-conv-viva" aria-live="polite">
            <span>Conversão</span>
            <strong>{formatarConversao(conversao(nCliques || 0, nVendas || 0))}</strong>
            <small>calculada sozinha · os números podem ser lançados depois</small>
          </p>

          <AvisoParecidos r={parecidos} nomes={nomes} />

          <details className="sto-mais">
            <summary>
              <Icon name="chevron-down" size={15} className="sto-mais-seta" />
              Mais detalhes <span>campanha, CTA, link, status, observação</span>
            </summary>
            <div className="sto-mais-corpo">
              <Campos min={200}>
                <Campo label="Campanha">
                  {(id) => (
                    <>
                      <input id={id} list={idCampanhas} value={campanha} maxLength={80} autoComplete="off"
                        placeholder="Ex.: Semana do Carimbo" onChange={(e) => setCampanha(e.target.value)} />
                      <datalist id={idCampanhas}>{campanhas.map((c) => <option key={c} value={c} />)}</datalist>
                    </>
                  )}
                </Campo>
                <Campo label="CTA">
                  {(id) => (
                    <>
                      <input id={id} list={idCtas} value={cta} maxLength={60} autoComplete="off"
                        placeholder="Ex.: Comprar agora" onChange={(e) => setCta(e.target.value)} />
                      <datalist id={idCtas}>{CTAS_SUGERIDOS.map((c) => <option key={c} value={c} />)}</datalist>
                    </>
                  )}
                </Campo>
              </Campos>
              <Campo label="Link do story" dica="Pra onde o link leva. Fica guardado pro dia em que as vendas forem ligadas sozinhas.">
                {(id) => (
                  <input id={id} type="url" inputMode="url" value={link} maxLength={500} placeholder="https://"
                    onChange={(e) => setLink(e.target.value)} />
                )}
              </Campo>
              <Campo label="Status" dica={status ? undefined : "Automático pela data: data futura é planejado."}>
                <McPills
                  itens={STATUS_STORY.map((s) => ({ valor: s.valor, rotulo: s.rotulo }))}
                  valor={statusFinal}
                  onMuda={(v) => setStatus(v)}
                  ariaLabel="Status do story"
                />
              </Campo>
              <Campo label="Observação">
                {(id) => (
                  <textarea id={id} rows={3} maxLength={2000} value={obs}
                    placeholder="Ex.: usou o preço direto no criativo." onChange={(e) => setObs(e.target.value)} />
                )}
              </Campo>
            </div>
          </details>
        </div>
      </div>
    </PainelLateral>
  );
}
