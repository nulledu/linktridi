import { redirect } from "next/navigation";

// O dashboard de controle virou a aba "Setores" do Analytics.
export default function DashboardRedirect() {
  redirect("/analytics?aba=vendas");
}
