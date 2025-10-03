export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  type: 'text' | 'audio' | 'video';
  audioUrl?: string;
  videoUrl?: string;
}

export interface ConversationContext {
  sessionId: string;
  currentIntent: Intent | null;
  intentConfidence: number;
  collectedData: Record<string, unknown>;
  conversationHistory: Message[];
  lastActivity: Date;
  waitingFor: string | null; // Campo que indica que tipo de resposta estamos esperando
  lastBotQuestion: string | null; // Última pergunta que o bot fez
}

export type Intent =
  | 'plano_aula'
  | 'tira_duvidas'
  | 'planejamento_semanal'
  | 'saudacao'
  | 'despedida'
  | 'sair'
  | 'continuar'
  | 'revisar_plano'
  | 'reflexao_pedagogica'
  | 'unclear';

export interface PlanoAulaData {
  [key: string]: unknown;
  ano?: string;
  tema?: string;
  habilidadeBNCC?: string;
  nivelDificuldade?: 'facil' | 'medio' | 'dificil';
}

export interface PlanejamentoSemanalData {
  [key: string]: unknown;
  dataInicio?: string;
  dataFim?: string;
  atividades?: string[];
  materias?: string[];
}

export interface IntentAnalysisResult {
  intent: Intent;
  confidence: number;
  entities: Record<string, unknown>;
  missingData?: string[];
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  sessionId?: string;
  intent?: Intent;
  confidence?: number;
  data?: unknown;
}