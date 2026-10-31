import { useState, useEffect } from 'react';

interface Props {
  dice: number[];
  rolling?: boolean;
  label?: string;
}

const FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function DiceRoller({ dice, rolling = false, label }: Props) {
  const [display, setDisplay] = useState(dice);

  useEffect(() => {
    if (!rolling) { setDisplay(dice); return; }
    let count = 0;
    const id = setInterval(() => {
      setDisplay(dice.map(() => Math.ceil(Math.random() * 6)));
      count++;
      if (count > 10) clearInterval(id);
    }, 80);
    return () => clearInterval(id);
  }, [rolling, dice]);

  return (
    <div className="dice-roller">
      {label && <span className="dice-label">{label}</span>}
      <div className="dice-faces">
        {display.map((d, i) => (
          <span key={i} className={`die ${rolling ? 'rolling' : ''}`}>
            {FACES[d - 1] ?? '⚀'}
          </span>
        ))}
      </div>
      {dice.length > 0 && !rolling && (
        <span className="dice-total">= {dice.reduce((a, b) => a + b, 0)}</span>
      )}
    </div>
  );
}
