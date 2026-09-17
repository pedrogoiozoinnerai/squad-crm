import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FOCO_VAZIO,
  SUSTENTACAO_MS,
  fitaDeQuadros,
  proximoFoco,
  quandoReavaliar,
} from "../src/lib/foco";

/**
 * O quadro principal trocava de rosto a cada respiração.
 *
 * `activeSpeakers` do LiveKit muda muito mais rápido do que um olho acompanha:
 * um "uhum" de meio segundo roubava a tela de quem estava explicando. Estes
 * casos são a conversa cruzada real, medida em milissegundos.
 */

const TODOS = ["u_ana", "l_bruno", "c_carla"];

/** Roda uma conversa: cada passo é [instante, quem está falando]. */
function conversar(
  passos: [number, string | null][],
  presentes: readonly string[] = TODOS,
  inicial = FOCO_VAZIO,
) {
  let estado = inicial;
  const trocas: string[] = [];
  for (const [t, candidato] of passos) {
    const antes = estado.identidade;
    estado = proximoFoco(estado, { candidato, presentes }, t);
    if (estado.identidade !== antes && estado.identidade) trocas.push(estado.identidade);
  }
  return { estado, trocas };
}

describe("foco na sala", () => {
  it("o primeiro rosto entra na hora, sem esperar sustentação", () => {
    // Esperar aqui deixaria a sala começar com o quadro vazio.
    const f = proximoFoco(FOCO_VAZIO, { candidato: "u_ana", presentes: TODOS }, 1000);
    assert.equal(f.identidade, "u_ana");
  });

  it("uma interjeição curta NÃO rouba a tela", () => {
    const { estado } = conversar([
      [0, "u_ana"],
      // Bruno solta um "uhum" de 400ms — é o caso que quebrava a tela.
      [1000, "l_bruno"],
      [1400, null],
      [2000, null],
    ]);
    assert.equal(estado.identidade, "u_ana");
  });

  it("uma interjeição depois de silêncio também não rouba", () => {
    // Este é o caso que a regra de permanência pós-troca deixava passar: com o
    // foco parado há muito tempo, qualquer ruído qualificaria na hora.
    const { estado } = conversar([
      [0, "u_ana"],
      [60_000, "l_bruno"],
      [60_300, null],
    ]);
    assert.equal(estado.identidade, "u_ana");
  });

  it("quem assume a palavra aparece", () => {
    const { estado } = conversar([
      [0, "u_ana"],
      [1000, "l_bruno"],
      [1000 + SUSTENTACAO_MS, "l_bruno"],
    ]);
    assert.equal(estado.identidade, "l_bruno");
  });

  it("conversa cruzada de dois segundos não troca nada", () => {
    // Ana e Bruno se atropelando a cada 200ms: nenhum dos dois sustenta.
    const passos: [number, string | null][] = [[0, "u_ana"]];
    for (let t = 200; t <= 2000; t += 200) {
      passos.push([t, t % 400 === 0 ? "l_bruno" : "c_carla"]);
    }
    const { trocas } = conversar(passos);
    assert.deepEqual(trocas, ["u_ana"], `trocou para ${trocas.slice(1).join(", ")}`);
  });

  it("sustentação interrompida volta à estaca zero", () => {
    // Sem zerar, duas interjeições separadas por um minuto somariam como se
    // fossem fala contínua.
    const { estado } = conversar([
      [0, "u_ana"],
      [1000, "l_bruno"],
      [1500, null],
      [2000, "l_bruno"],
      [2400, null],
    ]);
    assert.equal(estado.identidade, "u_ana");
  });

  it("silêncio não apaga o quadro", () => {
    const { estado } = conversar([
      [0, "u_ana"],
      [5000, null],
    ]);
    assert.equal(estado.identidade, "u_ana");
  });

  it("quem some da sala sai do foco na hora, sem esperar", () => {
    let f = proximoFoco(FOCO_VAZIO, { candidato: "u_ana", presentes: TODOS }, 0);
    f = proximoFoco(f, { candidato: null, presentes: ["l_bruno", "c_carla"] }, 100);
    assert.equal(f.identidade, "l_bruno");
  });

  it("candidato que não está mais na sala é ignorado", () => {
    // Acontece: o evento de quem fala e o de quem saiu correm juntos.
    let f = proximoFoco(FOCO_VAZIO, { candidato: "u_ana", presentes: TODOS }, 0);
    f = proximoFoco(f, { candidato: "l_bruno", presentes: ["u_ana"] }, 9999);
    assert.equal(f.identidade, "u_ana");
  });

  it("sala vazia não quebra", () => {
    assert.equal(proximoFoco(FOCO_VAZIO, { candidato: null, presentes: [] }, 0).identidade, null);
  });

  it("sozinho na sala, sou eu no quadro", () => {
    const f = proximoFoco(FOCO_VAZIO, { candidato: null, presentes: ["u_ana"] }, 0);
    assert.equal(f.identidade, "u_ana");
  });

  it("o mesmo estado volta idêntico quando nada muda — não redesenha à toa", () => {
    const f = proximoFoco(FOCO_VAZIO, { candidato: "u_ana", presentes: TODOS }, 0);
    assert.equal(proximoFoco(f, { candidato: "u_ana", presentes: TODOS }, 10), f);
    assert.equal(proximoFoco(f, { candidato: null, presentes: TODOS }, 20), f);
  });
});

