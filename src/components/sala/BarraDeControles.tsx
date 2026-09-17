"use client";

import { useState, useSyncExternalStore } from "react";
import {
  Aperture,
  ChevronUp,
  Hand,
  Lock,
  LockOpen,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
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
 *
 * **No celular a barra é outra.** Doze botões numa tela de 375px não cabem — a
 * barra estourava a lateral e o botão de sair ficava fora do aparelho. Então o
 * telefone mostra os quatro que se usa o tempo todo e guarda o resto atrás de
 * "⋯"; do `sm` para cima tudo continua na linha.
 */
export function BarraDeControles({
  estado,
  acoes,
  host,
  seletorAberto,
  painelDeDispositivos,
  aoFecharSeletor,
}: {
  estado: EstadoDosControles;
  acoes: AcoesDosControles;
  host: boolean;
  /// Qual seletor de aparelho está aberto, se algum.
  seletorAberto: MediaDeviceKind | null;
  /// O painel em si vem de fora: ele precisa da sala, e a barra não.
  painelDeDispositivos: React.ReactNode;
  /// Fechar o seletor ao tocar fora dele.
  aoFecharSeletor: () => void;
}) {
  const [mais, setMais] = useState(false);
  const podeCompartilhar = useCompartilhamentoDeTela();

  // Abrir um seletor esconde o "⋯" — senão a lista de aparelhos abriria atrás
  // da folha que a chamou. DERIVADO, e não um efeito que zera o estado: o
  // efeito renderizaria a folha uma vez antes de se corrigir, e ela piscaria.
  const menuAberto = mais && !seletorAberto;

  const fechandoMais = () => setMais(false);
  const noMenu = (acao: () => void) => () => {
    fechandoMais();
    acao();
  };

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center p-3 sm:p-4"
      // A barra do Safari no iPhone come a faixa de baixo da tela: sem isto o
      // botão de sair fica embaixo dela e não dá para clicar.
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)" }}
    >
      {seletorAberto && (
        <>
          {/* Fechar ao tocar fora: no celular não existe "clicar fora" sem uma
              área que receba o toque, e o painel cobria meia tela sem saída. */}
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFecharSeletor}
            className="pointer-events-auto fixed inset-0 z-10 cursor-default"
          />
          <div className="pointer-events-auto">{painelDeDispositivos}</div>
        </>
      )}

      {menuAberto && (
        <>
          {/* Fecha ao tocar fora — num celular não existe "clicar fora" sem uma
              área que receba o toque. */}
          <button
            type="button"
            aria-label="Fechar"
            onClick={fechandoMais}
            className="pointer-events-auto fixed inset-0 z-10 cursor-default sm:hidden"
          />
          <div className="pointer-events-auto fixed inset-x-3 bottom-24 z-20 overflow-hidden rounded-2xl border border-sala-linha bg-sala-elevado py-1.5 shadow-xl sm:hidden">
            <ItemDoMenu aoClicar={noMenu(acoes.escolherMicrofone)} icone={<Mic className="size-4" />}>
              Escolher microfone
            </ItemDoMenu>
            <ItemDoMenu aoClicar={noMenu(acoes.escolherCamera)} icone={<Aperture className="size-4" />}>
              Escolher câmera
            </ItemDoMenu>
            <ItemDoMenu aoClicar={noMenu(acoes.escolherSaida)} icone={<Volume2 className="size-4" />}>
              Saída de áudio
            </ItemDoMenu>
            <ItemDoMenu
              aoClicar={noMenu(acoes.alternarTela)}
              icone={<MonitorUp className="size-4" />}
              desabilitado={!podeCompartilhar}
              nota={podeCompartilhar ? undefined : "Não dá para compartilhar tela neste aparelho"}
            >
              {estado.compartilhando ? "Parar de compartilhar" : "Compartilhar tela"}
            </ItemDoMenu>

            {host && (
              <>
                <span className="my-1.5 block h-px bg-sala-linha" aria-hidden />
                <ItemDoMenu aoClicar={noMenu(acoes.silenciarTodos)} icone={<VolumeX className="size-4" />}>
                  Silenciar todos
                </ItemDoMenu>
                <ItemDoMenu
                  aoClicar={noMenu(acoes.alternarTrava)}
                  icone={
                    estado.microfonesTravados ? <Lock className="size-4" /> : <LockOpen className="size-4" />
                  }
                >
                  {estado.microfonesTravados ? "Liberar microfones" : "Travar microfones"}
                </ItemDoMenu>
                <ItemDoMenu
                  aoClicar={noMenu(acoes.encerrar)}
                  icone={<Square className="size-3.5 fill-current" />}
                  perigo
                >
                  Encerrar a sessão para todos
                </ItemDoMenu>
              </>
            )}
          </div>
        </>
      )}

      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-sala-linha bg-sala-painel px-2 py-2 shadow-lg sm:px-3">
        <Botao
          ativo={!estado.microfone}
          tom="desligado"
          dica={estado.microfone ? "Silenciar meu microfone" : "Ativar microfone"}
          aoClicar={acoes.alternarMicrofone}
        >
          {estado.microfone ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </Botao>
        <Seletor dica="Escolher microfone" aoClicar={acoes.escolherMicrofone} />

        <Botao
          ativo={!estado.camera}
          tom="desligado"
          dica={estado.camera ? "Desligar câmera" : "Ativar câmera"}
          aoClicar={acoes.alternarCamera}
        >
          {estado.camera ? <VideoLigado /> : <VideoDesligado />}
        </Botao>
        <Seletor dica="Escolher câmera" aoClicar={acoes.escolherCamera} />

        <span className="hidden sm:contents">
          <Botao dica="Saída de áudio" aoClicar={acoes.escolherSaida}>
            <Volume2 className="size-5" />
          </Botao>

          <Divisor />

          <Botao
            ativo={estado.compartilhando}
            dica={
              podeCompartilhar
                ? "Compartilhar tela"
                : "Este navegador não compartilha tela"
            }
            desabilitado={!podeCompartilhar}
            aoClicar={acoes.alternarTela}
          >
            <MonitorUp className="size-5" />
          </Botao>
        </span>

        <Botao ativo={estado.maoLevantada} dica="Levantar mão" aoClicar={acoes.alternarMao}>
          <Hand className="size-5" />
        </Botao>

        {host && (
          <span className="hidden sm:contents">
            <Divisor />
            <Botao dica="Silenciar todos" aoClicar={acoes.silenciarTodos}>
              <VolumeX className="size-5" />
            </Botao>
            <Botao
              ativo={estado.microfonesTravados}
              dica={
                estado.microfonesTravados ? "Liberar microfones" : "Travar microfones para todos"
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
          </span>
        )}

        <span className="sm:hidden">
          <Botao ativo={menuAberto} dica="Mais opções" aoClicar={() => setMais((v) => !v)}>
            <MoreHorizontal className="size-5" />
          </Botao>
        </span>

        <Divisor />

        <button
          type="button"
          onClick={acoes.sair}
          aria-label="Sair da reunião"
          className="ml-0.5 inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 sm:ml-1 sm:px-5"
        >
          <PhoneOff className="size-4" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </div>
  );
}

