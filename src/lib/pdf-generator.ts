import puppeteer from 'puppeteer';
import { ChatLogger } from './logger';

export class PDFGenerator {
  /**
   * Gera um PDF a partir do conteúdo do plano de aula
   * @param planoContent Conteúdo do plano de aula
   * @param sessionId ID da sessão do usuário
   * @returns Buffer do PDF gerado
   */
  static async generatePlanoAulaPDF(planoContent: string, sessionId: string): Promise<Buffer | null> {
    try {
      console.log('📄 Iniciando geração de PDF...');
      
      // Extrair informações do plano para o cabeçalho
      const planoInfo = this.extractPlanoInfo(planoContent);
      
      // Criar HTML do plano
      const htmlContent = this.createPlanoHTML(planoContent, planoInfo);
      
      // Gerar PDF
      const pdfBuffer = await this.generatePDFFromHTML(htmlContent);
      
      console.log('✅ PDF gerado com sucesso:', pdfBuffer.length, 'bytes');
      ChatLogger.logConversation(sessionId, '[PDF gerado]', `Tamanho: ${pdfBuffer.length} bytes`);
      
      return pdfBuffer;
      
    } catch (error) {
      console.error('❌ Erro ao gerar PDF:', error);
      ChatLogger.logError(sessionId, error as Error, { context: 'pdf_generation' });
      return null;
    }
  }

  /**
   * Extrai informações do plano para usar no cabeçalho
   */
  private static extractPlanoInfo(content: string): {
    ano?: string;
    tema?: string;
    nivelDificuldade?: string;
    data?: string;
  } {
    const info: any = {};
    
    // Extrair ano escolar
    const anoMatch = content.match(/(\d+º\s*ano|Ensino\s*Médio)/i);
    if (anoMatch) {
      info.ano = anoMatch[1];
    }
    
    // Extrair tema/habilidade
    const temaMatch = content.match(/Tema[:\s]+([^\n]+)/i) || 
                     content.match(/Habilidade[:\s]+([^\n]+)/i) ||
                     content.match(/Conteúdo[:\s]+([^\n]+)/i);
    if (temaMatch) {
      info.tema = temaMatch[1].trim();
    }
    
    // Extrair nível de dificuldade
    const nivelMatch = content.match(/NÍVEL DE DIFICULDADE[:\s]+([^\n]+)/i) ||
                      content.match(/nível[:\s]+([^\n]+)/i);
    if (nivelMatch) {
      info.nivelDificuldade = nivelMatch[1].trim();
    }
    
    info.data = new Date().toLocaleDateString('pt-BR');
    
    return info;
  }

  /**
   * Cria o HTML do plano de aula
   */
  private static createPlanoHTML(content: string, info: any): string {
    // Converter quebras de linha e formatação
    const formattedContent = content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>')
      .replace(/^/, '<p>')
      .replace(/$/, '</p>');

    return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Plano de Aula - ${info.ano || 'Educação Básica'}</title>
    <style>
        @page {
            margin: 2cm;
            size: A4;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
        }
        
        .header {
            text-align: center;
            border-bottom: 3px solid #4A90E2;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        
        .header h1 {
            color: #4A90E2;
            font-size: 28px;
            margin: 0 0 10px 0;
            font-weight: 600;
        }
        
        .header .subtitle {
            color: #666;
            font-size: 16px;
            margin: 5px 0;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 20px 0;
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
        }
        
        .info-item {
            display: flex;
            flex-direction: column;
        }
        
        .info-label {
            font-weight: 600;
            color: #4A90E2;
            font-size: 14px;
            margin-bottom: 5px;
        }
        
        .info-value {
            color: #333;
            font-size: 16px;
        }
        
        .content {
            font-size: 14px;
            line-height: 1.8;
        }
        
        .content h2 {
            color: #4A90E2;
            font-size: 18px;
            margin: 25px 0 15px 0;
            border-bottom: 2px solid #e9ecef;
            padding-bottom: 5px;
        }
        
        .content h3 {
            color: #495057;
            font-size: 16px;
            margin: 20px 0 10px 0;
        }
        
        .content p {
            margin: 10px 0;
            text-align: justify;
        }
        
        .content strong {
            color: #4A90E2;
            font-weight: 600;
        }
        
        .content ul, .content ol {
            margin: 10px 0;
            padding-left: 25px;
        }
        
        .content li {
            margin: 5px 0;
        }
        
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #e9ecef;
            text-align: center;
            color: #666;
            font-size: 12px;
        }
        
        .logo {
            font-size: 24px;
            font-weight: bold;
            color: #4A90E2;
            margin-bottom: 10px;
        }
        
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="logo">📚 Nova Escola</div>
        <h1>Plano de Aula</h1>
        <div class="subtitle">Assistente Pedagógico Ane</div>
    </div>
    
    <div class="info-grid">
        <div class="info-item">
            <div class="info-label">Ano Escolar</div>
            <div class="info-value">${info.ano || 'Não especificado'}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Tema/Habilidade</div>
            <div class="info-value">${info.tema || 'Não especificado'}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Nível de Dificuldade</div>
            <div class="info-value">${info.nivelDificuldade || 'Médio'}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Data de Criação</div>
            <div class="info-value">${info.data}</div>
        </div>
    </div>
    
    <div class="content">
        ${formattedContent}
    </div>
    
    <div class="footer">
        <p>Plano de aula gerado pelo Assistente Pedagógico Ane - Nova Escola</p>
        <p>Para mais recursos pedagógicos, acesse: novaescola.org.br</p>
    </div>
</body>
</html>`;
  }

  /**
   * Gera PDF a partir do HTML usando Puppeteer
   */
  private static async generatePDFFromHTML(html: string): Promise<Buffer> {
    let browser;
    
    try {
      // Lançar navegador
      browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });
      
      const page = await browser.newPage();
      
      // Definir conteúdo HTML
      await page.setContent(html, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      
      // Gerar PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '2cm',
          right: '2cm',
          bottom: '2cm',
          left: '2cm'
        },
        displayHeaderFooter: false,
        preferCSSPageSize: true
      });
      
      return Buffer.from(pdfBuffer);
      
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
}
