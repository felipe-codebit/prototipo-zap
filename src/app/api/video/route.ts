import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoType = searchParams.get('type');

    console.log('🎥 Recebendo requisição de vídeo:', { videoType });

    let videoPath: string;
    
    if (videoType === 'saudacao') {
      videoPath = join(process.cwd(), 'video-saudacao.mp4');
    } else {
      console.log('❌ Tipo de vídeo não especificado ou inválido');
      return NextResponse.json(
        { error: 'Tipo de vídeo não especificado' },
        { status: 400 }
      );
    }

    console.log('📁 Caminho do vídeo:', videoPath);

    // Ler o arquivo de vídeo
    const videoBuffer = await readFile(videoPath);
    console.log('✅ Vídeo carregado:', videoBuffer.length, 'bytes');

    // Retornar o vídeo como resposta
    return new NextResponse(new Uint8Array(videoBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoBuffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000', // Cache por 1 ano
        'Accept-Ranges': 'bytes'
      },
    });

  } catch (error) {
    console.error('❌ Erro na API de vídeo:', error);
    
    let errorMessage = 'Erro ao carregar vídeo';
    let statusCode = 500;
    
    if (error instanceof Error) {
      if (error.message.includes('ENOENT')) {
        errorMessage = 'Arquivo de vídeo não encontrado';
        statusCode = 404;
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

export async function POST() {
  return NextResponse.json(
    { 
      message: 'API de vídeo funcionando',
      description: 'Endpoint para servir vídeos do sistema',
      availableTypes: ['saudacao'],
      timestamp: new Date().toISOString()
    },
    { status: 200 }
  );
}
