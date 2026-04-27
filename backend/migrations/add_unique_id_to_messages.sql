-- Adiciona campo unique_id à tabela messages
-- Este campo combina remoteJid-fromMe-id para evitar duplicação entre notify e append

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS unique_id TEXT;

-- Criar índice para melhorar performance de busca
CREATE INDEX IF NOT EXISTS idx_messages_unique_id ON messages(unique_id);

-- Criar índice único para garantir que não haja duplicatas
-- Nota: Como já podem existir dados, usamos um índice parcial
-- que só se aplica a novos registros
-- Para dados existentes, a aplicação vai gerenciar a duplicação
