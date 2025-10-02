import OpenAI from 'openai';
import { PlanoAulaData, PlanejamentoSemanalData } from '@/types';
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

  static async generatePlanoAula(data: PlanoAulaData, sessionId: string): Promise<string> {
    try {
      const prompt = `
Crie um plano de aula completo com base nas seguintes informações:
- Ano escolar: ${data.ano}
- Tema/Habilidade BNCC: ${data.tema || data.habilidadeBNCC}
- Nível de dificuldade: ${data.nivelDificuldade}

O plano deve incluir:
1. Objetivo geral
2. Objetivos específicos
3. Conteúdo principal
4. Metodologia de ensino
5. Recursos necessários
6. Atividades práticas
7. Avaliação
8. Duração estimada

Seja detalhado e prático, oferecendo sugestões concretas que o professor possa implementar imediatamente.
Use linguagem clara e didática, adequada para o nível educacional especificado.
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Você é um especialista em educação e pedagogia, criando planos de aula detalhados e práticos.' },
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
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
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
    const basePrompt = `Você é um assistente educacional entusiasta e motivador, especializado em ajudar professores.
Seja sempre caloroso, empático e propositivo. Use linguagem natural e conversacional.
Mostre interesse genuíno pelo trabalho do professor e celebre suas iniciativas.
Use emojis ocasionalmente para tornar a conversa mais amigável.
Sempre termine suas respostas sugerindo próximos passos ou oferecendo ajuda adicional.
Responda em português brasileiro de forma clara mas conversacional.`;

    switch (intent) {
      case 'plano_aula':
        return `${basePrompt}
Você está ajudando com a criação de planos de aula - que tarefa importante e empolgante!
Seja encorajador e mostre como cada informação vai tornar o plano ainda melhor.
Faça perguntas de forma natural e explique brevemente por que cada dado é importante.
Colete: ano escolar, tema/habilidade BNCC, e nível de dificuldade.
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
Responda com entusiasmo e energia positiva! Mostre que é um prazer ajudar.
Demonstre interesse genuíno em como posso apoiar o trabalho educacional.
Mencione especificamente as 3 funcionalidades: planos de aula, tira-dúvidas e planejamento semanal.
Faça o professor sentir que está em boas mãos para essas 3 especialidades.`;

      case 'sair':
        return `${basePrompt}
O professor quer reiniciar o fluxo de conversa - demonstre que isso é totalmente normal e positivo!
Confirme que todas as informações anteriores foram limpas e que estamos recomeçando.
Seja entusiasta sobre o recomeço e mostre as 3 funcionalidades disponíveis.
Demonstre energia positiva para essa nova jornada que estamos começando juntos.`;

      default:
        return `${basePrompt}
Seja curioso e interessado em entender como posso ajudar melhor.
Redirecione sempre para uma das 3 especialidades: planos de aula, tira-dúvidas ou planejamento semanal.
Demonstre que essas são suas únicas áreas de expertise.
Sugira começar com uma dessas 3 opções específicas.`;
    }
  }

  private static buildConversationContext(history: any[], collectedData: any): string {
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
