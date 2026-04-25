-- Tabela para configurações de sincronização do WhatsApp

CREATE TABLE IF NOT EXISTS whatsapp_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    sync_history BOOLEAN DEFAULT false,
    sync_period_days INTEGER DEFAULT 7,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_settings_session_id ON whatsapp_settings(session_id);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_whatsapp_settings_updated_at_trigger ON whatsapp_settings;
CREATE TRIGGER update_whatsapp_settings_updated_at_trigger
    BEFORE UPDATE ON whatsapp_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_updated_at();
