import { NextRequest, NextResponse } from 'next/server';
import { ConversationContextManager } from '@/lib/conversation-context';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'SessionId é obrigatório' },
        { status: 400 }
      );
    }

    const context = ConversationContextManager.getContext(sessionId);
    const history = ConversationContextManager.getConversationHistory(sessionId);

    return NextResponse.json({
      sessionId,
      currentIntent: context.currentIntent,
      intentConfidence: context.intentConfidence,
      collectedData: context.collectedData,
      conversationHistory: history,
      lastActivity: context.lastActivity
    });

  } catch (error) {
    console.error('Erro na API de contexto:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'SessionId é obrigatório' },
        { status: 400 }
      );
    }

    ConversationContextManager.clearContext(sessionId);

    return NextResponse.json({
      success: true,
      message: 'Contexto limpo com sucesso',
      sessionId
    });

  } catch (error) {
    console.error('Erro na API de contexto:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}