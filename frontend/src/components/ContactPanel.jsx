import { useState, useEffect } from 'react';
import { X, User, Phone, Calendar, Clock } from 'lucide-react';
import { conversationsAPI } from '../services/api';
import { useTheme } from '../contexts/ThemeContext';

export default function ContactPanel({ conversation, onClose, onUpdate }) {
  const { colors } = useTheme();
  const [customName, setCustomName] = useState(conversation?.custom_name || '');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);

  useEffect(() => {
    setCustomName(conversation?.custom_name || '');
  }, [conversation]);

  const handleSaveCustomName = async () => {
    if (!conversation) return;

    setIsSaving(true);
    try {
      await conversationsAPI.updateContactName(conversation.id, customName);
      setIsEditing(false);
      // Chamar callback para atualizar a conversa
      if (onUpdate) {
        onUpdate({ ...conversation, custom_name });
      }
    } catch (error) {
      console.error('Erro ao salvar nome personalizado:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCustomName = async () => {
    if (!conversation) return;

    setIsSaving(true);
    try {
      await conversationsAPI.updateContactName(conversation.id, '');
      setCustomName('');
      setIsEditing(false);
      // Chamar callback para atualizar a conversa
      if (onUpdate) {
        onUpdate({ ...conversation, custom_name: '' });
      }
    } catch (error) {
      console.error('Erro ao deletar nome personalizado:', error);
    } finally {
      setIsSaving(false);
    }
  };

  if (!conversation) return null;

  const displayName = customName || conversation.contact_name || conversation.phone;

  return (
    <>
    <div className="h-full w-96 shadow-xl flex flex-col border-l" style={{ backgroundColor: colors.bg, borderColor: colors.border }}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
        <h2 className="font-semibold text-lg" style={{ color: colors.text }}>Informações do Contato</h2>
        <button
          onClick={onClose}
          className="transition-colors hover:text-emerald-500"
          style={{ color: colors.textSecondary }}
        >
          <X size={24} />
        </button>
      </div>

      {/* Avatar grande */}
      <div className="flex flex-col items-center py-8" style={{ backgroundColor: colors.bg }}>
        <div 
          className="w-32 h-32 rounded-full bg-emerald-600 flex items-center justify-center mb-4 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => conversation.profile_picture_url && setIsPhotoExpanded(true)}
        >
          {conversation.profile_picture_url ? (
            <img
              src={conversation.profile_picture_url}
              alt={displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-white text-4xl font-semibold" style={{ color: colors.text }}>
              {displayName?.charAt(0)?.toUpperCase() || '?'}
            </span>
          )}
        </div>
        <h3 className="text-xl font-semibold mb-1" style={{ color: colors.text }}>{displayName}</h3>
        <p className="text-sm" style={{ color: colors.textSecondary }}>{conversation.phone}</p>
      </div>

      {/* Informações */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* Nome Personalizado */}
          <div className="rounded-lg p-4" style={{ backgroundColor: colors.bgSecondary }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center" style={{ color: colors.textSecondary }}>
                <User size={18} className="mr-2" />
                <span className="text-sm">Nome Personalizado</span>
              </div>
              {customName && (
                <button
                  onClick={handleDeleteCustomName}
                  disabled={isSaving}
                  className="text-red-400 hover:text-red-300 text-xs transition-colors"
                >
                  {isSaving ? '...' : 'Remover'}
                </button>
              )}
            </div>
            {isEditing ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Digite o nome personalizado"
                  className="flex-1 text-sm px-3 py-2 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
                  autoFocus
                />
                <button
                  onClick={handleSaveCustomName}
                  disabled={isSaving || !customName.trim()}
                  className="bg-emerald-600 text-white px-3 py-2 rounded text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {isSaving ? '...' : 'Salvar'}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setCustomName(conversation?.custom_name || '');
                  }}
                  className="px-3 py-2 rounded text-sm transition-colors"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.textSecondary }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditing(true)}
                className="w-full text-left text-sm py-2 px-3 rounded transition-colors"
                style={{ backgroundColor: colors.bgTertiary, color: colors.text }}
              >
                {customName || 'Adicionar nome personalizado'}
              </button>
            )}
          </div>

          {/* Telefone */}
          <div className="rounded-lg p-4" style={{ backgroundColor: colors.bgSecondary }}>
            <div className="flex items-center mb-2" style={{ color: colors.textSecondary }}>
              <Phone size={18} className="mr-2" />
              <span className="text-sm">Telefone</span>
            </div>
            <p className="text-sm" style={{ color: colors.text }}>{conversation.phone}</p>
          </div>

          {/* Nome do Contato (WhatsApp) */}
          {conversation.contact_name && (
            <div className="rounded-lg p-4" style={{ backgroundColor: colors.bgSecondary }}>
              <div className="flex items-center mb-2" style={{ color: colors.textSecondary }}>
                <User size={18} className="mr-2" />
                <span className="text-sm">Nome no WhatsApp</span>
              </div>
              <p className="text-sm" style={{ color: colors.text }}>{conversation.contact_name}</p>
            </div>
          )}

          {/* Data de Criação */}
          <div className="rounded-lg p-4" style={{ backgroundColor: colors.bgSecondary }}>
            <div className="flex items-center mb-2" style={{ color: colors.textSecondary }}>
              <Calendar size={18} className="mr-2" />
              <span className="text-sm">Conversa criada em</span>
            </div>
            <p className="text-sm" style={{ color: colors.text }}>
              {new Date(conversation.created_at).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>

          {/* Última Mensagem */}
          {conversation.last_message_at && (
            <div className="rounded-lg p-4" style={{ backgroundColor: colors.bgSecondary }}>
              <div className="flex items-center mb-2" style={{ color: colors.textSecondary }}>
                <Clock size={18} className="mr-2" />
                <span className="text-sm">Última atividade</span>
              </div>
              <p className="text-sm" style={{ color: colors.text }}>
                {new Date(conversation.last_message_at).toLocaleDateString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>

      {/* Modal de foto expandida */}
      {isPhotoExpanded && conversation.profile_picture_url && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={() => setIsPhotoExpanded(false)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsPhotoExpanded(false);
            }}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
          >
            <X size={32} />
          </button>
          <img
            src={conversation.profile_picture_url}
            alt={displayName}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
