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
                        <span className={styles.modeBadge}>{t('neutralClaim.title')}</span>
                    </div>

                    <div className={styles.header}>
                        <h2 className={`${styles.title} ${styles.titleVictory}`} id="neutral-claim-title">
                            {t('neutralClaim.title')}
                        </h2>
                        <p className={styles.subtitle}>{t('neutralClaim.subtitle')}</p>
                    </div>

                    <section className={styles.sliderCard}>
                        <p className={styles.subtleText}>
                            {t('neutralClaim.carriedSummary', {
                                carriedTroops: claimResult.carriedTroops,
                                troopsOnHex: claimResult.troopsOnHex,
                            })}
                        </p>

                        <div className={styles.sliderHeader}>
                            <span>{t('neutralClaim.deploy')}</span>
                            <span className={styles.probabilityValue}>{deployCount}</span>
                        </div>
                        <input
                            aria-label={t('neutralClaim.deploy')}
                            className={styles.slider}
                            max={claimResult.carriedTroops}
                            min={0}
                            onChange={(event) => setDeployCount(Number(event.target.value))}
                            type="range"
                            value={deployCount}
                        />
                        <div className={styles.summaryRow}>
                            <span className={styles.subtleText}>{t('neutralClaim.keepCarrying')}</span>
                            <span className={styles.subtleText}>{claimResult.carriedTroops - deployCount}</span>
                        </div>
                    </section>

                    <div className={styles.actions}>
                        <button
                            className={`${styles.button} ${styles.primarySuccessButton}`}
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