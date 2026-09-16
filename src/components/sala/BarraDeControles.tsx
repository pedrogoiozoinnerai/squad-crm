"use client";

import {
  Aperture,
  ChevronUp,
  Hand,
  Lock,
  LockOpen,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";

export type EstadoDosControles = {
  microfone: boolean;
  camera: boolean;
  compartilhando: boolean;
  maoLevantada: boolean;
  microfonesTravados: boolean;
  gravando: boolean;
};

export type AcoesDosControles = {
  alternarMicrofone: () => void;
  alternarCamera: () => void;
  escolherMicrofone: () => void;
  escolherCamera: () => void;
  escolherSaida: () => void;
  alternarTela: () => void;
  alternarMao: () => void;
  silenciarTodos: () => void;
  alternarTrava: () => void;
  encerrar: () => void;
  sair: () => void;
};

/**
 * A barra da chamada.
 *
 * Três grupos separados por divisor, e a ordem importa: primeiro o que é seu
 * (microfone, câmera), depois o que afeta a conversa (tela, mão), por último o
 * que afeta todo mundo (silenciar, travar, encerrar). Quem só quer se calar não
 * passa perto do botão que encerra a sessão dos outros.
 *
 * Os três últimos só aparecem para o host: deixá-los desabilitados na tela do
 * lead seria mostrar um poder que ele não tem.
 */
export function BarraDeControles({
  estado,
  acoes,
  host,
  seletorAberto,
  painelDeDispositivos,
}: {
  estado: EstadoDosControles;
  acoes: AcoesDosControles;
  host: boolean;
  /// Qual seletor de aparelho está aberto, se algum.
  seletorAberto: MediaDeviceKind | null;
  /// O painel em si vem de fora: ele precisa da sala, e a barra não.
  painelDeDispositivos: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center p-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-sala-painel/95 px-3 py-2 shadow-2xl backdrop-blur">
        <Botao
          ativo={!estado.microfone}
          dica={estado.microfone ? "Silenciar meu microfone" : "Ativar microfone"}
          aoClicar={acoes.alternarMicrofone}
        >
          {estado.microfone ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </Botao>
        <Seletor dica="Escolher microfone" aoClicar={acoes.escolherMicrofone}>
          {seletorAberto === "audioinput" && painelDeDispositivos}
        </Seletor>

        <Botao
          ativo={!estado.camera}
          dica={estado.camera ? "Desligar câmera" : "Ativar câmera"}
          aoClicar={acoes.alternarCamera}
        >
          {estado.camera ? <VideoLigado /> : <VideoDesligado />}
        </Botao>
        <Seletor dica="Escolher câmera" aoClicar={acoes.escolherCamera}>
          {seletorAberto === "videoinput" && painelDeDispositivos}
        </Seletor>

        <Botao dica="Desfoque de fundo entra junto com a gravação" desabilitado>
          <Aperture className="size-5" />
        </Botao>

        <span className="relative">
          <Botao dica="Saída de áudio" aoClicar={acoes.escolherSaida}>
            <Volume2 className="size-5" />
          </Botao>
          {seletorAberto === "audiooutput" && painelDeDispositivos}
        </span>

        <Divisor />

        <Botao ativo={estado.compartilhando} dica="Compartilhar tela" aoClicar={acoes.alternarTela}>
          <MonitorUp className="size-5" />
        </Botao>
        <Botao ativo={estado.maoLevantada} dica="Levantar mão" aoClicar={acoes.alternarMao}>
          <Hand className="size-5" />
        </Botao>

        {host && (
          <>
            <Divisor />
            <Botao dica="Silenciar todos" aoClicar={acoes.silenciarTodos}>
              <VolumeX className="size-5" />
            </Botao>
            <Botao
              ativo={estado.microfonesTravados}
              dica={
                estado.microfonesTravados
                  ? "Liberar microfones"
                  : "Travar microfones para todos"
              }
              aoClicar={acoes.alternarTrava}
            >
              {estado.microfonesTravados ? <Lock className="size-5" /> : <LockOpen className="size-5" />}
            </Botao>
            <Botao
              dica={estado.gravando ? "Encerrar sessão e gravação" : "Encerrar a sessão para todos"}
              aoClicar={acoes.encerrar}
              tom="perigo"
            >
              <Square className="size-4 fill-current" />
            </Botao>
          </>
        )}

        <Divisor />

        <button
          type="button"
          onClick={acoes.sair}
          className="ml-1 inline-flex items-center gap-2 rounded-full bg-red-500/80 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500"
        >
          <PhoneOff className="size-4" />
          Sair
        </button>
      </div>
    </div>
  );
}

function Divisor() {
  return <span className="mx-1.5 h-6 w-px bg-white/10" aria-hidden />;
}

function Botao({
  children,
  dica,
  aoClicar,
  ativo,
  desabilitado,
  tom,
}: {
  children: React.ReactNode;
  dica: string;
  aoClicar?: () => void;
  ativo?: boolean;
  desabilitado?: boolean;
  tom?: "perigo";
}) {
  return (
    <span className="group relative">
      <button
        type="button"
        onClick={aoClicar}
        disabled={desabilitado}
        aria-label={dica}
        className={`grid size-11 place-items-center rounded-full text-white/80 transition
          hover:bg-white/10 hover:text-white
          focus-visible:ring-2 focus-visible:ring-waz-50 focus-visible:outline-none
          disabled:cursor-not-allowed disabled:text-white/25 disabled:hover:bg-transparent
          ${ativo ? (tom === "perigo" ? "bg-red-500/25 text-red-300" : "bg-waz-50/20 text-waz-80") : ""}
          ${tom === "perigo" && !ativo ? "text-red-400/90" : ""}`}
      >
        {children}
      </button>

      {/* A dica é a única coisa que nomeia estes ícones. Sem ela, "travar
          microfones" e "silenciar todos" são dois cadeados parecidos, e um
          deles é irreversível para quem está falando. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-10 -translate-x-1/2 rounded-xl bg-sala-elevado px-3.5 py-2 text-sm whitespace-nowrap text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {dica}
      </span>
    </span>
  );
}

function Seletor({
  dica,
  aoClicar,
  children,
}: {
  dica: string;
  aoClicar: () => void;
  children?: React.ReactNode;
}) {
  return (
    <span className="group relative">
      {children}
      <button
        type="button"
        onClick={aoClicar}
        aria-label={dica}
        className="grid size-7 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-waz-50 focus-visible:outline-none"
      >
        <ChevronUp className="size-4" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-10 -translate-x-1/2 rounded-xl bg-sala-elevado px-3.5 py-2 text-sm whitespace-nowrap text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {dica}
      </span>
    </span>
  );
}

/* O lucide não tem "câmera de vídeo cortada" com o traço no ângulo do print. */
function VideoLigado() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
      <path d="m16 10 4.4-2.6A1 1 0 0 1 22 8.2v7.6a1 1 0 0 1-1.6.8L16 14" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

function VideoDesligado() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5">
      <path d="M16 16v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 8.2v7.6a1 1 0 0 1-1.6.8L16 14v-4l4.4-2.6A1 1 0 0 1 22 8.2Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m2 2 20 20" strokeLinecap="round" />
    </svg>
  );
}
