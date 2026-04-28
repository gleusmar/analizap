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

const PAGE_SIZE = 50;
const MSG_CACHE_DURATION = 30 * 60 * 1000; // 30 minutos

export function useConversationMessages(conversationId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const fetchMessages = useCallback(async (currentOffset = 0, append = false) => {
    if (!conversationId) return;

    if (!append) setLoading(true);
    setError(null);

    try {
      const cacheKey = `messages_${conversationId}`;

      // Cache apenas na primeira carga (sem append)
      if (!append && currentOffset === 0) {
        const cachedData = localStorage.getItem(cacheKey);
        const cacheTime = localStorage.getItem(`${cacheKey}_time`);
        if (cachedData && cacheTime) {
          const cacheAge = Date.now() - parseInt(cacheTime);
          if (cacheAge < MSG_CACHE_DURATION) {
            const cachedMessages = JSON.parse(cachedData);
            setMessages(cachedMessages);
            setOffset(cachedMessages.length);
            setHasMore(cachedMessages.length >= PAGE_SIZE);
            setLoading(false);
            return;
          }
        }
      }

      const response = await conversationsAPI.getMessages(conversationId, PAGE_SIZE, currentOffset);
      const newMessages = response.data.messages || [];

      if (append) {
        // Mensagens mais antigas vão ao INÍCIO (prepend), mantendo scroll
        setMessages(prev => [...newMessages, ...prev]);
      } else {
        setMessages(newMessages);
        localStorage.setItem(cacheKey, JSON.stringify(newMessages));
        localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
      }

      setOffset(currentOffset + newMessages.length);
      setHasMore(newMessages.length >= PAGE_SIZE);
    } catch (err) {
      setError('Erro ao carregar mensagens');
      console.error('Erro ao carregar mensagens:', err);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) fetchMessages(offset, true);
  }, [loading, hasMore, offset, fetchMessages]);

  useEffect(() => {
    // Limpa mensagens imediatamente quando conversationId muda
    setMessages([]);
    setOffset(0);
    setHasMore(true);
    fetchMessages(0, false);
  }, [conversationId, fetchMessages]);

  const refresh = useCallback(async () => {
    if (!conversationId) return;

    // Limpa cache e busca do servidor
    const cacheKey = `messages_${conversationId}`;
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(`${cacheKey}_time`);

    setLoading(true);
    setError(null);
    setOffset(0);
    setHasMore(true);

    await fetchMessages(0, false);
  }, [conversationId, fetchMessages]);

  return { messages, loading, error, refresh, hasMore, loadMore };
}
