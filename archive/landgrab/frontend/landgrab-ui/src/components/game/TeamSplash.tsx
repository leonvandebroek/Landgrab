import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./TeamSplash.css";

interface TeamSplashProps {
  allianceName: string;
  allianceColor: string;
  roleName?: string;
  onDismiss: () => void;
}

export function TeamSplash({ allianceName, allianceColor, roleName, onDismiss }: TeamSplashProps) {
  const { t } = useTranslation();
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const exitTimer = setTimeout(() => {
      setExiting(true);
    }, 3400);

    const removeTimer = setTimeout(() => {
      onDismiss();
    }, 4000);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [onDismiss]);

  const handleDismiss = () => {
    if (exiting) return;
    setExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 600);
  };

  return (
    <div
      className={`team-splash ${exiting ? "team-splash--exiting" : ""}`}
      style={{
        "--alliance-color": allianceColor,
      } as React.CSSProperties}
      onClick={handleDismiss}
    >
      <div className="team-splash-content">
        <h1 className="team-splash-title">{t("game.teamSplash.title")}</h1>
        <h2 className="team-splash-alliance">{allianceName}</h2>
        {roleName && <p className="team-splash-role">{roleName}</p>}
        <p className="team-splash-subtitle">{t("game.teamSplash.subtitle")}</p>
      </div>
    </div>
  );
}
