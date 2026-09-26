"use client";

// ── "Avisar a equipe" ────────────────────────────────────────────────────────
// Tira os alertas de dentro desta tela e os põe no sino de quem tem o
// Financeiro. Quem não abre o módulo naquele dia não fica sabendo de nada, que
// é o oposto do que um alerta serve.
//
// É BOTÃO, e não efeito de carregamento, de propósito: notificação é escrita, e
// escrita disparada por tela abrindo é o que já pausou este projeto duas vezes
// (CLAUDE.md → "nunca escrever dentro de um poll"). Nada aqui roda sozinho —
// nem em `useEffect`, nem em intervalo. Só no clique.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "../Toast";
import { Botao } from "../ui/controles";

/** O que `POST /api/financeiro/avisos` devolve. */
interface Resultado {
  empresas: number;
  pessoas: number;
  avisos: number;
  pulados: number;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * A frase de cima do resultado. Cada caso tem um motivo diferente e a pessoa
 * precisa distinguir "não mandei porque não havia" de "não mandei porque já
 * tinha mandado" — as duas terminam em zero aviso novo e não significam a mesma
 * coisa.
 */
function frase(r: Resultado): string {
  if (r.avisos > 0) {
    return `${plural(r.avisos, "aviso enviado", "avisos enviados")} para ${plural(r.pessoas, "pessoa", "pessoas")}`;
  }
  if (r.pulados > 0) return "Ninguém recebeu nada novo";
  if (r.pessoas === 0) return "Ninguém com acesso ao Financeiro para avisar";
  return "Nenhum aviso saiu desta vez";
}

export function AvisosBotao() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function avisar() {
    setEnviando(true);
    setErro("");
    try {
      // `r.ok` não mente aqui: rota do módulo nunca redireciona e o middleware
      // devolve 401 em JSON — o que chega é o erro escrito pela própria rota.
      const r = await fetch("/api/financeiro/avisos", { method: "POST" });
      const dados = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      if (!r.ok) throw new Error(String(dados.erro ?? "Não deu para mandar os avisos."));

      const saiu: Resultado = {
        empresas: Number(dados.empresas ?? 0),
        pessoas: Number(dados.pessoas ?? 0),
        avisos: Number(dados.avisos ?? 0),
        pulados: Number(dados.pulados ?? 0),
      };
      setResultado(saiu);
      toast.ok(saiu.avisos === 0
        ? "Nada novo para avisar."
        : `${plural(saiu.avisos, "aviso enviado", "avisos enviados")}.`);
      // Relê a tela: entre abrir a Visão Geral e clicar, alguém pode ter pago
      // uma conta — quem varreu de novo foi o servidor, e é a lista dele que
      // acabou de sair no sino.
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu para mandar os avisos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      style={{
        display: "grid", gap: 10, minWidth: 0,
        marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)",
      }}
    >
      <p style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
        Avisar manda estes alertas para o <strong>sino</strong> de quem tem acesso ao Financeiro.
        A varredura passa por todas as empresas, mas cada pessoa recebe só os alertas
        das que ela enxerga — e quem já foi avisado hoje do mesmo item não recebe de novo.
      </p>

      {/* O botão mora dentro de um <div> porque item de grade estica: solto, ele
          viraria uma barra da largura do cartão e deixaria de ser discreto.
          `carregando` não é enfeite — ele desabilita o botão durante a varredura,
          e é o que impede o clique duplo de disparar duas varreduras de todas as
          empresas (o dobro de execução, que é a conta que pausou a Vercel). */}
      <div>
        <Botao
          icone="bell"
          carregando={enviando}
          onClick={avisar}
          title="Mandar os alertas do Financeiro para o sino de quem tem acesso"
        >
          Avisar a equipe
        </Botao>
      </div>

      {erro && (
        <p style={{ fontSize: 12.5, fontWeight: 600, color: "var(--perigo)" }} role="alert">{erro}</p>
      )}

      {resultado && (
        <section
          style={{
            display: "grid", gap: 6, minWidth: 0, padding: "11px 13px", borderRadius: "var(--r-sm)",
            background: resultado.avisos > 0
              ? "color-mix(in srgb, var(--ok) 9%, transparent)"
              : "var(--surface-2)",
            border: `1px solid ${resultado.avisos > 0
              ? "color-mix(in srgb, var(--ok) 30%, var(--border))"
              : "var(--border)"}`,
          }}
        >
          <strong
            style={{
              fontSize: 13, fontWeight: 800, overflowWrap: "anywhere",
              color: resultado.avisos > 0 ? "var(--ok)" : "var(--text)",
            }}
          >
            {frase(resultado)}
          </strong>

          {resultado.avisos > 0 && (
            <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
              São as pessoas com acesso ao Financeiro; cada uma recebeu só os alertas
              das empresas que enxerga
              {resultado.empresas > 0
                ? ` — ao todo, ${plural(resultado.empresas, "empresa tinha", "empresas tinham")} algo a avisar.`
                : "."}
            </span>
          )}

          {resultado.pulados > 0 && (
            <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
              {resultado.pulados === 1
                ? "1 aviso repetido foi pulado porque já tinha sido mandado hoje."
                : `${resultado.pulados} avisos repetidos foram pulados porque já tinham sido mandados hoje.`}{" "}
              Clicar de novo não enche o sino de ninguém com a mesma frase.
            </span>
          )}

          {resultado.avisos === 0 && resultado.pulados === 0 && resultado.pessoas > 0 && (
            <span style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.55 }}>
              Quem tem acesso ao Financeiro não enxerga nenhuma empresa com alerta em aberto agora.
            </span>
          )}
        </section>
      )}
    </div>
  );
}
