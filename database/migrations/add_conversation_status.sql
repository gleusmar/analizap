-- Migration: Add status and participant tracking to conversations
-- Run this in Supabase SQL editor

-- 1. Add status column (pending = aguardando agente, open = agente interagiu, closed = fechada)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'open'
    CHECK (status IN ('pending', 'open', 'closed'));

-- 2. Add participant user IDs array (users who sent messages since last open)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS participant_user_ids TEXT[] DEFAULT '{}';

-- 3. Sync existing data: closed conversations → status = 'closed'
UPDATE conversations SET status = 'closed' WHERE is_open = false;

-- 4. Existing open conversations with unread messages and last msg from client → pending
UPDATE conversations
SET status = 'pending'
WHERE is_open = true
  AND unread_count > 0
  AND id IN (
    SELECT DISTINCT conversation_id FROM messages
    WHERE from_me = false
  );

-- 5. Index for status
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

-- 6. View helper: sync is_open with status for backwards compatibility
CREATE OR REPLACE FUNCTION sync_is_open_from_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'closed' THEN
    NEW.is_open = false;
  ELSE
    NEW.is_open = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_is_open_from_status
  BEFORE UPDATE OF status ON conversations
  FOR EACH ROW EXECUTE FUNCTION sync_is_open_from_status();
