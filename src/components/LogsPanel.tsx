'use client';

import { useState, useEffect } from 'react';

interface LogsPanelProps {
  sessionId: string;
  onClose: () => void;
}

interface ContextData {
  currentIntent: string | null;
  intentConfidence: number;
  collectedData: Record<string, any>;
  conversationHistory: any[];
  lastActivity: string;
}

export default function LogsPanel({ sessionId, onClose }: LogsPanelProps) {
  const [contextData, setContextData] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContext = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/context?sessionId=${sessionId}`);

        if (response.ok) {
          const data = await response.json();
          setContextData(data);
          setError(null);
        } else {
          throw new Error('Erro ao carregar contexto');
        }
      } catch (err) {
        setError('Erro ao carregar dados do contexto');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchContext();

    // Atualizar contexto a cada 5 segundos
    const interval = setInterval(fetchContext, 5000);

    return () => clearInterval(interval);
  }, [sessionId]);

  const getIntentColor = (intent: string | null) => {
    switch (intent) {
      case 'plano_aula':
        return 'text-blue-600 bg-blue-100';
      case 'tira_duvidas':
        return 'text-green-600 bg-green-100';
      case 'calendario_escolar':
        return 'text-purple-600 bg-purple-100';
      case 'saudacao':
        return 'text-yellow-600 bg-yellow-100';
      case 'despedida':
        return 'text-red-600 bg-red-100';
      case 'revisar_plano':
        return 'text-orange-600 bg-orange-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const getIntentDisplayName = (intent: string | null) => {
    switch (intent) {
      case 'plano_aula':
        return 'Plano de Aula';
      case 'tira_duvidas':
        return 'Tira-dúvidas';
      case 'calendario_escolar':
        return 'Calendário Escolar';
      case 'saudacao':
        return 'Saudação';
      case 'despedida':
        return 'Despedida';
      case 'revisar_plano':
        return 'Revisar Plano';
      case 'unclear':
        return 'Não identificada';
      default:
        return 'Nenhuma';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="w-1/3 bg-gray-50 border-l border-gray-200 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
        <h2 className="text-lg font-medium text-gray-900">Debug & Logs</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && (
          <div className="text-center text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-2"></div>
            Carregando contexto...
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {contextData && (
          <>
            {/* Session Info */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-medium text-gray-900 mb-2">Sessão</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">ID:</span>
                  <span className="font-mono text-xs">{sessionId.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Última atividade:</span>
                  <span>{new Date(contextData.lastActivity).toLocaleTimeString('pt-BR')}</span>
                </div>
              </div>
            </div>

            {/* Intent Analysis */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-medium text-gray-900 mb-2">Análise de Intenção</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Intenção atual:</span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${getIntentColor(
                      contextData.currentIntent
                    )}`}
                  >
                    {getIntentDisplayName(contextData.currentIntent)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Confiança:</span>
                  <span
                    className={`font-medium ${getConfidenceColor(
                      contextData.intentConfidence
                    )}`}
                  >
                    {(contextData.intentConfidence * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Collected Data */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-medium text-gray-900 mb-2">Dados Coletados</h3>
              {Object.keys(contextData.collectedData).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(contextData.collectedData)
                    .filter(([_, value]) => value !== undefined && value !== null)
                    .map(([key, value]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-gray-600 capitalize">{key}:</span>
                      <span className="font-medium text-right max-w-32 truncate">
                        {typeof value === 'string' ? value : JSON.stringify(value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nenhum dado coletado ainda</p>
              )}
            </div>

            {/* Conversation History */}
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h3 className="font-medium text-gray-900 mb-2">Histórico Recente</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {contextData.conversationHistory.slice(-5).map((msg, index) => (
                  <div key={index} className="text-xs">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          msg.sender === 'user' ? 'bg-blue-500' : 'bg-green-500'
                        }`}
                      ></span>
                      <span className="font-medium">
                        {msg.sender === 'user' ? 'Usuário' : 'Bot'}
                      </span>
                      <span className="text-gray-500">
                        {new Date(msg.timestamp).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                    <p className="text-gray-700 mt-1 ml-4 truncate">
                      {msg.text.length > 50 ? `${msg.text.slice(0, 50)}...` : msg.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}