"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/**
 * Painel lateral controlado pela URL (`?lead=`, `?deal=`): o conteúdo é
 * renderizado no servidor, o botão voltar fecha e o link é compartilhável.
 */
export function Drawer({
  closeHref,
  title,
  tituloAcessivel,
  subtitle,
  badge,
  children,
  footer,
  headerExtra,
  actions,
  width = "narrow",
}: {
  closeHref: string;
  /// Nó, não string: o nome do lead virou botão de copiar.
  title: React.ReactNode;
  /// O que o leitor de tela anuncia. Obrigatório quando `title` não é texto:
  /// `aria-label` só aceita string, e um nó ali silenciaria o rótulo do diálogo.
  tituloAcessivel?: string;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Renderizado colado no cabeçalho, sem padding — usado pelo stepper. */
  headerExtra?: React.ReactNode;
  actions?: React.ReactNode;
  width?: "narrow" | "wide";
}) {
  const router = useRouter();

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") router.push(closeHref);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeHref, router]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Fechar"
        onClick={() => router.push(closeHref)}
        className="absolute inset-0 bg-foreground/20 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={tituloAcessivel ?? (typeof title === "string" ? title : undefined)}
        className={`relative flex h-full w-full flex-col border-l border-line bg-surface shadow-2xl ${
          width === "wide" ? "max-w-[1180px]" : "max-w-[640px]"
        }`}
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h2 className="truncate text-2xl font-semibold tracking-tight">{title}</h2>
              {badge}
            </div>
            {subtitle && <div className="mt-1.5 text-sm text-muted">{subtitle}</div>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <button
              type="button"
              onClick={() => router.push(closeHref)}
              aria-label="Fechar painel"
              className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {headerExtra}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && <div className="border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
