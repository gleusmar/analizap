-- Atualiza last_message_at de todas as conversas com o timestamp máximo das mensagens
-- Isso corrige conversas que foram criadas antes do trigger ser atualizado

UPDATE conversations c
SET last_message_at = (
  SELECT MAX(timestamp)
  FROM messages m
  WHERE m.conversation_id = c.id
),
updated_at = NOW()
WHERE EXISTS (
  SELECT 1 FROM messages m WHERE m.conversation_id = c.id
);

-- Verificar se há conversas sem mensagens e definir last_message_at como null
UPDATE conversations c
SET last_message_at = NULL,
updated_at = NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM messages m WHERE m.conversation_id = c.id
);
