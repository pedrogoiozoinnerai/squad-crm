"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import type { FormState } from "@/lib/guard";

/** Mostra o erro da Server Action e fecha o painel quando dá certo. */
export function FormFeedback({ state, closeHref }: { state: FormState; closeHref?: string }) {
  const router = useRouter();
  const ok = state?.ok;

  useEffect(() => {
    if (ok && closeHref) router.push(closeHref);
  }, [ok, closeHref, router]);

  if (!state?.error) return null;

  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      {state.error}
    </p>
  );
}
