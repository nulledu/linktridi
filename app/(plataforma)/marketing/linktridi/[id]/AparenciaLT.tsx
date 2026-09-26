"use client";

// ── Aba "Aparência" do editor do LinkTridi ───────────────────────────────────
// A cara da página: perfil, redes, cores e o texto de cima dos cartões. O
// caminho comum vem primeiro (logo, nome, bio; tocar num tema) e o ajuste
// fino fica um degrau abaixo (as seis cores, dentro de "Ajustar cores").
import { useState, type KeyboardEvent } from "react";
import { Icon } from "../../../Icon";
import { Botao, Campo } from "../../../ui/controles";
import {
  CORES_LINKTRIDI_PADRAO, TEMAS_LINKTRIDI, redeParaUrl, temaAtivoLT,
  type CoresDoTema, type LinkTridiCores, type LinkTridiDoc, type LinkTridiPerfil, type LinkTridiSocial, type RedeLT,
} from "@/lib/tridiflow-linktridi";
import { EntradaImagem, Grupo, Linha, LinhaChave, LinhaCor, Sanfona, Segmentado, TAMANHOS } from "./pecas";

const REDES: { k: RedeLT; nome: string; icone: string; ph: string; dica: string }[] = [
  { k: "instagram", nome: "Instagram", icone: "brand-instagram", ph: "@suamarca", dica: "O @ ou o link do perfil." },
  { k: "tiktok", nome: "TikTok", icone: "brand-tiktok", ph: "@suamarca", dica: "O @ ou o link do perfil." },
  { k: "whatsapp", nome: "WhatsApp", icone: "brand-whatsapp", ph: "(11) 99999-9999", dica: "O número com DDD, ou um link wa.me." },
  { k: "youtube", nome: "YouTube", icone: "brand-youtube", ph: "@seucanal", dica: "O @ ou o link do canal." },
];

const CORES: { k: keyof CoresDoTema; nome: string }[] = [
  { k: "fundo", nome: "Fundo" }, { k: "cartao", nome: "Cartão" }, { k: "destaque", nome: "Destaque" },
  { k: "cta", nome: "Botão comprar" }, { k: "preco", nome: "Preço" }, { k: "badge", nome: "Etiqueta" },
];
const soCores = (c: LinkTridiCores): CoresDoTema => ({ fundo: c.fundo, cartao: c.cartao, destaque: c.destaque, cta: c.cta, preco: c.preco, badge: c.badge });

