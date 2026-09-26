"use client";

// Empresas (unidades) do mercadinho. Cada uma tem o próprio estoque, os
// próprios preços e a própria dívida — é o escopo de tudo no painel.
//
// Inclui as INATIVAS de propósito: inativar é reversível, e sem vê-las na
// lista não haveria como reativar.

import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../Icon";
import { Card, Empty, INDIGO, SkelLinhas, marketRequest } from "../ui";
import { ModalEmpresa, type Unidade } from "../Cadastro";
import { Botao } from "../../ui/controles";

export function EmpresasClient() {
  const [empresas, setEmpresas] = useState<Unidade[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Unidade | null>(null);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try { setEmpresas(await marketRequest<Unidade[]>("unidades")); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível carregar as empresas."); }
    finally { setCarregando(false); }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const ativas = empresas.filter((e) => e.ativo);
  const inativas = empresas.filter((e) => !e.ativo);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 2 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Empresas</h1>
          <span style={{ fontSize: 12, opacity: .65 }}>
            {ativas.length} ativa{ativas.length === 1 ? "" : "s"}
            {inativas.length ? ` · ${inativas.length} inativa${inativas.length === 1 ? "" : "s"}` : ""}
          </span>
        </div>
        <Botao variante="primario" icone="plus" onClick={() => setCriando(true)}>Nova empresa</Botao>
      </header>

      {erro ? (
        <Card style={{ padding: 16, display: "flex", gap: 10, alignItems: "center" }}>
          <Icon name="alert-triangle" size={18} color="var(--neg, var(--perigo))" />
          <span style={{ fontSize: 13 }}>{erro}</span>
          <Botao variante="primario" onClick={() => void carregar()} style={{ marginLeft: "auto" }}>Tentar de novo</Botao>
        </Card>
      ) : null}

      {carregando ? <Card style={{ padding: 16 }}><SkelLinhas n={3} altura={56} /></Card>
        : empresas.length === 0 ? (
          <Card style={{ padding: 24 }}>
            <Empty icon="building-warehouse" title="Nenhuma empresa ainda"
              text="A empresa é onde o mercadinho existe: ela guarda o estoque, os preços e a dívida das pessoas." />
          </Card>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {[...ativas, ...inativas].map((e) => (
              <Card key={e.id} style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", opacity: e.ativo ? 1 : .6 }}>
                <div style={{ width: 44, height: 44, flex: "none", borderRadius: "var(--r-sm)", overflow: "hidden", border: "1px solid var(--border)", display: "grid", placeItems: "center", background: "var(--surface-2, var(--surface))" }}>
                  {e.logo_url
                    // eslint-disable-next-line @next/next/no-img-element -- bucket público
                    ? <img src={e.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <Icon name="building-warehouse" size={20} color={INDIGO} />}
                </div>
                <div style={{ display: "grid", gap: 2, minWidth: 0, flex: 1 }}>
                  <strong style={{ fontSize: 14 }}>{e.nome}</strong>
                  <span style={{ fontSize: 11, opacity: .65 }}>
                    {e.ativo ? (e.descricao || e.cnpj || "Ativa") : "Inativa — não aparece nos seletores nem no tablet"}
                  </span>
                </div>
                <Botao icone="edit" onClick={() => setEditando(e)}>Editar</Botao>
              </Card>
            ))}
          </div>
        )}

      {criando ? <ModalEmpresa empresa={null} onFechar={() => setCriando(false)} onSalvo={() => void carregar()} /> : null}
      {editando ? <ModalEmpresa empresa={editando} onFechar={() => setEditando(null)} onSalvo={() => void carregar()} /> : null}
    </div>
  );
}
