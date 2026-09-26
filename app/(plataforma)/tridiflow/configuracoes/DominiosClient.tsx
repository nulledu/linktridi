"use client";

// Configurações › Domínios: passo a passo pra usar um domínio próprio no link
// do bot. Cadastra, mostra o DNS EXATO pro endereço cadastrado, lembra de
// adicionar na Vercel (sem isso nada funciona) e verifica de verdade.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "../../Icon";
import { Alerta } from "../../ui/Alerta";
import { toast } from "../../Toast";
import { Botao, BotaoIcone, Campo } from "../../ui/controles";
import { Fila } from "../../ui/micro";
import { EsqueletoOuConteudo, SkeletonList } from "../../Skeleton";
import { BotaoCopiar, BotaoFases, PilulaStatus, useFases, type EstadoPilula } from "../_shared/ConfigMicro";
// A regra de "o que digitar no DNS" saiu daqui pra `lib/dominio-dns.ts` quando
// o criador de lojas passou a dar a MESMA instrução. Duas cópias viravam duas
// instruções diferentes na primeira correção — e quem seguisse a velha
// apontaria o DNS errado.
import { dnsPara, hostExemplo, partesHost, PROVEDORES } from "@/lib/dominio-dns";

interface Dominio { id: string; host: string; verificado: boolean }
type Estado = "sem_dns" | "dns_errado" | "falta_vercel" | "ativo";
interface Check { estado: Estado; detalhe: string }

// "aguardando DNS" é o único estado que muda SOZINHO (propagação): ganha o
// pulso de "ao vivo". Os de erro pedem ação da pessoa — ícone parado.
const BADGE: Record<Estado, { icone: string; txt: string; pilula: EstadoPilula; vivo?: boolean }> = {
  ativo: { icone: "circle-check", txt: "ativo", pilula: "ok" },
  sem_dns: { icone: "circle", txt: "aguardando DNS", pilula: "pendente", vivo: true },
  dns_errado: { icone: "alert-triangle", txt: "DNS apontando errado", pilula: "erro" },
  falta_vercel: { icone: "alert-triangle", txt: "falta liberar na Vercel", pilula: "erro" },
};
const COR: Record<EstadoPilula, string> = { ok: "var(--ok)", pendente: "var(--atencao)", erro: "var(--perigo)", carregando: "var(--text-dim)", neutro: "var(--text-dim)" };

/** Endereço digitado → host limpo. Aceita quem cola com https:// ou barra no fim. */
function limparHost(v: string) {
  return v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
}
function validarHost(h: string): string | undefined {
  if (!h) return "Digite o endereço que você quer usar.";
  if (/\s/.test(h)) return "O endereço não pode ter espaço.";
  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(h)) return "Digite o endereço completo, com o domínio — ex.: chat.suaempresa.com.br";
  return undefined;
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <div className="tfm-passo" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 18, display: "flex", gap: 14 }}>
      <span className="tfm-passo-n" style={{ flex: "none", width: 28, height: 28, borderRadius: "50%", background: "var(--primary-acao, var(--primary))", color: "var(--on-primary, #fff)", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 800 }}>{n}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>{titulo}</div>
        {children}
      </div>
    </div>
  );
}

