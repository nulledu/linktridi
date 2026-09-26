"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../Icon";
import { GlassSelect } from "../GlassPicker";
import { Acoes, Botao, BotaoIcone, Campo, Campos, PainelLateral, Caixa } from "../ui/controles";
import { confirmar, toast } from "../Toast";
import { triarListaLocais, type LinhaLocal as LinhaColada } from "@/lib/estoque-locais-lote";
import { comDescendentes, contarComDescendentes, filhosPorPai } from "@/lib/estoque-lugar-dos-itens";
import { ErroDeCarga, EstadoVazio } from "./EstadoVazio";
import { GuardarNoLugar } from "./GuardarNoLugar";
import type { Item } from "./tipos";

interface Local { id: string; nome: string; codigo: string; pai_id: string | null; ativo: boolean; ordem: number }

// Traduz os 409/400 da API (app/api/estoque/locais/route.ts) pra português. Um
// código cru na tela ("local_em_uso") não é resposta pra quem só quer apagar
// uma prateleira.
function erroLocal(codigo: string | undefined, itens?: number): string {
  if (codigo === "codigo_duplicado") return "Já existe um lugar com este código.";
  if (codigo === "local_em_uso") return `Este lugar ainda guarda ${itens ?? 0} item${itens === 1 ? "" : "(ns)"}. Mova-os antes de apagar.`;
  if (codigo === "pai_invalido") return "Um lugar não pode ser pai dele mesmo.";
  if (codigo === "missing_nome") return "Dê um nome ao lugar.";
  if (codigo === "missing_codigo") return "Dê um código ao lugar.";
  return "Não foi possível salvar. Tente de novo.";
}

// Todos os descendentes de um lugar (recursivo). Serve só pra tirar do
// seletor "pai" as próprias filhas: escolher uma delas criaria um ciclo, e a
// árvore da tela não teria mais um topo de onde começar a desenhar.
function descendentesDe(id: string, todos: Local[]): Set<string> {
  const porPai = new Map<string, Local[]>();
  for (const l of todos) {
    if (!l.pai_id) continue;
    const arr = porPai.get(l.pai_id);
    if (arr) arr.push(l); else porPai.set(l.pai_id, [l]);
  }
  const out = new Set<string>();
  const fila = [id];
  while (fila.length) {
    const atual = fila.pop()!;
    for (const f of porPai.get(atual) ?? []) {
      if (!out.has(f.id)) { out.add(f.id); fila.push(f.id); }
    }
  }
  return out;
}

// Árvore achatada em (local, nível) — mais simples de percorrer que componentes
// recursivos, e a `visitados` protege contra um ciclo que a API não impediria
// sozinha (A vira pai de B, B vira pai de A em dois PATCH separados): sem a
// guarda, a tela entraria num loop infinito em vez de só desenhar torto.
function achatarArvore(raizes: Local[], todos: Local[]): { local: Local; nivel: number }[] {
  const porPai = new Map<string, Local[]>();
  for (const l of todos) {
    if (!l.pai_id) continue;
    const arr = porPai.get(l.pai_id);
    if (arr) arr.push(l); else porPai.set(l.pai_id, [l]);
  }
  const out: { local: Local; nivel: number }[] = [];
  const visitados = new Set<string>();
  function visitar(l: Local, nivel: number) {
    if (visitados.has(l.id)) return;
    visitados.add(l.id);
    out.push({ local: l, nivel });
    for (const f of porPai.get(l.id) ?? []) visitar(f, nivel + 1);
  }
  for (const r of raizes) visitar(r, 0);
  return out;
}

