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

    // Usar a intenção atual se estivermos coletando informações do usuário
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

      case 'revisar_plano':
        return this.handleRevisarPlanoIntent(sessionId, message);

      case 'reflexao_pedagogica':
        return this.handleReflexaoPedagogicaIntent(sessionId, message);

      default:
        return this.handleUnclearIntent(message, sessionId);
    }
  }

  private static async handleRevisarPlanoIntent(sessionId: string, message: string): Promise<string> {
    try {
      // Verificar se há um plano anterior para revisar
      const persistentContent = ConversationContextManager.getPersistentContent(sessionId);
      
      if (!persistentContent?.lastPlanoContent) {
        return "Não encontrei um plano de aula anterior para revisar. Você precisa primeiro gerar um plano de aula antes de poder revisá-lo. Gostaria de criar um novo plano?";
      }

      // Extrair informações de alteração da mensagem
      const alteracoes = await this.extractAlteracoesPlano(message, sessionId);
      
      if (Object.keys(alteracoes).length === 0) {
        return "Entendi que você quer revisar o plano, mas não consegui identificar o que deseja alterar. Você pode especificar se quer mudar:\n\n• A dificuldade (fácil, médio, difícil)\n• O ano escolar\n• O tema/habilidade BNCC\n\nPor exemplo: 'alterar a dificuldade para fácil' ou 'mudar para 5º ano'";
      }

      // Obter dados do plano original
      const dadosOriginais = ConversationContextManager.getCollectedData(sessionId) as PlanoAulaData;
      
      // Aplicar alterações
      const novosDados = { ...dadosOriginais, ...alteracoes };
      
      // Atualizar dados coletados
      Object.keys(alteracoes).forEach(key => {
        ConversationContextManager.updateCollectedData(sessionId, key, alteracoes[key]);
      });

      // Gerar novo plano com as alterações
      const novoPlano = await OpenAIService.generatePlanoAula(novosDados, sessionId);
      
      // Preservar o novo conteúdo
      const planoContent = this.extractPlanoContent(novoPlano);
      ConversationContextManager.updateCollectedData(sessionId, 'lastPlanoContent', planoContent);

      // Gerar resposta contextual
      const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);
      const contextualResponse = await OpenAIService.generateContextualResponse(
        'plano_revisado',
        {
          collectedData: { ...novosDados, alteracoes: alteracoes },
          conversationHistory: conversationHistory.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
          }))
        },
        sessionId
      );

      // Resetar contexto mantendo histórico e dados do plano
      ConversationContextManager.resetContextKeepingHistoryAndData(sessionId, ['lastPlanoContent']);

      return `${contextualResponse}\n\n${novoPlano}\n\n✅ Plano revisado com sucesso! As alterações foram aplicadas.`;

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { context: 'revisar_plano', message });
      return "Desculpe, ocorreu um erro ao revisar o plano. Tente novamente ou digite 'sair' para reiniciar.";
    }
  }

  private static async handleReflexaoPedagogicaIntent(sessionId: string, message: string): Promise<string> {
    try {
      // Verificar se há um plano anterior para referência
      const persistentContent = ConversationContextManager.getPersistentContent(sessionId);
      const hasPreviousPlan = persistentContent?.lastPlanoContent || persistentContent?.lastPlanejamentoContent;
      
      if (!hasPreviousPlan) {
        return "Que legal que você quer refletir sobre a prática pedagógica! 💭\n\nPara te ajudar melhor, seria interessante ter um plano de aula como referência. Você gostaria de criar um plano primeiro ou prefere conversar sobre algum aspecto específico da sua prática?";
      }

      // Gerar prompt de reflexão pedagógica amigável
      const planoData = ConversationContextManager.getCollectedData(sessionId).lastPlanoData as PlanoAulaData;
      const reflectionPrompt = await this.generateReflectionPrompt(planoData, sessionId);

      return reflectionPrompt;

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { context: 'reflexao_pedagogica', message });
      return "Desculpe, ocorreu um erro ao processar sua reflexão. Tente novamente ou digite 'sair' para reiniciar.";
    }
  }

  /**
   * Gera um prompt amigável para reflexão pedagógica baseado em exemplos passados
   */
  private static async generateReflectionPrompt(data: PlanoAulaData, sessionId: string): Promise<string> {
    try {
      const openai = await import('openai');
      const client = new openai.default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const prompt = `Você é a ANE, assistente pedagógica. O professor quer refletir sobre sua prática pedagógica.

Dados do plano de referência:
- Ano: ${data.ano}
- Tema: ${data.tema || data.habilidadeBNCC}
- Nível: ${data.nivelDificuldade || 'médio'}

Crie um prompt de reflexão pedagógica que:
1. Seja acolhedor e encorajador
2. Instigue o professor a pensar profundamente sobre sua prática
3. Use exemplos específicos do plano como base
4. Faça perguntas que extraiam feedback valioso
5. Seja conversacional e natural
6. Ofereça diferentes ângulos de reflexão

O prompt deve ser como uma conversa entre colegas, não um questionário formal. Use o tema e ano do plano para personalizar as perguntas.

Exemplo de tom:
"Que bom que você quer refletir sobre sua prática! 💭 

Vejo que você trabalhou com ${data.tema || data.habilidadeBNCC} no ${data.ano} - que tema interessante! 

Vamos pensar juntos sobre essa experiência? Me conta:

🎯 **O que mais te surpreendeu** durante a implementação desse plano? Houve algum momento em que você pensou 'nossa, não esperava que fosse assim'?

👥 **Como foi a reação dos alunos**? Teve algum aluno que reagiu de forma diferente do que você esperava? O que isso te ensinou?

💡 **Que insights você teve** sobre como seus alunos aprendem melhor? Descobriu alguma estratégia que funcionou especialmente bem?

🔄 **Se fosse fazer de novo**, o que você mudaria? Que ajustes faria baseado no que observou?

Estou aqui para ouvir e aprender com sua experiência! Conte-me o que mais te marcou nessa aula. 😊"`;

      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é a ANE, uma assistente pedagógica que ama ouvir e aprender com as experiências dos professores.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.8
      });

      return response.choices[0]?.message?.content || 
        `Que bom que você quer refletir sobre sua prática! 💭 

Vejo que você trabalhou com ${data.tema || data.habilidadeBNCC} no ${data.ano} - que tema interessante! 

Vamos pensar juntos sobre essa experiência? Me conta:

🎯 **O que mais te surpreendeu** durante a implementação desse plano? Houve algum momento em que você pensou 'nossa, não esperava que fosse assim'?

👥 **Como foi a reação dos alunos**? Teve algum aluno que reagiu de forma diferente do que você esperava? O que isso te ensinou?

💡 **Que insights você teve** sobre como seus alunos aprendem melhor? Descobriu alguma estratégia que funcionou especialmente bem?

🔄 **Se fosse fazer de novo**, o que você mudaria? Que ajustes faria baseado no que observou?

Estou aqui para ouvir e aprender com sua experiência! Conte-me o que mais te marcou nessa aula. 😊`;

    } catch (error) {
      console.error('❌ Erro ao gerar prompt de reflexão:', error);
      return `Que bom que você quer refletir sobre sua prática! 💭 

Vejo que você trabalhou com ${data.tema || data.habilidadeBNCC} no ${data.ano} - que tema interessante! 

Vamos pensar juntos sobre essa experiência? Me conta:

🎯 **O que mais te surpreendeu** durante a implementação desse plano? Houve algum momento em que você pensou 'nossa, não esperava que fosse assim'?

👥 **Como foi a reação dos alunos**? Teve algum aluno que reagiu de forma diferente do que você esperava? O que isso te ensinou?

💡 **Que insights você teve** sobre como seus alunos aprendem melhor? Descobriu alguma estratégia que funcionou especialmente bem?

🔄 **Se fosse fazer de novo**, o que você mudaria? Que ajustes faria baseado no que observou?

Estou aqui para ouvir e aprender com sua experiência! Conte-me o que mais te marcou nessa aula. 😊`;
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

      // Adicionar mensagem de continuidade conversacional
      const continuationMessage = await this.generatePostPlanContinuationMessage(data, sessionId);

      // IMPORTANTE: Preservar o conteúdo do plano para geração de PDF posterior
      const planoContent = this.extractPlanoContent(planoAula);
      if (planoContent) {
        ConversationContextManager.updateCollectedData(sessionId, 'lastPlanoContent', planoContent);
        // Também preservar os dados do plano para referência futura
        ConversationContextManager.updateCollectedData(sessionId, 'lastPlanoData', data);
      }

      // Limpar contexto mas preservar o conteúdo do plano e dados
      ConversationContextManager.resetContextKeepingHistoryAndData(sessionId, ['lastPlanoContent', 'lastPlanoData']);

      return `${contextualResponse}\n\n${planoAula}\n\n${continuationMessage}`;
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

      // IMPORTANTE: Preservar o conteúdo do planejamento para geração de PDF posterior
      const planejamentoContent = planejamento; // Para planejamento semanal, usar o conteúdo completo
      ConversationContextManager.updateCollectedData(sessionId, 'lastPlanejamentoContent', planejamentoContent);
      // Também preservar os dados do planejamento para referência futura
      ConversationContextManager.updateCollectedData(sessionId, 'lastPlanejamentoData', data);

      // Limpar contexto mas preservar o conteúdo do planejamento e dados
      ConversationContextManager.resetContextKeepingHistoryAndData(sessionId, ['lastPlanejamentoContent', 'lastPlanejamentoData']);

      return `${contextualResponse}\n\n${planejamento}`;
    } else {
      // Ainda faltam dados
      return await this.askForMissingPlanejamentoSemanalData(missingData, sessionId);
    }
  }

  private static async askForMissingPlanoAulaData(missingData: string[], sessionId: string): Promise<string> {
    const collectedData = ConversationContextManager.getCollectedData(sessionId);
    const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);

    // Verificar se o usuário está pedindo sugestões de tema
    const lastUserMessage = conversationHistory
      .filter(msg => msg.sender === 'user')
      .pop()?.text.toLowerCase() || '';

    const isAskingForSuggestions = lastUserMessage.includes('sugira') || 
                                  lastUserMessage.includes('sugestão') || 
                                  lastUserMessage.includes('sugestões') ||
                                  lastUserMessage.includes('tanto faz') ||
                                  lastUserMessage.includes('qualquer') ||
                                  lastUserMessage.includes('não sei') ||
                                  lastUserMessage.includes('nao sei') ||
                                  lastUserMessage.includes('me ajuda') ||
                                  lastUserMessage.includes('me ajuda a escolher');

    if (isAskingForSuggestions && missingData.includes('tema ou habilidade BNCC')) {
      // Gerar sugestões de temas baseadas no ano escolar
      const ano = collectedData.ano || '5º ano'; // Default para 5º ano se não especificado
      return await this.generateThemeSuggestions(ano, sessionId);
    }

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

      // Verificar se há um plano anterior para referência contextual
      const persistentContent = ConversationContextManager.getPersistentContent(sessionId);
      const hasPreviousPlan = persistentContent?.lastPlanoContent || persistentContent?.lastPlanejamentoContent;
      
      let contextInfo = '';
      if (hasPreviousPlan) {
        contextInfo = `
CONTEXTO IMPORTANTE: O professor já tem um plano anterior gerado nesta conversa. 
Se ele fizer uma saudação simples, mencione que pode continuar trabalhando com o plano anterior ou criar um novo.
Se ele perguntar sobre funcionalidades, inclua opções como "gerar PDF do plano anterior" ou "ajustar o plano".
`;
      }

      const promptParaSaudacao = `
A mensagem do professor: "${message}"

${contextInfo}

➡️ Regras de comportamento:

1. SEMPRE reconheça saudações e "small talk" (ex.: "oi, tudo bem?", "bom dia!", "tudo certo?", "como você pode ajudar?") antes de qualquer instrução, de forma natural e acolhedora.

2. Sua apresentação deve sempre usar como base a mensagem abaixo, adaptando a linguagem para soar natural e próxima do professor:
"Oi, eu sou a ANE, sua assistente pedagógica. 👩🏽‍🏫💡  
Quero te mostrar rapidinho como posso te ajudar por aqui, tudo bem?"

3. SEMPRE explique o que você consegue fazer, mesmo quando houver uma solicitação específica.
Liste claramente suas principais funções:
👉🏽 Crio planos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Para te ajudar preciso saber o ano e tema ou habilidade da sua aula

4. Se o professor já trouxer uma solicitação, adapte a explicação acima ao contexto e incentive que ele dê mais detalhes.

5. SEMPRE finalize mostrando que é um prazer ajudar.

${hasPreviousPlan ? `
6. IMPORTANTE: Se há um plano anterior, mencione as opções de continuar com ele:
- Gerar PDF do plano anterior
- Ajustar o plano anterior
- Criar um novo plano
` : ''}

EXEMPLOS DE RESPOSTAS:

Se o professor mandar apenas "Oi, tudo bem?":
"Oi, tudo bem? Eu sou a ANE, sua assistente pedagógica 👩🏽‍🏫💡.
Quero te mostrar rapidinho como posso te ajudar por aqui.
👉🏽 Crio planos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Para começar, me conta o ano e o tema ou habilidade que você quer trabalhar?
Vai ser um prazer te ajudar!"

Se o professor mandar "Como você pode ajudar?" ou "O que você faz?":
"Oi! Eu sou a ANE, sua assistente pedagógica 👩🏽‍🏫💡.
Que bom você perguntar! Vou te mostrar rapidinho como posso te ajudar por aqui.
👉🏽 Crio planos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Para começar, me conta o ano e o tema ou habilidade que você quer trabalhar?
Vai ser um prazer te ajudar!"

Se o professor mandar "Oi, bom dia, me ajuda a planejar uma aula sobre frações para o 6º ano?":
"Oi, bom dia! Eu sou a ANE, sua assistente pedagógica 👩🏽‍🏫💡.
Que ótimo você já trazer seu pedido! Antes de começarmos, deixa eu te contar rapidinho como posso te ajudar:
👉🏽 Crio planos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Você mencionou frações para o 6º ano. Quer que eu crie um plano completo com atividades ou prefere só ideias de metodologias para essa habilidade?"
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
      
      // Adicionar marcador para vídeo de saudação
      return `[VIDEO_SAUDACAO]${botResponse}`;

    } catch (error) {
      console.error('❌ [DEBUG] Erro no LLM para saudação:', error);
      // Fallback em caso de erro
      return `[VIDEO_SAUDACAO]Oi! Eu sou a ANE, sua assistente pedagógica. 👩🏽‍🏫💡 Como posso te ajudar hoje?`;
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
      'gera pdf',
      'gera o pdf',
      'faz o pdf',
      'cria o pdf',
      'baixa o pdf',
      'exporta o pdf',
      'compartilha o pdf',
      'envia o pdf',
      'quero o pdf',
      'preciso o pdf',
      'faz o pdf',
      'cria o pdf',
      'baixa o pdf',
      'exporta o pdf',
      'compartilha o pdf',
      'envia o pdf',
      'quero o pdf',
      'preciso o pdf',
      'faz o pdf',
      'quero em pdf',
      // Termos coloquiais para solicitação de PDF
      'manda o plano',
      'manda o pdf',
      'manda pdf',
      'manda plano',
      'envia o plano',
      'envia plano',
      'me manda o plano',
      'me manda o pdf',
      'me manda pdf',
      'me manda plano',
      'me envia o plano',
      'me envia o pdf',
      'me envia pdf',
      'me envia plano',
      'pode mandar o plano',
      'pode mandar o pdf',
      'pode mandar pdf',
      'pode mandar plano',
      'pode enviar o plano',
      'pode enviar o pdf',
      'pode enviar pdf',
      'pode enviar plano',
      'manda aí o plano',
      'manda aí o pdf',
      'manda aí pdf',
      'manda aí plano',
      'envia aí o plano',
      'envia aí o pdf',
      'envia aí pdf',
      'envia aí plano'
    ];

    // Verificação mais robusta - qualquer menção a PDF deve ser tratada como solicitação
    const hasPDFKeyword = pdfKeywords.some(keyword => msg.includes(keyword));
    const hasPDFWord = msg.includes('pdf');
    const hasDownloadIntent = msg.includes('baixar') || msg.includes('download') || msg.includes('exportar');
    const hasGenerateIntent = msg.includes('gerar') || msg.includes('fazer') || msg.includes('criar') || msg.includes('gere') || msg.includes('gera');
    const hasSendIntent = msg.includes('manda') || msg.includes('envia') || msg.includes('enviar');
    const hasPlanoWord = msg.includes('plano');
    
    // Se contém PDF e alguma ação de geração/download/envio, é solicitação de PDF
    // Ou se contém "plano" com intenção de envio/geração
    const isPDFRequest = hasPDFKeyword || 
                        (hasPDFWord && (hasDownloadIntent || hasGenerateIntent || hasSendIntent)) ||
                        (hasPlanoWord && (hasSendIntent || hasDownloadIntent || hasGenerateIntent));
    
    console.log('🔍 [DEBUG] Verificação de PDF:', {
      message: msg,
      hasPDFKeyword,
      hasPDFWord,
      hasDownloadIntent,
      hasGenerateIntent,
      hasSendIntent,
      hasPlanoWord,
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

      // Armazenar o conteúdo do plano para geração via API
      console.log('💾 Armazenando conteúdo do plano no contexto...', {
        sessionId: sessionId.substring(0, 8),
        planoContentLength: planoContent.length,
        planoContentPreview: planoContent.substring(0, 100) + '...'
      });
      
      ConversationContextManager.updateCollectedData(sessionId, 'lastPlanoContent', planoContent);
      
      // Verificar se foi armazenado corretamente
      const storedContent = ConversationContextManager.getCollectedData(sessionId).lastPlanoContent;
      const persistentContent = ConversationContextManager.getPersistentContent(sessionId);
      console.log('✅ Conteúdo armazenado:', {
        hasContent: !!storedContent,
        contentLength: storedContent?.length || 0,
        hasPersistentContent: !!persistentContent?.lastPlanoContent,
        persistentContentLength: persistentContent?.lastPlanoContent?.length || 0
      });

      // Buscar dados do plano para gerar sugestões personalizadas
      const planoData = ConversationContextManager.getCollectedData(sessionId).lastPlanoData as PlanoAulaData;
      
      // Gerar sugestões de continuidade personalizadas
      const continuitySuggestions = planoData ? 
        await this.generateContinuitySuggestions(planoData, sessionId) : 
        `Que legal que você tem o PDF! 📄✨ 

