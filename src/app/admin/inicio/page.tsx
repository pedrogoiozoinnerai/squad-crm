import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { DashboardView } from "@/components/dashboard/DashboardView";
import { requireUser } from "@/lib/auth";
import { contarErros24h, getDashboard } from "@/lib/queries";

export default async function InicioPage() {
  const user = await requireUser("admin");
  const [data, erros24h] = await Promise.all([getDashboard(user), contarErros24h()]);

  return (
    <>
      {/* Só aparece quando há o que avisar. Um indicador permanente de "tudo
          certo" vira parte do cenário e ninguém o lê no dia em que muda. */}
      {erros24h > 0 && (
        <Link
          href="/admin/erros"
          className="mb-4 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 transition hover:bg-red-100"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            <strong>
              {erros24h} {erros24h === 1 ? "erro" : "erros"} de servidor
            </strong>{" "}
            nas últimas 24 horas — ver o que aconteceu
          </span>
        </Link>
      )}

    <DashboardView
      data={data}
      space="admin"
      userName={user.name}
      isAdmin={user.role === "ADMIN"}
    />
    </>
  );
}
