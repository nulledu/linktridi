import { redirect } from "next/navigation";
import { requireModuleKeys } from "@/lib/require-auth";

/** Subárea com sub-permissão própria: sem a chave, volta pra Visão geral
 *  (a aba nem aparece — isto é pra quem digitou a URL). */
export async function exigirSubarea(chave: string) {
  const { keys } = await requireModuleKeys("producao");
  if (!keys.includes(chave)) redirect("/producao");
}
