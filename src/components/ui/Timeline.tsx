import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  Download,
  FilePlus2,
  StickyNote,
  Trophy,
  UserPlus,
  XCircle,
} from "lucide-react";

type Kind =
  | "LEAD_CREATED" | "LEAD_UPDATED" | "DEAL_CREATED" | "DEAL_UPDATED" | "STAGE_CHANGED"
  | "DEAL_WON" | "DEAL_LOST" | "TASK_CREATED" | "TASK_DONE"
  | "NOTE_ADDED" | "MEETING_SCHEDULED" | "IMPORTED";

export type TimelineItem = {
  id: string;
  kind: Kind;
  title: string;
  detail: string | null;
  createdAt: Date;
  author: { name: string } | null;
};

const ICON: Record<Kind, { icon: React.ElementType; tone: string }> = {
  LEAD_CREATED: { icon: UserPlus, tone: "bg-surface-2 text-muted" },
  LEAD_UPDATED: { icon: FilePlus2, tone: "bg-surface-2 text-muted" },
  DEAL_CREATED: { icon: FilePlus2, tone: "bg-sky-50 text-sky-700" },
  DEAL_UPDATED: { icon: FilePlus2, tone: "bg-surface-2 text-muted" },
  STAGE_CHANGED: { icon: ArrowRight, tone: "bg-waz-95 text-waz-20" },
  DEAL_WON: { icon: Trophy, tone: "bg-waz-90 text-waz-20" },
  DEAL_LOST: { icon: XCircle, tone: "bg-red-50 text-red-700" },
  TASK_CREATED: { icon: FilePlus2, tone: "bg-amber-50 text-amber-800" },
  TASK_DONE: { icon: CheckCircle2, tone: "bg-waz-95 text-waz-20" },
  NOTE_ADDED: { icon: StickyNote, tone: "bg-surface-2 text-muted" },
  MEETING_SCHEDULED: { icon: CalendarCheck, tone: "bg-sky-50 text-sky-700" },
  IMPORTED: { icon: Download, tone: "bg-surface-2 text-muted" },
};

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-xs text-muted">
        Nada registrado ainda.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item) => {
        const { icon: Icon, tone } = ICON[item.kind];

        return (
          <li key={item.id} className="flex gap-3">
            <span className={`grid size-7 shrink-0 place-items-center rounded-full ${tone}`}>
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 border-b border-line pb-3 last:border-b-0">
              <p className="text-sm font-medium">{item.title}</p>
              {item.detail && (
                <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
              )}
              <p className="mt-1 text-[11px] text-muted">
                {item.createdAt.toLocaleString("pt-BR", {
                  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                })}
                {item.author && ` · ${item.author.name}`}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
