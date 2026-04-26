-- Tabela para armazenar status de presença dos contatos

CREATE TABLE IF NOT EXISTS contact_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone VARCHAR(50) UNIQUE NOT NULL,
  presence VARCHAR(20) DEFAULT 'unavailable', -- 'available', 'unavailable', 'composing', 'recording', 'paused'
  last_seen_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_contact_presence_phone ON contact_presence(phone);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_contact_presence_updated_at_trigger ON contact_presence;
CREATE TRIGGER update_contact_presence_updated_at_trigger
  BEFORE UPDATE ON contact_presence
  FOR EACH ROW
  EXECUTE FUNCTION update_whatsapp_updated_at();
