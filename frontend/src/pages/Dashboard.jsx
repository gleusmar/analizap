import { useAuthStore } from '../store/authStore';
import { authAPI } from '../services/api';
import { useToast } from '../components/Toast';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    setLoading(true);
    try {
      await authAPI.logout();
      logout();
      success('Logout realizado com sucesso!');
      window.location.href = '/login';
    } catch (err) {
      showError('Erro ao fazer logout');
      // Mesmo com erro, faz logout local
      logout();
      window.location.href = '/login';
    } finally {
      setLoading(false);
    }
  };

  const handleSettings = () => {
    navigate('/settings/users');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center">
              <h1 className="text-lg font-semibold text-slate-800">Analizap</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-slate-600">{user?.name}</span>
              <span className="px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                {user?.role}
              </span>
              <button
                onClick={handleSettings}
                className="text-slate-500 hover:text-emerald-600 transition-colors"
                title="Configurações"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button
                onClick={handleLogout}
                disabled={loading}
                className="text-sm text-slate-600 hover:text-emerald-600 transition-colors disabled:opacity-50"
              >
                {loading ? 'Saindo...' : 'Sair'}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-2">Bem-vindo ao Analizap</h2>
            <p className="text-sm text-slate-600">
              Sistema de WhatsApp CRM - Dashboard em desenvolvimento
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
