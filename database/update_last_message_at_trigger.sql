-- Atualiza o trigger para usar GREATEST e garantir que last_message_at seja sempre a mensagem mais recente
-- Isso corrige o problema de ordenação quando mensagens são inseridas fora de ordem durante a sincronização

CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    -- Atualizar last_message_at da conversa com a mensagem mais recente (GREATEST garante isso)
    UPDATE conversations
    SET last_message_at = GREATEST(COALESCE(last_message_at, NEW.timestamp), NEW.timestamp),
        unread_count = CASE WHEN NEW.from_me = false THEN unread_count + 1 ELSE unread_count END,
        updated_at = NOW()
    WHERE id = NEW.conversation_id;

    RETURN NEW;
END;
$$ language 'plpgsql';
