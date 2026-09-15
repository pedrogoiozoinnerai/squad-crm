import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { destinoSeguro, ownerScope, type Ator } from "../src/lib/escopo";
import { diagnosticarUrlPostgres, identificador, urlDeConexao } from "../src/lib/env";

/**
 * O que não pode quebrar em silêncio.
 *
 * Cada caso aqui corresponde a um defeito que existiu de verdade neste projeto
 * ou a uma regra cuja falha ninguém veria numa revisão: escopo que vaza
 * carteira de vendedor, redirecionamento aberto pendurado no login, nome de
 * schema vindo do ambiente direto para dentro do SQL.
 */
const vendedor: Ator = { id: "u-vendedor", role: "USER" };
const admin: Ator = { id: "u-admin", role: "ADMIN" };

describe("escopo por dono", () => {
  it("prende o vendedor aos próprios registros", () => {
    assert.deepEqual(ownerScope(vendedor), { ownerId: "u-vendedor" });
  });

  it("não filtra para o admin", () => {
    assert.deepEqual(ownerScope(admin), {});
  });

  it("nunca devolve filtro vazio para quem não é admin", () => {
    // Esta é a regressão que importa: se `ownerScope` passar a devolver `{}`
    // para USER, toda consulta do CRM abre a carteira inteira do time sem que
    // nenhuma tela mude de aparência.
    for (const papel of ["USER"] as const) {
      const escopo = ownerScope({ ...vendedor, role: papel });
      assert.notDeepEqual(escopo, {}, `papel ${papel} não pode ver tudo`);
    }
  });
});

describe("destino de redirecionamento", () => {
  it("aceita caminho interno", () => {
    assert.equal(destinoSeguro("/admin/inicio", "/casa"), "/admin/inicio");
    assert.equal(destinoSeguro("/user/leads?q=1", "/casa"), "/user/leads?q=1");
  });

  it("recusa URL protocolo-relativa", () => {
    // `//evil.com` começa com "/" e o navegador o trata como site externo.
    assert.equal(destinoSeguro("//evil.com", "/casa"), "/casa");
  });

  it("recusa contrabarra, que vários navegadores normalizam para //", () => {
    assert.equal(destinoSeguro("/\\evil.com", "/casa"), "/casa");
  });

  it("recusa URL absoluta e valor ausente", () => {
    assert.equal(destinoSeguro("https://evil.com", "/casa"), "/casa");
    assert.equal(destinoSeguro("", "/casa"), "/casa");
    assert.equal(destinoSeguro(null, "/casa"), "/casa");
  });
});

describe("identificador de schema", () => {
  it("aceita nome simples", () => {
    assert.equal(identificador("DB_SCHEMA", "crm_dev"), "crm_dev");
  });

  it("recusa qualquer coisa que não seja identificador", () => {
    // O schema entra no SQL por interpolação — bind param não vale para
    // identificador. Esta é a única barreira entre o ambiente e o banco.
    for (const veneno of ['crm"; DROP TABLE "User', "crm; drop table users", "crm-dev", '"crm"', "crm dev", ""]) {
      assert.throws(() => identificador("DB_SCHEMA", veneno), /inválido/, `deveria recusar: ${veneno}`);
    }
  });
});

describe("diagnóstico da URL de conexão", () => {
  it("aprova a URL correta", () => {
    assert.equal(diagnosticarUrlPostgres("postgresql://u:s@h:6543/postgres?pgbouncer=true"), null);
  });

  it("reconhece o comando psql inteiro colado", () => {
    assert.match(diagnosticarUrlPostgres(`psql "postgresql://u:s@h/postgres"`)!, /comando psql/);
  });

  it("reconhece o nome da variável colado junto", () => {
    assert.match(diagnosticarUrlPostgres("DATABASE_URL=postgresql://u:s@h/d")!, /nome da vari[áa]vel/);
  });

  it("reconhece a senha de exemplo", () => {
    assert.match(diagnosticarUrlPostgres("postgresql://u:[YOUR-PASSWORD]@h/d")!, /texto de exemplo/);
  });

  it("classifica pelo conteúdo, não pelo espaço", () => {
    // Quase todo engano de paste traz espaço junto. Relatá-lo primeiro apontava
    // para o sintoma e escondia a causa.
    assert.match(diagnosticarUrlPostgres(`psql  "postgresql://u:s@h/d"`)!, /comando psql/);
  });
});

describe("leitura do ambiente", () => {
  it("emenda quebra de linha no meio da string de conexão", () => {
    const antes = process.env.TESTE_URL;
    process.env.TESTE_URL = "postgresql://u:s@host:5432/\ndb";
    const { url, reparado } = urlDeConexao("TESTE_URL");
    assert.equal(url, "postgresql://u:s@host:5432/db");
    assert.equal(reparado, true, "precisa avisar que consertou");
    if (antes === undefined) delete process.env.TESTE_URL;
    else process.env.TESTE_URL = antes;
  });
});