// Localização: onde cada item mora fisicamente (prateleira, sala, filial).
// Árvore rasa (pai → filhos) com a contagem de itens de cada lugar; tocar
// abre o que está guardado ali — a metade que responde "o que tem na
// Prateleira B2?". Os itens vêm do /api/estoque-itens já buscado em outras
// abas (capado em 2000) e são filtrados por local_id no cliente: uma rota
// dedicada seria uma consulta a mais sem ganho nenhum.
export function LocaisPanel() {
  const [locais, setLocais] = useState<Local[]>([]);
  const [itens, setItens] = useState<Item[]>([]);
  const [podeGerir, setPodeGerir] = useState(false);
  const [podeMover, setPodeMover] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);
  const [novo, setNovo] = useState(false);
  const [lote, setLote] = useState(false);
  const [editando, setEditando] = useState<Local | null>(null);
  const [verConteudo, setVerConteudo] = useState<Local | null>(null);

  // O `try` não é decoração: sem ele, um `fetch` que estoura (rede caindo, aba
  // voltando do sono) rejeita a promessa e a tela fica em "Carregando…" pra
  // sempre — que é a única mensagem pior que "deu erro", porque não sugere
  // nada pra fazer.
  async function load() {
    try {
      const [rl, ri] = await Promise.all([
        fetch("/api/estoque/locais", { cache: "no-store" }),
        fetch("/api/estoque-itens", { cache: "no-store" }),
      ]);
      // As DUAS respostas são conferidas. `ri.ok` faltava, e virou um caminho
      // de dado FALSO agora que todo salvamento chama `load()`: se o catálogo
      // falhasse (timeout dos 2000 itens, RLS, qualquer throw), `ri.json()`
      // rejeitava no HTML de erro, o `.catch` engolia e `setItens([])` gravava
      // LISTA VAZIA — logo abaixo do recado verde de "5 produtos guardados". A
      // tela lia "GUARDADO AQUI (0)" e a árvore inteira zerava. Quem vê isso
      // conclui que o que acabou de fazer apagou tudo.
      if (!rl.ok || !ri.ok) { setErroCarga(true); return; }
      const dl = await rl.json();
      const di = await ri.json().catch(() => ({}));
      setLocais(dl.locais ?? []);
      setPodeGerir(!!dl.podeGerir);
      setPodeMover(!!dl.podeMover);
      setItens(di.itens ?? []);
      setErroCarga(false);
    } catch {
      setErroCarga(true);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // ── A contagem soma os DESCENDENTES, e isso é o conserto de um furo ────────
  //
  // Era contagem EXATA: só o que apontava para aquele lugar. Mas o galpão tem
  // três níveis (Rua → Módulo → Nível) e as peças moram nas FOLHAS. Medido no
  // banco: a Rua E guarda 5 produtos nos níveis dela e a árvore mostrava "0
  // itens"; abrir a rua mostrava "Nada guardado aqui". Quem bipa a placa da rua
  // conclui que o sistema perdeu o estoque.
  //
  // Agora cada lugar conta o que está nele MAIS o que está abaixo dele. O
  // painel separa as duas coisas (ver `ConteudoLocal`), porque "guardado nesta
  // placa" e "guardado em algum nível desta rua" pedem ações diferentes.
  const filhos = useMemo(() => filhosPorPai(locais), [locais]);
  const descDe = useCallback((id: string) => comDescendentes(id, filhos), [filhos]);
  const contagem = useMemo(() => contarComDescendentes(locais, itens), [locais, itens]);

  // Raiz = sem pai OU cujo pai não existe mais na lista (órfão): sem este
  // segundo caso um lugar cujo pai foi apagado por fora (SQL direto) sumiria
  // da árvore em vez de subir pro topo.
  const raizes = useMemo(() => {
    const ids = new Set(locais.map((l) => l.id));
    return locais.filter((l) => !l.pai_id || !ids.has(l.pai_id));
  }, [locais]);
  const linhas = useMemo(() => achatarArvore(raizes, locais), [raizes, locais]);

  if (loading) return <p style={{ color: "var(--text-dim)" }}>Carregando…</p>;
  if (erroCarga) return <ErroDeCarga oQue="os lugares" naoTem="não há nenhum lugar cadastrado" onTentar={() => { setLoading(true); load(); }} />;

  // ── A aba vazia é a aba mais importante do primeiro dia ────────────────────
  // Ela nasce em zero, e o zero se propaga: item sem lugar é item que ninguém
  // acha no galpão, e a etiqueta impressa sai sem endereço. "Nenhum lugar
  // cadastrado ainda." não dizia nada disso, nem que dá pra cadastrar a estante
  // inteira de uma vez.
  if (linhas.length === 0) {
    return (
      <>
        <EstadoVazio
          icone="map-pin"
          titulo="Nenhum lugar cadastrado ainda"
          acoes={podeGerir ? <>
            <Botao variante="primario" icone="list-check" onClick={() => setLote(true)}>Cadastrar vários</Botao>
            <Botao icone="plus" onClick={() => setNovo(true)}>Um lugar só</Botao>
          </> : undefined}
        >
          <p style={{ margin: 0 }}>
            Lugar é onde a coisa mora de verdade: corredor, estante, prateleira, sala, filial.
            Cada item do catálogo aponta pra um, e é isso que responde
            “<strong>onde está o rolo de kraft?</strong>” sem ninguém sair procurando.
          </p>
          {podeGerir ? (
            <p style={{ margin: "8px 0 0" }}>
              Comece pela estante inteira, não por um lugar: em <strong>Cadastrar vários</strong> dá
              pra colar a lista ou escrever <code>A1..A6</code> pra criar as seis prateleiras
              do corredor A de uma vez. Um lugar tem um <strong>código</strong> (vai impresso na
              etiqueta, curto) e um <strong>nome</strong> (pra gente ler).
            </p>
          ) : (
            <p style={{ margin: "8px 0 0" }}>
              Você pode ver os lugares, mas não cadastrar. Quem cuida do estoque libera isso em
              Permissões (a sub-permissão <code>estoque:locais</code>).
            </p>
          )}
        </EstadoVazio>

        {(novo || lote) && (novo
          ? <EditorLocal local={null} locais={locais} onClose={() => setNovo(false)} onSaved={() => { setNovo(false); load(); }} />
          : <CadastrarVariosLocais locais={locais} onClose={() => setLote(false)} onSaved={() => { setLote(false); load(); }} />)}
      </>
    );
  }

  return (
    <div>
      <p style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>
        Onde cada item mora fisicamente — prateleira, sala, filial. Toque num lugar pra ver o que está guardado nele.
      </p>
      {/* "Cadastrar vários" antes do "Novo", igual à aba Fornecedores: uma
          estante nunca tem uma prateleira só, e um-a-um é o caminho que ninguém
          percorre até o fim. */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {podeGerir && <Botao icone="list-check" onClick={() => setLote(true)}>Cadastrar vários</Botao>}
        {podeGerir && <Botao variante="primario" icone="plus" onClick={() => setNovo(true)}>Novo lugar</Botao>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {linhas.map(({ local, nivel }) => (
          <LinhaLocal key={local.id} local={local} nivel={nivel} qtd={contagem.get(local.id) ?? 0}
            podeGerir={podeGerir} onAbrir={() => setVerConteudo(local)} onEditar={() => setEditando(local)} />
        ))}
      </div>

      {(novo || editando) && (
        <EditorLocal
          local={editando}
          locais={locais}
          onClose={() => { setNovo(false); setEditando(null); }}
          onSaved={() => { setNovo(false); setEditando(null); load(); }}
        />
      )}
      {lote && (
        <CadastrarVariosLocais
          locais={locais}
          onClose={() => setLote(false)}
          onSaved={() => { setLote(false); load(); }}
        />
      )}
      {verConteudo && (
        <ConteudoLocal
          local={verConteudo}
          itens={itens.filter((i) => i.local_id === verConteudo.id)}
          // O que está nos NÍVEIS abaixo desta placa. Separado do de cima de
          // propósito: guardar e tirar valem pra esta placa; o que mora num
          // nível é informação, e mexer nele é abrir o nível.
          abaixo={itens.filter((i) => i.local_id && i.local_id !== verConteudo.id
            && descDe(verConteudo.id).has(i.local_id))}
          catalogo={itens}
          locais={locais}
          podeGerir={podeGerir}
          podeMover={podeMover}
          onEditar={() => { setEditando(verConteudo); setVerConteudo(null); }}
          onClose={() => setVerConteudo(null)}
          aoMudar={load}
        />
      )}
    </div>
  );
}

// Linha da árvore. É um <div> com onClick (não <button>) de propósito: o
// ícone de editar É um botão de verdade dentro dela, e um <button> não pode
// aninhar outro — o mesmo padrão do `Card` do catálogo (CatalogoClient.tsx).
function LinhaLocal({ local, nivel, qtd, podeGerir, onAbrir, onEditar }: {
  local: Local; nivel: number; qtd: number; podeGerir: boolean;
  onAbrir: () => void; onEditar: () => void;
}) {
  // ── O recuo tem TETO ──────────────────────────────────────────────────────
  // Eram `nivel * 20px` fixos. Numa árvore de seis níveis (galpão → corredor →
  // estante → prateleira → caixa → divisória, que é como um galpão de verdade
  // fica depois de um ano) a linha do fundo media 192px de 292 a 320px — e
  // como ícone, contagem e lápis ocupam ~160px fixos, sobravam ~30px pro nome:
  // "GP-A-E3-P2 ·…", com o nome inteiro sumido. O `min()` deixa o computador
  // exatamente como está (a 1120px, 12% são 134px — mais que os 100px do sexto
  // nível) e impede que o recuo coma mais de 12% da coluna no celular.
  // Medido a 320px, nível 5: linha 192px → 257px; nome 30px → 95px.
  // A profundidade continua legível pelo CÓDIGO, que já é o caminho inteiro.
  const recuo = `min(${nivel * 20}px, 12%)`;
  return (
    <div
      onClick={onAbrir}
      className="glass glass-spec"
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: `calc(100% - ${recuo})`, marginLeft: recuo,
        minHeight: "var(--tap)", padding: "10px 14px", borderRadius: "var(--r-sm)",
        cursor: "pointer", opacity: local.ativo ? 1 : 0.55,
      }}
    >
      <Icon name="map-pin" size={16} color="var(--text-dim)" />
      {/* Duas linhas em vez de uma com reticências: a 320px o recuo da árvore,
          a contagem e o lápis deixam ~120px pro nome, e "Prateleira de
          carimbos montados (corredor A)" virava "Pratel…" — some justamente o
          que diz QUAL prateleira é. O teto de duas linhas segura a altura. */}
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.3, overflowWrap: "break-word",
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        <strong>{local.codigo}</strong> · {local.nome}
        {!local.ativo && <span style={{ marginLeft: 6, fontSize: 11, color: "var(--text-dim)" }}>(inativo)</span>}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--text-dim)", flex: "none" }}>
        {qtd} {qtd === 1 ? "item" : "itens"}
      </span>
      {podeGerir && (
        <BotaoIcone icone="edit" titulo="Editar lugar" variante="sutil" tamanho="sm"
          onClick={(e) => { e.stopPropagation(); onEditar(); }} />
      )}
    </div>
  );
}

