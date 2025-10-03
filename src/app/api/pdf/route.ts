import { NextRequest, NextResponse } from 'next/server';
import { PDFGenerator } from '@/lib/pdf-generator';
import { ConversationContextManager } from '@/lib/conversation-context';
import { ChatLogger } from '@/lib/logger';

/**
 * Extrai o conteúdo do plano de aula da mensagem
 */
function extractPlanoContent(message: string): string | null {
  try {
    // Encontrar onde termina o plano e começam os próximos passos
    const nextStepsIndex = message.indexOf('Prontinho! Aqui está o seu plano de aula');
    
    if (nextStepsIndex === -1) {
      // Se não encontrar a seção de próximos passos, retornar toda a mensagem
      return message;
    }

    // Retornar apenas o conteúdo do plano (antes dos próximos passos)
    return message.substring(0, nextStepsIndex).trim();
  } catch (error) {
    console.error('❌ Erro ao extrair conteúdo do plano:', error);
    return null;
  }
}

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
    const pdfBuffer = await PDFGenerator.generatePlanoAulaPDF(planoContent as string, sessionId);
    
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
    return new NextResponse(new Uint8Array(pdfBuffer), {
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

export async function GET(request: NextRequest) {
  try {
    console.log('📄 Recebendo requisição GET de geração de PDF...');
    
    // Tentar obter sessionId dos query params ou cookies
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || 'default';
    
    console.log('📊 SessionId obtido:', sessionId);

    // Verificar se existe contexto da conversa
    const context = ConversationContextManager.getContext(sessionId);
    if (!context) {
      console.log('❌ Erro: Contexto da sessão não encontrado');
      return NextResponse.json(
        { error: 'Sessão não encontrada' },
        { status: 404 }
      );
    }

    const persistentContent = ConversationContextManager.getPersistentContent(sessionId);
    console.log('🔍 Debug do contexto:', {
      hasContext: !!context,
      collectedDataKeys: Object.keys(context.collectedData),
      hasLastPlanoContent: !!context.collectedData.lastPlanoContent,
      conversationHistoryLength: context.conversationHistory.length,
      hasPersistentContent: !!persistentContent,
      hasPersistentPlanoContent: !!persistentContent?.lastPlanoContent
    });

    // Buscar o conteúdo do plano armazenado
    let planoContent = context.collectedData.lastPlanoContent;
    
    // Fallback 1: buscar no armazenamento persistente
    if (!planoContent) {
      console.log('⚠️ Conteúdo não encontrado no contexto, buscando no armazenamento persistente...');
      const persistentContent = ConversationContextManager.getPersistentContent(sessionId);
      planoContent = persistentContent?.lastPlanoContent;
      
      if (planoContent) {
        console.log('✅ Conteúdo encontrado no armazenamento persistente');
      }
    }
    
    // Fallback 2: se ainda não encontrar, buscar no histórico da conversa
    if (!planoContent) {
      console.log('⚠️ Conteúdo não encontrado no armazenamento persistente, buscando no histórico...');
      
      const conversationHistory = context.conversationHistory;
      const lastPlanoMessage = conversationHistory
        .filter(msg => msg.sender === 'bot' && 
                      (msg.text.includes('Prontinho! Aqui está o seu plano de aula') || 
                       msg.text.includes('### Plano de Aula:')))
        .pop();

      if (!lastPlanoMessage) {
        console.log('❌ Erro: Plano de aula não encontrado no histórico');
        return NextResponse.json(
          { error: 'Plano de aula não encontrado. Gere um plano de aula primeiro!' },
          { status: 404 }
        );
      }

      // Extrair o conteúdo do plano da mensagem
      planoContent = extractPlanoContent(lastPlanoMessage.text);
      
      if (!planoContent) {
        console.log('❌ Erro: Não foi possível extrair conteúdo do plano');
        return NextResponse.json(
          { error: 'Não foi possível extrair o conteúdo do plano de aula' },
          { status: 404 }
        );
      }
      
      console.log('✅ Conteúdo do plano encontrado no histórico');
      
      // Re-armazenar no armazenamento persistente para próximas tentativas
      ConversationContextManager.updateCollectedData(sessionId, 'lastPlanoContent', planoContent);
      console.log('💾 Conteúdo re-armazenado no armazenamento persistente');
    } else {
      console.log('✅ Conteúdo do plano encontrado no contexto');
    }

    console.log('🔄 Gerando PDF...');
    
    // Gerar PDF
    const pdfBuffer = await PDFGenerator.generatePlanoAulaPDF(planoContent as string, sessionId);
    
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
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="plano-aula.pdf"',
        'Content-Length': pdfBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('❌ Erro na API de PDF (GET):', error);
    
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
