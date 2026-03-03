/**
 * OD-11 remote: Nuimo controller + speaker integration.
 *
 * - Volume mode: rotate = volume, button = battery.
 * - Symbol exploration mode: rotate = cycle built-in symbols, button = back to volume.
 *   Toggle: long press (hold 1s) to switch modes.
 */

const nuimo = require('./nuimo');
const speaker = require('./speaker');

nuimo.initialiseNuimo();
speaker.initialiseSpeaker();

let surrogateVolume = 0;
let surrogateMax = 100;
let volumeInitialised = false;
let ledReady = false;

/** Volume mode (default) vs symbol exploration mode */
let symbolExplorationMode = false;

/** Volume change step per Nuimo rotation tick */
const VOLUME_STEP = 1;

/** Symbol index range for exploration (0–SYMBOL_MAX) */
const SYMBOL_MAX = 99;
let symbolIndex = 0;

/** Long-press threshold (ms) to toggle symbol mode */
const LONG_PRESS_MS = 1000;
let pressTimer = null;

// Keep surrogate in sync with speaker
speaker.speakerEmitter.on('volumeChange', ({ vol, max }) => {
    if (!volumeInitialised) {
        volumeInitialised = true;
        console.log('Volume initialised from speaker:', vol, '/', max);
    }
    surrogateVolume = vol;
    surrogateMax = max;
    updateDisplay();
});

// Nuimo rotation
nuimo.emitter.on('rotate', (direction) => {
    if (symbolExplorationMode) {
        symbolIndex = Math.max(0, Math.min(SYMBOL_MAX, symbolIndex + direction));
        console.log('Symbol index:', symbolIndex);
        if (ledReady) nuimo.setBuiltinSymbol(symbolIndex);
    } else {
        surrogateVolume = Math.max(0, Math.min(surrogateMax, surrogateVolume + direction * VOLUME_STEP));
        console.log('Volume:', surrogateVolume, '/', surrogateMax);
        updateDisplay();
        speaker.changeVolume(direction * VOLUME_STEP);
    }
});

function updateDisplay() {
    if (!ledReady || !volumeInitialised || symbolExplorationMode) return;
    const displayValue = Math.min(99, Math.round(surrogateVolume));
    nuimo.setVolumeNumber(displayValue);
}

nuimo.emitter.on('ledReady', () => {
    ledReady = true;
    console.log('Nuimo LED ready');
    updateDisplay();
});

// Button: short press = battery (volume mode) or exit symbol mode; long press = toggle mode
nuimo.emitter.on('press', () => {
    pressTimer = setTimeout(() => {
        pressTimer = null;
        symbolExplorationMode = !symbolExplorationMode;
        console.log(symbolExplorationMode ? 'Symbol exploration mode ON' : 'Symbol exploration mode OFF');
        if (symbolExplorationMode && ledReady) {
            nuimo.setBuiltinSymbol(symbolIndex);
        } else {
            updateDisplay();
        }
    }, LONG_PRESS_MS);
});

nuimo.emitter.on('release', () => {
    if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
        if (!symbolExplorationMode) {
            const battery = nuimo.getBatteryLevel();
            if (battery != null && ledReady) {
                console.log('Battery:', battery, '%');
                nuimo.setVolumeNumber(Math.min(99, battery));
            }
        } else {
            symbolExplorationMode = false;
            console.log('Symbol exploration mode OFF (short release)');
            updateDisplay();
        }
    }
});
