'use client';

interface ChatHeaderProps {
  onToggleLogs: () => void;
  onToggleLogsEnabled: () => void;
  onClearChat: () => void;
  logsEnabled: boolean;
  showLogs: boolean;
}

export default function ChatHeader({
  onToggleLogs,
  onToggleLogsEnabled,
  onClearChat,
  logsEnabled,
  showLogs
}: ChatHeaderProps) {
  return (
    <div className="bg-[#075e54] text-white p-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
          <span className="text-2xl">🤖</span>
        </div>
        <div>
          <h1 className="font-medium">Assistente Educacional</h1>
          <p className="text-xs text-green-100">online</p>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {/* Botão para mostrar/esconder logs */}
        <button
          onClick={onToggleLogs}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
          title={showLogs ? 'Esconder logs' : 'Mostrar logs'}
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
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </button>

        {/* Botão para habilitar/desabilitar logs */}
        <button
          onClick={onToggleLogsEnabled}
          className={`p-2 hover:bg-white/10 rounded-full transition-colors ${
            logsEnabled ? 'text-green-300' : 'text-red-300'
          }`}
          title={logsEnabled ? 'Desabilitar logs' : 'Habilitar logs'}
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
              d={logsEnabled
                ? "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                : "M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
              }
            />
          </svg>
        </button>

        {/* Botão para limpar chat */}
        <button
          onClick={onClearChat}
          className="p-2 hover:bg-white/10 rounded-full transition-colors"
          title="Limpar conversa"
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
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>

        {/* Menu (três pontos) */}
        <button className="p-2 hover:bg-white/10 rounded-full transition-colors">
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}