// O que está guardado neste lugar — e, agora, o CONTROLE do que mora aqui.
//
// Era só leitura: uma lista do que tinha dentro. A metade que faltava é a que
// se usa de pé na frente da estante — guardar produto aqui, tirar daqui. Ver
// GuardarNoLugar.tsx.
function ConteudoLocal({ local, itens, abaixo, catalogo, locais, podeGerir, podeMover, onEditar, onClose, aoMudar }: {
  local: Local; itens: Item[]; abaixo: Item[]; catalogo: Item[]; locais: Local[];
  podeGerir: boolean; podeMover: boolean;
  onEditar: () => void; onClose: () => void; aoMudar: () => void;
}) {
  const total = itens.length + abaixo.length;
  const codigoPorLocal = useMemo(() => new Map(locais.map((l) => [l.id, l.codigo])), [locais]);
  return (
    <PainelLateral
      titulo={<><strong>{local.codigo}</strong> · {local.nome}</>}
      subtitulo={total === 0 ? "vazio"
        : abaixo.length === 0 ? `${total} ${total === 1 ? "item guardado" : "itens guardados"}`
        : `${total} ${total === 1 ? "item" : "itens"} — ${itens.length} nesta placa, ${abaixo.length} nos níveis`}
      acoes={podeGerir ? <BotaoIcone icone="edit" titulo="Editar lugar" onClick={onEditar} /> : undefined}
      onFechar={onClose}
      largura={460}
    >
      <GuardarNoLugar
        local={local} dentro={itens} catalogo={catalogo} locais={locais}
        podeMover={podeMover} aoMudar={aoMudar}
      />
      {/* ── O que mora ABAIXO desta placa ───────────────────────────────────
          Abrir a Rua E e ler "nada guardado aqui" com 5 peças nos níveis dela
          é o que faz alguém achar que o sistema perdeu o estoque. Fica DEPOIS
          do que é desta placa e sem botão de mexer: quem quer mover a peça
          abre o nível dela — o endereço se muda onde ele está escrito. */}
      {abaixo.length > 0 && (
        <section style={{ display: "grid", gap: 8, marginTop: 20 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: ".02em", color: "var(--text-dim)" }}>
            NOS NÍVEIS DESTA PLACA ({abaixo.length})
          </h3>
          {abaixo.map((i) => (
            <div key={i.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
              background: "var(--surface)", minHeight: "var(--tap)",
            }}>
              <Icon name="box" size={16} color="var(--text-dim)" />
              <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, overflowWrap: "anywhere" }}>
                {i.nome}
                <span style={{ display: "block", fontSize: 12, color: "var(--text-dim)", fontWeight: 500 }}>
                  em {i.local_id ? codigoPorLocal.get(i.local_id) ?? "—" : "—"}
                </span>
              </span>
              <span style={{ fontSize: 12.5, color: "var(--text-dim)", flex: "none" }}>{i.quantidade} {i.unidade}</span>
            </div>
          ))}
        </section>
      )}
    </PainelLateral>
  );
}

