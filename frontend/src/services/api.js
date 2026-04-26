import axios from 'axios';

// Usar VITE_API_URL se definido (produção), caso contrário usar proxy local (desenvolvimento)
let baseURL = import.meta.env.VITE_API_URL || '/api';

// Se VITE_API_URL está definido mas não termina com /api, adiciona
if (import.meta.env.VITE_API_URL && !baseURL.endsWith('/api')) {
  baseURL = baseURL.replace(/\/$/, '') + '/api';
}

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para adicionar token nas requisições
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth-storage');
    if (token) {
      try {
        const authData = JSON.parse(token);
        if (authData.state?.token) {
          config.headers.Authorization = `Bearer ${authData.state.token}`;
        }
      } catch (e) {
        console.error('Erro ao ler token do localStorage:', e);
      }
    }

    // Remover Content-Type padrão se for FormData (axios define automaticamente com boundary)
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para tratar erros de resposta
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expirado ou inválido
      localStorage.removeItem('auth-storage');
      window.location.href = '/login';
    } else if (error.response?.status === 403) {
      // Sessão expirada ou inválida
      const errorMessage = error.response?.data?.error || '';
      if (errorMessage.includes('Sessão') || errorMessage.includes('expirada') || errorMessage.includes('inválida')) {
        console.warn('Sessão expirada, redirecionando para login');
        localStorage.removeItem('auth-storage');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  logout: () => api.post('/auth/logout'),
  logoutAll: () => api.post('/auth/logout-all'),
  me: () => api.get('/auth/me')
};

export const usersAPI = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  resetPassword: (id, newPassword) => api.post(`/users/${id}/reset-password`, { new_password: newPassword }),
  toggleActive: (id) => api.patch(`/users/${id}/toggle-active`)
};

export const departmentsAPI = {
  getAll: () => api.get('/departments'),
  getById: (id) => api.get(`/departments/${id}`),
  create: (data) => api.post('/departments', data),
  update: (id, data) => api.put(`/departments/${id}`, data),
  delete: (id) => api.delete(`/departments/${id}`)
};

export const tagsAPI = {
  getAll: () => api.get('/tags'),
  getById: (id) => api.get(`/tags/${id}`),
  create: (data) => api.post('/tags', data),
  update: (id, data) => api.put(`/tags/${id}`, data),
  delete: (id) => api.delete(`/tags/${id}`),
  getByConversation: (conversationId) => api.get(`/tags/conversation/${conversationId}`),
  addToConversation: (conversationId, tagId) => api.post('/tags/conversation/add', { conversationId, tagId }),
  removeFromConversation: (conversationId, tagId) => api.delete(`/tags/conversation/${conversationId}/${tagId}`),
};

export const connectionAPI = {
  connect: (syncPeriodDays = null) => api.post('/whatsapp/connect', { syncPeriodDays }),
  disconnect: () => api.post('/whatsapp/disconnect'),
  getStatus: () => api.get('/whatsapp/status'),
  checkSession: () => api.get('/whatsapp/session'),
  getQR: () => api.get('/whatsapp/qr'),
  refreshQR: () => api.post('/whatsapp/qr/refresh'),
  saveSyncSettings: (syncHistory, syncPeriodDays) => api.post('/whatsapp/sync-settings', { syncHistory, syncPeriodDays }),
  loadSyncSettings: () => api.get('/whatsapp/sync-settings'),
};

export const predefinedMessagesAPI = {
  getAll: () => api.get('/predefined-messages'),
  create: (data) => api.post('/predefined-messages', data),
  update: (id, data) => api.put(`/predefined-messages/${id}`, data),
  delete: (id) => api.delete(`/predefined-messages/${id}`),
};

export const conversationsAPI = {
  getAll: () => api.get('/conversations'),
  getMessages: (conversationId, limit = 50, offset = 0) =>
    api.get(`/conversations/${conversationId}/messages`, { params: { limit, offset } }),
  markAsRead: (conversationId) => api.post(`/conversations/${conversationId}/read`),
  markMultipleAsRead: (conversationIds) => api.post('/conversations/mark-multiple-read', { conversationIds }),
  close: (conversationId) => api.post(`/conversations/${conversationId}/close`),
  open: (conversationId) => api.post(`/conversations/${conversationId}/open`),
  updateContactName: (conversationId, contactName) =>
    api.put(`/conversations/${conversationId}/contact-name`, { contactName }),
  sendMessage: (conversationId, content, messageType = 'text', metadata = {}) =>
    api.post(`/conversations/${conversationId}/send`, { content, messageType, metadata }),
  sendAttachment: (conversationId, file, caption = '') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('caption', caption);
    console.log('📤 Enviando anexo:', {
      conversationId,
      hasFile: !!file,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
      caption,
      formDataKeys: Array.from(formData.keys()),
      formDataEntries: Array.from(formData.entries()).map(([key, value]) => ({
        key,
        value: value instanceof File ? `File: ${value.name} (${value.size} bytes)` : value
      }))
    });
    // Não especificar Content-Type manualmente - o axios define automaticamente com o boundary correto
    return api.post(`/conversations/${conversationId}/attachment`, formData);
  },
  sendLocation: (conversationId, latitude, longitude) =>
    api.post(`/conversations/${conversationId}/location`, { latitude, longitude }),
  sendReaction: (conversationId, messageId, reaction) =>
    api.post(`/conversations/${conversationId}/reaction`, { messageId, reaction }),
  forwardMessage: (conversationId, messageId, targetConversationId) =>
    api.post(`/conversations/${conversationId}/forward`, { messageId, targetConversationId }),
  delete: (conversationId) => api.delete(`/conversations/${conversationId}`),
};

export default api;
