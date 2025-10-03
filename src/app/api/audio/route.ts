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
    
    // Validação adicional do formato
    const isValidFormat = validateAudioFormat(audioFile.type, audioBuffer);
    if (!isValidFormat) {
      console.log('❌ Formato de áudio inválido detectado');
      return NextResponse.json(
        { error: 'Formato de áudio não suportado ou corrompido' },
        { status: 400 }
      );
    }

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

// Função auxiliar para validar formato de áudio
function validateAudioFormat(mimeType: string, buffer: Buffer): boolean {
  // Verificar se o buffer não está vazio
  if (buffer.length === 0) {
    return false;
  }
  
  // Verificar tipos MIME suportados
  const supportedMimeTypes = [
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/wav',
    'audio/mp3',
    'audio/mp4',
    'audio/m4a',
    'audio/ogg',
    'audio/oga'
  ];
  
  if (!supportedMimeTypes.some(type => mimeType.includes(type.split(';')[0]))) {
    return false;
  }
  
  // Verificar assinaturas de arquivo (magic numbers)
  const webmSignature = buffer.subarray(0, 4);
  const wavSignature = buffer.subarray(0, 4);
  const mp3Signature = buffer.subarray(0, 3);
  
  // WebM: 0x1A 0x45 0xDF 0xA3
  if (mimeType.includes('webm') && 
      webmSignature[0] === 0x1A && 
      webmSignature[1] === 0x45 && 
      webmSignature[2] === 0xDF && 
      webmSignature[3] === 0xA3) {
    return true;
  }
  
  // WAV: "RIFF" (0x52 0x49 0x46 0x46)
  if (mimeType.includes('wav') && 
      wavSignature[0] === 0x52 && 
      wavSignature[1] === 0x49 && 
      wavSignature[2] === 0x46 && 
      wavSignature[3] === 0x46) {
    return true;
  }
  
  // MP3: ID3 tag (0x49 0x44 0x33) ou frame sync (0xFF 0xFB/0xFA)
  if (mimeType.includes('mp3') && 
      ((mp3Signature[0] === 0x49 && mp3Signature[1] === 0x44 && mp3Signature[2] === 0x33) ||
       (mp3Signature[0] === 0xFF && (mp3Signature[1] === 0xFB || mp3Signature[1] === 0xFA)))) {
    return true;
  }
  
  // Para outros formatos, assumir válido se passou nas verificações anteriores
  return true;
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
