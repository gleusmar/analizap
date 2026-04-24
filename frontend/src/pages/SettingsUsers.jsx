import { useState, useEffect } from 'react';
import { usersAPI, departmentsAPI } from '../services/api';
import { useToast } from '../components/Toast';

function SettingsUsers() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    nickname: '',
    password: '',
    role: 'atendente',
    department_id: '',
    is_active: true
  });
  const [resetPassword, setResetPassword] = useState('');

  const { success, error: showError } = useToast();

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await usersAPI.getAll();
      setUsers(response.data);
    } catch (err) {
      showError('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const response = await departmentsAPI.getAll();
      setDepartments(response.data);
    } catch (err) {
      showError('Erro ao carregar departamentos');
    }
  };

  const handleCreate = () => {
    setSelectedUser(null);
    setFormData({
      name: '',
      email: '',
      nickname: '',
      avatar: '',
      has_signature: false,
      password: '',
      role: 'atendente',
      department_id: '',
      is_active: true
    });
    setShowModal(true);
  };

  const handleEdit = (user) => {
    setSelectedUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      nickname: user.nickname || '',
      avatar: user.avatar || '',
      has_signature: user.has_signature || false,
      password: '',
      role: user.role,
      department_id: user.department_id || '',
      is_active: user.is_active
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

    try {
      await usersAPI.delete(id);
      success('Usuário excluído com sucesso');
      fetchUsers();
    } catch (err) {
      showError('Erro ao excluir usuário');
    }
  };

  const handleToggleActive = async (id) => {
    try {
      await usersAPI.toggleActive(id);
      success('Status do usuário alterado');
      fetchUsers();
    } catch (err) {
      showError('Erro ao alterar status');
    }
  };

  const handleResetPassword = (user) => {
    setSelectedUser(user);
    setResetPassword('');
    setShowResetModal(true);
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resetPassword) {
      showError('Nova senha é obrigatória');
      return;
    }

    try {
      await usersAPI.resetPassword(selectedUser.id, resetPassword);
      success('Senha resetada com sucesso');
      setShowResetModal(false);
    } catch (err) {
      showError('Erro ao resetar senha');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (selectedUser) {
        const { password, ...data } = formData;
        await usersAPI.update(selectedUser.id, data);
        success('Usuário atualizado com sucesso');
      } else {
        await usersAPI.create(formData);
        success('Usuário criado com sucesso');
      }
      setShowModal(false);
      fetchUsers();
    } catch (err) {
      showError(err.response?.data?.error || 'Erro ao salvar usuário');
    }
  };

  const getRoleLabel = (role) => {
    const labels = {
      admin: 'Admin',
      supervisor: 'Supervisor',
      atendente: 'Atendente'
    };
    return labels[role] || role;
  };

  const getRoleColor = (role) => {
    const colors = {
      admin: 'bg-amber-600/30 text-amber-400 border-amber-500',
      supervisor: 'bg-violet-600/30 text-violet-400 border-violet-500',
      atendente: 'bg-sky-600/30 text-sky-400 border-sky-500'
    };
    return colors[role] || 'bg-gray-700 text-gray-300 border-gray-600';
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-400 text-sm">Carregando...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-medium text-white">Gerenciar Usuários</h3>
        <button
          onClick={handleCreate}
          className="bg-emerald-600 text-white px-3 py-1.5 rounded-md text-sm hover:bg-emerald-700 transition-colors"
        >
          + Novo Usuário
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 px-3 font-medium text-gray-300">Nome</th>
              <th className="text-left py-2 px-3 font-medium text-gray-300">Email</th>
              <th className="text-left py-2 px-3 font-medium text-gray-300">Apelido</th>
              <th className="text-left py-2 px-3 font-medium text-gray-300">Departamento</th>
              <th className="text-left py-2 px-3 font-medium text-gray-300">Perfil</th>
              <th className="text-left py-2 px-3 font-medium text-gray-300">Status</th>
              <th className="text-left py-2 px-3 font-medium text-gray-300">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-gray-700 hover:bg-[#202c33]">
                <td className="py-2 px-3 text-white">{user.name}</td>
                <td className="py-2 px-3 text-gray-400">{user.email}</td>
                <td className="py-2 px-3 text-gray-400">{user.nickname || '-'}</td>
                <td className="py-2 px-3 text-gray-400">{user.department?.name || '-'}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded text-xs border ${getRoleColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded text-xs border ${user.is_active ? 'bg-emerald-600/30 text-emerald-400 border-emerald-500' : 'bg-red-600/30 text-red-400 border-red-500'}`}>
                    {user.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="py-2 px-3">
                  <div className="flex space-x-1">
                    <button
                      onClick={() => handleEdit(user)}
                      className="p-1 text-gray-400 hover:text-emerald-400 hover:bg-emerald-600/30 rounded transition-colors"
                      title="Editar"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleResetPassword(user)}
                      className="p-1 text-gray-400 hover:text-amber-400 hover:bg-amber-600/30 rounded transition-colors"
                      title="Resetar Senha"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleToggleActive(user.id)}
                      className={user.is_active ? 'p-1 text-gray-400 hover:text-red-400 hover:bg-red-600/30 rounded transition-colors' : 'p-1 text-gray-400 hover:text-emerald-400 hover:bg-emerald-600/30 rounded transition-colors'}
                      title={user.is_active ? 'Desativar' : 'Ativar'}
                    >
                      {user.is_active ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
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
          <div className="bg-[#111b21] rounded-lg p-5 w-full max-w-md border border-gray-700">
            <h3 className="text-base font-semibold text-white mb-4">
              {selectedUser ? 'Editar Usuário' : 'Novo Usuário'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Nome *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-600 bg-[#202c33] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-gray-600 bg-[#202c33] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                  disabled={!!selectedUser}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Apelido</label>
                <input
                  type="text"
                  value={formData.nickname}
                  onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                  className="w-full border border-gray-600 bg-[#202c33] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Avatar (URL)</label>
                <input
                  type="text"
                  value={formData.avatar}
                  onChange={(e) => setFormData({ ...formData, avatar: e.target.value })}
                  className="w-full border border-gray-600 bg-[#202c33] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="https://..."
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="has_signature"
                  checked={formData.has_signature}
                  onChange={(e) => setFormData({ ...formData, has_signature: e.target.checked })}
                  className="mr-2 h-4 w-4 text-emerald-500 focus:ring-emerald-500 border-gray-600 rounded"
                />
                <label htmlFor="has_signature" className="text-xs font-medium text-gray-300">
                  Assinatura
                </label>
              </div>
              {!selectedUser && (
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Senha *</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full border border-gray-600 bg-[#202c33] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Perfil</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full border border-gray-600 bg-[#202c33] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="atendente">Atendente</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Departamento</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => setFormData({ ...formData, department_id: e.target.value })}
                  className="w-full border border-gray-600 bg-[#202c33] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                >
                  <option value="">Selecione...</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
              {selectedUser && (
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="mr-2 h-4 w-4 text-emerald-500 focus:ring-emerald-500 border-gray-600 rounded"
                  />
                  <label htmlFor="is_active" className="text-xs font-medium text-gray-300">
                    Usuário ativo
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

      {/* Modal de Reset de Senha */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[#111b21] rounded-lg p-5 w-full max-w-md border border-gray-700">
            <h3 className="text-base font-semibold text-white mb-3">Resetar Senha</h3>
            <p className="text-sm text-gray-400 mb-4">
              Resetar senha para: <strong>{selectedUser?.name}</strong>
            </p>
            <form onSubmit={handleResetPasswordSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Nova Senha *</label>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="w-full border border-gray-600 bg-[#202c33] text-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowResetModal(false)}
                  className="px-3 py-1.5 border border-gray-600 rounded-md text-sm hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-amber-600 text-white rounded-md text-sm hover:bg-amber-700 transition-colors"
                >
                  Resetar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsUsers;
