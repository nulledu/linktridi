"use client";

// Barra presa no rodapé da central pública — o mesmo lugar onde o app de
// restaurante põe "Ajuda / Avaliar / Pedir / Cashback / Conta".
//
// Duas decisões que valem mais que o visual:
//  • O atalho DESTACADO vira o botão redondo do meio. É um só (a normalização
//    garante), porque dois círculos disputando o polegar não têm mais "o
//    principal" — viram dois botões grandes.
//  • Link externo abre em aba nova; `tel:`/`mailto:`/`https://wa.me` são links
//    normais e o navegador resolve. Ação interna ("buscar", "topo") é botão de
//    verdade, não `<a href="#">` — leitor de tela anuncia certo e o clique não
//    empilha um hash na história de quem só quis focar a busca.
//
// Dentro de um tutorial, o WhatsApp da barra conta um "contato" igual ao "Fale
// com a gente": é a saída pro atendimento mais à mão da página, presa no
// rodapé, e sem contá-la o número subestimava justamente os guias que mais
// empurram a pessoa pro atendimento.
import { Icon } from "@/app/(plataforma)/Icon";
import type { AtalhoCentral } from "@/lib/tridiflow-tutoriais";
import { enviarMetrica } from "./[tutorial]/metrica";
import { rolarAoTopo } from "./rolagem";

/** Menu nativo de compartilhar do celular; sem ele (desktop), copia o link. */
async function compartilhar() {
  const url = location.href;
  try {
    if (navigator.share) { await navigator.share({ title: document.title, url }); return; }
    await navigator.clipboard.writeText(url);
    alert("Link copiado.");
  } catch { /* a pessoa fechou o menu */ }
}

const externo = (url: string) => /^https?:\/\//i.test(url);
/** As duas formas oficiais de abrir conversa: a que o `linkWhatsapp` gera e a
 *  que quem configura a barra costuma colar do site do WhatsApp. */
const whatsapp = (url: string) => /^https?:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(url);

export function BarraAtalhos({ atalhos, onTopo, onIdeias, inicioHref, botId, handle }: {
  atalhos: AtalhoCentral[];
  /** A central passa o seu; a página de leitura NÃO passa nada — ela é um
   *  componente de servidor, e função não atravessa a fronteira RSC (a página
   *  desenharia e morreria na hidratação). Por isso "voltar ao topo" tem
   *  comportamento próprio aqui dentro. */
  onTopo?: () => void;
  /** Abre o feed de ideias (reels). Só a central passa — no guia o atalho
   *  já chega como link pra central com `?v=ideias`. */
  onIdeias?: () => void;
  /** Página de LEITURA: "início" ali não é rolar ao topo, é voltar pra
   *  central — quem terminou o guia quer a lista, não o começo do texto. */
  inicioHref?: string;
  /** Página de LEITURA: a central e o guia a que o contato pelo WhatsApp é
   *  somado. Texto, e não um callback, pelo mesmo motivo do `onTopo`. Sem os
   *  dois (a própria central, a prévia do editor) nada é contado. */
  botId?: string;
  handle?: string;
}) {
  // Barra com um item só é ocupar 64px de tela pra repetir o que já está na
  // página. Duas é o mínimo pra ela existir como navegação.
  if (atalhos.length < 2) return null;
  const aoTopo = onTopo ?? rolarAoTopo;
  const guia = handle ?? "";
  return (
    <nav className="tut-barra" aria-label="Atalhos da central">
      {atalhos.map((a) => {
        const conteudo = <>
          <span className="tut-barra-icone"><Icon name={a.icone} size={a.destaque ? 25 : 21} /></span>
          <small>{a.rotulo}</small>
        </>;
        const classe = a.destaque ? "tut-barra-item tut-barra-destaque" : "tut-barra-item";
        if (a.acao === "topo" && !onTopo && inicioHref) {
          return <a key={a.id} className={classe} href={inicioHref}>{conteudo}</a>;
        }
        if (a.acao === "link") {
          const conta = guia && whatsapp(a.url) ? () => enviarMetrica(botId, guia, "contatos") : undefined;
          return <a key={a.id} className={classe} href={a.url} onClick={conta}
            {...(externo(a.url) ? { target: "_blank", rel: "noreferrer noopener" } : null)}>{conteudo}</a>;
        }
        if (a.acao === "ideias") {
          if (!onIdeias) return null;
          return <button key={a.id} type="button" className={classe} onClick={onIdeias}>{conteudo}</button>;
        }
        if (a.acao === "compartilhar") {
          return <button key={a.id} type="button" className={classe} onClick={compartilhar}>{conteudo}</button>;
        }
        return <button key={a.id} type="button" className={classe}
          onClick={aoTopo}>{conteudo}</button>;
      })}
    </nav>
  );
}
