'use client';

import { Message } from '@/types';

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.sender === 'user';
  const isAudio = message.type === 'audio';

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatMessageText = (text: string) => {
    // Converter quebras de linha em elementos <br>
    return text.split('\n').map((line, index) => (
      <span key={index}>
        {line}
        {index < text.split('\n').length - 1 && <br />}
      </span>
    ));
  };

  return (
    <div className={`flex mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2 rounded-lg shadow ${
          isUser
            ? 'bg-[#dcf8c6] text-gray-800'
            : 'bg-white text-gray-800'
        }`}
      >
        {/* Indicador de áudio */}
        {isAudio && isUser && (
          <div className="flex items-center space-x-2 text-sm text-gray-600 mb-1">
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
            </svg>
            <span>Áudio</span>
          </div>
        )}

        {/* Texto da mensagem */}
        <div className="text-sm whitespace-pre-wrap">
          {formatMessageText(message.text)}
        </div>

        {/* Timestamp */}
        <div className={`text-xs mt-1 ${
          isUser ? 'text-gray-600' : 'text-gray-500'
        }`}>
          {formatTime(message.timestamp)}
          {isUser && (
            <span className="ml-1">
              {/* Ícone de "enviado" */}
              <svg
                className="w-3 h-3 inline text-gray-500"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}