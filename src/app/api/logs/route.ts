import { NextRequest, NextResponse } from 'next/server';
import { ChatLogger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { enabled } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Campo "enabled" deve ser boolean' },
        { status: 400 }
      );
    }

    ChatLogger.setEnabled(enabled);

    return NextResponse.json({
      success: true,
      logsEnabled: enabled,
      message: `Logs ${enabled ? 'habilitados' : 'desabilitados'} com sucesso`
    });

  } catch (error) {
    console.error('Erro na API de logs:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const isEnabled = ChatLogger.isLoggingEnabled();

    return NextResponse.json({
      logsEnabled: isEnabled,
      message: `Logs estão ${isEnabled ? 'habilitados' : 'desabilitados'}`
    });

  } catch (error) {
    console.error('Erro na API de logs:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}