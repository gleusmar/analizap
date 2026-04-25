-- Adicionar coluna real_message_id para evitar flicking de mensagens temporárias
-- O message_id inicial será um ID temporário, e o real_message_id será atualizado quando o Baileys retornar o ID real

-- Adicionar coluna real_message_id
ALTER TABLE messages ADD COLUMN IF NOT EXISTS real_message_id VARCHAR(255);

-- Criar índice para real_message_id
CREATE INDEX IF NOT EXISTS idx_messages_real_message_id ON messages(real_message_id);

-- Remover a constraint UNIQUE de message_id para permitir IDs temporários duplicados
-- (o real_message_id será UNIQUE)
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_id_key;

-- Adicionar constraint UNIQUE para real_message_id
ALTER TABLE messages ADD CONSTRAINT messages_real_message_id_key UNIQUE (real_message_id);
