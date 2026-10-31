import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { NeutralClaimResult } from '../../types/game';
import styles from './CombatUI.module.css';

interface TroopDeployModalProps {
    claimResult: NeutralClaimResult;
    onDeploy: (troopCount: number) => void;
    onClose: () => void;
}

export function TroopDeployModal({ claimResult, onDeploy, onClose }: TroopDeployModalProps) {
    const { t } = useTranslation();
    const [deployCount, setDeployCount] = useState(Math.min(1, claimResult.carriedTroops));

    return (
        <div className={styles.overlay} onClick={onClose} role="presentation">
            <div
                aria-labelledby="neutral-claim-title"
                aria-modal="true"
                className={styles.modal}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
            >
                <div className={styles.content}>
                    <div className={styles.badgeRow}>
                        <span className={styles.modeBadgeInverted}>{t('neutralClaim.title')}</span>
                    </div>

                    <div className={styles.header}>
                        <h2 className={`${styles.title} ${styles.titleVictory}`} id="neutral-claim-title">
                            {t('neutralClaim.title')}
                        </h2>
                        <p className={styles.subtitle}>{t('neutralClaim.subtitle')}</p>
                    </div>

                    <section className={styles.sliderCard}>
                        <div className={styles.recapGrid}>
                            <div className={`${styles.recapRow} ${styles.recapRowDivider}`}>
                                <span className={styles.metricLabel}>{t('neutralClaim.troopsOnHex' as never, { defaultValue: 'REMAINING' })}</span>
                                <span className={styles.statValuePrimary}>{claimResult.troopsOnHex}</span>
                            </div>
                            <div className={styles.recapRow}>
                                <span className={styles.metricLabel}>{t('neutralClaim.carriedTroops' as never, { defaultValue: 'CARRIED' })}</span>
                                <span className={styles.statValueCasualty}>{claimResult.carriedTroops}</span>
                            </div>
                        </div>

                        <div className={styles.sliderHeader}>
                            <span>{t('neutralClaim.deploy')}</span>
                            <span className={styles.deploymentValue}>{deployCount}</span>
                        </div>
                        <input
                            aria-label={t('neutralClaim.deploy')}
                            className={styles.deploySlider}
                            max={claimResult.carriedTroops}
                            min={0}
                            onChange={(event) => setDeployCount(Number(event.target.value))}
                            type="range"
                            value={deployCount}
                        />
                        <div className={styles.summaryRow}>
                            <span className={styles.sliderHint}>{t('neutralClaim.keepCarrying')}</span>
                            <span className={styles.sliderHint}>{claimResult.carriedTroops - deployCount}</span>
                        </div>
                    </section>


                </div>

                <div className={styles.footer}>
                    <div className={styles.actions}>
                        <button
                            className={`${styles.button} ${styles.primaryClaimButton}`}
                            onClick={() => onDeploy(deployCount)}
                            type="button"
                        >
                            {t('neutralClaim.deployAndContinue')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export type { TroopDeployModalProps };