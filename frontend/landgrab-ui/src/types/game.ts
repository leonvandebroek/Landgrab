export type GamePhase = 'Lobby' | 'Playing' | 'GameOver';
export type GameMode = 'Alliances' | 'FreeForAll';
export type ClaimMode = 'PresenceOnly' | 'PresenceWithTroop' | 'AdjacencyRequired';
export type WinConditionType = 'TerritoryPercent' | 'Elimination' | 'TimedGame';
export type GameAreaMode = 'Centered' | 'Drawn' | 'Pattern';
export type GameAreaPattern = 'WideFront' | 'TallFront' | 'Crossroads' | 'Starburst';

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
}

export interface AllianceDto {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
  territoryCount: number;
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
