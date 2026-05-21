import { SignUp } from '@clerk/nextjs';
import { dark } from '@clerk/themes';

export default function SignUpPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '28px',
      padding: '40px 24px',
      background: '#000',
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: 700,
          color: '#ededed',
          marginBottom: '8px',
          letterSpacing: '-0.02em',
        }}>
          Trifecta Cloud
        </h1>
        <p style={{ color: '#888', fontSize: '14px' }}>
          Manage your AI coding agent sandboxes
        </p>
      </div>

      <SignUp
        appearance={{
          baseTheme: dark,
          variables: {
            colorBackground: '#111111',
            colorInputBackground: '#1a1a1a',
            colorInputText: '#ededed',
            colorText: '#ededed',
            colorTextSecondary: '#aaaaaa',
            colorPrimary: '#0070f3',
            colorDanger: '#e00000',
            colorAlphaShade: '#ffffff',
            borderRadius: '8px',
            fontFamily: 'Inter, -apple-system, sans-serif',
            fontSize: '14px',
            spacingUnit: '18px',
          },
          elements: {
            rootBox: { width: '100%', maxWidth: '420px' },
            card: {
              backgroundColor: '#111111',
              border: '1px solid #2a2a2a',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
              padding: '32px',
            },
            headerTitle: { color: '#ededed' },
            headerSubtitle: { color: '#aaaaaa' },
            socialButtonsBlockButton: {
              backgroundColor: '#1a1a1a',
              border: '1px solid #333333',
              color: '#ededed',
            },
            socialButtonsBlockButtonText: { color: '#ededed' },
            dividerLine: { backgroundColor: '#2a2a2a' },
            dividerText: { color: '#666666' },
            formFieldLabel: { color: '#aaaaaa' },
            formFieldInput: {
              backgroundColor: '#1a1a1a',
              border: '1px solid #333333',
              color: '#ededed',
            },
            footerActionLink: { color: '#0070f3' },
            footerActionText: { color: '#666666' },
            footer: { background: 'transparent' },
            footerAction: { background: 'transparent' },
          },
        }}
      />
    </div>
  );
}
