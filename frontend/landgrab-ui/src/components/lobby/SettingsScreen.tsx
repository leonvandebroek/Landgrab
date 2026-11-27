import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClaimMode, GameAreaPattern, GameDynamics, GameState, HexCoordinate, WinConditionType } from '../../types/game';
import { GameMap } from '../map/GameMap';
import { Icon } from '../ui/Icon';
import { Button, Screen, Sheet, SheetHeader, SwitchRow, TopBar, cx } from '../ui/kit';
import { DynamicsStep } from './DynamicsStep';
import { getAreaFootprintMetrics, getMaxTileSizeForArea } from './gameAreaShapes';
import { LocationStep } from './LocationStep';
import { ReviewStep } from './ReviewStep';
import { RolesStep } from './RolesStep';
import { RulesStep } from './RulesStep';

interface LocationPoint {
  lat: number;
  lng: number;
}

export type GamePreset = 'classic' | 'roles' | 'fullWar';

const PRESETS: Record<GamePreset, Pick<GameDynamics, 'playerRolesEnabled' | 'hqEnabled' | 'beaconEnabled' | 'tileDecayEnabled'>> = {
  classic: { playerRolesEnabled: false, hqEnabled: false, beaconEnabled: false, tileDecayEnabled: false },
  roles: { playerRolesEnabled: true, hqEnabled: false, beaconEnabled: false, tileDecayEnabled: false },
  fullWar: { playerRolesEnabled: true, hqEnabled: true, beaconEnabled: true, tileDecayEnabled: true },
};

// eslint-disable-next-line react-refresh/only-export-components
export function detectPreset(dynamics: GameDynamics): GamePreset | null {
  const match = (Object.keys(PRESETS) as GamePreset[]).find((key) => {
    const preset = PRESETS[key];
    return preset.playerRolesEnabled === Boolean(dynamics.playerRolesEnabled)
      && preset.hqEnabled === Boolean(dynamics.hqEnabled)
      && preset.beaconEnabled === Boolean(dynamics.beaconEnabled)
      && preset.tileDecayEnabled === Boolean(dynamics.tileDecayEnabled);
  });
  return match ?? null;
}

interface Props {
  gameState: GameState;
  myUserId: string;
  authToken: string;
  currentLocation: LocationPoint | null;
  locationError: string | null;
  locationLoading: boolean;
  error: string;
  onBack: () => void;
  onSetMapLocation: (lat: number, lng: number) => void;
  onSetTileSize: (meters: number) => void;
  onUseCenteredGameArea: () => void;
  onSetPatternGameArea: (pattern: GameAreaPattern) => void;
  onSetCustomGameArea: (coordinates: HexCoordinate[]) => void;
  onSetClaimMode: (mode: ClaimMode) => void;
  onSetWinCondition: (type: WinConditionType, value: number) => void;
  onSetBeaconEnabled: (enabled: boolean) => void;
  onSetTileDecayEnabled: (enabled: boolean) => void;
  onSetEnemySightingMemory: (seconds: number) => void;
  onSetGameDynamics: (dynamics: GameDynamics) => void;
  onAssignPlayerRole: (targetPlayerId: string, role: string) => void;
  onRandomizeRoles: () => void;
  onSetMasterTileByHex: (q: number, r: number) => void;
  onAssignStartingTile: (q: number, r: number, playerId: string) => void;
  onSetAllianceHQ?: (q: number, r: number, allianceId: string) => void;
  onSetObserverMode?: (enabled: boolean) => void;
  onStartGame: () => void;
  invoke?: (method: string, ...args: unknown[]) => Promise<unknown>;
}

