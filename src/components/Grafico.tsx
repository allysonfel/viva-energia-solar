// Barras receita x custo de energia (mesmo desenho do protótipo), em SVG no servidor.
// soReceita: sem as barras de custo (quem é de parceiro não vê o custo da Viva).
export function GraficoReceitaCusto({ serie, soReceita = false }: { serie: { rotulo: string; receita: number; custo: number }[]; soReceita?: boolean }) {
  if (!serie.length) return <div className="muted" style={{ padding: "30px 0", textAlign: "center" }}>Sem recargas no período.</div>;
  const W = 640, H = 220, pad = 34;
  const max = Math.max(...serie.map((d) => Math.max(d.receita, soReceita ? 0 : d.custo)), 100);
  // Escala "redonda" em reais.
  const passo = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000].map((x) => x * 100).find((x) => x * 4 >= max) ?? max / 4;
  const topo = passo * 4;
  const bw = (W - pad * 2) / serie.length;
  const y = (v: number) => H - pad - (v / topo) * (H - pad * 2);
  const rotulo = (v: number) => (v >= 100000 ? `${(v / 100000).toLocaleString("pt-BR")}k` : `${v / 100}`);
  const pular = Math.ceil(serie.length / 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Receita e custo de energia por período">
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i}>
          <line x1={pad} x2={W - 8} y1={y(passo * i)} y2={y(passo * i)} style={{ stroke: "var(--line)" }} />
          <text x={pad - 6} y={y(passo * i) + 4} fontSize="10" textAnchor="end" style={{ fill: "var(--faint)" }} fontFamily="var(--mono)">{rotulo(passo * i)}</text>
        </g>
      ))}
      {serie.map((d, i) => {
        const x = pad + i * bw + bw * 0.18, w = bw * 0.32;
        return (
          <g key={d.rotulo}>
            <rect x={x} y={y(d.receita)} width={w} height={H - pad - y(d.receita)} rx="3" style={{ fill: "var(--g600)" }}><title>{`${d.rotulo} · receita R$ ${(d.receita / 100).toFixed(2).replace(".", ",")}`}</title></rect>
            {!soReceita && <rect x={x + w + 2} y={y(d.custo)} width={w} height={H - pad - y(d.custo)} rx="3" fill="#C4F53A"><title>{`${d.rotulo} · custo de energia R$ ${(d.custo / 100).toFixed(2).replace(".", ",")}`}</title></rect>}
            {i % pular === 0 && <text x={x + w} y={H - 10} fontSize="10" textAnchor="middle" style={{ fill: "var(--faint)" }} fontFamily="var(--mono)">{d.rotulo}</text>}
          </g>
        );
      })}
    </svg>
  );
}
