import type { CSSProperties } from 'react';
import type { GameToast } from '../../hooks/useToastQueue';

const DEFAULT_ICONS: Record<GameToast['type'], string> = {
  achievement: '🏆',
  combat: '⚔️',
  event: '🎲',
  mission: '📋',
  territory: '🚩',
};

const MAX_VISIBLE = 3;

interface Props {
  toasts: GameToast[];
  onDismiss: (id: string) => void;
}

/**
 * Renders a stack of game toast notifications.
 * Each toast shows an icon (type-default or custom) and message,
 * and can be dismissed by clicking.
 */
export function ToastManager({ toasts, onDismiss }: Props) {
  const visible = toasts.slice(0, MAX_VISIBLE);

  return (
    <div className="toast-stack">
      {visible.map((toast) => {
        const icon = toast.icon ?? DEFAULT_ICONS[toast.type];
        const style: CSSProperties = {
          '--toast-team-color': toast.teamColor ?? 'var(--accent)',
        } as CSSProperties;

        return (
          <div
            key={toast.id}
            className={`game-toast game-toast-${toast.type}`}
            style={style}
            onClick={() => onDismiss(toast.id)}
          >
            {icon && <span className="toast-icon">{icon}</span>}
            <span className="toast-message">{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