export function AparenciaLT({ doc, onChange }: { doc: LinkTridiDoc; onChange: (d: LinkTridiDoc) => void }) {
  const perfil = (p: Partial<LinkTridiPerfil>) => onChange({ ...doc, perfil: { ...doc.perfil, ...p } });
  const social = (s: Partial<LinkTridiSocial>) => perfil({ social: { ...doc.perfil.social, ...s } });
  const cores = (c: Partial<LinkTridiCores>) => onChange({ ...doc, cores: { ...doc.cores, ...c } });
  const ativo = temaAtivoLT(doc.cores);

  // Experimentar um tema não pode ser porta de um lado só: as cores ajustadas
  // à mão ficam guardadas e "Minhas cores" volta pra elas.
  const [minhas, setMinhas] = useState<CoresDoTema | null>(() => (ativo ? null : soCores(doc.cores)));
  const escolherTema = (c: CoresDoTema) => { if (!ativo) setMinhas(soCores(doc.cores)); cores(c); };
  const personalizado = ativo ? minhas : soCores(doc.cores);

  const temZap = !!doc.perfil.social.whatsapp?.trim();

  return (
    <>
      <Grupo titulo="Perfil">
        <Linha>
          <Campo label="Logo">
            {(id) => <EntradaImagem idCampo={id} url={doc.perfil.avatarUrl} rotulo="Enviar logo" redonda={doc.perfil.formatoLogo === "redondo"} onChange={(u) => perfil({ avatarUrl: u })} />}
          </Campo>
        </Linha>
        <Linha>
          <Campo label="Nome da marca">
            {(id) => <input id={id} className="lte-input" value={doc.perfil.nome} maxLength={60} onChange={(e) => perfil({ nome: e.target.value })} />}
          </Campo>
        </Linha>
        <Linha>
          <Campo label="Bio" dica="Aparece embaixo do nome. Pode quebrar linha.">
            {(id) => <textarea id={id} className="lte-input" rows={3} maxLength={300} value={doc.perfil.bio} onChange={(e) => perfil({ bio: e.target.value })} />}
          </Campo>
        </Linha>
        <div className="lte-linha lte-linha-quebra">
          <span className="lte-linha-txt"><span className="lte-linha-rot">Formato do logo</span></span>
          <Segmentado rotulo="Formato do logo" valor={doc.perfil.formatoLogo} onChange={(v) => perfil({ formatoLogo: v })}
            opcoes={[{ v: "quadrado", l: "Quadrado" }, { v: "redondo", l: "Redondo" }]} />
        </div>
        <LinhaChave rotulo="Anel colorido no logo" dica="Degradê em volta, como o story do Instagram." ligado={doc.perfil.halo} onChange={(v) => perfil({ halo: v })} />
        <LinhaChave rotulo="Selo de verificado" dica="Ao lado do nome." ligado={doc.perfil.verificado} onChange={(v) => perfil({ verificado: v })} />
      </Grupo>

      <Grupo titulo="Redes sociais" nota="Pode escrever só o @ ou o número — o link certo é montado quando você sai do campo.">
        <LinhaChave rotulo="Mostrar os ícones das redes" ligado={doc.perfil.mostrarSocial} onChange={(v) => perfil({ mostrarSocial: v })} />
        {REDES.map((r) => (
          <Linha key={r.k}>
            <Campo label={r.nome} dica={r.dica}>
              {(id) => (
                <div className="lte-rede">
                  <span className="lte-rede-ico" aria-hidden><Icon name={r.icone} size={18} /></span>
                  <input id={id} className="lte-input" value={doc.perfil.social[r.k] ?? ""} placeholder={r.ph}
                    inputMode={r.k === "whatsapp" ? "tel" : "text"} autoCapitalize="none" autoComplete="off" spellCheck={false}
                    onChange={(e) => social({ [r.k]: e.target.value })}
                    onBlur={(e) => { const u = redeParaUrl(r.k, e.target.value); if (u !== e.target.value) social({ [r.k]: u }); }} />
                </div>
              )}
            </Campo>
          </Linha>
        ))}
        <LinhaChave rotulo="Botão flutuante do WhatsApp" desativado={!temZap}
          dica={temZap ? "Fica no canto da tela enquanto a pessoa rola." : "Preencha o WhatsApp acima pra usar."}
          ligado={doc.perfil.zapFlutuante && temZap} onChange={(v) => perfil({ zapFlutuante: v })} />
      </Grupo>

      <Grupo titulo="Cores" nota="O texto de cada parte escurece ou clareia sozinho pra continuar legível.">
        <div className="lte-temas" role="radiogroup" aria-label="Tema de cores" onKeyDown={setasDoGrupo}>
          {TEMAS_LINKTRIDI.map((t) => (
            <AmostraTema key={t.id} nome={t.nome} cores={t.cores} marcado={ativo === t.id} onClick={() => escolherTema(t.cores)} />
          ))}
          {personalizado && (
            <AmostraTema nome="Minhas cores" cores={personalizado} marcado={!ativo} onClick={() => { if (ativo && minhas) cores(minhas); }} />
          )}
        </div>
        <Sanfona icone="adjustments-horizontal" titulo="Ajustar cores" resumo="Fundo, cartão, botão, preço e etiqueta">
          <div className="lte-cores">
            {CORES.map((c) => <LinhaCor key={c.k} rotulo={c.nome} valor={doc.cores[c.k]} onChange={(v) => cores({ [c.k]: v })} />)}
          </div>
          {ativo !== "claro" && (
            <Botao tamanho="sm" variante="sutil" icone="refresh" onClick={() => escolherTema(soCores(CORES_LINKTRIDI_PADRAO))}>Voltar ao tema Claro</Botao>
          )}
        </Sanfona>
        <LinhaChave rotulo="Brilho no fundo" dica="Manchas suaves na cor de destaque." ligado={doc.cores.formas} onChange={(v) => cores({ formas: v })} />
      </Grupo>

      <Grupo titulo="Página">
        <Linha>
          <Campo label="Frase acima dos cartões" dica="Vazio esconde.">
            {(id) => <input id={id} className="lte-input" value={doc.perfil.tituloSecao} maxLength={120} onChange={(e) => perfil({ tituloSecao: e.target.value })} />}
          </Campo>
        </Linha>
        <div className="lte-linha lte-linha-quebra" data-desativada={doc.perfil.tituloSecao.trim() ? undefined : "1"}>
          <span className="lte-linha-txt"><span className="lte-linha-rot">Tamanho da frase</span></span>
          <Segmentado rotulo="Tamanho da frase" valor={doc.perfil.tamanhoTituloSecao} onChange={(v) => perfil({ tamanhoTituloSecao: v })} opcoes={TAMANHOS} />
        </div>
        <LinhaChave rotulo="Rodapé “Feito com LinkTridi”" ligado={doc.perfil.mostrarMarca} onChange={(v) => perfil({ mostrarMarca: v })} />
      </Grupo>
    </>
  );
}

/** Miniatura do tema: o fundo, um cartão com o botão e o ponto de destaque —
 *  o bastante pra reconhecer a página sem abrir. */
function AmostraTema({ nome, cores, marcado, onClick }: { nome: string; cores: CoresDoTema; marcado: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={marcado} tabIndex={marcado ? 0 : -1} className="lte-tema" onClick={onClick}>
      <span className="lte-tema-amostra" style={{ backgroundColor: cores.fundo }}>
        <span className="lte-tema-ponto" style={{ backgroundColor: cores.destaque }} />
        <span className="lte-tema-cartao" style={{ backgroundColor: cores.cartao }}>
          <span className="lte-tema-botao" style={{ backgroundColor: cores.cta }} />
        </span>
        {marcado && <span className="lte-tema-marca" aria-hidden><Icon name="check" size={12} /></span>}
      </span>
      <span className="lte-tema-nome">{nome}</span>
    </button>
  );
}

// Grupo de rádio: as setas andam E escolhem, como no seletor do sistema.
function setasDoGrupo(e: KeyboardEvent<HTMLDivElement>) {
  const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
  if (!d) return;
  e.preventDefault();
  const botoes = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
  const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
  const alvo = botoes[(Math.max(0, i) + d + botoes.length) % botoes.length];
  alvo?.focus();
  alvo?.click();
}
