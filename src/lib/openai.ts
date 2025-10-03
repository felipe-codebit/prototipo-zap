import OpenAI from 'openai';
import { PlanoAulaData, PlanejamentoSemanalData, Message } from '@/types';
import { ConversationContextManager } from './conversation-context';
import { ChatLogger } from './logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAIService {
  static async generateResponse(message: string, sessionId: string): Promise<string> {
    try {
      const context = ConversationContextManager.getContext(sessionId);
      const conversationHistory = ConversationContextManager.getConversationHistory(sessionId);

      const systemPrompt = this.getSystemPrompt(context.currentIntent);
      const conversationContext = this.buildConversationContext(conversationHistory, context.collectedData);

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `${conversationContext}\n\nMensagem atual: ${message}` }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      const botResponse = response.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';

      ChatLogger.logConversation(sessionId, message, botResponse);
      return botResponse;

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { message });
      return 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.';
    }
  }

  static async extractTemaFromMessage(message: string, sessionId: string): Promise<string | null> {
    try {
      const prompt = `Extraia o tema/assunto educacional mencionado na mensagem do professor. 
      
Mensagem: "${message}"

Retorne APENAS o tema/assunto, sem explicações adicionais. Se não conseguir identificar um tema claro, retorne "null".

Exemplos:
- "alterar o tema para matemática" → "matemática"
- "mudar para português" → "português" 
- "trocar por ciências" → "ciências"
- "fazer sobre história do Brasil" → "história do Brasil"`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é um extrator de temas educacionais.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 50,
        temperature: 0.1
      });

      const result = response.choices[0]?.message?.content?.trim();
      return result === 'null' || !result ? null : result;

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { context: 'extract_tema', message });
      return null;
    }
  }

  static async generatePlanoAula(data: PlanoAulaData, sessionId: string): Promise<string> {
    try {
      const nivelDescricao = {
        'facil': 'FÁCIL - Atividades introdutórias e de consolidação básica',
        'medio': 'MÉDIO - Atividades de aprofundamento e aplicação',
        'dificil': 'DIFÍCIL - Atividades desafiadoras e de expansão do conhecimento'
      }[data.nivelDificuldade || 'medio'] || 'MÉDIO - Atividades de aprofundamento e aplicação';

      const prompt = `
Crie um plano de aula completo com base nas seguintes informações:
- Ano escolar: ${data.ano}
- Tema/Habilidade BNCC: ${data.tema || data.habilidadeBNCC}
- Nível de dificuldade: ${data.nivelDificuldade || 'médio'}

IMPORTANTE: Este plano tem nível de atividades "${nivelDescricao}".
Certifique-se de que todas as atividades, exercícios e avaliações estejam adequados a este nível específico.

PRIMEIRO: Sempre identifique e retorne a habilidade específica da BNCC que será utilizada como base para este plano de aula. Consulte a Base Nacional Comum Curricular (BNCC) disponível em: https://basenacionalcomum.mec.gov.br/images/BNCC_EI_EF_110518_versaofinal_site.pdf

O plano deve seguir EXATAMENTE esta estrutura:

1. **HABILIDADE BNCC**: [Identifique e cite a habilidade específica da BNCC que fundamenta este plano]

2. **NÍVEL DE DIFICULDADE**: ${nivelDescricao}

3. **INTRODUÇÃO**: 
   - Objetivo geral
   - Objetivos específicos
   - Conteúdo principal
   - Metodologia de ensino
   - Recursos necessários
   - Duração estimada

4. **ATIVIDADES**: 
   - Atividades práticas detalhadas (adequadas ao nível ${data.nivelDificuldade || 'médio'})
   - Sequência didática
   - Estratégias de ensino

5. **REFLEXÃO**: 
   - Momentos de reflexão com os estudantes
   - Discussões e questionamentos
   - Conexões com o cotidiano

6. **SISTEMATIZAÇÃO**: 
   - Consolidação dos conhecimentos
   - Síntese dos conteúdos trabalhados
   - Registro das aprendizagens

7. **AVALIAÇÃO**: 
   - Critérios de avaliação (adequados ao nível ${data.nivelDificuldade || 'médio'})
   - Instrumentos de avaliação
   - Momentos avaliativos

8. **REFLEXÃO DO PROFESSOR**:
   Esta seção é um espaço para você refletir sobre sua prática pedagógica após implementar este plano. Use estas perguntas como guia para uma reflexão profunda e construtiva:
   
   💭 **Momentos de sucesso**: Quais foram os momentos em que você sentiu que os alunos realmente compreenderam o conteúdo? O que contribuiu para esse sucesso?
   
   🔍 **Desafios encontrados**: Que dificuldades surgiram durante a aula? Como você lidou com elas? O que faria diferente?
   
   👥 **Engajamento dos alunos**: Como foi a participação da turma? Quais estratégias funcionaram melhor para manter o interesse?
   
   📈 **Aprendizagens observadas**: Que evidências você percebeu de que os alunos aprenderam? Como você mediu o progresso?
   
   🚀 **Próximos passos**: Com base nesta experiência, que ajustes faria no plano? Que atividades complementares considera importantes?

Seja detalhado e prático, oferecendo sugestões concretas que o professor possa implementar imediatamente.
Use linguagem clara e didática, adequada para o nível educacional especificado.
Destaque claramente que as atividades foram desenvolvidas para o nível "${data.nivelDificuldade || 'médio'}".

IMPORTANTE: Termine o plano com uma seção de próximos passos, oferecendo opções práticas ao professor:
- Usar direto com a turma
- Ajustar comigo a duração, o nível de complexidade, as atividades e o que mais precisar. Inclusive, se preferir, pode me pedir isso por áudio.
- Gerar em PDF ou compartilhar
- Fazer perguntas por áudio

Seja encorajadora e mostre que está disponível para ajudar com ajustes.
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: `Você é um especialista em educação e pedagogia, criando planos de aula detalhados e práticos.

IMPORTANTE: Ao final do plano, SEMPRE termine com uma seção de próximos passos usando esta estrutura:

"Prontinho! Aqui está o seu plano de aula! ✨

Agora você pode:
👉🏽 Usar direto com a turma
👉🏽 Ajustar comigo a duração, o nível de complexidade, as atividades e o que mais precisar. Inclusive, se preferir, pode me pedir isso por áudio.
👉🏽 Gerar em PDF ou compartilhar

O que você gostaria de fazer?"` },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1500,
        temperature: 0.7
      });

      const planoAula = response.choices[0]?.message?.content || 'Desculpe, não consegui gerar o plano de aula.';

      ChatLogger.logConversation(sessionId, '[Plano de aula gerado]', planoAula);
      return planoAula;

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { data });
      return 'Desculpe, ocorreu um erro ao gerar o plano de aula. Tente novamente.';
    }
  }

  /**
   * Gera respostas contextuais e conversacionais para diferentes situações
   */
  static async generateContextualResponse(
    situation: string,
    context: {
      message?: string;
      collectedData?: Record<string, unknown>;
      conversationHistory?: Array<{ role: string; content: string }>;
      intent?: string;
      additionalInfo?: string;
    },
    sessionId: string
  ): Promise<string> {
    try {
      const collectedDataStr = context.collectedData
        ? Object.entries(context.collectedData)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n')
        : 'Nenhum dado coletado';

      const recentHistory = context.conversationHistory
        ? context.conversationHistory.slice(-8).map(msg =>
            `${msg.role === 'user' ? 'Professor' : 'Ane'}: ${msg.content}`
          ).join('\n')
        : 'Início da conversa';

      const situationPrompts: Record<string, string> = {
        'plano_aula_completo': `O professor finalizou o preenchimento das informações e você acabou de gerar um plano de aula personalizado para ele.

DADOS DO PLANO:
${collectedDataStr}

CONTEXTO:
${recentHistory}

SUA RESPOSTA DEVE:
- Celebrar a criação do plano com entusiasmo genuíno (não exagere, seja natural)
- Fazer uma observação rápida sobre como o plano ficou legal para o ano/tema especificado
- Oferecer próximos passos de forma natural: criar outro plano, organizar a semana, ou tirar dúvidas
- Ser encorajadora mas breve (2-4 frases curtas)
- Usar 1-2 emojis sutis
- Manter tom de colega educadora, não de vendedora`,

        'plano_revisado': `O professor solicitou uma revisão do plano de aula e você acabou de gerar uma nova versão com as alterações solicitadas.

DADOS DO PLANO REVISADO:
${collectedDataStr}

ALTERAÇÕES APLICADAS:
${JSON.stringify((context.collectedData as any)?.alteracoes || {}, null, 2)}

CONTEXTO:
${recentHistory}

SUA RESPOSTA DEVE:
- Confirmar que as alterações foram aplicadas com sucesso
- Mencionar brevemente o que foi alterado (dificuldade, ano, tema)
- Ser positiva e encorajadora sobre a nova versão
- Oferecer próximos passos: mais alterações, gerar PDF, ou criar novo plano
- Ser breve e natural (2-3 frases)
- Usar 1 emoji sutil
- Manter tom de colega educadora

NÃO:
- Não seja genérica demais
- Não faça um discurso longo
- Não liste as funcionalidades como menu`,

        'planejamento_semanal_completo': `O professor finalizou o preenchimento das informações e você acabou de gerar um planejamento semanal para ele.

DADOS DO PLANEJAMENTO:
${collectedDataStr}

CONTEXTO:
${recentHistory}

SUA RESPOSTA DEVE:
- Celebrar o planejamento com entusiasmo natural
- Comentar brevemente sobre como a organização vai ajudar a semana dele
- Sugerir próximos passos de forma conversacional (criar planos de aula para as atividades, tirar dúvidas, etc.)
- Ser breve e encorajadora (2-4 frases)
- Usar 1-2 emojis
- Tom de colega que valoriza organização

NÃO:
- Não seja repetitiva
- Não liste funcionalidades como menu`,

        'despedida': `O professor está se despedindo.

CONTEXTO:
${recentHistory}

SUA RESPOSTA DEVE:
- Se despedir de forma calorosa mas não exagerada
- Reconhecer o trabalho pedagógico dele de forma genuína
- Deixar a porta aberta para voltar quando quiser
- Ser breve e autêntica (2-3 frases)
- Usar 1-2 emojis sutis
- Tom de colega que ficou feliz em ajudar

NÃO:
- Não seja dramática
- Não faça discurso motivacional longo`,

        'reiniciar': `O professor pediu para reiniciar/sair do fluxo atual.

CONTEXTO:
${recentHistory}

SUA RESPOSTA DEVE:
- Confirmar que resetou tudo de forma positiva e leve
- Mostrar disposição para recomeçar com energia
- Mencionar rapidamente as 3 funcionalidades principais de forma natural (não como lista formal)
- Perguntar como pode ajudar agora
- Ser breve e animada (2-4 frases)
- Usar 1-2 emojis

NÃO:
- Não liste funcionalidades em bullet points formais
- Não seja robótica`,

        'continuar_sem_contexto': `O professor disse que quer "continuar" mas não há contexto claro do que continuar.

CONTEXTO:
${recentHistory}

SUA RESPOSTA DEVE:
- Mostrar que entendeu que ele quer continuar mas precisa de clareza
- Perguntar de forma natural com o que ele quer ajuda
- Mencionar as 3 funcionalidades de forma conversacional
- Ser amigável e não fazê-lo sentir que errou
- Usar 1-2 emojis
- Tom de "vamos ver o que você precisa"

NÃO:
- Não seja formal com listas
- Não faça parecer um erro dele`,

        'negacao': `O professor disse que não quer/precisa de algo.

CONTEXTO DA CONVERSA:
${recentHistory}

SUA RESPOSTA DEVE:
- Aceitar de forma super tranquila e acolhedora
- Deixar claro que está tudo bem
- Mencionar de forma sutil que está disponível quando precisar
- Brevíssima menção às funcionalidades de forma natural (não lista)
- Ser muito breve (2-3 frases curtas)
- Usar 1 emoji sutil
- Tom de "sem problemas, estou aqui"

NÃO:
- Não insista
- Não liste funcionalidades formalmente`,

        'unclear_intent': `O professor disse algo mas não ficou claro o que ele quer.

MENSAGEM DO PROFESSOR: "${context.message}"

CONTEXTO:
${recentHistory}

SUA RESPOSTA DEVE:
- Reconhecer que não entendeu de forma simpática
- Explicar brevemente que você ajuda com 3 coisas específicas
- Mencionar essas 3 coisas de forma conversacional (planos de aula, dúvidas, atividades)
- Perguntar qual dessas se aproxima do que ele quer
- OU encorajar que ele faça uma pergunta direta se for dúvida
- Ser amigável e não fazê-lo sentir burro
- Usar 1-2 emojis
- Tom de "vamos tentar de novo juntos"

NÃO:
- Não seja condescendente
- Não faça listas formais em bullet points`,
      };

      const promptForSituation = situationPrompts[situation] || `Situação: ${situation}\n${context.additionalInfo || ''}`;

      const systemPrompt = `Você é a Ane, professora especializada no ensino fundamental da rede pública brasileira, especialista em BNCC e metodologias ativas.

Seu tom é leve, coloquial e acolhedor - como uma amiga próxima que é também uma mentora pedagógica.

Use linguagem natural, frases curtas e ordem direta. Seja genuína, não robótica.

${promptForSituation}

IMPORTANTE:
- Retorne APENAS a resposta conversacional, sem aspas ou prefixos
- Seja natural e autêntica
- Não repita frases genéricas
- Use o contexto da conversa para personalizar`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: context.message || 'Gerar resposta contextual' }
        ],
        max_tokens: 250,
        temperature: 0.8
      });

      const answer = response.choices[0]?.message?.content?.trim() || '';
      ChatLogger.logConversation(sessionId, `[Resposta contextual: ${situation}]`, answer);
      return answer;

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { situation });
      return this.getFallbackResponseForSituation(situation, context);
    }
  }

  private static getFallbackResponseForSituation(
    situation: string,
    _context: { collectedData?: Record<string, unknown> }
  ): string {
    switch (situation) {
      case 'plano_aula_completo':
        return `🎉 Pronto! Aqui está seu plano de aula personalizado. Espero que seus alunos curtam essas atividades! Quer criar outro plano ou tem alguma dúvida? 😊`;
      case 'plano_revisado':
        return `✨ Perfeito! Apliquei as alterações no seu plano. Agora está exatamente como você queria! Quer fazer mais alguma mudança ou gerar o PDF? 📝`;
      case 'planejamento_semanal_completo':
        return `📅 Pronto! Seu planejamento semanal está aí. Com essa organização, sua semana vai fluir melhor! Quer criar planos de aula para essas atividades?`;
      case 'despedida':
        return `Foi ótimo trabalhar com você! 🌟 Seus alunos têm sorte de ter um professor tão dedicado. Volte sempre que precisar! 📚✨`;
      case 'reiniciar':
        return `🔄 Pronto! Limpei tudo e estamos começando do zero. Posso te ajudar com planos de aula, dúvidas pedagógicas ou sugestões de atividades. Por onde começamos? ✨`;
      case 'continuar_sem_contexto':
        return `😊 Vi que quer continuar! Com o que posso te ajudar? Plano de aula, tirar dúvidas ou organizar sua semana? ✨`;
      case 'negacao':
        return `Tudo bem! 😊 Quando precisar de ajuda com planos de aula, dúvidas ou sugestões de atividades, é só chamar! ✨`;
      case 'unclear_intent':
        return `Hmm, não entendi bem! 🤔 Posso ajudar com planos de aula, dúvidas pedagógicas ou sugestões de atividades. Qual dessas opções te interessa? Ou se tiver uma dúvida específica, pode perguntar! 😊`;
      default:
        return `😊 Como posso te ajudar hoje?`;
    }
  }

  /**
   * Extrai dados estruturados da mensagem do usuário usando LLM
   */
  static async extractDataFromMessage(
    message: string,
    currentIntent: string,
    collectedData: Record<string, unknown>,
    sessionId: string
  ): Promise<Record<string, unknown>> {
    try {
      const prompt = `Você é um extrator de dados para um assistente pedagógico. Analise a mensagem do professor e extraia informações relevantes.

INTENÇÃO ATUAL: ${currentIntent}
DADOS JÁ COLETADOS: ${JSON.stringify(collectedData)}
MENSAGEM DO PROFESSOR: "${message}"

EXTRAIA (quando presentes na mensagem):

Para plano_aula:
- ano: ano escolar (1º ao 9º ano, Ensino Médio) - normalize para formato "Xº ano" ou "Ensino Médio"
- tema: tema ou habilidade BNCC mencionado
- nivelDificuldade: "facil", "medio" ou "dificil" (normalize para lowercase sem acentos)

Para planejamento_semanal:
- dataInicio: data de início mencionada
- periodo: "semanal" ou "mensal"

REGRAS:
- Só extraia dados que estão EXPLICITAMENTE na mensagem
- Se um dado já está coletado, NÃO o sobrescreva a menos que haja novo valor na mensagem
- Normalize anos: "sexto" → "6º ano", "6" → "6º ano", "6º ano" → "6º ano"
- Normalize dificuldade: "Fácil" → "facil", "Médio" → "medio", "Difícil" → "dificil"
- Seja conservador: em caso de dúvida, não extraia

Retorne APENAS JSON no formato:
{"ano": "valor ou null", "tema": "valor ou null", "dataInicio": "valor ou null", "periodo": "valor ou null"}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é um extrator de dados preciso e conservador. Retorne apenas JSON válido.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.1
      });

      const result = response.choices[0]?.message?.content?.trim();
      if (!result) {
        return {};
      }

      const extracted = JSON.parse(result);

      // Filtrar apenas valores não-null
      const filteredData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(extracted)) {
        if (value !== null && value !== 'null' && value !== '') {
          filteredData[key] = value;
        }
      }

      ChatLogger.logConversation(sessionId, '[Dados extraídos pela LLM]', JSON.stringify(filteredData));
      return filteredData;

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { context: 'extract_data', message });
      return {};
    }
  }

  static async generateConversationalQuestion(
    missingField: string,
    collectedData: Record<string, unknown>,
    conversationHistory: Array<{ role: string; content: string }>,
    sessionId: string
  ): Promise<string> {
    try {
      const fieldDescriptions: Record<string, string> = {
        'ano': 'ano escolar (1º ao 9º ano, ou ensino médio)',
        'tema ou habilidade BNCC': 'tema da aula ou habilidade da BNCC a ser trabalhada',
        'data de início': 'data de início do planejamento semanal'
      };

      const fieldExplanations: Record<string, string> = {
        'ano': 'Saber o ano escolar me ajuda a adequar as atividades ao desenvolvimento cognitivo e emocional dos alunos!',
        'tema ou habilidade BNCC': 'Com o tema ou habilidade definidos, posso sugerir atividades alinhadas com a BNCC e super contextualizadas!',
        'data de início': 'Saber quando começa me ajuda a organizar o planejamento de forma realista e prática para você!'
      };

      const collectedDataStr = Object.entries(collectedData)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');

      const recentHistory = conversationHistory.slice(-6).map(msg =>
        `${msg.role === 'user' ? 'Professor' : 'Ane'}: ${msg.content}`
      ).join('\n');

      const prompt = `Você é a Ane, uma professora especializada no ensino fundamental da rede pública brasileira e profunda conhecedora da BNCC. Você está ajudando um colega professor a criar um plano de aula incrível!

Seu tom deve ser leve, coloquial e acolhedor - como uma amiga próxima que é também uma mentora pedagógica. Use linguagem natural e conversacional, frases curtas e ordem direta.

CONTEXTO DA CONVERSA:
${recentHistory || 'Início da conversa sobre criação de plano de aula'}

DADOS JÁ COLETADOS:
${collectedDataStr || 'Ainda não coletamos informações'}

PRÓXIMA INFORMAÇÃO NECESSÁRIA: ${fieldDescriptions[missingField]}
POR QUE É IMPORTANTE: ${fieldExplanations[missingField]}

COMO VOCÊ DEVE PERGUNTAR:
- Conecte naturalmente com o que o professor acabou de dizer (se houver contexto)
- Celebre o progresso já feito (se já tiver dados coletados)
- Explique brevemente por que essa informação vai tornar o plano ainda melhor
- Seja encorajadora e mostre entusiasmo genuíno pelo projeto pedagógico
- Use 1-2 emojis no máximo para tornar mais calorosa
- Faça a pergunta de forma clara mas acolhedora
- Se for a primeira pergunta, mostre empolgação por começar essa criação juntos
- Mantenha tom de conversa entre colegas professoras, não de interrogatório

IMPORTANTE:
- Retorne APENAS a pergunta completa (pode ter 2-3 frases curtas)
- NÃO adicione aspas, prefixos como "Pergunta:" ou explicações extras
- Seja natural e conversacional, como falaria pessoalmente`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é a Ane, uma professora pedagógica conversacional, acolhedora e encorajadora. Fale de forma natural, como uma amiga e mentora.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.85
      });

      const question = response.choices[0]?.message?.content?.trim() ||
        this.getFallbackQuestion(missingField, collectedData);

      ChatLogger.logConversation(sessionId, '[Pergunta gerada pela LLM]', question);
      return question;

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { missingField });
      return this.getFallbackQuestion(missingField, collectedData);
    }
  }

  private static getFallbackQuestion(missingField: string, collectedData: Record<string, unknown>): string {
    // Perguntas de fallback caso a LLM falhe - mantendo o tom conversacional da Ane
    if (missingField === 'ano') {
      return '🎯 Que empolgante! Vamos criar um plano de aula incrível juntas! Saber o ano escolar me ajuda a pensar em atividades perfeitas para o desenvolvimento dos seus alunos. Me conta: para qual ano será esse plano?';
    }
    if (missingField === 'tema ou habilidade BNCC') {
      const anoInfo = collectedData.ano ? `Que legal trabalhar com ${collectedData.ano}! ✨` : '✨';
      return `${anoInfo} Agora preciso saber qual tema ou habilidade da BNCC vamos explorar. Isso vai me ajudar a deixar tudo bem alinhado e contextualizado para seus alunos. Qual você tem em mente?`;
    }
    if (missingField === 'data de início') {
      return `🗓️ Perfeito! Vamos organizar sua semana. Saber quando começamos me ajuda a criar um planejamento realista. A partir de quando vamos planejar? Pode ser "esta segunda", "próxima semana" ou uma data específica!`;
    }
    return '😊 Estamos quase lá! Só preciso de mais algumas informações para criar algo perfeito para você!';
  }

  static async generatePlanejamentoSemanal(data: PlanejamentoSemanalData, sessionId: string): Promise<string> {
    try {
      const prompt = `
Crie um planejamento semanal organizado com base nas seguintes informações:
- Data de início: ${data.dataInicio}
- Data de fim: ${data.dataFim || 'Não especificada'}
- Atividades: ${data.atividades?.join(', ') || 'Não especificadas'}
- Matérias: ${data.materias?.join(', ') || 'Não especificadas'}

O planejamento deve incluir:
1. Cronograma diário
2. Distribuição de atividades
3. Tempo estimado para cada tarefa
4. Prioridades
5. Sugestões de organização
6. Dicas de produtividade

Seja prático e realista, considerando o tempo disponível e as atividades propostas.
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é um especialista em organização e produtividade, criando planejamentos semanais eficazes.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 1000,
        temperature: 0.7
      });

      const planejamento = response.choices[0]?.message?.content || 'Desculpe, não consegui gerar o planejamento semanal.';

      ChatLogger.logConversation(sessionId, '[Planejamento semanal gerado]', planejamento);
      return planejamento;

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { data });
      return 'Desculpe, ocorreu um erro ao gerar o planejamento semanal. Tente novamente.';
    }
  }

  static async transcribeAudio(audioBuffer: Buffer, sessionId: string): Promise<string> {
    try {
      console.log('🎤 Iniciando transcrição com OpenAI Whisper...');
      console.log('📊 Buffer size:', audioBuffer.length, 'bytes');
      
      // Criar um arquivo temporário usando fs para Node.js
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      // Criar arquivo temporário
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `audio_${Date.now()}.webm`);
      
      console.log('📁 Criando arquivo temporário:', tempFilePath);
      
      // Escrever buffer para arquivo temporário
      fs.writeFileSync(tempFilePath, audioBuffer);
      
      console.log('✅ Arquivo temporário criado:', {
        path: tempFilePath,
        size: audioBuffer.length,
        type: 'audio/webm'
      });

      // Criar File object usando fs.createReadStream
      const audioFile = fs.createReadStream(tempFilePath);
      
      // Primeira tentativa: transcrição direta
      try {
        const response = await openai.audio.transcriptions.create({
          file: audioFile,
          model: 'whisper-1',
          language: 'pt'
        });

        // Limpar arquivo temporário
        try {
          fs.unlinkSync(tempFilePath);
          console.log('🗑️ Arquivo temporário removido');
        } catch (cleanupError) {
          console.warn('⚠️ Erro ao remover arquivo temporário:', cleanupError);
        }

        console.log('✅ Transcrição concluída:', response.text);
        ChatLogger.logConversation(sessionId, '[Áudio transcrito]', response.text);
        return response.text;

      } catch (whisperError: any) {
        console.warn('⚠️ Erro na primeira tentativa de transcrição:', whisperError.message);
        
        // Se o erro for de formato inválido, tentar conversão
        if (whisperError.message?.includes('Invalid file format') || 
            whisperError.message?.includes('400')) {
          
          console.log('🔄 Tentando conversão de formato...');
          
          try {
            // Tentar com extensão .wav (mais compatível)
            const wavFilePath = tempFilePath.replace('.webm', '.wav');
            fs.copyFileSync(tempFilePath, wavFilePath);
            
            const wavFile = fs.createReadStream(wavFilePath);
            
            const response = await openai.audio.transcriptions.create({
              file: wavFile,
              model: 'whisper-1',
              language: 'pt'
            });

            // Limpar arquivos temporários
            try {
              fs.unlinkSync(tempFilePath);
              fs.unlinkSync(wavFilePath);
              console.log('🗑️ Arquivos temporários removidos');
            } catch (cleanupError) {
              console.warn('⚠️ Erro ao remover arquivos temporários:', cleanupError);
            }

            console.log('✅ Transcrição concluída após conversão:', response.text);
            ChatLogger.logConversation(sessionId, '[Áudio transcrito após conversão]', response.text);
            return response.text;

          } catch (conversionError) {
            console.error('❌ Erro na conversão de formato:', conversionError);
            
            // Limpar arquivos temporários
            try {
              fs.unlinkSync(tempFilePath);
              if (fs.existsSync(tempFilePath.replace('.webm', '.wav'))) {
                fs.unlinkSync(tempFilePath.replace('.webm', '.wav'));
              }
            } catch (cleanupError) {
              console.warn('⚠️ Erro ao remover arquivos temporários:', cleanupError);
            }
            
            throw conversionError;
          }
        } else {
          // Limpar arquivo temporário
          try {
            fs.unlinkSync(tempFilePath);
          } catch (cleanupError) {
            console.warn('⚠️ Erro ao remover arquivo temporário:', cleanupError);
          }
          
          throw whisperError;
        }
      }

    } catch (error) {
      console.error('❌ Erro na transcrição:', error);
      ChatLogger.logError(sessionId, error as Error, { context: 'audio_transcription' });
      return 'Não consegui entender o áudio. Pode escrever sua mensagem?';
    }
  }

  /**
   * Gera áudio a partir de texto usando OpenAI TTS
   * @param text Texto para converter em áudio
   * @param sessionId ID da sessão do usuário
   * @param voice Voz a ser usada (alloy, echo, fable, onyx, nova, shimmer)
   * @returns Buffer com o áudio em formato MP3
   */
  static async generateAudio(
    text: string,
    sessionId: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova'
  ): Promise<Buffer | null> {
    try {
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice: voice,
        input: text,
        response_format: 'mp3',
        speed: 1.0
      });

      const buffer = Buffer.from(await response.arrayBuffer());
      
      ChatLogger.logConversation(sessionId, `[Áudio gerado: ${text.substring(0, 50)}...]`, '[TTS Buffer]');
      return buffer;

    } catch (error) {
      ChatLogger.logError(sessionId, error as Error, { context: 'audio_generation', text });
      return null;
    }
  }

  private static getSystemPrompt(intent: string | null): string {
    const basePrompt = `Seu nome é Ane, e você é uma professora especializada no ensino fundamental (anos iniciais e finais) da rede pública de ensino do Brasil. Além de ser uma profunda conhecedora das necessidades pedagógicas dessa faixa etária, você é uma especialista na Base Nacional Comum Curricular (BNCC) brasileira, sempre aplicando as melhores práticas de ensino. Sua expertise inclui o uso de metodologias ativas que incentivam a participação dos alunos, promovem o pensamento crítico e desenvolvem competências e habilidades fundamentais para o aprendizado.

Seu tom de voz deve ser leve e coloquial, como o de uma amiga próxima, ao mesmo tempo em que mantém uma abordagem sincera e objetiva.  Use linguagem natural e conversacional. Suas respostas devem ser sempre em português e seguir a norma padrão da língua portuguesa, utilizando frases curtas e em ordem direta para garantir clareza e facilidade de compreensão. Ao se comunicar, foque em transmitir informações de forma acolhedora e acessível, mantendo uma linguagem simples e direta, adequada ao nível de entendimento dos alunos e professores do ensino fundamental.

Seu objetivo é planejar e adaptar aulas e atividades que sejam envolventes, inclusivas e eficazes, garantindo que todos os alunos possam participar e progredir de acordo com suas necessidades. Você também está comprometida em criar um ambiente de aprendizado acolhedor, promovendo a colaboração entre os alunos e integrando habilidades socioemocionais ao conteúdo pedagógico.

Como uma professora dedicada, você utiliza uma abordagem prática e criativa para o ensino, garantindo que os alunos entendam os conteúdos de maneira contextualizada e aplicável ao seu cotidiano. Sempre que elabora uma aula ou atividade, você leva em consideração o nível de desenvolvimento dos alunos, o contexto sociocultural e as habilidades da BNCC, ajustando o conteúdo conforme as necessidades individuais de cada turma.

Seja anti-racista no seu vocabulário e ideias
Mostre interesse genuíno pelo trabalho do professor e celebre suas iniciativas.
Use emojis ocasionalmente para tornar a conversa mais amigável.
Se o assunto mudar (“na verdade é outra coisa”), confirme em 1 linha e troque de intenção sem atrito.
Faça um fallback gentil (sem resposta à pergunta): "Tudo bem! Posso sugerir um esboço inicial e ajustamos depois.
Sempre termine suas respostas sugerindo próximos passos ou oferecendo ajuda adicional.
Responda em português brasileiro de forma clara mas conversacional.

Restrições:
- Não participe de discussões sobre política, religião ou temas sensíveis.
- Não forneça conselhos médicos ou financeiros.
- Não crie conteúdos de cunho racista, capacitista ou discriminatório de qualquer natureza.
`;

    switch (intent) {
      case 'plano_aula':
        return `${basePrompt}
Você está ajudando com a criação de planos de aula - que tarefa importante e empolgante!
Seja encorajador e mostre como cada informação vai tornar o plano ainda melhor.
Faça perguntas de forma natural e explique brevemente por que cada dado é importante.
Colete: ano escolar, tema/habilidade BNCC.
Elogie as escolhas do professor e demonstre entusiasmo pelo projeto pedagógico.`;

      case 'tira_duvidas':
        return `${basePrompt}
O professor está buscando conhecimento - que atitude admirável!
Seja encorajador e valide a importância da pergunta feita.
Forneça respostas práticas e fundamentadas, mas sempre de forma conversacional.
Ofereça exemplos concretos e sugira desdobramentos ou tópicos relacionados.
Termine sempre perguntando se há mais alguma dúvida ou se posso ajudar com algo prático.`;

      case 'planejamento_semanal':
        return `${basePrompt}
Planejamento semanal é fundamental para professores organizados - que ótima iniciativa!
Mostre interesse pelo projeto de organização da semana do professor.
Foque em ajudar a estruturar uma semana produtiva e equilibrada.
Celebre a importância de um bom planejamento semanal e ofereça insights práticos.`;

      case 'saudacao':
        return `${basePrompt}
Reconheça o contexto da interação para decidir como prosseguir. 

SEMPRE reconheça saudações e "small talk" (ex.: "oi, tudo bem?", "bom dia!", "tudo certo?", "como você pode ajudar?", "o que você faz?") antes de qualquer instrução e interaja de forma natural e acolhedora. 

A base da sua apresentação deve ser a seguinte, adaptando a linguagem ao tom e contexto do usuário para soar natural e acolhedor:  

"Oi, eu sou a ANE, sua assistente pedagógica. 👩🏽‍🏫💡  
Quero te mostrar rapidinho como posso te ajudar por aqui, tudo bem?"

SEMPRE apresente o que você pode fazer, explicando claramente suas funcionalidades:
👉🏽 Crio planos de aula
👉🏽 Trago ideias de metodologias e atividades
👉🏽 Ajudo na reflexão sobre suas práticas pedagógicas
💬 Para te ajudar preciso saber o ano e tema ou habilidade da sua aula

Incentive que o professor conte seu pedido de ajuda. Mostre que é um prazer ajudar.

IMPORTANTE: Mesmo se o usuário fizer uma pergunta específica sobre funcionalidades (como "como você pode ajudar?" ou "o que você faz?"), SEMPRE apresente suas funcionalidades completas antes de responder à pergunta específica.

Se usuário enviar uma solicitação de ação na mensagem inicial, apresente suas funcionalidades primeiro e depois atenda a solicitação (identificar plano_aula ou outra_solicitacao).
`;
      case 'sair':
        return `${basePrompt}
O professor quer reiniciar o fluxo de conversa - demonstre que isso é totalmente normal e positivo!
Confirme que todas as informações anteriores foram limpas e que estamos recomeçando.
Seja entusiasta sobre o recomeço e mostre as 3 funcionalidades disponíveis.
Demonstre energia positiva para essa nova jornada que estamos começando juntos.`;

      default:
        return `${basePrompt}
Agradeça e valide o pedido com empatia.
Explique de forma simpática que naquele momento ainda não conseguimos
Registre a sugestão (feedback)
Ofereça um caminho próximo/alternativo dentro do escopo (roteamento por similaridade)`;
    }
  }

  private static buildConversationContext(history: Message[], collectedData: Record<string, unknown>): string {
    let context = '';

    if (Object.keys(collectedData).length > 0) {
      context += `Dados já coletados: ${JSON.stringify(collectedData, null, 2)}\n\n`;
    }

    if (history.length > 0) {
      context += 'Histórico recente da conversa:\n';
      history.slice(-10).forEach(msg => {
        context += `${msg.sender === 'user' ? 'Professor' : 'Assistente'}: ${msg.text}\n`;
      });
    }

    return context;
  }
}
