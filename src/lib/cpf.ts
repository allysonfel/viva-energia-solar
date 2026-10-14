// CPF: só dígitos, com dígito verificador. Mascarado fora da ficha.
export const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export function cpfValido(v: unknown): string | null {
  const d = soDigitos(v);
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return null;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]) ? d : null;
}

export const cpfMascarado = (d: string) => (d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : "***");

// Celular brasileiro com DDD (10 ou 11 dígitos, sem o 55).
export function celularValido(v: unknown): string | null {
  let d = soDigitos(v);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return /^[1-9]{2}9?\d{8}$/.test(d) ? d : null;
}

export const celularFormatado = (d: string) => (d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d);
