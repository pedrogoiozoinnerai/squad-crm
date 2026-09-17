"use client";

import { useState } from "react";
import { CalendarPlus, Plus, Zap } from "lucide-react";

import {
  FormularioDeReuniao,
  type PadraoDaReuniao,
} from "@/components/reunioes/FormularioDeReuniao";
import { Modal } from "@/components/ui/Modal";

/**
 * O botão "Nova reunião" e o painel que ele abre.
 *
 * Um componente para os cinco lugares — agenda, calendário, sessões, negócio e
 * lead. Antes existia UM caminho para marcar reunião no CRM inteiro, dentro da
 * gaveta de um lead: quem quisesse marcar precisava primeiro achar um lead,
 * mesmo quando a reunião não era de nenhum.
 */
export function NovaReuniao({
  padrao,
  owners,
  rotulo = "Nova reunião",
  variante = "primaria",
}: {
  padrao?: PadraoDaReuniao;
  owners?: { id: string; name: string }[];
  rotulo?: string;
  variante?: "primaria" | "discreta" | "agora";
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={variante === "discreta" ? "btn-ghost shrink-0" : "btn-primary shrink-0"}
      >
        {variante === "agora" ? (
          <Zap className="size-4" />
        ) : variante === "primaria" ? (
          <Plus className="size-4" />
        ) : (
          <CalendarPlus className="size-4" />
        )}
        {rotulo}
      </button>

      {aberto && (
        <Modal
          titulo={rotulo}
          descricao="O link sai pronto na tela seguinte. A sala abre 30 minutos antes do horário."
          aoFechar={() => setAberto(false)}
        >
          {/* Só existe enquanto está aberto, então reabrir depois de agendar já
              nasce com o formulário limpo — sem `key` para forçar remontagem. */}
          <FormularioDeReuniao
            padrao={padrao}
            owners={owners}
            aoConcluir={() => setAberto(false)}
          />
        </Modal>
      )}
    </>
  );
}
