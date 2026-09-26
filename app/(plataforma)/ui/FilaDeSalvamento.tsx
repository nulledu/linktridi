"use client";

import { useEffect } from "react";
import { iniciarFilaDeSalvamento } from "./salvarEmSegundoPlano";

/** Liga a fila de salvar em segundo plano uma vez por visita (montada no
 *  Shell): retoma o que ficou guardado de outra visita e tenta de novo quando
 *  a rede ou a aba voltam. Não desenha nada — quem fala é o toast. */
export function FilaDeSalvamento() {
  useEffect(() => iniciarFilaDeSalvamento(), []);
  return null;
}
