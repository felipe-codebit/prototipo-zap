# Assistente Educacional - Chatbot WhatsApp

Aplicação fullstack Next.js que simula uma interface do WhatsApp para um chatbot educacional inteligente, com identificação de intenções e funcionalidades específicas para professores.

## 🎯 Funcionalidades Principais

### 🤖 Identificação Inteligente de Intenções
- **Planos de Aula**: Gera planos personalizados com base em ano, tema/habilidade BNCC e nível de dificuldade
- **Tira-dúvidas**: Responde perguntas sobre educação, pedagogia e metodologias
- **Calendário Escolar**: Cria planejamentos semanais/mensais organizados
- **Conversação Natural**: Saudações, despedidas e conversas contextuais

### 🧠 Sistema de Contexto Inteligente
- Memória de conversa que mantém contexto
- Coleta progressiva de dados sem repetições
- Capacidade de mudar de intenção e retomar conversas
- Persistência de dados durante a sessão

### 🎤 Transcrição de Áudio
- Suporte a mensagens de áudio via OpenAI Whisper
- Interface similar ao WhatsApp para gravação
- Processamento automático de áudio em texto

### 📊 Sistema de Logs Habilitável
- Logs detalhados de intenções identificadas
- Rastreamento de confiança das análises
- Debug em tempo real da conversa
- Painel lateral para monitoramento

## 🚀 Como Executar

### Pré-requisitos
- Node.js 18+
- NPM ou Yarn
- Chave da API OpenAI

### Instalação

1. **Instale as dependências:**
```bash
npm install
```

2. **Configure as variáveis de ambiente:**
Edite o arquivo `.env.local` e adicione sua chave da OpenAI:
```bash
OPENAI_API_KEY=sua_chave_aqui
ENABLE_LOGS=true
```

3. **Execute o projeto:**
```bash
npm run dev
```

4. **Acesse:** [http://localhost:3000](http://localhost:3000)

## 🏗️ Arquitetura do Sistema

### Backend (Next.js API Routes)
- `/api/chat` - Processamento de mensagens de texto
- `/api/audio` - Transcrição e processamento de áudio
- `/api/logs` - Controle de logs (habilitar/desabilitar)
- `/api/context` - Gerenciamento de contexto da conversa

### Frontend (React Components)
- `ChatInterface` - Componente principal do chat
- `MessageBubble` - Bolhas de mensagem estilo WhatsApp
- `MessageInput` - Input com suporte a texto e áudio
- `LogsPanel` - Painel de debug e monitoramento
- `TypingIndicator` - Indicador de "digitando..."

### Core Services
- **NLP Service** - Identificação de intenções com node-nlp
- **OpenAI Service** - Integração com GPT e Whisper
- **Message Processor** - Orquestração do fluxo
- **Context Manager** - Gerenciamento de estado
- **Logger** - Sistema de logs Winston

## 🎓 Fluxo de Uso - Exemplo Prático

### Criação de Plano de Aula

1. **Usuário:** "Preciso de um plano de aula"
   - Sistema identifica intenção: `plano_aula`

2. **Bot:** "Para qual ano escolar você quer o plano de aula?"
   - Sistema aguarda coleta de `ano`

3. **Usuário:** "5º ano"
   - Sistema coleta `ano: "5º ano"`

4. **Bot:** "Qual é o tema da aula?"
   - Sistema aguarda `tema` ou `habilidadeBNCC`

5. **Usuário:** "Frações"
   - Sistema coleta `tema: "Frações"`

6. **Bot:** "Qual o nível de dificuldade: fácil, médio ou difícil?"
   - Sistema aguarda `nivelDificuldade`

7. **Usuário:** "Médio"
   - Sistema possui todos os dados necessários
   - **Gera plano completo via OpenAI**

## 🔧 Tecnologias Utilizadas

- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes
- **NLP**: node-nlp para identificação de intenções
- **IA**: OpenAI GPT-3.5-turbo + Whisper
- **Logs**: Winston
- **Estado**: Gerenciamento local de contexto

## 📁 Estrutura do Projeto

```
src/
├── app/
│   ├── api/           # API Routes do Next.js
│   ├── globals.css    # Estilos globais
│   ├── layout.tsx     # Layout principal
│   └── page.tsx       # Página inicial
├── components/        # Componentes React
├── lib/              # Serviços e lógica de negócio
└── types/            # Definições TypeScript
```

## 🧪 Testando o Sistema

### Teste de Intenções
```
"Preciso criar um plano de aula" → plano_aula
"Tenho uma dúvida sobre metodologia" → tira_duvidas
"Quero organizar minha semana" → calendario_escolar
```

### Teste de Contexto
```
1. "Plano de aula para 3º ano"
2. "Sobre matemática"
3. "Nível fácil"
→ Gera plano completo

4. "Agora quero calendário semanal"
→ Muda intenção e mantém contexto
```

### Teste de Áudio
- Grave áudio no botão do microfone
- Sistema transcreve automaticamente
- Processa como mensagem de texto normal

## 📝 Variáveis de Ambiente

```bash
# Obrigatórias
OPENAI_API_KEY=sk-...

# Opcionais
ENABLE_LOGS=true
LOG_LEVEL=info
NODE_ENV=development
```

## 🎨 Interface

A interface replica fielmente o WhatsApp:
- ✅ Bolhas de mensagem com timestamps
- ✅ Indicador de "digitando..."
- ✅ Suporte a áudio com gravação
- ✅ Header com status online
- ✅ Painel de logs opcional
- ✅ Controles de debug

---

**Desenvolvido para Nova Escola** 🎓
