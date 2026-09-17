"use client";

import { useState } from "react";
import { AlertCircle, Play } from "lucide-react";

/**
 * O player da call.
 *
 * O vídeo só é pedido no clique, e não no render: `?aba=gravacao` é a aba
 * padrão, então assinar a URL ao desenhar a página registraria "assistiu a
 * call" para quem só abriu a sessão para conferir presença. Um clique é uma
 * intenção; um render não é.
 *
 * Também economiza o que não é pouco: uma URL assinada por visita a uma página
 * que trinta pessoas do time abrem por dia são trinta assinaturas para nada.
 */
export function Gravacao({ recordingId, duracaoSegundos }: {
  recordingId: string;
  duracaoSegundos: number | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState(false);

  async function assistir() {
    setPedindo(true);
    setErro(null);
    try {
      const r = await fetch(`/api/gravacoes/${recordingId}/url`);
      const corpo = (await r.json()) as { url?: string; erro?: string };
      if (!r.ok || !corpo.url) {
        setErro(corpo.erro ?? "Não foi possível abrir a gravação.");
        return;
      }
      setUrl(corpo.url);
    } catch {
      // A rede caiu no meio. Dizer isso é melhor que um botão que não responde.
      setErro("Sem resposta do servidor. Tente de novo.");
    } finally {
      setPedindo(false);
    }
  }

  if (url) {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="aspect-video w-full rounded-xl bg-stone-900"
      />
    );
  }

  return (
    <div className="grid aspect-video w-full place-items-center rounded-xl border border-line bg-surface-2">
      <div className="px-6 text-center">
        <button
          type="button"
          onClick={assistir}
          disabled={pedindo}
          className="btn btn-primary mx-auto text-sm disabled:opacity-50"
        >
          <Play className="size-4" />
          {pedindo ? "Abrindo…" : "Assistir"}
        </button>
        <p className="mt-2.5 text-[11px] text-muted">
          {duracaoSegundos ? `${Math.round(duracaoSegundos / 60)} min · ` : ""}
          O acesso fica registrado — a gravação é de um cliente.
        </p>
        {erro && (
          <p role="alert" className="mt-3 flex items-center justify-center gap-1.5 text-xs text-red-700">
            <AlertCircle className="size-3.5 shrink-0" />
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}
