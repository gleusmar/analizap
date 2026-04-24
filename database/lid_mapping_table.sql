-- Tabela para mapear LID (@lid) para JID (@s.whatsapp.net)
-- Isso é necessário porque o WhatsApp agora usa LIDs para privacidade

CREATE TABLE IF NOT EXISTS lid_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lid VARCHAR(255) UNIQUE NOT NULL, -- LID do WhatsApp (ex: user@lid)
    jid VARCHAR(255) UNIQUE NOT NULL, -- JID do WhatsApp (ex: 5511999999999@s.whatsapp.net)
    phone VARCHAR(20) NOT NULL, -- Número de telefone (ex: 5511999999999)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_lid_mapping_lid ON lid_mapping(lid);
CREATE INDEX IF NOT EXISTS idx_lid_mapping_jid ON lid_mapping(jid);
CREATE INDEX IF NOT EXISTS idx_lid_mapping_phone ON lid_mapping(phone);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_lid_mapping_updated_at BEFORE UPDATE ON lid_mapping
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Função para obter JID a partir de LID
CREATE OR REPLACE FUNCTION get_jid_from_lid(p_lid VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN (SELECT jid FROM lid_mapping WHERE lid = p_lid LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- Função para obter LID a partir de JID
CREATE OR REPLACE FUNCTION get_lid_from_jid(p_jid VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN (SELECT lid FROM lid_mapping WHERE jid = p_jid LIMIT 1);
END;
$$ LANGUAGE plpgsql;

-- Função para salvar mapeamento LID->JID
CREATE OR REPLACE FUNCTION save_lid_mapping(p_lid VARCHAR, p_jid VARCHAR, p_phone VARCHAR)
RETURNS VOID AS $$
BEGIN
    INSERT INTO lid_mapping (lid, jid, phone)
    VALUES (p_lid, p_jid, p_phone)
    ON CONFLICT (lid) DO UPDATE SET
        jid = EXCLUDED.jid,
        phone = EXCLUDED.phone,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
