"use client";

import { useEffect, useState } from "react";
import { FrotaClient } from "@/app/(plataforma)/frota/FrotaClient";

/**
 * Prova do console da frota, com dados de MENTIRA.
 *
 * Em vez de duplicar a tela (duas cópias divergem na primeira correção), esta
 * página troca o `fetch` por um dublê e monta o COMPONENTE REAL. O que se vê
 * aqui é literalmente o que a pessoa logada vê.
 */

const AGORA = Date.now();
const ha = (min: number) => new Date(AGORA - min * 60000).toISOString();

const CHEIA = {
  dispositivos: [
    { id: "1", nome: "TV Produção 1", ativo: true, versaoCode: 3, versaoNome: "1.3", modelo: "TX3 Mini", ip: "192.168.1.50", vistoEm: ha(0), online: true, codigoAtivacao: null, criadoEm: ha(9000) },
    { id: "2", nome: "TV Expedição", ativo: true, versaoCode: 2, versaoNome: "1.2", modelo: "TX3 Mini", ip: "192.168.1.51", vistoEm: ha(2), online: true, codigoAtivacao: null, criadoEm: ha(9000) },
    { id: "3", nome: "TV Corredor Laser", ativo: true, versaoCode: 3, versaoNome: "1.3", modelo: "MXQ Pro", ip: "192.168.1.52", vistoEm: ha(240), online: false, codigoAtivacao: null, criadoEm: ha(9000) },
    { id: "4", nome: "TV Recepção", ativo: true, versaoCode: null, versaoNome: null, modelo: null, ip: null, vistoEm: null, online: false, codigoAtivacao: "K7RMPQ42", criadoEm: ha(5) },
  ],
  versoes: [
    { id: "v3", version_code: 3, version_name: "1.3", url: "https://x/a.apk", sha256: "a".repeat(64), notas: null, obrigatoria: false, publicada: true, por_nome: "Caio", criada_em: ha(600) },
    { id: "v2", version_code: 2, version_name: "1.2", url: "https://x/b.apk", sha256: "b".repeat(64), notas: null, obrigatoria: false, publicada: false, por_nome: "Caio", criada_em: ha(3000) },
  ],
  comandos: [],
};
const VAZIA = { dispositivos: [], versoes: [], comandos: [] };

export function ProvaFrota() {
  const [cheia, setCheia] = useState(true);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const real = window.fetch;
    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/tv")) {
        // POST (cadastrar/comandar) devolve algo plausível pra tela reagir.
        if (init?.method === "POST") {
          const body = JSON.parse(String(init.body || "{}"));
          if (body.acao === "registrar") {
            return new Response(JSON.stringify({ dispositivo: { id: "novo", nome: body.nome, codigo_ativacao: "H4TQ8MZP" } }), { status: 200 });
          }
          return new Response(JSON.stringify({ ok: true, enviados: 3 }), { status: 200 });
        }
        return new Response(JSON.stringify(cheia ? CHEIA : VAZIA), { status: 200 });
      }
      return real(input, init);
    }) as typeof window.fetch;
    setPronto(true);
    return () => { window.fetch = real; };
  }, [cheia]);

  return (
    <main style={{ minHeight: "100dvh", padding: "18px min(4vw, 32px) 60px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18, maxWidth: 1080, marginInline: "auto" }}>
        <strong style={{ fontSize: 15 }}>Prova · console da frota</strong>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>dados de mentira</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {[["Frota montada", true], ["Frota vazia", false]].map(([rot, v]) => (
            <button key={String(rot)} onClick={() => { setPronto(false); setCheia(v as boolean); }}
              style={{ padding: "8px 14px", minHeight: 44, borderRadius: 12, cursor: "pointer", fontSize: 13.5, fontWeight: 700,
                border: "1px solid var(--border)", background: cheia === v ? "var(--surface-2)" : "transparent", color: "var(--text)" }}>
              {rot as string}
            </button>
          ))}
        </div>
      </div>
      {pronto && <FrotaClient key={String(cheia)} />}
    </main>
  );
}
