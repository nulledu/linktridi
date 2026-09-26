"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULOS_DISCRETOS, MODULOS_DESATIVADOS } from "@/lib/rbac";
import type { ModuleDef, Role } from "@/lib/rbac";
import { Icon } from "./Icon";
import { useIsMobile } from "./ui/useMediaQuery";
import { usePollComRecuo } from "./ui/usePoll";
import { TrocaIcone } from "./ui/micro";

// Barra inferior do celular. Substitui o hambúrguer flutuante (que roubava 60px
// do topo de TODA página) pelo que se faz EM PÉ, longe do computador; o resto
// vive em "Mais", que abre a MESMA gaveta do menu lateral — uma única definição
// de navegação, sem versão paralela.
//
// O que vai na barra não é "os módulos mais importantes da empresa", é o que se
// resolve no bolso: falar com alguém e tocar o trabalho do dia. Estoque e
// Comercial são telas de análise — se abrem sentado, e continuam no "Mais".

// Quem pode abrir o gerenciamento de atividades (/atividades não é módulo do
// RBAC: o gate é por papel, o mesmo do requireRole da página).

// Ordem para o slot que sobra, quando a pessoa não tem as duas telas de
// atividades. Módulo fora da lista cai no fim (nunca some — vai pro "Mais").
const PRIORIDADE = [
  "producao", "logistica", "comercial", "estoque",
  "analytics", "colaboradores", "design", "trafego", "tridiflow", "administracao",
];

type Aba = { key: string; href: string; icon: string; label: string; exato?: boolean; exceto?: string };

/**
 * Não lidas para a bolinha da aba Mensagens.
 *
 * Três cuidados, os mesmos da seção de dados do CLAUDE.md:
 * 1. Só o número — `/api/central/chat/nao-lidas` devolve dois inteiros, nunca a
 *    caixa de conversas.
 * 2. Só no celular. No computador a barra é `display: none` e o sino já mostra
 *    isso; sem esta guarda o poll rodaria em TODA tela do sistema, invisível.
 * 3. `usePollComRecuo` — aba em segundo plano não busca nada, e ao voltar
 *    atualiza na hora. Nenhuma escrita, em ciclo nenhum.
 */
function useNaoLidas(ligado: boolean, pathname: string): { total: number; mencoes: number } {
  const celular = useIsMobile();
  const ativo = ligado && celular;
  const [n, setN] = useState({ total: 0, mencoes: 0 });

  const ultimo = useRef("");
  const carregar = useCallback(async () => {
    if (!ativo) return false;
    try {
      const r = await fetch("/api/central/chat/nao-lidas", { cache: "no-store" });
      if (!r.ok) return false;                 // sem esquema/sem sessão: some a bolinha, não quebra a barra
      const d = await r.json();
      const total = Number(d?.total) || 0, mencoes = Number(d?.mencoes) || 0;
      const chave = `${total}/${mencoes}`;
      const mudou = ultimo.current !== chave;
      ultimo.current = chave;
      setN({ total, mencoes });
      return mudou;
    } catch { return false; }                  // rede caiu: mantém o último número
  }, [ativo]);

  // Navegar entre telas revalida — inclusive ao SAIR das mensagens, que é
  // quando o número costuma zerar.
  useEffect(() => { carregar(); }, [carregar, pathname]);
  // Recua até 5min com o celular parado na mão; volta a 1min ao primeiro toque.
  usePollComRecuo(() => (ativo ? carregar() : false), ativo ? 60_000 : 0, 300_000);

  return ativo ? n : { total: 0, mencoes: 0 };
}