/** Game settings: screen 2 of 2 for the host. Replaces wizard steps 3, 4 and 5. */
export function SettingsScreen(props: Props) {
  const {
    gameState,
    myUserId,
    authToken,
    currentLocation,
    locationError,
    locationLoading,
    error,
    onBack,
    onSetMapLocation,
    onSetTileSize,
    onSetGameDynamics,
    onStartGame,
    onSetObserverMode,
    invoke,
  } = props;
  const { t } = useTranslation();
  const [fineTuneOpen, setFineTuneOpen] = useState(false);
  const [areaSheetOpen, setAreaSheetOpen] = useState(false);
  const fineTuneRef = useRef<HTMLDivElement>(null);
  const autoLocated = useRef(false);

  const hasLocation = gameState.hasMapLocation && gameState.mapLat != null && gameState.mapLng != null;

  // The play area starts around where the host stands.
  useEffect(() => {
    if (hasLocation || autoLocated.current || !currentLocation) return;
    autoLocated.current = true;
    onSetMapLocation(currentLocation.lat, currentLocation.lng);
  }, [currentLocation, hasLocation, onSetMapLocation]);

  const cells = useMemo(() => Object.values(gameState.grid).map((cell) => ({ q: cell.q, r: cell.r })), [gameState.grid]);
  const metrics = useMemo(() => getAreaFootprintMetrics(cells, gameState.tileSizeMeters), [cells, gameState.tileSizeMeters]);
  const maxTileSize = getMaxTileSizeForArea(cells, gameState.maxFootprintMetersOverride);
  const preset = detectPreset(gameState.dynamics);
  const teamsInUse = gameState.alliances.filter((alliance) => alliance.memberIds.length > 0).length;

  const winText = gameState.winConditionType === 'TimedGame'
    ? t('ui.settings.winTimed', { minutes: gameState.gameDurationMinutes ?? gameState.winConditionValue })
    : gameState.winConditionType === 'Elimination'
      ? t('ui.settings.winElimination')
      : t('ui.settings.winTerritory', { percent: gameState.winConditionValue });

  const startBlocker = !hasLocation
    ? t('ui.settings.blockLocation')
    : gameState.players.length < 2
      ? t('ui.room.needTwoPlayers')
      : gameState.players.some((player) => !player.allianceId)
        ? t('ui.room.needTeams', { count: gameState.players.filter((player) => !player.allianceId).length })
        : null;

  const applyPreset = (next: GamePreset) => {
    onSetGameDynamics({
      ...gameState.dynamics,
      ...PRESETS[next],
      ...(PRESETS[next].hqEnabled ? { hqAutoAssign: true } : {}),
    });
  };

  const openFineTune = () => {
    setFineTuneOpen(true);
    window.setTimeout(() => fineTuneRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const footer = (
    <>
      <p className="lg-small lg-center" data-testid="settings-summary">
        {startBlocker ?? t('ui.settings.summary', {
          players: gameState.players.length,
          teams: teamsInUse,
          preset: preset ? t(`ui.settings.preset.${preset}.title`) : t('ui.settings.custom'),
        })}
      </p>
      <Button onClick={onStartGame} disabled={startBlocker !== null} testId="wizard-start-btn">{t('ui.settings.start')}</Button>
    </>
  );

  return (
    <Screen footer={footer} testId="setup-wizard">
      <TopBar
        title={t('ui.settings.title')}
        onBack={onBack}
        backLabel={t('ui.settings.backToRoom')}
        right={t('ui.room.stepOf', { current: 2, total: 2 })}
      />

      <section className="lg-card" aria-labelledby="play-area-title">
        <h2 className="lg-h2" id="play-area-title">{t('ui.settings.playArea')}</h2>
        {hasLocation ? (
          <>
            <div className="lg-areapreview">
              <GameMap
                state={gameState}
                myUserId={myUserId}
                currentLocation={currentLocation}
                constrainViewportToGrid
                controlsVariant="none"
              />
            </div>
            <p className="lg-muted" data-testid="settings-area-text">
              {t('ui.settings.areaText', {
                count: cells.length,
                size: gameState.tileSizeMeters,
                across: formatDistance(Math.round(metrics.maxDimensionMeters)),
              })}
            </p>
            <div className="lg-actions lg-actions--row">
              <Button
                variant="secondary"
                size="md"
                icon="locate"
                disabled={!currentLocation}
                onClick={() => currentLocation && onSetMapLocation(currentLocation.lat, currentLocation.lng)}
              >
                {t('ui.settings.moveHere')}
              </Button>
              <Button variant="secondary" size="md" icon="map" onClick={() => setAreaSheetOpen(true)}>
                {t('ui.settings.sizeShape')}
              </Button>
            </div>
          </>
        ) : locationError ? (
          <div className="lg-legacy">
            <LocationStep
              currentLocation={currentLocation}
              locationLoading={locationLoading}
              locationError={locationError}
              mapLat={gameState.mapLat}
              mapLng={gameState.mapLng}
              onSetMapLocation={onSetMapLocation}
            />
          </div>
        ) : (
          <div className="lg-stack">
            <p className="lg-muted">{locationLoading ? t('ui.settings.locating') : t('ui.settings.needLocation')}</p>
            <Button
              variant="secondary"
              size="md"
              icon="locate"
              disabled={!currentLocation}
              onClick={() => currentLocation && onSetMapLocation(currentLocation.lat, currentLocation.lng)}
            >
              {t('ui.settings.useMyLocation')}
            </Button>
          </div>
        )}
      </section>

      <section className="lg-stack" aria-labelledby="kind-title">
        <h2 className="lg-h2" id="kind-title">{t('ui.settings.kind')}</h2>
        {(Object.keys(PRESETS) as GamePreset[]).map((key) => (
          <button
            key={key}
            type="button"
            className={cx('lg-option', preset === key && 'is-selected')}
            aria-pressed={preset === key}
            onClick={() => applyPreset(key)}
            data-testid={`settings-preset-${key}`}
          >
            <span className="lg-option__radio" aria-hidden="true" />
            <span className="lg-option__copy">
              <span className="lg-option__title">{t(`ui.settings.preset.${key}.title`)}</span>
              <span className="lg-option__desc">{t(`ui.settings.preset.${key}.desc`)}</span>
            </span>
          </button>
        ))}
      </section>

      <button type="button" className="lg-listrow" onClick={openFineTune}>
        <Icon name="trophy" />
        <span className="lg-listrow__copy">
          <span className="lg-listrow__sub">{t('ui.settings.howToWin')}</span>
          <span className="lg-listrow__title">{winText}</span>
        </span>
        <Icon name="chevronRight" size={20} className="lg-listrow__chev" />
      </button>

      <div ref={fineTuneRef} className={cx('lg-disclosure', fineTuneOpen && 'is-open')}>
        <button
          type="button"
          className="lg-disclosure__btn"
          aria-expanded={fineTuneOpen}
          onClick={() => setFineTuneOpen((open) => !open)}
          data-testid="settings-fine-tune-toggle"
        >
          <Icon name="wrench" />
          <span className="lg-listrow__copy">
            <span className="lg-listrow__title">{t('ui.settings.fineTune')}</span>
            <span className="lg-listrow__sub">
              {preset ? t('ui.settings.using', { preset: t(`ui.settings.preset.${preset}.title`) }) : t('ui.settings.customRules')}
            </span>
          </span>
          <Icon name="chevronDown" size={20} className="lg-disclosure__chev" />
        </button>
        {fineTuneOpen && (
          <div className="lg-disclosure__body lg-legacy">
            <RulesStep
              gameState={gameState}
              isHost
              onSetTileSize={onSetTileSize}
              onSetClaimMode={props.onSetClaimMode}
              onSetWinCondition={props.onSetWinCondition}
              invoke={invoke}
            />
            <DynamicsStep
              gameState={gameState}
              isHost
              onSetBeaconEnabled={props.onSetBeaconEnabled}
              onSetTileDecayEnabled={props.onSetTileDecayEnabled}
              onSetEnemySightingMemory={props.onSetEnemySightingMemory}
              onSetGameDynamics={onSetGameDynamics}
            />
            {gameState.dynamics.playerRolesEnabled && (
              <div className="wizard-rule-card">
                <h3>{t('ui.settings.rolesTitle')}</h3>
                <p>{t('ui.settings.rolesHelp')}</p>
                <RolesStep
                  gameState={gameState}
                  myUserId={myUserId}
                  isHost
                  enableAssignedRoleModal={false}
                  onAssignPlayerRole={props.onAssignPlayerRole}
                  onRandomizeRoles={props.onRandomizeRoles}
                />
              </div>
            )}
            {onSetObserverMode && (
              <div className="wizard-rule-card">
                <SwitchRow
                  label={t('ui.settings.observer')}
                  description={t('ui.settings.observerHelp')}
                  checked={Boolean(gameState.hostObserverMode)}
                  onChange={onSetObserverMode}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="lg-error" role="alert">{error}</p>}

      {areaSheetOpen && (
        <Sheet open onClose={() => setAreaSheetOpen(false)} labelledBy="area-sheet-title" tall>
          <SheetHeader
            title={t('ui.settings.sizeShape')}
            kicker={t('ui.settings.areaText', {
              count: cells.length,
              size: gameState.tileSizeMeters,
              across: formatDistance(Math.round(metrics.maxDimensionMeters)),
            })}
            titleId="area-sheet-title"
            onClose={() => setAreaSheetOpen(false)}
            closeLabel={t('ui.common.close')}
          />
          <div className="lg-card lg-card--tight">
            <div className="lg-row lg-row--between">
              <div className="lg-stack lg-stack--sm">
                <span className="lg-h3">{t('ui.settings.tileSize')}</span>
                <span className="lg-small">{t('ui.settings.tileSizeHelp', { max: maxTileSize })}</span>
              </div>
              <div className="lg-stepper lg-stepper--inline">
                <button
                  type="button"
                  className="lg-stepper__btn"
                  aria-label={t('ui.settings.smaller')}
                  disabled={gameState.tileSizeMeters <= 15}
                  onClick={() => onSetTileSize(Math.max(15, gameState.tileSizeMeters - 5))}
                >
                  <Icon name="minus" size={20} strokeWidth={2.4} />
                </button>
                <span className="lg-stepper__number" style={{ minWidth: 56, textAlign: 'center' }}>{gameState.tileSizeMeters} m</span>
                <button
                  type="button"
                  className="lg-stepper__btn"
                  aria-label={t('ui.settings.bigger')}
                  disabled={gameState.tileSizeMeters >= maxTileSize}
                  onClick={() => onSetTileSize(Math.min(maxTileSize, gameState.tileSizeMeters + 5))}
                >
                  <Icon name="plus" size={20} strokeWidth={2.4} />
                </button>
              </div>
            </div>
          </div>
          <div className="lg-legacy">
            <ReviewStep
              gameState={gameState}
              myUserId={myUserId}
              authToken={authToken}
              isHost
              currentLocation={currentLocation}
              canStart={false}
              onUseCenteredGameArea={props.onUseCenteredGameArea}
              onSetPatternGameArea={props.onSetPatternGameArea}
              onSetCustomGameArea={props.onSetCustomGameArea}
              onSetMasterTileByHex={props.onSetMasterTileByHex}
              onAssignStartingTile={props.onAssignStartingTile}
              onSetAllianceHQ={props.onSetAllianceHQ}
              onStartGame={onStartGame}
              invoke={invoke}
              embedded
            />
          </div>
          <Button onClick={() => setAreaSheetOpen(false)}>{t('ui.common.done')}</Button>
        </Sheet>
      )}
    </Screen>
  );
}

function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}
