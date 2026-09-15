"use client";

import { useEffect, useRef, useState } from "react";
import { RoomEvent, type Participant, type Room } from "livekit-client";
import { MessageSquare, SendHorizontal } from "lucide-react";

export type Mensagem = {
  id: string;
  autor: string;
  texto: string;
  em: Date;
  minha: boolean;
};

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

/**
 * O chat da chamada.
 *
 * Vai pelo canal de dados do LiveKit, não pelo nosso banco: a mensagem precisa
 * chegar enquanto a call acontece, e passar pelo servidor acrescentaria um
 * salto e um ponto de falha a uma frase que vale trinta segundos.
 *
 * O preço é que a conversa não sobrevive à sala — quem entra depois não vê o
 * que foi dito antes. Persistir isso é outro problema, e só vale junto com a
 * transcrição, que vai guardar bem mais que o chat.
 */
export function Conversa({ sala }: { sala: Room }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const fim = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const recebeu = (carga: Uint8Array, de?: Participant) => {
      try {
        const corpo = JSON.parse(decodificador.decode(carga));
        if (corpo?.tipo !== "chat" || typeof corpo.texto !== "string") return;
        setMensagens((atuais) => [
          ...atuais,
          {
            id: `${de?.identity ?? "?"}-${Date.now()}-${atuais.length}`,
            autor: de?.name || de?.identity || "Alguém",
            texto: corpo.texto,
            em: new Date(),
            minha: false,
          },
        ]);
      } catch {
        // Carga que não é nossa (outro recurso do LiveKit) — ignora em silêncio.
      }
    };

    sala.on(RoomEvent.DataReceived, recebeu);
    return () => {
      sala.off(RoomEvent.DataReceived, recebeu);
    };
  }, [sala]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length]);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const limpo = texto.trim();
    if (!limpo) return;

    setTexto("");
    setMensagens((atuais) => [
      ...atuais,
      {
        id: `eu-${Date.now()}`,
        autor: sala.localParticipant.name || "Você",
        texto: limpo,
        em: new Date(),
        minha: true,
      },
    ]);

    // `reliable`: mensagem de texto não pode se perder por congestionamento,
    // ao contrário de um quadro de vídeo.
    await sala.localParticipant.publishData(
      codificador.encode(JSON.stringify({ tipo: "chat", texto: limpo })),
      { reliable: true },
    );
  }

  return (
    <section className="flex w-[290px] shrink-0 flex-col overflow-hidden rounded-2xl bg-[#131c33]">
      <header className="flex items-center gap-2 px-4 py-3.5">
        <MessageSquare className="size-4 text-white/50" />
        <h2 className="text-[11px] font-semibold tracking-[0.14em] text-white/80 uppercase">
          Chat
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {mensagens.length === 0 ? (
          <div className="grid h-full place-items-center px-4 text-center">
            <div>
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/5">
                <MessageSquare className="size-6 text-white/30" />
              </span>
              <p className="mt-4 font-semibold text-white/70">Nenhuma mensagem</p>
              <p className="mt-1 text-sm text-white/35">
                Envie uma mensagem para iniciar a conversa.
              </p>
            </div>
          </div>
        ) : (
          <ol className="space-y-3 py-1">
            {mensagens.map((m) => (
              <li key={m.id}>
                <p className="flex items-baseline gap-2">
                  <span
                    className={`truncate text-xs font-semibold ${m.minha ? "text-waz-60" : "text-white/70"}`}
                  >
                    {m.minha ? "Você" : m.autor}
                  </span>
                  <span className="shrink-0 text-[10px] text-white/25 tabular-nums">
                    {m.em.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </p>
                {/* `break-words`: um link colado sem espaço estoura a coluna. */}
                <p className="mt-0.5 text-sm break-words text-white/85">{m.texto}</p>
              </li>
            ))}
            <div ref={fim} />
          </ol>
        )}
      </div>

      <form onSubmit={enviar} className="flex items-center gap-2 p-3">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Digite uma mensagem."
          maxLength={2000}
          aria-label="Mensagem"
          className="min-w-0 flex-1 rounded-xl bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:bg-white/10"
        />
        <button
          type="submit"
          disabled={!texto.trim()}
          aria-label="Enviar"
          className="grid size-10 shrink-0 place-items-center rounded-xl text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </section>
  );
}
