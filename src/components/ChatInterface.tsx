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
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: text,
          sessionId
        }),
      });

      const data = await response.json();

      if (response.ok) {
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

  const sendAudio = async (audioBlob: Blob) => {
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
      formData.append('audio', audioBlob, 'audio.wav');
      formData.append('sessionId', sessionId);

      const response = await fetch('/api/audio', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

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
      const errorMessage: Message = {
        id: uuidv4(),
        text: 'Não consegui processar o áudio. Pode escrever sua mensagem?',
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