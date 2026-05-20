import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '32px',
      padding: '24px',
      background: '#000',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#ededed', marginBottom: '8px', letterSpacing: '-0.02em' }}>
          Trifecta Cloud
        </h1>
        <p style={{ color: '#888', fontSize: '14px' }}>
          Manage your AI coding agent sandboxes
        </p>
      </div>

      <SignIn
        appearance={{
          variables: {
            colorBackground: '#111111',
            colorInputBackground: '#1a1a1a',
            colorInputText: '#ededed',
            colorText: '#ededed',
            colorTextSecondary: '#888888',
            colorPrimary: '#0070f3',
            colorAlphaShade: '#ededed',
            borderRadius: '8px',
            fontFamily: 'Inter, -apple-system, sans-serif',
            fontSize: '14px',
          },
          elements: {
            card: {
              boxShadow: '0 0 0 1px #333333, 0 16px 48px rgba(0,0,0,0.9)',
              border: '1px solid #333333',
              backgroundColor: '#111111',
            },
            headerTitle: { color: '#ededed', fontWeight: 600 },
            headerSubtitle: { color: '#888888' },
            socialButtonsBlockButton: {
              border: '1px solid #333333',
              backgroundColor: '#1a1a1a',
              color: '#ededed',
            },
            dividerLine: { backgroundColor: '#333333' },
            dividerText: { color: '#555555' },
            formFieldInput: {
              backgroundColor: '#1a1a1a',
              border: '1px solid #333333',
              color: '#ededed',
            },
            formButtonPrimary: {
              backgroundColor: '#0070f3',
              border: 'none',
            },
            footerActionLink: { color: '#0070f3' },
            identityPreviewText: { color: '#ededed' },
            identityPreviewEditButton: { color: '#0070f3' },
          },
        }}
      />
    </div>
  );
}
