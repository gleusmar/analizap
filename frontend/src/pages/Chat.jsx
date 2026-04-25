import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, CheckSquare, Square, Loader2, ArrowUpDown, Sun, Moon } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { authAPI, tagsAPI, conversationsAPI, predefinedMessagesAPI } from '../services/api';
import { useToast } from '../components/Toast';
import { useConversations, useConversationMessages } from '../hooks/useConversations';
import { useWhatsApp } from '../hooks/useWhatsApp';
import { MessageBubble } from '../components/MessageBubble';
import ContactPanel from '../components/ContactPanel';
import EmojiPicker from 'emoji-picker-react';
import { useTheme } from '../contexts/ThemeContext';

function Chat() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const toast = useToast();
  const { isDark, toggleTheme } = useTheme();

  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [isResizing, setIsResizing] = useState(false);
  const [activeTab, setActiveTab] = useState('open');
  const [searchQuery, setSearchQuery] = useState('');
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

  // Hooks para dados reais
  const { conversations, loading: loadingConversations, refresh: refreshConversations } = useConversations();
  const { messages, loading: loadingMessages, refresh: refreshMessages, hasMore, loadMore } = useConversationMessages(selectedConversation?.id);

  // Integrar com Socket.io para receber mensagens em tempo real
  const handleMessageReceived = useCallback((conversationId, message, isTemp = false) => {
    // Com a nova abordagem, não precisamos mais de mensagens temporárias
    // As mensagens são salvas imediatamente com ID temporário e o real_message_id é atualizado em background
    // Basta adicionar a mensagem ao socketMessages
    setSocketMessages(prev => {
      const convMessages = prev[conversationId] || [];
      // Verifica se já existe uma mensagem com o mesmo message_id
      const existingIndex = convMessages.findIndex(m => m.message_id === message.message_id);

      if (existingIndex >= 0) {
        // Substitui a mensagem existente (caso o real_message_id tenha sido atualizado)
        const updated = [...convMessages];
        updated[existingIndex] = message;
        return {
          ...prev,
          [conversationId]: updated
        };
      } else {
        // Adiciona nova mensagem
        return {
          ...prev,
          [conversationId]: [...convMessages, message]
        };
      }
    });

    // Invalida cache para a próxima atualização
    const cacheKey = `messages_${conversationId}`;
    localStorage.removeItem(cacheKey);
    localStorage.removeItem(`${cacheKey}_time`);

    // Invalidar cache da lista de conversas
    localStorage.removeItem('conversations_list');
    localStorage.removeItem('conversations_list_time');

    // Sempre atualiza a lista de conversas do servidor
    refreshConversations();
  }, [selectedConversation?.id, refreshConversations]);

  // Callback para atualização de status de mensagem
  const handleMessageStatusUpdate = useCallback((messageId, status) => {
    console.log('Status de mensagem atualizado:', { messageId, status });

    // Invalidar cache das mensagens para forçar recarregamento
    if (selectedConversation?.id) {
      const cacheKey = `messages_${selectedConversation.id}`;
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(`${cacheKey}_time`);

      // Limpar socketMessages ao recarregar
      setSocketMessages(prev => ({
        ...prev,
        [selectedConversation.id]: []
      }));

      refreshMessages();
    }

    // Remover mensagem otimista se existir (mensagem foi confirmada pelo backend)
    setOptimisticMessages(prev => {
      const convMessages = prev[selectedConversation?.id] || [];
      const hasOptimistic = convMessages.some(m => m.message_id === messageId);
      if (hasOptimistic) {
        return {
          ...prev,
          [selectedConversation?.id]: convMessages.filter(m => m.message_id !== messageId)
        };
      }
      return prev;
    });

    // Recarregar mensagens se a conversa estiver aberta
    if (selectedConversation?.id) {
      refreshMessages();
    }
  }, [selectedConversation?.id, refreshMessages]);

  // Callback para atualização de mensagem (quando mídia é processada)
  const handleMessageUpdated = useCallback((conversationId, messageId, content) => {
    console.log('Mensagem atualizada (mídia processada):', { conversationId, messageId, content });

    if (conversationId === selectedConversation?.id) {
      // Invalidar cache e recarregar para mostrar a imagem processada
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

  // Desativar loading quando mensagens carregarem
  useEffect(() => {
    if (!loadingMessages && selectedConversation) {
      setLoadingConversation(false);
    }
  }, [loadingMessages, selectedConversation]);

  const { connectionStatus } = useWhatsApp(handleMessageReceived, handleMessageStatusUpdate, handleMessageUpdated);

  // Função para scrollar para o final
  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, []);

  // Detectar se está no final do scroll e lazy loading ao rolar para o topo
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const threshold = 100; // 100px de tolerância
      setIsAtBottom(scrollHeight - scrollTop - clientHeight < threshold);

      // Lazy loading: carregar mais mensagens quando rolar até 80% do topo
      const scrollPercentage = scrollTop / (scrollHeight - clientHeight);
      if (scrollPercentage > 0.8 && hasMore && !loadingMessages) {
        console.log('Lazy loading triggered', { scrollPercentage, hasMore, loadingMessages });
        loadMore();
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMessages, loadMore]);

  // Scrollar para o final quando a conversa é selecionada
  useEffect(() => {
    if (selectedConversation) {
      setTimeout(scrollToBottom, 100);
    }
  }, [selectedConversation, scrollToBottom]);

  // Scrollar para o final quando mensagens mudam (se estiver no final)
  useEffect(() => {
    if (isAtBottom && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, isAtBottom, scrollToBottom]);

  // Carregar tags disponíveis e tags de todas as conversas
  useEffect(() => {
    fetchTags();
    fetchPredefinedMessages();
  }, []);

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
    setLoadingConversation(true);

    // Limpar mensagens otimistas da conversa anterior
    if (selectedConversation?.id !== conversation.id) {
      setOptimisticMessages(prev => ({
        ...prev,
        [selectedConversation?.id]: []
      }));
    }

    // Se a conversa estiver em conversationsWithTags, use ela (tem tags carregadas)
    const conversationWithTags = conversationsWithTags.find(c => c.id === conversation.id);
    const selected = conversationWithTags || conversation;
    setSelectedConversation(selected);

    // Abrir conversa no backend (atualiza nome do contato)
    try {
      await conversationsAPI.open(selected.id);
    } catch (error) {
      console.error('Erro ao abrir conversa:', error);
    }

    // Marcar mensagens como lidas instantaneamente (remove bubble antes da confirmação)
    if (selected.unread_count > 0) {
      // Atualiza localmente para remover o bubble imediatamente
      setConversationsWithTags(prev => prev.map(conv =>
        conv.id === selected.id ? { ...conv, unread_count: 0 } : conv
      ));

      // Envia confirmação em background
      conversationsAPI.markAsRead(selected.id)
        .then(() => {
          console.log('Conversa marcada como lida no servidor');
        })
        .catch(error => {
          console.error('Erro ao marcar mensagens como lidas:', error);
          // Se falhar, recarrega para restaurar o estado correto
          refreshConversations();
        });
    }
  };

  const handleCloseConversation = () => {
    if (!selectedConversation) return;

    const updatedConversations = conversationsWithTags.map(conv =>
      conv.id === selectedConversation.id
        ? { ...conv, is_open: false }
        : conv
    );
    setConversationsWithTags(updatedConversations);
    setSelectedConversation(null);
  };

  const handleOpenConversation = () => {
    if (!selectedConversation) return;

    const updatedConversations = conversationsWithTags.map(conv =>
      conv.id === selectedConversation.id
        ? { ...conv, is_open: true }
        : conv
    );
    setConversationsWithTags(updatedConversations);
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

    const updatedConversations = conversationsWithTags.map(conv =>
      conv.id === selectedConversation.id
        ? {
            ...conv,
            is_pinned: isPinned,
            pinned_at: pinnedAt
          }
        : conv
    );
    setConversationsWithTags(updatedConversations);
    const updatedSelected = updatedConversations.find(c => c.id === selectedConversation.id);
    if (updatedSelected) {
      setSelectedConversation(updatedSelected);
    }
    toast.success(updatedSelected.is_pinned ? 'Conversa fixada' : 'Conversa desafixada');
  };

  // Filtrar conversas por aba e busca
  const filteredConversations = useMemo(() => {
    // Sempre usar conversationsWithTags (já é inicializado com conversations ou array vazio)
    const conversationsToFilter = conversationsWithTags;
    return conversationsToFilter
      .filter(conv => {
        // Filtrar por aba
        if (activeTab === 'open' && !conv.is_open) return false;
        if (activeTab === 'closed' && conv.is_open) return false;

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
      });
  }, [conversationsWithTags, activeTab, searchQuery, sortOrder]);

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

    const combined = [...messages, ...uniqueSocketFinal, ...uniqueOptimistic];
    // Ordenar por timestamp (mais antigas primeiro)
    return combined.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [messages, optimisticMessages, socketMessages, selectedConversation?.id]);

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
  const handleEmojiClick = (emojiData) => {
    setMessageInput(prev => prev + emojiData.emoji);
    setShowEmojiPicker(false);
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

    const tempMessageId = `temp_${Date.now()}`;
    const file = attachmentFile;
    const caption = captionInput;

    // Fechar modal imediatamente
    setShowCaptionModal(false);
    setCaptionInput('');
    setAttachmentFile(null);

    // Adicionar mensagem otimista com loading
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

    try {
      // Enviar em background
      const formData = new FormData();
      formData.append('file', file);
      formData.append('caption', caption);
      await conversationsAPI.sendAttachment(selectedConversation.id, formData);
      // A mensagem definitiva chegará via Socket.io
    } catch (error) {
      console.error('Erro ao enviar anexo:', error);
      // Remover mensagem otimista em caso de erro
      setOptimisticMessages(prev => ({
        ...prev,
        [selectedConversation.id]: (prev[selectedConversation.id] || []).filter(m => m.message_id !== tempMessageId)
      }));
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
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };

        try {
          await conversationsAPI.sendLocation(selectedConversation.id, location);
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

  // Lidar com mudança no input de mensagem (verificar atalhos)
  const handleMessageInputChange = (e) => {
    const value = e.target.value;
    setMessageInput(value);

    const words = value.split(' ');
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith('/')) {
      const predefinedMessage = predefinedMessages.find(msg => msg.shortcut === lastWord);
      if (predefinedMessage) {
        const newMessage = words.slice(0, -1).join(' ') + ' ' + predefinedMessage.content;
        setMessageInput(newMessage);
      }
    }
  };

  // Enviar mensagem
  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConversation) return;

    const messageContent = messageInput.trim();
    const metadata = replyingTo ? {
      quoted: replyingTo
    } : {};

    // Limpar o input e a resposta
    setMessageInput('');
    setReplyingTo(null);

    try {
      // Enviar para o servidor (o backend vai emitir a mensagem via Socket.io)
      await conversationsAPI.sendMessage(selectedConversation.id, messageContent, 'text', metadata);
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      // Restaurar o input em caso de erro
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
      <div className="w-[60px] bg-[#111b21] flex flex-col items-center py-3 flex-shrink-0">
        {/* Status da conexão */}
        <div className="mb-6">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            title={connectionStatus === 'connected' ? 'Conectado' : 'Desconectado'}
          >
            {connectionStatus === 'connected' ? (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
        </div>

        <div className="flex-1"></div>

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
        className="bg-[#111b21] flex flex-col flex-shrink-0"
        style={{ width: `${sidebarWidth}px` }}
      >
        {/* Header com logo e busca */}
        <div className="p-3 bg-[#202c33]">
          <div className="flex items-center mb-3">
            <img src="/ico.png" alt="Analizap" className="w-8 h-8 mr-2" />
            <h1 className="text-white text-lg font-semibold">Analizap</h1>
          </div>
          <div className="flex space-x-2 mb-3">
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-[#2a3942] text-white placeholder-gray-500 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={toggleMultiSelectMode}
              className={`px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                isMultiSelectMode ? 'bg-emerald-600 text-white' : 'bg-[#111b21] text-gray-400 hover:text-white'
              }`}
              title={isMultiSelectMode ? 'Sair do modo de seleção' : 'Seleção múltipla'}
            >
              {isMultiSelectMode ? <CheckSquare size={18} /> : <Square size={18} />}
            </button>
            <button
              onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
              className={`px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
                sortOrder === 'desc' ? 'bg-emerald-600 text-white' : 'bg-[#111b21] text-gray-400 hover:text-white'
              }`}
              title={`Ordenar: ${sortOrder === 'desc' ? 'Mais recente primeiro' : 'Mais antiga primeiro'}`}
            >
              <ArrowUpDown size={18} />
            </button>
          </div>
          <div className="flex space-x-2 mb-3">
            <button
              onClick={() => setActiveTab('open')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'open' ? 'bg-emerald-600 text-white' : 'bg-[#111b21] text-gray-400 hover:text-white'
              }`}
            >
              Abertas
            </button>
            <button
              onClick={() => setActiveTab('closed')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'closed' ? 'bg-emerald-600 text-white' : 'bg-[#111b21] text-gray-400 hover:text-white'
              }`}
            >
              Fechadas
            </button>
            <button
              onClick={() => setActiveTab('all')}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'all' ? 'bg-emerald-600 text-white' : 'bg-[#111b21] text-gray-400 hover:text-white'
              }`}
            >
              Todas
            </button>
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
          <div className="px-3 py-2 bg-[#202c33] text-xs text-gray-400">
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
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
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
                className={`flex items-center p-3 hover:bg-[#202c33] cursor-pointer transition-colors border-l-2 ${
                  selectedConversation?.id === conversation.id && !isMultiSelectMode ? 'bg-[#2a3942]' : ''
                } ${selectedConversations.has(conversation.id) && isMultiSelectMode ? 'bg-[#2a3942]' : ''} ${borderColor}`}
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
                      <h3 className="text-white font-medium truncate">{conversation.contact_name || conversation.phone}</h3>
                    </div>
                    <div className="flex items-center">
                      {conversation.tags && conversation.tags.length > 0 && (
                        <div className="flex mr-2">
                          {conversation.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-1.5 py-0.5 rounded mr-1"
                              style={{ backgroundColor: tag.color + '40', color: tag.color }}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {conversation.last_message?.timestamp && (
                        <span className="text-xs text-gray-400">
                          {formatDateTime(conversation.last_message.timestamp)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-gray-400 text-sm truncate">{renderLastMessage(conversation)}</p>
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
        className="w-1 bg-[#111b21] cursor-col-resize hover:bg-emerald-500 transition-colors flex-shrink-0"
        onMouseDown={handleMouseDown}
      />

      {/* Coluna Direita (Conversa) */}
      <div className={`flex-1 flex flex-col bg-[#0b141a] ${showContactPanel ? '' : ''}`}>
        {selectedConversation ? (
          <>
            {/* Header da conversa */}
            <div className="flex items-center justify-between p-3 bg-[#202c33] flex-shrink-0">
              <div className="flex items-center flex-1 cursor-pointer" onClick={() => setShowContactPanel(true)}>
                <img
                  src={selectedConversation.profile_picture_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedConversation.phone}`}
                  alt={selectedConversation.contact_name || selectedConversation.phone}
                  className="w-10 h-10 rounded-full mr-3"
                />
                <div className="flex-1">
                  <div className="flex items-center mb-1">
                    <h3 className="text-white font-medium">{selectedConversation.contact_name || selectedConversation.phone}</h3>
                    {conversationTags.length > 0 && (
                      <div className="flex ml-2">
                        {conversationTags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="text-xs px-1.5 py-0.5 rounded mr-1 flex items-center"
                            style={{ backgroundColor: tag.color + '40', color: tag.color }}
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
                    className="bg-[#2a3942] text-white placeholder-gray-400 rounded-lg py-1.5 pl-8 pr-4 text-xs w-40 focus:outline-none"
                  />
                  <svg className="w-4 h-4 text-gray-400 absolute left-2.5 top-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

            {/* Área de mensagens */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-4 bg-[#0b141a]">
              {loadingConversation ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                </div>
              ) : messagesWithDateBubbles.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  Nenhuma mensagem encontrada
                </div>
              ) : (
                <>
                  {messagesWithDateBubbles.map(item => {
                    if (item.type === 'date') {
                      return (
                        <div key={item.id} className="flex justify-center my-4">
                          <span className="bg-[#1f2c34] text-gray-400 text-xs px-3 py-1 rounded-full">
                            {item.date}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <MessageBubble
                        key={item.id}
                        message={item.message}
                        isMe={item.message.from_me}
                        onReact={handleReact}
                        onForward={handleForward}
                        onReply={handleReply}
                        onScrollToMessage={scrollToMessage}
                      />
                    );
                  })}
                </>
              )}
            </div>

            {/* Input de mensagem */}
            <div className="p-3 bg-[#202c33] flex-shrink-0 relative">
              {/* Indicador de resposta */}
              {replyingTo && (
                <div className="mb-2 bg-[#2a3942] rounded-lg px-3 py-2 flex items-center justify-between">
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

              <div className="flex items-center bg-[#2a3942] rounded-lg px-4 py-2">
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
                    <div className="attachment-menu absolute bottom-full left-0 mb-2 bg-[#2a3942] rounded-lg shadow-lg py-2 z-10">
                      <div className="px-3 py-2 hover:bg-[#1f2c34] cursor-pointer text-gray-300 hover:text-white" onClick={() => handleAttachmentSelect('image')}>
                        📷 Imagem
                      </div>
                      <div className="px-3 py-2 hover:bg-[#1f2c34] cursor-pointer text-gray-300 hover:text-white" onClick={() => handleAttachmentSelect('video')}>
                        📹 Vídeo
                      </div>
                      <div className="px-3 py-2 hover:bg-[#1f2c34] cursor-pointer text-gray-300 hover:text-white" onClick={() => handleAttachmentSelect('audio')}>
                        🎤 Áudio
                      </div>
                      <div className="px-3 py-2 hover:bg-[#1f2c34] cursor-pointer text-gray-300 hover:text-white" onClick={() => handleAttachmentSelect('document')}>
                        📎 Documento
                      </div>
                      <div className="px-3 py-2 hover:bg-[#1f2c34] cursor-pointer text-gray-300 hover:text-white" onClick={() => handleAttachmentSelect('location')}>
                        📍 Localização
                      </div>
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

                <input
                  id="message-input"
                  type="text"
                  placeholder={isRecording ? `Gravando... ${formatRecordingTime(recordingTime)}` : "Digite uma mensagem"}
                  value={messageInput}
                  onChange={handleMessageInputChange}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  className={`flex-1 bg-transparent text-white placeholder-gray-400 text-sm focus:outline-none ${isRecording ? 'text-red-400' : ''}`}
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
                <div className="absolute bottom-20 left-4 z-50">
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

            {/* Modal de Legenda */}
            {showCaptionModal && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-[#2a3942] rounded-lg p-6 w-96">
                  <h3 className="text-white text-lg mb-4">Adicionar legenda (opcional)</h3>
                  <textarea
                    value={captionInput}
                    onChange={(e) => setCaptionInput(e.target.value)}
                    placeholder="Digite uma legenda para o anexo..."
                    className="w-full bg-[#202c33] text-white placeholder-gray-400 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    rows={3}
                  />
                  <div className="flex justify-end space-x-3 mt-4">
                    <button
                      onClick={() => {
                        setShowCaptionModal(false);
                        setCaptionInput('');
                        setAttachmentFile(null);
                      }}
                      className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
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
                <div className="bg-[#2a3942] rounded-lg p-6 w-[600px] max-h-[80vh] flex flex-col">
                  <h3 className="text-white text-lg mb-4">Encaminhar mensagem</h3>

                  {/* Buscador de contatos */}
                  <div className="mb-4">
                    <input
                      type="text"
                      placeholder="Buscar contato..."
                      value={forwardSearchQuery}
                      onChange={(e) => setForwardSearchQuery(e.target.value)}
                      className="w-full bg-[#202c33] text-white placeholder-gray-400 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                          <p className="text-white font-medium">{conv.contact_name || conv.phone}</p>
                          <p 
                            className="text-gray-400 text-xs"
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
                    <p className="text-gray-400 text-sm">
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
                        className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
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
          <div className="flex-1 flex items-center justify-center bg-[#0b141a]">
            <div className="text-center">
              <img src="/ico.png" alt="Analizap" className="w-32 h-32 mx-auto mb-4 opacity-50" />
              <h2 className="text-white text-2xl font-light mb-2">Analizap Web</h2>
              <p className="text-gray-400 text-sm">Selecione uma conversa para começar</p>
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
