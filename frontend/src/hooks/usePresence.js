import { useState, useEffect, useCallback } from 'react';

export function usePresence(socket) {
  const [presence, setPresence] = useState({}); // { phone: { presence: 'available'|'unavailable'|'composing', lastSeen: string|null } }

  useEffect(() => {
    if (!socket) return;

    const handlePresenceUpdate = (data) => {
      const { phone, presence: newPresence, last_seen } = data;
      setPresence(prev => ({
        ...prev,
        [phone]: {
          presence: newPresence,
          lastSeen: last_seen
        }
      }));
    };

    socket.on('whatsapp:presence_update', handlePresenceUpdate);

    return () => {
      socket.off('whatsapp:presence_update', handlePresenceUpdate);
    };
  }, [socket]);

  const getPresence = useCallback((phone) => {
    return presence[phone] || { presence: 'unavailable', lastSeen: null };
  }, [presence]);

  return {
    presence,
    getPresence
  };
}
