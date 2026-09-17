"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, Camera, CameraOff, Mic, MicOff, Sparkles } from "lucide-react";

import { desligar, lerFalha, type FalhaDeMidia } from "@/components/sala/dispositivos";

export type Preferencias = { camera: boolean; microfone: boolean; nome?: string };

/**
 * "Preparar para entrar" — a antessala.
 *
 * Existe porque a primeira call é onde tudo dá errado: permissão negada, câmera
 * presa no Zoom que ficou aberto, microfone do fone que não conectou. Descobrir
 * isso DENTRO da reunião, com o lead do outro lado esperando, é o pior momento
 * possível.
 *
 * Nada aqui é obrigatório: dá para entrar sem câmera e sem microfone. A tela
 * informa, não bloqueia — bloquear só transformaria um problema de áudio num
 * lead perdido.
 */
export function Preparo({
  nome,
  aoEntrar,
  aoCancelar,
  pedirNome,
}: {
  nome: string;
  aoEntrar: (preferencias: Preferencias) => void;
  aoCancelar?: () => void;
  /// Quem chega pelo LINK da reunião não tem nome: o token é da sala, não da
  /// pessoa. Inventar "Convidado 1" jogaria fora a única informação que ela
  /// mesma daria — e quem está do outro lado precisa saber quem entrou.
  pedirNome?: boolean;
}) {
  const [nomeDigitado, setNomeDigitado] = useState("");
  const comoMeChamo = pedirNome ? nomeDigitado.trim() : nome;
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);

  const [camera, setCamera] = useState(true);
  const [microfone, setMicrofone] = useState(true);
  const [falha, setFalha] = useState<FalhaDeMidia | null>(null);
  const [temVideo, setTemVideo] = useState(false);
  // Em estado, e não lido de `stream.current` na renderização: uma ref não
  // redesenha nada quando muda, então o botão do microfone continuava
  // desabilitado depois de uma segunda tentativa bem-sucedida.
  const [temAudio, setTemAudio] = useState(false);
  const [pedindo, setPedindo] = useState(true);

  const pedirAcesso = useCallback(async () => {
    setPedindo(true);
    setFalha(null);
    desligar(stream.current);
    stream.current = null;
    setTemVideo(false);
    setTemAudio(false);

    try {
      const midia = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.current = midia;
      if (video.current) video.current.srcObject = midia;
      setTemVideo(true);
      setTemAudio(midia.getAudioTracks().length > 0);
    } catch (erro) {
      // Uma segunda tentativa só com áudio separa "negou tudo" de "não tem
      // câmera". Sem ela, quem não tem webcam ouviria que negou permissão.
      try {
        const soAudio = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.current = soAudio;
        setTemAudio(soAudio.getAudioTracks().length > 0);
        setCamera(false);
        setFalha(lerFalha(erro, "câmera"));
      } catch (erroAudio) {
        setCamera(false);
        setMicrofone(false);
        setFalha(lerFalha(erroAudio, "câmera e microfone"));
      }
    } finally {
      setPedindo(false);
    }
  }, []);

  useEffect(() => {
    // Os `setState` acontecem DEPOIS dos awaits, não no corpo do efeito — mas
    // a regra não enxerga através do `async`, e pedir câmera ao montar é
    // exatamente o que um efeito serve para fazer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void pedirAcesso();
    // Desliga ao sair: sem isto a luz da câmera fica acesa depois de entrar.
    return () => desligar(stream.current);
  }, [pedirAcesso]);

  // Ligar e desligar a trilha, em vez de pedir a mídia de novo: pedir de novo
  // faz o navegador piscar o indicador e, em alguns, perguntar outra vez.
  useEffect(() => {
    stream.current?.getVideoTracks().forEach((t) => (t.enabled = camera));
  }, [camera]);
  useEffect(() => {
    stream.current?.getAudioTracks().forEach((t) => (t.enabled = microfone));
  }, [microfone]);

  const mostrandoVideo = temVideo && camera;

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10">
      <div className="card p-6 sm:p-8">
        <h1 className="text-center text-[22px] font-semibold tracking-tight">Preparar para entrar</h1>
        <p className="mt-1 text-center text-sm text-muted">
          Confira sua câmera e seu microfone antes de entrar na sala.
        </p>

        {falha && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
            <p className="flex-1 text-sm text-red-800">{falha.mensagem}</p>
            {falha.podeTentarDeNovo && (
              <button
                type="button"
                onClick={() => void pedirAcesso()}
                disabled={pedindo}
                className="shrink-0 text-sm font-semibold text-red-800 underline-offset-4 hover:underline disabled:opacity-50"
              >
                Tentar de novo
              </button>
            )}
          </div>
        )}

        <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-2xl bg-surface-2">
          <video
            ref={video}
            autoPlay
            playsInline
            // Sem `muted` o preview devolve o próprio áudio pelo alto-falante e
            // vira microfonia na mesa do vendedor.
            muted
            className={`size-full object-cover ${mostrandoVideo ? "" : "invisible"}`}
          />

          {!mostrandoVideo && (
            <div className="absolute inset-0 grid place-items-center text-muted">
              <div className="text-center">
                <CameraOff className="mx-auto size-8" />
                <p className="mt-2 text-sm">
                  {pedindo ? "Procurando sua câmera…" : "Câmera desligada"}
                </p>
              </div>
            </div>
          )}

          <span className="absolute bottom-3 left-3 rounded-lg bg-surface/90 px-2.5 py-1 text-xs font-medium backdrop-blur">
            {comoMeChamo || "Você"}
          </span>
        </div>

        {pedirNome && (
          <label className="mt-4 flex flex-col gap-1.5 text-left">
            <span className="text-xs font-semibold text-muted">Como você quer aparecer</span>
            <input
              value={nomeDigitado}
              onChange={(e) => setNomeDigitado(e.target.value)}
              placeholder="Seu nome"
              maxLength={60}
              autoComplete="name"
              className="field"
            />
          </label>
        )}

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Alternar
            ligado={camera}
            desabilitado={!temVideo}
            aoClicar={() => setCamera((v) => !v)}
            ligadoIcone={<Camera className="size-4" />}
            desligadoIcone={<CameraOff className="size-4" />}
            rotulo={camera ? "Câmera ligada" : "Câmera desligada"}
          />
          <Alternar
            ligado={microfone}
            desabilitado={!temAudio}
            aoClicar={() => setMicrofone((v) => !v)}
            ligadoIcone={<Mic className="size-4" />}
            desligadoIcone={<MicOff className="size-4" />}
            rotulo={microfone ? "Microfone ligado" : "Microfone desligado"}
          />
          <button
            type="button"
            disabled
            title="Desfoque de fundo entra junto com a gravação"
            className="chip cursor-not-allowed border border-line bg-surface px-3 py-2 text-muted opacity-60"
          >
            <Sparkles className="size-4" />
            Desfoque · em breve
          </button>
        </div>

        <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row">
          {aoCancelar && (
            <button type="button" onClick={aoCancelar} className="btn-ghost flex-1">
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              // Entrega as trilhas para o LiveKit em vez de segurá-las: duas
              // capturas da mesma câmera dão NotReadableError no próprio app.
              desligar(stream.current);
              stream.current = null;
              aoEntrar({ camera: camera && temVideo, microfone, nome: comoMeChamo });
            }}
            disabled={pedirNome && comoMeChamo.length < 2}
            className="btn-primary flex-[2] py-3"
          >
            Entrar na sala
            <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Alternar({
  ligado,
  desabilitado,
  aoClicar,
  ligadoIcone,
  desligadoIcone,
  rotulo,
}: {
  ligado: boolean;
  desabilitado?: boolean;
  aoClicar: () => void;
  ligadoIcone: React.ReactNode;
  desligadoIcone: React.ReactNode;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      aria-pressed={ligado}
      className={`chip border px-3 py-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${
        ligado
          ? "border-line bg-surface text-foreground hover:bg-surface-2"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {ligado ? ligadoIcone : desligadoIcone}
      {rotulo}
    </button>
  );
}
