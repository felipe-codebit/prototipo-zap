# 🔧 Debug de Áudio - Guia Passo a Passo

## 🎯 Problema Identificado

A API está funcionando corretamente e retornando `audioUrl`, mas o áudio não está sendo reproduzido na interface.

## 📋 Teste Passo a Passo

### 1. **Acesse a Página**
- Vá para: http://localhost:3000
- Você deve ver um componente "🧪 Teste de Áudio" no topo

### 2. **Teste Básico**
1. **Clique em "Gerar Áudio de Teste"**
2. **Verifique no console (F12)** se aparece:
   ```
   Resposta da API: {response: "...", audioUrl: "data:audio/mpeg;base64,..."}
   AudioUrl definido: data:audio/mpeg;base64,//PkxABi9DnYAOawKDncbNrmkx00jjD8Eo...
   ```

### 3. **Teste de Reprodução**
1. **Se o audioUrl apareceu**, clique em "▶️ Reproduzir"
2. **Verifique no console** se há erros
3. **Teste se o áudio reproduz**

### 4. **Teste na Interface Principal**
1. **Ative o toggle** "🔊 ÁUDIO ATIVADO" (deve ficar verde)
2. **Envie uma mensagem** qualquer
3. **Verifique se aparece** o botão "▶️ Ouvir resposta"
4. **Clique no botão** e teste

## 🔍 Possíveis Problemas

### Problema 1: AudioUrl não aparece
**Solução:**
- Verifique se `generateAudio: true` está sendo enviado
- Confirme se a API está retornando `audioUrl`
- Verifique logs no console

### Problema 2: Botão "Ouvir" não aparece
**Solução:**
- Confirme se `audioResponsesEnabled` está `true`
- Verifique se `message.audioUrl` existe
- Confirme se `message.type === 'audio'`

### Problema 3: Áudio não reproduz
**Solução:**
- Verifique se o navegador suporta MP3
- Teste com outro áudio no navegador
- Verifique se não há bloqueios de autoplay
- Confirme se o Base64 está correto

### Problema 4: Erro no console
**Solução:**
- Copie o erro completo
- Verifique se é problema de CORS
- Teste em modo incógnito

## 🛠️ Debug Avançado

### Verificar Estado do React
```javascript
// No console do navegador
const chatInterface = document.querySelector('[data-testid="chat-interface"]');
console.log('Chat interface:', chatInterface);

// Verificar se o toggle está ativo
const toggle = document.querySelector('button[onclick*="setAudioResponsesEnabled"]');
console.log('Toggle encontrado:', !!toggle);
```

### Verificar Requisições
1. **Abra DevTools (F12)**
2. **Vá para aba Network**
3. **Envie uma mensagem**
4. **Procure por requisição para `/api/chat`**
5. **Verifique se `generateAudio: true` está no payload**

### Testar Áudio Manualmente
```javascript
// No console do navegador
const audio = new Audio('data:audio/mpeg;base64,//PkxABi9DnYAOawKDncbNrmkx00jjD8Eo...');
audio.play().then(() => console.log('Áudio reproduzido')).catch(e => console.error('Erro:', e));
```

## 📞 Se Ainda Não Funcionar

### Colete estas informações:
1. **Screenshot** da interface
2. **Logs do console** (F12)
3. **Navegador e versão**
4. **Resultado do teste básico**

### Teste em ambiente limpo:
1. **Modo incógnito**
2. **Outro navegador**
3. **Outro dispositivo**

---

**Status:** 🔧 Debug em andamento
**Próximo passo:** Execute os testes acima e reporte os resultados
