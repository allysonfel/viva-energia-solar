// Enquanto a próxima tela vem do servidor: esqueleto discreto no lugar do vazio.
export default function Carregando() {
  return (
    <div className="esqueleto" aria-busy="true" aria-label="Carregando">
      <i style={{ height: 120 }} />
      <i style={{ height: 64 }} />
      <i style={{ height: 180 }} />
    </div>
  );
}
