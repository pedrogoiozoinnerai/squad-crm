-- O chat da sala ganha memória.
--
-- Até aqui a conversa vivia só no canal de dados do LiveKit, que não guarda
-- nada: fechar o painel desmontava a lista, recarregar zerava tudo, e quem
-- entrava no meio da sessão via um chat vazio. O canal continua sendo por onde
-- a mensagem CHEGA; esta tabela é a memória ao lado.
--
-- Escrita à mão, e não copiada do `migrate diff`: o diff propõe derrubar
-- `Lead_company_trgm`, `Lead_email_trgm` e `Lead_name_trgm` toda vez, porque os
-- índices GIN de pg_trgm vivem no schema `extensions` e o Prisma não os
-- enxerga. Aplicar o diff cru tiraria a busca por nome, e-mail e empresa do
-- CRM inteiro. É a décima vez que isso aparece.

-- CreateTable
CREATE TABLE "RoomMessage" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meetingId" TEXT NOT NULL,
    "identity" TEXT NOT NULL,
    "autor" TEXT NOT NULL,
    "texto" TEXT NOT NULL,

    CONSTRAINT "RoomMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- A leitura é sempre "as mensagens desta reunião, em ordem": o índice é o par,
-- não duas colunas soltas.
CREATE INDEX "RoomMessage_meetingId_createdAt_idx" ON "RoomMessage"("meetingId", "createdAt");

-- AddForeignKey
-- `CASCADE`: apagar a reunião apaga a conversa junto. Chat órfão não tem a quem
-- pertencer, e a reunião é o único dono possível.
ALTER TABLE "RoomMessage" ADD CONSTRAINT "RoomMessage_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
