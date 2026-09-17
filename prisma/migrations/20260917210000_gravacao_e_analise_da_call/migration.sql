-- A call passa a deixar rastro.
--
-- Até aqui "Sessões" respondia QUANTOS vieram. Não respondia nada sobre o que
-- aconteceu na conversa — e é isso que decide se o closer liga para alguém
-- hoje à tarde. O webhook do LiveKit já RECEBIA o evento de gravação, com
-- arquivo, tamanho e duração, e jogava tudo fora: achatava num `RoomEvent` com
-- o `egressId` no campo `name`. Faltava onde guardar.
--
-- Tudo de uma migração só, e todas as colunas novas nulas ou com padrão:
-- coluna aditiva é barata agora e cara depois, quando a tabela tiver milhões
-- de linhas e o `ALTER` pedir bloqueio.
--
-- Escrita à mão, e não copiada do `migrate diff`: o diff propõe derrubar
-- `Lead_company_trgm`, `Lead_email_trgm` e `Lead_name_trgm` toda vez, porque os
-- índices GIN de pg_trgm vivem no schema `extensions` e o Prisma não os
-- enxerga. Aplicar o diff cru tiraria a busca por nome, e-mail e empresa do
-- CRM inteiro. Décima quarta vez.

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('PENDENTE', 'GRAVANDO', 'PROCESSANDO', 'COMPLETA', 'FALHOU', 'ABORTADA', 'APAGADA');

