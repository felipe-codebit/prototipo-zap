'use client';

import { useState, useRef } from 'react';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  onSendAudio: (audioBlob: Blob) => void;
}

export default function MessageInput({ onSendMessage, onSendAudio }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
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
      setRecordingError(null);
      
      // Verificar se o navegador suporta MediaRecorder
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Seu navegador não suporta gravação de áudio');
      }

      // Solicitar permissão de microfone
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        } 
      });

      // Verificar se o navegador suporta MediaRecorder
      if (!window.MediaRecorder) {
        throw new Error('Seu navegador não suporta MediaRecorder');
      }

      // Criar MediaRecorder com configurações específicas
      // Tentar diferentes formatos em ordem de preferência
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/wav'
      ];
      
      let mediaRecorder: MediaRecorder;
      let selectedMimeType = '';
      
      // Encontrar o primeiro tipo suportado
      for (const mimeType of supportedTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          try {
            mediaRecorder = new MediaRecorder(stream, { mimeType });
            selectedMimeType = mimeType;
            console.log('✅ Tipo de áudio selecionado:', mimeType);
            break;
          } catch (e) {
            console.warn('⚠️ Falha ao criar MediaRecorder com:', mimeType);
            continue;
          }
        }
      }
      
      // Fallback para configuração padrão se nenhum tipo específico funcionar
      if (!mediaRecorder) {
        mediaRecorder = new MediaRecorder(stream);
        selectedMimeType = mediaRecorder.mimeType || 'audio/webm';
        console.log('⚠️ Usando configuração padrão:', selectedMimeType);
      }

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('Dados de áudio recebidos:', event.data.size, 'bytes');
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log('Gravação parada. Chunks:', chunksRef.current.length);
        
        if (chunksRef.current.length === 0) {
          setRecordingError('Nenhum áudio foi gravado. Tente novamente.');
          return;
        }

        // Criar blob com o tipo correto
        const mimeType = selectedMimeType || chunksRef.current[0].type || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        
        console.log('Blob criado:', audioBlob.size, 'bytes, tipo:', audioBlob.type);
        
        // Verificar se o blob tem conteúdo
        if (audioBlob.size === 0) {
          setRecordingError('Áudio gravado está vazio. Tente novamente.');
          return;
        }

        onSendAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.onerror = (event) => {
        console.error('Erro no MediaRecorder:', event);
        setRecordingError('Erro durante a gravação. Tente novamente.');
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(100); // Coletar dados a cada 100ms
      setIsRecording(true);
      
      console.log('Gravação iniciada com sucesso');

    } catch (error) {
      console.error('Erro ao acessar microfone:', error);
      
      let errorMessage = 'Não foi possível acessar o microfone.';
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = 'Permissão de microfone negada. Por favor, permita o acesso ao microfone e tente novamente.';
        } else if (error.name === 'NotFoundError') {
          errorMessage = 'Nenhum microfone encontrado. Verifique se há um microfone conectado.';
        } else if (error.name === 'NotSupportedError') {
          errorMessage = 'Seu navegador não suporta gravação de áudio.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setRecordingError(errorMessage);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('Parando gravação...');
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
      <div className="flex items-center space-x-2">
        {/* Campo de texto */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Digite sua mensagem..."
            className="w-full px-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#075e54] focus:border-transparent"
          />
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

      {/* Mensagem de erro */}
      {recordingError && (
        <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded-md text-red-700 text-sm">
          <div className="flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            {recordingError}
          </div>
          <button
            onClick={() => setRecordingError(null)}
            className="mt-1 text-xs underline hover:no-underline"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
