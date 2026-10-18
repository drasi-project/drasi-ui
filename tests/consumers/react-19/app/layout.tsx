import type { ReactNode } from 'react';
import '@drasi/react/styles.css';

export const metadata = { title: 'Drasi Next App Router consumer' };

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
