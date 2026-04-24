-- Índices para melhorar performance das queries de conversas e mensagens

-- Índice para buscar última mensagem de cada conversa
CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp 
ON messages(conversation_id, timestamp DESC);

-- Índice para buscar conversas ordenadas por última mensagem
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at 
ON conversations(last_message_at DESC NULLS LAST);

-- Índice para buscar mensagens por conversation_id
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
ON messages(conversation_id);

-- Índice para buscar mensagens por message_id
CREATE INDEX IF NOT EXISTS idx_messages_message_id 
ON messages(message_id);

-- Índice para buscar conversas por phone
CREATE INDEX IF NOT EXISTS idx_conversations_phone 
ON conversations(phone);

-- Índice para buscar conversas abertas
CREATE INDEX IF NOT EXISTS idx_conversations_is_open 
ON conversations(is_open);

-- Índice composto para conversation_tags
CREATE INDEX IF NOT EXISTS idx_conversation_tags_conversation_id 
ON conversation_tags(conversation_id);

-- Índice para tags
CREATE INDEX IF NOT EXISTS idx_tags_name 
ON tags(name);