Agora que o plano está pronto, que tal pensarmos em como dar continuidade a esse tema? 

Posso te ajudar com:
🎨 **Projetos interdisciplinares** criativos
🔬 **Atividades práticas** que os alunos vão adorar
📚 **Leituras complementares** para aprofundar
🎯 **Estratégias de avaliação** diferenciadas

O que você acha? Alguma dessas ideias te anima? Ou prefere que eu ajude com outra coisa? 😊`;

      // Gerar resposta com link de download via API
      const response = `Perfeito! Vou gerar o PDF do seu plano de aula para você! 📄✨

<a href="/api/pdf?sessionId=${sessionId}" download="plano-aula.pdf" style="
  display: inline-block;
  background: #007bff;
  color: white;
  padding: 12px 24px;
  text-decoration: none;
  border-radius: 6px;
  font-weight: bold;
  margin: 10px 0;
  cursor: pointer;
">📥 Baixar PDF do Plano de Aula</a>

O arquivo foi gerado com sucesso! Clique no botão acima para fazer o download.

---

${continuitySuggestions}`;

      // Log da ação
      ChatLogger.logConversation(sessionId, '[PDF gerado]', 'PDF do plano de aula gerado e disponibilizado para download');

      return response;

    } catch (error) {
      console.error('❌ Erro ao processar solicitação de PDF:', error);
      ChatLogger.logError(sessionId, error as Error, { context: 'pdf_request' });
      return 'Desculpe, ocorreu um erro ao gerar o PDF. Tente novamente! 😊';
    }
  }

  /**
   * Extrai alterações solicitadas para revisão do plano
   */
  private static async extractAlteracoesPlano(message: string, sessionId: string): Promise<Partial<PlanoAulaData>> {
    const alteracoes: Partial<PlanoAulaData> = {};
    const msg = message.toLowerCase();

    // Detectar alteração de dificuldade
    if (msg.includes('dificuldade') || msg.includes('fácil') || msg.includes('médio') || msg.includes('difícil') || 
        msg.includes('facil') || msg.includes('medio') || msg.includes('dificil')) {
      
      if (msg.includes('fácil') || msg.includes('facil')) {
        alteracoes.nivelDificuldade = 'facil';
      } else if (msg.includes('médio') || msg.includes('medio')) {
        alteracoes.nivelDificuldade = 'medio';
      } else if (msg.includes('difícil') || msg.includes('dificil')) {
        alteracoes.nivelDificuldade = 'dificil';
      }
    }

    // Detectar alteração de ano
    const anos = ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º', '1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°'];
    for (const ano of anos) {
      if (msg.includes(ano)) {
        alteracoes.ano = ano + ' ano';
        break;
      }
    }

    // Detectar alteração de tema (usar LLM para extrair tema mais complexo)
    if (msg.includes('tema') || msg.includes('assunto') || msg.includes('conteúdo') || msg.includes('matéria')) {
      try {
        const { OpenAIService } = await import('./openai');
        const temaExtraido = await OpenAIService.extractTemaFromMessage(message, sessionId);
        if (temaExtraido) {
          alteracoes.tema = temaExtraido;
        }
      } catch (error) {
        ChatLogger.logError(sessionId, error as Error, { context: 'extract_tema', message });
      }
    }

    return alteracoes;
  }

  /**
   * Gera mensagem de continuidade conversacional após a geração do plano
   */
  private static async generatePostPlanContinuationMessage(data: PlanoAulaData, sessionId: string): Promise<string> {
    try {
      const openai = await import('openai');
      const client = new openai.default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const prompt = `Você é a ANE, assistente pedagógica. O professor acabou de receber um plano de aula completo.

