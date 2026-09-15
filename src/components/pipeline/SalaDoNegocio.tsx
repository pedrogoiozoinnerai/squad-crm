"use client";

import { LinkDaSala } from "@/components/sala/LinkDaSala";

/**
 * O acesso à sala dentro da gaveta do negócio.
 *
 * Componente de cliente porque a janela depende do relógio de quem está
 * olhando: a gaveta é renderizada no servidor e ficaria congelada no instante
 * do carregamento — o botão nunca apareceria para quem deixou a tela aberta
 * esperando a hora.
 */
export function SalaDoNegocio({
  reuniaoId,
  convite,
  comecaEm,
  terminaEm,
}: {
  reuniaoId: string;
  convite: string | null;
  comecaEm: Date;
  terminaEm: Date;
}) {
  const agora = Date.now();
  const naJanela =
    agora >= comecaEm.getTime() - 30 * 60_000 && agora <= terminaEm.getTime() + 120 * 60_000;

  if (!naJanela) return null;

  return (
    <div className="mt-3 border-t border-line pt-3">
      <LinkDaSala meetingId={reuniaoId} convite={convite} compacto />
    </div>
  );
}
