import { useState, useEffect } from 'react';
import { useWhatsApp } from '../hooks/useWhatsApp';
import { useToast } from '../components/Toast';
import { useTheme } from '../contexts/ThemeContext';
import { connectionAPI } from '../services/api';

function SettingsConnection() {
  const { connectionStatus, qrCode, phoneNumber, connect, disconnect, refreshQR } = useWhatsApp();
  const { success, error } = useToast();
  const { colors } = useTheme();
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [syncHistory, setSyncHistory] = useState(false); // Toggle para sincronizar histórico
  const [syncPeriodDays, setSyncPeriodDays] = useState(7); // Período de sincronização em dias
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Carregar configurações de sincronização do banco ao montar
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await connectionAPI.loadSyncSettings();
        if (response.data.success) {
          const settings = response.data.settings;
          setSyncHistory(settings.sync_history);
          setSyncPeriodDays(settings.sync_period_days);
        }
      } catch (err) {
        console.error('Erro ao carregar configurações de sincronização:', err);
      } finally {
        setLoadingSettings(false);
      }
    };

    loadSettings();
  }, []);

  // Salvar configurações de sincronização quando alterar
  const handleSyncHistoryChange = async (value) => {
    setSyncHistory(value);
    try {
      await connectionAPI.saveSyncSettings(value, value ? syncPeriodDays : 0);
      success('Configurações salvas');
    } catch (err) {
      console.error('Erro ao salvar configurações:', err);
      error('Erro ao salvar configurações');
    }
  };

  const handleSyncPeriodDaysChange = async (value) => {
    setSyncPeriodDays(value);
    try {
      await connectionAPI.saveSyncSettings(syncHistory, value);
      success('Configurações salvas');
    } catch (err) {
      console.error('Erro ao salvar configurações:', err);
      error('Erro ao salvar configurações');
    }
  };

  const handleConnect = async () => {
    try {
      setConnectionProgress(10);
      setConnectionMessage('Iniciando conexão...');

      // Passa syncPeriodDays apenas se syncHistory for true, caso contrário passa 0
      await connect(syncHistory ? syncPeriodDays : 0);
      setConnectionMessage('Conexão iniciada. Aguarde o QR Code...');

      // Simulação de progresso (será substituído pela lógica real)
      const progressInterval = setInterval(() => {
        setConnectionProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 500);

      setTimeout(() => {
        clearInterval(progressInterval);
        setConnectionProgress(100);
        setConnectionMessage('Escaneie o QR Code');
      }, 3000);
    } catch (err) {
      console.error('Erro ao conectar:', err);
      setConnectionMessage('Erro ao conectar. Tente novamente.');
      error('Erro ao conectar ao WhatsApp');
    }
  };

  const handleDisconnect = async () => {
    try {
      setConnectionMessage('Desconectando...');

      await disconnect();
      setConnectionProgress(0);
      setConnectionMessage('Desconectado com sucesso');
      success('WhatsApp desconectado');
    } catch (err) {
      console.error('Erro ao desconectar:', err);
      setConnectionMessage('Erro ao desconectar. Tente novamente.');
      error('Erro ao desconectar do WhatsApp');
    }
  };

  const handleRefreshQR = async () => {
    try {
      setConnectionMessage('Gerando novo QR Code...');

      await refreshQR();
      setConnectionMessage('QR Code atualizado');
      success('QR Code atualizado');
    } catch (err) {
      console.error('Erro ao atualizar QR:', err);
      setConnectionMessage('Erro ao atualizar QR Code. Tente novamente.');
      error('Erro ao atualizar QR Code');
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-emerald-500';
      case 'connecting':
      case 'disconnecting':
        return 'bg-yellow-500';
      case 'qr_required':
        return 'bg-blue-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'Conectado';
      case 'connecting':
        return 'Conectando...';
      case 'disconnecting':
        return 'Desconectando...';
      case 'qr_required':
        return 'QR Code Necessário';
      default:
        return 'Desconectado';
    }
  };

  return (
    <div className="p-6 min-h-screen" style={{ backgroundColor: colors.bg }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2" style={{ color: colors.text }}>Conexão WhatsApp</h1>
        <p className="text-gray-400">Gerencie a conexão do WhatsApp Business API</p>
      </div>

      {/* Status Card */}
      <div className="rounded-lg shadow-sm border p-6 mb-6" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: colors.text }}>Status da Conexão</h2>
          <div className="flex items-center">
            <span className={`w-3 h-3 rounded-full ${getStatusColor()} mr-2`}></span>
            <span className="text-sm font-medium" style={{ color: colors.text }}>{getStatusText()}</span>
          </div>
        </div>

        {/* Progress Bar */}
        {(connectionStatus === 'connecting' || connectionStatus === 'disconnecting') && (
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-2" style={{ color: colors.textSecondary }}>
              <span>Progresso</span>
              <span>{connectionProgress}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${connectionProgress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Connection Message */}
        {connectionMessage && (
          <div className="rounded-lg p-3 mb-4" style={{ backgroundColor: colors.bgTertiary }}>
            <p className="text-sm" style={{ color: colors.textSecondary }}>{connectionMessage}</p>
          </div>
        )}

        {/* Sync Settings */}
        <div className="mb-4">
          {loadingSettings ? (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-500"></div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium" style={{ color: colors.text }}>
                  Sincronizar Histórico
                </label>
                <button
                  onClick={() => handleSyncHistoryChange(!syncHistory)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    syncHistory ? 'bg-emerald-600' : 'bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      syncHistory ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {syncHistory && (
                <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: colors.text }}>
                    Período de Sincronização (dias)
                  </label>
                  <select
                    value={syncPeriodDays}
                    onChange={(e) => handleSyncPeriodDaysChange(parseInt(e.target.value))}
                    className="w-full border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    style={{ backgroundColor: colors.bgSecondary, color: colors.text, borderColor: colors.border }}
                  >
                    <option value={1}>1 dia</option>
                    <option value={3}>3 dias</option>
                    <option value={7}>7 dias (recomendado)</option>
                    <option value={15}>15 dias</option>
                    <option value={30}>30 dias</option>
                  </select>
                  <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                    Mensagens mais antigas que este período não serão importadas
                  </p>
                </div>
              )}

              {!syncHistory && (
                <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                  Nenhuma mensagem antiga será importada, apenas novas mensagens
                </p>
              )}
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          {connectionStatus === 'disconnected' ? (
            <button
              onClick={handleConnect}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium"
            >
              Conectar
            </button>
          ) : connectionStatus === 'connected' ? (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              Desconectar
            </button>
          ) : (
            <button
              disabled
              className="px-4 py-2 bg-gray-700 text-gray-400 rounded-lg cursor-not-allowed font-medium"
            >
              Processando...
            </button>
          )}

          {connectionStatus === 'qr_required' && (
            <button
              onClick={handleRefreshQR}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Atualizar QR Code
            </button>
          )}
        </div>
      </div>

      {/* QR Code Section */}
      {qrCode && (
        <div className="rounded-lg shadow-sm border p-6" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
          <h2 className="text-lg font-semibold mb-4" style={{ color: colors.text }}>QR Code</h2>
          <div className="flex flex-col items-center justify-center p-8 rounded-lg" style={{ backgroundColor: colors.bgTertiary }}>
            <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
              <img
                src={qrCode}
                alt="QR Code WhatsApp"
                className="w-64 h-64 object-contain"
              />
            </div>
            <p className="text-sm text-center max-w-md" style={{ color: colors.textSecondary }}>
              Abra o WhatsApp no seu celular, vá em <strong>Dispositivos conectados</strong> {'>'} <strong>Conectar um dispositivo</strong> e escaneie este QR Code.
            </p>
          </div>
        </div>
      )}

      {/* Connection Info */}
      <div className="rounded-lg shadow-sm border p-6 mt-6" style={{ backgroundColor: colors.bgSecondary, borderColor: colors.border }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: colors.text }}>Informações</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: colors.border }}>
            <span style={{ color: colors.textSecondary }}>API Version</span>
            <span className="font-medium" style={{ color: colors.text }}>v2.0</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: colors.border }}>
            <span style={{ color: colors.textSecondary }}>Protocolo</span>
            <span className="font-medium" style={{ color: colors.text }}>Baileys</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: colors.border }}>
            <span style={{ color: colors.textSecondary }}>Status</span>
            <span className="font-medium" style={{ color: colors.text }}>{connectionStatus}</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span style={{ color: colors.textSecondary }}>Número Conectado</span>
            <span className="font-medium" style={{ color: colors.text }}>
              {phoneNumber || 'Não conectado'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span style={{ color: colors.textSecondary }}>Última Sincronização</span>
            <span className="font-medium" style={{ color: colors.text }}>
              {connectionStatus === 'connected' ? 'Agora' : 'Nunca'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsConnection;
