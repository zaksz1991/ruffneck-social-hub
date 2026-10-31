import './globals.css';
export const metadata = {
  title: { default: 'RuffNeck Social Hub', template: '%s | RuffNeck Social Hub' },
  description: 'One secure operating hub for multi-brand social publishing, conversations and AI-assisted workflows.',
  applicationName: 'RuffNeck Social Hub',
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/icons/apple-touch-icon.png' },
  manifest: '/manifest.webmanifest',
};
export const viewport = { themeColor: '#101d35' };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
