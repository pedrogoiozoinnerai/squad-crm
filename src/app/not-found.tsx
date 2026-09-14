import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="card max-w-md p-8 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-surface-2 text-muted">
          <Compass className="size-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold">Página não encontrada</h1>
        <p className="mt-2 text-sm text-muted">
          O endereço não existe ou o registro foi removido.
        </p>
        <Link href="/" className="btn-primary mt-6 w-full">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
