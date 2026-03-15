import { useTranslation } from 'react-i18next';
import type { AllianceDto, Player } from '../../../types/game';
import type { AreaModeOption } from './AreaModeSelector';
import { PlayerAssignment } from './PlayerAssignment';

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

export function ReviewCustomizePanel({
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
        <div className="wizard-customize-panel">
            <p className="wizard-hint">{t('wizard.reviewCustomizeDesc')}</p>
            {areaMode === 'Drawn' && (
                <p className="wizard-hint">{t('wizard.areaDrawCustomizeHint')}</p>
            )}
            <PlayerAssignment
                areaMode={areaMode}
                selectedHex={selectedHex}
                masterTileReady={masterTileReady}
                players={players}
                alliances={alliances}
                effectiveSelectedPlayerId={effectiveSelectedPlayerId}
                hqMode={hqMode}
                hqAllianceId={hqAllianceId}
                hqEnabled={hqEnabled}
                onSelectedPlayerChange={onSelectedPlayerChange}
                onSetMasterTile={onSetMasterTile}
                onAssignStartingTile={onAssignStartingTile}
                onToggleAllianceHqMode={onToggleAllianceHqMode}
                onSetAllianceHQ={onSetAllianceHQ}
            />
        </div>
    );
}
