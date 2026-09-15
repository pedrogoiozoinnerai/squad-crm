"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { Room } from "livekit-client";

/**
 * Troca de câmera, microfone ou saída de áudio no meio da call.
 *
 * Precisa existir porque o fone de ouvido quase nunca está conectado quando a
 * antessala pergunta — ele entra em cima da hora, e até aqui a única saída era
 * sair e voltar.
 */
export function SeletorDeAparelho({
  sala,
  tipo,
  aoFechar,
}: {
  sala: Room;
  tipo: MediaDeviceKind;
  aoFechar: () => void;
}) {
  const [lista, setLista] = useState<MediaDeviceInfo[]>([]);
  const [atual, setAtual] = useState<string | undefined>(sala.getActiveDevice(tipo));

  useEffect(() => {
    let vivo = true;
    void (async () => {
      // `enumerateDevices` só devolve os RÓTULOS depois de alguma permissão
      // concedida — antes disso a lista vem com nomes vazios. Por isso a troca
      // fica aqui dentro, e não na antessala antes de pedir acesso.
      const todos = await navigator.mediaDevices.enumerateDevices();
      if (vivo) setLista(todos.filter((d) => d.kind === tipo));
    })();
    return () => {
      vivo = false;
    };
  }, [tipo]);

  const titulo = {
    audioinput: "Microfone",
    videoinput: "Câmera",
    audiooutput: "Saída de áudio",
  }[tipo as string];

  return (
    <div className="absolute bottom-[calc(100%+12px)] left-1/2 z-30 w-[290px] -translate-x-1/2 overflow-hidden rounded-2xl bg-[#1c2740] shadow-2xl">
      <p className="px-4 pt-3 pb-2 text-[11px] font-semibold tracking-[0.12em] text-white/40 uppercase">
        {titulo}
      </p>
      <ul className="max-h-64 overflow-y-auto pb-2">
        {lista.length === 0 && (
          <li className="px-4 py-3 text-sm text-white/40">Nenhum aparelho encontrado.</li>
        )}
        {lista.map((d) => (
          <li key={d.deviceId}>
            <button
              type="button"
              onClick={async () => {
                await sala.switchActiveDevice(tipo, d.deviceId);
                setAtual(d.deviceId);
                aoFechar();
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-white/80 transition hover:bg-white/10"
            >
              <span className="w-4 shrink-0">
                {d.deviceId === atual && <Check className="size-4 text-waz-50" />}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {d.label || "Aparelho sem nome"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
