import { gameIcons, type GameIconName } from '../../utils/gameIcons';

interface GameIconProps {
    name: GameIconName;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export function GameIcon({ name, size, className }: GameIconProps) {
    const svg = gameIcons[name];
    if (!svg) return null;

    const sizeClass = size ? ` game-icon--${size}` : '';
    const extraClass = className ? ` ${className}` : '';

    return (
        <span
            className={`game-icon${sizeClass}${extraClass}`}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}