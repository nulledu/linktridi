"use client";

// Compartilhar / copiar — do tutorial inteiro ou de UM passo.
//
// No celular usa a folha nativa (`navigator.share`): mandar pro WhatsApp é o
// que a pessoa realmente faz com um tutorial. Onde ela não existe (desktop,
// contexto sem HTTPS), cai em copiar para a área de transferência, e se nem
// isso houver, seleciona o endereço para o Ctrl+C funcionar.
import { useState } from "react";
import { Icon } from "@/app/(plataforma)/Icon";

const enderecoAtual = (hash?: string) => {
  const u = new URL(window.location.href);
  u.hash = hash ?? "";
  return u.toString();
};

export function AcoesTutorial({ titulo, hash, rotulo, compacto }: {
  titulo: string;
  /** Âncora do passo (ex.: "passo-3"). Vazio = o tutorial inteiro. */
  hash?: string;
  rotulo?: string;
  compacto?: boolean;
}) {
  const [feito, setFeito] = useState(false);
  const acionar = async () => {
    const url = enderecoAtual(hash);
    try {
      if (navigator.share) { await navigator.share({ title: titulo, url }); return; }
      await navigator.clipboard.writeText(url);
      setFeito(true); setTimeout(() => setFeito(false), 1800);
    } catch {
      // `share` cancelado pela pessoa não é erro; só o copiar merece aviso.
      if (!navigator.share) { setFeito(false); window.prompt("Copie o endereço:", url); }
    }
  };
  return (
    <button type="button" className={compacto ? "tut-copiar-passo" : "tut-botao"} data-sec={compacto ? undefined : "1"}
      onClick={acionar} aria-label={rotulo ? undefined : `Compartilhar ${titulo}`} title={rotulo ?? "Compartilhar"}>
      <Icon name={feito ? "circle-check" : compacto ? "link" : "share"} size={compacto ? 14 : 16} />
      {rotulo && <span>{feito ? "Copiado" : rotulo}</span>}
    </button>
  );
}
