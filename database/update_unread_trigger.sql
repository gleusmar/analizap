-- Atualizar trigger para não incrementar unread_count se conversa estiver aberta

-- Remover trigger antigo
DROP TRIGGER IF EXISTS trigger_update_conversation_on_message ON messages;
DROP FUNCTION IF EXISTS update_conversation_on_message();

-- Criar nova função que verifica se a conversa está aberta
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
DECLARE
    conv_is_open BOOLEAN;
BEGIN
    -- Verificar se a conversa está aberta
    SELECT is_open INTO conv_is_open
    FROM conversations
    WHERE id = NEW.conversation_id;

    -- Atualizar last_message_at da conversa
    UPDATE conversations
    SET last_message_at = NEW.timestamp,
        unread_count = CASE 
            WHEN NEW.from_me = false AND conv_is_open = false THEN unread_count + 1 
            ELSE unread_count 
        END,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Recriar trigger
CREATE TRIGGER trigger_update_conversation_on_message
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();
