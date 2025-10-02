import { Intent, IntentAnalysisResult } from '@/types';
import { ChatLogger } from './logger';

export class SimpleNLPService {
  private keywords = {
    plano_aula: ['plano', 'aula', 'atividade', 'ensinar', 'criar', 'preparar', 'lecionar', 'lição', 'conteúdo', 'matéria'],
    tira_duvidas: ['dúvida', 'duvida', 'ajuda', 'explica', 'como', 'não entendo', 'pergunta', 'questão', 'esclarecer'],
    planejamento_semanal: ['semana', 'semanal', 'planejamento', 'organizar', 'cronograma', 'agenda', 'planejar'],
    saudacao: ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'eae'],
    despedida: ['tchau', 'obrigado', 'valeu', 'até logo', 'até mais', 'bye'],
    sair: ['sair', 'cancelar', 'parar', 'reiniciar', 'começar de novo', 'recomeçar', 'volta', 'voltar'],
    // Respostas afirmativas e de continuação
    continuar: ['ok', 'sim', 'vamos', 'continuar', 'pode ser', 'beleza', 'certo', 'perfeito', 'ótimo', 'legal', 'show', 'vamos lá', 'bora', 'dale', 'isso aí', 'correto', 'exato']
  };

  async analyzeIntent(message: string, sessionId: string): Promise<IntentAnalysisResult> {
    try {
      const msg = message.toLowerCase().trim();
      let bestIntent: Intent = 'unclear';
      let bestScore = 0;

      // Verificações específicas primeiro (para casos exatos)
      if (['oi', 'olá', 'ola', 'eae', 'oii'].includes(msg)) {
        ChatLogger.logIntent(sessionId, 'saudacao', 1.0, message);
        return { intent: 'saudacao', confidence: 1.0, entities: {} };
      }

      if (msg.includes('bom dia') || msg.includes('boa tarde') || msg.includes('boa noite')) {
        ChatLogger.logIntent(sessionId, 'saudacao', 1.0, message);
        return { intent: 'saudacao', confidence: 1.0, entities: {} };
      }

      if (['tchau', 'obrigado', 'obrigada', 'valeu', 'bye'].includes(msg)) {
        ChatLogger.logIntent(sessionId, 'despedida', 1.0, message);
        return { intent: 'despedida', confidence: 1.0, entities: {} };
      }

      if (['sair', 'cancelar', 'parar', 'reiniciar', 'recomeçar', 'volta', 'voltar'].includes(msg) ||
          msg.includes('começar de novo') || msg.includes('começar denovo') ||
          msg.includes('sair daqui') || msg.includes('cancelar tudo')) {
        ChatLogger.logIntent(sessionId, 'sair', 1.0, message);
        return { intent: 'sair', confidence: 1.0, entities: {} };
      }

      // Verificar respostas afirmativas simples
      if (['ok', 'sim', 'certo', 'beleza', 'perfeito', 'ótimo', 'legal', 'show', 'bora', 'dale'].includes(msg) ||
          msg.includes('vamos') || msg.includes('continuar') || msg.includes('pode ser') ||
          msg.includes('vamos lá') || msg.includes('isso aí')) {
        ChatLogger.logIntent(sessionId, 'continuar', 1.0, message);
        return { intent: 'continuar', confidence: 1.0, entities: {} };
      }

      // Verificar negações explícitas
      if (msg.includes('não quero') || msg.includes('nao quero') ||
          msg.includes('não preciso') || msg.includes('nao preciso') ||
          msg.includes('cancela') || msg.includes('para')) {
        ChatLogger.logIntent(sessionId, 'unclear', 0.9, message);
        return { intent: 'unclear', confidence: 0.9, entities: {} };
      }

      // Verificar cada intenção com palavras-chave
      for (const [intent, keywords] of Object.entries(this.keywords)) {
        let score = 0;
        const totalKeywords = keywords.length;

        // Contar quantas palavras-chave foram encontradas
        for (const keyword of keywords) {
          if (msg.includes(keyword)) {
            score += 1;
          }
        }

        // Calcular score normalizado
        const normalizedScore = score / totalKeywords;

        if (normalizedScore > bestScore) {
          bestScore = normalizedScore;
          bestIntent = intent as Intent;
        }
      }

      // Se não encontrou nenhuma palavra-chave significativa, tentar LLM
      if (bestScore < 0.2) {
        const llmResult = await this.analyzeLLMIntent(message, sessionId);
        if (llmResult.confidence > 0.6) {
          ChatLogger.logIntent(sessionId, llmResult.intent, llmResult.confidence, message);
          return llmResult;
        }
        bestIntent = 'unclear';
        bestScore = 0;
      }

      ChatLogger.logIntent(sessionId, bestIntent, bestScore, message);

      return {
        intent: bestIntent,
        confidence: bestScore,
        entities: {}
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

  private async analyzeLLMIntent(message: string, sessionId: string): Promise<IntentAnalysisResult> {
    try {
      // Importar OpenAI apenas quando necessário
      const { OpenAIService } = await import('./openai');

      // Buscar contexto da conversa
      const { ConversationContextManager } = await import('./conversation-context');
      const context = ConversationContextManager.getContext(sessionId);
      const recentHistory = ConversationContextManager.getConversationHistory(sessionId).slice(-6);

      // Preparar contexto para LLM
      let contextString = '';
      if (recentHistory.length > 0) {
        contextString = '\nContexto das últimas mensagens:\n' +
          recentHistory.map(msg => `${msg.sender === 'user' ? 'Professor' : 'Assistente'}: ${msg.text}`).join('\n') + '\n';
      }

      if (context.currentIntent) {
        contextString += `\nIntenção atual: ${context.currentIntent}\n`;
      }

      const prompt = `Você é um classificador de intenções para um assistente educacional. Analise a mensagem do professor e determine a intenção.

INTENÇÕES POSSÍVEIS:
- plano_aula: Quer criar/elaborar planos de aula
- tira_duvidas: Tem dúvidas educacionais, quer explicações
- planejamento_semanal: Quer organizar/planejar semana de trabalho
- continuar: Respostas afirmativas (sim, ok, vamos, etc) ou quer continuar algo
- saudacao: Cumprimentos iniciais
- despedida: Agradecimentos ou despedidas
- sair: Quer cancelar/reiniciar conversa
- unclear: Não conseguiu identificar

${contextString}

Mensagem atual do professor: "${message}"

Responda APENAS no formato JSON:
{"intent": "nome_da_intencao", "confidence": 0.0}

Confidence de 0.0 a 1.0 (seja conservador - use confidence alta apenas quando muito confiante).`;

      const openai = await import('openai');
      const client = new openai.default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é um classificador de intenções preciso e conservador.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 100,
        temperature: 0.1
      });

      const result = response.choices[0]?.message?.content?.trim();
      if (!result) {
        return { intent: 'unclear', confidence: 0, entities: {} };
      }

      const parsed = JSON.parse(result);
      return {
        intent: parsed.intent,
        confidence: parsed.confidence,
        entities: {}
      };

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { context: 'LLM_intent_analysis', message });
      return { intent: 'unclear', confidence: 0, entities: {} };
    }
  }

  async addTrainingData(intent: string, utterance: string) {
    // Para este sistema simples, poderíamos adicionar palavras-chave dinamicamente
    // mas por enquanto vamos manter estático
  }
}

export const simpleNlpService = new SimpleNLPService();