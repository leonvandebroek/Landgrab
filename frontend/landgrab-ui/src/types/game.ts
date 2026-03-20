export type GamePhase = 'Lobby' | 'Playing' | 'GameOver';
export type GameMode = 'Alliances' | 'FreeForAll';
export type ClaimMode = 'PresenceOnly' | 'PresenceWithTroop' | 'AdjacencyRequired';
export type CombatMode = 'Classic' | 'Balanced' | 'Siege';
export type WinConditionType = 'TerritoryPercent' | 'Elimination' | 'TimedGame';
export type GameAreaMode = 'Centered' | 'Drawn' | 'Pattern';
export type GameAreaPattern = 'WideFront' | 'TallFront' | 'Crossroads' | 'Starburst';

export type PlayerRole = 'None' | 'Commander' | 'Scout' | 'Engineer';

export interface GameDynamics {
  playerRolesEnabled: boolean;
  beaconEnabled: boolean;
  combatMode?: CombatMode;
  hqEnabled: boolean;
  hqAutoAssign: boolean;
  tileDecayEnabled: boolean;
  enemySightingMemorySeconds?: number;
}

export interface HexCoordinate {
  q: number;
  r: number;
}

export type MapInteractionTone = 'info' | 'success' | 'error';

export interface MapInteractionFeedback {
  tone: MapInteractionTone;
  message: string;
  targetHex?: [number, number] | null;
}

export interface PickupPrompt {
  q: number;
  r: number;
  max: number;
}

export interface ReinforcePrompt {
  q: number;
  r: number;
  max: number;
}

export interface AttackPrompt {
  q: number;
  r: number;
  max: number;
  defenderTroops: number;
}

export interface CombatBonusDetail {
  source: string;
  value: number;
}

export interface CombatPreviewDto {
  attackerTroops: number;
  defenderTroops: number;
  effectiveAttack: number;
  effectiveDefence: number;
  attackerWinProbability: number;
  attackerBonuses: CombatBonusDetail[];
  defenderBonuses: CombatBonusDetail[];
  combatMode: string;
  defenderName: string;
  defenderAllianceName?: string | null;
}

export interface CombatPreviewState {
  q: number;
  r: number;
  preview: CombatPreviewDto;
}

export interface HexCell {
  q: number;
  r: number;
  ownerId?: string;
  ownerAllianceId?: string;
  ownerName?: string;
  ownerColor?: string;
  troops: number;
  isMasterTile: boolean;
  visibilityTier?: 'Visible' | 'Remembered' | 'Hidden';
  lastKnownTroops?: number | null;
  lastKnownOwnerId?: string | null;
  lastKnownOwnerName?: string | null;
  lastKnownOwnerColor?: string | null;
  lastKnownOwnerAllianceId?: string | null;
  lastKnownIsFort?: boolean;
  lastKnownIsMasterTile?: boolean;
  // Phase 3: Rally
  isFortified?: boolean;
  // Phase 3: Shepherd
  lastVisitedAt?: string;
  // Phase 4: Engineer
  isFort?: boolean;
  sabotagedUntil?: string;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  emoji?: string;
  allianceId?: string;
  allianceName?: string;
  allianceColor?: string;
  carriedTroops: number;
  carriedTroopsSourceQ?: number | null;
  carriedTroopsSourceR?: number | null;
  currentLat?: number | null;
  currentLng?: number | null;
  currentHexQ?: number | null;
  currentHexR?: number | null;
  isHost: boolean;
  isConnected: boolean;
  isWinner?: boolean;
  territoryCount: number;
  role?: PlayerRole;
  // Phase 5: Beacon
  isBeacon?: boolean;
  beaconLat?: number;
  beaconLng?: number;
  // Commander abilities
  commandoRaidCooldownUntil?: string;
  tacticalStrikeActive?: boolean;
  tacticalStrikeExpiry?: string;
  tacticalStrikeCooldownUntil?: string;
  rallyPointActive?: boolean;
  rallyPointDeadline?: string;
  rallyPointCooldownUntil?: string;
  rallyPointQ?: number;
  rallyPointR?: number;
  // Engineer abilities
  fortTargetQ?: number;
  fortTargetR?: number;
  fortPerimeterVisited?: string[];
  sabotageTargetQ?: number;
  sabotageTargetR?: number;
  sabotagePerimeterVisited?: string[];
  sabotageCooldownUntil?: string;
  demolishTargetKey?: string;
  demolishApproachDirectionsMade?: string[];
  demolishCooldownUntil?: string;
  previousHexKey?: string;
}

