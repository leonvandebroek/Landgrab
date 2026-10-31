import { CombatResultModal } from './CombatResultModal';
import type { CombatResult } from '../../types/game';

interface CombatModalProps {
  result: CombatResult;
  onDeployTroops: (count: number) => void;
  onClose: () => void;
}

export function CombatModal({ result, onDeployTroops, onClose }: CombatModalProps) {
  return <CombatResultModal result={result} onDeployTroops={onDeployTroops} onClose={onClose} />;
}
