export type GamePhase = 'Lobby' | 'Reinforce' | 'Roll' | 'Claim' | 'GameOver';
export type GameMode = 'Alliances' | 'FreeForAll';

export interface HexCell {
  q: number;
  r: number;
  ownerId?: string;
  ownerAllianceId?: string;
  ownerName?: string;
  ownerColor?: string;
  troops: number;
}

export interface Player {
  id: string;
  name: string;
  color: string;
  allianceId?: string;
  allianceName?: string;
  allianceColor?: string;
  troopsToPlace: number;
  isHost: boolean;
  isConnected: boolean;
  territoryCount: number;
}

export interface AllianceDto {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
  territoryCount: number;
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  gameMode: GameMode;
  players: Player[];
  alliances: AllianceDto[];
  grid: Record<string, HexCell>;
  currentPlayerIndex: number;
  movesRemaining: number;
  lastDiceRoll: number[];
  mapLat: number;
  mapLng: number;
  gridRadius: number;
  turnNumber: number;
  winnerId?: string;
  winnerName?: string;
  isAllianceVictory: boolean;
}

export interface CombatResult {
  attackDice: number[];
  defendDice: number[];
  attackerWon: boolean;
  attackerLost: number;
  defenderLost: number;
  hexCaptured: boolean;
  newState: GameState;
}

export interface AuthState {
  token: string;
  username: string;
  userId: string;
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
