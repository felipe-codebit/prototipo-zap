import { simpleNlpService } from './simple-nlp';
import { OpenAIService } from './openai';
import { ConversationContextManager } from './conversation-context';
import { ChatLogger } from './logger';
import { Intent, PlanoAulaData, PlanejamentoSemanalData } from '@/types';

export class MessageProcessor {
  static async processMessage(message: string, sessionId: string): Promise<string> {
    try {
      // Verificação prioritária para comando "sair" - deve funcionar em qualquer momento
      const msg = message.toLowerCase().trim();
      if (['sair', 'cancelar', 'parar', 'reiniciar', 'recomeçar', 'volta', 'voltar'].includes(msg) ||
          msg.includes('começar de novo') || msg.includes('começar denovo') ||
          msg.includes('sair daqui') || msg.includes('cancelar tudo')) {
        return this.handleSairIntent(sessionId);
      }

      const currentContext = ConversationContextManager.getContext(sessionId);
      const waitingFor = ConversationContextManager.getWaitingFor(sessionId);

      console.log('🚀 [DEBUG] processMessage iniciado:', {
        message: message.substring(0, 50),
        sessionId: sessionId.substring(0, 8),
        waitingFor,
        currentIntent: currentContext.currentIntent,
        hasCollectedData: Object.keys(currentContext.collectedData).length > 0
      });

      // Se estamos esperando uma resposta específica, verificar se usuário quer cancelar primeiro
      if (waitingFor) {
        console.log('⏳ [DEBUG] Sistema está waitingFor:', waitingFor);

        // Verificar se o usuário quer cancelar ou mudar de intenção
        const intentAnalysis = await simpleNlpService.analyzeIntent(message, sessionId);
        console.log('🧠 [DEBUG] Análise de intenção durante waitingFor:', intentAnalysis);

        // Se detectou negação explícita, cancelar waitingFor
        if (message.toLowerCase().includes('não quero') ||
            message.toLowerCase().includes('nao quero') ||
            message.toLowerCase().includes('cancela')) {

          console.log('🔄 [DEBUG] Cancelando waitingFor - negação detectada');
          ConversationContextManager.clearWaitingFor(sessionId);
          ConversationContextManager.resetContextKeepingHistory(sessionId);
          console.log('🗑️ [DEBUG] Contexto resetado por negação');
          // Continuar com o processamento normal da nova intenção
        }
        // Se detectou intenção DIFERENTE da atual com alta confiança, cancelar waitingFor
        else if (intentAnalysis.confidence > 0.7 &&
                 intentAnalysis.intent !== currentContext.currentIntent &&
                 intentAnalysis.intent !== 'continuar' &&
                 intentAnalysis.intent !== 'unclear') {

          console.log('🔄 [DEBUG] Cancelando waitingFor - nova intenção DIFERENTE detectada:', {
            nova: intentAnalysis.intent,
            atual: currentContext.currentIntent
          });
          ConversationContextManager.clearWaitingFor(sessionId);
          // Continuar com o processamento normal da nova intenção
        } else {
          console.log('✅ [DEBUG] Tentando processar como resposta específica');
          // Tentar processar como resposta específica
          const response = await this.processSpecificResponse(message, sessionId, waitingFor);
          if (response) {
            console.log('🎉 [DEBUG] Resposta específica processada com sucesso!');
            return response;
          }

          console.log('🤖 [DEBUG] Falha no processamento tradicional, tentando LLM como fallback');
          // Se falhou, tentar com LLM baseado no contexto
          const llmResponse = await this.processResponseWithLLM(message, sessionId, waitingFor);
          if (llmResponse) {
            console.log('🎉 [DEBUG] LLM processou resposta com sucesso!');
            return llmResponse;
          }

          console.log('❌ [DEBUG] Falha ao processar resposta específica, limpando waitingFor');
          // Se não conseguiu processar como resposta específica, limpar waitingFor
          ConversationContextManager.clearWaitingFor(sessionId);
        }
      }

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

      // Não processar entidades automaticamente para evitar confusão
      // A extração agora é feita apenas quando esperamos uma resposta específica

      // Gerar resposta baseada na intenção
      return await this.generateResponseByIntent(message, sessionId, finalIntent);

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { message });
      return 'Desculpe, ocorreu um erro ao processar sua mensagem. Pode tentar novamente?';
    }
  }

  private static async processSpecificResponse(message: string, sessionId: string, waitingFor: string): Promise<string | null> {
    const currentContext = ConversationContextManager.getContext(sessionId);
    const currentIntent = currentContext.currentIntent;

    console.log('🔍 [DEBUG] processSpecificResponse:', {
      message,
      waitingFor,
      currentIntent,
      collectedData: currentContext.collectedData,
      sessionId: sessionId.substring(0, 8)
    });

    if (!currentIntent) {
      console.log('❌ [DEBUG] Sem currentIntent, retornando null');
      return null;
    }

    switch (waitingFor) {
      case 'ano':
        console.log('📚 [DEBUG] Processando ano para plano_aula');
        if (currentIntent === 'plano_aula') {
          const anoProcessado = this.extractAnoEscolar(message);
          console.log('✅ [DEBUG] Ano extraído:', anoProcessado);

          ConversationContextManager.updateCollectedData(sessionId, 'ano', anoProcessado);
          ConversationContextManager.clearWaitingFor(sessionId);

          console.log('🎯 [DEBUG] Chamando handlePlanoAulaIntent após coletar ano');
          return await this.handlePlanoAulaIntent(sessionId, message);
        } else {
          console.log('❌ [DEBUG] currentIntent não é plano_aula:', currentIntent);
        }
        break;

      case 'tema':
        console.log('📖 [DEBUG] Processando tema para plano_aula');
        if (currentIntent === 'plano_aula') {
          ConversationContextManager.updateCollectedData(sessionId, 'tema', message.trim());
          ConversationContextManager.clearWaitingFor(sessionId);
          console.log('🎯 [DEBUG] Chamando handlePlanoAulaIntent após coletar tema');
          return await this.handlePlanoAulaIntent(sessionId, message);
        } else {
          console.log('❌ [DEBUG] currentIntent não é plano_aula para tema:', currentIntent);
        }
        break;

      case 'dificuldade':
        console.log('⚖️ [DEBUG] Processando dificuldade para plano_aula');
        if (currentIntent === 'plano_aula') {
          const msg = message.toLowerCase().trim();
          let difficulty = 'medio';

          if (msg.includes('fácil') || msg.includes('facil') || msg.includes('simples')) {
            difficulty = 'facil';
          } else if (msg.includes('difícil') || msg.includes('dificil') || msg.includes('avançado')) {
            difficulty = 'dificil';
          }

          console.log('✅ [DEBUG] Dificuldade processada:', difficulty);
          ConversationContextManager.updateCollectedData(sessionId, 'nivelDificuldade', difficulty);
          ConversationContextManager.clearWaitingFor(sessionId);
          console.log('🎯 [DEBUG] Chamando handlePlanoAulaIntent após coletar dificuldade');
          return await this.handlePlanoAulaIntent(sessionId, message);
        } else {
          console.log('❌ [DEBUG] currentIntent não é plano_aula para dificuldade:', currentIntent);
        }
        break;

      case 'data_inicio':
        if (currentIntent === 'planejamento_semanal') {
          ConversationContextManager.updateCollectedData(sessionId, 'dataInicio', message.trim());
          ConversationContextManager.clearWaitingFor(sessionId);
          return await this.handlePlanejamentoSemanalIntent(sessionId, message);
        }
        break;
    }

    console.log('❌ [DEBUG] Nenhum case processado em processSpecificResponse');
    return null;
  }

  private static extractAnoEscolar(message: string): string {
    const msg = message.toLowerCase().trim();

    console.log('🔤 [DEBUG] Extraindo ano de:', msg);

    // Mapear variações comuns
    if (msg.includes('primeiro') || msg.includes('1º') || msg === '1') return '1º ano';
    if (msg.includes('segundo') || msg.includes('2º') || msg === '2') return '2º ano';
    if (msg.includes('terceiro') || msg.includes('3º') || msg === '3') return '3º ano';
    if (msg.includes('quarto') || msg.includes('4º') || msg === '4') return '4º ano';
    if (msg.includes('quinto') || msg.includes('5º') || msg === '5') return '5º ano';
    if (msg.includes('sexto') || msg.includes('6º') || msg === '6') return '6º ano';
    if (msg.includes('sétimo') || msg.includes('7º') || msg === '7') return '7º ano';
    if (msg.includes('oitavo') || msg.includes('8º') || msg === '8') return '8º ano';
    if (msg.includes('nono') || msg.includes('9º') || msg === '9') return '9º ano';
    if (msg.includes('médio') || msg.includes('medio')) return 'Ensino Médio';

    // Se não encontrou padrão, usar texto original
    console.log('⚠️ [DEBUG] Não encontrou padrão específico, usando original');
    return message.trim();
  }

  private static async processResponseWithLLM(message: string, sessionId: string, waitingFor: string): Promise<string | null> {
    try {
      console.log('🤖 [DEBUG] Iniciando processamento LLM para waitingFor:', waitingFor);

      const context = ConversationContextManager.getContext(sessionId);
      const recentHistory = ConversationContextManager.getConversationHistory(sessionId).slice(-4);

      // Construir contexto para LLM
      let contextString = 'Histórico recente da conversa:\n';
      recentHistory.forEach(msg => {
        contextString += `${msg.sender === 'user' ? 'Professor' : 'Assistente'}: ${msg.text}\n`;
      });

      let prompt = '';

      switch (waitingFor) {
        case 'ano':
          prompt = `${contextString}

Analise a conversa acima. O assistente está perguntando sobre o ano escolar para criar um plano de aula.
A mensagem atual do professor é: "${message}"

Identifique o ano escolar mencionado pelo professor. Responda APENAS com o ano no formato adequado (ex: "2º ano", "5º ano", "Ensino Médio").
Se não conseguir identificar claramente, responda apenas "UNCLEAR".`;
          break;

        case 'tema':
          prompt = `${contextString}

Analise a conversa acima. O assistente está perguntando sobre o tema ou habilidade BNCC para o plano de aula.
A mensagem atual do professor é: "${message}"

Identifique o tema ou habilidade BNCC mencionado pelo professor. Responda APENAS com o tema/habilidade identificado.
Se não conseguir identificar claramente, responda apenas "UNCLEAR".`;
          break;

        case 'dificuldade':
          prompt = `${contextString}

Analise a conversa acima. O assistente está perguntando sobre o nível de dificuldade para o plano de aula.
A mensagem atual do professor é: "${message}"

Identifique o nível de dificuldade mencionado. Responda APENAS com: "facil", "medio" ou "dificil".
Se não conseguir identificar claramente, responda apenas "UNCLEAR".`;
          break;

        case 'data_inicio':
          prompt = `${contextString}

Analise a conversa acima. O assistente está perguntando sobre a data de início para o planejamento semanal.
A mensagem atual do professor é: "${message}"

Identifique a data de início mencionada pelo professor. Responda APENAS com a data identificada.
Se não conseguir identificar claramente, responda apenas "UNCLEAR".`;
          break;

        default:
          console.log('❌ [DEBUG] waitingFor não suportado pelo LLM:', waitingFor);
          return null;
      }

      const { OpenAIService } = await import('./openai');
      const openai = await import('openai');
      const client = new openai.default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é um assistente preciso que extrai informações específicas de conversas.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.1
      });

      const extractedValue = response.choices[0]?.message?.content?.trim();
      console.log('🧠 [DEBUG] LLM extraiu valor:', extractedValue);

      if (!extractedValue || extractedValue === 'UNCLEAR') {
        console.log('❌ [DEBUG] LLM não conseguiu extrair valor claro');
        return null;
      }

      // Processar valor extraído
      switch (waitingFor) {
        case 'ano':
          ConversationContextManager.updateCollectedData(sessionId, 'ano', extractedValue);
          ConversationContextManager.clearWaitingFor(sessionId);
          console.log('✅ [DEBUG] LLM processou ano, chamando handlePlanoAulaIntent');
          return await this.handlePlanoAulaIntent(sessionId, message);

        case 'tema':
          ConversationContextManager.updateCollectedData(sessionId, 'tema', extractedValue);
          ConversationContextManager.clearWaitingFor(sessionId);
          console.log('✅ [DEBUG] LLM processou tema, chamando handlePlanoAulaIntent');
          return await this.handlePlanoAulaIntent(sessionId, message);

        case 'dificuldade':
          ConversationContextManager.updateCollectedData(sessionId, 'nivelDificuldade', extractedValue);
          ConversationContextManager.clearWaitingFor(sessionId);
          console.log('✅ [DEBUG] LLM processou dificuldade, chamando handlePlanoAulaIntent');
          return await this.handlePlanoAulaIntent(sessionId, message);

        case 'data_inicio':
          ConversationContextManager.updateCollectedData(sessionId, 'dataInicio', extractedValue);
          ConversationContextManager.clearWaitingFor(sessionId);
          console.log('✅ [DEBUG] LLM processou data, chamando handlePlanejamentoSemanalIntent');
          return await this.handlePlanejamentoSemanalIntent(sessionId, message);
      }

      return null;

    } catch (error) {
      console.error('❌ [DEBUG] Erro no processamento LLM:', error);
      return null;
    }
  }

  private static processEntities(entities: Record<string, any>, sessionId: string, intent: Intent) {
    // Processar entidades específicas para cada intenção
    switch (intent) {
      case 'plano_aula':
        if (entities.ano) {
          ConversationContextManager.updateCollectedData(sessionId, 'ano', entities.ano);
        }
        if (entities.dificuldade) {
          ConversationContextManager.updateCollectedData(sessionId, 'nivelDificuldade', entities.dificuldade);
        }
        break;

      case 'calendario_escolar':
        // Aqui poderíamos processar entidades relacionadas a datas, períodos, etc.
        break;
    }

    // Extrair informações adicionais da mensagem usando patterns
    this.extractAdditionalInfo(sessionId, intent, entities);
  }

  private static async extractAdditionalInfo(sessionId: string, intent: Intent, entities: Record<string, any>) {
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
        currentContext.waitingFor,
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
        return this.handlePlanoAulaIntent(sessionId, message);

      case 'planejamento_semanal':
        return this.handlePlanejamentoSemanalIntent(sessionId, message);

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

  private static async handlePlanoAulaIntent(sessionId: string, message: string): Promise<string> {
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

  private static async handlePlanejamentoSemanalIntent(sessionId: string, message: string): Promise<string> {
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

    let missingField: string;
    let fieldKey: string;

    if (missingData.includes('ano')) {
      missingField = 'ano';
      fieldKey = 'ano';
    } else if (missingData.includes('tema ou habilidade BNCC')) {
      missingField = 'tema ou habilidade BNCC';
      fieldKey = 'tema';
    } else if (missingData.includes('nível de dificuldade')) {
      missingField = 'nível de dificuldade';
      fieldKey = 'dificuldade';
    } else {
      return '😊 Estamos quase lá! Só preciso de mais algumas informações para criar um plano de aula perfeito para você!';
    }

    // Gera a pergunta conversacional usando a LLM
    const question = await OpenAIService.generateConversationalQuestion(
      missingField,
      collectedData,
      conversationHistory,
      sessionId
    );

    ConversationContextManager.setWaitingFor(sessionId, fieldKey, question);
    return question;
  }

  private static async askForMissingPlanejamentoSemanalData(missingData: string[], sessionId: string): Promise<string> {
    const collectedData = ConversationContextManager.getCollectedData(sessionId);
    const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);

    let missingField: string;
    let fieldKey: string;

    if (missingData.includes('data de início')) {
      missingField = 'data de início';
      fieldKey = 'data_inicio';
    } else {
      // Fallback para outros campos faltantes
      return '🎯 Quase lá! Só mais alguns detalhes e vamos criar um planejamento semanal incrível para você!';
    }

    // Gera a pergunta conversacional usando a LLM
    const question = await OpenAIService.generateConversationalQuestion(
      missingField,
      collectedData,
      conversationHistory.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      })),
      sessionId
    );

    ConversationContextManager.setWaitingFor(sessionId, fieldKey, question);
    return question;
  }

  private static async handleSaudacao(message: string, sessionId: string): Promise<string> {
    console.log('👋 [DEBUG] Processando saudação com mensagem estruturada da ANE');

    // Verificar se é uma saudação simples ou se tem solicitação específica
    const msg = message.toLowerCase().trim();
    const saudacoesSimples = ['oi', 'olá', 'ola', 'eae', 'oii', 'e aí'];
    const saudacoesComplementares = ['bom dia', 'boa tarde', 'boa noite', 'oi tudo bem', 'oi, tudo bem'];

    // Se for saudação simples, usar mensagem estruturada
    if (saudacoesSimples.includes(msg) ||
        saudacoesComplementares.some(saud => msg.includes(saud))) {

      console.log('✅ [DEBUG] Saudação simples detectada, usando mensagem estruturada');

      return `Oi, eu sou a ANE, sua assistente pedagógica. 👩🏽‍🏫💡
Quero te mostrar rapidinho como posso te ajudar por aqui, tudo bem?

👉🏽 Crio planejamentos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬Para te ajudar preciso saber o ano e tema ou habilidade do seu planejamento

Conte pra mim, como posso te ajudar hoje? 😊`;
    }

    // Se a mensagem for mais complexa (ex: "oi, quero um plano de aula"), usar LLM
    console.log('🤖 [DEBUG] Saudação com solicitação detectada, processando com LLM');

    try {
      const { OpenAIService } = await import('./openai');
      const openai = await import('openai');
      const client = new openai.default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const promptParaSaudacaoComSolicitacao = `
A mensagem do professor combina uma saudação com uma solicitação específica: ${message}
Reconheça o contexto da interação para decidir como prosseguir.

➡️ Regras de comportamento:

1. Sempre reconheça saudações e “small talk” (ex.: “oi, tudo bem?”, “bom dia!”, “tudo certo?”) antes de qualquer instrução, de forma natural e acolhedora.
2. Sua apresentação deve sempre usar como base a mensagem abaixo, adaptando a linguagem para soar natural e próxima do professor:
"Oi, eu sou a ANE, sua assistente pedagógica. 👩🏽‍🏫💡  
Quero te mostrar rapidinho como posso te ajudar por aqui, tudo bem?"

3. Explique sempre o que você consegue fazer, mesmo quando houver uma solicitação.
Liste claramente suas principais funções:
👉🏽 Crio planejamentos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Para te ajudar preciso saber o ano e tema ou habilidade do seu planejamento
4. Se o professor já trouxer uma solicitação, adapte a explicação acima ao contexto e incentive que ele dê mais detalhes.
5. Sempre finalize mostrando que é um prazer ajudar.  

Assim, mesmo se o professor mandar apenas “Oi, tudo bem?”, a resposta pode ser:

"Oi, tudo bem? Eu sou a ANE, sua assistente pedagógica 👩🏽‍🏫💡.
Quero te mostrar rapidinho como posso te ajudar por aqui.
👉🏽 Crio planejamentos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Para começar, me conta o ano e o tema ou habilidade que você está planejando?
Vai ser um prazer te ajudar!"

E se o professor mandar “Oi, bom dia, me ajuda a planejar uma aula sobre frações para o 6º ano?”, a IA responde:

Oi, bom dia! Eu sou a ANE, sua assistente pedagógica 👩🏽‍🏫💡.
Que ótimo você já trazer seu pedido! Antes de começarmos, deixa eu te contar rapidinho como posso te ajudar:
👉🏽 Crio planejamentos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Você mencionou frações para o 6º ano. Quer que eu sugira um planejamento completo com atividades ou prefere só ideias de metodologias para essa habilidade?`;

      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: promptParaSaudacaoComSolicitacao },
          { role: 'user', content: message }
        ],
        max_tokens: 1500,
        temperature: 0.7
      });

      const botResponse = response.choices[0]?.message?.content ||
        `Oi, eu sou a ANE, sua assistente pedagógica. 👩🏽‍🏫💡
Quero te mostrar rapidinho como posso te ajudar por aqui, tudo bem?

👉🏽 Crio planejamentos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬Para te ajudar preciso saber o ano e tema ou habilidade do seu planejamento

Conte pra mim, como posso te ajudar hoje? 😊`;

      console.log('✅ [DEBUG] Resposta LLM para saudação complexa gerada');
      return botResponse;

    } catch (error) {
      console.error('❌ [DEBUG] Erro no LLM para saudação:', error);
      // Fallback para mensagem estruturada
      return `Oi, eu sou a ANE, sua assistente pedagógica. 👩🏽‍🏫💡
Quero te mostrar rapidinho como posso te ajudar por aqui, tudo bem?

👉🏽 Crio planejamentos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬Para te ajudar preciso saber o ano e tema ou habilidade do seu planejamento

Conte pra mim, como posso te ajudar hoje? 😊`;
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