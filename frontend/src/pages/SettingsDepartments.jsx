import { useState, useEffect } from 'react';
import { departmentsAPI } from '../services/api';
import { useToast } from '../components/Toast';
import { useTheme } from '../contexts/ThemeContext';

function SettingsDepartments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const { colors } = useTheme();
  const [showModal, setShowModal] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_active: true
  });

  const { success, error: showError } = useToast();

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const response = await departmentsAPI.getAll();
      setDepartments(response.data);
    } catch (err) {
      showError('Erro ao carregar departamentos');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedDepartment(null);
    setFormData({
      name: '',
      description: '',
      is_active: true
    });
    setShowModal(true);
  };

  const handleEdit = (department) => {
    setSelectedDepartment(department);
    setFormData({
      name: department.name,
      description: department.description || '',
      is_active: department.is_active
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este departamento?')) return;

    try {
      await departmentsAPI.delete(id);
      success('Departamento excluído com sucesso');
      fetchDepartments();
    } catch (err) {
      showError(err.response?.data?.error || 'Erro ao excluir departamento');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (selectedDepartment) {
        await departmentsAPI.update(selectedDepartment.id, formData);
        success('Departamento atualizado com sucesso');
      } else {
        await departmentsAPI.create(formData);
        success('Departamento criado com sucesso');
      }
      setShowModal(false);
      fetchDepartments();
    } catch (err) {
      showError(err.response?.data?.error || 'Erro ao salvar departamento');
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400 text-sm">Carregando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-white">Gerenciar Departamentos</h3>
        <button
          onClick={handleCreate}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-emerald-700 transition-colors"
        >
          + Novo Departamento
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b" style={{ borderColor: colors.border }}>
              <th className="text-left py-2 px-3 font-medium" style={{ color: colors.textSecondary }}>Nome</th>
              <th className="text-left py-2 px-3 font-medium" style={{ color: colors.textSecondary }}>Descrição</th>
              <th className="text-left py-2 px-3 font-medium" style={{ color: colors.textSecondary }}>Status</th>
              <th className="text-left py-2 px-3 font-medium" style={{ color: colors.textSecondary }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {departments.map((dept) => (
              <tr key={dept.id} className="border-b hover:cursor-pointer transition-colors" style={{ borderColor: colors.border }}>
                <td className="py-2 px-3 font-medium" style={{ color: colors.text }}>{dept.name}</td>
                <td className="py-2 px-3" style={{ color: colors.textSecondary }}>{dept.description || '-'}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded text-xs border ${dept.is_active ? 'bg-emerald-600/30 text-emerald-400 border-emerald-500' : 'bg-red-600/30 text-red-400 border-red-500'}`}>
                    {dept.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex space-x-1">
                    <button
                      onClick={() => handleEdit(dept)}
                      className="p-1 text-gray-400 hover:text-emerald-400 hover:bg-emerald-600/30 rounded transition-colors"
                      title="Editar"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(dept.id)}
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
              {selectedDepartment ? 'Editar Departamento' : 'Novo Departamento'}
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
                <label className="block text-xs font-medium mb-1" style={{ color: colors.text }}>Descrição</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  style={{ backgroundColor: colors.bgTertiary, color: colors.text, borderColor: colors.border }}
                  rows={3}
                />
              </div>
              {selectedDepartment && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="mr-2 h-4 w-4 text-emerald-500 focus:ring-emerald-500 border-gray-600 rounded"
                  />
                  <label htmlFor="is_active" className="text-xs font-medium text-gray-300">
                    Departamento ativo
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

export default SettingsDepartments;
