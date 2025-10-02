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

    // Gerar áudio se solicitado
    let audioData: string | undefined;
    if (generateAudio && response) {
      const audioBuffer = await OpenAIService.generateAudio(response, sessionId, voice);
      if (audioBuffer) {
        // Converter Buffer para Base64 para enviar no JSON
        audioData = `data:audio/mpeg;base64,${audioBuffer.toString('base64')}`;
      }
    }

    // Adicionar resposta do bot ao contexto
    ConversationContextManager.addMessage(sessionId, {
      id: uuidv4(),
      text: response,
      sender: 'bot',
      timestamp: new Date(),
      type: generateAudio ? 'audio' : 'text',
      audioUrl: audioData
    });

    return NextResponse.json({
      response,
      sessionId,
      timestamp: new Date().toISOString(),
      audioUrl: audioData
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
