-- Tabelas para autenticação do WhatsApp (Baileys)

-- Tabela de credenciais do WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    creds JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_auth_session_id ON whatsapp_auth(session_id);

-- Tabela de chaves de criptografia do WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    id VARCHAR(255) NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, type, id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_whatsapp_keys_session_id ON whatsapp_keys(session_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_keys_type ON whatsapp_keys(type);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_whatsapp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_whatsapp_auth_updated_at_trigger ON whatsapp_auth;
CREATE TRIGGER update_whatsapp_auth_updated_at_trigger
    BEFORE UPDATE ON whatsapp_auth
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_updated_at();

DROP TRIGGER IF EXISTS update_whatsapp_keys_updated_at_trigger ON whatsapp_keys;
CREATE TRIGGER update_whatsapp_keys_updated_at_trigger
    BEFORE UPDATE ON whatsapp_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_whatsapp_updated_at();
