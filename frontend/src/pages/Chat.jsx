import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, CheckSquare, Square, Loader2, ArrowUpDown, Sun, Moon } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { authAPI, tagsAPI, conversationsAPI, predefinedMessagesAPI } from '../services/api';
import { useToast } from '../components/Toast';
import { useConversations, useConversationMessages } from '../hooks/useConversations';
import { useWhatsApp } from '../hooks/useWhatsApp';
import { usePresence } from '../hooks/usePresence';
import { MessageBubble } from '../components/MessageBubble';
import ContactPanel from '../components/ContactPanel';
import EmojiPicker from 'emoji-picker-react';
import { useTheme } from '../contexts/ThemeContext';

function Chat() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const toast = useToast();
  const { isDark, toggleTheme, colors } = useTheme();

  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [closedPage, setClosedPage] = useState(1);
  const location = useLocation();
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [conversationSearchQuery, setConversationSearchQuery] = useState('');
  const [availableTags, setAvailableTags] = useState([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [conversationTags, setConversationTags] = useState([]);
  const [conversationsWithTags, setConversationsWithTags] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [optimisticMessages, setOptimisticMessages] = useState({});
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [selectedAttachmentType, setSelectedAttachmentType] = useState(null);
  const [showCaptionModal, setShowCaptionModal] = useState(false);
  const [captionInput, setCaptionInput] = useState('');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [audioChunks, setAudioChunks] = useState([]);
  const [predefinedMessages, setPredefinedMessages] = useState([]);
  const [showContactPanel, setShowContactPanel] = useState(false);
  const messagesContainerRef = useRef(null);
  const prevScrollHeightRef = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [socketMessages, setSocketMessages] = useState({}); // Mensagens recebidas via Socket.io
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [messageToForward, setMessageToForward] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null); // Mensagem sendo respondida
  const [selectedContactsToForward, setSelectedContactsToForward] = useState([]);
  const [forwardSearchQuery, setForwardSearchQuery] = useState('');
  // Estados para múltipla seleção
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState(new Set());
  // Estado de loading ao selecionar conversa
  const [loadingConversation, setLoadingConversation] = useState(false);
  // Estado para ordenação
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' ou 'desc'
  // C13: overrides de status de leitura para atualização em tempo real
  const [messageStatusOverrides, setMessageStatusOverrides] = useState({});
  const textareaRef = useRef(null);

  // Hooks para dados reais
  const { conversations, loading: loadingConversations, refresh: refreshConversations } = useConversations();
  const { messages, loading: loadingMessages, refresh: refreshMessages, hasMore, loadMore } = useConversationMessages(selectedConversation?.id);

  // --- Refs estáveis para evitar closures stale ---
  const selectedConversationRef = useRef(selectedConversation);
  useEffect(() => { selectedConversationRef.current = selectedConversation; }, [selectedConversation]);
  const conversationsWithTagsRef = useRef(conversationsWithTags);
  useEffect(() => { conversationsWithTagsRef.current = conversationsWithTags; }, [conversationsWithTags]);
  const refreshConversationsTimerRef = useRef(null);
  const presenceTimerRef = useRef(null);

  // Beep de notificação via Web Audio API (sem arquivo externo)
  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } catch { /* sem AudioContext */ }
  }, []);

  // Notificação nativa do browser (B8: trunca body para evitar URL no subtítulo)
  const showBrowserNotification = useCallback((title, body) => {
    if (!('Notification' in window)) return;
    const truncated = body.length > 100 ? body.slice(0, 97) + '...' : body;
    const show = () => new Notification(title, { body: truncated, icon: '/ico.png', tag: 'wa-msg', silent: false });
    if (Notification.permission === 'granted') show();
    else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p === 'granted') show(); });
  }, []);

  // Pede permissão ao montar
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }, []);

  // Integrar com Socket.io para receber mensagens em tempo real
  const handleMessageReceived = useCallback((conversationId, message, isTemp = false) => {
    if (!message) return; // null = falha de entrega

    // Adiciona/atualiza nos socketMessages
    setSocketMessages(prev => {
      const convMessages = prev[conversationId] || [];
      const existingIndex = convMessages.findIndex(m => m.message_id === message.message_id);
      if (existingIndex >= 0) {
        const updated = [...convMessages];
        updated[existingIndex] = message;
        return { ...prev, [conversationId]: updated };
      }
      return { ...prev, [conversationId]: [...convMessages, message] };
    });

    // Atualiza sidebar in-place sem refresh de rede
    setConversationsWithTags(prev => {
      const idx = prev.findIndex(c => c.id === conversationId);
      if (idx === -1) {
        clearTimeout(refreshConversationsTimerRef.current);
        refreshConversationsTimerRef.current = setTimeout(() => refreshConversations(), 1500);
        return prev;
      }
      const isActive = selectedConversationRef.current?.id === conversationId;
      const updated = [...prev];
      const prevConv = updated[idx];
      // Se mensagem é do cliente e conversa estava fechada, passa para pending
      const newStatus = (!message.from_me && !prevConv.is_open)
        ? 'pending'
        : prevConv.status;
      const conv = {
        ...prevConv,
        last_message: message,
        last_message_at: message.timestamp,
        unread_count: isActive ? 0 : (prevConv.unread_count || 0) + 1,
        is_open: newStatus === 'pending' ? true : prevConv.is_open,
        status: newStatus
      };
      updated.splice(idx, 1);
      const firstNonPinned = updated.findIndex(c => !c.is_pinned);
      updated.splice(firstNonPinned === -1 ? 0 : firstNonPinned, 0, conv);
      return updated;
    });

    // Notificação + som apenas para mensagens externas em outras conversas
    if (!message.from_me && selectedConversationRef.current?.id !== conversationId) {
      playNotificationSound();
      const conv = conversationsWithTagsRef.current.find(c => c.id === conversationId) || {};
      const sender = conv.contact_name || conv.phone || 'Nova mensagem';
      const rawBody = message.message_type === 'text' ? (message.content || '') : `[${message.message_type}]`;
      const body = rawBody.replace(/https?:\/\/\S+/gi, '').trim().slice(0, 80) || rawBody.slice(0, 80);
      showBrowserNotification(sender, body);
    }

    // Invalida cache de mensagens
    localStorage.removeItem(`messages_${conversationId}`);
    localStorage.removeItem(`messages_${conversationId}_time`);
  }, [refreshConversations, playNotificationSound, showBrowserNotification]);

  // Callback para atualização de status de mensagem — atualiza in-place sem reload
  const handleMessageStatusUpdate = useCallback((messageId, status) => {
    const isDelivered = status === 'delivered' || status === 'read';
    const isRead = status === 'read';

    // C13: atualizar override de status para atualizar vv em tempo real
    setMessageStatusOverrides(prev => ({ ...prev, [messageId]: { is_delivered: isDelivered, is_read: isRead } }));

    const applyStatus = msgs => msgs.map(m =>
      m.message_id === messageId ? { ...m, is_delivered: isDelivered, is_read: isRead } : m
    );

    setSocketMessages(prev => {
      const updated = {};
      for (const [id, msgs] of Object.entries(prev)) updated[id] = applyStatus(msgs);
      return updated;
    });

    setOptimisticMessages(prev => {
      const updated = {};
      for (const [id, msgs] of Object.entries(prev)) updated[id] = applyStatus(msgs);
      return updated;
    });
  }, []);

  // Callback para atualização de mensagem (quando mídia é processada ou real_message_id atualizado)
  const handleMessageUpdated = useCallback((conversationId, messageId, content, tempMessageId, realMessageId, message) => {

    // Se tiver temp_message_id, atualizar mensagem otimista correspondente
    if (tempMessageId) {
      setOptimisticMessages(prev => {
        const convMessages = prev[conversationId] || [];
        const updated = convMessages.map(m => {
          if (m.message_id === tempMessageId) {
            // Se tiver a mensagem completa, usa ela. Senão, atualiza parcialmente
            if (message) {
              return {
                ...m,
                ...message,
                metadata: {
                  ...m.metadata,
                  ...message.metadata,
                  loading: false
                }
              };
            } else {
              return {
                ...m,
                content: content || m.content,
                metadata: {
                  ...m.metadata,
                  loading: false
                },
                real_message_id: realMessageId
              };
            }
          }
          return m;
        });
        return {
          ...prev,
          [conversationId]: updated
        };
      });
      // Não recarrega mensagens quando atualiza mensagem otimista - evita duplicação
      return;
    }

    // Se não tiver temp_message_id (atualização de mídia processada)
    if (messageId && content) {
      // Atualizar conteúdo in-place em socketMessages e messageStatusOverrides
      const applyContent = msgs => msgs.map(m =>
        m.message_id === messageId ? { ...m, content } : m
      );
      setSocketMessages(prev => {
        const updated = {};
        for (const [id, msgs] of Object.entries(prev)) updated[id] = applyContent(msgs);
        return updated;
      });
    }

    // Se for a conversa aberta, recarregar para garantir dados do backend
    if (conversationId === selectedConversation?.id) {
      const cacheKey = `messages_${conversationId}`;
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(`${cacheKey}_time`);
      refreshMessages();
    }
  }, [selectedConversation, refreshMessages]);

  // Limpar socketMessages quando a conversa muda
  useEffect(() => {
    setSocketMessages({});
  }, [selectedConversation?.id]);

  // B3: Desativar loading quando mensagens carregarem para a conversa correta
  const loadingForIdRef = useRef(null);
  useEffect(() => {
    if (selectedConversation?.id) loadingForIdRef.current = selectedConversation.id;
  }, [selectedConversation?.id]);
  useEffect(() => {
    if (!loadingMessages && loadingForIdRef.current === selectedConversation?.id) {
      setLoadingConversation(false);
    }
  }, [loadingMessages, selectedConversation?.id]);

  const { connectionStatus, socket, emitReadConversation, emitPresence } = useWhatsApp(handleMessageReceived, handleMessageStatusUpdate, handleMessageUpdated);
  const { getPresence } = usePresence(socket);

  // Função para formatar o status de presença
  const formatPresenceStatus = useCallback((phone) => {
    const presenceData = getPresence(phone);
    const { presence, lastSeen } = presenceData;

    if (presence === 'available') {
      return 'Online';
    } else if (presence === 'composing') {
      return 'Digitando...';
    } else if (presence === 'recording') {
      return 'Gravando áudio...';
    } else if (lastSeen) {
      const lastSeenDate = new Date(lastSeen);
      const now = new Date();
      const diffMinutes = Math.floor((now - lastSeenDate) / (1000 * 60));

      if (diffMinutes < 1) {
        return 'Visto agora mesmo';
      } else if (diffMinutes < 60) {
        return `Visto há ${diffMinutes} minutos`;
      } else if (diffMinutes < 1440) {
        const hours = Math.floor(diffMinutes / 60);
        return `Visto há ${hours} hora${hours > 1 ? 's' : ''}`;
      } else {
        return `Visto há ${lastSeenDate.toLocaleDateString('pt-BR')}`;
      }
    }

    return null;
  }, [getPresence]);

  // Função para scrollar para o final
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, []);

  // Preserva scroll quando mensagens antigas são prepostas (loadMore)
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || prevScrollHeightRef.current === 0) return;
    const newScrollHeight = container.scrollHeight;
    container.scrollTop = newScrollHeight - prevScrollHeightRef.current;
    prevScrollHeightRef.current = 0;
  }, [messages]);

  // Detectar fim do scroll e lazy loading ao rolar para o TOPO
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < 100);

      // Lazy loading: perto do topo (< 150px) carrega mensagens mais antigas
      if (scrollTop < 150 && hasMore && !loadingMessages) {
        prevScrollHeightRef.current = scrollHeight; // salva antes de prepend
        loadMore();
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMessages, loadMore]);

  // B4: Scroll para o final na PRIMEIRA carga de mensagens de uma conversa
  const firstLoadDoneRef = useRef(false);
  useEffect(() => { firstLoadDoneRef.current = false; }, [selectedConversation?.id]);
  useEffect(() => {
    if (!loadingMessages && messages.length > 0 && !firstLoadDoneRef.current) {
      firstLoadDoneRef.current = true;
      scrollToBottom();
    }
  }, [loadingMessages, messages.length, scrollToBottom]);

  // Scrollar para o final quando mensagens do backend mudam (se estiver no final)
  useEffect(() => {
    if (isAtBottom && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isAtBottom, scrollToBottom]);

  // Scrollar para o final quando novas mensagens chegam via socket
  useEffect(() => {
    if (isAtBottom) {
      scrollToBottom();
    }
  }, [socketMessages, isAtBottom, scrollToBottom]);

  // Carregar tags disponíveis e tags de todas as conversas
  useEffect(() => {
    fetchTags();
    fetchPredefinedMessages();
    return () => {
      clearTimeout(refreshConversationsTimerRef.current);
      clearTimeout(presenceTimerRef.current);
    };
  }, []);

  // Contagem total de não lidas + título do browser
  const totalUnread = useMemo(() =>
    conversationsWithTags.reduce((acc, c) => acc + (c.unread_count || 0), 0)
  , [conversationsWithTags]);

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) Analizap` : 'Analizap';
  }, [totalUnread]);

  const fetchPredefinedMessages = async () => {
    try {
      const response = await predefinedMessagesAPI.getAll();
      // A API retorna { data: { data: [...] } }, então precisamos acessar response.data.data
      const messages = Array.isArray(response.data?.data) ? response.data.data : [];
      setPredefinedMessages(messages);
    } catch (err) {
      console.error('Erro ao carregar mensagens pré-definidas:', err);
      setPredefinedMessages([]);
    }
  };

  // Recarregar tags de conversas quando conversas mudarem
  useEffect(() => {
    if (conversations.length > 0) {
      fetchAllConversationTags();
    } else {
      // Inicializar conversationsWithTags com array vazio quando conversations está vazio
      setConversationsWithTags([]);
    }
  }, [conversations]);

  // Fechar emoji picker ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showEmojiPicker && !event.target.closest('.emoji-picker-react')) {
        setShowEmojiPicker(false);
      }
      if (showAttachmentMenu && !event.target.closest('.attachment-menu')) {
        setShowAttachmentMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker, showAttachmentMenu]);

  // Timer de gravação de áudio
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const fetchTags = async () => {
    try {
      const response = await tagsAPI.getAll();
      setAvailableTags(response.data);
    } catch (err) {
      console.error('Erro ao carregar tags:', err);
    }
  };

  const fetchAllConversationTags = async () => {
    try {
      // Usar as tags que já vêm na resposta de conversas
      const conversationsWithTagsData = conversations.map(conv => {
        // Extrair tags de conversation_tags se existirem
        const tags = conv.conversation_tags?.map(ct => ct.tags) || [];
        return {
          ...conv,
          tags: tags,
          isPinned: conv.is_pinned,
          pinnedAt: conv.pinned_at
        };
      });
      setConversationsWithTags(conversationsWithTagsData);
    } catch (err) {
      console.error('Erro ao carregar tags das conversas:', err);
    }
  };

  // Carregar tags da conversa selecionada
  useEffect(() => {
    if (selectedConversation) {
      // Usar as tags que já vêm na conversa
      const tags = selectedConversation.conversation_tags?.map(ct => ct.tags) || [];
      setConversationTags(tags);
    }
  }, [selectedConversation?.id, selectedConversation?.conversation_tags]);

  const handleAddTag = async (tagId) => {
    if (!selectedConversation) return;

    try {
      await tagsAPI.addToConversation(selectedConversation.id, tagId);
      // Atualizar conversationsWithTags
      const updatedConversations = conversationsWithTags.map(conv =>
        conv.id === selectedConversation.id
          ? {
              ...conv,
              tags: [...conv.tags, availableTags.find(t => t.id === tagId)],
              is_pinned: conv.is_pinned,
              pinned_at: conv.pinned_at
            }
          : conv
      );
      setConversationsWithTags(updatedConversations);
      // Atualizar selectedConversation
      const updatedSelected = updatedConversations.find(c => c.id === selectedConversation.id);
      if (updatedSelected) {
        setSelectedConversation(updatedSelected);
      }
      setShowTagModal(false);
      toast.success('Tag adicionada com sucesso');
    } catch (err) {
      console.error('Erro ao adicionar tag:', err);
    }
  };

  const handleRemoveTag = async (tagId) => {
    if (!selectedConversation) return;

    try {
      await tagsAPI.removeFromConversation(selectedConversation.id, tagId);
      // Atualizar conversationsWithTags
      const updatedConversations = conversationsWithTags.map(conv =>
        conv.id === selectedConversation.id
          ? {
              ...conv,
              tags: conv.tags.filter(t => t.id !== tagId),
              is_pinned: conv.is_pinned,
              pinned_at: conv.pinned_at
            }
          : conv
      );
      setConversationsWithTags(updatedConversations);
      // Atualizar selectedConversation
      const updatedSelected = updatedConversations.find(c => c.id === selectedConversation.id);
      if (updatedSelected) {
        setSelectedConversation(updatedSelected);
      }
    } catch (err) {
      console.error('Erro ao remover tag:', err);
    }
  };

  const handleSelectConversation = async (conversation) => {
    // Já está selecionada: não faz nada (evita loading infinito)
    if (selectedConversation?.id === conversation.id) return;

    setLoadingConversation(true);

    // Limpar mensagens otimistas da conversa anterior
    if (selectedConversation?.id !== conversation.id) {
      setOptimisticMessages(prev => ({ ...prev, [selectedConversation?.id]: [] }));
    }

    const conversationWithTags = conversationsWithTags.find(c => c.id === conversation.id);
    const selected = conversationWithTags || conversation;
    setSelectedConversation(selected);

    // Abrir conversa no backend em background
    conversationsAPI.open(selected.id).catch(() => {});

    // Marcar como lida imediatamente na sidebar
    if (selected.unread_count > 0) {
      setConversationsWithTags(prev => prev.map(conv =>
        conv.id === selected.id ? { ...conv, unread_count: 0 } : conv
      ));

      // Confirmar no servidor e no WhatsApp via socket
      conversationsAPI.markAsRead(selected.id).catch(() => refreshConversations());

      // Envia read receipt ao WhatsApp via socket (marca com duas setas azuis)
      const lastMsgId = selected.last_message?.message_id || selected.last_message?.real_message_id;
      if (lastMsgId && selected.phone) {
        emitReadConversation(selected.phone, lastMsgId);
      }
    }
  };

  const handleCloseConversation = async () => {
    if (!selectedConversation) return;

    const id = selectedConversation.id;
    const updatedConversations = conversationsWithTags.map(conv =>
      conv.id === id ? { ...conv, is_open: false, status: 'closed', participant_user_ids: [] } : conv
    );
    setConversationsWithTags(updatedConversations);
    setSelectedConversation(null);

    try {
      await conversationsAPI.close(id);
    } catch (error) {
      console.error('Erro ao fechar conversa:', error);
      toast.error('Erro ao fechar conversa');
      refreshConversations();
    }
  };

  const handleOpenConversation = async () => {
    if (!selectedConversation) return;

    const id = selectedConversation.id;
    const updatedConversations = conversationsWithTags.map(conv =>
      conv.id === id ? { ...conv, is_open: true, status: 'open', participant_user_ids: [user?.id].filter(Boolean) } : conv
    );
    setConversationsWithTags(updatedConversations);
    const updatedSelected = updatedConversations.find(c => c.id === id);
    if (updatedSelected) setSelectedConversation(updatedSelected);
    // C10: focar na aba Abertas ao reabrir
    setActiveTab('open');

    try {
      await conversationsAPI.reopen(id);
    } catch (error) {
      console.error('Erro ao abrir conversa:', error);
      toast.error('Erro ao abrir conversa');
      refreshConversations();
    }
  };

  // Funções para seleção múltipla
  const toggleMultiSelectMode = () => {
    setIsMultiSelectMode(!isMultiSelectMode);
    setSelectedConversations(new Set());
  };

  const toggleConversationSelection = (conversationId) => {
    setSelectedConversations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(conversationId)) {
        newSet.delete(conversationId);
      } else {
        newSet.add(conversationId);
      }
      return newSet;
    });
  };

  const handleCloseMultipleConversations = async () => {
    if (selectedConversations.size === 0) return;

    try {
      await conversationsAPI.closeMultiple(selectedConversations.size); // TODO: implementar endpoint
      toast.success(`${selectedConversations.size} conversa(s) encerrada(s)`);
      setSelectedConversations(new Set());
      setIsMultiSelectMode(false);
      refreshConversations();
    } catch (error) {
      console.error('Erro ao encerrar conversas:', error);
      toast.error('Erro ao encerrar conversas');
    }
  };

  const handleMarkMultipleAsRead = async () => {
    if (selectedConversations.size === 0) return;

    try {
      // Atualiza localmente para remover os bubbles imediatamente
      setConversationsWithTags(prev => prev.map(conv =>
        selectedConversations.has(conv.id) ? { ...conv, unread_count: 0 } : conv
      ));

      // Envia confirmação em background
      await conversationsAPI.markMultipleAsRead(Array.from(selectedConversations));
      toast.success(`${selectedConversations.size} conversa(s) marcada(s) como lidas`);
      setSelectedConversations(new Set());
      setIsMultiSelectMode(false);
    } catch (error) {
      console.error('Erro ao marcar conversas como lidas:', error);
      toast.error('Erro ao marcar conversas como lidas');
      refreshConversations();
    }
  };

  const handleTogglePin = async () => {
    if (!selectedConversation) return;

    const isPinned = !selectedConversation.is_pinned;
    const pinnedAt = isPinned ? new Date().toISOString() : null;
    const id = selectedConversation.id;

    const updatedConversations = conversationsWithTags.map(conv =>
      conv.id === id ? { ...conv, is_pinned: isPinned, pinned_at: pinnedAt } : conv
    );
    setConversationsWithTags(updatedConversations);
    const updatedSelected = updatedConversations.find(c => c.id === id);
    if (updatedSelected) setSelectedConversation(updatedSelected);
    toast.success(isPinned ? 'Conversa fixada' : 'Conversa desafixada');

    try {
      await conversationsAPI.togglePin(id, isPinned);
    } catch (error) {
      console.error('Erro ao alterar pin:', error);
      toast.error('Erro ao alterar fixação');
      refreshConversations();
    }
  };

  // Contador de conversas pendentes para o badge
  const pendingCount = useMemo(() => {
    return conversationsWithTags.filter(c => c.status === 'pending').length;
  }, [conversationsWithTags]);

  // B5: reset closedPage ao mudar de aba
  useEffect(() => { if (activeTab !== 'closed') setClosedPage(1); }, [activeTab]);

  // Filtrar conversas por aba e busca
  const filteredConversations = useMemo(() => {
    const conversationsToFilter = conversationsWithTags;
    return conversationsToFilter
      .filter(conv => {
        // Filtrar por aba
        if (activeTab === 'pending') {
          if (conv.status !== 'pending') return false;
        } else if (activeTab === 'open') {
          // Abertas = apenas status 'open' (não pending, não closed)
          if (conv.status !== 'open') return false;
        } else if (activeTab === 'mine') {
          // Minhas = abertas onde o usuário atual é participante
          if (!conv.is_open) return false;
          const participants = conv.participant_user_ids || [];
          if (!participants.includes(user?.id)) return false;
        } else if (activeTab === 'closed') {
          if (conv.is_open) return false;
        }

        // Filtrar por busca
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          const matchesName = conv.contact_name?.toLowerCase().includes(query);
          const matchesPhone = conv.phone.toLowerCase().includes(query);
          return matchesName || matchesPhone;
        }

        return true;
      })
      .sort((a, b) => {
        // Fixadas sempre no topo
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;

        // Ordenar por última mensagem baseado no sortOrder
        if (!a.last_message_at) return sortOrder === 'desc' ? 1 : -1;
        if (!b.last_message_at) return sortOrder === 'desc' ? -1 : 1;

        const aDate = new Date(a.last_message_at);
        const bDate = new Date(b.last_message_at);

        return sortOrder === 'desc'
          ? bDate - aDate // Mais recente primeiro
          : aDate - bDate; // Mais antiga primeiro
      })
      // B5: Fechadas com lazy loading - limitar a closedPage * 20
      .slice(0, activeTab === 'closed' ? closedPage * 20 : undefined);
  }, [conversationsWithTags, activeTab, searchQuery, sortOrder, closedPage]);

  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  // B9/B11/C7: Abrir conversa específica ao voltar das páginas Search / Contacts
  useEffect(() => {
    const targetId = location.state?.openConversationId;
    const scrollToId = location.state?.scrollToMessageId;
    if (!targetId || conversationsWithTags.length === 0) return;
    const conv = conversationsWithTags.find(c => c.id === targetId);
    if (conv) {
      handleSelectConversation(conv);
      if (scrollToId) {
        // Aguardar mensagens carregar (loadingConversation = false), depois scrollar
        const checkAndScroll = setInterval(() => {
          if (!loadingConversation) {
            clearInterval(checkAndScroll);
            const el = document.getElementById(`msg-${scrollToId}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              setHighlightedMessageId(scrollToId);
              setTimeout(() => setHighlightedMessageId(null), 3000);
            }
          }
        }, 100);
        // Timeout de segurança após 5 segundos
        setTimeout(() => clearInterval(checkAndScroll), 5000);
      }
      navigate('/dashboard', { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.openConversationId, conversationsWithTags.length]);

  // Combinar mensagens otimistas, socketMessages e mensagens do backend
  const allMessages = useMemo(() => {
    const convOptimistic = optimisticMessages[selectedConversation?.id] || [];
    const convSocketMessages = socketMessages[selectedConversation?.id] || [];

    // Mesclar mensagens, priorizando as do backend (removendo duplicatas por message_id)
    const backendMessageIds = new Set(messages.map(m => m.message_id));
    const uniqueOptimistic = convOptimistic.filter(m => !backendMessageIds.has(m.message_id));
    const uniqueSocketMessages = convSocketMessages.filter(m => !backendMessageIds.has(m.message_id));

    // Remover duplicatas entre socketMessages e optimistic
    const optimisticMessageIds = new Set(uniqueOptimistic.map(m => m.message_id));
    const uniqueSocketFinal = uniqueSocketMessages.filter(m => !optimisticMessageIds.has(m.message_id));

    // C13: aplicar overrides de status sobre mensagens do backend
    const backendWithStatus = messages.map(m => {
      const override = messageStatusOverrides[m.message_id];
      return override ? { ...m, ...override } : m;
    });

    const combined = [...backendWithStatus, ...uniqueSocketFinal, ...uniqueOptimistic];
    // Ordenar por timestamp (mais antigas primeiro)
    return combined.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [messages, optimisticMessages, socketMessages, selectedConversation?.id, messageStatusOverrides]);

  // Filtrar e ordenar contatos para encaminhamento
  const filteredConversationsForForward = useMemo(() => {
    let filtered = conversations;

    // Filtrar por busca
    if (forwardSearchQuery.trim()) {
      const query = forwardSearchQuery.toLowerCase();
      filtered = filtered.filter(conv => {
        const name = (conv.contact_name || conv.phone || '').toLowerCase();
        return name.includes(query);
      });
    }

    // Ordenar por última interação (mais recente primeiro)
    return filtered.sort((a, b) => {
      const aDate = new Date(a.last_message_at || 0);
      const bDate = new Date(b.last_message_at || 0);
      return bDate - aDate;
    });
  }, [conversations, forwardSearchQuery]);

  // Filtrar mensagens da conversa atual por busca
  const filteredMessages = useMemo(() => {
    if (!conversationSearchQuery.trim()) {
      return allMessages;
    }

    const query = conversationSearchQuery.toLowerCase();
    return allMessages.filter(message => {
      if (message.message_type === 'text') {
        return message.content?.toLowerCase().includes(query);
      }
      return false;
    });
  }, [allMessages, conversationSearchQuery]);

  // Adicionar bubbles de data entre mensagens de dias diferentes
  const messagesWithDateBubbles = useMemo(() => {
    const result = [];
    let lastDate = null;

    filteredMessages.forEach(message => {
      const messageDate = new Date(message.timestamp);
      const messageDateStr = messageDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

      // Se a data mudou, adiciona um bubble de data
      if (messageDateStr !== lastDate) {
        result.push({
          type: 'date',
          date: messageDateStr,
          id: `date-${messageDateStr}`
        });
        lastDate = messageDateStr;
      }

      result.push({
        type: 'message',
        message: message,
        id: message.id
      });
    });

    return result;
  }, [filteredMessages]);

  const handleLogout = async () => {
    try {
      await authAPI.logout();
      logout();
      toast.success('Logout realizado com sucesso!');
      navigate('/login');
    } catch (err) {
      logout();
      navigate('/login');
    }
  };

  // Excluir conversa (apenas admin)
  const handleDeleteConversation = async () => {
    if (!selectedConversation) return;
    if (!window.confirm('Tem certeza que deseja excluir esta conversa? Esta ação não pode ser desfeita.')) {
      return;
    }

    try {
      await conversationsAPI.delete(selectedConversation.id);
      setSelectedConversation(null);
      refreshConversations();
      toast.success('Conversa excluída com sucesso');
    } catch (error) {
      console.error('Erro ao excluir conversa:', error);
    }
  };

  // Adicionar emoji ao input
  const handleEmojiClick = (emojiData, event) => {
    // BUG21: Prevenir fechamento rápido
    if (event) event.stopPropagation();
    console.log('Emoji clicked full data:', JSON.stringify(emojiData));
    console.log('Emoji clicked type:', typeof emojiData);
    console.log('Emoji clicked keys:', Object.keys(emojiData));
    
    // Tentar extrair emoji de diferentes maneiras
    let emoji = '';
    if (typeof emojiData === 'string') {
      emoji = emojiData;
    } else if (emojiData.emoji) {
      emoji = emojiData.emoji;
    } else if (emojiData.native) {
      emoji = emojiData.native;
    } else if (emojiData.char) {
      emoji = emojiData.char;
    } else {
      console.error('Could not extract emoji from:', emojiData);
      return;
    }
    
    console.log('Extracted emoji:', emoji);
    setMessageInput(prev => prev + emoji);
    // BUG21: Não fechar imediatamente, manter aberto para seleção rápida
    // setShowEmojiPicker(false);
  };

  // Selecionar tipo de anexo
  const handleAttachmentSelect = (type) => {
    setSelectedAttachmentType(type);
    setShowAttachmentMenu(false);

    if (type === 'audio') {
      startRecording();
    } else if (type === 'location') {
      handleSendLocation();
    } else if (type === 'contact') {
      alert('Seleção de contato não implementada ainda');
    } else {
      document.getElementById('file-input').click();
    }
  };

  // Lidar com seleção de arquivo
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setAttachmentFile(file);
      setShowCaptionModal(true);
    }
    event.target.value = '';
  };

  // Enviar arquivo com legenda
  const handleSendAttachment = async () => {
    if (!attachmentFile || !selectedConversation) return;

    const file = attachmentFile;
    const caption = captionInput;

    // Fechar modal imediatamente
    setShowCaptionModal(false);
    setCaptionInput('');
    setAttachmentFile(null);

    try {
      // Enviar em background
      const response = await conversationsAPI.sendAttachment(selectedConversation.id, file, caption);
      const tempMessageId = response.data.temp_message_id;

      // Adicionar mensagem otimista com loading usando o ID retornado pelo backend
      const optimisticMessage = {
        id: null,
        message_id: tempMessageId,
        conversation_id: selectedConversation.id,
        from_me: true,
        message_type: file.type.startsWith('image/') ? 'image' :
                     file.type.startsWith('video/') ? 'video' :
                     file.type.startsWith('audio/') ? 'audio' : 'document',
        content: '', // Será preenchido após upload
        metadata: {
          caption: caption,
          filename: file.name,
          mimetype: file.type,
          loading: true // Flag para indicar loading
        },
        timestamp: new Date().toISOString(),
        is_read: false,
        is_delivered: false
      };

      setOptimisticMessages(prev => ({
        ...prev,
        [selectedConversation.id]: [...(prev[selectedConversation.id] || []), optimisticMessage]
      }));

      // A mensagem definitiva chegará via Socket.io
    } catch (error) {
      console.error('Erro ao enviar anexo:', error);
    }
  };

  // Iniciar gravação de áudio
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
        setAttachmentFile(audioFile);
        setShowCaptionModal(true);
      };

      setMediaRecorder(recorder);
      setAudioChunks(chunks);
      recorder.start();
      setIsRecording(true);
      setRecordingTime(0);
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error);
    }
  };

  // Parar gravação de áudio
  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      mediaRecorder.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setMediaRecorder(null);
    }
  };

  // Enviar localização
  const handleSendLocation = async () => {
    if (!selectedConversation) return;

    if (!navigator.geolocation) {
      alert('Geolocalização não suportada');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        try {
          await conversationsAPI.sendLocation(selectedConversation.id, lat, lng);
          refreshMessages();
          refreshConversations();
        } catch (error) {
          console.error('Erro ao enviar localização:', error);
        }
      },
      (error) => {
        console.error('Erro ao obter localização:', error);
        alert('Erro ao obter localização');
      }
    );
  };

  // Formatar tempo de gravação
  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // C1: Resetar altura do textarea quando messageInput for limpo
  useEffect(() => {
    if (!messageInput && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.overflowY = 'hidden';
    }
  }, [messageInput]);

  // Lidar com mudança no input de mensagem (atalhos + presença)
  const handleMessageInputChange = (e) => {
    const value = e.target.value;
    setMessageInput(value);

    // Emite "digitando..." ao contato e agenda pausa após 3s
    if (selectedConversation?.phone) {
      if (value.length > 0) {
        emitPresence(selectedConversation.phone, 'composing');
        clearTimeout(presenceTimerRef.current);
        presenceTimerRef.current = setTimeout(() => {
          emitPresence(selectedConversation.phone, 'paused');
        }, 3000);
      } else {
        clearTimeout(presenceTimerRef.current);
        emitPresence(selectedConversation.phone, 'paused');
      }
    }

    // Atalhos de mensagens pré-definidas (/atalho)
    const words = value.split(' ');
    const lastWord = words[words.length - 1];
    if (lastWord.startsWith('/')) {
      const predefinedMessage = predefinedMessages.find(msg => msg.shortcut === lastWord);
      if (predefinedMessage) {
        setMessageInput(words.slice(0, -1).join(' ') + ' ' + predefinedMessage.content);
      }
    }
  };

  // Enviar mensagem
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation) return;

    const messageContent = messageInput.trim();
    const metadata = replyingTo ? { quoted: replyingTo } : {};

    setMessageInput('');
    setReplyingTo(null);

    // Para de emitir presença ao enviar
    clearTimeout(presenceTimerRef.current);
    if (selectedConversation?.phone) emitPresence(selectedConversation.phone, 'paused');

    try {
      await conversationsAPI.sendMessage(selectedConversation.id, messageContent, 'text', metadata);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      setMessageInput(messageContent);
    }
  };

  const handleReact = async (message, emoji) => {
    try {
      // Adicionar reação localmente imediatamente
      setSocketMessages(prev => {
        const convId = selectedConversation?.id;
        if (!convId) return prev;

        const convMessages = prev[convId] || [];
        return {
          ...prev,
          [convId]: convMessages.map(msg => {
            if (msg.message_id === message.message_id) {
              // Se emoji for vazio, remover todas as reações
              if (!emoji) {
                return {
                  ...msg,
                  reactions: []
                };
              }
              // Substituir reações existentes pela nova (apenas uma reação por usuário)
              return {
                ...msg,
                reactions: [emoji]
              };
            }
            return msg;
          })
        };
      });

      // Enviar para o backend (mesmo se for vazio para remover)
      await conversationsAPI.sendReaction(selectedConversation.id, message.message_id, emoji);
    } catch (error) {
      console.error('Erro ao reagir:', error);
    }
  };

  const handleForward = (message) => {
    setMessageToForward(message);
    setSelectedContactsToForward([]);
    setForwardSearchQuery('');
    setShowForwardModal(true);
  };

  const handleSendForward = async () => {
    if (!messageToForward || selectedContactsToForward.length === 0) return;

    try {
      await conversationsAPI.forwardMessage(
        selectedConversation.id,
        [messageToForward.message_id],
        selectedContactsToForward
      );
      setShowForwardModal(false);
      setMessageToForward(null);
      setSelectedContactsToForward([]);
      setForwardSearchQuery('');
      toast.success('Mensagem encaminhada com sucesso!');
    } catch (error) {
      console.error('Erro ao encaminhar:', error);
      toast.error('Erro ao encaminhar mensagem');
    }
  };

  const handleReply = (message) => {
    setReplyingTo(message);
    // Focar no input
    document.getElementById('message-input')?.focus();
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const scrollToMessage = (messageId) => {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (messageElement) {
      messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Adicionar highlight temporário
      messageElement.classList.add('ring-2', 'ring-emerald-500');
      setTimeout(() => {
        messageElement.classList.remove('ring-2', 'ring-emerald-500');
      }, 2000);
    }
  };

  // Função para converter formatação do WhatsApp (*texto* para negrito, _texto_ para itálico)
  const formatWhatsAppText = (text) => {
    if (!text) return '';
    // Substituir *_texto_* (negrito + itálico)
    let formatted = text.replace(/\*_(.+?)_\*/g, '<strong><em>$1</em></strong>');
    // Substituir *texto* (negrito)
    formatted = formatted.replace(/\*(.+?)\*/g, '<strong>$1</strong>');
    // Substituir _texto_ (itálico)
    formatted = formatted.replace(/_(.+?)_/g, '<em>$1</em>');
    return formatted;
  };

  // Formatar data/hora mostrando data quando > 24h
  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours > 24) {
      return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  // Renderizar última mensagem na lista de conversas
  const renderLastMessage = (conversation) => {
    if (!conversation.last_message) {
      return 'Nenhuma mensagem';
    }

    const message = conversation.last_message;

    // Verificar o tipo de mensagem
    if (message.message_type) {
      switch (message.message_type) {
        case 'image':
          return '📷 Imagem';
        case 'video':
          return '🎥 Vídeo';
        case 'audio':
          return '🎤 Áudio';
        case 'document':
          return '📄 Documento';
        case 'location':
          return '📍 Localização';
        case 'contact':
          return '👤 Contato';
        case 'sticker':
          return '😊 Figurinha';
        case 'call':
          return '📞 Chamada';
        case 'system':
          return <span className="italic opacity-70">{message.content}</span>;
        case 'text':
        default:
          const textContent = message.content?.substring(0, 50) || 'Mensagem de texto';
          return <span dangerouslySetInnerHTML={{ __html: formatWhatsAppText(textContent) }} />;
      }
    }

    // Se for texto simples
    if (typeof message === 'string') {
      const textContent = message.substring(0, 50);
      return <span dangerouslySetInnerHTML={{ __html: formatWhatsAppText(textContent) }} />;
    }

    return 'Mensagem';
  };

  const handleMouseDown = (e) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (isResizing) {
      const newWidth = e.clientX - 60; // 60px é a largura da sidebar esquerda
      if (newWidth >= 280 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    }
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  return (
    <div className="h-screen flex bg-white" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* Coluna Esquerda Fixa (60px) */}
      <div className="w-[60px] flex flex-col items-center py-3 flex-shrink-0" style={{ backgroundColor: colors.bg4 }}>
        {/* Status da conexão — oculto enquanto carrega */}
        {connectionStatus !== null && (
          <div className="mb-6">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center ${
                connectionStatus === 'connected' ? 'bg-emerald-500'
                : connectionStatus === 'connecting' ? 'bg-yellow-500'
                : 'bg-red-500'
              }`}
              title={
                connectionStatus === 'connected' ? 'Conectado'
                : connectionStatus === 'connecting' ? 'Conectando...'
                : 'Desconectado'
              }
            >
              {connectionStatus === 'connected' ? (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : connectionStatus === 'connecting' ? (
                <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
          </div>
        )}

        <div className="flex-1"></div>

        {/* Contatos */}
        <button
          onClick={() => navigate('/contacts')}
          className="mb-3 p-2 text-gray-400 hover:text-emerald-500 transition-colors"
          title="Contatos"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Busca de histórico */}
        <button
          onClick={() => navigate('/search')}
          className="mb-3 p-2 text-gray-400 hover:text-emerald-500 transition-colors"
          title="Busca no histórico"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {/* Toggle de tema */}
        <button
          onClick={toggleTheme}
          className="mb-4 p-2 text-gray-400 hover:text-emerald-500 transition-colors"
          title={isDark ? 'Modo claro' : 'Modo escuro'}
        >
          {isDark ? <Sun size={24} /> : <Moon size={24} />}
        </button>

        {/* Configurações */}
        <button
          onClick={() => navigate('/settings/users')}
          className="mb-4 p-2 text-gray-400 hover:text-emerald-500 transition-colors"
          title="Configurações"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Avatar do usuário */}
        <button className="mb-4">
          <img
            src={user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'}
            alt="Avatar"
            className="w-10 h-10 rounded-full"
          />
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
          title="Sair"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>

      {/* Coluna Central (Lista de conversas) - Ajustável */}
      <div 
        className="flex flex-col flex-shrink-0"
        style={{ width: `${sidebarWidth}px`, backgroundColor: colors.bg }}
      >
        {/* Header com logo e busca */}
        <div className="p-3" style={{ backgroundColor: colors.bgSecondary }}>
          <div className="flex items-center mb-3">
            <img src="/ico.png" alt="Analizap" className="w-8 h-8 mr-2" />
            <h1 className="text-lg font-semibold" style={{ color: colors.text }}>Analizap</h1>
          </div>
          <div className="flex space-x-2 mb-3">
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
              style={{ backgroundColor: colors.bgTertiary, color: colors.text, placeholderColor: colors.textSecondary }}
            />
            <button
              onClick={toggleMultiSelectMode}
              className={`px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                isMultiSelectMode ? 'bg-emerald-600 text-white' : ''
              }`}
              style={{ backgroundColor: !isMultiSelectMode ? colors.bg : undefined, color: !isMultiSelectMode ? colors.textSecondary : 'white' }}
              title={isMultiSelectMode ? 'Sair do modo de seleção' : 'Seleção múltipla'}
            >
              {isMultiSelectMode ? <CheckSquare size={18} /> : <Square size={18} />}
            </button>
            <button
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className={`px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortOrder === 'desc' ? 'bg-emerald-600 text-white' : ''
              }`}
              style={{ backgroundColor: sortOrder !== 'desc' ? colors.bg : undefined, color: sortOrder !== 'desc' ? colors.textSecondary : 'white' }}
              title={`Ordenar: ${sortOrder === 'desc' ? 'Mais recente primeiro' : 'Mais antiga primeiro'}`}
            >
              <ArrowUpDown size={18} />
            </button>
          </div>
          <div className="flex space-x-1 mb-3">
            {[
              { key: 'open',    label: 'Abertas',   badge: 0 },
              { key: 'mine',    label: 'Minhas',    badge: 0 },
              { key: 'pending', label: 'Pendentes', badge: pendingCount },
              { key: 'closed',  label: 'Fechadas',  badge: 0 },
            ].map(({ key, label, badge }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="relative flex-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor: activeTab === key ? '#059669' : colors.bg,
                  color: activeTab === key ? 'white' : colors.textSecondary
                }}
              >
                {label}
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* Botão para encerrar múltiplas conversas */}
          {isMultiSelectMode && selectedConversations.size > 0 && (
            <div className="flex space-x-2 mt-3">
              <button
                onClick={handleMarkMultipleAsRead}
                className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
              >
                Marcar como lidas
              </button>
              <button
                onClick={handleCloseMultipleConversations}
                className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                Encerrar
              </button>
            </div>
          )}
        </div>

        {/* Indicador de busca */}
        {searchQuery && (
          <div className="px-3 py-2 text-xs" style={{ backgroundColor: colors.bgSecondary, color: colors.textSecondary }}>
            {filteredConversations.length} resultado{filteredConversations.length !== 1 ? 's' : ''} encontrado{filteredConversations.length !== 1 ? 's' : ''}
            <button
              onClick={() => setSearchQuery('')}
              className="ml-2 text-emerald-500 hover:text-emerald-400"
            >
              Limpar
            </button>
          </div>
        )}

        {/* Lista de conversas */}
        <div
          className="flex-1 overflow-y-auto"
          onScroll={e => {
            if (activeTab !== 'closed') return;
            const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
            if (scrollHeight - scrollTop - clientHeight < 80) {
              setClosedPage(p => p + 1);
            }
          }}
        >
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: colors.textSecondary }}>
              {searchQuery ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa nesta aba'}
            </div>
          ) : (
            filteredConversations.map(conversation => {
              // Determinar cor da borda baseado na última mensagem
              const lastMessageFromMe = conversation.last_message?.from_me;
              const borderColor = lastMessageFromMe ? 'border-gray-400' : 'border-orange-400';

              return (
              <div
                key={conversation.id}
                onClick={() => isMultiSelectMode ? toggleConversationSelection(conversation.id) : handleSelectConversation(conversation)}
                className={`flex items-center p-3 cursor-pointer transition-colors border-l-2 border-b-2 ${
                  selectedConversation?.id === conversation.id && !isMultiSelectMode ? '' : ''
                } ${selectedConversations.has(conversation.id) && isMultiSelectMode ? '' : ''} ${borderColor}`}
                style={{borderBottomColor: colors.border2 ,backgroundColor: selectedConversation?.id === conversation.id && !isMultiSelectMode ? colors.bgTertiary : selectedConversations.has(conversation.id) && isMultiSelectMode ? colors.bgTertiary : colors.bgSecondary }}
              >
                {isMultiSelectMode && (
                  <div className="mr-3">
                    {selectedConversations.has(conversation.id) ? (
                      <CheckSquare size={20} className="text-emerald-500" />
                    ) : (
                      <Square size={20} className="text-gray-400" />
                    )}
                  </div>
                )}
                <div className="relative mr-3">
                  <img
                    src={conversation.profile_picture_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${conversation.phone}`}
                    alt={conversation.contact_name || conversation.phone}
                    className="w-12 h-12 rounded-full"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1">
                    <div className="flex items-center">
                      {conversation.is_pinned && (
                        <svg className="w-4 h-4 text-emerald-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      )}
                      <h3 className="font-medium truncate" style={{ color: colors.text3 }}>{conversation.contact_name || conversation.phone} </h3>
                    </div>
                    <div className="flex items-center">
                      {conversation.tags && conversation.tags.length > 0 && (
                        <div className="flex mr-2">
                          {conversation.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-1.5 py-0.5 rounded mr-1"
                              style={isDark
                                ? { backgroundColor: tag.color + '33', color: tag.color }
                                : { backgroundColor: tag.color + 'CC', color: '#fff' }
                              }
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {conversation.last_message?.timestamp && (
                        <span className="text-xs" style={{ color: colors.textSecondary }}>
                          {formatDateTime(conversation.last_message.timestamp)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm truncate" style={{ color: colors.textSecondary }}>
                      {getPresence(conversation.phone)?.presence === 'composing' ? (
                        <span className="text-emerald-500 font-medium">digitando...</span>
                      ) : (
                        renderLastMessage(conversation)
                      )}
                    </p>
                    {conversation.unread_count > 0 && (
                      <span className="bg-emerald-500 text-white text-xs rounded-full px-2 py-0.5 ml-2">
                        {conversation.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>

      {/* Divider para resize */}
      <div
        className="w-1 cursor-col-resize hover:bg-emerald-500 transition-colors flex-shrink-0"
        style={{ backgroundColor: colors.bg }}
        onMouseDown={handleMouseDown}
      />

      {/* Coluna Direita (Conversa) */}
      <div className={`flex-1 flex flex-col ${showContactPanel ? '' : ''}`} style={{ backgroundColor: colors.bg }}>
        {selectedConversation ? (
          <>
            {/* Header da conversa */}
            <div className="flex items-center justify-between p-3 flex-shrink-0" style={{ backgroundColor: colors.bgSecondary }}>
              <div className="flex items-center flex-1 cursor-pointer" onClick={() => setShowContactPanel(true)}>
                <img
                  src={selectedConversation.profile_picture_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedConversation.phone}`}
                  alt={selectedConversation.contact_name || selectedConversation.phone}
                  className="w-10 h-10 rounded-full mr-3"
                />
                <div className="flex-1">
                  <div className="flex items-center mb-1">
                    <h3 className="font-medium" style={{ color: colors.text }}>{selectedConversation.contact_name || selectedConversation.phone}</h3>
                    {conversationTags.length > 0 && (
                      <div className="flex ml-2">
                        {conversationTags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-1.5 py-0.5 rounded mr-1 flex items-center"
                            style={isDark
                              ? { backgroundColor: tag.color + '33', color: tag.color }
                              : { backgroundColor: tag.color + 'CC', color: '#fff' }
                            }
                          >
                            {tag.name}
                            <button
                              onClick={() => handleRemoveTag(tag.id)}
                              className="ml-1 hover:opacity-70"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: colors.textSecondary }}>
                    {formatPresenceStatus(selectedConversation.phone)}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={selectedConversation?.is_open ? handleCloseConversation : handleOpenConversation}
                  className="text-gray-400 hover:text-emerald-500 transition-colors"
                  title={selectedConversation?.is_open ? 'Fechar conversa' : 'Abrir conversa'}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {selectedConversation?.is_open ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    )}
                  </svg>
                </button>
                <button
                  onClick={handleTogglePin}
                  className={`transition-colors ${selectedConversation?.is_pinned ? 'text-emerald-500' : 'text-gray-400 hover:text-emerald-500'}`}
                  title={selectedConversation?.is_pinned ? 'Desafixar conversa' : 'Fixar conversa'}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowTagModal(true)}
                  className="text-gray-400 hover:text-emerald-500 transition-colors"
                  title="Adicionar tag"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {user?.role === 'admin' && (
                  <button
                    onClick={handleDeleteConversation}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Excluir conversa"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar na conversa"
                    value={conversationSearchQuery}
                    onChange={(e) => setConversationSearchQuery(e.target.value)}
                    className="rounded-lg py-1.5 pl-8 pr-4 text-xs w-40 focus:outline-none"
                    style={{ backgroundColor: colors.bgTertiary, color: colors.text, placeholderColor: colors.textSecondary }}
                  />
                  <svg className="w-4 h-4 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: colors.textSecondary }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  {conversationSearchQuery && (
                    <button
                      onClick={() => setConversationSearchQuery('')}
                      className="absolute right-2 top-2 text-gray-400 hover:text-white"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Área de mensagens + FAB scroll-to-bottom */}
            <div className="flex-1 relative overflow-hidden" style={{ backgroundColor: colors.bg }}>
            {!isAtBottom && (
              <button
                onClick={scrollToBottom}
                className="absolute bottom-4 right-4 z-10 w-10 h-10 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110"
                style={{ backgroundColor: colors.meMessageBg }}
                title="Ir para o final"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            )}
            <div ref={messagesContainerRef} className="h-full overflow-y-auto p-4">
              {loadingConversation ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                </div>
              ) : messagesWithDateBubbles.length === 0 ? (
                <div className="text-center py-8 text-sm" style={{ color: colors.textSecondary }}>
                  Nenhuma mensagem encontrada
                </div>
              ) : (
                <>
                  {messagesWithDateBubbles.map(item => {
                    if (item.type === 'date') {
                      return (
                        <div key={item.id} className="flex justify-center my-4">
                          <span className="text-xs px-3 py-1 rounded-full" style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}>
                            {item.date}
                          </span>
                        </div>
                      );
                    }
                    const isHighlighted = highlightedMessageId && item.message.message_id === highlightedMessageId;
                    return (
                      <div
                        key={item.id}
                        id={`msg-${item.message.message_id}`}
                        className={`transition-all duration-500 rounded-lg ${isHighlighted ? 'ring-2 ring-emerald-400 bg-emerald-500/10' : ''}`}
                      >
                        <MessageBubble
                          message={item.message}
                          isMe={item.message.from_me}
                          onReact={handleReact}
                          onForward={handleForward}
                          onReply={handleReply}
                          onScrollToMessage={scrollToMessage}
                        />
                      </div>
                    );
                  })}

                  {/* Bubble de "digitando..." */}
                  {(() => {
                    const p = getPresence(selectedConversation?.phone);
                    const isTyping = p?.presence === 'composing' || p?.presence === 'recording';
                    if (!isTyping) return null;
                    return (
                      <div className="flex items-end mb-1">
                        <div className="px-4 py-2 rounded-2xl rounded-bl-sm text-sm max-w-xs" style={{ backgroundColor: colors.bgTertiary }}>
                          <div className="flex items-center space-x-1">
                            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: colors.textSecondary, animationDelay: '0ms' }} />
                            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: colors.textSecondary, animationDelay: '150ms' }} />
                            <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: colors.textSecondary, animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
            </div>

            {/* Banner: conversa fechada */}
            {!selectedConversation?.is_open && (
              <div className="p-4 flex-shrink-0 flex items-center justify-center gap-3 border-t" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                <span className="text-sm" style={{ color: colors.textSecondary }}>Conversa encerrada</span>
                <button
                  onClick={handleOpenConversation}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  Reabrir
                </button>
              </div>
            )}

            {/* Banner: conversa pendente */}
            {selectedConversation?.is_open && selectedConversation?.status === 'pending' && (
              <div className="p-4 flex-shrink-0 flex items-center justify-center gap-3 border-t" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                <span className="text-sm" style={{ color: colors.textSecondary }}>Aguardando atendimento</span>
                <button
                  onClick={handleOpenConversation}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  Assumir conversa
                </button>
              </div>
            )}

            {/* Input de mensagem */}
            {selectedConversation?.is_open && selectedConversation?.status !== 'pending' && (
            <div className="p-3 flex-shrink-0 relative" style={{ backgroundColor: colors.bgSecondary }}>
              {/* Indicador de resposta */}
              {replyingTo && (
                <div className="mb-2 rounded-lg px-3 py-2 flex items-center justify-between" style={{ backgroundColor: colors.bgTertiary }}>
                  <div className="flex-1">
                    <p className="text-emerald-500 text-xs font-medium mb-1">
                      Respondendo a {replyingTo.from_me ? 'você' : selectedConversation?.contact_name || selectedConversation?.phone}
                    </p>
                    <p className="text-gray-300 text-sm truncate">
                      {replyingTo.message_type === 'text' ? replyingTo.content : `[${replyingTo.message_type}]`}
                    </p>
                  </div>
                  <button
                    onClick={handleCancelReply}
                    className="ml-2 text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Indicador de digitando */}
              {getPresence(selectedConversation?.phone)?.presence === 'composing' && (
                <div className="mb-2 rounded-lg px-3 py-2 flex items-center" style={{ backgroundColor: colors.bgTertiary }}>
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                  <span className="ml-2 text-sm" style={{ color: colors.textSecondary }}>digitando...</span>
                </div>
              )}

              <div className="flex items-center rounded-lg px-4 py-2" style={{ backgroundColor: colors.bgTertiary }}>
                <div className="relative">
                  <button
                    onClick={() => setShowAttachmentMenu(!showAttachmentMenu)}
                    className="text-gray-400 hover:text-emerald-500 transition-colors mr-3"
                    title="Anexar"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>

                  {/* Menu de Anexos */}
                  {showAttachmentMenu && (
                    <div className="attachment-menu absolute bottom-full left-0 mb-2 rounded-lg shadow-lg py-2 z-10" style={{ backgroundColor: colors.bgTertiary, minWidth: '160px' }}>
                      {[['image','📷','Imagem'],['video','📹','Vídeo'],['audio','🎤','Áudio'],['document','📎','Documento'],['location','📍','Localização']].map(([type, icon, label]) => (
                        <div key={type} className="px-3 py-2 cursor-pointer hover:bg-[#1f2c34] flex items-center gap-2 whitespace-nowrap" style={{ color: colors.textSecondary }} onClick={() => handleAttachmentSelect(type)}>
                          <span>{icon}</span><span className="text-sm">{label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="text-gray-400 hover:text-emerald-500 transition-colors mr-3"
                  title="Emoji"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>

                <textarea
                  id="message-input"
                  ref={textareaRef}
                  rows={1}
                  placeholder={isRecording ? `Gravando... ${formatRecordingTime(recordingTime)}` : "Digite uma mensagem"}
                  value={messageInput}
                  onChange={e => {
                    handleMessageInputChange(e);
                    const el = e.target;
                    el.style.height = 'auto';
                    const maxH = 120; // ~5 linhas
                    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
                    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden';
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className={`flex-1 bg-transparent placeholder-gray-400 text-sm focus:outline-none resize-none leading-5 ${isRecording ? 'text-red-400' : ''}`}
                  style={{ color: isRecording ? undefined : colors.text, overflowY: 'hidden', minHeight: '20px', maxHeight: '120px' }}
                  disabled={isRecording}
                />

                <button
                  onClick={isRecording ? stopRecording : handleSendMessage}
                  className={`ml-3 transition-colors ${isRecording ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-emerald-500'}`}
                  title={isRecording ? 'Parar gravação' : 'Enviar'}
                >
                  {isRecording ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Input file oculto */}
              <input
                id="file-input"
                type="file"
                className="hidden"
                onChange={handleFileSelect}
                accept={
                  selectedAttachmentType === 'image' ? 'image/*' :
                  selectedAttachmentType === 'video' ? 'video/*' :
                  selectedAttachmentType === 'document' ? '*/*' : '*/*'
                }
              />

              {/* Emoji Picker */}
              {showEmojiPicker && (
                <div className="absolute bottom-20 left-4 z-[1000]" onClick={(e) => e.stopPropagation()}>
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    theme="dark"
                    lazyLoadEmojis={true}
                    width={350}
                    height={400}
                  />
                </div>
              )}
            </div>
            )}

            {/* Modal de Legenda */}
            {showCaptionModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="rounded-lg p-6 w-96" style={{ backgroundColor: colors.bgTertiary }}>
                  <h3 className="text-lg mb-4" style={{ color: colors.text }}>Adicionar legenda (opcional)</h3>
                  <textarea
                    value={captionInput}
                    onChange={(e) => setCaptionInput(e.target.value)}
                    placeholder="Digite uma legenda para o anexo..."
                    className="w-full rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    style={{ backgroundColor: colors.bgSecondary, color: colors.text, placeholderColor: colors.textSecondary }}
                    rows={3}
                  />
                  <div className="flex justify-end space-x-3 mt-4">
                    <button
                      onClick={() => {
                        setShowCaptionModal(false);
                        setCaptionInput('');
                      }}
                      className="px-4 py-2 transition-colors"
                      style={{ color: colors.textSecondary }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSendAttachment}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal de Encaminhar */}
            {showForwardModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="rounded-lg p-6 w-[600px] max-h-[80vh] flex flex-col" style={{ backgroundColor: colors.bgTertiary }}>
                  <h3 className="text-lg mb-4" style={{ color: colors.text }}>Encaminhar mensagem</h3>

                  {/* Buscador de contatos */}
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="Buscar contato..."
                      value={forwardSearchQuery}
                      onChange={(e) => setForwardSearchQuery(e.target.value)}
                      className="w-full rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      style={{ backgroundColor: colors.bgSecondary, color: colors.text, placeholderColor: colors.textSecondary }}
                    />
                  </div>

                  {/* Lista de contatos */}
                  <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                    {filteredConversationsForForward.map(conv => (
                      <div
                        key={conv.id}
                        onClick={() => {
                          setSelectedContactsToForward(prev => {
                            if (prev.includes(conv.id)) {
                              return prev.filter(id => id !== conv.id);
                            } else {
                              return [...prev, conv.id];
                            }
                          });
                        }}
                        className={`flex items-center p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedContactsToForward.includes(conv.id)
                            ? 'bg-emerald-600/30 border border-emerald-500'
                            : 'bg-[#202c33] hover:bg-[#1f2c34]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedContactsToForward.includes(conv.id)}
                          onChange={() => {}}
                          className="mr-3 w-4 h-4 accent-emerald-500"
                        />
                        <img
                          src={conv.profile_picture_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${conv.phone}`}
                          alt={conv.contact_name || conv.phone}
                          className="w-10 h-10 rounded-full mr-3"
                        />
                        <div className="flex-1">
                          <p className="font-medium" style={{ color: colors.text }}>{conv.contact_name || conv.phone}</p>
                          <p 
                            className="text-xs"
                            style={{ color: colors.textSecondary }}
                            dangerouslySetInnerHTML={{
                              __html: conv.last_message
                                ? (conv.last_message.message_type === 'text'
                                    ? formatWhatsAppText(conv.last_message.content)
                                    : `[${conv.last_message.message_type}]`)
                                : 'Sem mensagens'
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-between items-center">
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                      {selectedContactsToForward.length} contato(s) selecionado(s)
                    </p>
                    <div className="flex space-x-3">
                      <button
                        onClick={() => {
                          setShowForwardModal(false);
                          setMessageToForward(null);
                          setSelectedContactsToForward([]);
                          setForwardSearchQuery('');
                        }}
                        className="px-4 py-2 transition-colors"
                        style={{ color: colors.textSecondary }}
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={handleSendForward}
                        disabled={selectedContactsToForward.length === 0}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          selectedContactsToForward.length === 0
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-emerald-600 text-white hover:bg-emerald-700'
                        }`}
                      >
                        Encaminhar
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: colors.bg }}>
            <div className="text-center">
              <img src="/ico.png" alt="Analizap" className="w-32 h-32 mx-auto mb-4 opacity-50" />
              <h2 className="text-2xl font-light mb-2" style={{ color: colors.text }}>Analizap Web</h2>
              <p className="text-sm" style={{ color: colors.textSecondary }}>Selecione uma conversa para começar</p>
            </div>
          </div>
        )}
      </div>

      {/* Modal de seleção de tags */}
      {showTagModal && (
        <div className="fixed inset-0 bg-slate-900 bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-5 w-full max-w-md">
            <h3 className="text-base font-semibold text-slate-800 mb-4">Adicionar Tag</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {availableTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleAddTag(tag.id)}
                  disabled={!tag.is_active || conversationTags.some(ct => ct.id === tag.id)}
                  className={`w-full flex items-center p-3 rounded-lg border transition-colors ${
                    !tag.is_active || conversationTags.some(ct => ct.id === tag.id)
                      ? 'bg-slate-100 border-slate-200 cursor-not-allowed opacity-50'
                      : 'hover:bg-slate-50 border-slate-300 cursor-pointer'
                  }`}
                >
                  <div
                    className="w-4 h-4 rounded mr-3"
                    style={{ backgroundColor: tag.color }}
                  ></div>
                  <span className="text-slate-700 font-medium">{tag.name}</span>
                  {tag.description && (
                    <span className="text-slate-500 text-sm ml-2">- {tag.description}</span>
                  )}
                </button>
              ))}
              {availableTags.length === 0 && (
                <p className="text-center text-slate-500 text-sm py-4">
                  Nenhuma tag disponível. Crie tags em Configurações - Tags.
                </p>
              )}
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={() => setShowTagModal(false)}
                className="px-4 py-2 border border-slate-300 rounded-md text-sm hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Painel lateral do contato */}
      {showContactPanel && selectedConversation && (
        <>
          <div className="w-1 bg-[#111b21] cursor-col-resize hover:bg-emerald-500 transition-colors flex-shrink-0" />
          <ContactPanel
            conversation={selectedConversation}
            onClose={() => setShowContactPanel(false)}
            onUpdate={(updatedConversation) => {
              setSelectedConversation(updatedConversation);
              refreshConversations();
            }}
          />
        </>
      )}
    </div>
  );
}

export default Chat;