Dados do plano gerado:
- Ano: ${data.ano}
- Tema: ${data.tema || data.habilidadeBNCC}
- Nível: ${data.nivelDificuldade || 'médio'}

Gere uma mensagem de continuidade conversacional que:
1. Parabenize o professor pelo plano criado
2. Encoraje a reflexão sobre a prática pedagógica
3. Ofereça suporte para próximos passos
4. Seja acolhedora e motivadora
5. Mencione as opções de continuidade (ajustes, PDF, novos planos, etc.)

A mensagem deve ser natural, conversacional e incentivar o professor a continuar interagindo.

Exemplo de tom:
"Que plano incrível criamos juntos! 🎉 
Agora que você tem tudo estruturado, que tal refletirmos sobre como implementar na sua turma? 
Posso te ajudar com ajustes, gerar o PDF, ou até mesmo criar um novo plano. 
O que você gostaria de fazer agora?"`;

      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é a ANE, uma assistente pedagógica amigável e encorajadora.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.7
      });

      return response.choices[0]?.message?.content || 
        `Que plano incrível criamos juntos! 🎉 

Agora que você tem tudo estruturado, que tal refletirmos sobre como implementar na sua turma? 

Posso te ajudar com:
👉🏽 **Ajustes** no plano (duração, atividades, dificuldade)
👉🏽 **Gerar PDF** para compartilhar
👉🏽 **Criar novo plano** para outro tema
👉🏽 **Sugerir atividades** complementares
👉🏽 **Tirar dúvidas** pedagógicas

O que você gostaria de fazer agora? 😊`;

    } catch (error) {
      console.error('❌ Erro ao gerar mensagem de continuidade:', error);
      return `Que plano incrível criamos juntos! 🎉 

Agora que você tem tudo estruturado, que tal refletirmos sobre como implementar na sua turma? 

Posso te ajudar com:
👉🏽 **Ajustes** no plano (duração, atividades, dificuldade)
👉🏽 **Gerar PDF** para compartilhar
👉🏽 **Criar novo plano** para outro tema
👉🏽 **Sugerir atividades** complementares
👉🏽 **Tirar dúvidas** pedagógicas

O que você gostaria de fazer agora? 😊`;
    }
  }

  /**
   * Gera sugestões de continuidade amigáveis após a geração do PDF
   */
  private static async generateContinuitySuggestions(data: PlanoAulaData, sessionId: string): Promise<string> {
    try {
      const openai = await import('openai');
      const client = new openai.default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const prompt = `Você é a ANE, assistente pedagógica. O professor acabou de gerar o PDF do seu plano de aula.

Dados do plano:
- Ano: ${data.ano}
- Tema: ${data.tema || data.habilidadeBNCC}
- Nível: ${data.nivelDificuldade || 'médio'}

Gere sugestões de continuidade amigáveis e práticas que:
1. Sejam específicas para o tema e ano do plano
2. Ofereçam atividades complementares concretas
3. Sugiram projetos interdisciplinares relevantes
4. Proponham estratégias de aprofundamento
5. Sejam fáceis de implementar

Formate como uma conversa natural, não como uma lista formal. Seja encorajadora e mostre entusiasmo pelas possibilidades.

Exemplo de tom:
"Que legal que você tem o PDF! 📄✨ 

Agora que o plano está pronto, que tal pensarmos em como dar continuidade a esse tema? 

Para o ${data.ano} trabalhando com ${data.tema || data.habilidadeBNCC}, eu sugiro algumas ideias que podem complementar perfeitamente:

🎨 **Projeto interdisciplinar**: Que tal conectar com Artes criando... [sugestão específica]

🔬 **Atividade prática**: Uma experiência simples que os alunos vão adorar é... [sugestão específica]

📚 **Leitura complementar**: Para aprofundar, sugiro... [sugestão específica]

O que você acha? Alguma dessas ideias te anima? Ou prefere que eu ajude com outra coisa?"`;

      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é a ANE, uma assistente pedagógica criativa e encorajadora que ama sugerir atividades práticas.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.8
      });

      return response.choices[0]?.message?.content || 
        `Que legal que você tem o PDF! 📄✨ 

Agora que o plano está pronto, que tal pensarmos em como dar continuidade a esse tema? 

Para o ${data.ano} trabalhando com ${data.tema || data.habilidadeBNCC}, eu sugiro algumas ideias que podem complementar perfeitamente:

🎨 **Projeto interdisciplinar**: Que tal conectar com outras áreas do conhecimento?

🔬 **Atividade prática**: Uma experiência simples que os alunos vão adorar!

📚 **Leitura complementar**: Para aprofundar o tema de forma divertida!

O que você acha? Alguma dessas ideias te anima? Ou prefere que eu ajude com outra coisa? 😊`;

    } catch (error) {
      console.error('❌ Erro ao gerar sugestões de continuidade:', error);
      return `Que legal que você tem o PDF! 📄✨ 

Agora que o plano está pronto, que tal pensarmos em como dar continuidade a esse tema? 

Para o ${data.ano} trabalhando com ${data.tema || data.habilidadeBNCC}, eu sugiro algumas ideias que podem complementar perfeitamente:

🎨 **Projeto interdisciplinar**: Que tal conectar com outras áreas do conhecimento?

🔬 **Atividade prática**: Uma experiência simples que os alunos vão adorar!

📚 **Leitura complementar**: Para aprofundar o tema de forma divertida!

O que você acha? Alguma dessas ideias te anima? Ou prefere que eu ajude com outra coisa? 😊`;
    }
  }

  /**
   * Gera sugestões de temas baseadas no ano escolar
   */
  private static async generateThemeSuggestions(ano: string, sessionId: string): Promise<string> {
    try {
      const openai = await import('openai');
      const client = new openai.default({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const prompt = `Você é uma assistente pedagógica especializada em sugestões de temas para planos de aula.

O professor está criando um plano de aula para o ${ano} e pediu sugestões de tema.

Gere 5 sugestões de temas interessantes e adequados para o ${ano}, considerando:
- A faixa etária dos alunos
- Os interesses típicos dessa idade
- A relevância pedagógica
- A possibilidade de atividades práticas e engajantes

Formate a resposta de forma conversacional e acolhedora, como se fosse a ANE falando.

Exemplo de formato:
"Que legal que você quer sugestões! 💡 Aqui estão algumas ideias interessantes para o ${ano}:

1. [Tema 1] - [Breve explicação do porquê é interessante]
2. [Tema 2] - [Breve explicação do porquê é interessante]
3. [Tema 3] - [Breve explicação do porquê é interessante]
4. [Tema 4] - [Breve explicação do porquê é interessante]
5. [Tema 5] - [Breve explicação do porquê é interessante]

Qual desses temas te chama mais atenção? Ou se preferir, pode me dizer outro tema que você tem em mente! 😊"`;

      const response = await client.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é a ANE, uma assistente pedagógica amigável e experiente.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.7
      });

      return response.choices[0]?.message?.content || 
        `Que legal que você quer sugestões! 💡 Aqui estão algumas ideias interessantes para o ${ano}:

1. **Frações e decimais** - Um tema super prático que os alunos usam no dia a dia
2. **Sistema solar** - Sempre fascina as crianças e permite muitas atividades criativas
3. **Ciclo da água** - Tema visual e interativo, perfeito para experimentos
4. **História do Brasil** - Conteúdo rico e importante para a formação cidadã
5. **Animais e habitats** - Tema que desperta curiosidade e permite pesquisas

Qual desses temas te chama mais atenção? Ou se preferir, pode me dizer outro tema que você tem em mente! 😊`;

    } catch (error) {
      console.error('❌ Erro ao gerar sugestões de tema:', error);
      return `Que legal que você quer sugestões! 💡 Aqui estão algumas ideias interessantes para o ${ano}:

1. **Frações e decimais** - Um tema super prático que os alunos usam no dia a dia
2. **Sistema solar** - Sempre fascina as crianças e permite muitas atividades criativas
3. **Ciclo da água** - Tema visual e interativo, perfeito para experimentos
4. **História do Brasil** - Conteúdo rico e importante para a formação cidadã
5. **Animais e habitats** - Tema que desperta curiosidade e permite pesquisas

Qual desses temas te chama mais atenção? Ou se preferir, pode me dizer outro tema que você tem em mente! 😊`;
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
    const context = ConversationContextManager.getContext(sessionId);

    // Verificar se há um plano anterior e o usuário pode estar se referindo a ele
    const persistentContent = ConversationContextManager.getPersistentContent(sessionId);
    const hasPreviousPlan = persistentContent?.lastPlanoContent || persistentContent?.lastPlanejamentoContent;

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

    // Se há um plano anterior e a mensagem é vaga, oferecer opções contextuais
    if (hasPreviousPlan && (msg.length < 20 || msg.includes('e agora') || msg.includes('o que') || msg.includes('como'))) {
      return `Entendi! Vejo que você tem um plano anterior. O que você gostaria de fazer agora?

👉🏽 **Gerar PDF** do plano (digite "manda o plano" ou "gerar pdf")
👉🏽 **Criar novo plano** de aula
👉🏽 **Ajustar o plano** anterior (alterar dificuldade, ano ou tema)
👉🏽 **Sugerir atividades** complementares
👉🏽 **Tirar dúvidas** pedagógicas

Qual opção te interessa? 😊`;
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