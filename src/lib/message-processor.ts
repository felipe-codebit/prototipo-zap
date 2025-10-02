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

      // Se estamos esperando uma resposta específica, verificar se usuário quer cancelar primeiro
      if (waitingFor) {
        // Verificar se o usuário quer cancelar ou mudar de intenção
        const intentAnalysis = await simpleNlpService.analyzeIntent(message, sessionId);

        // Se detectou uma intenção clara diferente ou negação, cancelar waitingFor
        if (intentAnalysis.confidence > 0.7 ||
            message.toLowerCase().includes('não quero') ||
            message.toLowerCase().includes('nao quero') ||
            message.toLowerCase().includes('cancela')) {

          ConversationContextManager.clearWaitingFor(sessionId);
          // Se é negação, limpar todo o contexto
          if (message.toLowerCase().includes('não quero') ||
              message.toLowerCase().includes('nao quero')) {
            ConversationContextManager.resetContextKeepingHistory(sessionId);
          }
          // Continuar com o processamento normal da nova intenção
        } else {
          // Tentar processar como resposta específica
          const response = await this.processSpecificResponse(message, sessionId, waitingFor);
          if (response) {
            return response;
          }
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

    if (!currentIntent) return null;

    switch (waitingFor) {
      case 'ano':
        if (currentIntent === 'plano_aula') {
          ConversationContextManager.updateCollectedData(sessionId, 'ano', message.trim());
          ConversationContextManager.clearWaitingFor(sessionId);
          return await this.handlePlanoAulaIntent(sessionId, message);
        }
        break;

      case 'tema':
        if (currentIntent === 'plano_aula') {
          ConversationContextManager.updateCollectedData(sessionId, 'tema', message.trim());
          ConversationContextManager.clearWaitingFor(sessionId);
          return await this.handlePlanoAulaIntent(sessionId, message);
        }
        break;

      case 'dificuldade':
        if (currentIntent === 'plano_aula') {
          const msg = message.toLowerCase().trim();
          let difficulty = 'medio';

          if (msg.includes('fácil') || msg.includes('facil') || msg.includes('simples')) {
            difficulty = 'facil';
          } else if (msg.includes('difícil') || msg.includes('dificil') || msg.includes('avançado')) {
            difficulty = 'dificil';
          }

          ConversationContextManager.updateCollectedData(sessionId, 'nivelDificuldade', difficulty);
          ConversationContextManager.clearWaitingFor(sessionId);
          return await this.handlePlanoAulaIntent(sessionId, message);
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

    return null;
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

  private static extractAdditionalInfo(sessionId: string, intent: Intent, entities: Record<string, any>) {
    const recentMessages = ConversationContextManager.getRecentUserMessages(sessionId, 3);
    const latestMessage = recentMessages[recentMessages.length - 1];
    const currentContext = ConversationContextManager.getContext(sessionId);

    if (!latestMessage) return;

    // Usar a intenção atual se estivermos em coleta de dados
    const effectiveIntent = (currentContext.currentIntent &&
                           Object.keys(currentContext.collectedData).length > 0)
                           ? currentContext.currentIntent
                           : intent;

    switch (effectiveIntent) {
      case 'plano_aula':
        this.extractPlanoAulaInfo(sessionId, latestMessage);
        break;

      case 'calendario_escolar':
        this.extractCalendarioInfo(sessionId, latestMessage);
        break;
    }
  }

  private static extractPlanoAulaInfo(sessionId: string, message: string) {
    const collectedData = ConversationContextManager.getCollectedData(sessionId);

    // Extrair ano escolar se ainda não temos - versão simplificada
    if (!collectedData.ano) {
      // Verificações simples e eficientes
      if (message.includes('ano') || message.match(/\d+[°º]/)) {
        const cleanMessage = message.trim();
        ConversationContextManager.updateCollectedData(sessionId, 'ano', cleanMessage);
      }
    }

    // Extrair tema se ainda não temos - versão simplificada
    if (!collectedData.tema && !collectedData.habilidadeBNCC) {
      const msg = message.toLowerCase();

      // Verificações simples por palavras-chave
      if (msg.includes('tema') || msg.includes('sobre') || msg.includes('ensinar')) {
        const cleanMessage = message.trim().replace(/[.!?]$/, '');
        ConversationContextManager.updateCollectedData(sessionId, 'tema', cleanMessage);
      }
      // Se não encontrou pattern específico e não é confirmação, usar como tema
      else if (message.length > 3 && !['sim', 'não', 'ok', 'certo'].includes(msg)) {
        const cleanMessage = message.trim().replace(/[.!?]$/, '');
        ConversationContextManager.updateCollectedData(sessionId, 'tema', cleanMessage);
      }
    }

    // Extrair nível de dificuldade se ainda não temos - versão simplificada
    if (!collectedData.nivelDificuldade) {
      const msg = message.toLowerCase();

      if (msg.includes('fácil') || msg.includes('facil') || msg.includes('simples')) {
        ConversationContextManager.updateCollectedData(sessionId, 'nivelDificuldade', 'facil');
      } else if (msg.includes('médio') || msg.includes('medio') || msg.includes('normal')) {
        ConversationContextManager.updateCollectedData(sessionId, 'nivelDificuldade', 'medio');
      } else if (msg.includes('difícil') || msg.includes('dificil') || msg.includes('avançado')) {
        ConversationContextManager.updateCollectedData(sessionId, 'nivelDificuldade', 'dificil');
      }
    }
  }

  private static extractCalendarioInfo(sessionId: string, message: string) {
    const collectedData = ConversationContextManager.getCollectedData(sessionId);
    const msg = message.toLowerCase();

    // Extrair período - versão simplificada
    if (!collectedData.periodo) {
      if (msg.includes('semanal') || msg.includes('semana')) {
        ConversationContextManager.updateCollectedData(sessionId, 'periodo', 'semanal');
      } else if (msg.includes('mensal') || msg.includes('mês')) {
        ConversationContextManager.updateCollectedData(sessionId, 'periodo', 'mensal');
      }
    }

    // Extrair datas simples
    if (!collectedData.dataInicio) {
      if (msg.includes('hoje') || msg.includes('amanhã') || msg.includes('segunda') || msg.includes('/')) {
        ConversationContextManager.updateCollectedData(sessionId, 'dataInicio', message.trim());
      }
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
        return this.handleSaudacao();

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

      // IMPORTANTE: Limpar completamente o contexto após gerar o plano
      ConversationContextManager.resetContextKeepingHistory(sessionId);

      return `🎉 Pronto! Aqui está seu plano de aula personalizado:\n\n${planoAula}\n\n✨ Espero que seus alunos fiquem empolgados com essas atividades! \n\nQue tal agora? Quer criar outro plano, organizar seu calendário semanal, ou tem alguma dúvida pedagógica que posso esclarecer? Estou aqui para te apoiar! 😊`;
    } else {
      // Ainda faltam dados, perguntar especificamente
      return this.askForMissingPlanoAulaData(missingData, sessionId);
    }
  }

  private static async handlePlanejamentoSemanalIntent(sessionId: string, message: string): Promise<string> {
    const missingData = ConversationContextManager.getMissingDataForPlanejamentoSemanal(sessionId);

    if (missingData.length === 0) {
      // Todos os dados coletados, gerar planejamento semanal
      const data = ConversationContextManager.getCollectedData(sessionId) as PlanejamentoSemanalData;
      const planejamento = await OpenAIService.generatePlanejamentoSemanal(data, sessionId);

      // IMPORTANTE: Limpar completamente o contexto após gerar o planejamento
      ConversationContextManager.resetContextKeepingHistory(sessionId);

      return `📅 Incrível! Aqui está seu planejamento semanal:\n\n${planejamento}\n\n🚀 Com essa organização, sua semana vai ser muito mais produtiva e tranquila!\n\nQue tal agora? Quer criar um plano de aula para alguma dessas atividades, ou tem alguma dúvida sobre como implementar o planejamento? Estou aqui para te apoiar! ✨`;
    } else {
      // Ainda faltam dados
      return this.askForMissingPlanejamentoSemanalData(missingData, sessionId);
    }
  }

  private static askForMissingPlanoAulaData(missingData: string[], sessionId: string): string {
    const collectedData = ConversationContextManager.getCollectedData(sessionId);

    if (missingData.includes('ano')) {
      const question = '🎯 Que empolgante! Vamos criar um plano de aula incrível! Para começar, me conta: para qual ano escolar será esse plano? (1º ao 9º ano, ou até ensino médio!)';
      ConversationContextManager.setWaitingFor(sessionId, 'ano', question);
      return question;
    }

    if (missingData.includes('tema ou habilidade BNCC')) {
      const question = `✨ Perfeito! ${collectedData.ano} é uma turma especial! Agora me conta: qual tema você quer abordar ou qual habilidade da BNCC vamos trabalhar? Pode ser algo que você já tem em mente ou posso sugerir ideias também! 😊`;
      ConversationContextManager.setWaitingFor(sessionId, 'tema', question);
      return question;
    }

    if (missingData.includes('nível de dificuldade')) {
      const question = `🚀 Ótima escolha de tema! Agora vamos calibrar a dificuldade para que os alunos se sintam desafiados mas confiantes. Você prefere atividades mais fáceis (para introduzir o tema), médias (para consolidar) ou difíceis (para expandir)? Qual seria ideal para sua turma?`;
      ConversationContextManager.setWaitingFor(sessionId, 'dificuldade', question);
      return question;
    }

    return '😊 Estamos quase lá! Só preciso de mais algumas informações para criar um plano de aula perfeito para você!';
  }

  private static askForMissingPlanejamentoSemanalData(missingData: string[], sessionId: string): string {
    if (missingData.includes('data de início')) {
      const question = '🗓️ Perfeito! Vamos organizar sua semana! A partir de quando começamos? Você quer planejar desta segunda-feira, da próxima semana, ou de uma data específica?';
      ConversationContextManager.setWaitingFor(sessionId, 'data_inicio', question);
      return question;
    }

    return '🎯 Quase lá! Só mais alguns detalhes e vamos criar um planejamento semanal incrível para você!';
  }

  private static handleSaudacao(): string {
    return `Oi! 👋 Que alegria te encontrar aqui! Sou seu assistente educacional e estou super animado para ajudar!

Sou especialista em apenas 3 coisas, mas faço elas muito bem:

🎯 **Criar planos de aula personalizados** - com atividades incríveis para seus alunos!
❓ **Tirar suas dúvidas educacionais** - metodologias, gestão de sala, estratégias...
📅 **Planejar sua semana** - organização semanal para professores eficientes!

O que você gostaria de fazer hoje? Por onde começamos? 😊`;
  }

  private static handleDespedida(sessionId: string): string {
    ConversationContextManager.clearContext(sessionId);
    return `Foi incrível trabalhar com você! 🌟 Tenho certeza de que seus alunos são sortudos por ter um professor(a) tão dedicado(a)!

Volte sempre que quiser - estarei aqui pronto para mais planos de aula, dúvidas ou qualquer coisa que precisar. Sua educação sempre será minha prioridade!

Boa aula e muito sucesso! 📚✨🎓`;
  }

  private static handleSairIntent(sessionId: string): string {
    // Registrar a mensagem do usuário no histórico antes de resetar o contexto
    ConversationContextManager.addMessage(sessionId, {
      id: `user_${Date.now()}`,
      text: '[Usuário solicitou reiniciar conversa]',
      sender: 'user',
      timestamp: new Date(),
      type: 'text'
    });

    ConversationContextManager.resetContextKeepingHistory(sessionId);

    const response = `🔄 Perfeito! Vamos recomeçar do zero!

Todas as informações anteriores foram limpas e agora estamos com uma conversa fresquinha! 😊

Sou seu assistente educacional e estou super animado para ajudar você com:

🎯 **Criar planos de aula personalizados** - com atividades incríveis para seus alunos!
❓ **Tirar suas dúvidas educacionais** - metodologias, gestão de sala, estratégias...
📅 **Planejar sua semana** - organização semanal para professores eficientes!

Por onde você gostaria de começar agora? ✨`;

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

    // Procurar por sugestões do bot nas últimas mensagens
    const recentBotMessages = conversationHistory
      .filter(msg => msg.sender === 'bot')
      .slice(-3)
      .map(msg => msg.text);

    // Verificar se o bot sugeriu alguma das funcionalidades principais
    for (const botMessage of recentBotMessages) {
      const msg = botMessage.toLowerCase();
      if (msg.includes('plano de aula') || msg.includes('plano para')) {
        ConversationContextManager.updateIntent(sessionId, 'plano_aula', 0.9);
        return this.handlePlanoAulaIntent(sessionId, 'quero continuar com plano de aula');
      }
      if (msg.includes('planejamento semanal') || msg.includes('organizar') || msg.includes('semana')) {
        ConversationContextManager.updateIntent(sessionId, 'planejamento_semanal', 0.9);
        return this.handlePlanejamentoSemanalIntent(sessionId, 'quero continuar com planejamento semanal');
      }
      if (msg.includes('dúvida') || msg.includes('pergunta') || msg.includes('esclarecer')) {
        ConversationContextManager.updateIntent(sessionId, 'tira_duvidas', 0.9);
        return OpenAIService.generateResponse(message, sessionId);
      }
    }

    // Se não conseguiu identificar contexto, fazer uma sugestão amigável
    return `😊 Perfeito! Vejo que você quer continuar, mas preciso saber com o quê!

Você gostaria de:

🎯 **Criar um plano de aula** - para suas próximas aulas
❓ **Tirar alguma dúvida** - sobre metodologias ou conteúdos
📅 **Planejar sua semana** - organizar cronograma semanal

Qual desses te interessa mais agora? ✨`;
  }

  private static async handleUnclearIntent(message: string, sessionId: string): Promise<string> {
    const msg = message.toLowerCase();

    // Se o usuário diz que não quer algo ou está negando
    if (msg.includes('não quero') || msg.includes('nao quero') ||
        msg.includes('não preciso') || msg.includes('nao preciso')) {
      return `Tudo bem! Não tem problema nenhum. 😊

Quando quiser, estarei aqui para te ajudar com:

🎯 **Criar planos de aula personalizados**
❓ **Tirar dúvidas sobre educação**
📅 **Planejar sua semana de trabalho**

É só falar comigo quando precisar de alguma dessas coisas! ✨`;
    }

    // Verificar se parece uma pergunta (tira-dúvidas)
    if (msg.includes('?') || msg.includes('como') || msg.includes('que') ||
        msg.includes('qual') || msg.includes('quando') || msg.includes('onde') ||
        msg.includes('por que') || msg.includes('porque')) {

      // Processar como tira-dúvidas
      return await OpenAIService.generateResponse(message, sessionId);
    }

    // Fallback geral
    return `Hmm, não consegui entender exatamente o que você precisa! 🤔

Lembre-se, sou especialista em apenas 3 coisas:

🎯 **Criar planos de aula** - Diga algo como "preciso de um plano de aula"
❓ **Tirar dúvidas** - Pergunte qualquer coisa sobre educação
📅 **Planejar a semana** - Diga "quero organizar minha semana"

Qual dessas opções te interessaria agora? Ou se tiver uma dúvida educacional específica, pode perguntar diretamente! 😊`;
  }
}