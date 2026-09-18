"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { saveLead } from "@/app/actions/leads";
import { Field, SubmitRow } from "@/components/ui/Field";
import { FormFeedback } from "@/components/ui/FormFeedback";
import type { FormState } from "@/lib/guard";

export type LeadFormData = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  segment: string | null;
  revenueRange: string | null;
  score: string | null;
  source: string | null;
  notes: string | null;
  ownerId: string | null;
} | null;

const SEGMENTS = [
  "Educação", "Varejo", "Serviços", "Tecnologia", "Saúde", "Indústria",
  "Construção", "Alimentação", "Eventos", "Outro",
];
const REVENUES = ["Até R$500 mil/ano", "R$500 mil–1M/ano", "R$1M–5M/ano", "R$5M+/ano"];
const SOURCES = ["google", "instagram", "youtube", "outbound", "indicacao", "funil_type"];

export function LeadForm({
  lead,
  closeHref,
  owners,
  defaultOwnerId,
}: {
  lead: LeadFormData;
  closeHref: string;
  /** Só o admin escolhe o responsável; vendedor cria sempre para si. */
  owners: { id: string; name: string }[] | null;
  defaultOwnerId: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveLead, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      {lead && <input type="hidden" name="id" value={lead.id} />}

      <Field label="Nome *">
        <input name="name" required defaultValue={lead?.name ?? ""} className="field" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail">
          <input name="email" type="email" defaultValue={lead?.email ?? ""} className="field" />
        </Field>
        <Field label="Telefone" hint="Normalizado para +55…">
          <input name="phone" defaultValue={lead?.phone ?? ""} className="field" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Empresa">
          <input name="company" defaultValue={lead?.company ?? ""} className="field" />
        </Field>
        <Field label="Cargo">
          <input name="jobTitle" defaultValue={lead?.jobTitle ?? ""} className="field" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Setor">
          <select name="segment" defaultValue={lead?.segment ?? ""} className="field">
            <option value="">Selecione…</option>
            {SEGMENTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Faturamento">
          <select name="revenueRange" defaultValue={lead?.revenueRange ?? ""} className="field">
            <option value="">Selecione…</option>
            {REVENUES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lead score">
          <select name="score" defaultValue={lead?.score ?? ""} className="field">
            <option value="">Sem nota</option>
            {["A", "B", "C", "D", "E"].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Origem">
          <select name="source" defaultValue={lead?.source ?? ""} className="field">
            <option value="">Selecione…</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
      </div>

      {owners && (
        <Field label="Responsável">
          <select name="ownerId" defaultValue={lead?.ownerId ?? defaultOwnerId} className="field">
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>{owner.name}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Anotações">
        <textarea name="notes" rows={3} defaultValue={lead?.notes ?? ""} className="field resize-y" />
      </Field>

      <FormFeedback state={state} closeHref={closeHref} sucesso="Alterações salvas." />

      <SubmitRow>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending && <Loader2 className="size-4 animate-spin" />}
          {lead ? "Salvar alterações" : "Cadastrar lead"}
        </button>
      </SubmitRow>
    </form>
  );
}
