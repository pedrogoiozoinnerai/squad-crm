-- A busca do vendedor é `ILIKE '%termo%'`: nome, e-mail, telefone ou empresa,
-- com o termo no meio. Índice B-tree não serve para isso — ele ordena por
-- prefixo, e aqui não há prefixo. O resultado era varredura completa da tabela
-- de leads a cada tecla, e ela só cresce.
--
-- Trigrama resolve: o Postgres quebra o texto em sequências de três caracteres
-- e indexa essas sequências, então "joao" encontra "João Pedro" e "Sr. joao"
-- sem ler a tabela inteira.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "Lead_name_trgm"    ON "Lead" USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Lead_email_trgm"   ON "Lead" USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Lead_company_trgm" ON "Lead" USING gin (company gin_trgm_ops);
