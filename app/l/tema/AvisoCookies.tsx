"use client";

// ── Aviso de cookies ─────────────────────────────────────────────────────────
// Porte do `cookie-bar` do rodapé do tema. É a única parte do rodapé que
// precisa de JavaScript, e por isso mora fora dele: assim o rodapé inteiro
// continua sendo componente de servidor.
//
// A escolha fica em `localStorage` e não em cookie — guardar a aceitação de
// cookies num cookie é a piada que todo mundo faz, mas o motivo real é outro:
// cookie viaja em toda requisição e este dado nunca é lido pelo servidor.

import { useEffect, useState } from "react";
import { higienizar } from "@/lib/vitrine/higienizar";

const CHAVE = "vt-cookies";

export function AvisoCookies({ texto, botao }: { texto: string; botao: string }) {
  // Nasce escondido e só aparece depois de montar. Renderizar no servidor faria
  // a barra piscar em quem já aceitou — o servidor não tem como saber.
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CHAVE)) setVisivel(true);
    } catch {
      // Navegação privada com armazenamento bloqueado: mostra o aviso e deixa
      // fechar. Some na sessão, volta na próxima — melhor que não deixar fechar.
      setVisivel(true);
    }
  }, []);

  if (!visivel) return null;

  const aceitar = () => {
    try { localStorage.setItem(CHAVE, "1"); } catch { /* sem armazenamento, some só nesta sessão */ }
    setVisivel(false);
  };

  return (
    <aside className="cookie-bar" aria-live="polite">
      <div className="container">
        <div className="cookie-bar__inner">
          <div className="cookie-bar__text rte" dangerouslySetInnerHTML={{ __html: higienizar(texto) }} />
          <button type="button" className="cookie-bar__button button button--secondary" onClick={aceitar}>
            {botao}
          </button>
        </div>
      </div>
    </aside>
  );
}
