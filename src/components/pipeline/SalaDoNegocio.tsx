"use client";

import { useEffect, useState } from "react";

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
  link,
  comecaEm,
  terminaEm,
}: {
  reuniaoId: string;
  convite: string | null;
  link?: string | null;
  comecaEm: Date;
  terminaEm: Date;
}) {
  // O relógio corre num efeito, e não em `Date.now()` na renderização.
  //
  // Não é só a regra de pureza do React: lido na renderização, o instante
  // congela no primeiro desenho. O negócio aberto às 13:50 com reunião às
  // 14:00 nunca mostrava o link — a janela abria dez minutos depois, e nada
  // mandava a tela desenhar de novo.
  const [agora, setAgora] = useState<number | null>(null);
  useEffect(() => {
    const tique = () => setAgora(Date.now());
    tique();
    const id = setInterval(tique, 30_000);
    return () => clearInterval(id);
  }, []);

  const naJanela =
    agora !== null &&
    agora >= comecaEm.getTime() - 30 * 60_000 &&
    agora <= terminaEm.getTime() + 120 * 60_000;

  if (!naJanela) return null;

  return (
    <div className="mt-3 border-t border-line pt-3">
      <LinkDaSala meetingId={reuniaoId} convite={convite} link={link} compacto />
    </div>
  );
}
