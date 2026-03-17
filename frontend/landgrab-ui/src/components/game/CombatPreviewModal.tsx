import { useTranslation } from 'react-i18next';
import type { CombatBonusDetail, CombatPreviewDto } from '../../types/game';
import styles from './CombatUI.module.css';

interface CombatPreviewModalProps {
    preview: CombatPreviewDto;
    onAttack: () => void;
    onRetreat: () => void;
}

function formatProbability(value: number): string {
    return `${Math.round(value * 100)}%`;
}

function getProbabilityWidth(value: number): string {
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function BonusList({ bonuses }: { bonuses: CombatBonusDetail[] }) {
    const { t } = useTranslation();

    if (bonuses.length === 0) {
        return <div className={styles.emptyBonus}>{t('combat.noBonuses')}</div>;
    }

    return (
        <div className={styles.bonusList}>
            {bonuses.map((bonus) => (
                <div className={styles.bonusRow} key={`${bonus.source}-${bonus.value}`}>
                    <span>{t(`combat.bonusSources.${bonus.source}` as never, { defaultValue: bonus.source })}</span>
                    <span className={styles.bonusValue}>+{bonus.value}</span>
                </div>
            ))}
        </div>
    );
}

export function CombatPreviewModal({ preview, onAttack, onRetreat }: CombatPreviewModalProps) {
    const { t } = useTranslation();

    return (
        <div className={styles.overlay} onClick={onRetreat} role="presentation">
            <div
                aria-modal="true"
                aria-labelledby="combat-preview-title"
                className={styles.modal}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
            >
                <div className={styles.content}>
                    <div className={styles.badgeRow}>
                        <span className={styles.modeBadge}>{t(`combat.modes.${preview.combatMode}` as never, { defaultValue: preview.combatMode })}</span>
                        <span className={styles.subtleText}>{t('combat.previewBadge')}</span>
                    </div>

                    <div className={styles.header}>
                        <h2 className={styles.title} id="combat-preview-title">{t('combat.previewTitle')}</h2>
                        <p className={styles.subtitle}>{t('combat.previewSubtitle')}</p>
                    </div>

                    <div className={styles.versus}>
                        <section className={styles.combatant}>
                            <div className={styles.combatantHeader}>
                                <span className={styles.combatantLabel}>{t('combat.attackerSide')}</span>
                                <p className={styles.combatantName}>{t('combat.you')}</p>
                            </div>
                            <div>
                                <div className={styles.troopCount}>{preview.attackerTroops}</div>
                                <div className={styles.metricLabel}>{t('combat.troopsCommitted')}</div>
                            </div>
                            <div>
                                <div className={styles.metricValue}>{preview.effectiveAttack}</div>
                                <div className={styles.metricLabel}>{t('combat.effectiveAttack')}</div>
                            </div>
                            <BonusList bonuses={preview.attackerBonuses} />
                        </section>

                        <div aria-hidden="true" className={styles.vsDivider}>VS</div>

                        <section className={styles.combatant}>
                            <div className={styles.combatantHeader}>
                                <span className={styles.combatantLabel}>{t('combat.defenderSide')}</span>
                                <p className={styles.combatantName}>{preview.defenderName}</p>
                                {preview.defenderAllianceName ? (
                                    <span className={styles.combatantMeta}>{preview.defenderAllianceName}</span>
                                ) : null}
                            </div>
                            <div>
                                <div className={styles.troopCount}>{preview.defenderTroops}</div>
                                <div className={styles.metricLabel}>{t('combat.troopsDefending')}</div>
                            </div>
                            <div>
                                <div className={styles.metricValue}>{preview.effectiveDefence}</div>
                                <div className={styles.metricLabel}>{t('combat.effectiveDefence')}</div>
                            </div>
                            <BonusList bonuses={preview.defenderBonuses} />
                        </section>
                    </div>

                    <section className={styles.probabilityCard}>
                        <div className={styles.probabilityRow}>
                            <span>{t('combat.winProbability')}</span>
                            <span className={styles.probabilityValue}>{formatProbability(preview.attackerWinProbability)}</span>
                        </div>
                        <div className={styles.barTrack}>
                            <div className={styles.barFill} style={{ width: getProbabilityWidth(preview.attackerWinProbability) }} />
                        </div>
                    </section>

                    <div className={styles.actions}>
                        <button className={`${styles.button} ${styles.primaryButton}`} onClick={onAttack} type="button">
                            {t('combat.attackNow')}
                        </button>
                        <button className={`${styles.button} ${styles.secondaryButton}`} onClick={onRetreat} type="button">
                            {t('combat.retreat')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export type { CombatPreviewModalProps };