// ── Cadastrar vários (colar a lista) ─────────────────────────────────────────
// Um galpão não tem um lugar: tem um corredor com seis prateleiras, uma sala
// com quatro estantes. Pelo editor de um em um, cadastrar isso custa sete
// aberturas de painel, catorze campos e sete escolhas de pai — e o que
// acontece de verdade é ninguém cadastrar, o campo "onde vai ser guardado"
// ficar vazio pra sempre e a etiqueta sair sem endereço.
//
// A colagem aceita os dois formatos que existem na vida real: a lista escrita
// ("B2 · Prateleira do fundo", ou duas colunas da planilha) e a faixa
// ("A1..A6"). O pai é escolhido UMA vez pra lista inteira — é sempre o mesmo
// corredor.
//
// Nada é fundido nem corrigido sozinho: cada linha aparece com o código que
// será gravado, e desmarcar é um toque. Ver a triagem irmã de Fornecedores.
const CHIP: Record<LinhaColada["situacao"], { texto: string; cor: string }> = {
  novo:      { texto: "novo",          cor: "var(--ok)" },
  existente: { texto: "já cadastrado", cor: "var(--neutro)" },
  repetido:  { texto: "repetido",      cor: "var(--neutro)" },
  suspeito:  { texto: "confira",       cor: "var(--atencao)" },
};

