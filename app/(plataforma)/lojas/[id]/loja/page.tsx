import Link from "next/link";
import { notFound } from "next/navigation";
import { fonteLoja, fontePedidos, fonteProdutos } from "@/lib/lojas-fonte";
import { ROTULO_LOJA, moeda, urlDaLoja } from "@/lib/lojas";
import { Icon } from "../../../Icon";
import { Bloco, Cabecalho, Numeros } from "../../ui";
import { AvisoDemo } from "../../AvisoDemo";
import { montarResumo } from "../page";
import "./loja-online.css";

// Visão geral do canal "Loja Online": o endereço no ar, quanto ele rende e o
// que falta pra loja ficar redonda.
//
// Os números aqui são os MESMOS do Início, calculados pela mesma função. Duas
// contas para o mesmo número é como dois relógios na parede — mais cedo ou mais
// tarde eles discordam, e ninguém sabe qual acreditar.
export default async function LojaOnlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { dados: loja } = await fonteLoja(id);
  if (!loja) notFound();

  const [{ dados: produtos, demo }, { dados: pedidos }] = await Promise.all([
    fonteProdutos(id),
    fontePedidos(id),
  ]);
  const resumo = montarResumo(pedidos, produtos, loja.dominio);
  const endereco = urlDaLoja(loja);
  const feitas = resumo.tarefas.filter((t) => t.feito).length;

  const numeros = [
    { rotulo: "Produtos publicados", valor: produtos.filter((p) => p.status === "ativo").length },
    { rotulo: "Vendas (7 dias)", valor: moeda(resumo.vendas.hoje) },
    { rotulo: "Pedidos (7 dias)", valor: resumo.pedidos.hoje },
    { rotulo: "Ticket médio", valor: moeda(resumo.ticket.hoje) },
  ];

  return (
    <div className="lj-tela">
      {demo && <AvisoDemo />}

      <Cabecalho
        titulo="Loja Online"
        sub="O canal principal: o endereço em que a sua vitrine atende."
        aside={
          <span className="lj-chip" style={{ color: ROTULO_LOJA[loja.status].cor }}>
            <span className="lj-ponto" style={{ background: ROTULO_LOJA[loja.status].cor }} aria-hidden="true" />
            {ROTULO_LOJA[loja.status].txt}
          </span>
        }
        acao={
          <Link href={`/lojas/${id}/aparencia`} className="ui-btn" data-v="primario" data-t="md">
            <Icon name="palette" size={15} color="var(--on-primary, #fff)" /> Personalizar
          </Link>
        }
      />

      <Bloco className="lo-ar">
        <div className="lo-ar-txt">
          <h2 className="lo-ar-tit">
            {loja.status === "publicada" ? "Sua loja está no ar" : "Sua loja ainda não está no ar"}
          </h2>
          <a href={endereco} target="_blank" rel="noreferrer noopener" className="lo-url">
            {endereco.replace(/^https?:\/\//, "")}
          </a>
          <div className="lo-ar-acoes">
            <a href={endereco} target="_blank" rel="noreferrer noopener" className="ui-btn" data-v="secundario" data-t="sm">
              <Icon name="external-link" size={15} color="var(--text-dim)" /> Ver loja
            </a>
            <Link href={`/lojas/${id}/temas`} className="ui-btn" data-v="secundario" data-t="sm">
              <Icon name="palette" size={15} color="var(--text-dim)" /> Trocar de tema
            </Link>
          </div>
        </div>

        {/* A prévia é o `<iframe>` da loja de verdade, encolhido — não um
            desenho de tela. Miniatura desenhada envelhece no dia em que alguém
            troca o tema e ninguém percebe. */}
        <div className="lo-previa" aria-hidden="true">
          <iframe src={`/previa/loja/${id}`} title="" tabIndex={-1} scrolling="no" />
        </div>
      </Bloco>

      <Numeros itens={numeros} />

      <Bloco titulo="Para a loja ficar redonda">
        <p className="lo-progresso-txt">{feitas} de {resumo.tarefas.length} concluídas</p>
        <div className="lo-progresso" role="progressbar" aria-valuenow={feitas} aria-valuemin={0} aria-valuemax={resumo.tarefas.length}>
          <span style={{ width: `${(feitas / resumo.tarefas.length) * 100}%` }} />
        </div>
        <ul className="lj-tarefas">
          {resumo.tarefas.map((t) => (
            <li key={t.texto} data-feito={t.feito ? "1" : undefined}>
              <span className="lj-check" aria-hidden="true">
                {t.feito && <Icon name="check" size={12} color="var(--on-primary, #fff)" />}
              </span>
              <span>{t.texto}</span>
            </li>
          ))}
        </ul>
      </Bloco>
    </div>
  );
}
