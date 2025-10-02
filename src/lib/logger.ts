import winston from 'winston';
import { LogEntry } from '@/types';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'whatsapp-chatbot' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
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
      intent: intent as any,
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

  static logError(sessionId: string, error: Error, context?: any) {
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

  static logDataCollection(sessionId: string, intent: string, collectedData: any, missingData?: string[]) {
    if (!this.isEnabled) return;

    const logEntry: LogEntry = {
      timestamp: new Date(),
      level: 'info',
      message: `Data collection for ${intent}`,
      sessionId,
      intent: intent as any,
      data: {
        collectedData,
        missingData
      }
    };

    logger.info(logEntry);
  }
}