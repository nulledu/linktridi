"use client";

// Configurações › Usuários / Times — equipe do workspace (reusa perfis do ERP).
// modo "usuarios" = tabela; modo "times" = agrupado por setor. O acesso é gerido
// em Administração → Perfis (aviso no rodapé).
import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { Avatar as AvatarBase } from "../../ui/Avatar";
import { Abas } from "../../ui/Abas";
import { DataList, type Coluna } from "../../ui/DataList";
import { Fila } from "../../ui/micro";
import { EsqueletoOuConteudo, SkeletonRows } from "../../Skeleton";
import { PilulaStatus } from "../_shared/ConfigMicro";

interface Usuario { id: string; nome: string; username: string; role: string; setor: string | null; fotoUrl: string | null }
// Papel é CATEGORIA, não estado: cada um tem a sua tinta (a de antes).
const papel = (role: string): { label: string; cor: string; icone: string } =>
  role === "admin" ? { label: "Admin", cor: "var(--primary-texto)", icone: "shield" }
  : /gestor|gerente|manager|lider|líder/i.test(role) ? { label: "Gestor", cor: "var(--azul)", icone: "users" }
  : { label: "Membro", cor: "var(--ok)", icone: "user-check" };

function Avatar({ u }: { u: Usuario }) {
  // Era a SEXTA variante de iniciais do app: fundo tingido de destaque, só
  // aqui. Agora usa o mesmo avatar de todo mundo.
  return <AvatarBase url={u.fotoUrl} nome={u.nome} size={34} formato="redondo" />;
}
function Badge({ role }: { role: string }) {
  const p = papel(role);
  return <PilulaStatus estado="neutro" cor={p.cor} icone={p.icone}>{p.label}</PilulaStatus>;
}

const ABAS_EQUIPE: { valor: "usuarios" | "times"; rotulo: string; href: string }[] = [
  { valor: "usuarios", rotulo: "Usuários", href: "/tridiflow/configuracoes/usuarios" },
  { valor: "times", rotulo: "Times", href: "/tridiflow/configuracoes/times" },
];

export function EquipeClient({ modo }: { modo: "usuarios" | "times" }) {
  const [us, setUs] = useState<Usuario[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tridiflow/usuarios", { cache: "no-store" }).then((r) => r.json())
      .then((d) => { if (d.error) setErro(d.error); else setUs(d.usuarios ?? []); }).catch(() => setErro("Sem conexão."));
  }, []);

  const times = useMemo(() => {
    const m = new Map<string, Usuario[]>();
    for (const u of us ?? []) { const k = u.setor || "Sem setor"; const arr = m.get(k) ?? []; arr.push(u); m.set(k, arr); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [us]);

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>{modo === "times" ? "Times" : "Usuários"}</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>{modo === "times" ? "Membros organizados por setor." : "Pessoas com acesso ao workspace e seus papéis."}</p>
      </div>

      {/* As duas visões da mesma equipe: a pílula viaja de uma pra outra. */}
      <div style={{ marginBottom: 16 }}>
        <Abas itens={ABAS_EQUIPE} valor={modo} ariaLabel="Visão da equipe" />
      </div>

      {erro && (
        <div className="tfm-surge" style={{ background: "var(--surface)", border: "1px solid color-mix(in srgb, var(--perigo) 35%, var(--border))", borderRadius: 16, padding: 18, color: "var(--text)", display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5 }}>
          <Icon name="alert-triangle" size={17} color="var(--perigo)" /> {erro}
        </div>
      )}

      {!erro && (
        <EsqueletoOuConteudo pronto={us !== null} esqueleto={<SkeletonRows rows={5} />}>
          {us && modo === "usuarios" && (
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-dim)", borderBottom: "1px solid var(--border)" }}>{us.length} pessoa(s)</div>
              <div style={{ padding: 12 }}>
                <DataList
                  itens={us}
                  colunas={COLUNAS}
                  chaveDe={(u) => u.id}
                  rotulo="Usuários do workspace"
                  minWidth={560}
                  vazio="Ninguém com acesso ainda."
                />
              </div>
            </div>
          )}

          {us && modo === "times" && (
            <Fila style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 16 }}>
              {times.map(([setor, membros]) => (
                <div key={setor} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ width: 32, height: 32, borderRadius: 9, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--primary) 12%, transparent)", flex: "none" }}><Icon name="users" size={17} color="var(--primary-texto)" /></span>
                    <span style={{ fontSize: 14.5, fontWeight: 800, color: "var(--text)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{setor}</span>
                    <span className="mt-num" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-dim)", fontWeight: 700 }}>{membros.length}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {membros.map((u) => (
                      <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar u={u} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.nome}</span>
                        <Badge role={u.role} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Fila>
          )}
        </EsqueletoOuConteudo>
      )}

      {us && (
        <p style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name="info" size={13} color="var(--text-dim)" /> O acesso ao TridiFlow é gerido em Administração → Perfis do sistema.
        </p>
      )}
    </div>
  );
}

// Usuários: tabela no computador, cartão no celular (pessoa no título, papel
// em evidência). Papel ordena pelo rótulo que a tela mostra, não pelo `role`
// cru — "gerente" e "gestor" são o mesmo "Gestor" aqui.
const COLUNAS: Coluna<Usuario>[] = [
  {
    chave: "nome", titulo: "Nome", papel: "titulo", ordenar: (u) => u.nome,
    render: (u) => <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}><Avatar u={u} /><span style={{ fontWeight: 700, minWidth: 0, overflowWrap: "anywhere" }}>{u.nome}</span></div>,
  },
  { chave: "usuario", titulo: "Usuário", ordenar: (u) => u.username, render: (u) => <span style={{ color: "var(--text-dim)" }}>{u.username}</span> },
  { chave: "papel", titulo: "Papel", papel: "destaque", ordenar: (u) => papel(u.role).label, render: (u) => <Badge role={u.role} /> },
  { chave: "setor", titulo: "Setor", ordenar: (u) => u.setor, render: (u) => <span style={{ color: "var(--text-dim)" }}>{u.setor || "—"}</span> },
];
