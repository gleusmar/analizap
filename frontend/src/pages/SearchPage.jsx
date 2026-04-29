import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, MessageCircle, Phone, ExternalLink, RefreshCw } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuthStore } from '../store/authStore';
import { conversationsAPI } from '../services/api';

const DATE_PRESETS = [
  { label: 'Últimos 7 dias', days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 3 meses', days: 90 },
  { label: 'Últimos 12 meses', days: 365 },
  { label: 'Este ano', days: null, thisYear: true },
  { label: 'Personalizado', days: null, custom: true },
];

function getDateRange(preset, customFrom, customTo) {
  const now = new Date();
  if (preset.custom) {
    return { from: customFrom, to: customTo };
  }
  if (preset.thisYear) {
    return {
      from: new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0],
      to: now.toISOString().split('T')[0],
    };
  }
  const from = new Date(now);
  from.setDate(from.getDate() - preset.days);
  return {
    from: from.toISOString().split('T')[0],
    to: now.toISOString().split('T')[0],
  };
}

export default function SearchPage() {
  const navigate = useNavigate();
  const { colors } = useTheme();
  const user = useAuthStore(s => s.user);

  const [query, setQuery] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(DATE_PRESETS[1]); // Últimos 30 dias
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = useCallback(async () => {
    if (!query.trim() || query.trim().length < 2) {
      setError('Digite ao menos 2 caracteres para buscar.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { from, to } = getDateRange(selectedPreset, customFrom, customTo);
      const resp = await conversationsAPI.search(query.trim(), from, to);
      setResults(resp.data.results || []);
    } catch (e) {
      setError('Erro ao buscar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [query, selectedPreset, customFrom, customTo]);

  const handleGoToConversation = async (conv, messageId = null, reopen = true) => {
    if (!conv.is_open && reopen) {
      await conversationsAPI.reopen(conv.id).catch(() => {});
    }
    navigate('/dashboard', { state: { openConversationId: conv.id, scrollToMessageId: messageId, viewOnly: !reopen && !conv.is_open } });
  };

  const formatDate = (ts) => {
    if (!ts) return '';
    return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const statusLabel = (s) => ({ open: 'Aberta', pending: 'Pendente', closed: 'Fechada' }[s] || s);
  const statusColor = (s) => ({ open: '#10b981', pending: '#f59e0b', closed: '#6b7280' }[s] || '#6b7280');

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: colors.bg, color: colors.text }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b flex-shrink-0" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
        <button onClick={() => navigate('/dashboard')} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity">
          <ArrowLeft size={20} style={{ color: colors.textSecondary }} />
        </button>
        <Search size={20} className="text-emerald-500" />
        <h1 className="text-lg font-semibold">Busca no Histórico</h1>
      </div>

      <div className="flex-1 overflow-auto p-6 max-w-3xl w-full mx-auto">
        {/* Filtro de datas */}
        <div className="mb-4">
          <p className="text-sm mb-2 font-medium" style={{ color: colors.textSecondary }}>Período</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {DATE_PRESETS.map(p => (
              <button
                key={p.label}
                onClick={() => setSelectedPreset(p)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor: selectedPreset.label === p.label ? '#059669' : colors.bgTertiary,
                  color: selectedPreset.label === p.label ? '#fff' : colors.textSecondary,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {selectedPreset.custom && (
            <div className="flex gap-3 mt-2">
              <div>
                <label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>De</label>
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text, borderColor: colors.border }} />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: colors.textSecondary }}>Até</label>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="rounded-lg px-3 py-1.5 text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text, borderColor: colors.border }} />
              </div>
            </div>
          )}
        </div>

        {/* Input de busca */}
        <div className="flex gap-2 mb-6">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textSecondary }} />
            <input
              type="text"
              placeholder="Buscar por nome, telefone, mensagem ou arquivo..."
              value={query}
              onChange={e => { setQuery(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full rounded-lg pl-9 pr-4 py-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-emerald-500"
              style={{ backgroundColor: colors.bgSecondary, color: colors.text, borderColor: colors.border }}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-5 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
            Buscar
          </button>
        </div>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Resultados */}
        {results !== null && (
          results.length === 0 ? (
            <div className="text-center py-12" style={{ color: colors.textSecondary }}>
              <Search size={40} className="mx-auto mb-3 opacity-30" />
              <p>Nenhum resultado encontrado</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm mb-3" style={{ color: colors.textSecondary }}>
                {results.length} conversa{results.length !== 1 ? 's' : ''} encontrada{results.length !== 1 ? 's' : ''}
              </p>
              {results.map(conv => (
                <div
                  key={conv.id}
                  className="rounded-xl p-4 border"
                  style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
                >
                  {/* Cabeçalho */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <img
                        src={conv.profile_picture_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${conv.phone}`}
                        alt={conv.contact_name}
                        className="w-9 h-9 rounded-full flex-shrink-0"
                      />
                      <div>
                        <p className="font-medium text-sm">{conv.contact_name || conv.phone}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Phone size={11} style={{ color: colors.textSecondary }} />
                          <span className="text-xs" style={{ color: colors.textSecondary }}>{conv.phone}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: statusColor(conv.status) + '22', color: statusColor(conv.status) }}>
                            {statusLabel(conv.status)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!conv.is_open && (
                        <button
                          onClick={() => handleGoToConversation(conv, null, false)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
                        >
                          <MessageCircle size={13} />
                          Apenas ver
                        </button>
                      )}
                      <button
                        onClick={() => handleGoToConversation(conv, null, true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{ backgroundColor: conv.is_open ? '#10b981' : '#059669', color: '#fff' }}
                      >
                        <ExternalLink size={13} />
                        {conv.is_open ? 'Ir para conversa' : 'Reabrir e ver'}
                      </button>
                    </div>
                  </div>

                  {/* Mensagens correspondentes */}
                  {conv.matched_messages.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: colors.border }}>
                      {conv.matched_messages.map(msg => (
                        <div key={msg.id} className="rounded-lg px-3 py-2 text-xs cursor-pointer hover:opacity-80 transition-opacity" style={{ backgroundColor: colors.bgTertiary }} onClick={() => handleGoToConversation(conv, msg.message_id || msg.id, true)}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="font-medium" style={{ color: colors.textSecondary }}>
                              {msg.from_me ? 'Você' : conv.contact_name}
                            </span>
                            <span style={{ color: colors.textSecondary }}>{formatDate(msg.timestamp)}</span>
                          </div>
                          <p className="line-clamp-2" style={{ color: colors.text }}>
                            {msg.message_type === 'text' ? msg.content : `[${msg.message_type}] ${msg.content || ''}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
