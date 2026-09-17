-- Remarcar a sessão sem perder o convite.
--
-- A página do convite já oferecia "Remarque aqui" e o link dava 404 — a página
-- nunca existiu. Quem não podia vir clicava, batia no erro e simplesmente não
-- aparecia, com a vaga presa até a hora da sessão.
--
-- `versao` vira o `SEQUENCE` do convite de calendário. O calendário só aceita
-- uma atualização se o número for MAIOR que o que ele já tem; sem isso,
-- remarcar deixaria o horário velho no celular da pessoa e ela apareceria na
-- hora errada — que é pior do que não remarcar.
--
-- Escrita à mão: o `migrate diff` propõe derrubar `Lead_company_trgm`,
-- `Lead_email_trgm` e `Lead_name_trgm` toda vez, porque os índices GIN de
-- pg_trgm vivem no schema `extensions` e o Prisma não os enxerga. Aplicar o
-- diff cru tiraria a busca por nome, e-mail e empresa do CRM inteiro.

-- AlterTable
ALTER TABLE "MeetingAttendee" ADD COLUMN "versao" INTEGER NOT NULL DEFAULT 0;
