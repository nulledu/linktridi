import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// A antiga Home virou a Central. Mantém /home como redirect p/ links antigos.
export default function HomePage() {
  redirect("/central");
}
