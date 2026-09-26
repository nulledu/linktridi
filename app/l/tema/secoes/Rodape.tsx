// ── Rodapé e as seções de texto ──────────────────────────────────────────────
// Porte de `footer.liquid`, `text-with-icons.liquid`, `rich-text.liquid`,
// `newsletter.liquid` e `custom-html.liquid`.
//
// O rodapé do tema tem sanfona no celular (cada bloco fecha) e um aside com
// idioma, moeda, redes e bandeiras de pagamento. O que sobrevive aqui é o que
// tem dado por trás: os blocos, o aviso legal, as bandeiras e o aviso de
// cookies. Idioma e moeda saem — a loja tem uma língua e uma moeda.

import Link from "next/link";
import { blocosDaSecao } from "@/lib/vitrine/tema";
import { comAlfa, legivelSobre } from "@/lib/vitrine/cor";
import { higienizar } from "@/lib/vitrine/higienizar";
import { AvisoCookies } from "../AvisoCookies";
import { bool, resolverLink, txt, type PropsSecao } from "../contexto";

// ── Rodapé ───────────────────────────────────────────────────────────────────

export function Rodape({ id, secao, ctx }: PropsSecao) {
  const a = secao.ajustes;
  const blocos = blocosDaSecao(secao);

  const de = txt(a, "background1", "var(--footer-background)");
  // A segunda ponta era ignorada — o degradê saía sólido porque as duas pontas
  // liam `background1`. Ler `background2` reacende o defeito que ela escondia:
  // o texto é branco e a ponta direita do modelo importado é branca. Daí a
  // tinta ser DERIVADA das duas pontas, e não lida de um valor fixo.
  const ate = txt(a, "background2", de);
  const tinta = legivelSobre(ctx.tema.ajustes.footer_text_color as string ?? "#ffffff", [de, ate]);
  const estilo = {
    backgroundImage: `linear-gradient(to right, ${de}, ${ate})`,
    "--footer-text-color": tinta,
    color: tinta,
  } as React.CSSProperties;

  return (
    <footer className="footer" data-section-id={id} data-section-type="footer" role="contentinfo" style={estilo}>
      <div className="container">
        <div className="footer__wrapper">
          <div className="footer__block-list">
            {blocos.map(({ id: bid, bloco }) => {
              // Coluna de links sem nenhum link não vira coluna. Um título
              // sozinho com o vazio embaixo é o que fazia o rodapé parecer
              // quebrado — e ele estava: o bloco importado aponta pra um menu
              // do Shopify que não existe deste lado.
              const links = bloco.tipo === "links" ? linhasDoBloco(bloco.ajustes, ctx) : [];
              if (bloco.tipo === "links" && !links.length) return null;
              const titulo = txt(bloco.ajustes, "title");
              return (
              <div key={bid} className={`footer__block-item footer__block-item--${bloco.tipo === "links" ? "links" : "text"}`}>
                {titulo && (
                  <p className="footer__title heading h6">
                    <span>{titulo}</span>
                  </p>
                )}
                <div className="footer__collapsible" style={{ height: "auto" }}>
                  <div className="footer__collapsible-content">
                    {bloco.tipo === "links" ? (
                      <ul className="footer__linklist list--unstyled">
                        {/* O bloco importado aponta pra um MENU do Shopify
                            (`menu: "footer"`), que não existe deste lado — a
                            coluna nascia vazia e ficava vazia pra sempre. Sem
                            linhas escritas, ela cai no menu cadastrado em
                            Navegação, que é a informação que já existe. */}
                        {links.map((l, n) => (
                          <li key={n}>
                            <Link href={l.href} className="footer__link-item link">{l.titulo}</Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="rte" dangerouslySetInnerHTML={{ __html: higienizar(txt(bloco.ajustes, "content")) }} />
                    )}
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          <aside className="footer__aside">
            {bool(a, "show_payment_icons") && (
              <div className="footer__aside-item footer__aside-item--payment">
                <p className="footer__aside-title">Formas de pagamento</p>
                <div className="payment-list">
                  {["Visa", "Mastercard", "Elo", "Pix", "Boleto"].map((nome) => (
                    <span className="payment-list__item vt-bandeira" key={nome}>{nome}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="footer__aside-item footer__aside-item--copyright">
              <p>© {ctx.loja.nome}</p>
            </div>
          </aside>
        </div>
      </div>

      {bool(a, "show_cookie_bar") && <AvisoCookies texto={txt(a, "text")} botao={txt(a, "accept_button", "Entendi e fechar")} />}
    </footer>
  );
}

/**
 * "Rastreio | /pages/rastreio" por linha.
 *
 * O tema aponta pra um MENU do Shopify, que é um cadastro à parte. Aqui não
 * existe cadastro de menu, e criar um só pro rodapé seria uma tela nova pra
 * três links. Uma linha por link resolve, e o editor mostra o formato.
 */
function linhasDoBloco(
  ajustes: Record<string, unknown>,
  ctx: PropsSecao["ctx"],
): { titulo: string; href: string }[] {
  const escritas = linhasDeLink(txt(ajustes, "content"), ctx.base);
  if (escritas.length) return escritas;
  return (ctx.menuRodape ?? []).map((i) => ({
    titulo: i.titulo,
    href: resolverLink(i.destino, ctx.base) || "#",
  }));
}

function linhasDeLink(bruto: string, base: string): { titulo: string; href: string }[] {
  return bruto
    .split("\n")
    .map((l) => l.replace(/<[^>]*>/g, "").trim())
    .filter(Boolean)
    .map((l) => {
      const [titulo, destino] = l.split("|").map((x) => x.trim());
      return { titulo, href: resolverLink(destino ?? "", base) || "#" };
    })
    .filter((l) => l.titulo);
}

// ── Texto com ícones ─────────────────────────────────────────────────────────

export function TextoComIcones({ id, secao }: PropsSecao) {
  const blocos = blocosDaSecao(secao);
  if (!blocos.length) return null;

  return (
    <section className="section section--tight" data-section-id={id} data-section-type="text-with-icons">
      <div className="container container--flush">
        <div className={`text-with-icons ${bool(secao.ajustes, "stack_mobile") ? "text-with-icons--stacked" : ""}`}>
          {blocos.map(({ id: bid, bloco }, n) => (
            <div className="text-with-icons__item" data-block-index={n} key={bid}>
              <div className="text-with-icons__icon-wrapper">
                <IconeBeneficio nome={txt(bloco.ajustes, "icon")} />
              </div>
              <div className="text-with-icons__content-wrapper">
                <p className="text-with-icons__title text--strong">{txt(bloco.ajustes, "title")}</p>
                <div className="text-with-icons__content rte" dangerouslySetInnerHTML={{ __html: higienizar(txt(bloco.ajustes, "content")) }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Os ícones de benefício do tema (`bi-*`).
 *
 * Os originais são 27 desenhos de linha no `icon.liquid`. Portar os 27 seria
 * 40 KB de path pra uma seção que a loja usa com três. Os desenhados aqui são
 * os de uso comum no varejo; o que não tem desenho cai num círculo neutro, que
 * é honesto — a alternativa (não mostrar nada) desalinha a fileira.
 */
export function IconeBeneficio({ nome }: { nome: string }) {
  const comuns: Record<string, React.ReactNode> = {
    "bi-delivery": <><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
    "bi-fast-delivery": <><path d="M3 8h10v8H3z" /><path d="M13 11h4l3 3v2h-7z" /><circle cx="7" cy="18" r="1.8" /><circle cx="16" cy="18" r="1.8" /><path d="M1 11h4M1 14h3" /></>,
    "bi-secure-payment": <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M3 10h18" /><path d="M8 15h3" /></>,
    "bi-credit-card": <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
    "bi-returns": <><path d="M4 9h11a4 4 0 010 8H9" /><path d="M7 6L4 9l3 3" /></>,
    "bi-customer-support": <><path d="M4 13a8 8 0 1116 0" /><rect x="2" y="13" width="4" height="6" rx="1" /><rect x="18" y="13" width="4" height="6" rx="1" /></>,
    "bi-shield": <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
    "bi-time": <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    "bi-gift-box": <><rect x="3" y="9" width="18" height="11" rx="1" /><path d="M3 13h18M12 9v11" /><path d="M12 9c-3 0-4-1-4-2.5S9 4 10 4s2 2 2 5zm0 0c3 0 4-1 4-2.5S15 4 14 4s-2 2-2 5z" /></>,
    "bi-phone": <path d="M6.6 10.8a15 15 0 006.6 6.6l2.2-2.2a1 1 0 011-.2 11 11 0 003.6.6 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.3.2 2.5.6 3.6a1 1 0 01-.3 1z" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="40" height="40" aria-hidden="true">
      {comuns[nome] ?? <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}

// ── Texto, newsletter e HTML livre ───────────────────────────────────────────

export function Texto({ id, secao }: PropsSecao) {
  const a = secao.ajustes;
  return (
    <section className="section" data-section-id={id} data-section-type="rich-text">
      <div className="container container--narrow" style={{ textAlign: txt(a, "text_alignment", "center") as "left" }}>
        {txt(a, "title") && <h2 className="section__title heading h3">{txt(a, "title")}</h2>}
        <div className="rte" dangerouslySetInnerHTML={{ __html: higienizar(txt(a, "content")) }} />
      </div>
    </section>
  );
}

export function HtmlLivre({ id, secao }: PropsSecao) {
  return (
    <section className="section" data-section-id={id} data-section-type="custom-html">
      <div className="container">
        {/* Passa pelo mesmo higienizador do resto: "HTML livre" é livre pro
            lojista escrever, não pra executar script na página do cliente. */}
        <div className="rte" dangerouslySetInnerHTML={{ __html: higienizar(txt(secao.ajustes, "html")) }} />
      </div>
    </section>
  );
}