export function MobileTabBar({ modules, role, aberto, onMais }: { modules: ModuleDef[]; role: Role; aberto: boolean; onMais: () => void }) {
  const pathname = usePathname();
  const tem = (k: string) => modules.some((m) => m.key === k);

  const abas: Aba[] = [];

  // 1) Central — o hub. Casa por prefixo MENOS `/central/mensagens`, que é só
  //    um redirecionamento para `/mensagens` (a aba vizinha): sem a exceção as
  //    duas acendiam juntas. Era `exato: true`, o que resolvia aquilo mas
  //    apagava a aba nas telas de dentro da Central — e desde que o Início
  //    virou a porta, `/central/tarefas` é um destino de verdade, alcançado a
  //    partir desta mesma aba.
  if (tem("central")) abas.push({ key: "central", href: "/central", icon: "layout-grid", label: "Central", exceto: "/central/mensagens" });

  // 2) Mensagens — a razão nº 1 de pegar o celular.
  if (tem("central")) abas.push({ key: "mensagens", href: "/mensagens", icon: "message", label: "Mensagens" });

  // 3) Atividades — UMA aba, não duas. Quem distribui trabalho abre o
  //    gerenciamento; quem executa, a própria lista. Antes a barra dava as duas
  //    a quem gerencia ("Atividades" + "Minhas"): dois dos cinco lugares no
  //    mesmo assunto, e vizinhos, o que ainda obriga a ler os dois rótulos pra
  //    escolher. Quem gerencia entra pelo gerenciamento — a lista pessoal
  //    continua a um toque, no "Mais".
  //
  //    O lugar que sobra não fica vazio: o bloco de prioridade abaixo o
  //    preenche com o próximo módulo da pessoa.
  // Pela CHAVE da área Atividades, não pelo cargo: quem recebeu a área na
  // grade ganha a aba; quem só tinha o cargo herda a chave (lib/areas.ts).
  const gerencia = tem("atividades");
  if (gerencia) abas.push({ key: "atividades", href: "/atividades", icon: "checklist", label: "Atividades" });
  else if (tem("minhas-atividades")) abas.push({ key: "minhas-atividades", href: "/minhas-atividades", icon: "list-check", label: "Atividades" });

  // 4) Sobrou espaço (pessoa sem central, por exemplo): completa por prioridade.
  const peso = (k: string) => { const i = PRIORIDADE.indexOf(k); return i < 0 ? PRIORIDADE.length : i; };
  if (abas.length < 4) {
    // Módulo discreto nunca preenche slot: ele não aparece em menu nenhum, e a
    // barra do celular é o menu mais visível que existe.
    for (const m of modules.filter((m) => !MODULOS_DISCRETOS.has(m.key) && !MODULOS_DESATIVADOS.has(m.key)).sort((a, b) => peso(a.key) - peso(b.key))) {
      if (abas.length >= 4) break;
      if (abas.some((a) => a.key === m.key)) continue;
      abas.push({ key: m.key, href: m.href, icon: m.icon, label: m.label });
    }
  }
  const principais = abas.slice(0, 4);

  const ativo = (a: Aba) =>
    a.exceto && (pathname === a.exceto || pathname.startsWith(a.exceto + "/")) ? false
    : a.exato ? pathname === a.href
    : pathname === a.href || pathname.startsWith(a.href + "/");
  // "Mais" acende quando a página aberta NÃO está entre os atalhos.
  const emMais = aberto || !principais.some(ativo);

  const naoLidas = useNaoLidas(principais.some((a) => a.key === "mensagens"), pathname);

  return (
    <nav className="app-tabbar" aria-label="Navegação principal">
      {principais.map((a) => {
        const on = ativo(a);
        const n = a.key === "mensagens" ? naoLidas.total : 0;
        return (
          <Link key={a.key} href={a.href} aria-current={on ? "page" : undefined}
            aria-label={n > 0 ? `${a.label}, ${n >= 100 ? "99 ou mais" : n} não lida(s)` : undefined}>
            <span className="tb-ic" style={{ position: "relative", display: "grid", placeItems: "center" }}>
              <Icon name={a.icon} size={21} color={on ? "var(--primary-texto)" : "var(--text-dim)"} />
              {n > 0 && (
                <span aria-hidden className="tb-badge" style={{
                  position: "absolute", top: -5, left: "50%", marginLeft: 4,
                  minWidth: 17, height: 17, padding: "0 4px", borderRadius: 999,
                  display: "grid", placeItems: "center",
                  // Citação puxa vermelho; conversa comum, a cor da marca.
                  background: naoLidas.mencoes > 0 ? "var(--perigo)" : "var(--primary)",
                  color: "#fff", fontSize: 10, fontWeight: 800, lineHeight: 1,
                  border: "2px solid var(--pop-bg)", fontVariantNumeric: "tabular-nums",
                }}>{n >= 100 ? "99+" : n}</span>
              )}
            </span>
            <span>{a.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={onMais} aria-haspopup="menu" aria-expanded={aberto}
        aria-current={emMais ? "page" : undefined} aria-label={aberto ? "Fechar menu" : "Mais áreas"}>
        <TrocaIcone ligado={aberto} a="menu-2" b="x" size={21}
          corA={emMais ? "var(--primary-texto)" : "var(--text-dim)"} corB={emMais ? "var(--primary-texto)" : "var(--text-dim)"} />
        <span>Mais</span>
      </button>
    </nav>
  );
}
