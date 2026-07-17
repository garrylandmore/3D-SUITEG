import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '3D Suite - WeTransfer Campaign Manager',
  description: 'Professional WeTransfer campaign management with real-time tracking',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {children}
      </body>
    </html>
  );
}
