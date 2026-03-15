/**
 * Dark-themed centered loading fallback for React.lazy Suspense boundaries.
 * Uses only inline styles — no external CSS dependencies.
 */
export function LoadingFallback() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100vh',
        backgroundColor: '#1a1a2e',
        color: '#e0e0e0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '1.125rem',
        flexDirection: 'column',
        gap: '1rem',
      }}
      role="status"
      aria-label="Loading"
    >
      <div
        style={{
          width: '2.5rem',
          height: '2.5rem',
          border: '3px solid rgba(255, 255, 255, 0.15)',
          borderTopColor: '#7c83ff',
          borderRadius: '50%',
          animation: 'lg-spin 0.8s linear infinite',
        }}
      />
      <span>Loading…</span>
      {/* Keyframes injected inline so no CSS file is needed */}
      <style>{`@keyframes lg-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
