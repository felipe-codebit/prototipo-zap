import { NextRequest, NextResponse } from 'next/server';
import { MessageProcessor } from '@/lib/message-processor';
import { ConversationContextManager } from '@/lib/conversation-context';
import { OpenAIService } from '@/lib/openai';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, sessionId: providedSessionId, generateAudio = false, voice = 'nova' } = body;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Mensagem é obrigatória' },
        { status: 400 }
      );
    }

    // Gerar ou usar sessionId fornecido
    const sessionId = providedSessionId || uuidv4();

    // Adicionar mensagem do usuário ao contexto
    ConversationContextManager.addMessage(sessionId, {
      id: uuidv4(),
      text: message,
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    });

    // Processar mensagem
    const response = await MessageProcessor.processMessage(message, sessionId);

    // Verificar se a resposta contém marcador de vídeo
    let processedResponse = response;
    let videoUrl: string | undefined;
    
    if (response && response.includes('[VIDEO_SAUDACAO]')) {
      // Remover o marcador do texto
      processedResponse = response.replace('[VIDEO_SAUDACAO]', '');
      // Definir URL do vídeo de saudação
      videoUrl = '/api/video?type=saudacao';
      console.log('🎥 Vídeo de saudação detectado, URL:', videoUrl);
    }

    // Gerar áudio se solicitado (apenas do texto processado, sem marcadores)
    let audioData: string | undefined;
    if (generateAudio && processedResponse) {
      const audioBuffer = await OpenAIService.generateAudio(processedResponse, sessionId, voice);
      if (audioBuffer) {
        // Converter Buffer para Base64 para enviar no JSON
        audioData = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
      }
    }

    // Determinar o tipo de mensagem
    let messageType: 'text' | 'audio' | 'video' = 'text';
    if (videoUrl) {
      messageType = 'video';
    } else if (generateAudio && audioData) {
      messageType = 'audio';
    }

    // Adicionar resposta do bot ao contexto
    ConversationContextManager.addMessage(sessionId, {
      id: uuidv4(),
      text: processedResponse,
      sender: 'bot',
      timestamp: new Date(),
      type: messageType,
      audioUrl: audioData,
      videoUrl: videoUrl
    });

    return NextResponse.json({
      response: processedResponse,
      sessionId,
      timestamp: new Date().toISOString(),
      audioUrl: audioData,
      videoUrl: videoUrl
    });

  } catch (error) {
    console.error('Erro na API de chat:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'API de chat funcionando' },
    { status: 200 }
  );
}
