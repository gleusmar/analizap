import { useState, useEffect, useCallback } from 'react';
import { conversationsAPI } from '../services/api';

export function useConversations() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Tenta buscar do cache primeiro
      const cacheKey = 'conversations_list';
      const cachedData = localStorage.getItem(cacheKey);
      const cacheTime = localStorage.getItem(`${cacheKey}_time`);
      const CACHE_DURATION = 2 * 60 * 1000; // 2 minutos

      // Se tem cache válido, usa primeiro
      if (cachedData && cacheTime) {
        const cacheAge = Date.now() - parseInt(cacheTime);
        if (cacheAge < CACHE_DURATION) {
          setConversations(JSON.parse(cachedData));
          setLoading(false);
          // Busca em background para atualizar
          conversationsAPI.getAll().then(response => {
            setConversations(response.data.conversations || []);
            localStorage.setItem(cacheKey, JSON.stringify(response.data.conversations || []));
            localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
          }).catch(() => {});
          return;
        }
      }

      // Se não tem cache ou expirou, busca do servidor
      const response = await conversationsAPI.getAll();
      setConversations(response.data.conversations || []);
      localStorage.setItem(cacheKey, JSON.stringify(response.data.conversations || []));
      localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    } catch (err) {
      setError('Erro ao carregar conversas');
      console.error('Erro ao carregar conversas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const refresh = useCallback(async () => {
    // Limpa cache e busca do servidor
    const cacheKey = 'conversations_list';
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(`${cacheKey}_time`);

    setLoading(true);
    setError(null);

    try {
      // Busca direto do servidor sem cache
      const response = await conversationsAPI.getAll();
      setConversations(response.data.conversations || []);
      localStorage.setItem(cacheKey, JSON.stringify(response.data.conversations || []));
      localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    } catch (err) {
      setError('Erro ao carregar conversas');
      console.error('Erro ao carregar conversas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    conversations,
    loading,
    error,
    refresh
  };
}

export function useConversationMessages(conversationId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;

    setLoading(true);
    setError(null);

    try {
      // Tenta buscar do cache primeiro
      const cacheKey = `messages_${conversationId}`;
      const cachedData = localStorage.getItem(cacheKey);
      const cacheTime = localStorage.getItem(`${cacheKey}_time`);
      const CACHE_DURATION = 30 * 1000; // 30 segundos

      // Se tem cache válido, usa primeiro
      if (cachedData && cacheTime) {
        const cacheAge = Date.now() - parseInt(cacheTime);
        if (cacheAge < CACHE_DURATION) {
          setMessages(JSON.parse(cachedData));
          setLoading(false);
          // Busca em background para atualizar
          conversationsAPI.getMessages(conversationId).then(response => {
            setMessages(response.data.messages || []);
            localStorage.setItem(cacheKey, JSON.stringify(response.data.messages || []));
            localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
          }).catch(() => {});
          return;
        }
      }

      // Se não tem cache ou expirou, busca do servidor
      const response = await conversationsAPI.getMessages(conversationId);
      setMessages(response.data.messages || []);
      localStorage.setItem(cacheKey, JSON.stringify(response.data.messages || []));
      localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    } catch (err) {
      setError('Erro ao carregar mensagens');
      console.error('Erro ao carregar mensagens:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const refresh = useCallback(async () => {
    if (!conversationId) return;

    // Limpa cache e busca do servidor
    const cacheKey = `messages_${conversationId}`;
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(`${cacheKey}_time`);

    setLoading(true);
    setError(null);

    try {
      const response = await conversationsAPI.getMessages(conversationId);
      setMessages(response.data.messages || []);
      localStorage.setItem(cacheKey, JSON.stringify(response.data.messages || []));
      localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    } catch (err) {
      setError('Erro ao carregar mensagens');
      console.error('Erro ao carregar mensagens:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  return { messages, loading, error, refresh };
}
