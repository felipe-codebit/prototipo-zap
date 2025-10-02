'use client';

import { useState, useRef } from 'react';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  onSendAudio: (audioBlob: Blob) => void;
}

export default function MessageInput({ onSendMessage, onSendAudio }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const handleSend = () => {
    if (message.trim()) {
      onSendMessage(message.trim());
      setMessage('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' });
        onSendAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Erro ao acessar microfone:', error);
      alert('Não foi possível acessar o microfone. Verifique as permissões.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <div className="bg-[#f0f0f0] p-4">
      <div className="flex items-end space-x-3">
        {/* Emoji/Anexo */}
        <button className="p-2 text-gray-600 hover:text-gray-800 transition-colors">
          <svg
            className="w-6 h-6"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
        </button>

        {/* Input de texto */}
        <div className="flex-1 relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite uma mensagem..."
            className="w-full p-3 pr-12 border border-gray-300 rounded-full resize-none focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent max-h-32"
            rows={1}
            style={{
              minHeight: '44px',
              height: 'auto'
            }}
          />

          {/* Emoji button dentro do input */}
          <button className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600 hover:text-gray-800 transition-colors">
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
          </button>
        </div>

        {/* Botão de áudio ou enviar */}
        {message.trim() ? (
          <button
            onClick={handleSend}
            className="p-3 bg-[#075e54] text-white rounded-full hover:bg-[#064e45] transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        ) : (
          <button
            onClick={toggleRecording}
            className={`p-3 rounded-full transition-colors ${
              isRecording
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-[#075e54] text-white hover:bg-[#064e45]'
            }`}
          >
            {isRecording ? (
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M6 6h12v12H6z" />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* Indicador de gravação */}
      {isRecording && (
        <div className="flex items-center justify-center mt-2 text-red-500 text-sm">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse mr-2"></div>
          Gravando... Toque novamente para parar
        </div>
      )}
    </div>
  );
}