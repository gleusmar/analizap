import { useState, useEffect } from 'react';
import { predefinedMessagesAPI } from '../services/api';
import { useToast } from '../components/Toast';
import { useTheme } from '../contexts/ThemeContext';

function SettingsPredefinedMessages() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const { colors } = useTheme();
  const [showModal, setShowModal] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [formData, setFormData] = useState({
    shortcut: '',
    content: ''
  });

  const { success, error: showError } = useToast();

  useEffect(() => {
    fetchMessages();
  }, []);

  const fetchMessages = async () => {
    try {
      const response = await predefinedMessagesAPI.getAll();
      // A API retorna { data: { data: [...] } }, então precisamos acessar response.data.data
      setMessages(Array.isArray(response.data?.data) ? response.data.data : []);
    } catch (err) {
      showError('Erro ao carregar mensagens pré-definidas');
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedMessage(null);
    setFormData({
      shortcut: '',
      content: ''
    });
    setShowModal(true);
  };

  const handleEdit = (message) => {
    setSelectedMessage(message);
    setFormData({
      shortcut: message.shortcut,
      content: message.content
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta mensagem pré-definida?')) return;

    try {
      await predefinedMessagesAPI.delete(id);
      success('Mensagem pré-definida excluída com sucesso');
      fetchMessages();
    } catch (err) {
      showError(err.response?.data?.error || 'Erro ao excluir mensagem');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validar atalho (deve começar com /)
    if (!formData.shortcut.startsWith('/')) {
      showError('O atalho deve começar com /');
      return;
    }

    try {
      if (selectedMessage) {
        await predefinedMessagesAPI.update(selectedMessage.id, formData);
        success('Mensagem pré-definida atualizada com sucesso');
      } else {
        await predefinedMessagesAPI.create(formData);
        success('Mensagem pré-definida criada com sucesso');
      }
      setShowModal(false);
      fetchMessages();
    } catch (err) {
      showError(err.response?.data?.error || 'Erro ao salvar mensagem');
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400 text-sm">Carregando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-white">Mensagens Pré-Definidas</h3>
        <button
          onClick={handleCreate}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-emerald-700 transition-colors"
        >
          + Nova Mensagem
        </button>
      </div>

      <div className="space-y-2">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: colors.textSecondary }}>
            Nenhuma mensagem pré-definida cadastrada
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className="flex items-center justify-between p-3 border rounded-lg"
              style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}
            >
              <div className="flex-1 min-w-0">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium" style={{ color: colors.text }}>{message.shortcut}</span>
                    <span className="text-xs" style={{ color: colors.textSecondary }}>→</span>
                  </div>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>{message.content}</p>
                </div>
              </div>
              <div className="flex space-x-2 ml-4">
                <button
                  onClick={() => handleEdit(message)}
                  className="text-gray-400 hover:text-emerald-400 transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(message.id)}
                  className="text-gray-400 hover:text-red-400 transition-colors"
                >
                  Excluir
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="rounded-lg p-5 w-full max-w-md" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
            <h3 className="text-base font-semibold mb-4" style={{ color: colors.text }}>
              {selectedMessage ? 'Editar Mensagem' : 'Nova Mensagem'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium" style={{ color: colors.text }}>
                    Atalho
                  </label>
                  <input
                    type="text"
                    value={formData.shortcut}
                    onChange={(e) => setFormData({ ...formData, shortcut: e.target.value })}
                    placeholder="/ola"
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    style={{ backgroundColor: colors.bgTertiary, color: colors.text, borderColor: colors.border }}
                    required
                  />
                  <p className="text-xs" style={{ color: colors.textSecondary }}>O atalho deve começar com /</p>
                </div>
                <div>
                  <label className="block text-sm font-medium" style={{ color: colors.text }}>
                    Conteúdo
                  </label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Olá! Como posso ajudar?"
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    style={{ backgroundColor: colors.bgTertiary, color: colors.text, borderColor: colors.border }}
                    rows={4}
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPredefinedMessages;
