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
    }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #a78bfa, #6366f1, #06b6d4)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          marginBottom: '8px',
        }}>
          Trifecta Cloud
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: '15px' }}>
          Manage your AI coding agent sandboxes
        </p>
      </div>

      <SignIn
        appearance={{
          variables: {
            colorBackground: '#0c1221',
            colorInputBackground: 'rgba(0,0,0,0.4)',
            colorInputText: '#f1f5f9',
            colorText: '#f1f5f9',
            colorTextSecondary: '#94a3b8',
            colorPrimary: '#6366f1',
            colorAlphaShade: 'white',
            borderRadius: '10px',
          },
          elements: {
            card: { boxShadow: '0 8px 48px rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.07)' },
          },
        }}
      />
    </div>
  );
}
