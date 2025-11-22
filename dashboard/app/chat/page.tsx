import Link from 'next/link';
import { listSources } from '@/lib/blocks';
import { ChatPanel } from '@/components/ChatPanel';

export default function ChatPage() {
  const sources = listSources();
  return (
    <main className="min-h-screen bg-white text-gray-900 px-6 py-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex flex-col gap-2">
          <Link href="/" className="text-sm text-gray-500 hover:text-accent">
            ← Back to dashboard
          </Link>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">AI Analyst</p>
            <h1 className="text-3xl font-semibold text-gray-900">Fingerprint Chat</h1>
            <p className="text-sm text-gray-600">
              Ask questions about folded blocks. Responses cite chain + height from the verifiable
              SQLite dataset and route through Hugging Face’s Kimi-2 model.
            </p>
          </div>
        </header>
        <ChatPanel sources={sources} />
      </div>
    </main>
  );
}


