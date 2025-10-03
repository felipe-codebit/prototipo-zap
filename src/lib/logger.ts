import winston from 'winston';
import { LogEntry, Intent } from '@/types';

// Configuração do logger baseada no ambiente
const isProduction = process.env.NODE_ENV === 'production';
const isVercel = process.env.VERCEL === '1';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'whatsapp-chatbot' },
  transports: []
});

// Em produção (Vercel), usar apenas console
if (isProduction || isVercel) {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
} else {
  // Em desenvolvimento, usar arquivos e console
  logger.add(new winston.transports.File({ filename: 'logs/error.log', level: 'error' }));
  logger.add(new winston.transports.File({ filename: 'logs/combined.log' }));
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export class ChatLogger {
  private static isEnabled = process.env.ENABLE_LOGS === 'true';

  static setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  static isLoggingEnabled(): boolean {
    return this.isEnabled;
  }

  static logIntent(sessionId: string, intent: string, confidence: number, message: string) {
    if (!this.isEnabled) return;

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level: 'info',
      message: `Intent detected: ${intent} (confidence: ${confidence})`,
      sessionId,
      intent: intent as Intent,
      confidence,
      data: { originalMessage: message }
    };

    logger.info(logEntry);
  }

  static logConversation(sessionId: string, userMessage: string, botResponse: string) {
    if (!this.isEnabled) return;

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level: 'info',
      message: 'Conversation exchange',
      sessionId,
      data: {
        userMessage,
        botResponse
      }
    };

    logger.info(logEntry);
  }

  static logError(sessionId: string, error: Error, context?: unknown) {
    if (!this.isEnabled) return;

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level: 'error',
      message: `Error: ${error.message}`,
      sessionId,
      data: {
        error: error.stack,
        context
      }
    };

    logger.error(logEntry);
  }

  static logDataCollection(sessionId: string, intent: string, collectedData: unknown, missingData?: string[]) {
    if (!this.isEnabled) return;

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level: 'info',
      message: `Data collection for ${intent}`,
      sessionId,
      intent: intent as Intent,
      data: {
        collectedData,
        missingData
      }
    };

    logger.info(logEntry);
  }
}