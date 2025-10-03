import { ConversationContext, Intent, Message, PlanoAulaData } from '@/types';
import { ChatLogger } from './logger';

export class ConversationContextManager {
  private static contexts: Map<string, ConversationContext> = new Map();

  static getContext(sessionId: string): ConversationContext {
    if (!this.contexts.has(sessionId)) {
      this.contexts.set(sessionId, {
        sessionId,
        currentIntent: null,
        intentConfidence: 0,
        collectedData: {},
        conversationHistory: [],
        lastActivity: new Date(),
        waitingFor: null,
        lastBotQuestion: null
      });
    }

    const context = this.contexts.get(sessionId)!;
    context.lastActivity = new Date();
    return context;
  }

  static updateIntent(sessionId: string, intent: Intent, confidence: number) {
    const context = this.getContext(sessionId);

    // Se a intenção mudou e há dados coletados, salvar contexto anterior
    if (context.currentIntent && context.currentIntent !== intent && Object.keys(context.collectedData).length > 0) {
      ChatLogger.logDataCollection(sessionId, context.currentIntent, context.collectedData);
    }

    // Só limpar dados coletados se for uma mudança significativa de intenção
    // Manter dados para conversas relacionadas (unclear, saudacao, despedida)
    const shouldClearData = context.currentIntent !== intent &&
                           context.currentIntent !== null &&
                           intent !== 'tira_duvidas' &&
                           intent !== 'unclear' &&
                           intent !== 'saudacao' &&
                           context.currentIntent !== 'saudacao' &&
                           context.currentIntent !== 'unclear';

    if (shouldClearData) {
      context.collectedData = {};
    }

    context.currentIntent = intent;
    context.intentConfidence = confidence;
    context.lastActivity = new Date();
  }

  static addMessage(sessionId: string, message: Message) {
    const context = this.getContext(sessionId);
    context.conversationHistory.push(message);
    context.lastActivity = new Date();

    // Manter apenas as últimas 50 mensagens para dar mais contexto
    if (context.conversationHistory.length > 50) {
      context.conversationHistory = context.conversationHistory.slice(-50);
    }
  }

  static updateCollectedData(sessionId: string, key: string, value: any) {
    const context = this.getContext(sessionId);
    context.collectedData[key] = value;
    context.lastActivity = new Date();

    ChatLogger.logDataCollection(sessionId, context.currentIntent || 'unknown', context.collectedData);
  }

  static getCollectedData(sessionId: string): any {
    const context = this.getContext(sessionId);
    return context.collectedData;
  }

  static getMissingDataForPlanoAula(sessionId: string): string[] {
    const context = this.getContext(sessionId);
    const data = context.collectedData as PlanoAulaData;
    const missing: string[] = [];

    if (!data.ano) missing.push('ano');
    if (!data.tema && !data.habilidadeBNCC) missing.push('tema ou habilidade BNCC');
    // nivelDificuldade é opcional - se não fornecido, usa padrão 'medio'

    return missing;
  }

  static getMissingDataForPlanejamentoSemanal(sessionId: string): string[] {
    const context = this.getContext(sessionId);
    const data = context.collectedData as any;
    const missing: string[] = [];

    if (!data.dataInicio) missing.push('data de início');

    return missing;
  }

  static isPlanoAulaDataComplete(sessionId: string): boolean {
    return this.getMissingDataForPlanoAula(sessionId).length === 0;
  }

  static isPlanejamentoSemanalDataComplete(sessionId: string): boolean {
    return this.getMissingDataForPlanejamentoSemanal(sessionId).length === 0;
  }

  static getConversationHistory(sessionId: string): Message[] {
    const context = this.getContext(sessionId);
    return context.conversationHistory;
  }

  static clearContext(sessionId: string) {
    this.contexts.delete(sessionId);
  }

  static getCurrentIntent(sessionId: string): Intent | null {
    const context = this.getContext(sessionId);
    return context.currentIntent;
  }

  static resetContextKeepingHistory(sessionId: string) {
    const context = this.getContext(sessionId);
    context.currentIntent = null;
    context.intentConfidence = 0;
    context.collectedData = {};
    context.lastActivity = new Date();
    // Mantém conversationHistory
  }

  static getRecentUserMessages(sessionId: string, count: number = 3): string[] {
    const context = this.getContext(sessionId);
    return context.conversationHistory
      .filter(msg => msg.sender === 'user')
      .slice(-count)
      .map(msg => msg.text);
  }

  // Limpar contextos inativos (mais de 15 minutos)
  static cleanupInactiveContexts() {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    for (const [sessionId, context] of this.contexts.entries()) {
      if (context.lastActivity < fifteenMinutesAgo) {
        this.contexts.delete(sessionId);
      }
    }
  }
}

// Executar limpeza a cada 5 minutos
setInterval(() => {
  ConversationContextManager.cleanupInactiveContexts();
}, 5 * 60 * 1000);