"use client";

// ── Configurações da loja ────────────────────────────────────────────────────
// Como a loja vende, e um resumo de onde ela mora.
//
// O DOMÍNIO saiu daqui. Esta tela tinha três passos completos — cadastrar o
// endereço, apontar o DNS, liberar na hospedagem — e eles eram os mesmos de
// `/lojas/<id>/dominios`, que era um "em breve". Duas cópias da mesma instrução
// viram duas instruções diferentes na primeira correção, e quem seguir a
// desatualizada aponta o DNS errado e passa horas achando que o sistema está
// quebrado. Agora existe um lugar só, e aqui fica o resumo.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "../../../Icon";
import { Cabecalho } from "../../ui";
import { Fila } from "../../../ui/micro";
import "./configuracoes.css";
import { Botao, Campo } from "../../../ui/controles";
import { toast } from "../../../Toast";
import { ACEITA_WHATSAPP, ROTULO_LOJA, normalizarWhatsApp, telefoneBonito, urlDaLoja, type Loja, type ModoCheckout, type StatusLoja } from "@/lib/lojas";

// ── Como a loja vende ────────────────────────────────────────────────────────
// Fica ACIMA do domínio de propósito: é a decisão que muda o que o cliente
// consegue fazer na vitrine. Domínio é endereço; isto é a venda.
const MODOS: { v: ModoCheckout; titulo: string; desc: string }[] = [
  { v: "nenhum", titulo: "Só mostrar", desc: "A vitrine exibe o catálogo e não recebe pedido." },
  { v: "whatsapp", titulo: "Pelo WhatsApp", desc: "O botão abre a conversa com o pedido já escrito." },
  { v: "proprio", titulo: "Carrinho na loja", desc: "O cliente fecha o pedido na própria vitrine e ele cai em Pedidos." },
  { v: "ambos", titulo: "Os dois", desc: "O cliente escolhe: carrinho ou WhatsApp." },
];

function ComoVende({ loja }: { loja: Loja }) {
  const [modo, setModo] = useState<ModoCheckout>(loja.checkout);
  const [zap, setZap] = useState(loja.whatsapp ? telefoneBonito(loja.whatsapp) : "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const precisaZap = ACEITA_WHATSAPP(modo);

  async function salvar() {
    setErro("");
    if (precisaZap && !normalizarWhatsApp(zap)) {
      setErro("Informe o número com DDD — é ele que recebe o pedido.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch("/api/lojas", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lojaId: loja.id, checkout: modo, whatsapp: zap }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(r.status === 409 ? (j.detalhe ?? "Rode o supabase/lojas-checkout.sql.") : (j.error ?? "Não deu para salvar."));
        return;
      }
      if (j.whatsapp) setZap(telefoneBonito(j.whatsapp));
      toast.ok(modo === "nenhum" ? "A vitrine volta a só mostrar." : "Pronto — a vitrine já aceita pedido.");
    } finally { setSalvando(false); }
  }

  return (
    <section className="lj-card" id="checkout" style={{ scrollMarginTop: 72 }}>
      <h2 className="lj-card-titulo">
        <Icon name="shopping-cart" size={17} color="var(--text-dim)" /> Como esta loja vende
      </h2>

      {/* Botões dentro de <div>, nunca de <label>: um <label> em volta de um
          grupo dispara o PRIMEIRO botão a cada clique no rótulo. */}
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))" }}>
        {MODOS.map((m) => {
          const on = modo === m.v;
          return (
            <button key={m.v} type="button" onClick={() => { setModo(m.v); setErro(""); }} aria-pressed={on}
              className="lj-card" style={{
                textAlign: "left", cursor: "pointer", padding: 12,
                borderColor: on ? "var(--primary)" : "var(--border)",
                background: on ? "color-mix(in srgb, var(--primary) 8%, var(--surface))" : "var(--surface)",
              }}>
              <strong style={{ display: "block", fontSize: 13.5, fontWeight: 750 }}>{m.titulo}</strong>
              <span style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.45 }}>{m.desc}</span>
            </button>
          );
        })}
      </div>

      {precisaZap && (
        <div style={{ marginTop: 13 }}>
          <Campo label="WhatsApp que recebe o pedido" erro={erro}
            dica="Com DDD. É para este número que o botão da vitrine leva.">
            {(id) => (
              <input id={id} value={zap} onChange={(e) => { setZap(e.target.value); setErro(""); }}
                type="tel" inputMode="tel" autoComplete="tel" placeholder="(14) 99854-4623" />
            )}
          </Campo>
        </div>
      )}
      {!precisaZap && erro && <p className="ui-campo-dica" data-erro="1" role="alert">{erro}</p>}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 13, flexWrap: "wrap" }}>
        <Botao variante="primario" icone="check" carregando={salvando} onClick={salvar}>Salvar</Botao>
        {modo !== "nenhum" && (
          <span style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.45 }}>
            Pagamento não é cobrado aqui: o pedido chega em <strong>Pedidos</strong> como pendente,
            e você combina pagamento e entrega com o cliente.
          </span>
        )}
      </div>
    </section>
  );
}

