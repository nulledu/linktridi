"use client";

import { useEffect, useRef, useState } from "react";
import { comTelasAtualizadas, perfisPadrao, type PainelLayout, type Perfil } from "@/lib/painel-layout";

/**
 * O estado de edição dos perfis — com desfazer.
 *
 * Mora fora da tela de configuração por um motivo prático: aquela página exige
 * login, e o banco de provas (`/dev-painel`) é onde isto pode ser conferido sem
 * digitar senha. Duas cópias da mesma lógica divergiriam na primeira correção;
 * um hook usado pelos dois não tem como divergir.
 */
export function usePerfis(iniciais?: Perfil[] | null) {
  const [perfis, setPerfisEstado] = useState<Perfil[]>(() =>
    // `comTelasAtualizadas`: a tela que ainda está exatamente como saiu de
    // fábrica abre já com o desenho novo — o mesmo que a parede mostra. Sem
    // isto, o editor exibiria o layout antigo e salvar por cima desfaria o
    // redesenho na TV.
    iniciais && iniciais.length > 0 ? comTelasAtualizadas(iniciais) : perfisPadrao(),
  );
  const [perfilAtual, setPerfilAtual] = useState<string>(() =>
    (iniciais && iniciais[0]?.id) || perfisPadrao()[0].id,
  );

  /**
   * A pilha guarda os perfis INTEIROS, não "operações".
   *
   * São dezenas de blocos em JSON — barato de copiar — e com isso arrastar,
   * redimensionar, apagar, renomear e trocar a polegada ficam desfazíveis pelo
   * mesmo caminho, sem cada ação precisar lembrar de se registrar. Registrar
   * operação uma a uma é como se esquece de desfazer justamente a que quebrou.
   */
  const historico = useRef<Perfil[][]>([]);
  const [temDesfazer, setTemDesfazer] = useState(false);

  const setPerfis = (ps: Perfil[]) => {
    // Teto de 30: memória previsível, e ninguém desfaz trinta passos — quem
    // precisa disso quer o "Restaurar", que é outro botão.
    historico.current = [...historico.current.slice(-29), perfis];
    setTemDesfazer(true);
    setPerfisEstado(ps);
  };

  const desfazer = () => {
    const anterior = historico.current.pop();
    if (!anterior) return;
    setTemDesfazer(historico.current.length > 0);
    setPerfisEstado(anterior);
  };

  /** Troca a lista sem entrar no histórico (ex.: o que veio do servidor). */
  const trocarSemHistorico = (ps: Perfil[]) => {
    historico.current = [];
    setTemDesfazer(false);
    setPerfisEstado(ps);
    if (!ps.some((p) => p.id === perfilAtual)) setPerfilAtual(ps[0]?.id ?? "");
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      // Dentro de campo de texto o desfazer que a pessoa espera é o do próprio
      // campo — interceptar ali seria roubar um atalho conhecido.
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName);
      if (!digitando && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        desfazer();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const perfil = perfis.find((p) => p.id === perfilAtual) ?? perfis[0];
  const layout: PainelLayout = { versao: 1, slides: perfil?.slides ?? [] };
  const setLayout = (l: PainelLayout) =>
    setPerfis(perfis.map((p) => (p.id === perfil.id ? { ...p, slides: l.slides } : p)));

  return {
    perfis, perfil, perfilAtual, setPerfilAtual,
    setPerfis, trocarSemHistorico,
    layout, setLayout,
    desfazer, temDesfazer,
  };
}
