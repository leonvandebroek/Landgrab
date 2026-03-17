import { useEffect, useState } from 'react';

interface Props {
    message: string;
    durationMs?: number;
}

export function WizardToast({ message, durationMs = 2500 }: Props) {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            setVisible(false);
        }, durationMs);

        return () => {
            window.clearTimeout(timer);
        };
    }, [durationMs, message]);

    if (!visible) {
        return null;
    }

    return (
        <div
            aria-live="polite"
            role="status"
            style={{
                position: 'fixed',
                top: '1rem',
                right: '1rem',
                zIndex: 1000,
                maxWidth: 'min(400px, calc(100vw - 2rem))',
                padding: '0.875rem 1rem',
                borderRadius: '10px',
                background: 'rgba(20, 24, 35, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                boxShadow: '0 16px 32px rgba(0, 0, 0, 0.35)',
                color: '#fff',
                pointerEvents: 'none',
            }}
        >
            {message}
        </div>
    );
}
