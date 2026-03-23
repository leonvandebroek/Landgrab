import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import { AbilityCard } from '../AbilityCard';
import { useGameStore } from '../../../stores/gameStore';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { useSecondTick } from '../../../hooks/useSecondTick';

interface ShareIntelCardProps {
  myUserId: string;
  onShareBeaconIntel: () => Promise<number>;
}

function getCooldownRemaining(cooldownUntil: string | undefined): number {
  if (!cooldownUntil) return 0;
  return Math.max(0, Math.ceil((new Date(cooldownUntil).getTime() - Date.now()) / 1000));
}

export function ShareIntelCard({ myUserId, onShareBeaconIntel }: ShareIntelCardProps) {
  const { t } = useTranslation();
  const player = useGameStore((store) =>
    store.gameState?.players.find((candidate) => candidate.id === myUserId) ?? null,
  );
  const exitAbilityMode = useGameplayStore((store) => store.exitAbilityMode);

  const [isSharing, setIsSharing] = useState(false);
  const [shareCount, setShareCount] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useSecondTick(() => {
    if (player?.shareIntelCooldownUntil) {
      setTick((n) => n + 1);
    }
  });

  const cooldownRemaining = getCooldownRemaining(player?.shareIntelCooldownUntil);
  const isOnCooldown = cooldownRemaining > 0;

  const handleShareIntel = async () => {
    setIsSharing(true);
    const count = await onShareBeaconIntel();
    setShareCount(count);
    setIsSharing(false);
    setTimeout(() => setShareCount(null), 3000);
  };

  const ctaDisabled = isSharing || isOnCooldown;

  return (
    <AbilityCard
      title={t('abilities.shareIntel.title' as never)}
      icon={<GameIcon name="radioTower" size="sm" />}
      statusContent={(
        <div className={`ability-card__status-pill ability-card__status-pill--live`}>
          <GameIcon name="radioTower" size="sm" />
          <span>{t('abilities.shareIntel.description' as never)}</span>
        </div>
      )}
      footerContent={(
        <button
          type="button"
          className="ability-card__primary-btn"
          disabled={ctaDisabled}
          onClick={() => { void handleShareIntel(); }}
        >
          {isOnCooldown
            ? t('abilities.shareIntel.cooldown' as never, { seconds: cooldownRemaining })
            : t('abilities.shareIntel.cta' as never)}
        </button>
      )}
      onBackToHud={exitAbilityMode}
    >
      <div className="ability-card__stack">
        <div className="ability-card__copy">
          <ul className="ability-card__detail-list">
            <li>{t('abilities.beacon.effect' as never)}</li>
            <li>{t('abilities.beacon.rangeInfo' as never)}</li>
            <li>{t('abilities.beacon.sectorExplanation' as never)}</li>
          </ul>
        </div>
        {shareCount !== null && (
          <p className="ability-card__feedback">
            {shareCount > 0
              ? t('abilities.shareIntel.shared' as never, { count: shareCount })
              : t('abilities.beacon.shareIntelNone' as never)}
          </p>
        )}
      </div>
    </AbilityCard>
  );
}
