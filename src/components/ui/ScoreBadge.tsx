const TONE: Record<string, string> = {
  A: "bg-waz-90 text-waz-20",
  B: "bg-sky-100 text-sky-800",
  C: "bg-amber-100 text-amber-800",
  D: "bg-orange-100 text-orange-800",
  E: "bg-stone-200 text-stone-600",
};

export function ScoreBadge({ score }: { score: string | null }) {
  if (!score) return null;
  return (
    <span
      title={`Lead score ${score}`}
      className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
        TONE[score] ?? TONE.E
      }`}
    >
      {score}
    </span>
  );
}
