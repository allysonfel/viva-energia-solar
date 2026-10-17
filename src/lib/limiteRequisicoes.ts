// Freio de volume em memória (uma instância no Railway): conta requisições por chave
// numa janela deslizante. Usado no proxy (por IP) e em rotas que geram custo.
const contagens = new Map<string, number[]>();
let ultimaLimpeza = 0;

export function dentroDoLimite(chave: string, max: number, janelaMs = 60_000): { ok: boolean; esperarSeg: number } {
  const agora = Date.now();
  // Limpeza oportunista: tira chaves sem uso há mais de 10 min.
  if (agora - ultimaLimpeza > 60_000) {
    ultimaLimpeza = agora;
    for (const [k, l] of contagens) if (!l.length || agora - l[l.length - 1] > 10 * 60_000) contagens.delete(k);
  }
  const l = (contagens.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (l.length >= max) {
    contagens.set(chave, l);
    return { ok: false, esperarSeg: Math.max(1, Math.ceil((l[0] + janelaMs - agora) / 1000)) };
  }
  l.push(agora);
  contagens.set(chave, l);
  return { ok: true, esperarSeg: 0 };
}

// Primeiro IP do x-forwarded-for (proxy do Railway). É dica, não identidade.
export function ipDe(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "desconhecido";
}
