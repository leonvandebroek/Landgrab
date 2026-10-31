import { useTranslation } from 'react-i18next';
import { GameIcon } from '../../common/GameIcon';
import type { AllianceDto, Player } from '../../../types/game';
import { CustomSelect } from '../CustomSelect';
import type { AreaModeOption } from './AreaModeSelector';

interface Props {
    areaMode: AreaModeOption;
    selectedHex: [number, number] | null;
    masterTileReady: boolean;
    players: Player[];
    alliances: AllianceDto[];
    effectiveSelectedPlayerId: string;
    hqMode: boolean;
    hqAllianceId: string | null;
    hqEnabled: boolean;
    onSelectedPlayerChange: (playerId: string) => void;
    onSetMasterTile: () => void;
    onAssignStartingTile: () => void;
    onToggleAllianceHqMode: (allianceId: string) => void;
    onSetAllianceHQ?: (q: number, r: number, allianceId: string) => void;
}

export function PlayerAssignment({
    areaMode,
    selectedHex,
    masterTileReady,
    players,
    alliances,
    effectiveSelectedPlayerId,
    hqMode,
    hqAllianceId,
    hqEnabled,
    onSelectedPlayerChange,
    onSetMasterTile,
    onAssignStartingTile,
    onToggleAllianceHqMode,
    onSetAllianceHQ,
}: Props) {
    const { t } = useTranslation();

    return (
        <>
            {selectedHex && areaMode !== 'Drawn' && (
                <div className="wizard-customize-actions">
                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={onSetMasterTile}
                    >
                        {masterTileReady ? t('lobby.moveMasterTileToSelectedHex') : t('lobby.setMasterTileToSelectedHex')}
                    </button>

                    <div className="wizard-customize-assign">
                        <CustomSelect
                            value={effectiveSelectedPlayerId}
                            options={players.map(player => ({
                                value: player.id,
                                label: player.name,
                            }))}
                            onChange={onSelectedPlayerChange}
                            className="wizard-player-select"
                        />
                        <button
                            type="button"
                            className="btn-secondary"
                            onClick={onAssignStartingTile}
                            disabled={!masterTileReady}
                        >
                            {t('lobby.assignTile')}
                        </button>
                    </div>
                </div>
            )}

            {hqEnabled && onSetAllianceHQ && (
                <div className="wizard-hq-section">
                    <h4>{t('phase4.hq' as never)}</h4>
                    {alliances.map(alliance => (
                        <div key={alliance.id} className="wizard-hq-row">
                            <div>
                                <svg className="wizard-hq-swatch" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                                    <circle cx="6" cy="6" r="6" fill={alliance.color} />
                                </svg>
                                <strong>{alliance.name}</strong>
                                {alliance.hqHexQ != null && alliance.hqHexR != null && (
                                    <span className="wizard-hq-coords">
                                        <GameIcon name="hq" size="sm" /> ({alliance.hqHexQ}, {alliance.hqHexR})
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                className={`btn-secondary wizard-hq-button${hqMode && hqAllianceId === alliance.id ? ' is-active' : ''}`}
                                onClick={() => onToggleAllianceHqMode(alliance.id)}
                            >
                                {hqMode && hqAllianceId === alliance.id
                                    ? t('game.cancel' as never)
                                    : alliance.hqHexQ != null
                                        ? <><GameIcon name="wrench" size="sm" /> {t('phase4.hq' as never)}</>
                                        : <><GameIcon name="pin" size="sm" /> {t('phase4.hq' as never)}</>}
                            </button>
                        </div>
                    ))}
                    {hqMode && (
                        <div className="wizard-hq-hint">
                            <GameIcon name="pin" size="sm" /> Click a hex on the map to place the HQ
                        </div>
                    )}
                </div>
            )}

            {!selectedHex && areaMode !== 'Drawn' && (
                <p className="wizard-hint">{t('lobby.hexSelectionNote')}</p>
            )}
        </>
    );
}
