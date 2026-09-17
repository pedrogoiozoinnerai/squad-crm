/**
 * A lista de aparelhos que se mostra para escolher — não a que o navegador dá.
 *
 * Num celular, `enumerateDevices` devolve meia dúzia de câmeras: frontal,
 * traseira, grande-angular, teleobjetiva, "câmera dupla", "câmera tripla". Elas
 * existem no hardware e nenhuma delas é uma escolha que alguém queira fazer no
 * meio de uma apresentação — a pergunta real é "frontal ou traseira?".
 *
 * A lista crua também repete: o mesmo microfone aparece como `default`,
 * `communications` e pelo id próprio, e o painel mostrava o mesmo aparelho três
 * vezes com o mesmo nome.
 *
 * Puro: recebe o que o navegador deu e devolve o que a tela mostra. Dá para
 * conferir o iPhone sem ter um iPhone.
 */

export type Aparelho = {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind | string;
};

export type AparelhoNaTela = Aparelho & {
  /// O nome curto que a pessoa lê. "Frontal" em vez de "Câmera frontal
  /// (05ac:8514)".
  nome: string;
};

/// Ids que o navegador usa para dizer "o padrão do sistema". Não são aparelhos:
/// são apelidos para um dos que já estão na lista.
const APELIDOS = new Set(["default", "communications"]);

/**
 * Reconhece frontal e traseira pelo rótulo.
 *
 * Por rótulo e não por `facingMode` porque `enumerateDevices` não devolve
 * `facingMode` — ele só existe nas constraints de quem já capturou. O rótulo é
 * o que há, e vem em português ou inglês conforme o aparelho.
 */
const FRENTE = /front|frontal|user|selfie|facetime/i;
const TRAS = /back|rear|traseir|environment|world/i;

/// Lentes extras que os celulares expõem e que ninguém escolhe de propósito.
const LENTE_EXTRA = /ultra|wide|tele|zoom|dupla|tripla|dual|triple|desk ?view/i;

function limpo(label: string): string {
  // Tira o "(05ac:8514)" que o Chrome pendura no fim.
  return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, "").trim();
}

/**
 * A lista para a tela.
 *
 * `paraCelular` colapsa as câmeras a frontal e traseira. Fora do celular a
 * lista fica inteira: num computador, cada webcam é uma escolha de verdade —
 * a embutida, a externa, a de captura.
 */
export function aparelhosNaTela(
  brutos: readonly Aparelho[],
  tipo: MediaDeviceKind,
  paraCelular = false,
): AparelhoNaTela[] {
  const doTipo = brutos.filter((d) => d.kind === tipo && d.deviceId);

  // Sem rótulo, sem permissão concedida: o navegador esconde os nomes até
  // alguém liberar câmera ou microfone uma vez. Mostrar "Aparelho 1, 2, 3"
  // seria pior que mostrar a lista crua.
  const comNome = doTipo.map((d) => ({ ...d, nome: limpo(d.label) || "Aparelho sem nome" }));

  // Tira os apelidos do sistema quando o aparelho real já está na lista.
  const semApelidos = comNome.filter(
    (d) => !APELIDOS.has(d.deviceId) || comNome.length === 1,
  );

  // E tira o repetido por NOME: `default` e o id próprio do mesmo microfone
  // vinham como duas linhas idênticas.
  const vistos = new Set<string>();
  const unicos = semApelidos.filter((d) => {
    const chave = d.nome.toLowerCase();
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

  if (!paraCelular || tipo !== "videoinput") return unicos;

  // ── No celular, a pergunta é uma só ──────────────────────────────────────
  const frontal = unicos.find((d) => FRENTE.test(d.nome) && !LENTE_EXTRA.test(d.nome));
  const traseira = unicos.find((d) => TRAS.test(d.nome) && !LENTE_EXTRA.test(d.nome));

  const escolhidas = [
    frontal && { ...frontal, nome: "Câmera frontal" },
    traseira && { ...traseira, nome: "Câmera traseira" },
  ].filter((d): d is AparelhoNaTela => Boolean(d));

  // Se o rótulo não deixou reconhecer nenhuma das duas, é melhor a lista crua
  // que uma lista vazia: aparelho com nome esquisito existe.
  return escolhidas.length ? escolhidas : unicos;
}
