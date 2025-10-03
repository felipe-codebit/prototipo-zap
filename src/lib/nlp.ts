import { NlpManager } from 'node-nlp';
import { Intent, IntentAnalysisResult } from '@/types';
import { ChatLogger } from './logger';

export class NLPService {
  private manager: NlpManager | null = null;
  private isInitialized = false;

  constructor() {
    // Inicialização lazy para evitar problemas de memória no startup
  }

  private getManager() {
    if (!this.manager) {
      this.manager = new NlpManager({
        languages: ['pt'],
        forceNER: false, // Desabilitar NER para economizar memória
        autoSave: false,
        modelFileName: './model.nlp'
      });
    }
    return this.manager;
  }

  private async initializeNLP() {
    if (this.isInitialized) return;

    const manager = this.getManager();

    // Reduzido número de documentos para economizar memória
    // Intenção: Plano de Aula
    manager.addDocument('pt', 'plano de aula', 'plano_aula');
    manager.addDocument('pt', 'criar aula', 'plano_aula');
    manager.addDocument('pt', 'atividades aula', 'plano_aula');
    manager.addDocument('pt', 'ensinar', 'plano_aula');
    manager.addDocument('pt', 'preparar aula', 'plano_aula');

    // Intenção: Tira Dúvidas
    manager.addDocument('pt', 'dúvida', 'tira_duvidas');
    manager.addDocument('pt', 'ajuda', 'tira_duvidas');
    manager.addDocument('pt', 'explica', 'tira_duvidas');
    manager.addDocument('pt', 'como fazer', 'tira_duvidas');
    manager.addDocument('pt', 'não entendo', 'tira_duvidas');

    // Intenção: Calendário Escolar
    manager.addDocument('pt', 'calendário', 'calendario_escolar');
    manager.addDocument('pt', 'planejamento', 'calendario_escolar');
    manager.addDocument('pt', 'organizar', 'calendario_escolar');
    manager.addDocument('pt', 'cronograma', 'calendario_escolar');

    // Intenção: Saudação
    manager.addDocument('pt', 'oi', 'saudacao');
    manager.addDocument('pt', 'olá', 'saudacao');
    manager.addDocument('pt', 'bom dia', 'saudacao');
    manager.addDocument('pt', 'boa tarde', 'saudacao');

    // Intenção: Despedida
    manager.addDocument('pt', 'tchau', 'despedida');
    manager.addDocument('pt', 'obrigado', 'despedida');
    manager.addDocument('pt', 'até logo', 'despedida');

    // Treinar o modelo
    await manager.train();
    this.isInitialized = true;
  }

  async analyzeIntent(message: string, sessionId: string): Promise<IntentAnalysisResult> {
    if (!this.isInitialized) {
      await this.initializeNLP();
    }

    try {
      const manager = this.getManager();
      const result = await manager.process('pt', message);

      const intent: Intent = (result.intent as Intent) || 'unclear';
      const confidence = result.score || 0;

      // Simplified entity extraction - only basic entities
      const entities: Record<string, unknown> = {};

      ChatLogger.logIntent(sessionId, intent, confidence, message);

      return {
        intent,
        confidence,
        entities
      };
    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { message });
      return {
        intent: 'unclear',
        confidence: 0,
        entities: {}
      };
    }
  }

  async addTrainingData(intent: string, utterance: string) {
    const manager = this.getManager();
    manager.addDocument('pt', utterance, intent);
    await manager.train();
  }
}

export const nlpService = new NLPService();