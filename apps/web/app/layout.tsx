import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Policy Sales Portal',
  description: 'UAE individual medical insurance — application engine',
};

// Mobile-first is a hard constraint for the customer journey (ARCHITECTURE §1)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
