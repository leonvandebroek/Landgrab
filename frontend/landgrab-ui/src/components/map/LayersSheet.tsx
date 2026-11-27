import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LAYER_GROUPS, type MapLayerPreferences } from '../../types/mapLayerPreferences';
import type { MapLookPreset } from './pdokLayers';
import { Icon } from '../ui/Icon';
import { Sheet, SheetHeader, SwitchRow, cx } from '../ui/kit';

const STYLE_SWATCHES: Record<MapLookPreset, string> = {
  normal: 'linear-gradient(135deg, #e8e1cf, #c9d6b8)',
  military: 'linear-gradient(135deg, #5d6b4f, #2f3a2a)',
  nightVision: 'linear-gradient(135deg, #2d6b3a, #0d2814)',
  blackWhite: 'linear-gradient(135deg, #d9d9d9, #4a4a4a)',
};

const LAYER_ORDER: Array<keyof MapLayerPreferences> = LAYER_GROUPS.flatMap((group) => group.layers);

interface Props {
  open: boolean;
  onClose: () => void;
  followMe: boolean;
  onFollowMeChange: (enabled: boolean) => void;
  canFollow: boolean;
  compassRotation: boolean;
  onCompassRotationChange: (enabled: boolean) => void;
  compassSupported: boolean;
  compassNeedsPermission: boolean;
  mapLook: MapLookPreset;
  mapLooks: MapLookPreset[];
  onMapLookChange: (look: MapLookPreset) => void;
  layerPrefs: MapLayerPreferences;
  onLayerPrefsChange: (prefs: MapLayerPreferences) => void;
}

/** Every map control in one labelled sheet. Nothing from the old six buttons is removed. */
export function LayersSheet({
  open,
  onClose,
  followMe,
  onFollowMeChange,
  canFollow,
  compassRotation,
  onCompassRotationChange,
  compassSupported,
  compassNeedsPermission,
  mapLook,
  mapLooks,
  onMapLookChange,
  layerPrefs,
  onLayerPrefsChange,
}: Props) {
  const { t } = useTranslation();
  const [legendOpen, setLegendOpen] = useState(false);

  return (
    <Sheet open={open} onClose={onClose} labelledBy="layers-sheet-title" testId="layers-sheet">
      <SheetHeader
        title={t('ui.layers.title')}
        titleId="layers-sheet-title"
        onClose={onClose}
        closeLabel={t('ui.common.done')}
      />

      <section className="lg-section">
        <h3 className="lg-section__title">{t('ui.layers.view')}</h3>
        <div className="lg-section__box">
          <SwitchRow
            label={t('ui.layers.followMe')}
            description={canFollow ? t('ui.layers.followMeHelp') : t('ui.layers.needLocation')}
            checked={followMe}
            onChange={onFollowMeChange}
            disabled={!canFollow}
            testId="layers-follow-me"
          />
          <SwitchRow
            label={t('ui.layers.compass')}
            description={!compassSupported
              ? t('ui.layers.compassUnsupported')
              : compassNeedsPermission
                ? t('ui.layers.compassPermission')
                : t('ui.layers.compassHelp')}
            checked={compassRotation}
            onChange={onCompassRotationChange}
            disabled={!compassSupported}
            testId="layers-compass"
          />
        </div>
      </section>

      <section className="lg-section">
        <h3 className="lg-section__title">{t('ui.layers.style')}</h3>
        <div className="lg-styles" role="radiogroup" aria-label={t('ui.layers.style')}>
          {mapLooks.map((look) => (
            <button
              key={look}
              type="button"
              role="radio"
              aria-checked={look === mapLook}
              className={cx('lg-style', look === mapLook && 'is-selected')}
              onClick={() => onMapLookChange(look)}
            >
              <span className="lg-style__swatch" style={{ background: STYLE_SWATCHES[look] }} aria-hidden="true" />
              {t(`ui.layers.looks.${look}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="lg-section">
        <button
          type="button"
          className="lg-listrow"
          aria-expanded={legendOpen}
          onClick={() => setLegendOpen((value) => !value)}
        >
          <Icon name="info" />
          <span className="lg-listrow__copy">
            <span className="lg-listrow__title">{t('ui.layers.legend')}</span>
            <span className="lg-listrow__sub">{t('ui.layers.legendHelp')}</span>
          </span>
          <Icon name={legendOpen ? 'chevronDown' : 'chevronRight'} size={20} className="lg-listrow__chev" />
        </button>
        {legendOpen && (
          <div className="lg-section__box">
            <div className="lg-legend">
              <LegendRow swatch={{ background: 'rgba(255, 122, 26, 0.55)', border: '2px solid #FF7A1A' }} label={t('ui.layers.legendTeam')} />
              <LegendRow swatch={{ background: 'rgba(47, 107, 255, 0.55)', border: '2px solid #2F6BFF' }} label={t('ui.layers.legendEnemy')} />
              <LegendRow swatch={{ background: 'rgba(244, 241, 234, 0.25)', border: '2px solid rgba(244, 241, 234, 0.6)' }} label={t('ui.layers.legendFree')} />
              <LegendRow swatch={{ background: 'transparent', border: '3px solid #C6F24E' }} label={t('ui.layers.legendYou')} />
              <LegendRow swatch={{ background: 'repeating-linear-gradient(45deg, #FF7A1A 0 4px, #2F6BFF 4px 8px)' }} label={t('ui.layers.legendContested')} />
              <LegendRow swatch={{ background: '#2b3740', border: '2px dashed #a9b4bc' }} label={t('ui.layers.legendFog')} />
              <LegendRow swatch={{ background: '#f4f1ea', borderRadius: 11 }} label={t('ui.layers.legendTroops')} />
            </div>
          </div>
        )}
      </section>

      <section className="lg-section">
        <h3 className="lg-section__title">{t('ui.layers.show')}</h3>
        <div className="lg-section__box">
          {LAYER_ORDER.map((key) => (
            <SwitchRow
              key={key}
              label={t(`ui.layers.toggles.${key}`)}
              checked={layerPrefs[key]}
              onChange={(checked) => onLayerPrefsChange({ ...layerPrefs, [key]: checked })}
            />
          ))}
        </div>
      </section>
    </Sheet>
  );
}

function LegendRow({ swatch, label }: { swatch: React.CSSProperties; label: string }) {
  return (
    <div className="lg-legend__row">
      <span className="lg-legend__swatch" style={swatch} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
