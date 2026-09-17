import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  apenasOFaltanteDoContato,
  lerContato,
  PROPS_CONTATO_EXTRA,
} from "../src/lib/contato-hubspot";

/**
 * A importação pedia os campos no nome errado.
 *
 * Mesmo defeito da atribuição, noutra roupa: pedia `jobtitle`, `company` e
 * `phone` — os nativos —, e esta operação preenche `cargo`, `company_name` e os
 * campos de WhatsApp. Resultado medido: cargo em 3% no CRM contra 46% no
 * HubSpot; telefone em 75% contra 90–98%.
 */

describe("cargo", () => {
  it("o nativo vence quando existe", () => {
    assert.equal(lerContato({ jobtitle: "CEO", cargo: "Sócio ou Fundador" }).jobTitle, "CEO");
  });

  it("o customizado entra quando o nativo falta — é o caso de 43% da base", () => {
    assert.equal(lerContato({ cargo: "Sócio ou Fundador" }).jobTitle, "Sócio ou Fundador");
  });

  it("nenhum dos dois, nulo", () => {
    assert.equal(lerContato({}).jobTitle, null);
  });
});

describe("empresa", () => {
  it("o nativo vence", () => {
    assert.equal(lerContato({ company: "Acme", company_name: "Turstar" }).company, "Acme");
  });

  it("o customizado cobre o resto", () => {
    assert.equal(lerContato({ company_name: "Turstar" }).company, "Turstar");
  });
});

describe("telefone, na ordem em que se confia nele", () => {
  it("o que o vendedor digitou vem primeiro", () => {
    const c = lerContato({
      phone: "+5511999990000",
      mobilephone: "+5511888880000",
      hs_whatsapp_phone_number: "+5511777770000",
    });
    assert.equal(c.phone, "+5511999990000");
  });

  it("celular depois do fixo", () => {
    const c = lerContato({ mobilephone: "+5511888880000", whatsapp_phone__original: "+5511777770000" });
    assert.equal(c.phone, "+5511888880000");
  });

  it("os de WhatsApp entram por último, e são os que mais preenchem", () => {
    // Vêm de integração: é o número que a automação capturou, não
    // necessariamente o que o time usa. Daí ficarem no fim da fila — mas
    // ficarem, porque 98% é muita gente a mais para deixar sem telefone.
    assert.equal(lerContato({ hs_whatsapp_phone_number: "+556984026167" }).phone, "+556984026167");
    assert.equal(lerContato({ whatsapp_phone__original: "+5551995427811" }).phone, "+5551995427811");
  });

  it("entre os dois de WhatsApp, o do HubSpot vem antes", () => {
    const c = lerContato({
      hs_whatsapp_phone_number: "+5511111111111",
      whatsapp_phone__original: "+5522222222222",
    });
    assert.equal(c.phone, "+5511111111111");
  });
});

describe("valores sujos", () => {
  it('"null" como texto não é um cargo', () => {
    assert.equal(lerContato({ jobtitle: "null", cargo: "Diretor" }).jobTitle, "Diretor");
  });

  it("espaço em branco deixa o próximo assumir", () => {
    assert.equal(lerContato({ phone: "  ", mobilephone: "+5511999990000" }).phone, "+5511999990000");
  });

  it("contato inexistente não quebra", () => {
    assert.deepEqual(lerContato(null), { phone: null, jobTitle: null, company: null });
    assert.deepEqual(lerContato(undefined), { phone: null, jobTitle: null, company: null });
  });
});

describe("reimportar não pode destruir", () => {
  it("não sobrescreve o que alguém corrigiu à mão no CRM", () => {
    const escrever = apenasOFaltanteDoContato(
      { phone: "+5511999990000", jobTitle: null, company: null },
      { phone: "+5500000000000", jobTitle: "Diretor", company: "Turstar" },
    );
    assert.equal(escrever.phone, undefined);
    assert.equal(escrever.jobTitle, "Diretor");
    assert.equal(escrever.company, "Turstar");
  });

  it("nada a escrever devolve objeto vazio", () => {
    const escrever = apenasOFaltanteDoContato(
      { phone: "+55", jobTitle: "CEO", company: "Acme" },
      { phone: "+66", jobTitle: "Diretor", company: "Turstar" },
    );
    assert.deepEqual(escrever, {});
  });
});

describe("o que a importação pede a mais", () => {
  it("pede os campos que esta operação realmente preenche", () => {
    for (const p of ["cargo", "company_name", "hs_whatsapp_phone_number", "whatsapp_phone__original"]) {
      assert.ok(PROPS_CONTATO_EXTRA.includes(p as never), `faltou pedir ${p}`);
    }
  });
});
