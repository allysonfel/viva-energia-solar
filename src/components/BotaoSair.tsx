"use client";

import { cancelarPushDoAparelho } from "./AtivarAvisos";

// Botão de sair que antes cancela os avisos deste aparelho.
export function BotaoSair({ acao, className, children, title }: { acao: () => Promise<void>; className: string; children: React.ReactNode; title?: string }) {
  return (
    <form action={async () => {
      await cancelarPushDoAparelho();
      await acao();
    }}>
      <button className={className} title={title} aria-label={title}>{children}</button>
    </form>
  );
}
