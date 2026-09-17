import Link from "next/link";
import { MessageCircle, Phone, Plus } from "lucide-react";

import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { linkWhatsapp } from "@/lib/mensagem";
import { StatBar } from "@/components/ui/Stat";
import { PageHeader } from "@/components/shell/PageHeader";

type Lead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  score: string | null;
  status: "INCOMPLETE" | "COMPLETE" | "CONVERTED" | "LOST";
  source: string | null;
  owner: { name: string } | null;
};

/**
 * Rótulo da origem.
 *
 * `source` guarda código nosso — `funil_type_sem_agenda` — e a tela mostrava o
 * código cru. O vendedor não tem por que aprender a nomenclatura do banco para
 * entender de onde o lead veio. Origem desconhecida cai no próprio valor, que
 * é melhor do que esconder.
 */
const ORIGEM: Record<string, string> = {
  funil_type: "Funil do Type",
  funil_type_sem_agenda: "Funil · não agendou",
  HubSpot: "HubSpot",
  "HubSpot (negócio sem contato)": "HubSpot · sem contato",
};

const COLUMNS = [
  {
    status: "INCOMPLETE" as const,
    title: "Lead incompleto",
    hint: "Recém-captado, ainda falta qualificação",
    dot: "bg-stone-400",
  },
  {
    status: "COMPLETE" as const,
    title: "Lead completo",
    hint: "Dados completos, pronto para entrar em contato",
    dot: "bg-sky-500",
  },
  {
    status: "CONVERTED" as const,
    title: "Convertido",
    hint: "Virou negócio no pipeline",
    dot: "bg-waz-50",
  },
  {
    status: "LOST" as const,
    title: "Perdido",
    hint: "Não seguiu — o histórico fica",
    dot: "bg-stone-300",
  },
];

export function LeadsView({
  leads,
  totais,
  showOwner,
  basePath,
}: {
  leads: Lead[];
  /// Contagem real por status, do banco. `leads` traz só as primeiras de cada
  /// coluna — contar o array daria um número menor que a verdade.
  totais: Record<"INCOMPLETE" | "COMPLETE" | "CONVERTED" | "LOST", number>;
  showOwner: boolean;
  basePath: string;
}) {
  const count = (status: Lead["status"]) => totais[status];

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Capte, contate e converta leads em agendamento"
        actions={
          <Link href={`${basePath}?lead=new`} className="btn-primary">
            <Plus className="size-4" />
            Cadastrar lead
          </Link>
        }
      />

      <StatBar
        items={[
          // Soma dos totais reais, não do que foi carregado: as colunas já
          // mostram a contagem do banco, e "Total: 60 · Convertidos: 8350"
          // em cima da mesma tela é pior que qualquer um dos dois sozinho.
          { label: "Total", value: count("INCOMPLETE") + count("COMPLETE") + count("CONVERTED") + count("LOST") },
          { label: "Incompletos", value: count("INCOMPLETE") },
          { label: "Completos", value: count("COMPLETE") },
          { label: "Convertidos", value: count("CONVERTED") },
          { label: "Perdidos", value: count("LOST") },
        ]}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => {
          const items = leads.filter((lead) => lead.status === column.status);
          const escondidos = Math.max(0, count(column.status) - items.length);

          return (
            <section key={column.status} className="card flex flex-col p-4">
              <header className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <span className={`size-2 rounded-full ${column.dot}`} />
                    {column.title}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">{column.hint}</p>
                </div>
                <span className="chip bg-surface-2 text-muted">{count(column.status)}</span>
              </header>

              {escondidos > 0 && (
                <p className="mb-2 text-xs text-muted">
                  mostrando os {items.length} mais recentes
                </p>
              )}

              <div className="flex flex-col gap-2">
                {items.length === 0 && (
                  <p className="rounded-xl border border-dashed border-line px-3 py-8 text-center text-xs text-muted">
                    Nenhum lead aqui.
                  </p>
                )}

                {items.map((lead) => (
                  <article
                    key={lead.id}
                    className="rounded-xl bg-surface-2/60 p-3 transition hover:bg-surface-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`${basePath}?lead=${lead.id}`}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-semibold hover:text-waz-20">
                          {lead.name}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {[lead.company, lead.jobTitle].filter(Boolean).join(" · ") ||
                            "Sem empresa informada"}
                        </p>
                      </Link>
                      <ScoreBadge score={lead.score} />
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {lead.phone ? (
                        <>
                          <a
                            href={linkWhatsapp(lead.phone) ?? "#"}
                            target="_blank"
                            rel="noreferrer"
                            className="chip bg-surface text-muted ring-1 ring-line transition hover:text-waz-20"
                          >
                            <MessageCircle className="size-3" />
                            WhatsApp
                          </a>
                          <a
                            href={`tel:${lead.phone}`}
                            className="chip bg-surface text-muted ring-1 ring-line transition hover:text-waz-20"
                          >
                            <Phone className="size-3" />
                            Ligar
                          </a>
                        </>
                      ) : (
                        <span className="text-xs text-muted italic">Sem telefone</span>
                      )}
                      {lead.source && (
                        <span className="chip bg-surface-2 text-muted">{ORIGEM[lead.source] ?? lead.source}</span>
                      )}
                    </div>

                    {showOwner && lead.owner && (
                      <p className="mt-2 text-[11px] text-muted">
                        Responsável: {lead.owner.name}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
