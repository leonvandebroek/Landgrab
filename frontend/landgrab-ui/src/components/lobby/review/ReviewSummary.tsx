import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState } from '../../../types/game';

interface Props {
    gameState: GameState;
    /** Pre-formatted tile-size string (e.g. "50 m") — kept for back-compat with ReviewStep. */
    tileSizeText: string;
}

export function ReviewSummary({ gameState, tileSizeText: _tileSizeText }: Props) {
    const { t } = useTranslation();

    const rulesText = [
        t(`claimMode.${gameState.claimMode}.title`),
        t(`winCondition.${gameState.winConditionType}`),
    ].join(' · ');

    return (
        <div className="wizard-review-grid">
            <ReviewItem label={t('wizard.reviewLocation')}>
                {gameState.mapLat != null && gameState.mapLng != null
                    ? `${gameState.mapLat.toFixed(5)}, ${gameState.mapLng.toFixed(5)}`
                    : '—'}
            </ReviewItem>
            <ReviewItem label={t('wizard.reviewPlayers')}>
                {gameState.players.map(player => player.name).join(', ')}
            </ReviewItem>
            <ReviewItem label={t('wizard.reviewAlliances')}>
                {gameState.alliances.map(alliance => alliance.name).join(', ') || '—'}
            </ReviewItem>
            <ReviewItem label={t('wizard.rulesTileSizeLabel')}>
                {t('wizard.tileSizeDesc', { size: gameState.tileSizeMeters })}
                <div className="wizard-review-helper-list">
                    <span className="wizard-review-helper">{t('wizard.tileSizeSmall')}</span>
                    <span className="wizard-review-helper">{t('wizard.tileSizeLarge')}</span>
                </div>
            </ReviewItem>
            <ReviewItem label={t('wizard.reviewRules')}>
                {rulesText}
            </ReviewItem>
        </div>
    );
}

interface ReviewItemProps {
    label: string;
    children: ReactNode;
}

function ReviewItem({ label, children }: ReviewItemProps) {
    return (
        <div className="wizard-review-item">
            <span className="wizard-review-label">{label}</span>
            <span className="wizard-review-value">{children}</span>
        </div>
    );
}
