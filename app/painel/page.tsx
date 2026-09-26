import type { Metadata } from "next";
import { PainelRoot } from "./PainelRoot";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Painel · Gaius",
  robots: { index: false, follow: false },
};

export default function PainelPage() {
  return <PainelRoot />;
}
