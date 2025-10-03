import { NextRequest, NextResponse } from 'next/server';
import { PDFGenerator } from '@/lib/pdf-generator';
import { ConversationContextManager } from '@/lib/conversation-context';
import { ChatLogger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    console.log('📄 Recebendo requisição de geração de PDF...');
    
    const { sessionId, planoContent } = await request.json();
    
    console.log('📊 Dados recebidos:', {
      hasSessionId: !!sessionId,
      hasPlanoContent: !!planoContent,
      sessionId
    });

    if (!sessionId) {
      console.log('❌ Erro: SessionId não fornecido');
      return NextResponse.json(
        { error: 'SessionId é obrigatório' },
        { status: 400 }
      );
    }

    if (!planoContent) {
      console.log('❌ Erro: Conteúdo do plano não fornecido');
      return NextResponse.json(
        { error: 'Conteúdo do plano é obrigatório' },
        { status: 400 }
      );
    }

    // Verificar se existe contexto da conversa
    const context = ConversationContextManager.getContext(sessionId);
    if (!context) {
      console.log('❌ Erro: Contexto da sessão não encontrado');
      return NextResponse.json(
        { error: 'Sessão não encontrada' },
        { status: 404 }
      );
    }

    console.log('🔄 Gerando PDF...');
    
    // Gerar PDF
    const pdfBuffer = await PDFGenerator.generatePlanoAulaPDF(planoContent, sessionId);
    
    if (!pdfBuffer) {
      console.log('❌ Erro: Falha ao gerar PDF');
      return NextResponse.json(
        { error: 'Falha ao gerar PDF' },
        { status: 500 }
      );
    }

    console.log('✅ PDF gerado com sucesso');
    
    // Log da ação
    ChatLogger.logConversation(sessionId, '[PDF solicitado]', 'PDF do plano de aula gerado');

    // Retornar PDF como resposta
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="plano-aula.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('❌ Erro na API de PDF:', error);
    
    let errorMessage = 'Erro ao gerar PDF';
    let statusCode = 500;
    
    if (error instanceof Error) {
      errorMessage = `Erro: ${error.message}`;
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
      message: 'API de PDF funcionando',
      description: 'Endpoint para gerar PDFs de planos de aula',
      timestamp: new Date().toISOString()
    },
    { status: 200 }
  );
}
