import { redirect } from "next/navigation";

// O app do motorista ocupa a raiz na fase 2. Por enquanto, vai para o painel.
export default function Raiz() {
  redirect("/painel");
}