/**
 * Este navegador compartilha tela?
 *
 * No Safari do iPhone e do iPad `getDisplayMedia` não existe. Sem a checagem o
 * botão ficava lá, clicável, e o toque não fazia absolutamente nada — o pior
 * tipo de defeito, porque parece que o app travou.
 *
 * Por `useSyncExternalStore` e não por estado num efeito: no servidor não há
 * `navigator`, e ler direto na renderização faria o HTML do servidor divergir
 * do primeiro desenho do cliente. O terceiro parâmetro é justamente a resposta
 * do servidor — `true`, para o botão não nascer desabilitado e depois habilitar
 * sozinho na frente de quem está olhando.
 *
 * A capacidade não muda durante a sessão, então não há a que se inscrever: o
 * `subscribe` devolve uma função que não faz nada, de propósito.
 */
const semInscricao = () => () => {};

function useCompartilhamentoDeTela() {
  return useSyncExternalStore(
    semInscricao,
    () => typeof navigator?.mediaDevices?.getDisplayMedia === "function",
    () => true,
  );
}

function Divisor() {
  return <span className="mx-1 h-6 w-px bg-sala-linha sm:mx-1.5" aria-hidden />;
}

function ItemDoMenu({
  children,
  icone,
  aoClicar,
  desabilitado,
  perigo,
  nota,
}: {
  children: React.ReactNode;
  icone: React.ReactNode;
  aoClicar: () => void;
  desabilitado?: boolean;
  perigo?: boolean;
  nota?: string;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition disabled:opacity-40 ${
        perigo ? "text-red-600 hover:bg-red-50" : "hover:bg-surface-2"
      }`}
    >
      <span className="shrink-0">{icone}</span>
      <span className="min-w-0 flex-1">
        {children}
        {nota && <span className="block text-xs text-muted">{nota}</span>}
      </span>
    </button>
  );
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
  /// `perigo` é o que encerra a sessão dos outros. `desligado` é o meu próprio
  /// microfone ou a minha câmera cortados.
  ///
  /// Os dois existem porque o preto preenchido já quer dizer LIGADO — é assim
  /// que a mão levantada e o compartilhamento aparecem. Usar o mesmo preto para
  /// "microfone mudo" invertia o significado no único botão onde errar custa
  /// caro: a pessoa fala a reunião inteira achando que está sendo ouvida.
  /// Vermelho para cortado é o que todo mundo já reconhece.
  tom?: "perigo" | "desligado";
}) {
  return (
    <span className="group relative">
      <button
        type="button"
        onClick={aoClicar}
        disabled={desabilitado}
        aria-label={dica}
        aria-pressed={ativo}
        className={`grid size-11 place-items-center rounded-full transition
          hover:bg-surface-2
          focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:outline-none
          disabled:cursor-not-allowed disabled:text-muted/50 disabled:hover:bg-transparent
          ${
            ativo
              ? tom === "perigo" || tom === "desligado"
                ? "bg-red-50 text-red-700 hover:bg-red-100"
                : "bg-foreground text-background hover:bg-foreground hover:opacity-90"
              : ""
          }
          ${tom === "perigo" && !ativo ? "text-red-600" : ""}`}
      >
        {children}
      </button>

      {/* A dica é a única coisa que nomeia estes ícones. Sem ela, "travar
          microfones" e "silenciar todos" são dois cadeados parecidos, e um
          deles é irreversível para quem está falando.

          Escondida no toque: sem mouse, a dica aparecia grudada no dedo depois
          de cada clique e cobria a barra. */}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-10 hidden -translate-x-1/2 rounded-xl bg-foreground px-3.5 py-2 text-sm whitespace-nowrap text-background opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100 sm:block"
      >
        {dica}
      </span>
    </span>
  );
}

function Seletor({ dica, aoClicar }: { dica: string; aoClicar: () => void }) {
  return (
    // Escondido no celular: a seta de 28px ao lado de cada botão é alvo
    // impossível no dedo, e as três listas moram no "⋯".
    //
    // O PAINEL não mora mais aqui dentro. Enquanto morava, abrir "Escolher
    // câmera" pelo "⋯" não fazia nada visível no telefone: o estado mudava, e
    // o painel era desenhado dentro deste `span`, que está `hidden`.
    <span className="group relative hidden sm:inline-block">
      <button
        type="button"
        onClick={aoClicar}
        aria-label={dica}
        className="grid size-7 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:outline-none"
      >
        <ChevronUp className="size-4" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-10 -translate-x-1/2 rounded-xl bg-foreground px-3.5 py-2 text-sm whitespace-nowrap text-background opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100"
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
