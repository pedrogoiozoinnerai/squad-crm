"use client";

import { useEffect, useState } from "react";

/**
 * A contagem regressiva até a sala abrir.
 *
 * O instante de referência vem do SERVIDOR (`agoraServidor`): o relógio da
 * máquina do lead pode estar minutos adiantado, e aí a sala "abriria" antes da
 * hora — o botão apareceria e o token seria recusado, sem explicação. Aqui o
 * cliente só conta o tempo que passou desde que a página carregou, e soma ao
 * relógio do servidor.
 */
export function Contagem({
  abreEm,
  agoraServidor,
  aoAbrir,
}: {
  abreEm: Date;
  agoraServidor: Date;
  aoAbrir: () => void;
}) {
  const [restante, setRestante] = useState(() =>
    Math.max(0, abreEm.getTime() - agoraServidor.getTime()),
  );

  useEffect(() => {
    const carregouEm = Date.now();
    const base = agoraServidor.getTime();

    const id = setInterval(() => {
      const agora = base + (Date.now() - carregouEm);
      const falta = Math.max(0, abreEm.getTime() - agora);
      setRestante(falta);
      if (falta === 0) aoAbrir();
    }, 1000);

    return () => clearInterval(id);
  }, [abreEm, agoraServidor, aoAbrir]);

  const total = Math.floor(restante / 1000);
  const partes = [
    { valor: Math.floor(total / 86400), rotulo: "dias" },
    { valor: Math.floor((total % 86400) / 3600), rotulo: "horas" },
    { valor: Math.floor((total % 3600) / 60), rotulo: "min" },
    { valor: total % 60, rotulo: "seg" },
  ];

  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Começa em</p>
      <div className="mt-2 grid grid-cols-4 gap-2" role="timer" aria-live="off">
        {partes.map((parte) => (
          <div key={parte.rotulo} className="rounded-xl bg-surface-2 px-2 py-3 text-center">
            <span className="block text-2xl leading-none font-semibold tabular-nums">
              {String(parte.valor).padStart(2, "0")}
            </span>
            <span className="mt-1.5 block text-[10px] font-semibold tracking-[0.12em] text-muted uppercase">
              {parte.rotulo}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
