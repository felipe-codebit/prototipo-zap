import { NextRequest, NextResponse } from 'next/server';
import { OpenAIService } from '@/lib/openai';
import { v4 as uuidv4 } from 'uuid';

/**
 * API para geração de áudio (Text-to-Speech) usando OpenAI
 * POST: Recebe texto e retorna áudio em MP3
 * GET: Health check
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, sessionId = uuidv4(), voice = 'nova' } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Texto é obrigatório' },
        { status: 400 }
      );
    }

    if (text.length > 4096) {
      return NextResponse.json(
        { error: 'Texto muito longo. Máximo de 4096 caracteres.' },
        { status: 400 }
      );
    }

    // Validar voz
    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (voice && !validVoices.includes(voice)) {
      return NextResponse.json(
        { error: `Voz inválida. Use uma das seguintes: ${validVoices.join(', ')}` },
        { status: 400 }
      );
    }

    // Gerar áudio
    const audioBuffer = await OpenAIService.generateAudio(text, sessionId, voice);

    if (!audioBuffer) {
      return NextResponse.json(
        { error: 'Não foi possível gerar o áudio' },
        { status: 500 }
      );
    }

    // Retornar áudio como arquivo MP3
    return new NextResponse(audioBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'inline; filename="response.mp3"',
        'X-Session-Id': sessionId,
        'Cache-Control': 'public, max-age=3600', // Cache por 1 hora
      },
    });

  } catch (error) {
    console.error('Erro na API de TTS:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar áudio' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ 
    status: 'ok', 
    service: 'tts',
    voices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
    model: 'tts-1'
  });
}