export function DominiosClient() {
  const [dominios, setDominios] = useState<Dominio[] | null>(null);
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | undefined>();
  const [sinal, setSinal] = useState(0);
  const { fase, rodar, ocupado } = useFases();
  const [checks, setChecks] = useState<Record<string, Check>>({});
  const [verificando, setVerificando] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/tridiflow/dominios", { cache: "no-store" }).then((r) => r.json()).then((d) => setDominios(d.dominios ?? [])).catch(() => setDominios([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  // O DNS mostrado segue o 1º endereço cadastrado (ou o exemplo, se não houver).
  const hostRef = dominios?.[0]?.host || "";
  // "chat" é o subdomínio do exemplo AQUI (o link do bot). A tela da loja usa
  // "loja" — mesma função, exemplo de cada contexto.
  const DNS = useMemo(() => dnsPara(hostRef || hostExemplo("chat")), [hostRef]);
  const avisoApex = novo.trim() && !erro ? partesHost(novo).apex : false;

  function add() {
    if (ocupado) return;
    const host = limparHost(novo);
    const problema = validarHost(host);
    // `sinal` sobe a cada tentativa: o mesmo erro repetido treme de novo — sem
    // isso o segundo clique errado não muda nada na tela.
    if (problema) { setErro(problema); setSinal((s) => s + 1); return; }
    setErro(undefined);
    void rodar(async () => {
      const r = await fetch("/api/tridiflow/dominios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Não deu pra cadastrar esse endereço."); setSinal((s) => s + 1); return false; }
      setNovo(""); toast.ok("Endereço cadastrado. Agora faça os passos 2 e 3."); load();
      return true;
    });
  }
  async function verificar(id: string) {
    setVerificando(id);
    try {
      const r = await fetch("/api/tridiflow/dominios", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; estado?: Estado; detalhe?: string };
      if (j.estado) setChecks((c) => ({ ...c, [id]: { estado: j.estado!, detalhe: j.detalhe || "" } }));
      if (j.ok) toast.ok("Domínio ativo!"); else toast.erro(j.detalhe || "Ainda não deu — veja o detalhe abaixo do endereço.");
      load();
    } finally { setVerificando(null); }
  }
  async function remover(id: string) { await fetch(`/api/tridiflow/dominios?id=${id}`, { method: "DELETE" }); load(); }

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: "clamp(22px, 6vw, 28px)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text)" }}>Domínios</h1>
        <p style={{ color: "var(--text-dim)", marginTop: 4, fontSize: 14 }}>Deixe o link do seu bot com a sua marca — em 4 passos.</p>
      </div>

      {/* Por que serve */}
      <Alerta tom="destaque" icone="bulb" style={{ marginBottom: 16, overflowWrap: "anywhere" }}>
        O link do seu bot já funciona no endereço padrão <code style={{ background: "var(--surface-2)", padding: "1px 6px", borderRadius: 6 }}>gedux.com.br/f/seu-bot</code>. Com um domínio próprio ele fica com a <strong>sua marca</strong> — tipo <code style={{ background: "var(--surface-2)", padding: "1px 6px", borderRadius: 6 }}>chat.suaempresa.com.br/f/seu-bot</code>. É opcional; siga os passos só se quiser usar o seu.
      </Alerta>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Passo 1 — cadastrar */}
        <Passo n={1} titulo="Cadastre o endereço que você quer usar">
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 10px", lineHeight: 1.5 }}>
            Use um <strong>subdomínio</strong> do seu site (ex.: <code>chat.</code>, <code>bot.</code> ou <code>atendimento.</code>). Digite completo, com o seu domínio — e cadastre <strong>exatamente</strong> o endereço que vai apontar no DNS.
          </p>
          <Campo label="Endereço" erro={erro} sinal={sinal}>
            {(id) => (
              <div className="tfm-grupo">
                <input id={id} className="tfm-entrada" value={novo} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  onChange={(e) => { setNovo(e.target.value); if (erro) setErro(undefined); }}
                  onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="chat.suaempresa.com.br"
                  aria-invalid={erro ? true : undefined} />
                <BotaoFases fase={fase} onClick={add} icone="plus" enviando="Cadastrando" feito="Cadastrado" erro="Não deu">Adicionar</BotaoFases>
              </div>
            )}
          </Campo>
          {avisoApex && (
            <div className="tfm-surge" style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "flex-start", fontSize: 11.5, color: "var(--atencao)", lineHeight: 1.5 }}>
              <Icon name="alert-triangle" size={14} color="var(--atencao)" />
              <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>Isso é o <strong>domínio raiz</strong>, não um subdomínio. Ele provavelmente já é usado pelo seu site — e a raiz não aceita CNAME (precisa de registro A). Se o seu site já roda nesse endereço, prefira <code>chat.{limparHost(novo)}</code>.</span>
            </div>
          )}

          {/* Lista de endereços cadastrados */}
          <EsqueletoOuConteudo pronto={dominios !== null} esqueleto={<SkeletonList rows={2} />} style={{ marginTop: 12 }}>
            {dominios && (dominios.length === 0 ? (
              <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: 0 }}>Nenhum endereço cadastrado ainda — o padrão já funciona.</p>
            ) : (
              <Fila style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {dominios.map((d) => {
                  const chk = checks[d.id];
                  const estado: Estado = d.verificado ? "ativo" : (chk?.estado ?? "sem_dns");
                  const b = BADGE[estado];
                  const checando = verificando === d.id;
                  return (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px 6px 13px", borderRadius: 11, background: "var(--surface-2)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
                      <Icon name="world" size={16} color="var(--text-dim)" />
                      <span style={{ flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: 700, color: "var(--text)", overflowWrap: "anywhere" }}>{d.host}</span>
                      {checando
                        ? <PilulaStatus estado="carregando">verificando</PilulaStatus>
                        : <PilulaStatus estado={b.pilula} icone={b.icone} vivo={b.vivo}>{b.txt}</PilulaStatus>}
                      {!d.verificado && (
                        <Botao variante="sutil" onClick={() => verificar(d.id)} disabled={checando}>Verificar</Botao>
                      )}
                      {/* Separado da ação comum por uma margem: remover não pode
                          ficar colado em "Verificar" num dedo de 44px. */}
                      <BotaoIcone icone="trash" titulo="Remover" aria-label={`Remover ${d.host}`} onClick={() => remover(d.id)} style={{ marginLeft: 6 }} />
                      {chk?.detalhe && !d.verificado && (
                        <div className="tfm-surge" style={{ flexBasis: "100%", fontSize: 11.5, color: COR[b.pilula], lineHeight: 1.5, paddingRight: 8 }}>{chk.detalhe}</div>
                      )}
                      {d.verificado && <div style={{ flexBasis: "100%", fontSize: 11.5, color: "var(--text-dim)", overflowWrap: "anywhere", paddingRight: 8, paddingBottom: 4 }}>Pronto! O bot pode usar <code style={{ background: "var(--surface)", padding: "1px 5px", borderRadius: 5 }}>https://{d.host}/f/…</code></div>}
                    </div>
                  );
                })}
              </Fila>
            ))}
          </EsqueletoOuConteudo>
        </Passo>

        {/* Passo 2 — DNS */}
        <Passo n={2} titulo="Aponte o DNS no seu provedor">
          <p style={{ fontSize: 12.5, color: "var(--text-dim)", margin: "0 0 6px", lineHeight: 1.5 }}>
            Entre no painel de quem cuida do seu domínio ({PROVEDORES.join(", ")}…), abra a área de <strong>DNS / Zona de DNS</strong> e crie este registro
            {hostRef ? <> para <code style={{ background: "var(--surface-2)", padding: "1px 5px", borderRadius: 5 }}>{hostRef}</code></> : null}:
          </p>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", marginTop: 8 }}>
            {DNS.map((row, i) => (
              <div key={row.campo} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 12px", borderTop: i ? "1px solid var(--border)" : "none", background: "var(--surface)" }}>
                {/* 132px fixos não sobram numa tela de 320: base 132 que pode
                    encolher mantém o computador igual e o celular legível. */}
                <div style={{ flex: "0 1 132px", minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{row.campo}</div>
                  <div style={{ fontSize: 10.5, color: "var(--text-dim)" }}>{row.dica}</div>
                </div>
                <code style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: "var(--text)", overflowWrap: "anywhere" }}>{row.valor}</code>
                <BotaoCopiar texto={row.valor} soIcone rotulo={`Copiar ${row.campo}`} />
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "var(--text-dim)", margin: "10px 0 0", lineHeight: 1.5 }}>
            No campo <strong>Host</strong> vai só a parte antes do seu domínio — o provedor completa o resto. A propagação leva de alguns minutos até algumas horas.
          </p>
        </Passo>

        {/* Passo 3 — Vercel (o passo que faltava) */}
        <Passo n={3} titulo="Libere o endereço na Vercel">
          <Alerta tom="atencao" style={{ marginBottom: 9 }}>
            Só apontar o DNS <strong>não basta</strong>. O endereço também precisa estar cadastrado no projeto que hospeda o site, senão ele não é reconhecido — não abre e não ganha o cadeado (HTTPS).
          </Alerta>
          <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.6, overflowWrap: "anywhere" }}>
            Abra <strong>vercel.com</strong> → projeto do Gaius → <strong>Settings</strong> → <strong>Domains</strong> → <strong>Add</strong> e cole
            {hostRef ? <> <code style={{ background: "var(--surface-2)", padding: "1px 5px", borderRadius: 5 }}>{hostRef}</code></> : " o mesmo endereço do passo 1"}.
            Com o DNS já apontado, a Vercel valida e emite o certificado sozinha em poucos minutos.
          </div>
          {hostRef && (
            <div style={{ marginTop: 10 }}>
              <BotaoCopiar texto={hostRef} rotulo="Copiar endereço" />
            </div>
          )}
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 10 }}>
            <Icon name="shield" size={15} color="var(--ok)" />
            <div style={{ fontSize: 11.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
              Fique tranquilo: no domínio próprio só existe o <strong>bot</strong>. O resto do sistema (login, painel, administração) fica invisível por lá — qualquer outro endereço responde &quot;não encontrado&quot;. O Gaius continua acessível só pelo endereço de sempre.
            </div>
          </div>
        </Passo>

        {/* Passo 4 — verificar + usar */}
        <Passo n={4} titulo="Verifique e use no bot">
          <div style={{ fontSize: 12.5, color: "var(--text)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8 }}><Icon name="circle-check" size={16} color="var(--ok)" /><span>Volte no passo 1 e clique em <strong>Verificar</strong>. Ele confere as duas coisas — o DNS e se o endereço já responde — e diz exatamente o que está faltando.</span></div>
            <div style={{ display: "flex", gap: 8 }}><Icon name="share" size={16} color="var(--primary-texto)" /><span>Quando ficar <strong>ativo</strong>, abra o bot no editor → <strong>Compartilhar</strong> → escolha esse domínio. Pronto: o link do bot passa a usar o seu endereço.</span></div>
          </div>
        </Passo>
      </div>
    </div>
  );
}
