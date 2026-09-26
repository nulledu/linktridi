"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { MarketProduct, MarketProfile } from "../../../../lib/tridimarket/types";
import { formatMarketCurrency } from "../../../../lib/tridimarket/view";
import { Cabecalho, useCargaAtual, useFiltros } from "../Filtros";
import { Aviso } from "../DashboardClient";
import { Badge, Card, Empty, INDIGO, SkelTabela, marketRequest } from "../ui";
import { Busca } from "../pessoas/PessoasClient";
import { ModalProduto, type Unidade } from "../Cadastro";
import { ModalNota } from "../estoque/ModalNota";
import { Icon } from "../../Icon";
import { DataList, type Coluna } from "../../ui/DataList";
import { useIsMobile } from "../../ui/useMediaQuery";
import { Botao, BotaoIcone } from "../../ui/controles";

type Settings = { profiles: MarketProfile[]; schemaReady: boolean };

// Quantas linhas entram por vez. Cada linha do catálogo custa ~35 nós de DOM
// (cinco colunas, pastilhas e três ações), então o catálogo inteiro de uma vez
// passa de 20 mil nós — o suficiente pra segurar o clique por meio segundo no
// computador, e bem mais no celular da loja.
const PAGINA = 60;

// UMA tela para produto e estoque. Eram duas abas com a mesma lista e ações
// diferentes, e a separação não correspondia ao que se faz na loja: quem abre
// o catálogo pra conferir preço é quem repõe. O produto é global (nome, foto,
// código); o estoque é da EMPRESA — por isso a empresa se escolhe na hora do
// ajuste, dentro do modal, e não no filtro do topo.
export function ProdutosClient() {
  const celular = useIsMobile();
  const [filtros, setFiltros] = useFiltros();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [produtos, setProdutos] = useState<MarketProduct[]>([]);
  const [busca, setBusca] = useState("");
  const [mostrarInativos, setMostrarInativos] = useState(false);
  const [categoria, setCategoria] = useState("");   // "" = todas | "__sem" = sem categoria
  // O que a pessoa acabou de tocar (`categoria`, `busca`) vale pro que precisa
  // responder na hora — a pastilha acesa, a letra no campo. A lista pesada lê
  // a versão diferida e é remontada com prioridade menor, sem travar o toque.
  const buscaDiferida = useDeferredValue(busca);
  const categoriaDiferida = useDeferredValue(categoria);
  const [limite, setLimite] = useState(PAGINA);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<MarketProduct | null>(null);
  // Ajuste de estoque tem alvo PRÓPRIO: a mesma linha abre dois modais
  // diferentes ("Editar" e "Ajustar estoque") e um estado só faria a tela
  // adivinhar qual dos dois abrir.
  const [ajustando, setAjustando] = useState<MarketProduct | null>(null);
  // Cadastro de produto novo: o catálogo agora é nosso, não vem mais do ERP.
  const [cadastrando, setCadastrando] = useState(false);
  const [empresas, setEmpresas] = useState<Unidade[]>([]);

  // Mesma regra do cadastro de pessoas: `unidades` (que traz as inativas) só
  // MELHORA a lista; a base é a que o filtro do topo já usa. Quando ela era a
  // única fonte, uma falha ali deixava o botão "Cadastrar" desabilitado pra
  // sempre, sem erro nenhum na tela.
  useEffect(() => {
    marketRequest<Unidade[]>("unidades").then((u) => { if (u.length) setEmpresas(u); }).catch(() => { /* fica o fallback */ });
  }, []);
  const [notaAberta, setNotaAberta] = useState(false);

  // Catálogo/estoque dependem só da empresa (não do dia): chave = empresa.
  const { desatualizado, marcarCarregado } = useCargaAtual(filtros.profileId);

  const perfilAtivo = filtros.profileId || settings?.profiles[0]?.id || "";
  const escopo = filtros.profileId ? `?profileId=${encodeURIComponent(filtros.profileId)}` : "";
  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    const [conf, lista] = await Promise.allSettled([
      marketRequest<Settings>("settings"),
      marketRequest<MarketProduct[]>(`products${escopo}`),
    ]);
    if (conf.status === "fulfilled") setSettings(conf.value);
    if (lista.status === "fulfilled") { setProdutos(lista.value); marcarCarregado(); }
    else setErro(lista.reason instanceof Error ? lista.reason.message : "Falha ao carregar os produtos.");
    setCarregando(false);
  }, [escopo]);

  useEffect(() => { void carregar(); }, [carregar]);

  // A lista mostra TUDO. Existia aqui um "Só os que precisam repor" que nascia
  // ligado na aba Estoque e filtrava por `stock <= minimumStock` (o mínimo
  // nasce em 5). O efeito: quem lançava a entrada via o produto SUMIR no
  // instante em que passava do mínimo — o ajuste tinha gravado, e na tela
  // parecia que não salvou. Quando a entrada era pequena e o saldo continuava
  // abaixo do mínimo, o produto ficava e atualizava; daí o "às vezes funciona".
  // O saldo crítico continua visível pela cor da pastilha e pela contagem no
  // cabeçalho, sem esconder nada de ninguém.
  //
  // A filtragem roda sobre os valores DIFERIDOS, não sobre os que a pessoa
  // acabou de mexer. Com 500+ produtos, refazer a lista inteira no mesmo
  // quadro do clique segurava a tela: a pastilha da categoria só acendia
  // depois de o React montar as centenas de linhas novas (medido em 454ms
  // num Mac, sem foto nenhuma). Diferido, a pastilha acende no toque e a
  // lista chega logo atrás.
  const visiveis = useMemo(() => produtos
    .filter((p) => p.name.toLowerCase().includes(buscaDiferida.toLowerCase()) || (p.barcode ?? "").includes(buscaDiferida))
    .filter((p) => mostrarInativos || p.active)
    // "__sem" é uma opção de verdade, não a ausência de filtro: achar o que
    // ainda falta categorizar é justamente o trabalho de quem organiza.
    .filter((p) => !categoriaDiferida || (categoriaDiferida === "__sem" ? !p.categoryName : p.categoryName === categoriaDiferida))
    .sort((a, b) => a.name.localeCompare(b.name)), [produtos, buscaDiferida, mostrarInativos, categoriaDiferida]);

  // Nada fica inalcançável: a busca e os filtros varrem o catálogo INTEIRO, e
  // o que muda aqui é só quantas linhas são montadas de uma vez. Rolar até o
  // fim carrega o próximo pedaço sozinho; o botão é a saída pra quem não rola
  // (e pra quando o observador não existe). 573 linhas de uma vez são 20 mil
  // nós de DOM — é isso que trava o clique.
  const mostrados = useMemo(() => visiveis.slice(0, limite), [visiveis, limite]);
  const faltam = visiveis.length - mostrados.length;

  // Filtro novo recomeça do primeiro pedaço: sem isto, trocar de categoria
  // depois de ter rolado muito montaria de novo tudo o que já estava aberto.
  useEffect(() => { setLimite(PAGINA); }, [categoriaDiferida, buscaDiferida, mostrarInativos]);

  // "Está desenhando" — a lista antiga continua na tela enquanto a nova é
  // montada, então sem um sinal a pessoa acha que o clique não pegou.
  const atualizando = categoria !== categoriaDiferida || busca !== buscaDiferida;

  // Rolou até o fim da lista? Abre o próximo pedaço sozinho. Quem rola nunca
  // esbarra num botão; o botão fica pra quem prefere clicar (e pra navegador
  // sem IntersectionObserver).
  const sentinela = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const alvo = sentinela.current;
    if (!alvo || faltam <= 0 || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) setLimite((n) => n + PAGINA);
    }, { rootMargin: "600px" });   // abre ANTES de chegar, pra não piscar vazio
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [faltam]);

  // Categorias que REALMENTE aparecem nos produtos carregados, com a contagem.
  // Listar as do banco mostraria prateleiras vazias; e o filtro precisa contar
  // pra pessoa ver de longe o tamanho de "Sem categoria".
  const categoriasNaLista = useMemo(() => {
    const conta = new Map<string, number>();
    let sem = 0;
    for (const p of produtos) {
      if (!mostrarInativos && !p.active) continue;
      if (p.categoryName) conta.set(p.categoryName, (conta.get(p.categoryName) ?? 0) + 1);
      else sem++;
    }
    return {
      lista: [...conta.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR")),
      sem,
    };
  }, [produtos, mostrarInativos]);

  const criticos = produtos.filter((p) => p.stock <= p.minimumStock).length;
  const inativos = produtos.filter((p) => !p.active).length;

  // Lista de empresas para o ajuste, e QUAL delas é a dona dos números da
  // tela. `perfilAtivo` cai na primeira ativa quando ninguém escolheu, e é
  // exatamente esse caso silencioso que precisava de nome na tela.
  const empresasAtivas: Unidade[] = empresas.length
    ? empresas.filter((u) => u.ativo)
    : (settings?.profiles ?? []).map((p) => ({ id: p.id, nome: p.name, ativo: true }));
  const empresaDaLista = empresasAtivas.find((u) => u.id === perfilAtivo) ?? null;

  // Devolve `true` só quando gravou. Quem abre modal precisa disso: fechar
  // sempre esconderia a falha atrás da tela, e a mensagem de erro fica no
  // corpo da página — no celular, embaixo da folha, onde ninguém vê.
  async function acao(corpo: unknown, rota: string, metodo: "POST" | "PATCH", sucesso: string): Promise<boolean> {
    setErro(null); setAviso(null);
    try {
      await marketRequest(rota, { method: metodo, body: JSON.stringify(corpo) });
      setAviso(sucesso); setAlvo(null); await carregar();
      return true;
    } catch (e) {
      // O servidor manda `detalhe` explicando em português ("Só há 3 un. em
      // estoque…"); sem isto a tela mostrava só o código cru do erro, tipo
      // "invalid_inventory_adjustment", que não diz o que fazer.
      const corpoErro = (e as Error & { payload?: { detalhe?: string } }).payload;
      setErro(corpoErro?.detalhe || (e instanceof Error ? e.message : "Não foi possível salvar."));
      return false;
    }
  }

  // Ajuste de estoque tem caminho próprio, separado do `acao` genérico, por
  // causa da queixa que o originou: "não tenho certeza se está diminuindo".
  // O servidor devolve ANTES e DEPOIS; a tela mostra os dois, com o nome da
  // empresa, e corrige a linha na hora — sem esperar o catálogo recarregar e
  // sem depender de a pessoa achar o produto de novo pra conferir.
  async function ajustarEstoque(produto: MarketProduct, empresaId: string, delta: number, motivo: string, destinoId?: string): Promise<boolean> {
    setErro(null); setAviso(null);
    const nomeDe = (id: string) => empresas.find((u) => u.id === id)?.nome
      ?? settings?.profiles.find((p) => p.id === id)?.name
      ?? "a empresa escolhida";
    try {
      // Transferência tem resposta própria: os DOIS saldos, mais o aviso de
      // produto sem preço no destino (com saldo e sem preço, ele não aparece no
      // tablet de lá — é o "transferi e não apareceu").
      if (destinoId) {
        const t = await marketRequest<{ origem: number; destino: number; semPrecoNoDestino?: boolean }>("inventory", {
          method: "POST",
          body: JSON.stringify({ productId: produto.id, profileId: empresaId, toProfileId: destinoId, delta, reason: motivo }),
        });
        setAviso(`${produto.name}: ${Math.abs(delta)} un. de ${nomeDe(empresaId)} para ${nomeDe(destinoId)}.`
          + ` Ficou ${t.origem} aqui e ${t.destino} lá.`
          + (t.semPrecoNoDestino ? ` Atenção: o produto não tem preço em ${nomeDe(destinoId)}, então não aparece no tablet de lá até você definir um.` : ""));
        setTimeout(() => setAviso(null), 10000);
        if (empresaId === perfilAtivo) {
          setProdutos((atual) => atual.map((p) => (p.id === produto.id ? { ...p, stock: t.origem } : p)));
        } else if (destinoId === perfilAtivo) {
          setProdutos((atual) => atual.map((p) => (p.id === produto.id ? { ...p, stock: t.destino } : p)));
        }
        void carregar();
        return true;
      }
      const r = await marketRequest<{ before: number; quantity: number }>("inventory", {
        method: "POST",
        body: JSON.stringify({ productId: produto.id, profileId: empresaId, delta, reason: motivo }),
      });
      const nome = nomeDe(empresaId);
      setAviso(`${produto.name}: ${r.before} → ${r.quantity} un. em ${nome}.`);
      setTimeout(() => setAviso(null), 6000);
      // Só dá pra corrigir a linha quando o ajuste foi na MESMA empresa que a
      // lista carregou. Em outra empresa o número da tela continua sendo o
      // daqui, e mexer nele seria mentir — o aviso acima é que conta a verdade.
      if (empresaId === perfilAtivo) {
        setProdutos((atual) => atual.map((p) => (p.id === produto.id ? { ...p, stock: r.quantity } : p)));
      }
      void carregar();
      return true;
    } catch (e) {
      const corpoErro = (e as Error & { payload?: { detalhe?: string } }).payload;
      setErro(corpoErro?.detalhe || (e instanceof Error ? e.message : "Não foi possível salvar."));
      return false;
    }
  }

  // A tabela tinha 620px de largura mínima e três ações de texto na última
  // coluna: no celular ela rolava de lado e as ações ficavam fora da tela junto
  // com o nome do produto. O DataList mantém a tabela no computador e vira
  // cartão no celular, com as ações no rodapé de cada produto.
  //
  // Produto inativo aparece esmaecido. Como o esmaecido era da LINHA e o cartão
  // não tem linha, cada célula recebe a opacidade — dá no mesmo nos dois modos.
  const colunas: Coluna<MarketProduct>[] = useMemo(() => {
    const fraco = (p: MarketProduct, conteudo: React.ReactNode) =>
      <span style={{ opacity: p.active ? 1 : 0.55 }}>{conteudo}</span>;
    // No cartão, ação em texto puro vira um alvo alto e estreito difícil de
    // acertar (e "Inativar" acaba colada na vizinha). Vira botão com borda,
    // só no celular — a tabela do computador continua com o texto solto.
    const varAcao = celular ? "secundario" as const : "sutil" as const;
    return [
      {
        chave: "nome", titulo: "Produto", papel: "titulo",
        render: (p) => fraco(p, (
          <span style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <Miniatura url={p.imageUrl} nome={p.name} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 650, color: "var(--text)" }}>{p.name}</span>
                {!p.active && <Badge>inativo</Badge>}
                {p.semCodigo && <Badge tone="warn">sem código</Badge>}
                {p.ocultoBusca && <Badge>fora da busca</Badge>}
              </span>
              <span style={{ display: "block", fontSize: 11, fontWeight: 400, color: "var(--text-dim)" }}>{p.barcode || "sem código de barras"}</span>
            </span>
          </span>
        )),
      },
      { chave: "categoria", titulo: "Categoria", render: (p) => fraco(p, <span style={{ color: "var(--text-dim)" }}>{p.categoryName || "—"}</span>) },
      // Preço é o que se procura primeiro num catálogo: vai em evidência no cartão.
      { chave: "preco", titulo: "Preço", papel: "destaque", render: (p) => fraco(p, <span style={{ color: "var(--text)", fontWeight: 650 }}>{formatMarketCurrency(p.price)}</span>) },
      {
        // O título diz DE QUEM é o número. O seletor do topo mostrava "Todas
        // as empresas" enquanto a coluna trazia o saldo de UMA (a primeira em
        // ordem alfabética) — daí a dúvida legítima de "não sei se está
        // diminuindo": o número podia ser de outra loja que não a ajustada.
        chave: "estoque", titulo: empresaDaLista ? `Estoque · ${empresaDaLista.nome}` : "Estoque",
        render: (p) => fraco(p, <Badge tone={p.stock <= 0 ? "neg" : p.stock <= p.minimumStock ? "warn" : "pos"}>{p.stock} un.</Badge>),
      },
      { chave: "minimo", titulo: "Mínimo", render: (p) => fraco(p, <span style={{ color: "var(--text-dim)" }}>{p.minimumStock}</span>) },
      {
        chave: "acoes", titulo: "", papel: "acoes", alinhar: "right",
        render: (p) => (
          // flexWrap + gap: no computador é a mesma fileira de sempre; no cartão
          // as ações quebram em linha nova em vez de vazar.
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 14 }}>
            {/* Estoque é por empresa e a empresa se escolhe DENTRO do modal:
                este botão não depende do filtro do topo estar preenchido. */}
            <Botao variante={varAcao} tamanho="sm" onClick={() => setAjustando(p)}>Ajustar estoque</Botao>
            <Botao variante={varAcao} tamanho="sm" onClick={() => setAlvo(p)} disabled={!perfilAtivo}>Editar</Botao>
            {/* "Sem código" e "Fora da busca" saíram daqui: as duas chaves já
                existem nas configurações do produto (os Toggles do
                ModalProduto), com a explicação do que cada uma faz. Como
                atalho na linha eram só dois rótulos sem contexto, e ainda
                empurravam "Inativar" pra perto do dedo no celular.
                As pastilhas ao lado do nome continuam mostrando o estado. */}
            {/* INATIVAR, não apagar: excluir de verdade quebraria o
                histórico de vendas — as compras antigas apontariam
                para um produto inexistente. Inativo some do totem na hora. */}
            <Botao variante={p.active ? "perigo" : varAcao} tamanho="sm"
              onClick={() => acao({ id: p.id, active: !p.active }, "products", "PATCH",
                p.active ? `${p.name} foi inativado e sumiu do tablet.` : `${p.name} voltou para o tablet.`)}>
              {p.active ? "Inativar" : "Reativar"}
            </Botao>
          </span>
        ),
      },
    ];
    // `acao` é recriada a cada render (fecha sobre setState); ela não muda de
    // comportamento, então fica de fora das dependências de propósito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfilAtivo, celular, empresaDaLista?.nome]);

  return (
    <>
      <Cabecalho
        titulo="Produtos"
        descricao={empresaDaLista
          // Dizer de quem é o número no subtítulo também: o seletor do topo
          // pode estar em "Todas as empresas", mas preço e estoque na tela são
          // sempre de UMA — e sem nome ninguém confere se ajustou a certa.
          ? `${produtos.length} itens · preço e estoque de ${empresaDaLista.nome} · ${criticos} abaixo do mínimo`
          : `${produtos.length} itens no catálogo · ${criticos} abaixo do mínimo`}
        filtros={filtros} setFiltros={setFiltros} perfis={settings?.profiles ?? []}
        carregando={carregando} onAtualizar={() => void carregar()} />

      {erro && <Aviso tom="neg" icone="circle-x" titulo="Não foi possível concluir">{erro}</Aviso>}
      {aviso && <Aviso tom="pos" icone="circle-check" titulo="Pronto">{aviso}</Aviso>}
      {!perfilAtivo && <Aviso tom="warn" icone="alert-triangle" titulo="Escolha uma empresa">Preço e estoque são POR UNIDADE — sem escolher a empresa não dá para saber onde aplicar a mudança.</Aviso>}

      {/* Prateleiras. .tab-strip (fundação): com muitas categorias a fileira
          não cabe no celular e rola de lado, em vez de espremer os rótulos. */}
      {(categoriasNaLista.lista.length > 0 || categoriasNaLista.sem > 0) && (
        <div className="tab-strip" style={{ gap: 8, marginBottom: 10 }}>
          {[
            { v: "", nome: "Todas", n: null as number | null },
            ...categoriasNaLista.lista.map(([nome, n]) => ({ v: nome, nome, n })),
            ...(categoriasNaLista.sem > 0 ? [{ v: "__sem", nome: "Sem categoria", n: categoriasNaLista.sem }] : []),
          ].map((c) => {
            const on = categoria === c.v;
            return (
              <button key={c.v || "todas"} onClick={() => setCategoria(c.v)} aria-pressed={on}
                style={{ flex: "none", whiteSpace: "nowrap", minHeight: "var(--tap)", padding: "0 14px", borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: "pointer", border: `1px solid ${on ? INDIGO : "var(--border)"}`, background: on ? "color-mix(in srgb, " + INDIGO + " 14%, transparent)" : "var(--surface)", color: on ? INDIGO : "var(--text)" }}>
                {c.nome}{c.n != null && <span style={{ opacity: 0.6, marginLeft: 5 }}>{c.n}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Busca valor={busca} onChange={setBusca} placeholder="Buscar produto ou código de barras" />
        {inativos > 0 && (
          <Alternar rotulo={`Mostrar inativos (${inativos})`} ativo={mostrarInativos} onClick={() => setMostrarInativos((v) => !v)} />
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10, flexWrap: "wrap" }}>
          <Botao icone="camera"
            onClick={() => (perfilAtivo ? setNotaAberta(true) : setErro("Escolha uma empresa antes de subir a nota."))}>
            Adicionar nota
          </Botao>
          <Botao variante="primario" icone="plus"
            onClick={() => (perfilAtivo ? setCadastrando(true) : setErro("Escolha uma empresa antes de cadastrar — preço e estoque são por empresa."))}>
            Novo produto
          </Botao>
        </span>
      </div>

      {desatualizado && !erro ? <SkelTabela n={8} colunas={6} /> : (
      <Card style={{ padding: 0, overflow: "hidden" }}>
        {/* Respiro só no celular: lá o DataList vira cartões e eles não podem
            encostar na borda do Card. No computador a tabela segue rente. */}
        <div style={{
          padding: celular && mostrados.length ? 10 : 0,
          // Enquanto a lista nova é montada, a antiga continua no lugar. O
          // esmaecido é o aviso de "já peguei o clique" — sem ele a tela fica
          // parecendo congelada, que é exatamente a queixa.
          opacity: atualizando ? 0.55 : 1,
          transition: "opacity .12s ease-out",
        }}>
          <DataList itens={mostrados} colunas={colunas} chaveDe={(p) => String(p.id)} minWidth={620}
            vazio={<Empty icon="package" title="Nenhum produto encontrado" text="Ajuste a busca, o filtro ou a empresa." />} />
        </div>
        {faltam > 0 && (
          // A sentinela carrega o pedaço seguinte quando chega perto do fim —
          // rolando, a lista é contínua e ninguém precisa clicar em nada.
          <div ref={sentinela} style={{ padding: 12, display: "grid", placeItems: "center" }}>
            <Botao onClick={() => setLimite((n) => n + PAGINA)}>
              Mostrar mais {faltam} produto{faltam === 1 ? "" : "s"}
            </Botao>
          </div>
        )}
      </Card>
      )}

      {cadastrando && (
        <ModalProduto produto={null} unidadeId={perfilAtivo}
          unidades={empresas.length ? empresas : (settings?.profiles ?? []).map((p) => ({ id: p.id, nome: p.name, ativo: true }))}
          onFechar={() => setCadastrando(false)}
          onSalvo={() => { void carregar(); setAviso("Produto cadastrado."); setTimeout(() => setAviso(null), 2600); }} />
      )}

      {/* Editar produto usa o MESMO formulário do cadastro: o antigo só tinha
          nome, preço e mínimo — não havia como trocar a foto de um produto já
          publicado, nem levá-lo pra outra empresa. */}
      {alvo && (
        <ModalProduto
          produto={{
            id: alvo.id, nome: alvo.name, imagemUrl: alvo.imageUrl ?? null, preco: alvo.price,
            ativo: alvo.active, semCodigo: alvo.semCodigo ?? false, minimo: alvo.minimumStock ?? null,
            // Sem passar `ocultoBusca`, o Toggle do formulário nascia apagado
            // e o Salvar mandava `false` junto — o produto voltava calado pra
            // busca do tablet. Passava batido enquanto existia o atalho na
            // linha pra desfazer; agora Editar é o único lugar que controla.
            ocultoBusca: alvo.ocultoBusca ?? false,
            unidades: alvo.unidades ?? [],
            codigoBarras: alvo.barcode ?? null,
            // Sem passar a categoria atual, o formulário abriria em "Sem
            // categoria" e o salvar apagaria a que o produto já tinha.
            categoriaId: alvo.categoryId ?? null,
          }}
          unidadeId={perfilAtivo}
          unidades={empresas.length ? empresas : (settings?.profiles ?? []).map((p) => ({ id: p.id, nome: p.name, ativo: true }))}
          onFechar={() => setAlvo(null)}
          onSalvo={() => { void carregar(); setAviso("Produto atualizado."); setTimeout(() => setAviso(null), 2600); }} />
      )}
      {ajustando && (
        <ModalEstoque
          produto={ajustando}
          empresas={empresasAtivas}
          empresaInicial={perfilAtivo}
          // O saldo da lista só vale pra empresa carregada no topo. Trocar de
          // empresa dentro do modal mostraria um "estoque atual" de outra loja,
          // então quem sabe o número é só esta.
          empresaDaLista={perfilAtivo}
          onFechar={() => setAjustando(null)}
          onSalvar={async (empresaId, delta, motivo, destinoId) => {
            const ok = await ajustarEstoque(ajustando, empresaId, delta, motivo, destinoId);
            // Falhou (saldo insuficiente, empresa sem permissão): a folha fica
            // aberta com o número digitado. Fechar aqui apagaria o trabalho e
            // deixaria a pessoa achando que gravou.
            if (ok) setAjustando(null);
            return ok;
          }} />
      )}
      {notaAberta && (
        <ModalNota
          profileId={perfilAtivo}
          companyId={produtos[0]?.companyId ?? 4}
          produtos={produtos}
          onClose={() => setNotaAberta(false)}
          onDone={(msg) => { setNotaAberta(false); setAviso(`Nota lançada: ${msg}`); void carregar(); }}
        />
      )}
    </>
  );
}

// (ModalPreco saiu: editar produto agora usa o mesmo formulário do cadastro,
// que tem foto e empresas. Ele só tinha nome, preço e mínimo.)

export function Alternar({ rotulo, ativo, onClick }: { rotulo: string; ativo: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={ativo}
      style={{
        padding: "9px 14px", borderRadius: "var(--r-sm)", cursor: "pointer", fontSize: 12.5, fontWeight: 700,
        border: `1px solid ${ativo ? INDIGO : "var(--border)"}`,
        background: ativo ? `color-mix(in srgb, ${INDIGO} 12%, transparent)` : "var(--surface)",
        color: ativo ? INDIGO : "var(--text-dim)",
      }}>{rotulo}</button>
  );
}

type ModoAjuste = "entrada" | "saida" | "contagem" | "transferencia";

// O produto é global; o ESTOQUE é da empresa. Por isso a empresa se escolhe
// aqui dentro, no momento do ajuste, e não no filtro do topo: a mesma caixa de
// Doritos que entra no mercadinho da fábrica não entra no do escritório.
function ModalEstoque({ produto, empresas, empresaInicial, empresaDaLista, onFechar, onSalvar }: {
  produto: MarketProduct;
  empresas: Unidade[];
  empresaInicial: string;
  empresaDaLista: string;
  onFechar: () => void;
  onSalvar: (empresaId: string, delta: number, motivo: string, destinoId?: string) => Promise<boolean>;
}) {
  const [empresa, setEmpresa] = useState(empresaInicial || empresas[0]?.id || "");
  // Três jeitos de dizer a mesma coisa, porque na loja são três situações
  // diferentes. "Entrou/Saiu" pedem a quantidade movimentada, que é o número
  // que a pessoa tem na mão (a caixa que chegou, as 2 que quebraram).
  // "Contagem" pede o total conferido na prateleira — quem está contando não
  // quer calcular diferença nenhuma, e era esse o cálculo que o campo
  // "Variação" obrigava a fazer de cabeça, com sinal de menos e tudo.
  const [modo, setModo] = useState<ModoAjuste>("entrada");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [destino, setDestino] = useState("");
  const [salvando, setSalvando] = useState(false);

  // O saldo que a lista carregou é o da empresa do topo. Escolhida outra, o
  // número deixa de valer — mostrar o antigo faria a conta "fica com X" mentir.
  const saldoConhecido = empresa === empresaDaLista;
  const n = Math.abs(Math.trunc(Number(valor) || 0));
  const transferindo = modo === "transferencia";
  // Na transferência o `delta` é a quantidade que SAI da origem; o servidor
  // aplica a outra ponta. Aqui ele é negativo só pra conta da tela bater.
  const delta = modo === "entrada" ? n
    : modo === "saida" || transferindo ? -n
    : n - produto.stock;
  const resultado = modo === "contagem" ? n : produto.stock + delta;
  // Contagem só faz sentido com saldo conhecido: sem ele não há de onde tirar
  // a diferença. Trocar de empresa volta pra entrada/saída, que independem.
  const podeContar = saldoConhecido;
  // Transferir exige ter pra onde: com uma empresa só não há segunda ponta.
  const podeTransferir = empresas.length > 1;
  const destinos = empresas.filter((u) => u.id !== empresa);

  const ATALHOS = modo === "contagem" ? [0, 1, 5, 10, 20] : [1, 2, 5, 10, 12, 24];
  const passo = (d: number) => setValor(String(Math.max(0, n + d)));

  return (
    <Modal
      titulo={`Ajustar ${produto.name}`}
      descricao={saldoConhecido
        ? `Hoje tem ${produto.stock} un. em ${empresas.find((u) => u.id === empresa)?.nome ?? "estoque"}.`
        : "Escolha a empresa para ver o saldo dela."}
      onFechar={onFechar}
      onEnviar={async () => {
        setSalvando(true);
        await onSalvar(empresa, delta, motivo.trim(), transferindo ? destino : undefined);
        setSalvando(false);
      }}
      salvando={salvando}
      // Delta zero não é ajuste nenhum, e baixa maior que o saldo o banco
      // recusa (a coluna tem CHECK >= 0). Travar aqui evita a ida e volta.
      // Transferência sem destino escolhido também não vai.
      bloqueado={delta === 0 || (saldoConhecido && resultado < 0) || (transferindo && !destino)}>
      {/* Empresa primeiro: é a pergunta que muda o significado do número. Na
          transferência ela é a ORIGEM — de onde a mercadoria sai. */}
      <label style={rotulo} htmlFor="ajuste-empresa">{transferindo ? "De (sai daqui)" : "Empresa"}</label>
      <select id="ajuste-empresa" value={empresa}
        onChange={(e) => {
          setEmpresa(e.target.value);
          if (modo === "contagem") setModo("entrada");
          // O destino não pode ser a origem: se virou, esvazia e obriga a
          // escolher de novo, em vez de mandar as duas iguais pro servidor.
          if (e.target.value === destino) setDestino("");
        }}
        style={{ ...campo, minHeight: "var(--tap)" }}>
        {empresas.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
      </select>

      {/* <div> e não <label>: rótulo envolvendo grupo de botões dispara o
          primeiro deles no clique e troca a seleção sozinho. */}
      <div style={{ ...rotulo, marginTop: 14 }}>O que aconteceu</div>
      <div role="group" aria-label="O que aconteceu" style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {(([
          { k: "entrada", txt: "Entrou", icone: "plus" },
          { k: "saida", txt: "Saiu", icone: "minus" },
          ...(podeContar ? [{ k: "contagem", txt: "Contei", icone: "list-check" }] : []),
          ...(podeTransferir ? [{ k: "transferencia", txt: "Transferi", icone: "truck-delivery" }] : []),
        ]) as Array<{ k: ModoAjuste; txt: string; icone: string }>).map((op) => {
          const on = modo === op.k;
          return (
            <button key={op.k} type="button" onClick={() => { setModo(op.k); setValor(""); }} aria-pressed={on}
              style={{
                flex: "1 1 44%", minHeight: "var(--tap)", borderRadius: "var(--r-sm)", cursor: "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                border: `1px solid ${on ? INDIGO : "var(--border)"}`,
                background: on ? `color-mix(in srgb, ${INDIGO} 14%, transparent)` : "var(--surface)",
                color: on ? INDIGO : "var(--text)",
              }}>
              <Icon name={op.icone} size={15} color={on ? INDIGO : "var(--text-dim)"} /> {op.txt}
            </button>
          );
        })}
      </div>

      {transferindo && (
        <>
          <label style={{ ...rotulo, marginTop: 2 }} htmlFor="ajuste-destino">Para (entra aqui)</label>
          <select id="ajuste-destino" required value={destino} onChange={(e) => setDestino(e.target.value)}
            style={{ ...campo, minHeight: "var(--tap)", marginBottom: 14 }}>
            <option value="" disabled>Escolha a empresa que recebe…</option>
            {destinos.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </>
      )}

      <label style={rotulo} htmlFor="ajuste-variacao">
        {transferindo ? "Quantas vão"
          : modo === "contagem" ? "Quantas tem na prateleira"
          : modo === "saida" ? "Quantas saíram"
          : "Quantas entraram"}
      </label>
      {/* Botão −, número, botão +: ajustar de um em um sem teclado nenhum era
          o que faltava. O campo continua aceitando digitar, com teclado
          numérico (`inputMode`), pra quantidade grande. */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <BotaoIcone icone="minus" titulo="Menos um" variante="secundario" onClick={() => passo(-1)} disabled={n <= 0} style={{ flex: "none" }} />
        <input id="ajuste-variacao" type="number" step="1" min="0" inputMode="numeric" required autoFocus
          value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0"
          style={{ ...campo, textAlign: "center", fontSize: 20, fontWeight: 800, minHeight: "var(--tap)" }} />
        <BotaoIcone icone="plus" titulo="Mais um" variante="secundario" onClick={() => passo(1)} style={{ flex: "none" }} />
      </div>

      {/* Atalhos das quantidades que mais aparecem — a caixa de 12, a de 24. */}
      <div className="tab-strip" style={{ gap: 6, marginTop: 8 }}>
        {ATALHOS.map((q) => (
          // var(--tap) e não 34px: atalho é alvo de toque como qualquer outro,
          // e num dedo de polegar 34px erra pro vizinho — aqui o vizinho de
          // "+1" é "+24".
          <button key={q} type="button" onClick={() => setValor(String(q))}
            style={{ flex: "none", minHeight: "var(--tap)", minWidth: 48, padding: "0 12px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 700, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-dim)" }}>
            {modo === "saida" ? `−${q}` : modo === "entrada" ? `+${q}` : q}
          </button>
        ))}
      </div>

      {/* A conta, escrita. É a resposta pro "não tenho certeza se está
          diminuindo": o número de antes, a seta e o de depois, antes de salvar. */}
      {saldoConhecido && (
        <p aria-live="polite" style={{
          margin: "14px 0 0", padding: "10px 12px", borderRadius: "var(--r-sm)",
          background: "var(--surface-2)", fontSize: 14, color: "var(--text-dim)", textAlign: "center",
        }}>
          {n === 0 && modo !== "contagem" ? "Escolha a quantidade." : (
            <>
              <strong style={{ color: "var(--text)" }}>{produto.stock} un.</strong>
              {" → "}
              <strong style={{ color: resultado < produto.stock ? "var(--tf-warn)" : "var(--tf-pos)", fontSize: 17 }}>
                {resultado} un.
              </strong>
              {delta !== 0 && (
                <span style={{ display: "block", fontSize: 12, marginTop: 2 }}>
                  {transferindo
                    // Na transferência o número não desaparece: ele muda de
                    // lugar. Dizer pra onde é o que diferencia isto de uma baixa.
                    ? `${n} un. vão para ${empresas.find((u) => u.id === destino)?.nome ?? "a outra empresa"}`
                    : delta > 0 ? `entrada de ${delta}` : `baixa de ${Math.abs(delta)}`}
                </span>
              )}
              {delta === 0 && <span style={{ display: "block", fontSize: 12, marginTop: 2 }}>não muda nada — nada a salvar</span>}
            </>
          )}
        </p>
      )}
      {resultado < 0 && (
        <p style={{ fontSize: 12, color: "var(--tf-warn)", margin: "7px 0 0" }}>
          {transferindo
            ? `Não dá para transferir mais do que existe: há ${produto.stock} un. aqui.`
            : `Não dá para baixar mais do que existe: há ${produto.stock} un.`}
        </p>
      )}
      {transferindo && !destino && n > 0 && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", margin: "7px 0 0" }}>
          Falta dizer para onde as {n} un. vão.
        </p>
      )}

      {/* Observação, não "Motivo": era obrigatória (`required` + `min(3)` no
          servidor) e travava o caso mais comum — repor o que acabou de chegar
          não tem o que explicar. Quem quiser registrar, registra. */}
      <label style={{ ...rotulo, marginTop: 14 }} htmlFor="ajuste-motivo">Observação <span style={{ fontWeight: 400, textTransform: "none" }}>(opcional)</span></label>
      <input id="ajuste-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ex.: reposição do fornecedor" style={campo} />
    </Modal>
  );
}

export function Modal({ titulo, descricao, children, onFechar, onEnviar, salvando, bloqueado }: {
  titulo: string; descricao?: string; children: React.ReactNode;
  onFechar: () => void; onEnviar: () => Promise<void>; salvando: boolean;
  /** Trava o Salvar quando o formulário ainda não faz sentido (ex.: baixa
   *  maior que o saldo). Só o servidor recusar significa esperar a ida e volta
   *  pra descobrir o óbvio — e no meio disso a pessoa acha que gravou. */
  bloqueado?: boolean;
}) {
  return (
    // .sheet-host/.sheet: no celular vira folha presa embaixo, com rolagem
    // interna — centralizado, o botão Salvar ficava atrás do teclado. No
    // computador as classes não existem e nada muda.
    <div onClick={onFechar} className="sheet-host" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", zIndex: 200, padding: 20 }}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          // Tirar o foco do campo ANTES de esperar a rede: enquanto o input
          // segue focado o teclado do celular fica de pé cobrindo a folha, e
          // o "Salvando…" acontece atrás dele. Com o blur o teclado desce no
          // toque do botão, e não só quando a resposta chega.
          (document.activeElement as HTMLElement | null)?.blur?.();
          void onEnviar();
        }}
        className="sheet"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 22, width: "min(460px, 100%)" }}>
        <strong style={{ fontSize: 17, color: "var(--text)", display: "block" }}>{titulo}</strong>
        {descricao && <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "6px 0 16px" }}>{descricao}</p>}
        {children}
        <div style={{ display: "flex", gap: 9, justifyContent: "flex-end", marginTop: 20 }}>
          {/* var(--tap): alvo de 44px pelo estilo do próprio botão, sem depender
              de altura herdada — é o mínimo de toque da fundação. */}
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" type="submit" carregando={salvando} disabled={bloqueado}>{salvando ? "Salvando…" : "Salvar"}</Botao>
        </div>
      </form>
    </div>
  );
}

// Miniatura quadrada com a embalagem INTEIRA (`contain`). Com `cover` a foto
// era cortada no topo e no rodapé — justamente onde ficam marca e sabor, a
// única diferença visível entre dez lasanhas na mesma lista.
//
// Fundo branco fixo (não `--surface-2`): a foto já é normalizada com fundo
// branco no upload, então a sobra da margem tem que ser da mesma cor, senão
// aparece uma moldura em volta do produto no tema escuro.
function Miniatura({ url, nome }: { url: string | null; nome: string }) {
  if (url) {
    // `loading="lazy"` não é detalhe: o catálogo passa de 500 produtos e sem
    // ele o navegador dispara uma requisição por foto ao abrir a tela, todas
    // com prioridade alta, disputando banda com a própria API. `width`/`height`
    // vão no atributo pro espaço já nascer reservado, sem pulo de layout.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" loading="lazy" decoding="async" width={40} height={40}
      style={{ width: 40, height: 40, borderRadius: "var(--r-xs)", objectFit: "contain", flex: "none", background: "#fff" }} />;
  }
  return <span style={{ width: 40, height: 40, borderRadius: "var(--r-xs)", flex: "none", display: "grid", placeItems: "center", background: "var(--surface-2)", color: "var(--text-dim)", fontSize: 12, fontWeight: 800 }}>{nome[0]?.toUpperCase()}</span>;
}

export const rotulo: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "var(--text-dim)", marginBottom: 5 };
export const campo: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: "var(--r-sm)", border: "1px solid var(--border)",
  background: "var(--surface-2)", color: "var(--text)", fontSize: 14,
};
