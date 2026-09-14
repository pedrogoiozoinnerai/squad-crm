import { ParticipantsView, parseFilters } from "@/components/participants/ParticipantsView";
import { requireUser } from "@/lib/auth";
import { getParticipants } from "@/lib/queries";

const BASE = "/user/participantes";

export default async function ParticipantesPage(props: PageProps<"/user/participantes">) {
  const user = await requireUser("user");
  const filters = parseFilters(await props.searchParams);

  const participants = await getParticipants(user, filters);

  // O "agora" nasce aqui para o componente continuar puro e previsível.
  const now = new Date();

  return (
    <ParticipantsView
      participants={participants}
      showOwner={user.role === "ADMIN"}
      basePath={BASE}
      leadsPath="/user/leads"
      filters={filters}
      now={now}
    />
  );
}
