'use client';

import { useState } from 'react';

export default function AudioTest() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string>('');

  const generateTestAudio = async () => {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Teste de áudio',
          generateAudio: true,
          voice: 'nova'
        }),
      });

      const data = await response.json();
      console.log('Resposta da API:', data);
      
      if (data.audioUrl) {
        setAudioUrl(data.audioUrl);
        console.log('AudioUrl definido:', data.audioUrl.substring(0, 50) + '...');
      } else {
        console.error('Nenhum audioUrl retornado');
      }
    } catch (error) {
      console.error('Erro ao gerar áudio:', error);
    }
  };

  const toggleAudio = () => {
    const audio = document.getElementById('test-audio') as HTMLAudioElement;
    if (audio) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h3 className="text-lg font-bold mb-4">🧪 Teste de Áudio</h3>
      
      <div className="space-y-4">
        <button
          onClick={generateTestAudio}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Gerar Áudio de Teste
        </button>

        {audioUrl && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              ✅ AudioUrl recebido: {audioUrl.substring(0, 50)}...
            </p>
            
            <button
              onClick={toggleAudio}
              className="flex items-center space-x-2 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              {isPlaying ? '⏸️ Pausar' : '▶️ Reproduzir'}
            </button>

            <audio
              id="test-audio"
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={(e) => console.error('Erro no áudio:', e)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
