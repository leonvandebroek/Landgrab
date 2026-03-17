import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CombatBonusDetail, CombatResult } from '../../types/game';
import styles from './CombatUI.module.css';

interface CombatResultModalProps {
    result: CombatResult;
    onDeployTroops: (count: number) => void;
    onClose: () => void;
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

export function CombatResultModal({ result, onDeployTroops, onClose }: CombatResultModalProps) {
    const { t } = useTranslation();
    const [deployCount, setDeployCount] = useState(() => result.attackerTroopsRemaining);

    const won = result.attackerWon;

    return (
        <div className={styles.overlay} role="presentation">
            <div aria-modal="true" aria-labelledby="combat-result-title" className={styles.modal} role="dialog">
                <div className={styles.content}>
                    <div className={styles.badgeRow}>
                        <span className={styles.modeBadge}>{t(`combat.modes.${result.combatModeUsed}` as never, { defaultValue: result.combatModeUsed })}</span>
                        <span className={styles.subtleText}>{t('combat.resultBadge')}</span>
                    </div>

                    <div className={styles.header}>
                        <h2
                            className={`${styles.title} ${won ? styles.titleVictory : styles.titleDefeat}`}
                            id="combat-result-title"
                        >
                            {won ? t('combat.victoryTitle') : t('combat.defeatTitle')}
                        </h2>
                        <p className={styles.subtitle}>
                            {won
                                ? t('combat.victorySubtitle', { q: result.q, r: result.r })
                                : t('combat.defeatSubtitle', { q: result.q, r: result.r })}
                        </p>
                    </div>

                    <section className={styles.recapCard}>
                        <div className={styles.summaryRow}>
                            <span>{t('combat.winProbability')}</span>
                            <span className={styles.recapValueStrong}>{formatProbability(result.attackerWinProbability)}</span>
                        </div>
                        <div className={styles.barTrack}>
                            <div className={styles.barFill} style={{ width: getProbabilityWidth(result.attackerWinProbability) }} />
                        </div>

                        <div className={styles.recapGrid}>
                            <div className={styles.recapRow}>
                                <span>{t('combat.effectiveAttack')}</span>
                                <span className={styles.recapValueStrong}>{result.effectiveAttack}</span>
                            </div>
                            <div className={styles.recapRow}>
                                <span>{t('combat.effectiveDefence')}</span>
                                <span className={styles.recapValueStrong}>{result.effectiveDefence}</span>
                            </div>
                            <div className={styles.recapRow}>
                                <span>{t('combat.attackerLosses')}</span>
                                <span>{result.attackerTroopsLost}</span>
                            </div>
                            <div className={styles.recapRow}>
                                <span>{t('combat.defenderLosses')}</span>
                                <span>{result.defenderTroopsLost}</span>
                            </div>
                            <div className={styles.recapRow}>
                                <span>{t('combat.attackerRemaining')}</span>
                                <span>{result.attackerTroopsRemaining}</span>
                            </div>
                            <div className={styles.recapRow}>
                                <span>{t('combat.defenderRemaining')}</span>
                                <span>{result.defenderTroopsRemaining}</span>
                            </div>
                        </div>
                    </section>

                    <div className={styles.versus}>
                        <section className={styles.combatant}>
                            <div className={styles.combatantHeader}>
                                <span className={styles.combatantLabel}>{t('combat.attackerSide')}</span>
                                <p className={styles.combatantName}>{t('combat.you')}</p>
                            </div>
                            <BonusList bonuses={result.attackerBonuses} />
                        </section>

                        <div aria-hidden="true" className={styles.vsDivider}>VS</div>

                        <section className={styles.combatant}>
                            <div className={styles.combatantHeader}>
                                <span className={styles.combatantLabel}>{t('combat.defenderSide')}</span>
                                <p className={styles.combatantName}>{result.previousOwnerName ?? t('combat.enemy')}</p>
                            </div>
                            <BonusList bonuses={result.defenderBonuses} />
                        </section>
                    </div>

                    {won ? (
                        <>
                            <section className={styles.sliderCard}>
                                <div className={styles.sliderHeader}>
                                    <span>{t('combat.deployPrompt')}</span>
                                    <span className={styles.deploymentValue}>{deployCount}</span>
                                </div>
                                <input
                                    aria-label={t('combat.deployPrompt')}
                                    className={styles.slider}
                                    max={result.attackerTroopsRemaining}
                                    min={0}
                                    onChange={(event) => setDeployCount(Number(event.target.value))}
                                    type="range"
                                    value={deployCount}
                                />
                                <div className={styles.summaryRow}>
                                    <span className={styles.subtleText}>{t('combat.leaveCarried')}</span>
                                    <span className={styles.subtleText}>{result.attackerTroopsRemaining - deployCount} {t('combat.stillCarried')}</span>
                                </div>
                            </section>

                            <div className={styles.actions}>
                                <button
                                    className={`${styles.button} ${styles.primarySuccessButton}`}
                                    onClick={() => onDeployTroops(deployCount)}
                                    type="button"
                                >
                                    {t('combat.deployAndContinue')}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className={styles.actions}>
                            <button className={`${styles.button} ${styles.secondaryButton}`} onClick={onClose} type="button">
                                {t('combat.close')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export type { CombatResultModalProps };