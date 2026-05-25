import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import OSLayout from '@/components/layout/OSLayout';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'TruthShield | AI Cyber Intelligence OS',
  description: 'Ultra-advanced AI cyber intelligence and deepfake detection platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} dark`}>
        <OSLayout>{children}</OSLayout>
      </body>
    </html>
  );
}
