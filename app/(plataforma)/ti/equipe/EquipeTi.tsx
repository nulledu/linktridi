"use client";

import { Avatar } from "../../ui/Avatar";
import { Selo } from "../../ui/primitives";
import { Icon } from "../../Icon";

export interface MembroTi { id: string; nome: string; cargo: string; foto: string | null; chaves: string[] }

// TI › Equipe: cartão por pessoa — foto, cargo e o que pode fazer na área.
export function EquipeTi({ membros }: { membros: MembroTi[] }) {
  if (!membros.length) {
    return (
      <div className="ti-vazio">
        <Icon name="users" size={28} />
        <strong>Ninguém tem acesso à TI ainda</strong>
        <span>Conceda o acesso em Permissões — a mesma grade de sempre, agora morando na TI.</span>
      </div>
    );
  }
  return (
    <div className="ti-grade">
      {membros.map((m) => (
        <div key={m.id} className="ti-pessoa">
          <Avatar url={m.foto} nome={m.nome} size={44} />
          <div className="ti-p-info">
            <span className="ti-p-nome">{m.nome}</span>
            {m.cargo && <span className="ti-p-sub">{m.cargo}</span>}
            <div className="ti-chips">
              {m.chaves.map((c) => <Selo key={c} tom="neutro">{c}</Selo>)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