function CadastrarVariosLocais({ locais, onClose, onSaved }: {
  locais: Local[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [paiId, setPaiId] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Decisão da pessoa, por CÓDIGO (o índice muda a cada tecla digitada).
  const [escolha, setEscolha] = useState<Record<string, boolean>>({});

  const base = useMemo(() => locais.map((l) => ({ codigo: l.codigo, nome: l.nome })), [locais]);
  const triagem = useMemo(() => triarListaLocais(texto, base), [texto, base]);

  const marcado = (l: LinhaColada) => escolha[l.codigo] ?? l.marcar;
  const decidivel = (l: LinhaColada) => l.situacao === "novo" || l.situacao === "suspeito";
  const escolhidos = triagem.linhas.filter((l) => decidivel(l) && marcado(l));
  const jaTem = triagem.linhas.filter((l) => l.situacao === "existente").length;
  const repetidos = triagem.linhas.filter((l) => l.situacao === "repetido").length;

  async function cadastrar() {
    if (!escolhidos.length || busy) return;
    setBusy(true); setErro(null);
    try {
      const r = await fetch("/api/estoque/locais", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locais: escolhidos.map((l) => ({ codigo: l.codigo, nome: l.nome })),
          pai_id: paiId || null,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(erroLocal(d.error)); setBusy(false); return; }
      const criados = (d.criados ?? []).length as number;
      const falhas = (d.falhas ?? []).length as number;
      const extra = [
        (d.jaExistiam ?? []).length ? `${(d.jaExistiam ?? []).length} já existia(m)` : "",
        falhas ? `${falhas} não entrou(ram)` : "",
      ].filter(Boolean).join(" · ");
      toast(`${criados} ${criados === 1 ? "lugar cadastrado" : "lugares cadastrados"}${extra ? ` · ${extra}` : ""}`, falhas ? "erro" : "ok");
      onSaved();
    } catch {
      setErro("Não deu pra cadastrar agora. Tente de novo.");
      setBusy(false);
    }
  }

  return (
    <PainelLateral
      titulo="Cadastrar vários lugares"
      subtitulo="Cole a lista — um por linha"
      onFechar={onClose}
      largura={560}
      rodape={
        <Acoes>
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" icone="check" onClick={cadastrar} disabled={!escolhidos.length || busy} carregando={busy}>
            Cadastrar {escolhidos.length || ""}
          </Botao>
        </Acoes>
      }
    >
      <Campos>
        <Campo label="Um por linha (vale colar direto da planilha)" largo
          dica="“B2 · Prateleira do fundo” separa código e nome. Só o código também serve. E “A1..A6” cria as seis prateleiras de uma vez.">
          {(id) => (
            <textarea id={id} value={texto} onChange={(e) => setTexto(e.target.value)} rows={7}
              autoFocus spellCheck={false}
              placeholder={"A1..A6\nB1 · Prateleira do fundo\nSALA-TINTA · Sala de tintas"}
              style={{ fontSize: 14, lineHeight: 1.5 }} />
          )}
        </Campo>
        {locais.length > 0 && (
          <Campo label="Todos dentro de (opcional)" largo dica="Vale pra lista inteira — é sempre o mesmo corredor.">
            {(id) => (
              <GlassSelect id={id} value={paiId} onChange={setPaiId}
                options={[{ value: "", label: "— nenhum (são lugares raiz) —" }, ...locais.map((l) => ({ value: l.id, label: `${l.codigo} · ${l.nome}` }))]} />
            )}
          </Campo>
        )}
      </Campos>

      {triagem.linhas.length > 0 && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", margin: "14px 0 8px", fontSize: 12.5, color: "var(--text-dim)" }}>
            <strong style={{ color: "var(--text)", fontSize: 13 }}>{escolhidos.length} vão entrar</strong>
            {jaTem > 0 && <span>{jaTem} já cadastrado{jaTem === 1 ? "" : "s"}</span>}
            {repetidos > 0 && <span>{repetidos} repetido{repetidos === 1 ? "" : "s"} na lista</span>}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            {triagem.linhas.map((l, i) => {
              const chip = CHIP[l.situacao];
              const podeMarcar = decidivel(l);
              const on = podeMarcar && marcado(l);
              return (
                <div key={`${l.codigo}-${i}`} className="glass" style={{ padding: "6px 12px", borderRadius: "var(--r-sm)", opacity: podeMarcar ? 1 : 0.6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", cursor: podeMarcar ? "pointer" : "default" }}>
                    <Caixa marcado={on} desativado={!podeMarcar} onChange={(marc) => setEscolha((s) => ({ ...s, [l.codigo]: marc }))} />
                    {/* O código aparece SEPARADO do nome porque é ele que vai
                        impresso: ver "PRATELEIRA-DO-FUNDO" antes de gravar é o
                        que evita descobrir isso na etiqueta colada. */}
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, overflowWrap: "anywhere" }}>
                      <strong>{l.codigo}</strong>
                      {l.nome !== l.codigo && <span style={{ color: "var(--text-dim)" }}> · {l.nome}</span>}
                    </span>
                    <span style={{
                      flex: "none", fontSize: 10.5, fontWeight: 800, letterSpacing: .2, textTransform: "uppercase",
                      color: chip.cor, background: `color-mix(in srgb, ${chip.cor} 14%, transparent)`,
                      padding: "2px 7px", borderRadius: 999,
                    }}>{chip.texto}</span>
                  </label>
                  {l.aviso && (
                    <p style={{ margin: "0 0 6px 28px", fontSize: 12, color: "var(--text-dim)", overflowWrap: "anywhere" }}>{l.aviso}</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {erro && <p role="alert" style={{ marginTop: 12, fontSize: 12.5, color: "var(--perigo)" }}>{erro}</p>}
    </PainelLateral>
  );
}

// Criar/editar um lugar.
function EditorLocal({ local, locais, onClose, onSaved }: {
  local: Local | null; locais: Local[]; onClose: () => void; onSaved: () => void;
}) {
  const [nome, setNome] = useState(local?.nome ?? "");
  const [codigo, setCodigo] = useState(local?.codigo ?? "");
  const [paiId, setPaiId] = useState(local?.pai_id ?? "");
  const [ordem, setOrdem] = useState(String(local?.ordem ?? 0));
  const [ativo, setAtivo] = useState(local?.ativo ?? true);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Nem a própria linha nem nenhuma descendente dela pode virar seu pai —
  // senão o ciclo tira o lugar (e tudo abaixo dele) da árvore desenhada.
  const opcoesPai = useMemo(() => {
    if (!local) return locais;
    const proibidos = descendentesDe(local.id, locais);
    proibidos.add(local.id);
    return locais.filter((l) => !proibidos.has(l.id));
  }, [local, locais]);

  const podeSalvar = !!nome.trim() && !!codigo.trim() && !busy;

  async function salvar() {
    if (!podeSalvar) return;
    setBusy(true); setErro(null);
    const body = { id: local?.id, nome: nome.trim(), codigo: codigo.trim(), pai_id: paiId || null, ordem: Number(ordem) || 0, ativo };
    const r = await fetch("/api/estoque/locais", { method: local ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(erroLocal(d.error));
      setBusy(false);
      return;
    }
    setBusy(false); onSaved();
  }
  async function remover() {
    if (!local) return;
    if (!(await confirmar(`Remover "${local.codigo} · ${local.nome}"?`, { perigo: true }))) return;
    setBusy(true);
    const r = await fetch(`/api/estoque/locais?id=${local.id}`, { method: "DELETE" });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErro(erroLocal(d.error, d.itens));
      setBusy(false);
      return;
    }
    onSaved();
  }

  return (
    <PainelLateral
      titulo={local ? "Editar lugar" : "Novo lugar"}
      onFechar={onClose}
      largura={460}
      rodape={
        <Acoes>
          {local && <Botao variante="perigo" icone="trash" onClick={remover} disabled={busy}>Remover</Botao>}
          <Botao onClick={onClose}>Cancelar</Botao>
          <Botao variante="primario" onClick={salvar} disabled={!podeSalvar} carregando={busy}>Salvar</Botao>
        </Acoes>
      }
    >
      <Campos>
        <Campo label="Nome" largo>
          {(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Prateleira B2" autoFocus />}
        </Campo>
        <Campo label="Código" dica="Vai pra etiqueta física.">
          {(id) => <input id={id} value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Ex: B2" />}
        </Campo>
        <Campo label="Ordem" dica="Define a posição na lista.">
          {(id) => <input id={id} type="number" value={ordem} onChange={(e) => setOrdem(e.target.value)} />}
        </Campo>
        <Campo label="Lugar pai (opcional)" largo>
          {(id) => (
            <GlassSelect id={id} value={paiId} onChange={setPaiId}
              options={[{ value: "", label: "— nenhum (é um lugar raiz) —" }, ...opcoesPai.map((l) => ({ value: l.id, label: `${l.codigo} · ${l.nome}` }))]} />
          )}
        </Campo>
        <Campo label="Situação" largo>
          <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: "var(--tap)", cursor: "pointer" }}>
            <Caixa marcado={ativo} onChange={(marc) => setAtivo(marc)} />
            <span style={{ fontSize: 13.5 }}>Lugar em uso <span style={{ color: "var(--text-dim)" }}>(desligue pra arquivar sem apagar)</span></span>
          </label>
        </Campo>
      </Campos>
      {erro && <p style={{ marginTop: 12, fontSize: 12.5, color: "var(--perigo)" }}>{erro}</p>}
    </PainelLateral>
  );
}
