import { useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

/* ─────────────────────────────────────────────────────────────────────────
   Field kit: the shared building blocks of the redesign. Every screen sits
   in <Screen>, which keeps clear of the Dynamic Island and home indicator,
   and every choice during play opens in <Sheet>.
   ───────────────────────────────────────────────────────────────────────── */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

// eslint-disable-next-line react-refresh/only-export-components
export { cx };

interface ScreenProps {
  children: ReactNode;
  /** A fixed footer that stays above the home indicator, for the main button. */
  footer?: ReactNode;
  className?: string;
  testId?: string;
}

/** A full screen page with safe areas applied once. */
export function Screen({ children, footer, className, testId }: ScreenProps) {
  return (
    <div className={cx('lg-screen', className)} data-testid={testId}>
      <div className="lg-screen__scroll">
        <div className="lg-screen__body">{children}</div>
      </div>
      {footer && <div className="lg-screen__footer">{footer}</div>}
    </div>
  );
}

interface TopBarProps {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
}

export function TopBar({ title, onBack, backLabel, right }: TopBarProps) {
  return (
    <div className="lg-topbar">
      {onBack ? (
        <button type="button" className="lg-iconbtn lg-iconbtn--flat lg-topbar__back" onClick={onBack} aria-label={backLabel}>
          <Icon name="back" size={24} />
        </button>
      ) : <span className="lg-topbar__spacer" />}
      <h1 className="lg-topbar__title">{title}</h1>
      <div className="lg-topbar__right">{right}</div>
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'quiet' | 'danger' | 'light';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'lg' | 'md' | 'sm';
  icon?: IconName;
  block?: boolean;
  testId?: string;
}

export function Button({
  variant = 'primary',
  size = 'lg',
  icon,
  block = true,
  className,
  children,
  testId,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx('lg-btn', `lg-btn--${variant}`, `lg-btn--${size}`, block && 'lg-btn--block', className)}
      data-testid={testId}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 22 : 18} />}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
  tone?: 'default' | 'accent';
  flat?: boolean;
  size?: number;
}

export function IconButton({ icon, label, tone = 'default', flat = false, size = 22, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cx('lg-iconbtn', flat && 'lg-iconbtn--flat', tone === 'accent' && 'lg-iconbtn--accent', className)}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

interface StepperProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
  caption?: ReactNode;
  testId?: string;
  big?: boolean;
}

/** A − value + control with 44 pt targets. Replaces the thin range sliders. */
export function Stepper({ value, min, max, onChange, decreaseLabel, increaseLabel, caption, testId, big = true }: StepperProps) {
  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  return (
    <div className={cx('lg-stepper', big && 'lg-stepper--big')} data-testid={testId}>
      <button type="button" className="lg-stepper__btn" aria-label={decreaseLabel} disabled={value <= min} onClick={() => onChange(clamp(value - 1))}>
        <Icon name="minus" size={22} strokeWidth={2.4} />
      </button>
      <div className="lg-stepper__value">
        <span className="lg-stepper__number" data-testid={testId ? `${testId}-value` : undefined}>{value}</span>
        {caption && <span className="lg-stepper__caption">{caption}</span>}
      </div>
      <button type="button" className="lg-stepper__btn" aria-label={increaseLabel} disabled={value >= max} onClick={() => onChange(clamp(value + 1))}>
        <Icon name="plus" size={22} strokeWidth={2.4} />
      </button>
    </div>
  );
}

interface SwitchRowProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  testId?: string;
}

