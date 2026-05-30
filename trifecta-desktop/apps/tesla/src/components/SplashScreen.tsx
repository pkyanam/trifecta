export function SplashScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div
        className="flex h-24 w-60 items-center justify-center gap-5"
        aria-label="Trifecta for Tesla splash screen"
      >
        <img alt="Trifecta" className="size-16 object-contain" src="/apple-touch-icon.png" />
        <span className="text-2xl font-light opacity-54" aria-hidden>
          ×
        </span>
        <img alt="Tesla" className="size-16 object-contain" src="/01_0x0-Tesla_T_CoolGrey.png" />
      </div>
    </div>
  );
}
