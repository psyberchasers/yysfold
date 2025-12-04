import './globals.css';
import type { Metadata } from 'next';
import HeartbeatClient from '@/components/HeartbeatClient';

export const metadata: Metadata = {
  title: 'Folding Dashboard',
  description: 'Verifiable block summaries and behavioral heatmaps',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <HeartbeatClient />
      </body>
    </html>
  );
}

