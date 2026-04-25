import { useState } from 'react';
import { useWhatsApp } from '../hooks/useWhatsApp';
import { useToast } from '../components/Toast';

function SettingsConnection() {
  const { connectionStatus, qrCode, phoneNumber, connect, disconnect, refreshQR } = useWhatsApp();
  const { success, error } = useToast();
  const [connectionMessage, setConnectionMessage] = useState('');
  const [connectionProgress, setConnectionProgress] = useState(0);
  const [syncPeriodDays, setSyncPeriodDays] = useState(7);

  const handleConnect = async () => {
    try {
      setConnectionProgress(10);
      setConnectionMessage('Iniciando conexão...');

      await connect(syncPeriodDays);
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
    <div className="p-6 bg-[#0b141a] min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">Conexão WhatsApp</h1>
        <p className="text-gray-400">Gerencie a conexão do WhatsApp Business API</p>
      </div>

      {/* Status Card */}
      <div className="bg-[#111b21] rounded-lg shadow-sm border border-gray-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Status da Conexão</h2>
          <div className="flex items-center">
            <span className={`w-3 h-3 rounded-full ${getStatusColor()} mr-2`}></span>
            <span className="text-sm font-medium text-gray-300">{getStatusText()}</span>
          </div>
        </div>

        {/* Progress Bar */}
        {(connectionStatus === 'connecting' || connectionStatus === 'disconnecting') && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
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
          <div className="bg-[#202c33] rounded-lg p-3 mb-4">
            <p className="text-sm text-gray-400">{connectionMessage}</p>
          </div>
        )}

        {/* Sync Period Selector */}
        {connectionStatus === 'disconnected' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Período de Sincronização
            </label>
            <select
              value={syncPeriodDays}
              onChange={(e) => setSyncPeriodDays(parseInt(e.target.value))}
              className="w-full bg-[#202c33] text-white border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value={0}>Não sincronizar histórico</option>
              <option value={1}>1 dia</option>
              <option value={3}>3 dias</option>
              <option value={7}>7 dias (recomendado)</option>
              <option value={15}>15 dias</option>
              <option value={30}>30 dias</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {syncPeriodDays === 0
                ? 'Nenhuma mensagem antiga será importada, apenas novas mensagens'
                : 'Mensagens mais antigas que este período não serão importadas'}
            </p>
          </div>
        )}

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
        <div className="bg-[#111b21] rounded-lg shadow-sm border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">QR Code</h2>
          <div className="flex flex-col items-center justify-center p-8 bg-[#202c33] rounded-lg">
            <div className="bg-white p-4 rounded-lg shadow-sm mb-4">
              <img
                src={qrCode}
                alt="QR Code WhatsApp"
                className="w-64 h-64 object-contain"
              />
            </div>
            <p className="text-sm text-gray-400 text-center max-w-md">
              Abra o WhatsApp no seu celular, vá em <strong>Dispositivos conectados</strong> {'>'} <strong>Conectar um dispositivo</strong> e escaneie este QR Code.
            </p>
          </div>
        </div>
      )}

      {/* Connection Info */}
      <div className="bg-[#111b21] rounded-lg shadow-sm border border-gray-700 p-6 mt-6">
        <h2 className="text-lg font-semibold text-white mb-4">Informações</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-gray-700">
            <span className="text-gray-400">API Version</span>
            <span className="text-white font-medium">v2.0</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-700">
            <span className="text-gray-400">Protocolo</span>
            <span className="text-white font-medium">Baileys</span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-400">Número Conectado</span>
            <span className="text-white font-medium">
              {phoneNumber || 'Não conectado'}
            </span>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-gray-400">Última Sincronização</span>
            <span className="text-white font-medium">
              {connectionStatus === 'connected' ? 'Agora' : 'Nunca'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsConnection;
