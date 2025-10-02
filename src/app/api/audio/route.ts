import { NextRequest, NextResponse } from 'next/server';
import { OpenAIService } from '@/lib/openai';
import { MessageProcessor } from '@/lib/message-processor';
import { ConversationContextManager } from '@/lib/conversation-context';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const sessionId = formData.get('sessionId') as string || uuidv4();

    if (!audioFile) {
      return NextResponse.json(
        { error: 'Arquivo de áudio é obrigatório' },
        { status: 400 }
      );
    }

    // Converter arquivo para buffer
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

    // Transcrever áudio
    const transcription = await OpenAIService.transcribeAudio(audioBuffer, sessionId);

    if (!transcription || transcription.includes('Não consegui entender')) {
      return NextResponse.json({
        error: 'Não foi possível transcrever o áudio',
        sessionId
      }, { status: 400 });
    }

    // Adicionar mensagem transcrita ao contexto
    ConversationContextManager.addMessage(sessionId, {
      id: uuidv4(),
      text: transcription,
      sender: 'user',
      timestamp: new Date(),
      type: 'audio'
    });

    // Processar mensagem transcrita
    const response = await MessageProcessor.processMessage(transcription, sessionId);

    // Adicionar resposta do bot ao contexto
    ConversationContextManager.addMessage(sessionId, {
      id: uuidv4(),
      text: response,
      sender: 'bot',
      timestamp: new Date(),
      type: 'text'
    });

    return NextResponse.json({
      transcription,
      response,
      sessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro na API de áudio:', error);
    return NextResponse.json(
      { error: 'Erro ao processar áudio' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'API de áudio funcionando' },
    { status: 200 }
  );
}