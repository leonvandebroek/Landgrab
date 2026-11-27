import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameState, HexCell, Player } from '../../../types/game';
import { useGameplayStore } from '../../../stores/gameplayStore';
import { Button, Segmented, StatChip, Stepper } from '../../ui/kit';
import { getTileActionDisabledReasonText } from '../tileInteraction';
import type { TileAction, TileActionType } from '../tileInteraction';

interface Props {
  state: GameState;
  me: Player | null;
  currentHex: [number, number] | null;
  hasLocation: boolean;
  actions: TileAction[];
  onAction: (type: TileActionType) => void;
  onConfirmPickup: () => void;
  onConfirmReinforce: () => Promise<void>;
  onConfirmAttack: () => Promise<void>;
  onDismissSelection: () => void;
  onGiveTroops: () => void;
}

type OwnMode = 'pickup' | 'drop';

/** What you can do on the tile you stand on, in plain words, with one main button. */
export function TileDock({
  state,
  me,
  currentHex,
  hasLocation,
  actions,
  onAction,
  onConfirmPickup,
  onConfirmReinforce,
  onConfirmAttack,
  onDismissSelection,
  onGiveTroops,
}: Props) {
  const { t } = useTranslation();
  const selectedHexKey = useGameplayStore((store) => store.selectedHexKey);
  const combatPreview = useGameplayStore((store) => store.combatPreview);
  const combatResult = useGameplayStore((store) => store.combatResult);
  const [mode, setMode] = useState<OwnMode | null>(null);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const previewRequestRef = useRef<string | null>(null);

  const carried = me?.carriedTroops ?? 0;
  const currentKey = currentHex ? `${currentHex[0]},${currentHex[1]}` : null;
  const cell: HexCell | undefined = currentKey ? state.grid[currentKey] : undefined;
  const teamOf = (allianceId?: string | null) => state.alliances.find((alliance) => alliance.id === allianceId);
  const hasTeammates = Boolean(me?.allianceId && state.players.some((player) => player.id !== me.id && player.allianceId === me.allianceId));

  const attackAction = actions.find((action) => action.type === 'attack');
  const claimAction = actions.find((action) => action.type === 'claim' || action.type === 'claimAlliance' || action.type === 'claimSelf');
  const pickupAction = actions.find((action) => action.type === 'pickup');
  const dropAction = actions.find((action) => action.type === 'reinforce');

  // Fetch the odds as soon as you stand on an enemy tile you can attack.
  const previewKey = attackAction?.enabled && currentKey ? `${currentKey}:${carried}:${cell?.troops ?? 0}` : null;
  useEffect(() => {
    if (!previewKey || combatResult) return;
    if (previewRequestRef.current === previewKey) return;
    previewRequestRef.current = previewKey;
    onAction('attack');
  }, [combatResult, onAction, previewKey]);

  const ownModes: OwnMode[] = [];
  if (pickupAction) ownModes.push('pickup');
  if (dropAction) ownModes.push('drop');
  const activeMode: OwnMode | null = mode && ownModes.includes(mode) ? mode : (ownModes[0] ?? null);
  const modeMax = activeMode === 'pickup' ? (cell?.troops ?? 0) : carried;
  const safeCount = Math.max(1, Math.min(count, Math.max(1, modeMax)));

  const carryingChip = <StatChip value={carried} label={t('ui.play.carrying')} icon="shield" />;
  const giveTroops = carried > 0 && hasTeammates
    ? <Button variant="quiet" size="sm" icon="gift" onClick={onGiveTroops} testId="dock-give-troops">{t('ui.play.giveTroops')}</Button>
    : null;

  const run = async (work: () => void | Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  // ── A tile you tapped somewhere else on the map ──────────────────────────
  const selectedIsRemote = Boolean(selectedHexKey && selectedHexKey !== currentKey && state.grid[selectedHexKey]);
  if (selectedIsRemote && selectedHexKey) {
    const remote = state.grid[selectedHexKey];
    const remoteTeam = teamOf(remote.ownerAllianceId);
    const visible = remote.visibilityTier !== 'Hidden';
    const title = remote.isMasterTile
      ? t('ui.play.centreTile')
      : !remote.ownerId
        ? t('ui.play.freeTile')
        : remote.ownerId === me?.id
          ? t('ui.play.yourTile')
          : remoteTeam
            ? t('ui.play.teamTile', { team: remoteTeam.name })
            : t('ui.play.playerTile', { name: remote.ownerName ?? '?' });
    const troops = visible ? remote.troops : remote.lastKnownTroops;
    return (
      <DockShell
        title={title}
        swatch={remote.ownerColor ?? remoteTeam?.color}
        sub={troops != null && remote.ownerId ? t('ui.play.troopsHere', { count: troops }) : t('ui.play.walkThere')}
        side={carryingChip}
      >
        {remote.ownerId && <p className="lg-dock__reason">{t('ui.play.walkThere')}</p>}
        <Button variant="secondary" onClick={onDismissSelection} testId="dock-close-selection">{t('ui.play.backToMyTile')}</Button>
      </DockShell>
    );
  }

  if (!hasLocation) {
    return <DockShell title={t('ui.play.noLocation')} sub={t('ui.play.noLocationHelp')} side={carryingChip} />;
  }

  if (!currentHex || !cell) {
    return <DockShell title={t('ui.play.outside')} sub={t('ui.play.outsideHelp')} side={carryingChip} />;
  }

  if (cell.isMasterTile) {
    return <DockShell title={t('ui.play.centreTile')} sub={t('ui.play.centreTileHelp')} side={carryingChip}>{giveTroops}</DockShell>;
  }

  // ── Free tile ────────────────────────────────────────────────────────────
  if (claimAction) {
    const reason = !claimAction.enabled ? getTileActionDisabledReasonText(t, claimAction.disabledReason, claimAction.disabledReasonParams) : null;
    return (
      <DockShell title={t('ui.play.freeTile')} sub={t('ui.play.freeTileHelp')} side={carryingChip}>
        {reason && <p className="lg-dock__reason">{reason}</p>}
        <Button
          onClick={() => onAction(claimAction.type)}
          disabled={!claimAction.enabled}
          testId="dock-claim-btn"
        >
          {t('ui.play.claim')}
        </Button>
        {giveTroops}
      </DockShell>
    );
  }

  // ── Enemy tile ───────────────────────────────────────────────────────────
  if (attackAction) {
    const enemyTeam = teamOf(cell.ownerAllianceId);
    const fortBonus = state.dynamics?.playerRolesEnabled && cell.isFort ? 1 : 0;
    const defence = cell.troops + fortBonus;
    const preview = combatPreview && combatPreview.q === currentHex[0] && combatPreview.r === currentHex[1] ? combatPreview.preview : null;
    const odds = preview?.attackerWinProbability;
    const oddsText = odds == null
      ? (attackAction.enabled ? t('ui.play.oddsLoading') : t('ui.play.needMore', { count: defence + 1 }))
      : odds >= 0.7 ? t('ui.play.oddsGood') : odds >= 0.4 ? t('ui.play.oddsEven') : t('ui.play.oddsBad');
    return (
      <DockShell
        title={enemyTeam ? t('ui.play.teamTile', { team: enemyTeam.name }) : t('ui.play.playerTile', { name: cell.ownerName ?? '?' })}
        swatch={cell.ownerColor ?? enemyTeam?.color}
        sub={t('ui.play.enemyHelp')}
      >
        <div className="lg-versus" data-testid="dock-versus">
          <div className="lg-versus__side">
            <span className="lg-versus__label">{t('ui.play.youCarry')}</span>
            <span className="lg-versus__num">{carried}</span>
          </div>
          <span className="lg-versus__vs">{t('ui.play.vs')}</span>
          <div className="lg-versus__side">
            <span className="lg-versus__label">{fortBonus ? t('ui.play.defendersFort') : t('ui.play.defenders')}</span>
            <span className="lg-versus__num">{defence}</span>
          </div>
        </div>
        <p className="lg-dock__reason">{oddsText}</p>
        <Button
          icon="sword"
          disabled={!attackAction.enabled || !preview || busy}
          onClick={() => void run(onConfirmAttack)}
          testId="dock-attack-btn"
        >
          {attackAction.enabled ? t('ui.play.attackWith', { count: carried }) : t('ui.play.notEnough')}
        </Button>
      </DockShell>
    );
  }

  // ── Your tile or a team tile ─────────────────────────────────────────────
  const isMine = cell.ownerId === me?.id;
  const team = teamOf(cell.ownerAllianceId);
  const title = isMine ? t('ui.play.yourTile') : t('ui.play.teamTileOf', { name: cell.ownerName ?? team?.name ?? '?' });
  const sub = cell.troops > 0 ? t('ui.play.guarding', { count: cell.troops }) : t('ui.play.noTroopsHere');

  if (!activeMode) {
    return (
      <DockShell title={title} swatch={cell.ownerColor ?? team?.color} sub={sub} side={carryingChip}>
        <p className="lg-dock__reason">{t('ui.play.nothingToDo')}</p>
        {giveTroops}
      </DockShell>
    );
  }

  const remaining = activeMode === 'pickup' ? (cell.troops - safeCount) : (carried - safeCount);
  const confirm = () => {
    const [q, r] = currentHex;
    const store = useGameplayStore.getState();
    if (activeMode === 'pickup') {
      store.setReinforcePrompt(null);
      store.setPickupPrompt({ q, r, max: cell.troops });
      store.setPickupCount(safeCount);
      onConfirmPickup();
      return undefined;
    }
    store.setPickupPrompt(null);
    store.setReinforcePrompt({ q, r, max: carried });
    store.setReinforceCount(safeCount);
    return onConfirmReinforce();
  };

  return (
    <DockShell title={title} swatch={cell.ownerColor ?? team?.color} sub={sub} side={carryingChip}>
      {ownModes.length > 1 && (
        <Segmented<OwnMode>
          value={activeMode}
          onChange={(next) => { setMode(next); setCount(1); }}
          label={title}
          options={[
            { value: 'pickup', label: t('ui.play.pickUp') },
            { value: 'drop', label: t('ui.play.dropOff') },
          ]}
        />
      )}
      <Stepper
        value={safeCount}
        min={1}
        max={Math.max(1, modeMax)}
        onChange={setCount}
        decreaseLabel={t('ui.play.fewer')}
        increaseLabel={t('ui.play.more')}
        caption={activeMode === 'pickup' ? t('ui.play.stayOnTile', { count: remaining }) : t('ui.play.stillCarried', { count: remaining })}
        testId={activeMode === 'pickup' ? 'dock-pickup-stepper' : 'dock-drop-stepper'}
      />
      <Button
        onClick={() => void run(confirm)}
        disabled={busy}
        testId={activeMode === 'pickup' ? 'dock-pickup-btn' : 'dock-drop-btn'}
      >
        {activeMode === 'pickup' ? t('ui.play.pickUpCount', { count: safeCount }) : t('ui.play.dropOffCount', { count: safeCount })}
      </Button>
      {giveTroops}
    </DockShell>
  );
}

function DockShell({ title, sub, side, swatch, children }: {
  title: string;
  sub?: string;
  side?: React.ReactNode;
  swatch?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="lg-dock" data-testid="play-dock">
      <span className="lg-dock__handle" aria-hidden="true" />
      <div className="lg-dock__head">
        <div className="lg-dock__copy">
          <h2 className="lg-dock__title">
            {swatch && <span className="lg-dock__swatch" style={{ background: swatch }} aria-hidden="true" />}
            {title}
          </h2>
          {sub && <span className="lg-dock__sub">{sub}</span>}
        </div>
        {side}
      </div>
      {children}
    </div>
  );
}
