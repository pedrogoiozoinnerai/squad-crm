"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarCheck, CalendarPlus, Check, Link2, Video } from "lucide-react";

import { Contagem } from "@/components/sala/Contagem";
import { ABRE_ANTES_MIN } from "@/lib/sala";

export type DadosDoConvite = {
  token: string;
  meetingId: string;
  leadNome: string;
  donoNome: string;
  quando: string;
  horario: string;
  /// Quando a sessão começa. É o que a contagem mostra.
  comecaEm: string;
  /// Quando a sala abre (30 min antes). Só troca a tela para o botão.
  abreEm: string;
  situacao: "esperando" | "aberta" | "encerrada" | "cancelada";
};

/**
 * A porta do lead.
 *
 * Um estado só por vez, e cada um diz o que fazer agora: esperar com a página
 * aberta, entrar, ou remarcar. O lead não tem conta no CRM e não vai ler
 * instrução nenhuma — a tela precisa se explicar sozinha.
 */
export function EntradaDoConvite({
  convite,
  agoraServidor,
  marca,
  acabouDeRemarcar,
}: {
  convite: DadosDoConvite;
  agoraServidor: string;
  marca: string;
  /// Chegou aqui vindo da tela de remarcar, e deu certo.
  acabouDeRemarcar?: boolean;
}) {
  const router = useRouter();
  const [situacao, setSituacao] = useState(convite.situacao);
  const [copiado, setCopiado] = useState(false);

  /**
   * Guardar o link é o que separa quem volta de quem some.
   *
   * Não há e-mail nem WhatsApp ligados: esta página é o único lugar onde o
   * endereço existe. Quem fechar a aba sem guardar não tem como voltar — e não
   * vai escrever para ninguém pedindo, vai simplesmente não aparecer.
   */
  const copiarLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de área de transferência (acontece em navegador embutido
      // de aplicativo): seleciona a barra de endereço mentalmente e segue. Não
      // vale quebrar a tela por causa disso.
      setCopiado(false);
    }
  }, []);

  // A contagem chega a zero: o botão aparece sem recarregar a página. É o que
  // sustenta a promessa de "deixe esta página aberta".
  const abrir = useCallback(() => setSituacao("aberta"), []);

  const iniciais = convite.donoNome
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  const cabecalho = {
    esperando: { etiqueta: "Reunião confirmada", frase: "Tudo certo — sua sessão está garantida." },
    aberta: { etiqueta: "Sala aberta", frase: "Tudo pronto — é só entrar." },
    encerrada: { etiqueta: "Reunião encerrada", frase: "Esta sessão já aconteceu." },
    cancelada: { etiqueta: "Reunião cancelada", frase: "Esta sessão foi desmarcada." },
  }[situacao];

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-[520px]">
        {/* A marca, no primeiro contato do lead com ela.
            Esta página é onde ele chega vindo do funil, e não havia nada aqui
            que dissesse de quem é a reunião além do nome do vendedor. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-black.svg"
          alt="Squad.com"
          className="mx-auto mb-7 h-7 w-auto sm:h-8"
        />

        <div className="card p-7 shadow-[0_1px_2px_rgba(15,23,42,.04),0_12px_32px_-12px_rgba(15,23,42,.12)] sm:p-9">
          <p className="flex items-center justify-center gap-2 text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
            <span
              className={`size-1.5 rounded-full ${
                situacao === "aberta"
                  ? "bg-waz-40"
                  : situacao === "esperando"
                    ? "bg-waz-50"
                    : "bg-muted"
              }`}
            />
            {cabecalho.etiqueta}
          </p>

          {acabouDeRemarcar && (
            <p
              role="status"
              className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-waz-95 px-4 py-2.5 text-sm font-medium text-waz-20"
            >
              <CalendarCheck className="size-4 shrink-0" />
              Pronto — seu horário foi alterado. O link continua o mesmo.
            </p>
          )}

          <h1 className="mt-4 text-center text-[38px] leading-[1.1] font-semibold tracking-tight text-balance">
            Olá, {convite.leadNome.split(" ")[0]}.
          </h1>
          <p className="mt-2 text-center text-[15px] text-muted">{cabecalho.frase}</p>

          <section className="mt-7 rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center gap-3.5">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-waz-20 text-sm font-bold text-white">
                {iniciais}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-semibold">{convite.donoNome}</span>
                <span className="block truncate text-sm text-muted">
                  Seu especialista · {marca}
                </span>
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-5">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">Data</p>
                <p className="mt-1 font-semibold">{convite.quando}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-[0.14em] text-muted uppercase">
                  Horário
                </p>
                {/* Sem `tabular-nums`: na Fustat os dois-pontos ganham largura
                    de dígito e o horário sai "16 : 39". Ali não há coluna de
                    números para alinhar — só na contagem, que muda a cada
                    segundo. */}
                <p className="mt-1 font-semibold">
                  {convite.horario} <span className="font-normal text-muted">· Brasília</span>
                </p>
              </div>
            </div>

            {situacao === "esperando" && (
              <div className="mt-5 border-t border-line pt-5">
                <Contagem
                  comecaEm={new Date(convite.comecaEm)}
                  abreEm={new Date(convite.abreEm)}
                  agoraServidor={new Date(agoraServidor)}
                  aoAbrir={abrir}
                />
                {/* Sem esta linha, o botão aparecendo com a contagem ainda
                    correndo parece defeito. Com ela, é cortesia. */}
                <p className="mt-3 text-center text-xs text-muted">
                  A sala abre {ABRE_ANTES_MIN} minutos antes — o botão de entrar aparece aqui.
                </p>
              </div>
            )}
          </section>

          {situacao === "aberta" && (
            <button
              type="button"
              onClick={() => router.push(`/sala/${convite.meetingId}?c=${convite.token}`)}
              className="btn-primary mt-6 w-full bg-waz-20 py-4 text-[15px] shadow-[0_8px_20px_-8px_rgba(19,83,44,.5)] hover:bg-waz-10"
            >
              Entrar na reunião
              <ArrowRight className="size-4" />
            </button>
          )}

          {/* As duas formas de não perder a reunião.
              Aparecem enquanto ela não terminou, inclusive com a sala já
              aberta: quem chegou adiantado ainda quer o alarme, e quem vai
              entrar pelo celular quer o link no computador. */}
          {(situacao === "esperando" || situacao === "aberta") && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <a
                href={`/api/agenda/calendario?convite=${convite.token}`}
                className="btn-ghost"
                // `download` para o navegador salvar em vez de tentar exibir o
                // texto do arquivo, que é o que o Chrome faz sem isto.
                download="reuniao-squad.ics"
              >
                <CalendarPlus className="size-4" />
                Adicionar ao calendário
              </a>
              <button type="button" onClick={() => void copiarLink()} className="btn-ghost">
                {copiado ? <Check className="size-4" /> : <Link2 className="size-4" />}
                {copiado ? "Link copiado" : "Copiar o link"}
              </button>
            </div>
          )}

          {situacao === "esperando" && (
            <p className="mt-5 text-center text-sm leading-relaxed text-muted text-balance">
              Guarde o link ou o convite do calendário — é por ele que você entra.
              Deixando esta página aberta, o botão aparece na hora.
            </p>
          )}

          {situacao !== "cancelada" && (
            <p className="mt-5 text-center text-sm text-muted">
              Não vai participar?{" "}
              <a href={`/convite/${convite.token}/remarcar`} className="font-medium text-waz-30 underline-offset-4 hover:underline">
                Remarque aqui
              </a>
            </p>
          )}

          <p className="mt-7 flex items-center justify-center gap-2 text-xs text-muted">
            <Video className="size-3.5 shrink-0" />
            A chamada abre aqui no navegador — sem instalar nada.
          </p>
        </div>

        <p className="mt-8 text-center text-xs text-muted">
          © {new Date(agoraServidor).getFullYear()} {marca}
        </p>
      </div>
    </main>
  );
}
