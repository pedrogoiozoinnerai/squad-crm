-- Marca d'água da sincronização com o funil do Type.
--
-- A leitura era "as 500 mais recentes", relidas inteiras a cada dez minutos.
-- Dois defeitos: reprocessava ~72 mil linhas por dia para ~1.000 leads novos,
-- e — o grave — numa rajada de mais de 500 leads em dez minutos os excedentes
-- saíam da janela e NUNCA voltavam. Sem erro, sem log, sem fila: o lead
-- simplesmente não existia no CRM. A R$ 50 mil/dia de anúncio, é o lançamento
-- de campanha que dispara exatamente essa rajada.
--
-- Anulável porque a primeira execução não tem marca: ela começa sete dias
-- atrás e avança sozinha dali.
--
-- NOTA: NONA vez que o `migrate diff` propõe derrubar os índices de trigrama
-- (`Lead_name_trgm`, `Lead_email_trgm`, `Lead_company_trgm`). Criados em SQL
-- cru com `extensions.gin_trgm_ops`, que o schema.prisma não declara — o diff
-- não os enxerga e propõe o DROP toda vez. Removidos à mão de novo.

-- AlterTable
ALTER TABLE "Config" ADD COLUMN "funilSincronizadoAte" TIMESTAMP(3);
