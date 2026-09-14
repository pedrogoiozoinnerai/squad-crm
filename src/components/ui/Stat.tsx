export function StatBar({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <div className="card mb-5 flex flex-wrap items-center gap-x-7 gap-y-2 px-5 py-3.5">
      {items.map((item) => (
        <p key={item.label} className="text-sm">
          <span className="text-muted">{item.label}: </span>
          <span className="font-semibold">{item.value}</span>
        </p>
      ))}
    </div>
  );
}
