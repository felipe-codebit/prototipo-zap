import { NextRequest, NextResponse } from 'next/server';
import { OpenAIService } from '@/lib/openai';
import { MessageProcessor } from '@/lib/message-processor';
import { ConversationContextManager } from '@/lib/conversation-context';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    console.log('📥 Recebendo requisição de áudio...');
    
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File;
    const sessionId = formData.get('sessionId') as string || uuidv4();

    console.log('📊 Dados recebidos:', {
      hasAudioFile: !!audioFile,
      audioFileSize: audioFile?.size,
      audioFileType: audioFile?.type,
      sessionId
    });

    if (!audioFile) {
      console.log('❌ Erro: Arquivo de áudio não encontrado');
      return NextResponse.json(
        { error: 'Arquivo de áudio é obrigatório' },
        { status: 400 }
      );
    }

    if (audioFile.size === 0) {
      console.log('❌ Erro: Arquivo de áudio está vazio');
      return NextResponse.json(
        { error: 'Arquivo de áudio está vazio' },
        { status: 400 }
      );
    }

    if (audioFile.size > 25 * 1024 * 1024) { // 25MB
      console.log('❌ Erro: Arquivo muito grande:', audioFile.size);
      return NextResponse.json(
        { error: 'Arquivo de áudio muito grande. Máximo 25MB.' },
        { status: 413 }
      );
    }

    console.log('🔄 Convertendo arquivo para buffer...');
    // Converter arquivo para buffer
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    console.log('✅ Buffer criado:', audioBuffer.length, 'bytes');

    console.log('🎤 Iniciando transcrição...');
    // Transcrever áudio
    const transcription = await OpenAIService.transcribeAudio(audioBuffer, sessionId);
    console.log('📝 Transcrição:', transcription);

    if (!transcription || transcription.includes('Não consegui entender')) {
      console.log('❌ Erro na transcrição');
      return NextResponse.json({
        error: 'Não foi possível transcrever o áudio',
        sessionId
      }, { status: 400 });
    }

    console.log('💾 Adicionando mensagem ao contexto...');
    // Adicionar mensagem transcrita ao contexto
    ConversationContextManager.addMessage(sessionId, {
      id: uuidv4(),
      text: transcription,
      sender: 'user',
      timestamp: new Date(),
      type: 'audio'
    });

    console.log('🤖 Processando mensagem...');
    // Processar mensagem transcrita
    const response = await MessageProcessor.processMessage(transcription, sessionId);
    console.log('✅ Resposta gerada:', response.substring(0, 100) + '...');

    console.log('💾 Adicionando resposta ao contexto...');
    // Adicionar resposta do bot ao contexto
    ConversationContextManager.addMessage(sessionId, {
      id: uuidv4(),
      text: response,
      sender: 'bot',
      timestamp: new Date(),
      type: 'text'
    });

    console.log('✅ Enviando resposta final...');
    return NextResponse.json({
      transcription,
      response,
      sessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Erro na API de áudio:', error);
    
    let errorMessage = 'Erro ao processar áudio';
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes('Request entity too large')) {
        errorMessage = 'Arquivo de áudio muito grande';
        statusCode = 413;
      } else if (error.message.includes('Invalid audio format')) {
        errorMessage = 'Formato de áudio não suportado';
        statusCode = 400;
      } else {
        errorMessage = `Erro: ${error.message}`;
      }
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { 
      message: 'API de áudio funcionando',
      supportedFormats: ['webm', 'wav', 'mp3', 'm4a', 'ogg'],
      maxSize: '25MB',
      timestamp: new Date().toISOString()
    },
    { status: 200 }
  );
}
