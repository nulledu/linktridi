"use client";

// ── Usar produtos de outra loja ──────────────────────────────────────────────
// Loja, aqui, é ORGANIZAÇÃO — não necessariamente outro negócio. Quem separa
// "Carimbos" de "Chancelas" em duas vitrines quase sempre vende as MESMAS peças
// nas duas, e cadastrar cada uma duas vezes é duas fotos pra subir, dois preços
// pra manter iguais e dois estoques que divergem no primeiro dia movimentado.
//
// Por isso trazer é VÍNCULO, não cópia: o produto continua tendo um dono e o
// estoque continua sendo um só. Vender na loja A desconta na loja B, porque é a
// mesma prateleira — que é exatamente o que "usar os mesmos produtos" quer
// dizer. O painel diz isso em texto, porque quem clica precisa saber que não
// está duplicando nada.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "../../../Icon";
import { Acoes, Botao, Esp, PainelLateral, Caixa } from "../../../ui/controles";
import { toast } from "../../../Toast";
import { moeda } from "@/lib/lojas";

interface Disponivel {
  id: string;
  titulo: string;
  sku: string;
  preco: number;
  estoque: number;
  status: string;
  capa: string | null;
  lojaId: string;
  lojaNome: string;
}

export function TrazerProdutos({ lojaId, onFechar }: { lojaId: string; onFechar: () => void }) {
  const router = useRouter();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [lista, setLista] = useState<Disponivel[]>([]);
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/lojas/${lojaId}/catalogo`);
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        // 409 = o SQL ainda não rodou. Dizer isso é mais útil que "erro".
        if (!r.ok) { setErro(j?.detalhe ?? j?.error ?? "Não deu para carregar."); return; }
        setLista(j.produtos ?? []);
      } catch {
        if (vivo) setErro("Sem conexão.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, [lojaId]);

  // Agrupado por loja de origem: a pergunta de quem abre isto é "o que a outra
  // loja tem", não "quais produtos existem no mundo".
  const porLoja = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrada = termo
      ? lista.filter((p) => `${p.titulo} ${p.sku}`.toLowerCase().includes(termo))
      : lista;
    const mapa = new Map<string, { nome: string; itens: Disponivel[] }>();
    for (const p of filtrada) {
      const atual = mapa.get(p.lojaId) ?? { nome: p.lojaNome, itens: [] };
      atual.itens.push(p);
      mapa.set(p.lojaId, atual);
    }
    return [...mapa.values()];
  }, [lista, busca]);

  const alternar = (id: string) =>
    setMarcados((antes) => {
      const novo = new Set(antes);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });

  async function trazer() {
    if (!marcados.size) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/lojas/${lojaId}/catalogo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtos: [...marcados] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.erro(j?.detalhe ?? j?.error ?? "Não deu para trazer."); return; }
      toast.ok(`${marcados.size} produto${marcados.size === 1 ? "" : "s"} agora também vende${marcados.size === 1 ? "" : "m"} aqui.`);
      onFechar();
      // `refresh` e não `push`: a lista vem do servidor, então é ele quem
      // precisa recontar.
      router.refresh();
    } finally { setSalvando(false); }
  }

  return (
    <PainelLateral
      titulo="Usar produtos de outra loja"
      subtitulo="O produto passa a aparecer nesta vitrine também. É a mesma peça: o estoque continua sendo um só."
      onFechar={onFechar}
      rodape={
        <Acoes>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Esp />
          <Botao variante="primario" icone="check" carregando={salvando} disabled={!marcados.size} onClick={trazer}>
            {marcados.size ? `Trazer ${marcados.size}` : "Trazer"}
          </Botao>
        </Acoes>
      }
    >
      {carregando && <p className="tp-aviso">Carregando…</p>}

      {!carregando && erro && (
        <p className="ap-aviso"><Icon name="alert-triangle" size={16} />{erro}</p>
      )}

      {!carregando && !erro && lista.length === 0 && (
        <p className="tp-aviso">
          Não há produto em outra loja para trazer. Todo produto das outras lojas já está aqui, ou
          esta é a única loja.
        </p>
      )}

      {!carregando && !erro && lista.length > 0 && (
        <>
          <label className="tp-busca">
            <Icon name="search" size={15} color="var(--text-dim)" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              type="search"
              placeholder="Buscar por nome ou SKU"
              aria-label="Buscar produto"
            />
          </label>

          {porLoja.map((g) => (
            <section className="tp-grupo" key={g.nome}>
              <p className="tp-grupo-tit">{g.nome}</p>
              {g.itens.map((p) => (
                <label className="tp-item" key={p.id}>
                  <Caixa marcado={marcados.has(p.id)} onChange={() => alternar(p.id)} titulo="Selecionar" />
                  <span className="tp-foto">
                    {p.capa
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.capa} alt="" />
                      : <Icon name="photo" size={15} color="var(--neutro)" />}
                  </span>
                  <span className="tp-txt">
                    <strong>{p.titulo}</strong>
                    <small>{p.sku || "sem SKU"} · {p.estoque} em estoque</small>
                  </span>
                  <span className="tp-preco">{moeda(p.preco)}</span>
                </label>
              ))}
            </section>
          ))}

          {porLoja.length === 0 && <p className="tp-aviso">Nenhum produto com esse nome.</p>}
        </>
      )}
    </PainelLateral>
  );
}