describe("tela compartilhada", () => {
  it("ganha do falante — era o bug de 'compartilhei e ninguém viu'", () => {
    // Sem esta regra o quadro grande seguia a fala, e quem compartilhava não
    // estava necessariamente falando: a tela ia para a fita lateral do tamanho
    // de um selo, com o slide ilegível.
    let f = proximoFoco(FOCO_VAZIO, { candidato: "u_ana", presentes: TODOS }, 0);
    f = proximoFoco(f, { candidato: "u_ana", presentes: TODOS, compartilhando: "l_bruno" }, 100);
    assert.equal(f.identidade, "l_bruno");
  });

  it("não espera sustentação — ninguém compartilha por engano", () => {
    const f = proximoFoco(
      FOCO_VAZIO,
      { candidato: null, presentes: TODOS, compartilhando: "c_carla" },
      0,
    );
    assert.equal(f.identidade, "c_carla");
  });

  it("segura o foco enquanto a tela estiver no ar, mesmo com outro falando", () => {
    let f = proximoFoco(
      FOCO_VAZIO,
      { candidato: null, presentes: TODOS, compartilhando: "l_bruno" },
      0,
    );
    for (let t = 1000; t <= 20000; t += 1000) {
      f = proximoFoco(f, { candidato: "u_ana", presentes: TODOS, compartilhando: "l_bruno" }, t);
    }
    assert.equal(f.identidade, "l_bruno", "a fala de Ana não roubou a tela");
  });

  it("parar de compartilhar devolve o foco à conversa", () => {
    let f = proximoFoco(
      FOCO_VAZIO,
      { candidato: null, presentes: TODOS, compartilhando: "l_bruno" },
      0,
    );
    f = proximoFoco(f, { candidato: "u_ana", presentes: TODOS }, 1000);
    f = proximoFoco(f, { candidato: "u_ana", presentes: TODOS }, 1000 + SUSTENTACAO_MS);
    assert.equal(f.identidade, "u_ana");
  });

  it("quem compartilha e sai da sala não trava o quadro", () => {
    let f = proximoFoco(
      FOCO_VAZIO,
      { candidato: null, presentes: TODOS, compartilhando: "l_bruno" },
      0,
    );
    f = proximoFoco(f, { candidato: null, presentes: ["u_ana"], compartilhando: "l_bruno" }, 100);
    assert.equal(f.identidade, "u_ana");
  });

  it("o mesmo estado volta idêntico quando a tela continua no ar", () => {
    const f = proximoFoco(
      FOCO_VAZIO,
      { candidato: null, presentes: TODOS, compartilhando: "l_bruno" },
      0,
    );
    assert.equal(proximoFoco(f, { candidato: null, presentes: TODOS, compartilhando: "l_bruno" }, 50), f);
  });
});

describe("quando reavaliar", () => {
  it("sem candidato, não há o que esperar", () => {
    assert.equal(quandoReavaliar(FOCO_VAZIO, 0), null);
  });

  it("com candidato, aponta o fim da sustentação", () => {
    // Sem este despertador, quem assume a palavra e fala sem parar nunca
    // apareceria: não haveria um segundo evento para disparar a conta.
    let f = proximoFoco(FOCO_VAZIO, { candidato: "u_ana", presentes: TODOS }, 0);
    f = proximoFoco(f, { candidato: "l_bruno", presentes: TODOS }, 1000);
    assert.equal(quandoReavaliar(f, 1000), SUSTENTACAO_MS);
    assert.equal(quandoReavaliar(f, 1000 + SUSTENTACAO_MS - 100), 100);
    assert.equal(quandoReavaliar(f, 99_999), 0, "nunca negativo");
  });
});

describe("quem compartilha não pode sumir da sala", () => {
  const eu = { identity: "u_eu" };
  const ana = { identity: "l_ana" };
  const bruno = { identity: "l_bruno" };
  const todos = [eu, ana, bruno];

  it("sem tela, o destaque sai da fita — ele já está grande", () => {
    assert.deepEqual(fitaDeQuadros(todos, ana, false), [eu, bruno]);
  });

  it("COM tela, quem compartilha CONTINUA na fita", () => {
    // O defeito relatado: eu compartilho, viro o quadro grande mostrando a
    // tela, saio da fita — e a minha câmera não tem onde aparecer.
    assert.deepEqual(fitaDeQuadros(todos, eu, true), todos);
  });

  it("e a sala não perde o rosto de quem apresenta", () => {
    // O mesmo defeito visto de fora, que é pior: todo mundo vê os slides e
    // ninguém vê quem está falando.
    const fita = fitaDeQuadros(todos, ana, true);
    assert.ok(fita.some((p) => p.identity === ana.identity));
  });

  it("sem destaque nenhum, a fita é todo mundo", () => {
    assert.deepEqual(fitaDeQuadros(todos, null, false), todos);
  });

  it("não devolve a mesma lista que recebeu", () => {
    // Quem chama renderiza direto; devolver a referência convidaria a mutação.
    assert.notEqual(fitaDeQuadros(todos, null, false), todos);
  });

  it("sala de uma pessoa só, compartilhando: ela aparece", () => {
    assert.deepEqual(fitaDeQuadros([eu], eu, true), [eu]);
  });
});
