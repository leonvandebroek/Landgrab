const fs = require('fs');

let css = fs.readFileSync('frontend/landgrab-ui/src/components/game/CombatUI.module.css', 'utf8');

css = css.replace('.primaryButton {\n    background: rgba(255, 69, 0, 0.1);\n    color: #FF4500;\n    border: 1px solid rgba(255, 69, 0, 0.5);\n}', `.primaryButton {
    background: rgba(255, 69, 0, 0.1);
    color: #FF4500;
    border: 1px solid rgba(255, 69, 0, 0.5);
    letter-spacing: 0.12em;
    font-family: 'Courier New', monospace;
    box-shadow: inset 0 0 12px rgba(0,0,0,0.5), 0 0 8px rgba(220, 60, 40, 0.3);
    border-radius: 2px;
    text-transform: uppercase;
}`);

fs.writeFileSync('frontend/landgrab-ui/src/components/game/CombatUI.module.css', css);
