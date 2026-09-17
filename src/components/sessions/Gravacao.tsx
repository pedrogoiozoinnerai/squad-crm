"use client";

import { useRef, useState } from "react";
import { AlertCircle, Play } from "lucide-react";

import { carimboDoTrecho, type Segmento } from "@/lib/transcricao";

/**
 * O player da call, com a transcrição ao lado.
 *
 * O vídeo só é pedido no clique, e não no render: `?aba=gravacao` é a aba
 * padrão, então assinar a URL ao desenhar a página registraria "assistiu a
 * call" para quem só abriu a sessão para conferir presença. Um clique é uma
 * intenção; um render não é.
 *
 * A transcrição aparece mesmo sem o vídeo carregado — quem quer só LER a call
 * não precisa gastar 550 MB de banda para isso, e é assim que a maioria das
 * consultas acontece: procurando uma frase, não reassistindo uma hora.
 */
export function Gravacao({
  recordingId,
  duracaoSegundos,
  segmentos,
  condutor,
}: {
  recordingId: string;
  duracaoSegundos: number | null;
  segmentos: Segmento[];
  /// O falante que provavelmente conduziu. Número, não nome: numa sala de vinte
  /// ninguém sabe qual é quem, e prometer nome aqui seria inventar.
  condutor: number | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  async function assistir(emSegundos?: number) {
    if (url) {
      saltar(emSegundos);
      return;
    }
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
      // O `<video>` ainda não existe neste tick. Esperar os metadados é o que
      // faz o salto funcionar no PRIMEIRO clique — sem isso, clicar num trecho
      // abria o vídeo do começo e a pessoa clicava de novo achando que falhou.
      if (emSegundos != null) setTimeout(() => saltar(emSegundos), 0);
    } catch {
      setErro("Sem resposta do servidor. Tente de novo.");
    } finally {
      setPedindo(false);
    }
  }

  function saltar(emSegundos?: number) {
    const v = video.current;
    if (!v || emSegundos == null) return;
    const ir = () => {
      v.currentTime = emSegundos;
      void v.play().catch(() => {});
    };
    if (v.readyState >= 1) ir();
    else v.addEventListener("loadedmetadata", ir, { once: true });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        {url ? (
          <video
            ref={video}
            src={url}
            controls
            autoPlay
            preload="metadata"
            className="aspect-video w-full rounded-xl bg-stone-900"
          />
        ) : (
          <div className="grid aspect-video w-full place-items-center rounded-xl border border-line bg-surface-2">
            <div className="px-6 text-center">
              <button
                type="button"
                onClick={() => assistir()}
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
        )}
      </div>

      {segmentos.length > 0 && (
        <div className="flex max-h-[60vh] min-h-0 flex-col overflow-y-auto rounded-xl border border-line">
          <p className="sticky top-0 border-b border-line bg-surface px-3.5 py-2.5 text-[11px] font-semibold text-muted">
            Transcrição · clique para saltar o vídeo
          </p>
          <ol className="flex flex-col">
            {segmentos.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => assistir(s.inicio)}
                  className="flex w-full gap-2.5 px-3.5 py-2 text-left transition hover:bg-surface-2"
                >
                  <span className="w-12 shrink-0 text-[11px] text-muted tabular-nums">
                    {carimboDoTrecho(s.inicio)}
                  </span>
                  <span className="min-w-0 flex-1 text-sm break-words">
                    {s.falante !== null && (
                      <span className="mr-1.5 text-[11px] font-semibold text-muted">
                        {/* Número, e não nome: a diarização separa vozes, não
                            identifica pessoas. Chamar o falante 0 de "Michel"
                            numa sala de vinte seria um chute que a auditoria
                            depois usaria para julgar a fala do lead como se
                            fosse a do closer. */}
                        {s.falante === condutor ? "Quem conduziu" : `Falante ${s.falante + 1}`}
                      </span>
                    )}
                    {s.texto}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
