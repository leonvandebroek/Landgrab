const fs = require('fs');
let file = fs.readFileSync('src/components/game/AbilityInfoSheet.tsx', 'utf8');
file = file.replace("import { GameIcon } from '../common/GameIcon';\n", "");
file = file.replace(/const ROLE_ACCENT_COLORS[\s\S]*?};\n\n/, "");
fs.writeFileSync('src/components/game/AbilityInfoSheet.tsx', file);
