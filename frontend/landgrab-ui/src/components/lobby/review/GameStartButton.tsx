import { useTranslation } from 'react-i18next';

interface Props {
    canStart: boolean;
    onStartGame: () => void;
}

export function GameStartButton({ canStart, onStartGame }: Props) {
    const { t } = useTranslation();

    return (
        <button
            type="button"
            className="btn-primary big wizard-start-button"
            data-testid="wizard-start-game-btn"
            onClick={onStartGame}
            disabled={!canStart}
        >
            {t('wizard.reviewStartGame')}
        </button>
    );
}
