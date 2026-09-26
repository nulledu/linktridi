"use client";
// A vitrine é o mesmo MicroClient do /dev-micro, carregado só quando a aba é
// aberta — o manual não paga o código de 700 linhas de prova.
import dynamic from "next/dynamic";
import { CarregandoGenerico } from "../ui/CarregandoGenerico";

const MicroClient = dynamic(() => import("../../dev-micro/MicroClient").then((m) => m.MicroClient), {
  ssr: false,
  loading: () => <CarregandoGenerico />,
});

export function Vitrine() {
  return <MicroClient />;
}
