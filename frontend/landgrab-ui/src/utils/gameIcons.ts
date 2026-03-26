import contestedSvgRaw from '../assets/game-icons/svg/lorc/crossed-swords.svg?raw';
import hqSvgRaw from '../assets/game-icons/svg/delapouite/greek-temple.svg?raw';
import fortSvgRaw from '../assets/game-icons/svg/delapouite/castle.svg?raw';
import masterSvgRaw from '../assets/game-icons/svg/lorc/capitol.svg?raw';
import shieldWallSvgRaw from '../assets/game-icons/svg/delapouite/roman-shield.svg?raw';
import crownSvgRaw from '../assets/game-icons/svg/lorc/crown.svg?raw';
import trophySvgRaw from '../assets/game-icons/svg/delapouite/trophy-cup.svg?raw';
import treasureMapSvgRaw from '../assets/game-icons/svg/lorc/treasure-map.svg?raw';
import pinSvgRaw from '../assets/game-icons/svg/delapouite/pin.svg?raw';
import lightningSvgRaw from '../assets/game-icons/svg/sbed/electric.svg?raw';
import compassSvgRaw from '../assets/game-icons/svg/lorc/compass.svg?raw';
import rocketSvgRaw from '../assets/game-icons/svg/lorc/firework-rocket.svg?raw';
import hourglassSvgRaw from '../assets/game-icons/svg/lorc/hourglass.svg?raw';
import stopwatchSvgRaw from '../assets/game-icons/svg/skoll/stopwatch.svg?raw';
import shieldSvgRaw from '../assets/game-icons/svg/sbed/shield.svg?raw';
import helmetSvgRaw from '../assets/game-icons/svg/sbed/helmet.svg?raw';
import wrenchSvgRaw from '../assets/game-icons/svg/sbed/wrench.svg?raw';
import flagSvgRaw from '../assets/game-icons/svg/delapouite/golf-flag.svg?raw';
import radioTowerSvgRaw from '../assets/game-icons/svg/delapouite/radio-tower.svg?raw';
import wavesSvgRaw from '../assets/game-icons/svg/lorc/waves.svg?raw';
import forestSvgRaw from '../assets/game-icons/svg/delapouite/forest.svg?raw';
import hillsSvgRaw from '../assets/game-icons/svg/delapouite/hills.svg?raw';
import mountainSvgRaw from '../assets/game-icons/svg/lorc/mountaintop.svg?raw';
import houseSvgRaw from '../assets/game-icons/svg/delapouite/house.svg?raw';
import roadSvgRaw from '../assets/game-icons/svg/delapouite/road.svg?raw';
import trailSvgRaw from '../assets/game-icons/svg/delapouite/trail.svg?raw';
import fogSvgRaw from '../assets/game-icons/svg/delapouite/fog.svg?raw';
import chestSvgRaw from '../assets/game-icons/svg/delapouite/chest.svg?raw';
import theaterSvgRaw from '../assets/game-icons/svg/delapouite/theater.svg?raw';
import fistSvgRaw from '../assets/game-icons/svg/lorc/fist.svg?raw';
import crossbowSvgRaw from '../assets/game-icons/svg/carl-olsen/crossbow.svg?raw';
import rallyTroopsSvgRaw from '../assets/game-icons/svg/lorc/rally-the-troops.svg?raw';
import barricadeSvgRaw from '../assets/game-icons/svg/delapouite/barricade.svg?raw';
import gearHammerSvgRaw from '../assets/game-icons/svg/lorc/gear-hammer.svg?raw';
import hammerDropSvgRaw from '../assets/game-icons/svg/lorc/hammer-drop.svg?raw';
import pineTreeSvgRaw from '../assets/game-icons/svg/lorc/pine-tree.svg?raw';
import shinyEntranceSvgRaw from '../assets/game-icons/svg/lorc/shiny-entrance.svg?raw';
import returnArrowSvgRaw from '../assets/game-icons/svg/lorc/return-arrow.svg?raw';
import priceTagSvgRaw from '../assets/game-icons/svg/delapouite/price-tag.svg?raw';
import archeryTargetSvgRaw from '../assets/game-icons/svg/lorc/archery-target.svg?raw';
import bicepsSvgRaw from '../assets/game-icons/svg/delapouite/biceps.svg?raw';

