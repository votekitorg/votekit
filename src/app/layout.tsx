import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Member Plebiscite Platform',
  description: 'Secure online voting platform for membership plebiscites and surveys',
  keywords: ['voting', 'plebiscite', 'survey', 'democracy', 'election'],
  authors: [{ name: 'Member Plebiscite Platform' }],
  viewport: 'width=device-width, initial-scale=1',
  robots: 'noindex, nofollow', // Prevent search engine indexing
  themeColor: '#00843D',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2300843D'><path d='M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z'/></svg>" />
      </head>
      <body className="min-h-screen bg-gray-50">
        <div className="min-h-screen">
          {children}
        </div>
        
        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 py-8 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-sm text-gray-600">
                &copy; {new Date().getFullYear()} Member Plebiscite Platform. 
                Secure, transparent, democratic.
              </p>
              <p className="text-xs text-gray-500 mt-2">
                All votes are confidential and securely encrypted.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}