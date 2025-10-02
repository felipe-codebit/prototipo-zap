'use client';

export default function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4">
      <div className="bg-white px-4 py-2 rounded-lg shadow max-w-xs">
        <div className="flex items-center space-x-1">
          <div className="flex space-x-1">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
          </div>
          <span className="text-xs text-gray-500 ml-2">Digitando...</span>
        </div>
      </div>
    </div>
  );
}