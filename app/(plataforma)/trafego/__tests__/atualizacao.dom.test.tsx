// O botão "Atualizar" da Tridify refaz o panorama do Meta e o snapshot do ERP,
// que descem por prop. Os widgets do "Meu painel" que buscam a PRÓPRIA rota (a
// Vega e a Yampi leem o ERP legado direto) não enxergam esse clique e ficavam
// congelados na primeira leitura da sessão — metade dos números do painel
// andava, a outra metade não.
//
// O que este teste tranca é o contrato do sinal, não o texto do widget: quem se
// inscreve recarrega no clique, e a inscrição sobrevive à troca de identidade
// do `carregar` (ele é um `useCallback` que muda a cada período — inscrever de
// novo a cada render perderia o evento disparado no meio da troca).

import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useState } from "react";
import { avisarAtualizacao, useAtualizacao } from "../atualizacao";

describe("sinal de Atualizar", () => {
  it("recarrega quem está inscrito quando o botão é clicado", () => {
    const carregar = vi.fn();
    function Widget() { useAtualizacao(carregar); return null; }
    render(<Widget />);

    expect(carregar).not.toHaveBeenCalled();
    act(() => avisarAtualizacao());
    expect(carregar).toHaveBeenCalledTimes(1);
    act(() => avisarAtualizacao());
    expect(carregar).toHaveBeenCalledTimes(2);
  });

  it("chama a versão ATUAL do carregar, não a do primeiro render", () => {
    // O `carregar` do card fecha em cima de `de`/`ate`. Se o sinal guardasse a
    // função do primeiro render, o Atualizar depois de trocar o período
    // recarregaria o período ANTIGO — pior que não atualizar.
    const primeiro = vi.fn();
    const segundo = vi.fn();
    let trocar: () => void = () => {};
    function Widget() {
      const [fn, setFn] = useState(() => primeiro);
      trocar = () => setFn(() => segundo);
      useAtualizacao(fn);
      return null;
    }
    render(<Widget />);
    act(() => trocar());
    act(() => avisarAtualizacao());

    expect(primeiro).not.toHaveBeenCalled();
    expect(segundo).toHaveBeenCalledTimes(1);
  });

  it("desinscreve ao desmontar — widget removido do painel não recarrega", () => {
    const carregar = vi.fn();
    function Widget() { useAtualizacao(carregar); return null; }
    const { unmount } = render(<Widget />);
    unmount();
    act(() => avisarAtualizacao());
    expect(carregar).not.toHaveBeenCalled();
  });
});
