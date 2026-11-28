import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SpectatorInfo } from '../../types/game';
import { useSpectatorStore } from '../../stores/spectatorStore';
import { Icon } from '../ui/Icon';
import { Button, Sheet, SheetHeader, SwitchRow } from '../ui/kit';

/** Where a spectator opens the game. The app and the site share one address. */
function watchUrl(code?: string): string {
  const base = `${window.location.origin}/watch`;
  return code ? `${base}?code=${encodeURIComponent(code)}` : base;
}

function prettyCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

interface RowProps {
  enabled: boolean;
  onOpen: () => void;
}

/** The row a host taps to open the spectators sheet. */
export function SpectatorsRow({ enabled, onOpen }: RowProps) {
  const { t } = useTranslation();
  const count = useSpectatorStore((state) => state.info?.spectators.length ?? 0);
  return (
    <button type="button" className="lg-listrow" onClick={onOpen} data-testid="spectators-row">
      <Icon name="eye" />
      <span className="lg-listrow__copy">
        <span className="lg-listrow__title">{t('ui.spectators.title')}</span>
        <span className="lg-listrow__sub">
          {enabled ? t('ui.spectators.rowOn', { count }) : t('ui.spectators.rowOff')}
        </span>
      </span>
      <Icon name="chevronRight" size={20} className="lg-listrow__chev" />
    </button>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Host only: let people watch, share the watch code and see who is watching. */
export function SpectatorsSheet({ open, onClose }: Props) {
  const { t } = useTranslation();
  const info = useSpectatorStore((state) => state.info);
  const invoke = useSpectatorStore((state) => state.invoke);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmNewCode, setConfirmNewCode] = useState(false);

  const call = useCallback(async (method: string, ...args: unknown[]) => {
    if (!invoke) return;
    setBusy(true);
    setFailed(false);
    try {
      const next = await invoke<SpectatorInfo | null>(method, ...args);
      if (next) useSpectatorStore.getState().setInfo(next);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [invoke]);

  useEffect(() => {
    if (!open || !invoke) return;
    void Promise.resolve().then(() => call('GetSpectatorInfo'));
  }, [call, invoke, open]);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const close = () => {
    setConfirmNewCode(false);
    setFailed(false);
    onClose();
  };

  const copyLink = async () => {
    if (!info?.watchCode) return;
    const url = watchUrl(info.watchCode);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard access: the code on screen is enough to get in.
      setFailed(true);
    }
  };

  const newCode = () => {
    if (!confirmNewCode) {
      setConfirmNewCode(true);
      return;
    }
    setConfirmNewCode(false);
    void call('RegenerateWatchCode');
  };

  return (
    <Sheet open={open} onClose={close} labelledBy="spectators-title" tall testId="spectators-sheet">
      <SheetHeader
        title={t('ui.spectators.title')}
        titleId="spectators-title"
        onClose={close}
        closeLabel={t('ui.common.close')}
      />

      {!info ? (
        <p className="lg-muted lg-center" role="status">{failed ? t('ui.spectators.failed') : t('ui.spectators.loading')}</p>
      ) : (
        <>
          <div className="lg-section__box">
            <SwitchRow
              label={t('ui.spectators.allow')}
              description={t('ui.spectators.allowHelp')}
              checked={info.enabled}
              disabled={busy}
              testId="spectators-switch"
              onChange={(checked) => { void call('SetSpectatorsEnabled', checked); }}
            />
          </div>

          {info.enabled && (
            <>
              <div className="lg-card">
                <span className="lg-muted">{t('ui.spectators.code')}</span>
                <span className="lg-watchcode" data-testid="spectators-code">{prettyCode(info.watchCode)}</span>
                <span className="lg-small">{t('ui.spectators.codeHelp', { url: watchUrl().replace(/^https?:\/\//, '') })}</span>
                <Button icon={copied ? 'check' : 'share'} onClick={() => void copyLink()} testId="spectators-copy">
                  {copied ? t('ui.spectators.copied') : t('ui.spectators.copy')}
                </Button>
              </div>

              <section className="lg-section">
                <h3 className="lg-section__title">{t('ui.spectators.watchingNow')}</h3>
                {info.spectators.length === 0 ? (
                  <p className="lg-muted">{t('ui.spectators.nobody')}</p>
                ) : (
                  <ul className="lg-watchers" data-testid="spectators-list">
                    {info.spectators.map((spectator) => (
                      <li key={spectator.userId} className="lg-watchers__row">
                        <Icon name="eye" size={18} className="lg-watchers__icon" />
                        <span className="lg-watchers__name">{spectator.name}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          block={false}
                          disabled={busy}
                          aria-label={t('ui.spectators.removeLabel', { name: spectator.name })}
                          onClick={() => { void call('RemoveSpectator', spectator.userId); }}
                        >
                          {t('ui.spectators.remove')}
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Button variant={confirmNewCode ? 'danger' : 'outline'} size="md" disabled={busy} onClick={newCode} testId="spectators-new-code">
                {confirmNewCode ? t('ui.spectators.regenerateConfirm') : t('ui.spectators.regenerate')}
              </Button>
            </>
          )}

          {failed && <p className="lg-error" role="alert">{t('ui.spectators.failed')}</p>}
        </>
      )}
    </Sheet>
  );
}
