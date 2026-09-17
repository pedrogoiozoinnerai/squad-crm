import { notFound } from "next/navigation";

import { SessionPage } from "@/components/sessions/SessionPage";
import { requireUser } from "@/lib/auth";
import { armazenamentoConfigurado } from "@/lib/armazenamento";
import { getSessionDetail } from "@/lib/queries";
import { abaDaSessao } from "@/lib/sessao";
import { configuracao } from "@/lib/reconciliar";

export default async function SessaoPage(props: PageProps<"/user/sessoes/[id]">) {
  const user = await requireUser("user");
  const { id } = await props.params;
  const { aba } = await props.searchParams;

  const qual = abaDaSessao(aba);
  // `now` nasce aqui e desce como prop: componente puro não lê o relógio.
  const now = new Date();
  const [sessao, regra] = await Promise.all([getSessionDetail(user, id, qual), configuracao()]);
  if (!sessao) notFound();

  return (
    <SessionPage
      space="user"
      sessao={sessao}
      aba={qual}
      now={now}
      minutosMinimos={regra.presencaMinutos}
      gravacaoLigada={armazenamentoConfigurado()}
      // Ler é do time inteiro — a gravação é o material de treino do comercial.
      // Escrever continua sendo de quem conduziu.
      podeEscrever={user.role === "ADMIN" || user.id === sessao.owner.id}
    />
  );
}
