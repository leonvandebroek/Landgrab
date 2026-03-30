import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './TutorialOverlay.css';

interface TutorialOverlayProps {
  onComplete: () => void;
  forceShow?: boolean;
}

const STEPS = [
  { icon: '📍', titleKey: 'game.tutorial.step1Title', descKey: 'game.tutorial.step1Desc' },
  { icon: '🏴', titleKey: 'game.tutorial.step2Title', descKey: 'game.tutorial.step2Desc' },
  { icon: '⚔️', titleKey: 'game.tutorial.step3Title', descKey: 'game.tutorial.step3Desc' },
  { icon: '💥', titleKey: 'game.tutorial.step4Title', descKey: 'game.tutorial.step4Desc' }
];

export function TutorialOverlay({ onComplete, forceShow }: TutorialOverlayProps) {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const isCompleted = localStorage.getItem('landgrab-tutorial-completed') === 'true';
    if (!isCompleted || forceShow) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, forceShow ? 50 : 1000);
      return () => clearTimeout(timer);
    }
  }, [forceShow]);

  const handleComplete = useCallback(() => {
    localStorage.setItem('landgrab-tutorial-completed', 'true');
    setIsVisible(false);
    onComplete();
  }, [onComplete]);

  const handleNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, handleComplete]);

  // Auto-advance
  useEffect(() => {
    if (!isVisible) return;
    const timer = setTimeout(() => {
      handleNext();
    }, 15000);
    return () => clearTimeout(timer);
  }, [isVisible, currentStep, handleNext]);

  if (!isVisible) return null;

  const currentInfo = STEPS[currentStep];

  return (
    <div className="tutorial-overlay" data-testid="tutorial-overlay">
      <div key={currentStep} className="tutorial-card">
        <div className="tutorial-icon" aria-hidden="true">{currentInfo.icon}</div>
        <h2 className="tutorial-title">{t(currentInfo.titleKey as never)}</h2>
        <p className="tutorial-desc">{t(currentInfo.descKey as never)}</p>
        
        <div className="tutorial-dots">
          {STEPS.map((_, idx) => (
            <span key={idx} className={`tutorial-dot ${idx === currentStep ? 'active' : ''}`} />
          ))}
        </div>

        <button className="tutorial-primary-btn" onClick={handleNext}>
          {currentStep === STEPS.length - 1 ? t('game.tutorial.letsGo' as never) : t('game.tutorial.gotIt' as never)}
        </button>
        
        <button className="tutorial-skip-btn" onClick={handleComplete}>
          {t('game.tutorial.skip' as never)}
        </button>
      </div>
    </div>
  );
}
