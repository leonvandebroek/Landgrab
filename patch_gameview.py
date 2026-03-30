import re

with open("frontend/landgrab-ui/src/components/GameView.tsx", "r") as f:
    text = f.read()

imports_patch = """import { TeamSplash } from './game/TeamSplash';
import { useTranslation } from 'react-i18next';
"""

text = re.sub(r"(import \{ lazy, Suspense, useCallback, useEffect, useMemo \} from 'react';)", r"\1\n" + imports_patch, text)

# add state
state_patch = """
  // ── Team Splash logic ───────────────────────────────────────────────────
  const [showTeamSplash, setShowTeamSplash] = useState(false);
  const prevPhaseRef = useRef<string | undefined>(undefined);
  const splashKey = gameState?.roomCode ? `lg-splash-ack-${gameState.roomCode}` : '';
  const { t } = useTranslation();

  // Re-evaluate on phase change
  useEffect(() => {
    const currentPhase = gameState?.phase;
    
    // Only trigger when explicitly transitioning to Playing from a different phase
    if (
      currentPhase === 'Playing' &&
      prevPhaseRef.current &&
      prevPhaseRef.current !== 'Playing' &&
      splashKey &&
      sessionStorage.getItem(splashKey) !== 'true'
    ) {
      if (gameState?.alliances && gameState.alliances.length > 0) {
        setShowTeamSplash(true);
      }
      sessionStorage.setItem(splashKey, 'true');
    }

    prevPhaseRef.current = currentPhase;
  }, [gameState?.phase, gameState?.alliances, splashKey]);

  const splshMe = gameState?.players.find(p => p.id === userId);
  const splshAlliance = gameState?.alliances?.find(a => a.id === splshMe?.allianceId);
  
  const handleDismissSplash = useCallback(() => {
    setShowTeamSplash(false);
  }, []);
"""

# add useRef and useState to imports
if 'useRef' not in text:
    text = text.replace("useMemo } from 'react'", "useMemo, useRef, useState } from 'react'")
else:
    text = text.replace("useMemo } from 'react'", "useMemo, useState } from 'react'")

text = re.sub(r"(// ── Rules-acknowledgment logic)", state_patch + r"\n  \1", text)

# add to render
render_patch = """
      {showTeamSplash && splshAlliance && (
        <TeamSplash
          allianceName={splshAlliance.name}
          allianceColor={splshAlliance.color}
          roleName={splshMe?.role && splshMe.role !== 'None' && gameState?.dynamics?.playerRolesEnabled ? t(`roles.${splshMe.role}.title` as never, { defaultValue: t(`phase4.role${splshMe.role}` as never) }) : undefined}
          onDismiss={handleDismissSplash}
        />
      )}
"""

text = re.sub(r"(    </>\n  \);\n\})", render_patch + r"\1", text)

with open("frontend/landgrab-ui/src/components/GameView.tsx", "w") as f:
    f.write(text)
