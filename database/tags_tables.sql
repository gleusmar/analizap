-- Adicionar campo has_signature na tabela users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS has_signature BOOLEAN DEFAULT false;

-- Tabela de tags
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(20) NOT NULL DEFAULT '#0088cc',
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modified_by UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Tabela de relacionamento entre conversas e tags
CREATE TABLE IF NOT EXISTS conversation_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id VARCHAR(100) NOT NULL, -- ID da conversa (será o phone number)
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(conversation_id, tag_id)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation ON conversation_tags(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_tags_tag ON conversation_tags(tag_id);

-- Trigger para atualizar modified_at de tags
CREATE OR REPLACE FUNCTION update_tags_modified_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.modified_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_tags_modified_at_trigger ON tags;
CREATE TRIGGER update_tags_modified_at_trigger
    BEFORE UPDATE ON tags
    FOR EACH ROW
    EXECUTE FUNCTION update_tags_modified_at();

-- Inserir tags iniciais
INSERT INTO tags (name, color, description) VALUES
    ('VIP', '#ffd700', 'Clientes VIP'),
    ('Problema', '#dc3545', 'Conversas com problemas'),
    ('Aguardando', '#ffc107', 'Aguardando resposta'),
    ('Urgente', '#dc3545', 'Conversas urgentes'),
    ('Orçamento', '#17a2b8', 'Conversas sobre orçamento')
ON CONFLICT (name) DO NOTHING;
