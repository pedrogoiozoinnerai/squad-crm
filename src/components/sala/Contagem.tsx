"use client";

import { useEffect, useState } from "react";

/**
 * Quanto falta para a reunião começar.
 *
 * Contava até a sala ABRIR, sob o rótulo "Começa em" — e os dois instantes são
 * diferentes por 30 minutos. Quem agendava às 09:54 para as 11:00 lia "faltam
 * 35 minutos", que é quando a sala abre (10:30), não quando a sessão começa. A
 * pessoa acreditava no número maior da tela, e ou chegava cedo demais achando
 * que era a hora, ou concluía que o horário estava errado.
 *
 * Agora são dois instantes declarados: `comecaEm` é o que a contagem mostra, e
 * `abreEm` é só o gatilho que troca a tela para o botão de entrar. A contagem
 * some antes de zerar, quando a sala abre — e o texto ao lado diz isso.
 *
 * O instante de referência vem do SERVIDOR (`agoraServidor`): o relógio da
 * máquina do lead pode estar minutos adiantado, e aí a sala "abriria" antes da
 * hora — o botão apareceria e o token seria recusado, sem explicação. Aqui o
 * cliente só conta o tempo que passou desde que a página carregou, e soma ao
 * relógio do servidor.
 */
export function Contagem({
  comecaEm,
  abreEm,
  agoraServidor,
  aoAbrir,
}: {
  comecaEm: Date;
  abreEm: Date;
  agoraServidor: Date;
  aoAbrir: () => void;
}) {
  const [restante, setRestante] = useState(() =>
    Math.max(0, comecaEm.getTime() - agoraServidor.getTime()),
  );

  useEffect(() => {
    const carregouEm = Date.now();
    const base = agoraServidor.getTime();

    const id = setInterval(() => {
      const agora = base + (Date.now() - carregouEm);
      setRestante(Math.max(0, comecaEm.getTime() - agora));
      if (agora >= abreEm.getTime()) aoAbrir();
    }, 1000);

    return () => clearInterval(id);
  }, [comecaEm, abreEm, agoraServidor, aoAbrir]);

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
