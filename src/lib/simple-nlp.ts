import { Intent, IntentAnalysisResult } from '@/types';
import { ChatLogger } from './logger';

export class SimpleNLPService {
  private keywords = {
    plano_aula: ['plano', 'aula', 'atividade', 'ensinar', 'criar', 'preparar', 'lecionar', 'lição', 'conteúdo', 'matéria'],
    tira_duvidas: ['dúvida', 'duvida', 'ajuda', 'explica', 'como', 'não entendo', 'pergunta', 'questão', 'esclarecer'],
    planejamento_semanal: ['semana', 'semanal', 'planejamento', 'organizar', 'cronograma', 'agenda', 'planejar'],
    saudacao: ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'eae', 'como você pode ajudar', 'o que você faz', 'funcionalidades', 'capaz de fazer', 'como posso te ajudar', 'o que consegue fazer'],
    despedida: ['tchau', 'obrigado', 'valeu', 'até logo', 'até mais', 'bye'],
    sair: ['sair', 'cancelar', 'parar', 'reiniciar', 'começar de novo', 'recomeçar', 'volta', 'voltar'],
    // Respostas afirmativas e de continuação
    continuar: ['ok', 'sim', 'vamos', 'continuar', 'pode ser', 'beleza', 'certo', 'perfeito', 'ótimo', 'legal', 'show', 'vamos lá', 'bora', 'dale', 'isso aí', 'correto', 'exato'],
    // Revisão de plano de aula
    revisar_plano: ['alterar', 'mudar', 'trocar', 'modificar', 'ajustar', 'revisar', 'atualizar', 'dificuldade', 'ano', 'tema', 'fácil', 'médio', 'difícil', 'facil', 'medio', 'dificil']
  };

  async analyzeIntent(message: string, sessionId: string): Promise<IntentAnalysisResult> {
    try {
      const msg = message.toLowerCase().trim();

      // ESTRATÉGIA: Priorizar LLM para análise contextual, usar keywords apenas como fallback

      // Primeiro: tentar análise com LLM (mais inteligente e contextual)
      const llmResult = await this.analyzeLLMIntent(message, sessionId);

      // Se LLM retornar resultado com confiança razoável, usar ele
      if (llmResult.confidence >= 0.65) {
        ChatLogger.logIntent(sessionId, llmResult.intent, llmResult.confidence, message);
        return llmResult;
      }

      // Fallback para keywords apenas em casos muito específicos e óbvios
      // (saudações muito curtas, comandos explícitos)

      if (['oi', 'olá', 'ola', 'eae', 'oii'].includes(msg)) {
        ChatLogger.logIntent(sessionId, 'saudacao', 1.0, message);
        return { intent: 'saudacao', confidence: 1.0, entities: {} };
      }

      if (['tchau', 'obrigado', 'obrigada', 'valeu', 'bye'].includes(msg)) {
        ChatLogger.logIntent(sessionId, 'despedida', 1.0, message);
        return { intent: 'despedida', confidence: 1.0, entities: {} };
      }

      if (['sair', 'cancelar', 'parar', 'reiniciar', 'recomeçar'].includes(msg)) {
        ChatLogger.logIntent(sessionId, 'sair', 1.0, message);
        return { intent: 'sair', confidence: 1.0, entities: {} };
      }

      if (['ok', 'sim', 'certo', 'beleza', 'show', 'dale'].includes(msg)) {
        ChatLogger.logIntent(sessionId, 'continuar', 0.9, message);
        return { intent: 'continuar', confidence: 0.9, entities: {} };
      }

      // Se chegou aqui, LLM teve baixa confiança e não é caso óbvio
      // Usar resultado da LLM mesmo com baixa confiança (melhor que keywords)
      ChatLogger.logIntent(sessionId, llmResult.intent, llmResult.confidence, message);
      return llmResult;

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { message });

      // Fallback final: keywords simples
      return this.keywordFallback(message, sessionId);
    }
  }

  private keywordFallback(message: string, sessionId: string): IntentAnalysisResult {
    const msg = message.toLowerCase().trim();
    let bestIntent: Intent = 'unclear';
    let bestScore = 0;

    // Verificar cada intenção com palavras-chave
    for (const [intent, keywords] of Object.entries(this.keywords)) {
      let score = 0;
      for (const keyword of keywords) {
        if (msg.includes(keyword)) {
          score += 1;
        }
      }
      const normalizedScore = score / keywords.length;
      if (normalizedScore > bestScore) {
        bestScore = normalizedScore;
        bestIntent = intent as Intent;
      }
    }

    ChatLogger.logIntent(sessionId, bestIntent, bestScore, message);
    return { intent: bestIntent, confidence: bestScore, entities: {} };
  }

  private async analyzeLLMIntent(message: string, sessionId: string): Promise<IntentAnalysisResult> {
    try {
      // Importar OpenAI apenas quando necessário
      // const { OpenAIService } = await import('./openai');

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
- plano_aula: Quer criar/elaborar planos de aula (ex: "quero um plano de aula", "criar aula sobre...")
- tira_duvidas: Tem dúvidas educacionais, quer explicações
- planejamento_semanal: Quer organizar/planejar semana de trabalho
- continuar: Respostas afirmativas (sim, ok, vamos, etc) ou quer continuar algo
- saudacao: Cumprimentos iniciais, perguntas sobre funcionalidades ("como você pode ajudar?", "o que você faz?", "o que consegue fazer?")
- despedida: Agradecimentos ou despedidas
- sair: Quer cancelar/reiniciar conversa
- revisar_plano: Quer alterar/mudar/revisar um plano já gerado (ex: "alterar a dificuldade", "mudar o ano", "trocar o tema", "fazer mais fácil", "tornar mais difícil")
- unclear: Não conseguiu identificar

IMPORTANTE: 
- Perguntas sobre funcionalidades como "como você pode ajudar?", "o que você faz?", "o que consegue fazer?", "quais suas funcionalidades?" devem ser classificadas como "saudacao" com alta confiança.
- Comandos de geração/exportação como "gere o pdf", "baixar pdf", "exportar" devem ser classificados como "unclear" com baixa confiança, pois serão tratados por lógica específica.

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

  async addTrainingData(_intent: string, _utterance: string) {
    // Para este sistema simples, poderíamos adicionar palavras-chave dinamicamente
    // mas por enquanto vamos manter estático
  }
}

export const simpleNlpService = new SimpleNLPService();