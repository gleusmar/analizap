import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Users, Phone, Edit2, Check, X, Trash2, MessageSquareX, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { conversationsAPI } from '../services/api';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 50;

export default function ContactsPage() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const user = useAuthStore(s => s.user);
  const toast = useToast();
  const isAdmin = user?.role === 'admin';

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmClearId, setConfirmClearId] = useState(null);

  useEffect(() => {
    setLoading(true);
    conversationsAPI.getAll()
      .then(r => {
        const convs = r.data.conversations || [];
        // Sort alphabetically
        convs.sort((a, b) => {
          const nameA = (a.custom_name || a.contact_name || a.phone).toLowerCase();
          const nameB = (b.custom_name || b.contact_name || b.phone).toLowerCase();
          return nameA.localeCompare(nameB);
        });
        setContacts(convs);
      })
      .catch(() => toast.error('Erro ao carregar contatos'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(c =>
      (c.custom_name || c.contact_name || '').toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q)
    );
  }, [contacts, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [searchQuery]);

  const startEdit = (conv) => {
    setEditingId(conv.id);
    setEditName(conv.custom_name || conv.contact_name || conv.phone);
  };

  const saveEdit = async (id) => {
    try {
      await conversationsAPI.updateContactName(id, editName.trim());
      setContacts(prev => prev.map(c =>
        c.id === id ? { ...c, custom_name: editName.trim(), contact_name: editName.trim() } : c
      ));
      setEditingId(null);
      toast.success('Nome atualizado');
    } catch {
      toast.error('Erro ao atualizar nome');
    }
  };

  const handleDelete = async (id) => {
    try {
      await conversationsAPI.delete(id);
      setContacts(prev => prev.filter(c => c.id !== id));
      setConfirmDeleteId(null);
      toast.success('Contato excluído');
    } catch {
      toast.error('Erro ao excluir contato');
    }
  };

  const handleClearMessages = async (id) => {
    try {
      await conversationsAPI.clearMessages(id);
      setConfirmClearId(null);
      toast.success('Mensagens removidas');
    } catch {
      toast.error('Erro ao limpar mensagens');
    }
  };

  const handleGoTo = async (conv) => {
    if (!conv.is_open) {
      await conversationsAPI.reopen(conv.id).catch(() => {});
    }
    navigate('/dashboard', { state: { openConversationId: conv.id } });
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const statusColor = (s) => ({ open: '#10b981', pending: '#f59e0b', closed: '#6b7280' }[s] || '#6b7280');
  const statusLabel = (s) => ({ open: 'Aberta', pending: 'Pendente', closed: 'Fechada' }[s] || '—');

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: colors.bg, color: colors.text }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b flex-shrink-0" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
        <button onClick={() => navigate('/dashboard')} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity">
          <ArrowLeft size={20} style={{ color: colors.textSecondary }} />
        </button>
        <Users size={20} className="text-emerald-500" />
        <h1 className="text-lg font-semibold">Contatos</h1>
        <span className="ml-1 text-sm" style={{ color: colors.textSecondary }}>({filtered.length})</span>
      </div>

      {/* Search bar */}
      <div className="px-6 py-3 border-b flex-shrink-0" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
        <div className="relative max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
          <input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full rounded-lg pl-9 pr-4 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-500"
            style={{ backgroundColor: colors.bgTertiary, color: colors.text, borderColor: colors.border }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : paged.length === 0 ? (
          <div className="text-center py-16" style={{ color: colors.textSecondary }}>
            <Users size={40} className="mx-auto mb-3 opacity-30" />
            <p>Nenhum contato encontrado</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
                <th className="text-left px-6 py-3 font-medium" style={{ color: colors.textSecondary }}>Contato</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: colors.textSecondary }}>Telefone</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell" style={{ color: colors.textSecondary }}>Status</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell" style={{ color: colors.textSecondary }}>Criação</th>
                <th className="text-left px-4 py-3 font-medium hidden xl:table-cell" style={{ color: colors.textSecondary }}>Última atividade</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: colors.textSecondary }}>Tags</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {paged.map(conv => (
                <tr key={conv.id} className="border-b hover:opacity-90 transition-opacity" style={{ borderColor: colors.border }}>
                  {/* Nome + avatar */}
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={conv.profile_picture_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${conv.phone}`}
                        alt={conv.contact_name}
                        className="w-8 h-8 rounded-full flex-shrink-0"
                      />
                      {editingId === conv.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveEdit(conv.id); if (e.key === 'Escape') setEditingId(null); }}
                            className="rounded px-2 py-1 text-sm border focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            style={{ backgroundColor: colors.bgTertiary, color: colors.text, borderColor: colors.border }}
                          />
                          <button onClick={() => saveEdit(conv.id)} className="text-emerald-500 hover:opacity-70"><Check size={14} /></button>
                          <button onClick={() => setEditingId(null)} className="text-red-400 hover:opacity-70"><X size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{conv.custom_name || conv.contact_name || conv.phone}</span>
                          <button onClick={() => startEdit(conv)} className="opacity-40 hover:opacity-100 transition-opacity">
                            <Edit2 size={12} style={{ color: colors.textSecondary }} />
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  {/* Telefone */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      <Phone size={12} style={{ color: colors.textSecondary }} />
                      <span style={{ color: colors.textSecondary }}>{conv.phone}</span>
                    </div>
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: statusColor(conv.status) + '22', color: statusColor(conv.status) }}>
                      {statusLabel(conv.status)}
                    </span>
                  </td>
                  {/* Criação */}
                  <td className="px-4 py-3 hidden lg:table-cell text-xs" style={{ color: colors.textSecondary }}>
                    {formatDate(conv.created_at)}
                  </td>
                  {/* Última atividade */}
                  <td className="px-4 py-3 hidden xl:table-cell text-xs" style={{ color: colors.textSecondary }}>
                    {formatDate(conv.last_message_at)}
                  </td>
                  {/* Tags */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(conv.conversation_tags || conv.tags || []).slice(0, 3).map((ct, i) => {
                        const tag = ct.tags || ct;
                        return tag ? (
                          <span key={i} className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: tag.color + '33', color: tag.color }}>
                            {tag.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  </td>
                  {/* Ações */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => handleGoTo(conv)}
                        className="p-1.5 rounded-lg hover:bg-emerald-500/10 transition-colors"
                        title={conv.is_open ? 'Ir para conversa' : 'Reabrir conversa'}
                      >
                        <ExternalLink size={15} className="text-emerald-500" />
                      </button>
                      {isAdmin && (
                        <>
                          {confirmClearId === conv.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs" style={{ color: colors.textSecondary }}>Limpar?</span>
                              <button onClick={() => handleClearMessages(conv.id)} className="text-emerald-500 hover:opacity-70"><Check size={13} /></button>
                              <button onClick={() => setConfirmClearId(null)} className="text-red-400 hover:opacity-70"><X size={13} /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmClearId(conv.id)}
                              className="p-1.5 rounded-lg hover:bg-yellow-500/10 transition-colors"
                              title="Limpar mensagens"
                            >
                              <MessageSquareX size={15} className="text-yellow-500" />
                            </button>
                          )}
                          {confirmDeleteId === conv.id ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs" style={{ color: colors.textSecondary }}>Excluir?</span>
                              <button onClick={() => handleDelete(conv.id)} className="text-emerald-500 hover:opacity-70"><Check size={13} /></button>
                              <button onClick={() => setConfirmDeleteId(null)} className="text-red-400 hover:opacity-70"><X size={13} /></button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(conv.id)}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                              title="Excluir contato"
                            >
                              <Trash2 size={15} className="text-red-400" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-4 border-t flex-shrink-0" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-emerald-500/10 transition-colors">
            <ChevronLeft size={16} style={{ color: colors.textSecondary }} />
          </button>
          <span className="text-sm" style={{ color: colors.textSecondary }}>
            Página {currentPage} de {totalPages}
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-emerald-500/10 transition-colors">
            <ChevronRight size={16} style={{ color: colors.textSecondary }} />
          </button>
        </div>
      )}
    </div>
  );
}
