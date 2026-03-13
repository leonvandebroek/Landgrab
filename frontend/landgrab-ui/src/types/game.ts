export type GamePhase = 'Lobby' | 'Playing' | 'GameOver';
export type GameMode = 'Alliances' | 'FreeForAll';
export type ClaimMode = 'PresenceOnly' | 'PresenceWithTroop' | 'AdjacencyRequired';
export type WinConditionType = 'TerritoryPercent' | 'Elimination' | 'TimedGame';
export type GameAreaMode = 'Centered' | 'Drawn' | 'Pattern';
export type GameAreaPattern = 'WideFront' | 'TallFront' | 'Crossroads' | 'Starburst';

export type CopresenceMode =
  | 'None' | 'Standoff' | 'PresenceBattle' | 'PresenceBonus'
  | 'Ambush' | 'Toll' | 'Duel' | 'Rally' | 'Drain'
  | 'Stealth' | 'Hostage' | 'Scout' | 'Beacon'
  | 'FrontLine' | 'Relay' | 'JagerProoi' | 'Shepherd' | 'CommandoRaid';

export type TerrainType = 'None' | 'Water' | 'Building' | 'Road' | 'Path' | 'Forest' | 'Park' | 'Hills' | 'Steep';

export type PlayerRole = 'None' | 'Commander' | 'Scout' | 'Defender' | 'Saboteur' | 'Engineer';

export interface GameDynamics {
  activeCopresenceModes: CopresenceMode[];
  copresencePreset: string | null;
  terrainEnabled: boolean;
  playerRolesEnabled: boolean;
  fogOfWarEnabled: boolean;
  supplyLinesEnabled: boolean;
  hqEnabled: boolean;
  timedEscalationEnabled: boolean;
  underdogPactEnabled: boolean;
  neutralNPCEnabled: boolean;
  randomEventsEnabled: boolean;
  missionSystemEnabled: boolean;
}

export interface HexCoordinate {
  q: number;
  r: number;
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
  terrainType?: TerrainType;
  // Phase 3: Rally
  isFortified?: boolean;
  // Phase 3: Shepherd
  lastVisitedAt?: string;
  // Phase 4: Engineer
  engineerBuiltAt?: string;
  isFort?: boolean;
  // Phase 10: PresenceBattle
  contestProgress?: number;
  contestingPlayerId?: string;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  allianceId?: string;
  allianceName?: string;
  allianceColor?: string;
  carriedTroops: number;
  carriedTroopsSourceQ?: number | null;
  carriedTroopsSourceR?: number | null;
  currentLat?: number | null;
  currentLng?: number | null;
  isHost: boolean;
  isConnected: boolean;
  isWinner?: boolean;
  territoryCount: number;
  role?: PlayerRole;
  // Phase 3: Scout
  visitedHexes?: string[];
  // Phase 5: Beacon
  isBeacon?: boolean;
  beaconLat?: number;
  beaconLng?: number;
  // Phase 6: Stealth
  stealthUntil?: string;
  stealthCooldownUntil?: string;
  // Phase 6: CommandoRaid
  isCommandoActive?: boolean;
  commandoTargetQ?: number;
  commandoTargetR?: number;
  commandoDeadline?: string;
  commandoCooldownUntil?: string;
  // Phase 6: JagerProoi
  isPrey?: boolean;
  // Phase 10: Hostage
  heldByPlayerId?: string;
  heldUntil?: string;
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
  // Phase 8: Underdog
  underdogBoostUntil?: string;
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
  gridRadius: number;
  gameAreaMode: GameAreaMode;
  gameAreaPattern: GameAreaPattern | null;
  tileSizeMeters: number;
  claimMode: ClaimMode;
  allowSelfClaim?: boolean;
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
  // Phase 6: JagerProoi
  preyTargetQ?: number;
  preyTargetR?: number;
  // Phase 8: Rush Hour
  isRushHour?: boolean;
  // Phase 9: Missions
  missions?: Mission[];
  // Host overrides
  hostBypassGps?: boolean;
  maxFootprintMetersOverride?: number | null;
}

export interface Achievement {
  id: string;
  playerId: string;
  playerName: string;
  titleKey: string;
  value?: string;
}

export type ReClaimMode = 'Alliance' | 'Self' | 'Abandon';

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
  previousOwnerName?: string;
  attackerBonus?: number;
  defenderBonus?: number;
  defenderTerrainType?: TerrainType;
}

export interface Mission {
  id: string;
  type: string;
  title: string;
  titleKey?: string;
  description: string;
  descriptionKey?: string;
  scope: 'Main' | 'Interim' | 'Team' | 'Personal';
  targetTeamId?: string;
  targetPlayerId?: string;
  objective: string;
  progress: number;
  status: 'Active' | 'Completed' | 'Failed' | 'Expired';
  expiresAt?: string;
  reward: string;
  rewardKey?: string;
}

export interface AmbushResult {
  attackerId: string;
  defenderId: string;
  q: number;
  r: number;
  attackerWon: boolean;
  troopsLost: number;
  newState: GameState;
}

export interface PendingDuel {
  id: string;
  playerIds: string[];
  tileQ: number;
  tileR: number;
  expiresAt: string;
  accepted: boolean;
}

export interface RandomEvent {
  id: string;
  type: 'Calamity' | 'Epidemic' | 'DiplomaticOpening' | 'BonusTroops' | 'RushHour';
  title: string;
  description: string;
  affectedHexes?: { q: number; r: number }[];
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