type GameIconSizeClass = 'sm' | 'lg';

function prepareSvg(svg: string): string {
    const normalizedFill = svg
        .replace(/fill=(['"])#fff\1/gi, 'fill="currentColor"')
        .replace(/fill=(['"])#000\1/gi, 'fill="currentColor"')
        .replace(/fill=(['"])white\1/gi, 'fill="currentColor"')
        .replace(/fill=(['"])black\1/gi, 'fill="currentColor"');

    return normalizedFill.replace(/<svg\b([^>]*)>/i, (_match, attributes: string) => {
        const cleanedAttributes = attributes
            .replace(/\swidth=(['"]).*?\1/gi, '')
            .replace(/\sheight=(['"]).*?\1/gi, '');

        return `<svg${cleanedAttributes} width="1em" height="1em">`;
    });
}

export const gameIcons = {
    fort: prepareSvg(fortSvgRaw),
    hq: prepareSvg(hqSvgRaw),
    master: prepareSvg(masterSvgRaw),
    contested: prepareSvg(contestedSvgRaw),
    shieldWall: prepareSvg(shieldWallSvgRaw),
    crown: prepareSvg(crownSvgRaw),
    trophy: prepareSvg(trophySvgRaw),
    treasureMap: prepareSvg(treasureMapSvgRaw),
    pin: prepareSvg(pinSvgRaw),
    lightning: prepareSvg(lightningSvgRaw),
    compass: prepareSvg(compassSvgRaw),
    rocket: prepareSvg(rocketSvgRaw),
    hourglass: prepareSvg(hourglassSvgRaw),
    stopwatch: prepareSvg(stopwatchSvgRaw),
    shield: prepareSvg(shieldSvgRaw),
    helmet: prepareSvg(helmetSvgRaw),
    wrench: prepareSvg(wrenchSvgRaw),
    flag: prepareSvg(flagSvgRaw),
    radioTower: prepareSvg(radioTowerSvgRaw),
    waves: prepareSvg(wavesSvgRaw),
    forest: prepareSvg(forestSvgRaw),
    hills: prepareSvg(hillsSvgRaw),
    mountain: prepareSvg(mountainSvgRaw),
    house: prepareSvg(houseSvgRaw),
    road: prepareSvg(roadSvgRaw),
    trail: prepareSvg(trailSvgRaw),
    fog: prepareSvg(fogSvgRaw),
    chest: prepareSvg(chestSvgRaw),
    theater: prepareSvg(theaterSvgRaw),
    fist: prepareSvg(fistSvgRaw),
    crossbow: prepareSvg(crossbowSvgRaw),
    rallyTroops: prepareSvg(rallyTroopsSvgRaw),
    barricade: prepareSvg(barricadeSvgRaw),
    gearHammer: prepareSvg(gearHammerSvgRaw),
    hammerDrop: prepareSvg(hammerDropSvgRaw),
    pineTree: prepareSvg(pineTreeSvgRaw),
    shinyEntrance: prepareSvg(shinyEntranceSvgRaw),
    returnArrow: prepareSvg(returnArrowSvgRaw),
    priceTag: prepareSvg(priceTagSvgRaw),
    archeryTarget: prepareSvg(archeryTargetSvgRaw),
    biceps: prepareSvg(bicepsSvgRaw),
} as const;

export type GameIconName = keyof typeof gameIcons;

export function iconHtml(key: keyof typeof gameIcons, sizeClass?: GameIconSizeClass): string {
    const sizeModifier = sizeClass ? ` hex-game-icon--${sizeClass}` : '';
    return `<div class="hex-game-icon${sizeModifier}" aria-hidden="true">${gameIcons[key]}</div>`;
}