import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: '3D Suite API',
  description: 'WeTransfer Campaign Manager API',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="max-w-2xl mx-auto p-8">
          <h1 className="text-3xl font-bold mb-4">3D Suite API</h1>
          <p className="text-gray-600 mb-8">WeTransfer Campaign Manager REST API</p>
          
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Endpoints</h2>
            <ul className="list-disc list-inside space-y-2 text-gray-700">
              <li><code className="bg-gray-100 px-2 py-1">GET /api/health</code> - Health check</li>
              <li><code className="bg-gray-100 px-2 py-1">GET /api/campaigns</code> - List campaigns</li>
              <li><code className="bg-gray-100 px-2 py-1">POST /api/campaigns</code> - Create campaign</li>
              <li><code className="bg-gray-100 px-2 py-1">POST /api/campaigns/[id]/leads</code> - Import leads</li>
              <li><code className="bg-gray-100 px-2 py-1">POST /api/campaigns/[id]/send</code> - Start campaign</li>
              <li><code className="bg-gray-100 px-2 py-1">GET /api/campaigns/[id]/logs</code> - Get logs</li>
            </ul>
          </div>

          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-800">
              📖 Full documentation: <Link href="https://github.com/emilysanders0018/3D-Suite" className="underline">GitHub Repository</Link>
            </p>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
