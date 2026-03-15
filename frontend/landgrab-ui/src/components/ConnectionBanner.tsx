interface ConnectionBannerProps {
  message: string;
}

export function ConnectionBanner({ message }: ConnectionBannerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="connection-banner"
    >
      {message}
    </div>
  );
}
