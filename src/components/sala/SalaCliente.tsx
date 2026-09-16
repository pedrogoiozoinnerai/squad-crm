"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";

import type { Room } from "livekit-client";

import { Preparo, type Preferencias } from "@/components/sala/Preparo";
import { Reuniao } from "@/components/sala/Reuniao";
import type { SituacaoDaSala } from "@/lib/sala";

type Fase = "preparo" | "conectando" | "dentro" | "saiu" | "erro";

export function SalaCliente({
  meetingId,
  convite,
  convidado,
  nome,
  host,
  titulo,
  situacao,
  voltarPara,
}: {
  meetingId: string;
  convite: string | null;
  /// Token do LINK da reunião. Quem chega por ele diz o próprio nome e entra
  /// como convidado — o token é da sala, não da pessoa.
  convidado?: string | null;
  nome: string;
  host: boolean;
  titulo: string;
  situacao: SituacaoDaSala;
  voltarPara: string | null;
}) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>("preparo");
  const [sala, setSala] = useState<Room | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Desconecta ao sair da página.
  //
  // Sem isto a conexão fica viva no LiveKit depois de fechar a aba ou navegar,
  // e ao voltar a MESMA identidade entra de novo — o servidor então derruba a
  // primeira por identidade duplicada, e quem acabou de entrar vê "você saiu".
  // Foi exatamente o que aconteceu no primeiro teste.
  const viva = useRef<Room | null>(null);
  useEffect(() => {
    viva.current = sala;
  }, [sala]);
  useEffect(() => () => void viva.current?.disconnect(), []);

  const entrar = useCallback(
    async (preferencias: Preferencias) => {
      setFase("conectando");
      setErro(null);
      try {
        const resposta = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            convite
              ? { convite }
              : convidado
                ? { convidado, nome: preferencias.nome }
                : { meetingId },
          ),
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro ?? "Não foi possível entrar.");

        // A conexão em si vive num módulo à parte, carregado só aqui: o
        // `livekit-client` pesa, e quem abre a antessala e desiste não devia
        // baixá-lo.
        const { conectar } = await import("@/components/sala/conexao");
        setSala(await conectar({ url: dados.url, token: dados.token, preferencias }));
        setFase("dentro");
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível entrar.");
        setFase("erro");
      }
    },
    [convite, convidado, meetingId],
  );

  if (situacao !== "aberta") {
    const texto = {
      esperando: "Esta sala ainda não abriu.",
      encerrada: "Esta reunião já terminou.",
      cancelada: "Esta reunião foi cancelada.",
      aberta: "",
    }[situacao];
    return <Aviso texto={texto} voltarPara={voltarPara} />;
  }

  if (fase === "preparo" || fase === "erro") {
    return (
      <>
        {erro && (
          <div className="mx-auto mt-6 flex max-w-[640px] items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
            <p className="text-sm text-red-800">{erro}</p>
          </div>
        )}
        <Preparo
          nome={nome}
          pedirNome={Boolean(convidado)}
          aoEntrar={(p) => void entrar(p)}
          aoCancelar={voltarPara ? () => router.push(voltarPara) : undefined}
        />
      </>
    );
  }

  if (fase === "conectando") {
    return <Aviso texto="Entrando na sala…" voltarPara={null} />;
  }

  if (fase === "saiu" || !sala) {
    return (
      <Aviso
        texto={fase === "saiu" ? "Você saiu da reunião." : "A conexão caiu."}
        voltarPara={voltarPara}
      />
    );
  }

  return (
    <Reuniao
      sala={sala}
      titulo={titulo}
      host={host}
      meetingId={meetingId}
      aoSair={() => {
        setSala(null);
        setFase("saiu");
      }}
    />
  );
}

function Aviso({ texto, voltarPara }: { texto: string; voltarPara: string | null }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="card p-8 text-center">
        <p className="text-sm font-semibold">{texto}</p>
        {voltarPara && (
          <a href={voltarPara} className="btn-ghost mt-5">
            Voltar para a agenda
          </a>
        )}
      </div>
    </main>
  );
}
