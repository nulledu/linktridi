"use client";

import { useState } from "react";
import {
  escalaPorPolegadas,
  formatoTela,
  novoId,
  perfisPadrao,
  type FormatoTela,
  type Perfil,
} from "@/lib/painel-layout";
import { Icon } from "../Icon";
import { Caixa } from "../ui/controles";

/**
 * Os PERFIS — os modelos de tela que existem para rodar.
 *
 * Antes disto o sistema tinha um layout só, e "outra tela" significava outro
 * módulo escrito no código: cada TV nova custava um deploy. Aqui você monta
 * quantos modelos quiser e cada TV escolhe o seu.
 *
 * A barra fica ACIMA do editor, e não numa página separada, por um motivo:
 * duplicar um perfil e ajustar dois blocos é o fluxo real — quem monta a TV da
 * expedição normalmente começa da TV do comercial. Se trocar de perfil custar
 * uma navegação, ninguém duplica; refaz do zero e as telas divergem.
 */
export function BarraPerfis({
  perfis,
  atual,
  onTrocar,
  onChange,
}: {
  perfis: Perfil[];
  atual: string;
  onTrocar: (id: string) => void;
  onChange: (perfis: Perfil[]) => void;
}) {
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const perfil = perfis.find((p) => p.id === atual) ?? perfis[0];

  const trocar = (id: string, muda: (p: Perfil) => Perfil) =>
    onChange(perfis.map((p) => (p.id === id ? muda(p) : p)));

  function duplicar() {
    if (!perfil) return;
    const copia: Perfil = {
      ...perfil,
      id: novoId("perfil"),
      nome: `${perfil.nome} (cópia)`,
      // Ids novos para slides e widgets: sem isto, mover um bloco na cópia
      // moveria o bloco do original — o editor casa por id.
      slides: perfil.slides.map((s) => ({
        ...s,
        id: novoId("s"),
        widgets: s.widgets.map((w) => ({ ...w, id: novoId("w") })),
      })),
    };
    onChange([...perfis, copia]);
    onTrocar(copia.id);
  }

  function criar() {
    const novo: Perfil = {
      id: novoId("perfil"),
      nome: "Novo perfil",
      descricao: "",
      paraTela: "16:9",
      polegadas: 50,
      numeroCurto: false,
      slides: [{ id: novoId("s"), nome: "Slide 1", duracaoMs: null, ativo: true, widgets: [] }],
    };
    onChange([...perfis, novo]);
    onTrocar(novo.id);
  }

  function remover(id: string) {
    // Um perfil precisa sobrar: sem nenhum, a TV não tem o que mostrar e a
    // tela de escolha fica vazia sem dizer por quê.
    if (perfis.length <= 1) return;
    const resto = perfis.filter((p) => p.id !== id);
    onChange(resto);
    if (id === atual) onTrocar(resto[0].id);
  }

  return (
    <div className="pf-barra">
      <div className="tab-strip pf-abas">
        {perfis.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`pf-aba${p.id === atual ? " pf-aba-on" : ""}`}
            onClick={() => onTrocar(p.id)}
            onDoubleClick={() => setRenomeando(p.id)}
            title={p.descricao || p.nome}
          >
            <strong>{p.nome}</strong>
            <span>{p.slides.length} {p.slides.length === 1 ? "tela" : "telas"}</span>
          </button>
        ))}
        <button type="button" className="pf-novo" onClick={criar}>
          <Icon name="plus" size={16} /> Perfil
        </button>
      </div>

      {perfil && (
        <div className="pf-props">
          {renomeando === perfil.id ? (
            <input
              autoFocus
              className="pf-campo"
              defaultValue={perfil.nome}
              onBlur={(e) => {
                trocar(perfil.id, (p) => ({ ...p, nome: e.target.value.trim() || p.nome }));
                setRenomeando(null);
              }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          ) : (
            <button type="button" className="pf-nome" onClick={() => setRenomeando(perfil.id)}>
              {perfil.nome} <Icon name="edit" size={14} />
            </button>
          )}

          <label className="pf-prop">
            <span>Formato</span>
            <select
              value={perfil.paraTela}
              onChange={(e) => trocar(perfil.id, (p) => ({ ...p, paraTela: e.target.value as FormatoTela }))}
            >
              {formatoTela.map((f) => (
                <option key={f} value={f}>{f}{f === "9:16" ? " (em pé)" : ""}</option>
              ))}
            </select>
          </label>

          <label className="pf-prop">
            <span>Tela</span>
            {/* Polegadas, e não resolução: 55" e 24" podem ter os mesmos
                1920×1080 e pedem tamanhos diferentes, porque o que muda é a
                distância de leitura. */}
            <input
              type="number"
              min={10}
              max={120}
              value={perfil.polegadas}
              onChange={(e) => trocar(perfil.id, (p) => ({ ...p, polegadas: Number(e.target.value) || 50 }))}
            />
            <em>pol · texto {Math.round(escalaPorPolegadas(perfil.polegadas) * 100)}%</em>
          </label>

          {/* Escala do número: da TELA, não do bloco. Meia tela abreviada e
              meia não faz o olho comparar grandezas diferentes lado a lado. */}
          <label className="pf-prop pf-check">
            <Caixa marcado={perfil.numeroCurto === true} onChange={(marc) => trocar(perfil.id, (p) => ({ ...p, numeroCurto: marc }))} />
            <span>números curtos (R$ 59,9 mil)</span>
          </label>

          <span className="pf-acoes">
            <button type="button" onClick={duplicar} title="Duplicar este perfil">
              <Icon name="copy" size={16} />
            </button>
            <button
              type="button"
              onClick={() => remover(perfil.id)}
              disabled={perfis.length <= 1}
              title={perfis.length <= 1 ? "Precisa sobrar um perfil" : "Apagar este perfil"}
              className="pf-perigo"
            >
              <Icon name="trash" size={16} />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** Os perfis de uma configuração, caindo nos modelos prontos quando não há. */
export function perfisDaConfig(perfis: Perfil[] | null | undefined): Perfil[] {
  if (!perfis || perfis.length === 0) return perfisPadrao();
  return perfis.map(comTelasNovas);
}

/**
 * Telas do padrão que ainda não existem no perfil SALVO.
 *
 * Quem já publicou os perfis ficou congelado no desenho do dia em que salvou: a
 * tela de estoque entrou no perfil de Produção padrão e não apareceria em
 * NENHUMA TV instalada, porque o servidor já tinha uma versão daquele perfil. E
 * não dá pra reaplicar o padrão inteiro — isso apagaria o que a pessoa montou.
 *
 * Então a sugestão é aditiva e sai como alteração NÃO SALVA: aparece no editor,
 * o selo avisa, e só vai ao ar se a pessoa clicar em Salvar. Quem não quiser
 * desativa o "exibir na TV" — a tela continua no perfil e não volta a ser
 * sugerida, porque a comparação é por ID.
 */
function comTelasNovas(p: Perfil): Perfil {
  const padrao = perfisPadrao().find((d) => d.nome === p.nome);
  if (!padrao) return p;
  const jaTem = new Set(p.slides.map((s) => s.id));
  const faltando = padrao.slides.filter((s) => !jaTem.has(s.id));
  return faltando.length === 0 ? p : { ...p, slides: [...p.slides, ...faltando] };
}