export function SwitchRow({ label, description, checked, onChange, disabled, testId }: SwitchRowProps) {
  const id = useId();
  return (
    <div className={cx('lg-switchrow', disabled && 'is-disabled')}>
      <label htmlFor={id} className="lg-switchrow__copy">
        <span className="lg-switchrow__label">{label}</span>
        {description && <span className="lg-switchrow__desc">{description}</span>}
      </label>
      <span className="lg-switch">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          data-testid={testId}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="lg-switch__track" aria-hidden="true" />
      </span>
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
  label?: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="lg-seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={cx('lg-seg__item', option.value === value && 'is-active')}
          aria-pressed={option.value === value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SheetProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  /** 'modal' covers the map with a backdrop, 'dock' sits on the map without one. */
  kind?: 'modal' | 'dock';
  labelledBy?: string;
  label?: string;
  className?: string;
  tall?: boolean;
  testId?: string;
}

/**
 * Bottom sheet. Swipe down on the handle, tap the backdrop or press Escape to
 * close a modal sheet.
 */
export function Sheet({ open, onClose, children, kind = 'modal', labelledBy, label, className, tall, testId }: SheetProps) {
  const startY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || kind !== 'modal' || !onClose) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [kind, onClose, open]);

  if (!open) return null;

  const onPointerDown = (event: React.PointerEvent) => {
    startY.current = event.clientY;
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (startY.current == null || !sheetRef.current) return;
    const delta = Math.max(0, event.clientY - startY.current);
    sheetRef.current.style.transform = `translateY(${delta}px)`;
  };
  const onPointerUp = (event: React.PointerEvent) => {
    if (startY.current == null) return;
    const delta = event.clientY - startY.current;
    startY.current = null;
    if (sheetRef.current) sheetRef.current.style.transform = '';
    if (delta > 70 && onClose) onClose();
  };

  return (
    <>
      {kind === 'modal' && <div className="lg-backdrop" onClick={onClose} aria-hidden="true" />}
      <div
        ref={sheetRef}
        className={cx('lg-sheet', `lg-sheet--${kind}`, tall && 'lg-sheet--tall', className)}
        role={kind === 'modal' ? 'dialog' : 'region'}
        aria-modal={kind === 'modal' ? true : undefined}
        aria-labelledby={labelledBy}
        aria-label={label}
        data-testid={testId}
      >
        <div
          className="lg-sheet__grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-hidden="true"
        >
          <span className="lg-sheet__handle" />
        </div>
        <div className="lg-sheet__content">{children}</div>
      </div>
    </>
  );
}

interface StatProps {
  value: ReactNode;
  label: string;
  icon?: IconName;
  style?: CSSProperties;
}

/** The small "3 carrying" box. */
export function StatChip({ value, label, icon = 'shield', style }: StatProps) {
  return (
    <div className="lg-statchip" style={style}>
      <Icon name={icon} size={18} className="lg-statchip__icon" />
      <div className="lg-statchip__copy">
        <span className="lg-statchip__value">{value}</span>
        <span className="lg-statchip__label">{label}</span>
      </div>
    </div>
  );
}

interface SheetHeaderProps {
  title: ReactNode;
  kicker?: ReactNode;
  status?: ReactNode;
  statusTone?: 'live' | 'ready' | 'cooldown' | 'warn' | 'neutral';
  onClose?: () => void;
  closeLabel?: string;
  titleId?: string;
}

export function SheetHeader({ title, kicker, status, statusTone = 'neutral', onClose, closeLabel, titleId }: SheetHeaderProps) {
  return (
    <div className="lg-sheethead">
      <div className="lg-sheethead__copy">
        <h2 className="lg-sheethead__title" id={titleId}>{title}</h2>
        {kicker && <div className="lg-sheethead__kicker">{kicker}</div>}
      </div>
      <div className="lg-sheethead__side">
        {status && <span className={cx('lg-pill', `lg-pill--${statusTone}`)}>{status}</span>}
        {onClose && (
          <button type="button" className="lg-iconbtn lg-iconbtn--small" onClick={onClose} aria-label={closeLabel}>
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

interface FactRowProps {
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'good' | 'bad';
}

export function FactRow({ label, value, tone = 'default' }: FactRowProps) {
  return (
    <div className={cx('lg-fact', tone !== 'default' && `lg-fact--${tone}`)}>
      <span className="lg-fact__label">{label}</span>
      <span className="lg-fact__value">{value}</span>
    </div>
  );
}
