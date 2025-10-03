import { simpleNlpService } from './simple-nlp';
import { OpenAIService } from './openai';
import { ConversationContextManager } from './conversation-context';
import { ChatLogger } from './logger';
import { Intent, PlanoAulaData, PlanejamentoSemanalData } from '@/types';

export class MessageProcessor {
  static async processMessage(message: string, sessionId: string): Promise<string> {
    try {
      const msg = message.toLowerCase().trim();
      
      // Verificação prioritária para comando "sair" - deve funcionar em qualquer momento
      if (['sair', 'cancelar', 'parar', 'reiniciar', 'recomeçar', 'volta', 'voltar'].includes(msg) ||
          msg.includes('começar de novo') || msg.includes('começar denovo') ||
          msg.includes('sair daqui') || msg.includes('cancelar tudo')) {
        return this.handleSairIntent(sessionId);
      }

      // Verificação prioritária para geração de PDF - DEVE vir antes da análise de intenção
      if (this.isPDFRequest(msg)) {
        console.log('📄 Solicitação de PDF detectada:', message);
        console.log('📄 Interrompendo processamento normal para gerar PDF');
        return this.handlePDFRequest(sessionId, message);
      }

      const currentContext = ConversationContextManager.getContext(sessionId);
      console.log('🚀 [DEBUG] processMessage iniciado:', {
        message: message.substring(0, 50),
        sessionId: sessionId.substring(0, 8),
        currentIntent: currentContext.currentIntent,
        hasCollectedData: Object.keys(currentContext.collectedData).length > 0
      });



      const currentIntent = currentContext.currentIntent;

      // Analisar intenção
      const intentAnalysis = await simpleNlpService.analyzeIntent(message, sessionId);

      // Decidir qual intenção usar: manter atual se estivermos coletando dados ou usar nova se clara
      let finalIntent = intentAnalysis.intent;
      let finalConfidence = intentAnalysis.confidence;

      // Se já temos uma intenção ativa e estamos coletando dados, manter a intenção atual
      // a menos que a nova intenção seja muito clara (confiança > 0.8)
      if (currentIntent &&
          currentIntent !== 'saudacao' &&
          currentIntent !== 'despedida' &&
          currentIntent !== 'unclear' &&
          Object.keys(currentContext.collectedData).length > 0) {

        // Se a nova intenção não é muito clara, manter a atual
        if (intentAnalysis.confidence < 0.8 || intentAnalysis.intent === 'unclear') {
          finalIntent = currentIntent;
          finalConfidence = currentContext.intentConfidence;

          ChatLogger.logIntent(sessionId, `${finalIntent} (mantida)`, finalConfidence, message);
        }
      }

      // Atualizar contexto
      ConversationContextManager.updateIntent(sessionId, finalIntent, finalConfidence);



      // Gerar resposta baseada na intenção
      return await this.generateResponseByIntent(message, sessionId, finalIntent);

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { message });
      return 'Desculpe, ocorreu um erro ao processar sua mensagem. Pode tentar novamente?';
    }
  }





  private static async extractAdditionalInfo(sessionId: string, intent: Intent) {
    const recentMessages = ConversationContextManager.getRecentUserMessages(sessionId, 3);
    const latestMessage = recentMessages[recentMessages.length - 1];
    const currentContext = ConversationContextManager.getContext(sessionId);

    if (!latestMessage) return;

    // Usar a intenção atual se estivermos em coleta de dados
    const effectiveIntent = (currentContext.currentIntent &&
                           Object.keys(currentContext.collectedData).length > 0)
                           ? currentContext.currentIntent
                           : intent;

    // Usar LLM para extrair dados de forma inteligente
    if (effectiveIntent === 'plano_aula' || effectiveIntent === 'planejamento_semanal') {
      const extractedData = await OpenAIService.extractDataFromMessage(
        latestMessage,
        effectiveIntent,
        currentContext.collectedData,
        sessionId
      );

      // Atualizar dados coletados com o que foi extraído
      for (const [key, value] of Object.entries(extractedData)) {
        if (value) {
          ConversationContextManager.updateCollectedData(sessionId, key, value);
        }
      }
    }
  }

  // Funções antigas de extração baseadas em keywords foram removidas
  // Agora usamos extractDataFromMessage da OpenAIService que usa LLM

  /**
   * Infere o que o usuário quer continuar com base no histórico da conversa
   */
  private static async inferContinuationIntent(
    conversationHistory: Array<{ sender: string; text: string }>,
    sessionId: string
  ): Promise<Intent | null> {
    try {
      const recentHistory = conversationHistory.slice(-6).map(msg =>
        `${msg.sender === 'user' ? 'Professor' : 'Ane'}: ${msg.text}`
      ).join('\n');

      const prompt = `Analise o histórico da conversa e identifique o que o professor quer continuar fazendo.

HISTÓRICO:
${recentHistory}

O professor disse que quer "continuar". Com base no contexto, o que ele provavelmente quer fazer?

OPÇÕES:
- plano_aula: Quer criar/continuar criando um plano de aula
- planejamento_semanal: Quer criar/continuar um planejamento semanal
- tira_duvidas: Quer fazer perguntas/tirar dúvidas
- null: Não há contexto claro do que continuar

Analise:
- O que a Ane sugeriu nas últimas mensagens?
- Qual era o tópico da conversa?
- Houve algum plano/tarefa mencionado?

Retorne APENAS JSON: {"intent": "nome_ou_null", "confidence": 0.0}`;

      const openai = await import('openai');
      const client = new openai.default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é um analisador de contexto conversacional.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 100,
        temperature: 0.1
      });

      const result = response.choices[0]?.message?.content?.trim();
      if (!result) return null;

      const parsed = JSON.parse(result);
      if (parsed.confidence >= 0.7 && parsed.intent !== 'null') {
        return parsed.intent as Intent;
      }

      return null;
    } catch (error) {
      console.error('Erro ao inferir intenção de continuação:', error);
      return null;
    }
  }

  private static async generateResponseByIntent(message: string, sessionId: string, intent: Intent): Promise<string> {
    switch (intent) {
      case 'plano_aula':
        return this.handlePlanoAulaIntent(sessionId);

      case 'planejamento_semanal':
        return this.handlePlanejamentoSemanalIntent(sessionId);

      case 'tira_duvidas':
        return OpenAIService.generateResponse(message, sessionId);

      case 'saudacao':
        return await this.handleSaudacao(message, sessionId);

      case 'despedida':
        return this.handleDespedida(sessionId);

      case 'sair':
        return this.handleSairIntent(sessionId);

      case 'continuar':
        return this.handleContinuarIntent(sessionId, message);

      default:
        return this.handleUnclearIntent(message, sessionId);
    }
  }

  private static async handlePlanoAulaIntent(sessionId: string): Promise<string> {
    // Extrair informações da mensagem atual no contexto da intenção
    await this.extractAdditionalInfo(sessionId, 'plano_aula');

    const missingData = ConversationContextManager.getMissingDataForPlanoAula(sessionId);

    if (missingData.length === 0) {
      // Todos os dados coletados, gerar plano de aula
      const data = ConversationContextManager.getCollectedData(sessionId) as PlanoAulaData;
      const planoAula = await OpenAIService.generatePlanoAula(data, sessionId);

      // Gerar resposta contextual e conversacional
      const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);
      const contextualResponse = await OpenAIService.generateContextualResponse(
        'plano_aula_completo',
        {
          collectedData: data,
          conversationHistory: conversationHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
          }))
        },
        sessionId
      );

      // IMPORTANTE: Limpar completamente o contexto após gerar o plano
      ConversationContextManager.resetContextKeepingHistory(sessionId);

      return `${contextualResponse}\n\n${planoAula}`;
    } else {
      // Ainda faltam dados, perguntar especificamente
      return await this.askForMissingPlanoAulaData(missingData, sessionId);
    }
  }

  private static async handlePlanejamentoSemanalIntent(sessionId: string): Promise<string> {
    // Extrair informações da mensagem atual no contexto da intenção
    await this.extractAdditionalInfo(sessionId, 'planejamento_semanal');

    const missingData = ConversationContextManager.getMissingDataForPlanejamentoSemanal(sessionId);

    if (missingData.length === 0) {
      // Todos os dados coletados, gerar planejamento semanal
      const data = ConversationContextManager.getCollectedData(sessionId) as PlanejamentoSemanalData;
      const planejamento = await OpenAIService.generatePlanejamentoSemanal(data, sessionId);

      // Gerar resposta contextual e conversacional
      const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);
      const contextualResponse = await OpenAIService.generateContextualResponse(
        'planejamento_semanal_completo',
        {
          collectedData: data,
          conversationHistory: conversationHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
          }))
        },
        sessionId
      );

      // IMPORTANTE: Limpar completamente o contexto após gerar o planejamento
      ConversationContextManager.resetContextKeepingHistory(sessionId);

      return `${contextualResponse}\n\n${planejamento}`;
    } else {
      // Ainda faltam dados
      return await this.askForMissingPlanejamentoSemanalData(missingData, sessionId);
    }
  }

  private static async askForMissingPlanoAulaData(missingData: string[], sessionId: string): Promise<string> {
    const collectedData = ConversationContextManager.getCollectedData(sessionId);
    const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);

    // Gera a pergunta conversacional usando a LLM para todos os dados faltantes
    const question = await OpenAIService.generateConversationalQuestion(
      missingData.join(', '), // Passa todos os campos faltantes
      collectedData,
      conversationHistory.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      })),
      sessionId
    );

    return question;
  }

  private static async askForMissingPlanejamentoSemanalData(missingData: string[], sessionId: string): Promise<string> {
    const collectedData = ConversationContextManager.getCollectedData(sessionId);
    const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);

    // Gera a pergunta conversacional usando a LLM para todos os dados faltantes
    const question = await OpenAIService.generateConversationalQuestion(
      missingData.join(', '), // Passa todos os campos faltantes
      collectedData,
      conversationHistory.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      })),
      sessionId
    );

    return question;
  }

  private static async handleSaudacao(message: string, sessionId: string): Promise<string> {
    console.log('👋 [DEBUG] Processando saudação com LLM');

    try {
      const { OpenAIService } = await import('./openai');
      const openai = await import('openai');
      const client = new openai.default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const promptParaSaudacao = `
A mensagem do professor: "${message}"

➡️ Regras de comportamento:

1. SEMPRE reconheça saudações e "small talk" (ex.: "oi, tudo bem?", "bom dia!", "tudo certo?", "como você pode ajudar?") antes de qualquer instrução, de forma natural e acolhedora.

2. Sua apresentação deve sempre usar como base a mensagem abaixo, adaptando a linguagem para soar natural e próxima do professor:
"Oi, eu sou a ANE, sua assistente pedagógica. 👩🏽‍🏫💡  
Quero te mostrar rapidinho como posso te ajudar por aqui, tudo bem?"

3. SEMPRE explique o que você consegue fazer, mesmo quando houver uma solicitação específica.
Liste claramente suas principais funções:
👉🏽 Crio planejamentos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Para te ajudar preciso saber o ano e tema ou habilidade do seu planejamento

4. Se o professor já trouxer uma solicitação, adapte a explicação acima ao contexto e incentive que ele dê mais detalhes.

5. SEMPRE finalize mostrando que é um prazer ajudar.

EXEMPLOS DE RESPOSTAS:

Se o professor mandar apenas "Oi, tudo bem?":
"Oi, tudo bem? Eu sou a ANE, sua assistente pedagógica 👩🏽‍🏫💡.
Quero te mostrar rapidinho como posso te ajudar por aqui.
👉🏽 Crio planejamentos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Para começar, me conta o ano e o tema ou habilidade que você está planejando?
Vai ser um prazer te ajudar!"

Se o professor mandar "Como você pode ajudar?" ou "O que você faz?":
"Oi! Eu sou a ANE, sua assistente pedagógica 👩🏽‍🏫💡.
Que bom você perguntar! Vou te mostrar rapidinho como posso te ajudar por aqui.
👉🏽 Crio planejamentos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Para começar, me conta o ano e o tema ou habilidade que você está planejando?
Vai ser um prazer te ajudar!"

Se o professor mandar "Oi, bom dia, me ajuda a planejar uma aula sobre frações para o 6º ano?":
"Oi, bom dia! Eu sou a ANE, sua assistente pedagógica 👩🏽‍🏫💡.
Que ótimo você já trazer seu pedido! Antes de começarmos, deixa eu te contar rapidinho como posso te ajudar:
👉🏽 Crio planejamentos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Você mencionou frações para o 6º ano. Quer que eu sugira um planejamento completo com atividades ou prefere só ideias de metodologias para essa habilidade?"
`;

      const response = await client.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [
          { role: 'system', content: promptParaSaudacao },
          { role: 'user', content: message }
        ],
        max_tokens: 300,
        temperature: 0.7
      });

      const botResponse = response.choices[0]?.message?.content ||
        `Oi! Eu sou a ANE, sua assistente pedagógica. Como posso te ajudar?`;

      console.log('✅ [DEBUG] Resposta LLM para saudação gerada');
      return botResponse;

    } catch (error) {
      console.error('❌ [DEBUG] Erro no LLM para saudação:', error);
      // Fallback em caso de erro
      return `Oi! Eu sou a ANE, sua assistente pedagógica. 👩🏽‍🏫💡 Como posso te ajudar hoje?`;
    }
  }

  private static async handleDespedida(sessionId: string): Promise<string> {
    const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);

    const response = await OpenAIService.generateContextualResponse(
      'despedida',
      {
        conversationHistory: conversationHistory.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        }))
      },
      sessionId
    );

    ConversationContextManager.clearContext(sessionId);
    return response;
  }

  private static async handleSairIntent(sessionId: string): Promise<string> {
    // Registrar a mensagem do usuário no histórico antes de resetar o contexto
    ConversationContextManager.addMessage(sessionId, {
      id: `user_${Date.now()}`,
      text: '[Usuário solicitou reiniciar conversa]',
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    });

    const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);

    const response = await OpenAIService.generateContextualResponse(
      'reiniciar',
      {
        conversationHistory: conversationHistory.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        }))
      },
      sessionId
    );

    ConversationContextManager.resetContextKeepingHistory(sessionId);

    // Registrar a resposta do bot no histórico
    ConversationContextManager.addMessage(sessionId, {
      id: `bot_${Date.now()}`,
      text: response,
      sender: 'bot',
      timestamp: new Date(),
      type: 'text'
    });

    return response;
  }

  /**
   * Verifica se a mensagem é uma solicitação de PDF
   */
  private static isPDFRequest(message: string): boolean {
    const msg = message.toLowerCase().trim();
    
    const pdfKeywords = [
      'gerar pdf',
      'gerar em pdf',
      'fazer pdf',
      'criar pdf',
      'baixar pdf',
      'exportar pdf',
      'pdf do plano',
      'plano em pdf',
      'baixar plano',
      'exportar plano',
      'compartilhar pdf',
      'enviar pdf',
      'quero pdf',
      'preciso pdf',
      'fazer download',
      'baixar arquivo',
      'exportar arquivo',
      'quero gerar o pdf',
      'quero gerar pdf',
      'gerar o pdf',
      'fazer o pdf',
      'criar o pdf',
      'baixar o pdf',
      'gere o pdf',
      'gera o pdf',
      'gere pdf',
      'gera pdf'
    ];

    // Verificação mais robusta - qualquer menção a PDF deve ser tratada como solicitação
    const hasPDFKeyword = pdfKeywords.some(keyword => msg.includes(keyword));
    const hasPDFWord = msg.includes('pdf');
    const hasDownloadIntent = msg.includes('baixar') || msg.includes('download') || msg.includes('exportar');
    const hasGenerateIntent = msg.includes('gerar') || msg.includes('fazer') || msg.includes('criar') || msg.includes('gere') || msg.includes('gera');
    
    // Se contém PDF e alguma ação de geração/download, é solicitação de PDF
    const isPDFRequest = hasPDFKeyword || (hasPDFWord && (hasDownloadIntent || hasGenerateIntent));
    
    console.log('🔍 [DEBUG] Verificação de PDF:', {
      message: msg,
      hasPDFKeyword,
      hasPDFWord,
      hasDownloadIntent,
      hasGenerateIntent,
      isPDFRequest
    });
    
    return isPDFRequest;
  }

  /**
   * Processa solicitação de PDF
   */
  private static async handlePDFRequest(sessionId: string, message: string): Promise<string> {
    try {
      console.log('📄 Processando solicitação de PDF...');
      
      // Buscar o último plano de aula gerado no histórico
      const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);
      const lastPlanoMessage = conversationHistory
        .filter(msg => msg.sender === 'bot' && 
                      (msg.text.includes('Prontinho! Aqui está o seu plano de aula') || 
                       msg.text.includes('### Plano de Aula:')))
        .pop();

      if (!lastPlanoMessage) {
        return 'Não encontrei um plano de aula recente para gerar o PDF. Você precisa gerar um plano de aula primeiro! 😊';
      }

      // Extrair o conteúdo do plano (remover a parte de próximos passos)
      const planoContent = this.extractPlanoContent(lastPlanoMessage.text);
      
      if (!planoContent) {
        return 'Não consegui extrair o conteúdo do plano de aula. Tente gerar um novo plano! 😊';
      }

      // Gerar resposta informando que o PDF está sendo criado
      const response = `Perfeito! Vou gerar o PDF do seu plano de aula para você! 📄✨

O arquivo será baixado automaticamente em alguns segundos.

Enquanto isso, posso te ajudar com:
👉🏽 Criar outro plano de aula
👉🏽 Ajustar este plano
👉🏽 Planejamento semanal
👉🏽 Tirar dúvidas pedagógicas

O que você gostaria de fazer agora?`;

      // Armazenar o conteúdo do plano para geração de PDF
      ConversationContextManager.updateCollectedData(sessionId, 'lastPlanoContent', planoContent);

      return response;

    } catch (error) {
      console.error('❌ Erro ao processar solicitação de PDF:', error);
      ChatLogger.logError(sessionId, error as Error, { context: 'pdf_request' });
      return 'Desculpe, ocorreu um erro ao gerar o PDF. Tente novamente! 😊';
    }
  }

  /**
   * Extrai o conteúdo do plano de aula da mensagem
   */
  private static extractPlanoContent(message: string): string | null {
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


  private static async handleContinuarIntent(sessionId: string, message: string): Promise<string> {
    const context = ConversationContextManager.getContext(sessionId);

    // Se já temos uma intenção ativa, continuar com ela
    if (context.currentIntent && context.currentIntent !== 'saudacao' && context.currentIntent !== 'continuar') {
      return this.generateResponseByIntent(message, sessionId, context.currentIntent);
    }

    // Se não temos intenção ativa, analisar histórico para encontrar sugestão anterior
    const recentMessages = ConversationContextManager.getRecentUserMessages(sessionId, 5);
    const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);

    // Usar LLM para inferir o que o usuário quer continuar baseado no contexto
    const inferredIntent = await this.inferContinuationIntent(conversationHistory, sessionId);

    if (inferredIntent) {
      ConversationContextManager.updateIntent(sessionId, inferredIntent, 0.9);
      return this.generateResponseByIntent(message, sessionId, inferredIntent);
    }

    // Se não conseguiu identificar contexto, gerar resposta contextual
    return await OpenAIService.generateContextualResponse(
      'continuar_sem_contexto',
      {
        message,
        conversationHistory: conversationHistory.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        }))
      },
      sessionId
    );
  }

  private static async handleUnclearIntent(message: string, sessionId: string): Promise<string> {
    const msg = message.toLowerCase();
    const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);

    // Se o usuário diz que não quer algo ou está negando
    if (msg.includes('não quero') || msg.includes('nao quero') ||
        msg.includes('não preciso') || msg.includes('nao preciso')) {
      return await OpenAIService.generateContextualResponse(
        'negacao',
        {
          message,
          conversationHistory: conversationHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
          }))
        },
        sessionId
      );
    }

    // Verificar se parece uma pergunta (tira-dúvidas)
    if (msg.includes('?') || msg.includes('como') || msg.includes('que') ||
        msg.includes('qual') || msg.includes('quando') || msg.includes('onde') ||
        msg.includes('por que') || msg.includes('porque')) {

      // Processar como tira-dúvidas
      return await OpenAIService.generateResponse(message, sessionId);
    }

    // Fallback geral - intenção não clara
    return await OpenAIService.generateContextualResponse(
      'unclear_intent',
      {
        message,
        conversationHistory: conversationHistory.map(msg => ({
          role: msg.sender === 'user' ? 'user' : 'assistant',
          content: msg.text
        }))
      },
      sessionId
    );
  }
}