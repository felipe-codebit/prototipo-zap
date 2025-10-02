import ChatInterface from '@/components/ChatInterface';
import AudioTest from '@/components/AudioTest';

export default function Home() {
  return (
    <main className="min-h-screen">
      <div className="container mx-auto p-4">
        <AudioTest />
        <div className="mt-8">
          <ChatInterface />
        </div>
      </div>
    </main>
  );
}
