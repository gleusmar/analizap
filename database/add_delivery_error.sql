-- Adicionar campo delivery_error para sinalizar falhas na entrega
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_error TEXT;

-- Adicionar índice para delivery_error
CREATE INDEX IF NOT EXISTS idx_messages_delivery_error ON messages(delivery_error);