-- CreateTable
-- `bytes` é BIGINT porque int4 estoura em 2,1 GB e uma mentoria de duas horas
-- passa disso. `bruto` guarda o `egressInfo` inteiro: sem ele, "falhou" é beco
-- sem saída, e a forma desse JSON muda do lado do LiveKit sem avisar.
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "meetingId" TEXT NOT NULL,
    "egressId" TEXT NOT NULL,
    "status" "RecordingStatus" NOT NULL DEFAULT 'PENDENTE',
    "caminho" TEXT,
    "bytes" BIGINT,
    "duracaoSegundos" INTEGER,
    "iniciadaEm" TIMESTAMP(3),
    "terminadaEm" TIMESTAMP(3),
    "erro" TEXT,
    "bruto" JSONB,
    "apagadaEm" TIMESTAMP(3),

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Quem pediu para assistir. A gravação é do TIME, e é exatamente por isso que
-- este registro existe: é a primeira coisa que se pergunta quando alguém quer
-- saber quem ouviu a conversa de um cliente.
CREATE TABLE "RecordingAccess" (
    "id" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ip" TEXT,

    CONSTRAINT "RecordingAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- `texto` é COLUNA, não jsonb: é ele que entra no prompt, e um `->>` numa call
-- de 60 mil caracteres é caro à toa.
CREATE TABLE "Transcript" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordingId" TEXT NOT NULL,
    "externoId" TEXT,
    "texto" TEXT NOT NULL,
    "segmentos" JSONB,
    "falantes" JSONB,
    "idioma" TEXT,
    "modelo" TEXT,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Versionado, nunca atualizado por cima: editar a régua apagaria aquela pela
-- qual as calls antigas foram julgadas.
CREATE TABLE "AiPrompt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT false,
    "corpo" TEXT NOT NULL,
    "autorId" TEXT,

    CONSTRAINT "AiPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- Coluna quando o valor é filtrado, ordenado ou somado; jsonb quando só é
-- desenhado no detalhe de uma call. `veredicto` em jsonb transformaria "quem
-- está de freestyle esta semana?" numa varredura de tabela.
CREATE TABLE "CallAnalysis" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcriptId" TEXT NOT NULL,
    "promptId" TEXT,
    "modelo" TEXT,
    "resumo" TEXT NOT NULL,
    "veredicto" TEXT,
    "aderenciaPct" INTEGER,
    "notaGeral" INTEGER,
    "engajamento" INTEGER,
    "blocosOk" INTEGER,
    "blocosTotal" INTEGER,
    "errosCriticos" INTEGER NOT NULL DEFAULT 0,
    "proibidasCount" INTEGER NOT NULL DEFAULT 0,
    "roleplayFoco" TEXT[],
    "blocos" JSONB,
    "erros" JSONB,
    "vocabulario" JSONB,
    "objecoes" JSONB,
    "scorecard" JSONB,
    "insights" JSONB,
    "proximosPassos" JSONB,
    "bruto" JSONB,
    "redigidaEm" TIMESTAMP(3),

    CONSTRAINT "CallAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- `chave` é de NEGÓCIO ("TRANSCREVER:<recordingId>"), não um id aleatório: é o
-- que faz dois crons sobrepostos criarem um trabalho, e não dois.
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chave" TEXT NOT NULL,
    "etapa" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDENTE',
    "externoId" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "arrendadoAte" TIMESTAMP(3),
    "proximaTentativaEm" TIMESTAMP(3),
    "erro" TEXT,

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- AlterTable
-- Uma anotação sobre a SESSÃO não tinha onde cair: a sessão coletiva tem vinte
-- leads, e "a objeção de preço apareceu três vezes hoje" não é de nenhum deles.
ALTER TABLE "Note" ADD COLUMN "meetingId" TEXT;

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "meetingId" TEXT;

-- AlterTable
-- Padrão 0 = sem retenção, guarda para sempre. É o único padrão honesto
-- enquanto o prazo não for decidido por quem responde por privacidade: apagar
-- por omissão destruiria material de vendas, e escolher 90 dias no lugar de
-- alguém seria decidir isso na surdina.
ALTER TABLE "Config" ADD COLUMN "retencaoVideoDias" INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN "retencaoTranscricaoDias" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "Recording_egressId_key" ON "Recording"("egressId");
CREATE INDEX "Recording_meetingId_idx" ON "Recording"("meetingId");
CREATE INDEX "Recording_status_createdAt_idx" ON "Recording"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RecordingAccess_recordingId_em_idx" ON "RecordingAccess"("recordingId", "em");
CREATE INDEX "RecordingAccess_userId_em_idx" ON "RecordingAccess"("userId", "em");

-- CreateIndex
CREATE UNIQUE INDEX "Transcript_recordingId_key" ON "Transcript"("recordingId");
CREATE UNIQUE INDEX "Transcript_externoId_key" ON "Transcript"("externoId");

-- CreateIndex
CREATE INDEX "AiPrompt_tipo_ativo_idx" ON "AiPrompt"("tipo", "ativo");
CREATE UNIQUE INDEX "AiPrompt_tipo_versao_key" ON "AiPrompt"("tipo", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "CallAnalysis_transcriptId_key" ON "CallAnalysis"("transcriptId");
CREATE INDEX "CallAnalysis_createdAt_idx" ON "CallAnalysis"("createdAt");
CREATE INDEX "CallAnalysis_veredicto_idx" ON "CallAnalysis"("veredicto");

-- CreateIndex
CREATE UNIQUE INDEX "AiJob_chave_key" ON "AiJob"("chave");
CREATE INDEX "AiJob_estado_proximaTentativaEm_idx" ON "AiJob"("estado", "proximaTentativaEm");
CREATE INDEX "AiJob_etapa_estado_idx" ON "AiJob"("etapa", "estado");

-- CreateIndex
CREATE INDEX "Activity_meetingId_createdAt_idx" ON "Activity"("meetingId", "createdAt");
CREATE INDEX "Note_meetingId_createdAt_idx" ON "Note"("meetingId", "createdAt");

-- AddForeignKey
-- `CASCADE` em tudo que pende da reunião: apagar a reunião apaga a gravação, a
-- transcrição e a análise junto. Gravação órfã é arquivo de 550 MB sem dono.
ALTER TABLE "Note" ADD CONSTRAINT "Note_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordingAccess" ADD CONSTRAINT "RecordingAccess_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecordingAccess" ADD CONSTRAINT "RecordingAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Transcript" ADD CONSTRAINT "Transcript_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- `SET NULL` no prompt e no autor: a análise sobrevive à saída de quem
-- escreveu a rubrica. Perder a nota de uma call porque alguém saiu do time
-- seria apagar história por acidente administrativo.
ALTER TABLE "AiPrompt" ADD CONSTRAINT "AiPrompt_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallAnalysis" ADD CONSTRAINT "CallAnalysis_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "AiPrompt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
