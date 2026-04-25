import { useState, useEffect } from 'react';
import { tagsAPI } from '../services/api';
import { useToast } from '../components/Toast';
import { useTheme } from '../contexts/ThemeContext';

function SettingsTags() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const { colors } = useTheme();
  const [showModal, setShowModal] = useState(false);
  const [selectedTag, setSelectedTag] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    color: '#0088cc',
    description: '',
    is_active: true
  });

  const { success, error: showError } = useToast();

  useEffect(() => {
    fetchTags();
  }, []);

  const fetchTags = async () => {
    try {
      const response = await tagsAPI.getAll();
      setTags(response.data);
    } catch (err) {
      showError('Erro ao carregar tags');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedTag(null);
    setFormData({
      name: '',
      color: '#0088cc',
      description: '',
      is_active: true
    });
    setShowModal(true);
  };

  const handleEdit = (tag) => {
    setSelectedTag(tag);
    setFormData({
      name: tag.name,
      color: tag.color,
      description: tag.description || '',
      is_active: tag.is_active
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir esta tag?')) return;

    try {
      await tagsAPI.delete(id);
      success('Tag excluída com sucesso');
      fetchTags();
    } catch (err) {
      showError(err.response?.data?.error || 'Erro ao excluir tag');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (selectedTag) {
        await tagsAPI.update(selectedTag.id, formData);
        success('Tag atualizada com sucesso');
      } else {
        await tagsAPI.create(formData);
        success('Tag criada com sucesso');
      }
      setShowModal(false);
      fetchTags();
    } catch (err) {
      showError(err.response?.data?.error || 'Erro ao salvar tag');
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400 text-sm">Carregando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-white">Gerenciar Tags</h3>
        <button
          onClick={handleCreate}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-emerald-700 transition-colors"
        >
          + Nova Tag
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: colors.border }}>
              <th className="text-left py-2 px-3 font-medium" style={{ color: colors.textSecondary }}>Nome</th>
              <th className="text-left py-2 px-3 font-medium" style={{ color: colors.textSecondary }}>Cor</th>
              <th className="text-left py-2 px-3 font-medium" style={{ color: colors.textSecondary }}>Descrição</th>
              <th className="text-left py-2 px-3 font-medium" style={{ color: colors.textSecondary }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.id} className="border-b hover:cursor-pointer transition-colors" style={{ borderColor: colors.border }}>
                <td className="py-2 px-3 font-medium" style={{ color: colors.text }}>{tag.name}</td>
                <td className="py-2 px-3">
                  <div className="flex items-center">
                    <div 
                      className="w-6 h-6 rounded mr-2 border border-gray-600"
                      style={{ backgroundColor: tag.color }}
                    ></div>
                    <span className="text-xs" style={{ color: colors.textSecondary }}>{tag.color}</span>
                  </div>
                </td>
                <td className="py-2 px-3" style={{ color: colors.textSecondary }}>{tag.description || '-'}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded text-xs border ${tag.is_active ? 'bg-emerald-600/30 text-emerald-400 border-emerald-500' : 'bg-red-600/30 text-red-400 border-red-500'}`}>
                    {tag.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex space-x-1">
                    <button
                      onClick={() => handleEdit(tag)}
                      className="p-1 text-gray-400 hover:text-emerald-400 hover:bg-emerald-600/30 rounded transition-colors"
                      title="Editar"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(tag.id)}
                      className="p-1 text-gray-400 hover:text-red-400 hover:bg-red-600/30 rounded transition-colors"
                      title="Excluir"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de Criar/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="rounded-lg p-5 w-full max-w-md border" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
            <h3 className="text-base font-semibold mb-4" style={{ color: colors.text }}>
              {selectedTag ? 'Editar Tag' : 'Nova Tag'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.text }}>Nome *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text, borderColor: colors.border }}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: colors.text }}>Cor</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-12 h-10 rounded border border-gray-600 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-600 bg-[#202c33] text-white rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="#0088cc"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-gray-600 bg-[#202c33] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  rows={3}
                />
              </div>
              {selectedTag && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="mr-2 h-4 w-4 text-emerald-500 focus:ring-emerald-500 border-gray-600 rounded"
                  />
                  <label htmlFor="is_active" className="text-xs font-medium text-gray-300">
                    Tag ativa
                  </label>
                </div>
              )}
              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 border border-gray-600 rounded-md text-sm hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-md text-sm hover:bg-emerald-700 transition-colors"
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

export default SettingsTags;
