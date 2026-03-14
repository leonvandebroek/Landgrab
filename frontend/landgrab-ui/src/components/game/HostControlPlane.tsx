import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CopresenceMode, GameDynamics, GameState } from '../../types/game';
import { DYNAMICS_PRESETS as PRESETS, PRESET_MODES, COPRESENCE_MODES, FEATURE_KEYS, EVENT_TYPES, featureField } from '../../utils/dynamics';
import type { FeatureKey } from '../../utils/dynamics';
import { GameEventLog } from './GameEventLog';
import { ScoreRow } from './PlayerPanel';

/* ── Props ─────────────────────────────────────────────────────────── */

interface Props {
  state: GameState;
  onSwitchToPlayer: () => void;
  onUpdateDynamics: (dynamics: GameDynamics) => void;
  onTriggerEvent: (eventType: string, targetQ?: number, targetR?: number, targetAllianceId?: string) => void;
  onSendMessage: (message: string, allianceIds?: string[]) => void;
  onPauseGame: (paused: boolean) => void;
  onReturnToLobby: () => void;
  error: string;
  children?: React.ReactNode;
}

/* ── Component ─────────────────────────────────────────────────────── */

export function HostControlPlane({
  state,
  onSwitchToPlayer,
  onUpdateDynamics,
  onTriggerEvent,
  onSendMessage,
  onPauseGame,
  onReturnToLobby,
  error,
  children,
}: Props) {
  const { t } = useTranslation();
  const [activePanel, setActivePanel] = useState<'scoreboard' | 'dynamics' | 'events' | 'messaging' | 'log' | 'menu' | null>(null);
  const [messageText, setMessageText] = useState('');
  const [selectedAlliances, setSelectedAlliances] = useState<string[]>([]);
  const [confirmEvent, setConfirmEvent] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { dynamics } = state;

  // Clean up confirm timer on unmount
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const sortedPlayers = useMemo(() =>
    [...state.players].sort((a, b) => b.territoryCount - a.territoryCount),
    [state.players]
  );

  const totalHexes = useMemo(() => Object.keys(state.grid).length, [state.grid]);

  /* ── Dynamics handlers ──────────────────────────────────────────── */

  const handleFeatureToggle = useCallback((key: FeatureKey, checked: boolean) => {
    onUpdateDynamics({ ...dynamics, [featureField(key)]: checked });
  }, [dynamics, onUpdateDynamics]);

  const handlePresetChange = useCallback((preset: string) => {
    // For 'Aangepast', preserve the current modes; for named presets use PRESET_MODES
    // (PRESET_MODES covers all entries in DYNAMICS_PRESETS, so the fallback is a safety guard)
    const modes = preset === 'Aangepast'
      ? dynamics.activeCopresenceModes
      : (PRESET_MODES[preset] ?? []) as CopresenceMode[];
    onUpdateDynamics({ ...dynamics, copresencePreset: preset, activeCopresenceModes: modes });
  }, [dynamics, onUpdateDynamics]);

  const handleModeToggle = useCallback((mode: CopresenceMode, checked: boolean) => {
    const next = checked
      ? [...dynamics.activeCopresenceModes, mode]
      : dynamics.activeCopresenceModes.filter(m => m !== mode);
    onUpdateDynamics({ ...dynamics, activeCopresenceModes: next });
  }, [dynamics, onUpdateDynamics]);

  /* ── Event handlers ─────────────────────────────────────────────── */

  const handleTriggerEvent = useCallback((eventType: string) => {
    if (confirmEvent === eventType) {
      onTriggerEvent(eventType);
      setConfirmEvent(null);
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    } else {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmEvent(eventType);
      confirmTimerRef.current = setTimeout(() => {
        setConfirmEvent(null);
        confirmTimerRef.current = null;
      }, 3000);
    }
  }, [confirmEvent, onTriggerEvent]);

  /* ── Messaging ──────────────────────────────────────────────────── */

  const handleSendMessage = useCallback(() => {
    if (!messageText.trim()) return;
    onSendMessage(messageText.trim(), selectedAlliances.length > 0 ? selectedAlliances : undefined);
    setMessageText('');
    setSelectedAlliances([]);
  }, [messageText, selectedAlliances, onSendMessage]);

  const toggleAllianceSelection = useCallback((id: string) => {
    setSelectedAlliances(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    );
  }, []);

  /* ── Render ──────────────────────────────────────────────────────── */

  const activePreset = dynamics.copresencePreset ?? 'Klassiek';

  return (
    <div className="game-layout hud-active">
      {/* Top bar */}
      <div className="top-status-bar">
        {error && <div className="top-warning-bar">⚠️ {error}</div>}
        {state.isPaused && (
          <div className="top-warning-bar event-warning">
            ⏸ {t('observer.gamePaused' as never)}
          </div>
        )}

        <div className="top-stats-row">
          <div className="hud-stats-flat">
            <div className="stat-item">
              <span className="stat-value primary">{state.roomCode}</span>
              <span className="stat-label">{t('observer.room' as never)}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value secondary">{state.players.length}</span>
              <span className="stat-label">{t('game.hudPlayers')}</span>
            </div>
            <div className="stat-item">
              <span className="stat-value secondary">{state.alliances.length}</span>
              <span className="stat-label">{t('observer.teams' as never)}</span>
            </div>
          </div>
          <button className="hud-menu-btn-flat" onClick={() => setActivePanel('menu')} aria-label={t('game.hudMenu')}>
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
        </div>
      </div>

      {/* Map area */}
      <div className="map-area-wrapper">
        <div className="map-container">{children}</div>

        {/* Bottom action bar */}
        <div className="bottom-hud-overlay">
          <div className="hud-action-bar" style={{ pointerEvents: 'auto' }}>
            <button className="hud-btn" onClick={() => setActivePanel('scoreboard')}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              <span>{t('observer.scoreboard' as never)}</span>
            </button>
            <button className="hud-btn" onClick={() => setActivePanel('dynamics')}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              <span>{t('observer.dynamics' as never)}</span>
            </button>
            <button className="hud-btn" onClick={() => setActivePanel('events')}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              <span>{t('observer.events' as never)}</span>
            </button>
            <button className="hud-btn" onClick={() => setActivePanel('messaging')}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              <span>{t('observer.messaging' as never)}</span>
            </button>
            <button className="hud-btn" onClick={() => setActivePanel('log')}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
              <span>{t('observer.eventLog' as never)}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Scoreboard Panel ─────────────────────────────────────────── */}
      <div className={`hud-modal-sheet ${activePanel === 'scoreboard' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('observer.scoreboard' as never)}</h3>
          <button className="hud-modal-close" onClick={() => setActivePanel(null)}>×</button>
        </div>
        <div className="player-list">
          {sortedPlayers.map(player => (
            <ScoreRow key={player.id} player={player} totalHexes={totalHexes} t={t} />
          ))}
        </div>
      </div>

      {/* ── Dynamics Panel ────────────────────────────────────────────── */}
      <div className={`hud-modal-sheet ${activePanel === 'dynamics' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('observer.dynamics' as never)}</h3>
          <button className="hud-modal-close" onClick={() => setActivePanel(null)}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem' }}>
          {/* Preset selector */}
          <div className="wizard-rule-card" style={{ margin: 0 }}>
            <h4>{t('dynamics.presetsLabel')}</h4>
            <div className="claim-mode-grid preset-grid">
              {PRESETS.map(preset => (
                <label
                  key={preset}
                  className={`claim-mode-option preset-option${activePreset === preset ? ' active' : ''}`}
                >
                  <input
                    type="radio"
                    name="observer-preset"
                    checked={activePreset === preset}
                    onChange={() => handlePresetChange(preset)}
                  />
                  <span className="claim-mode-copy">
                    <strong>{t(`dynamics.preset.${preset}.title`)}</strong>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Custom copresence modes */}
          {activePreset === 'Aangepast' && (
            <div className="wizard-rule-card" style={{ margin: 0 }}>
              <h4>{t('dynamics.customLabel')}</h4>
              <div className="toggle-grid">
                {COPRESENCE_MODES.map(mode => {
                  const checked = dynamics.activeCopresenceModes.includes(mode);
                  return (
                    <label key={mode} className={`toggle-card${checked ? ' active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => handleModeToggle(mode, e.target.checked)}
                      />
                      <span className="toggle-card-copy">
                        <strong>{t(`dynamics.mode.${mode}.title`)}</strong>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Feature toggles */}
          <div className="wizard-rule-card" style={{ margin: 0 }}>
            <h4>{t('dynamics.featuresLabel')}</h4>
            {FEATURE_KEYS.map(key => (
              <label key={key} className="toggle-row">
                <input
                  type="checkbox"
                  checked={!!dynamics[featureField(key)]}
                  onChange={e => handleFeatureToggle(key, e.target.checked)}
                />
                <span className="toggle-row-copy">
                  <strong>{t(`dynamics.feature.${key}`)}</strong>
                  <span>{t(`dynamics.feature.${key}Desc`)}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* ── Events Panel ──────────────────────────────────────────────── */}
      <div className={`hud-modal-sheet ${activePanel === 'events' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('observer.events' as never)}</h3>
          <button className="hud-modal-close" onClick={() => setActivePanel(null)}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
          {EVENT_TYPES.map(eventType => (
            <button
              key={eventType}
              className={`observer-event-btn${confirmEvent === eventType ? ' confirming' : ''}`}
              onClick={() => handleTriggerEvent(eventType)}
            >
              {confirmEvent === eventType
                ? t('observer.confirmTrigger' as never, { event: t(`observer.trigger${eventType}` as never) })
                : t(`observer.trigger${eventType}` as never)}
            </button>
          ))}
          <p className="wizard-hint" style={{ textAlign: 'center', marginTop: '0.5rem' }}>
            {t('observer.triggerHint' as never)}
          </p>
        </div>
      </div>

      {/* ── Messaging Panel ───────────────────────────────────────────── */}
      <div className={`hud-modal-sheet ${activePanel === 'messaging' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('observer.messaging' as never)}</h3>
          <button className="hud-modal-close" onClick={() => setActivePanel(null)}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.75rem' }}>
          <textarea
            className="observer-message-input"
            value={messageText}
            onChange={e => setMessageText(e.target.value)}
            placeholder={t('observer.messagePlaceholder' as never)}
            maxLength={500}
            rows={3}
          />
          <div>
            <label className="toggle-row" style={{ marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                checked={selectedAlliances.length === 0}
                onChange={() => setSelectedAlliances([])}
              />
              <span className="toggle-row-copy"><strong>{t('observer.sendToAll' as never)}</strong></span>
            </label>
            {state.alliances.map(alliance => (
              <label key={alliance.id} className="toggle-row">
                <input
                  type="checkbox"
                  checked={selectedAlliances.includes(alliance.id)}
                  onChange={() => toggleAllianceSelection(alliance.id)}
                />
                <span className="toggle-row-copy">
                  <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: alliance.color, marginRight: '0.5rem', verticalAlign: 'middle' }} />
                  <strong>{alliance.name}</strong>
                </span>
              </label>
            ))}
          </div>
          <button
            className="btn-primary"
            onClick={handleSendMessage}
            disabled={!messageText.trim()}
          >
            {t('observer.send' as never)}
          </button>
        </div>
      </div>

      {/* ── Event Log Panel ───────────────────────────────────────────── */}
      <div className={`hud-modal-sheet ${activePanel === 'log' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('observer.eventLog' as never)}</h3>
          <button className="hud-modal-close" onClick={() => setActivePanel(null)}>×</button>
        </div>
        <GameEventLog events={state.eventLog} />
      </div>

      {/* ── Menu Panel ────────────────────────────────────────────────── */}
      <div className={`hud-modal-sheet ${activePanel === 'menu' ? 'open' : ''}`}>
        <div className="hud-modal-header">
          <h3>{t('game.hudMenu')}</h3>
          <button className="hud-modal-close" onClick={() => setActivePanel(null)}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <button
            className="btn-secondary"
            style={{ width: '100%' }}
            onClick={() => onPauseGame(!state.isPaused)}
          >
            {state.isPaused ? t('observer.resumeGame' as never) : t('observer.pauseGame' as never)}
          </button>
          <button className="btn-secondary" style={{ width: '100%' }} onClick={onSwitchToPlayer}>
            {t('observer.switchToPlayer' as never)}
          </button>
          <button
            className="btn-secondary"
            style={{ width: '100%', color: 'var(--danger, #e74c3c)' }}
            onClick={onReturnToLobby}
          >
            {t('game.returnToLobby')}
          </button>
        </div>
      </div>
    </div>
  );
}
