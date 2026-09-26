"use client";

import { RedeFalsa } from "../dev-mobile/RedeFalsa";
import { ProducaoCasca } from "../(plataforma)/producao/ProducaoCasca";
import { VisaoProducao } from "../(plataforma)/producao/VisaoProducao";
import { StatusProducao } from "../(plataforma)/producao/status/StatusProducao";
import { ControleAgora } from "../(plataforma)/producao/controle/ControleAgora";
import { MaquinasProducao } from "../(plataforma)/producao/maquinas/MaquinasProducao";
import { Programacoes } from "../(plataforma)/producao/programacoes/Programacoes";
import { MAQUINAS_PROVA, QUADRO_PROVA, SNAP_PROVA } from "./dados-prova";

const PERMS = { status: true, controle: true, programacoes: true, operacao: true };
const ROTA: Record<string, string> = { geral: "/producao", status: "/producao/status", controle: "/producao/controle", maquinas: "/producao/maquinas", programacoes: "/producao/programacoes" };

export function Prova({ tela }: { tela: string }) {
  return (
    <RedeFalsa mapa={{
      "/api/producao": SNAP_PROVA as unknown as Record<string, unknown>,
      "/api/maquinas/programacoes": { disponivel: true, controla: true, apontaPecas: true, maquinas: MAQUINAS_PROVA },
      "/api/maquinas/quadro": { disponivel: true, moveAtividade: true, quadro: QUADRO_PROVA },
    }}>
      <ProducaoCasca perms={PERMS} rota={ROTA[tela] ?? "/producao"}>
        {tela === "status" ? <StatusProducao />
          : tela === "controle" ? <ControleAgora />
          : tela === "maquinas" ? <MaquinasProducao />
          : tela === "programacoes" ? <Programacoes />
          : <VisaoProducao perms={PERMS} />}
      </ProducaoCasca>
    </RedeFalsa>
  );
}
