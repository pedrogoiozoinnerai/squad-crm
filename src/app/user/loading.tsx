/** Esqueleto enquanto a rota carrega no servidor — evita tela branca. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-7 h-8 w-56 rounded-lg bg-surface-2" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="card h-28 bg-surface-2/40" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card h-72 bg-surface-2/40" />
        <div className="card h-72 bg-surface-2/40" />
      </div>
    </div>
  );
}
