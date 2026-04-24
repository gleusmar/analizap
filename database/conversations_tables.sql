-- Tabelas de Conversas e Mensagens

-- Tabela de conversas
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(255) UNIQUE NOT NULL,
    contact_name VARCHAR(255),
    profile_picture_url TEXT,
    is_open BOOLEAN DEFAULT true,
    is_pinned BOOLEAN DEFAULT false,
    pinned_at TIMESTAMP WITH TIME ZONE,
    last_message_at TIMESTAMP WITH TIME ZONE,
    unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);
CREATE INDEX IF NOT EXISTS idx_conversations_is_open ON conversations(is_open);
CREATE INDEX IF NOT EXISTS idx_conversations_is_pinned ON conversations(is_pinned);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_unread_count ON conversations(unread_count);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    message_id VARCHAR(255) UNIQUE NOT NULL, -- ID do WhatsApp
    from_me BOOLEAN NOT NULL,
    message_type VARCHAR(50) NOT NULL, -- text, image, audio, video, document, etc.
    content TEXT, -- Texto da mensagem ou URL de mídia
    metadata JSONB, -- Dados adicionais (nome do arquivo, duração, etc.)
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    is_read BOOLEAN DEFAULT false,
    is_delivered BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_message_id ON messages(message_id);
CREATE INDEX IF NOT EXISTS idx_messages_from_me ON messages(from_me);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON messages(is_read);

-- Trigger para atualizar last_message_at e unread_count da conversa quando uma mensagem é inserida
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    -- Atualizar last_message_at da conversa
    UPDATE conversations
    SET last_message_at = NEW.timestamp,
        unread_count = CASE WHEN NEW.from_me = false THEN unread_count + 1 ELSE unread_count END,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_conversation_on_message
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- Trigger para zerar unread_count quando conversa é aberta
CREATE OR REPLACE FUNCTION reset_unread_on_open()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_open = true AND OLD.is_open = false THEN
        UPDATE conversations
        SET unread_count = 0,
            updated_at = NOW()
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_reset_unread_on_open
    AFTER UPDATE OF is_open ON conversations
    FOR EACH ROW EXECUTE FUNCTION reset_unread_on_open();
