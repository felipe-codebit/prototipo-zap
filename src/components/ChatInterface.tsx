'use client';

import { useState, useEffect, useRef } from 'react';
import { Message } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ChatHeader from './ChatHeader';
import TypingIndicator from './TypingIndicator';
import LogsPanel from './LogsPanel';

interface ChatInterfaceProps {
  sessionId?: string;
}

export default function ChatInterface({ sessionId: initialSessionId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState(initialSessionId || uuidv4());
  const [isTyping, setIsTyping] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logsEnabled, setLogsEnabled] = useState(true);
  const [audioResponsesEnabled, setAudioResponsesEnabled] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Carregar estado dos logs
    fetch('/api/logs')
      .then(res => res.json())
      .then(data => setLogsEnabled(data.logsEnabled))
      .catch(console.error);
  }, []);

  const sendMessage = async (text: string) => {
    console.log('📤 Enviando mensagem:', { text, audioResponsesEnabled });
    
    const userMessage: Message = {
      id: uuidv4(),
      text,
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const requestBody = {
        message: text,
        sessionId,
        generateAudio: audioResponsesEnabled,
        voice: 'nova'
      };
      
      console.log('📡 Request body:', requestBody);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      console.log('📥 Response data:', { 
        hasResponse: !!data.response, 
        hasAudioUrl: !!data.audioUrl,
        hasVideoUrl: !!data.videoUrl,
        audioUrlLength: data.audioUrl?.length 
      });

      if (response.ok) {
        // Determinar o tipo de mensagem baseado no que foi retornado
        let messageType: 'text' | 'audio' | 'video' = 'text';
        if (data.videoUrl) {
          messageType = 'video';
        } else if (audioResponsesEnabled && data.audioUrl) {
          messageType = 'audio';
        }

        const botMessage: Message = {
          id: uuidv4(),
          text: data.response,
          sender: 'bot',
          timestamp: new Date(),
          type: messageType,
          audioUrl: data.audioUrl,
          videoUrl: data.videoUrl
        };

        setMessages(prev => [...prev, botMessage]);
        setSessionId(data.sessionId);

        // Verificar se a resposta indica que um PDF será gerado
        if (data.response && (data.response.includes('PDF do seu plano de aula') || data.response.includes('[PDF_GENERATION_TRIGGER]'))) {
          // Aguardar um pouco e então gerar o PDF
          setTimeout(() => {
            generatePDF(sessionId);
          }, 2000);
        }
      } else {
        throw new Error(data.error || 'Erro ao enviar mensagem');
      }
    } catch (error) {
      console.error('Erro ao enviar mensagem:', error);
      const errorMessage: Message = {
        id: uuidv4(),
        text: 'Desculpe, ocorreu um erro. Tente novamente.',
        sender: 'bot',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const generatePDF = async (currentSessionId: string) => {
    try {
      console.log('📄 Gerando PDF...');
      
      // Buscar o último plano de aula no histórico
      const lastPlanoMessage = messages
        .filter(msg => msg.sender === 'bot' && 
                      (msg.text.includes('Prontinho! Aqui está o seu plano de aula') || 
                       msg.text.includes('### Plano de Aula:')))
        .pop();

      if (!lastPlanoMessage) {
        console.error('❌ Plano de aula não encontrado');
        return;
      }

      // Extrair conteúdo do plano (remover próximos passos)
      let planoContent = lastPlanoMessage.text;
      
      // Tentar remover a seção de próximos passos
      const nextStepsIndex = planoContent.indexOf('Prontinho! Aqui está o seu plano de aula');
      if (nextStepsIndex !== -1) {
        planoContent = planoContent.substring(0, nextStepsIndex).trim();
      }

      const response = await fetch('/api/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: currentSessionId,
          planoContent
        }),
      });

      if (response.ok) {
        // Criar blob do PDF
        const pdfBlob = await response.blob();
        
        // Criar URL temporária e fazer download
        const url = window.URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plano-aula.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        console.log('✅ PDF baixado com sucesso');
      } else {
        console.error('❌ Erro ao gerar PDF:', response.status);
      }
    } catch (error) {
      console.error('❌ Erro na geração de PDF:', error);
    }
  };

  const sendAudio = async (audioBlob: Blob) => {
    console.log('🎤 Enviando áudio:', {
      size: audioBlob.size,
      type: audioBlob.type,
      sessionId
    });

    const userMessage: Message = {
      id: uuidv4(),
      text: '🎤 Mensagem de áudio',
      sender: 'user',
      timestamp: new Date(),
      type: 'audio'
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.webm');
      formData.append('sessionId', sessionId);

      console.log('Enviando FormData para /api/audio...');

      const response = await fetch('/api/audio', {
        method: 'POST',
        body: formData,
      });

      console.log('Resposta recebida:', {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      const data = await response.json();
      console.log('Dados da resposta:', data);

      if (response.ok) {
        // Atualizar mensagem do usuário com transcrição
        setMessages(prev => prev.map(msg =>
          msg.id === userMessage.id
            ? { ...msg, text: `🎤 "${data.transcription}"` }
            : msg
        ));

        const botMessage: Message = {
          id: uuidv4(),
          text: data.response,
          sender: 'bot',
          timestamp: new Date(),
          type: 'text'
        };

        setMessages(prev => [...prev, botMessage]);
        setSessionId(data.sessionId);
      } else {
        throw new Error(data.error || 'Erro ao processar áudio');
      }
    } catch (error) {
      console.error('Erro ao enviar áudio:', error);
      
      let errorText = 'Não consegui processar o áudio. Pode escrever sua mensagem?';
      
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          errorText = 'Erro de conexão. Verifique sua internet e tente novamente.';
        } else if (error.message.includes('413')) {
          errorText = 'Áudio muito grande. Tente gravar uma mensagem mais curta.';
        } else {
          errorText = `Erro: ${error.message}`;
        }
      }

      const errorMessage: Message = {
        id: uuidv4(),
        text: errorText,
        sender: 'bot',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const toggleLogs = async () => {
    try {
      const response = await fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: !logsEnabled
        }),
      });

      if (response.ok) {
        setLogsEnabled(!logsEnabled);
      }
    } catch (error) {
      console.error('Erro ao alterar logs:', error);
    }
  };

  const clearChat = async () => {
    try {
      await fetch(`/api/context?sessionId=${sessionId}`, {
        method: 'DELETE'
      });

      setMessages([]);
      setSessionId(uuidv4());
    } catch (error) {
      console.error('Erro ao limpar chat:', error);
    }
  };

  const toggleAudioResponses = () => {
    const newState = !audioResponsesEnabled;
    setAudioResponsesEnabled(newState);
    console.log('🔊 Toggle de áudio alterado:', newState);
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Chat Principal */}
      <div className={`flex flex-col ${showLogs ? 'w-2/3' : 'w-full'} bg-white`}>
        <ChatHeader
          onToggleLogs={() => setShowLogs(!showLogs)}
          onToggleLogsEnabled={toggleLogs}
          onClearChat={clearChat}
          logsEnabled={logsEnabled}
          showLogs={showLogs}
        />

        {/* Barra de controle de áudio - MELHORADA */}
        <div className="bg-gradient-to-r from-blue-50 to-green-50 border-b-2 border-blue-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-sm font-medium text-gray-700">
                🎵 Respostas do Assistente:
              </div>
              <button
                onClick={toggleAudioResponses}
                className={`flex items-center space-x-2 text-sm px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  audioResponsesEnabled
                    ? 'bg-green-500 text-white hover:bg-green-600 shadow-lg transform hover:scale-105'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  {audioResponsesEnabled ? (
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  ) : (
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  )}
                </svg>
                <span>
                  {audioResponsesEnabled ? '🔊 ÁUDIO ATIVADO' : '🔇 APENAS TEXTO'}
                </span>
              </button>
            </div>
            
            {audioResponsesEnabled && (
              <div className="flex items-center space-x-2 text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>Próximas respostas serão em áudio</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-[#efeae2]">
          {messages.length === 0 && (
            <div className="text-center text-gray-500 mt-8">
              <div className="bg-white rounded-lg p-6 shadow-sm max-w-md mx-auto">
                <h3 className="text-lg font-medium mb-2">👋 Oi! Que bom te ver aqui!</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Sou seu assistente educacional e estou <strong>super empolgado</strong> para ajudar você! ✨
                </p>
                <div className="text-sm text-left space-y-2">
                  <div className="flex items-center space-x-2">
                    <span>🎯</span>
                    <span>Criar planos de aula personalizados</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>❓</span>
                    <span>Tirar dúvidas educacionais</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span>📅</span>
                    <span>Planejar sua semana de trabalho</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-4 font-medium">
                  Manda uma mensagem ou áudio! Por onde começamos? 😊
                </p>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isTyping && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>

        <MessageInput onSendMessage={sendMessage} onSendAudio={sendAudio} />
      </div>

      {/* Panel de Logs */}
      {showLogs && (
        <LogsPanel
          sessionId={sessionId}
          onClose={() => setShowLogs(false)}
        />
      )}
    </div>
  );
}