/**
 * O índice: o que dá pra configurar, agrupado.
 *
 * Os cartões que ainda não têm tela ficam MARCADOS como tal, e não idênticos
 * aos que funcionam. Um índice em que metade dos cartões não abre nada é pior
 * que um índice curto — a pessoa clica, não acontece nada, e passa a
 * desconfiar dos outros também.
 */
/**
 * O estado da loja: no ar ou não, e em que endereço.
 *
 * É o primeiro bloco da tela porque era o buraco: TODA loja nasce em rascunho e
 * não havia caminho nenhum pra tirá-la de lá. `/l/<slug>` respondia 404 pra todo
 * mundo, o domínio próprio não tinha o que servir, e quem ligava um endereço
 * ficava esperando uma loja que nunca ia ao ar — sem nada na tela dizendo isso.
 */
function EstadoDaLoja({ loja }: { loja: Loja }) {
  const router = useRouter();
  const [salvando, setSalvando] = useState<StatusLoja | null>(null);
  const rot = ROTULO_LOJA[loja.status];

  async function mudar(status: StatusLoja) {
    setSalvando(status);
    try {
      const r = await fetch("/api/lojas", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lojaId: loja.id, status }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(j.detalhe ?? j.error ?? "Não deu para salvar."); return; }
      toast.ok(
        status === "publicada" ? "Loja no ar."
        : status === "pausada" ? "Loja pausada — quem acessar vê que ela voltou pro rascunho."
        : "Loja de volta ao rascunho.",
      );
      // `refresh` e não estado local: quem lê o status é o SERVIDOR (a barra
      // lateral, o card em Minhas lojas, o Início). Sem isto a tela dizia
      // "publicada" e o resto do painel continuava dizendo "rascunho".
      router.refresh();
    } finally { setSalvando(null); }
  }

  const endereco = urlDaLoja(loja);

  return (
    <section className="lj-card cfg-estado">
      <div className="cfg-estado-topo">
        <h2 className="lj-card-titulo">
          <Icon name="world" size={17} color="var(--text-dim)" /> Estado da loja
        </h2>
        <span className="cfg-pill" style={{
          background: `color-mix(in srgb, ${rot.cor} 16%, transparent)`, color: rot.cor,
        }}>
          <span className="lj-ponto" style={{ background: rot.cor }} aria-hidden="true" /> {rot.txt}
        </span>
      </div>

      {loja.status === "publicada" ? (
        <p className="cfg-estado-txt">
          No ar em{" "}
          <a href={endereco} target="_blank" rel="noreferrer noopener">{endereco.replace(/^https?:\/\//, "")}</a>.
        </p>
      ) : (
        <p className="cfg-estado-txt cfg-estado-txt--alerta">
          <Icon name="alert-triangle" size={15} color="var(--atencao)" />
          <span>
            A loja <strong>não está no ar</strong>: quem abrir o endereço recebe &quot;página não encontrada&quot;.
            Enquanto ela estiver em rascunho, nem o endereço padrão nem o domínio próprio abrem a vitrine.
          </span>
        </p>
      )}

      {loja.dominioPendente && (
        <p className="cfg-estado-txt cfg-estado-txt--alerta">
          <Icon name="alert-triangle" size={15} color="var(--atencao)" />
          <span>
            <strong>{loja.dominioPendente}</strong> está ligado a esta loja, mas ainda não responde — falta
            apontar o DNS. Enquanto isso a loja continua atendendo no endereço padrão.{" "}
            <a href="#dominio">Ver o passo do DNS</a>
          </span>
        </p>
      )}

      <div className="cfg-estado-acoes">
        {loja.status !== "publicada" && (
          <Botao variante="primario" icone="check" carregando={salvando === "publicada"} onClick={() => mudar("publicada")}>
            Publicar loja
          </Botao>
        )}
        {loja.status === "publicada" && (
          <Botao icone="player-pause" carregando={salvando === "pausada"} onClick={() => mudar("pausada")}>
            Pausar
          </Botao>
        )}
        <a href={endereco} target="_blank" rel="noreferrer noopener" className="ui-btn" data-v="secundario" data-t="md">
          <Icon name="external-link" size={15} color="var(--text-dim)" /> Abrir a vitrine
        </a>
      </div>
    </section>
  );
}

function IndiceDeConfiguracoes() {
  const grupos: { icone: string; titulo: string; desc: string; href?: string; externo?: boolean }[] = [
    { icone: "id-badge", titulo: "Dados da loja", desc: "Nome, logo, ícone da aba e como ela aparece na busca.", href: "../dados", externo: true },
    { icone: "shopping-cart", titulo: "Como a loja vende", desc: "Carrinho próprio, WhatsApp ou só catálogo.", href: "#checkout" },
    { icone: "world", titulo: "Domínio", desc: "O endereço em que a loja atende.", href: "#dominio" },
    { icone: "palette", titulo: "Aparência", desc: "Tema, cores e as seções da vitrine.", href: "../aparencia", externo: true },
    { icone: "package", titulo: "Produtos", desc: "Catálogo, preço e estoque.", href: "../produtos", externo: true },
    { icone: "credit-card", titulo: "Pagamentos", desc: "Meios de pagamento aceitos no checkout próprio." },
    { icone: "truck", titulo: "Frete e entrega", desc: "Zonas, prazos e taxas de envio." },
    { icone: "receipt", titulo: "Impostos", desc: "Alíquotas por produto e por estado." },
    { icone: "mail", titulo: "Notificações", desc: "E-mail de confirmação e de envio." },
    { icone: "file-text", titulo: "Políticas da loja", desc: "Trocas, privacidade e termos de uso." },
    { icone: "users", titulo: "Quem tem acesso", desc: "Quem da equipe mexe nesta loja." },
  ];

  return (
    <Fila className="cfg-grade">
      {grupos.map((g) => {
        const conteudo = (
          <>
            <span className="cfg-ico"><Icon name={g.icone} size={18} color="var(--text-dim)" /></span>
            <strong>{g.titulo}</strong>
            <span className="cfg-desc">{g.desc}</span>
            {!g.href && <span className="cfg-breve">em breve</span>}
          </>
        );
        return g.href
          ? <a className="cfg-item" key={g.titulo} href={g.href}>{conteudo}</a>
          : <div className="cfg-item cfg-item--breve" key={g.titulo} aria-disabled="true">{conteudo}</div>;
      })}
    </Fila>
  );
}

export function ConfiguracoesClient({ loja }: { loja: Loja }) {
  // Todo o estado de DOMÍNIO saiu daqui: cadastro, verificação, DNS e vínculo
  // agora moram em /lojas/<id>/dominios. O que esta tela precisava era o
  // resumo, e resumo se lê da própria loja — que o servidor já carrega.

  return (
    <div className="ui-secoes lj-tela cfg" style={{ maxWidth: 760 }}>
      <Cabecalho titulo="Configurações" sub={`Como a loja ${loja.nome} vende e onde ela mora.`} />

      <EstadoDaLoja loja={loja} />
      <IndiceDeConfiguracoes />


      <div className="lj-card" style={{ display: "flex", gap: 11, alignItems: "flex-start", background: "color-mix(in srgb, var(--primary) 7%, var(--surface))", borderColor: "color-mix(in srgb, var(--primary) 22%, var(--border))" }}>
        <Icon name="bulb" size={17} color="var(--primary-texto)" />
        <div style={{ fontSize: 13, lineHeight: 1.55 }}>
          A loja já funciona no endereço padrão{" "}
          <code style={{ background: "var(--surface-2)", padding: "1px 6px", borderRadius: 6 }}>tridigaius.vercel.app/l/{loja.slug}</code>.
          Com um domínio próprio ela fica com a <strong>sua marca</strong>. É opcional.
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <ComoVende loja={loja} />

        {/* O endereço próprio TEM tela própria agora.
            Aqui ficavam três passos completos — cadastro, DNS e hospedagem —
            que são os mesmos de /lojas/<id>/dominios. Duas cópias da mesma
            instrução viram duas instruções diferentes na primeira correção, e
            quem seguir a desatualizada aponta o DNS errado e passa horas
            achando que o sistema está quebrado. Sobra o RESUMO, que é o que
            esta tela precisa dizer: em que endereço a loja atende hoje. */}
        <section className="lj-card" id="dominio" style={{ display: "flex", gap: 14, scrollMarginTop: 72 }}>
          <Icon name="world" size={20} color="var(--text-dim)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="lj-card-titulo" style={{ marginBottom: 6 }}>Endereço da loja</h2>
            <p style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 1.55, color: "var(--text-dim)" }}>
              {loja.dominio
                ? <>A loja atende em <code style={{ background: "var(--surface-2)", padding: "1px 6px", borderRadius: 6 }}>https://{loja.dominio}</code>.</>
                : loja.dominioPendente
                  ? <><strong>{loja.dominioPendente}</strong> está ligado a esta loja, mas ainda não responde — falta apontar o DNS e liberar na hospedagem.</>
                  : <>A loja atende no endereço padrão. Um domínio próprio é opcional e leva quatro passos, todos listados na tela de Domínios.</>}
            </p>
            <Link className="ui-btn" data-t="sm" data-v={loja.dominio ? "sutil" : "primario"} href={`/lojas/${loja.id}/dominios`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <Icon name="world" size={14} />
              {loja.dominio ? "Gerenciar domínios" : loja.dominioPendente ? "Ver o que falta" : "Usar um domínio próprio"}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