export interface AllianceDto {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
  territoryCount: number;
  // Phase 4: HQ
  hqHexQ?: number;
  hqHexR?: number;
  claimFrozenUntil?: string;
}

export interface GameEventLogEntry {
  createdAt: string;
  type: string;
  message: string;
  playerId?: string;
  playerName?: string;
  targetPlayerId?: string;
  targetPlayerName?: string;
  allianceId?: string;
  allianceName?: string;
  q?: number;
  r?: number;
  winnerId?: string;
  winnerName?: string;
  isAllianceVictory?: boolean;
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  gameMode: GameMode;
  players: Player[];
  alliances: AllianceDto[];
  eventLog?: GameEventLogEntry[] | null;
  grid: Record<string, HexCell>;
  mapLat: number | null;
  mapLng: number | null;
  hasMapLocation: boolean;
  currentWizardStep?: number;
  gridRadius: number;
  gameAreaMode: GameAreaMode;
  gameAreaPattern: GameAreaPattern | null;
  tileSizeMeters: number;
  claimMode: ClaimMode;
  dynamics: GameDynamics;
  winConditionType: WinConditionType;
  winConditionValue: number;
  gameDurationMinutes: number | null;
  masterTileQ: number | null;
  masterTileR: number | null;
  gameStartedAt: string | null;
  winnerId?: string;
  winnerName?: string;
  isAllianceVictory: boolean;
  achievements?: Achievement[];
  // Host overrides
  hostBypassGps?: boolean;
  maxFootprintMetersOverride?: number | null;
  hostObserverMode?: boolean;
  isPaused?: boolean;
  activeRaids?: ActiveCommandoRaid[];
  contestedEdges?: ContestedEdgeDto[] | null;
}

export interface ActiveCommandoRaid {
  id: string;
  targetQ: number;
  targetR: number;
  initiatorAllianceId: string;
  initiatorPlayerId: string;
  initiatorPlayerName: string;
  deadline: string;
  isHQRaid: boolean;
}

export interface Achievement {
  id: string;
  playerId: string;
  playerName: string;
  titleKey: string;
  value?: string;
}

export interface CombatResult {
  attackDice: number[];
  defendDice: number[];
  attackerWon: boolean;
  attackerLost: number;
  defenderLost: number;
  hexCaptured: boolean;
  newState: GameState;
  q: number;
  r: number;
  previousOwnerName: string | null;
  attackerBonus: number;
  defenderBonus: number;
  effectiveAttack: number;
  effectiveDefence: number;
  attackerTroopsLost: number;
  defenderTroopsLost: number;
  attackerTroopsRemaining: number;
  defenderTroopsRemaining: number;
  attackerWinProbability: number;
  combatModeUsed: string;
  attackerBonuses: CombatBonusDetail[];
  defenderBonuses: CombatBonusDetail[];
}

export interface NeutralClaimResult {
  q: number;
  r: number;
  carriedTroops: number;
  troopsOnHex: number;
}

export interface AuthState {
  token: string;
  username: string;
  userId: string;
}

export interface RoomSummary {
  code: string;
  phase: GamePhase;
  playerCount: number;
  isConnected: boolean;
  hostName: string;
  createdAt: string;
}

export interface GlobalHex {
  q: number;
  r: number;
  ownerUserId?: string;
  ownerAllianceId?: string;
  troops: number;
  lastCaptured?: string;
  attackCooldownUntil?: string;
  owner?: { username: string };
  ownerAlliance?: { name: string; tag: string };
}

// ── Map Templates ──────────────────────────────────────────────

export interface MapTemplate {
  id: string;
  name: string;
  description: string | null;
  hexCount: number;
  tileSizeMeters: number;
  centerLat: number | null;
  centerLng: number | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  creatorUsername?: string;
}

export interface MapTemplateDetail extends MapTemplate {
  coordinates: HexCoordinate[];
}

export interface CreateMapTemplateRequest {
  name: string;
  description?: string;
  coordinates: HexCoordinate[];
  tileSizeMeters?: number;
  centerLat?: number;
  centerLng?: number;
}

export interface UpdateMapTemplateRequest {
  name?: string;
  description?: string;
  coordinates?: HexCoordinate[];
  tileSizeMeters?: number;
  centerLat?: number;
  centerLng?: number;
}

export interface ContestedEdgeDto {
  hexKeyA: string;
  hexKeyB: string;
  neighborIndex: number;
  teamAColor: string;
  teamBColor: string;
  intensity: number;
}

export interface HostMessage {
  message: string;
  fromHost: boolean;
  targetAllianceIds?: string[];
}
