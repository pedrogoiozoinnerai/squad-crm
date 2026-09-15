-- Correção da migração anterior.
--
-- `CREATE EXTENSION` sem schema cria a extensão onde o `search_path` aponta, e
-- o Prisma aponta para o schema do app. A extensão nasceu dentro de `crm_dev`,
-- e o schema `crm` não enxergava o operador — a mesma migração passava em
-- desenvolvimento e falhava em produção, por causa da ordem em que rodou.
--
-- Extensão é do banco, não do app: vai para `extensions`, que os três schemas
-- compartilham, e o operador é referenciado com o nome qualificado.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DO $$
BEGIN
  -- Se a tentativa anterior a deixou no schema errado, move.
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_trgm' AND n.nspname <> 'extensions'
  ) THEN
    EXECUTE 'ALTER EXTENSION pg_trgm SET SCHEMA extensions';
  END IF;
END $$;

DROP INDEX IF EXISTS "Lead_name_trgm";
DROP INDEX IF EXISTS "Lead_email_trgm";
DROP INDEX IF EXISTS "Lead_company_trgm";

CREATE INDEX "Lead_name_trgm"    ON "Lead" USING gin (name    extensions.gin_trgm_ops);
CREATE INDEX "Lead_email_trgm"   ON "Lead" USING gin (email   extensions.gin_trgm_ops);
CREATE INDEX "Lead_company_trgm" ON "Lead" USING gin (company extensions.gin_trgm_ops);
