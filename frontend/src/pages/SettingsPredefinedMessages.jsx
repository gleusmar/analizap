import { useState, useEffect } from 'react';
import { predefinedMessagesAPI } from '../services/api';
import { useToast } from '../components/Toast';

function SettingsPredefinedMessages() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
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
          <div className="text-center py-8 text-gray-400 text-sm">
            Nenhuma mensagem pré-definida cadastrada
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className="flex items-center justify-between p-3 bg-[#111b21] border border-gray-700 rounded-lg hover:bg-[#202c33] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-white">{message.shortcut}</span>
                    <span className="text-xs text-gray-400">→</span>
                  </div>
                  <p className="text-sm text-gray-400 break-words whitespace-normal">{message.content}</p>
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
          <div className="bg-[#111b21] rounded-lg p-6 w-96 border border-gray-700">
            <h3 className="text-lg font-medium text-white mb-4">
              {selectedMessage ? 'Editar Mensagem' : 'Nova Mensagem'}
            </h3>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Atalho
                  </label>
                  <input
                    type="text"
                    value={formData.shortcut}
                    onChange={(e) => setFormData({ ...formData, shortcut: e.target.value })}
                    placeholder="/ola"
                    className="w-full border border-gray-600 bg-[#202c33] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">O atalho deve começar com /</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Conteúdo
                  </label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    placeholder="Olá! Como posso ajudar?"
                    className="w-full px-3 py-2 border border-gray-600 bg-[#202c33] text-white rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
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
