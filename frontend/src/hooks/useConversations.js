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
      // Ordena explicitamente por last_message_at descending
      const sortedConversations = (response.data.conversations || []).sort((a, b) => {
        if (!a.last_message_at) return 1;
        if (!b.last_message_at) return -1;
        return new Date(b.last_message_at) - new Date(a.last_message_at);
      });
      setConversations(sortedConversations);
      localStorage.setItem(cacheKey, JSON.stringify(sortedConversations));
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
      // Ordena explicitamente por last_message_at descending
      const sortedConversations = (response.data.conversations || []).sort((a, b) => {
        if (!a.last_message_at) return 1;
        if (!b.last_message_at) return -1;
        return new Date(b.last_message_at) - new Date(a.last_message_at);
      });
      setConversations(sortedConversations);
      localStorage.setItem(cacheKey, JSON.stringify(sortedConversations));
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
    console.log('fetchMessages chamada', { conversationId });

    if (!conversationId) {
      console.warn('fetchMessages: conversationId é null, retornando');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Tenta buscar do cache primeiro
      const cacheKey = `messages_${conversationId}`;
      const cachedData = localStorage.getItem(cacheKey);
      const cacheTime = localStorage.getItem(`${cacheKey}_time`);
      const CACHE_DURATION = 30 * 1000; // 30 segundos

      console.log('fetchMessages: cache check', { hasCache: !!cachedData, hasCacheTime: !!cacheTime });

      // Se tem cache válido, usa primeiro
      if (cachedData && cacheTime) {
        const cacheAge = Date.now() - parseInt(cacheTime);
        if (cacheAge < CACHE_DURATION) {
          console.log('fetchMessages: usando cache', { cacheAge });
          setMessages(JSON.parse(cachedData));
          setLoading(false);
          // Busca em background para atualizar
          conversationsAPI.getMessages(conversationId).then(response => {
            console.log('fetchMessages: atualização em background', { messageCount: response.data.messages?.length });
            setMessages(response.data.messages || []);
            localStorage.setItem(cacheKey, JSON.stringify(response.data.messages || []));
            localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
          }).catch(err => {
            console.error('fetchMessages: erro na atualização em background', err);
          });
          return;
        }
      }

      // Se não tem cache ou expirou, busca do servidor
      console.log('fetchMessages: buscando do servidor');
      const response = await conversationsAPI.getMessages(conversationId);
      console.log('fetchMessages: resposta do servidor', { messageCount: response.data.messages?.length });
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
    // Limpa mensagens imediatamente quando conversationId muda
    setMessages([]);
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
