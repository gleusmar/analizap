-- BUG17: Fix fuzzy search function structure mismatch
-- Drop existing function completely
DROP FUNCTION IF EXISTS search_messages_fuzzy;

-- Recreate function with correct structure
CREATE OR REPLACE FUNCTION search_messages_fuzzy(
  search_term TEXT,
  date_from TIMESTAMPTZ DEFAULT NULL,
  date_to TIMESTAMPTZ DEFAULT NULL,
  similarity_threshold FLOAT DEFAULT 0.15
)
RETURNS TABLE (
  id UUID,
  conversation_id UUID,
  content TEXT,
  message_type TEXT,
  msg_timestamp TIMESTAMPTZ,
  from_me BOOLEAN,
  metadata JSONB,
  similarity_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.conversation_id,
    m.content,
    m.message_type,
    m.timestamp AS msg_timestamp,
    m.from_me,
    m.metadata,
    similarity(unaccent(m.content), unaccent(search_term)) AS similarity_score
  FROM messages m
  WHERE
    m.message_type = 'text'
    AND (
      m.content ILIKE '%' || search_term || '%'
      OR similarity(unaccent(m.content), unaccent(search_term)) > similarity_threshold
    )
    AND (date_from IS NULL OR m.timestamp >= date_from)
    AND (date_to IS NULL OR m.timestamp <= date_to)
  ORDER BY similarity_score DESC, m.timestamp DESC
  LIMIT 300;
END;
$$ LANGUAGE plpgsql STABLE;
