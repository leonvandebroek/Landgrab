import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SEVERITY_PRIORITY, useInfoLedgeStore } from '../../stores/infoLedgeStore';
import type { LedgeItem, LedgeSeverity } from '../../stores/infoLedgeStore';
import { GameIcon } from '../common/GameIcon';
import '../../styles/info-ledge.css';

// Using a slightly extracted mapping function to isolate logic
function getSeverityClass(severity: LedgeSeverity): string {
    return `info-ledge__dot--${severity}`;
}

export function InfoLedge() {
    const { t } = useTranslation();

    const items = useInfoLedgeStore((state) => state.items);
    const expanded = useInfoLedgeStore((state) => state.expanded);
    const toggleExpanded = useInfoLedgeStore((state) => state.toggleExpanded);
    const setExpanded = useInfoLedgeStore((state) => state.setExpanded);
    const dismiss = useInfoLedgeStore((state) => state.dismiss);

    const sortedItems = useMemo<LedgeItem[]>(() => {
        return [...items].sort((left, right) => {
            const severityPriority = SEVERITY_PRIORITY[left.severity] - SEVERITY_PRIORITY[right.severity];
            if (severityPriority !== 0) {
                return severityPriority;
            }

            return left.createdAt - right.createdAt;
        });
    }, [items]);

    const activeItem = sortedItems[0];
    const badgeAnimationKey = useMemo(() => sortedItems.map((item) => item.id).join(':'), [sortedItems]);

    const isEmpty = sortedItems.length === 0;
    const moreCount = sortedItems.length > 1 ? sortedItems.length - 1 : 0;

    // Keep rendering the container even if empty to allow max-height transitions to collapse smoothly.
    let containerClasses = 'info-ledge';
    if (!isEmpty) {
        containerClasses += ' info-ledge--visible';
        if (expanded) {
            containerClasses += ' info-ledge--expanded';
        }
    }

    return (
        <div className={containerClasses} role="status" aria-live="polite">
            {!isEmpty && activeItem && !expanded && (
                <div
                    className="info-ledge__collapsed"
                    onClick={toggleExpanded}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleExpanded();
                        }
                    }}
                >
                    <div className={`info-ledge__dot ${getSeverityClass(activeItem.severity)}`} aria-hidden="true" />

                    {activeItem.icon && (
                        <div className="info-ledge__icon" aria-hidden="true">
                            <GameIcon name={activeItem.icon} />
                        </div>
                    )}

                    <div className="info-ledge__message">
                        {activeItem.message}
                    </div>

                    {moreCount > 0 && (
                        <div key={badgeAnimationKey} className="info-ledge__badge info-ledge__badge--pulse">
                            {t('infoLedge.moreCount', { count: moreCount, defaultValue: `+${moreCount}` })}
                        </div>
                    )}

                    <div className="info-ledge__chevron">
                        ▼
                    </div>
                </div>
            )}

            {!isEmpty && expanded && (
                <>
                    <div
                        className="info-ledge__collapsed"
                        onClick={() => setExpanded(false)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setExpanded(false);
                            }
                        }}
                    >
                        <div className="info-ledge__message info-ledge__message--muted">
                            Notifications
                        </div>
                        <div className="info-ledge__chevron info-ledge__chevron--expanded">
                            ▼
                        </div>
                    </div>

                    <div className="info-ledge__list">
                        {sortedItems.map((item) => (
                            <div key={item.id} className="info-ledge__item">
                                <div className="info-ledge__item-dot-wrap">
                                    <div className={`info-ledge__dot ${getSeverityClass(item.severity)}`} aria-hidden="true" />
                                </div>

                                {item.icon && (
                                    <div className="info-ledge__item-icon" aria-hidden="true">
                                        <GameIcon name={item.icon} />
                                    </div>
                                )}

                                <div className="info-ledge__item-message">
                                    {item.message}
                                </div>

                                <button
                                    className="info-ledge__dismiss"
                                    onClick={() => dismiss(item.id)}
                                    aria-label={t('common.dismiss', { defaultValue: 'Dismiss' })}
                                    title={t('common.dismiss', { defaultValue: 'Dismiss' })}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
