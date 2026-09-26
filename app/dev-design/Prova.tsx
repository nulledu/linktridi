"use client";

import { RedeFalsa } from "../dev-mobile/RedeFalsa";
import { DesignCasca } from "../(plataforma)/design/DesignCasca";
import { PainelDesign } from "../(plataforma)/design/PainelDesign";
import { PAINEL_RESPOSTA } from "./dados-prova";

export function Prova() {
  return (
    <RedeFalsa mapa={{ "/api/design/projetos": PAINEL_RESPOSTA as unknown as Record<string, unknown> }}>
      <DesignCasca rota="/design"><PainelDesign /></DesignCasca>
    </RedeFalsa>
  );
}
