/**
 * Nuimo controller BLE client.
 * Discovers and connects to a Nuimo, subscribes to rotation/button events,
 * and provides setVolumeBar() / setVolumeNumber() for the 9×9 LED matrix.
 *
 * LED matrix format (per Senic): 11 bytes (81 LEDs, row-major) + brightness + timeout.
 * 11th byte: bit 0 = 81st LED, bit 4 = onion skinning (smooth transitions).
 */

const noble = require('@abandonware/noble');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

const emitter = new EventEmitter();
let ledCharacteristic = null;
let batteryLevel = null;

// --- LED matrix encoding ---

/**
 * Convert an 81-element array (0/1) to 11-byte buffer.
 * Layout: row-major, 8 bits per byte, LSB-first per byte (nuimojs bit order).
 */
function matrixArrayToBuffer(arr) {
    const buf = Buffer.alloc(11);
    for (let i = 0; i < 11; i++) {
        const bits = arr.slice(i * 8, i * 8 + 8).reverse().join('');
        buf[i] = parseInt(bits || '0', 2);
    }
    return buf;
}

/**
 * Write a matrix pattern to the Nuimo LED characteristic.
 * @param {object} ch - BLE characteristic
 * @param {number[]} matrixArray - 81 elements, 0 or 1
 * @param {number} brightness - 0–255
 * @param {number} timeoutMs - Display duration in ms (max 25500)
 */
async function writeMatrix(ch, matrixArray, brightness = 0xff, timeoutMs = 25500) {
    const buf = Buffer.alloc(13);
    matrixArrayToBuffer(matrixArray).copy(buf);

    // 11th byte: bit 0 = 81st LED, bit 4 = onion skinning. Bit 5 = BUILTIN_MATRIX (keep clear).
    buf[10] = (buf[10] & 0x0f) | 0x10;

    buf[11] = brightness;
    buf[12] = Math.min(255, Math.floor(timeoutMs / 100));

    await ch.writeAsync(buf, true);
}

/**
 * Load glyphs from glyphs.json and render a number (0–99) to an 81-element matrix.
 * Layout: 2 digits side-by-side, centered vertically. Each digit from glyphs (width×height).
 */
function numberToMatrix(value, glyphsPath = path.join(__dirname, 'glyphs.json')) {
    const arr = new Array(81).fill(0);
    const glyphs = JSON.parse(fs.readFileSync(glyphsPath, 'utf8'));
    const { width, height, gap } = glyphs;
    const digitWidth = width + gap;
    const totalWidth = digitWidth * 2 - gap;
    const offsetX = Math.floor((9 - totalWidth) / 2);
    const offsetY = Math.floor((9 - height) / 2);

    const num = Math.max(0, Math.min(99, Math.round(value)));
    const d1 = Math.floor(num / 10);
    const d2 = num % 10;

    for (let row = 0; row < height; row++) {
        const rowStr1 = glyphs.glyphs[String(d1)][row] || '';
        const rowStr2 = glyphs.glyphs[String(d2)][row] || '';
        for (let c = 0; c < width; c++) {
            if (rowStr1[c] === '1') arr[(offsetY + row) * 9 + (offsetX + c)] = 1;
            if (rowStr2[c] === '1') arr[(offsetY + row) * 9 + (offsetX + digitWidth + c)] = 1;
        }
    }
    return arr;
}

/**
 * Build an 81-element array for a full-width horizontal volume bar.
 * Fills rows from bottom up. normalized0to1 in [0, 1].
 */
function volumeBarMatrix(normalized0to1) {
    const arr = new Array(81).fill(0);
    const rows = 9;
    const cols = 9;
    const filledRows = Math.min(rows, Math.round(normalized0to1 * rows));
    for (let r = rows - 1; r >= rows - filledRows; r--) {
        for (let c = 0; c < cols; c++) {
            arr[r * cols + c] = 1;
        }
    }
    return arr;
}

// --- BLE discovery and connection ---

const LED_MATRIX_SERVICE_UUID = 'f29b1523cb1940f3be5c7241ecb82fd1';
const LED_MATRIX_CHAR_UUID = 'f29b1524cb1940f3be5c7241ecb82fd1';

const NUIMO_INPUT_UUIDS = [
    'f29b1529cb1940f3be5c7241ecb82fd2',  // button
    'f29b1526cb1940f3be5c7241ecb82fd2',  // fly
    'f29b1527cb1940f3be5c7241ecb82fd2',  // swipe
    'f29b1528cb1940f3be5c7241ecb82fd2',  // rotation
    'f29b152bcb1940f3be5c7241ecb82fd2'   // touch
];

function normaliseUuid(uuid) {
    return String(uuid).replace(/-/g, '').toLowerCase();
}

async function initialiseNuimo() {
    noble.on('stateChange', function (state) {
        if (state === 'poweredOn') {
            start();
            console.log('Bluetooth:', state);
        }
    });

    noble.on('discover', function (discovered) {
        if (discovered.advertisement.localName === 'Nuimo') {
            console.log('Nuimo found:', discovered.id);
            noble.stopScanning();
            connect(discovered);
        }
    });

    async function start() {
        await noble.startScanningAsync();
        console.log('Scanning for Nuimo...');
    }

    async function connect(device) {
        await device.connectAsync();
        const services = await device.discoverServicesAsync();

        for (const service of services) {
            const serviceUuid = normaliseUuid(service.uuid);
            const characteristics = await service.discoverCharacteristicsAsync();

            for (const ch of characteristics) {
                const uuid = normaliseUuid(ch.uuid);

                // Battery level
                if (uuid === '2a19') {
                    const battery = await ch.readAsync();
                    batteryLevel = battery[0];
                    console.log('Battery:', batteryLevel, '%');
                    continue;
                }

                // LED matrix characteristic (write)
                if (uuid === LED_MATRIX_CHAR_UUID ||
                    (serviceUuid === LED_MATRIX_SERVICE_UUID && ch.properties.includes('write'))) {
                    ledCharacteristic = ch;
                    emitter.emit('ledReady');
                    continue;
                }

                // Input characteristics (button, rotation, etc.) – subscribe to notifications
                if (NUIMO_INPUT_UUIDS.includes(uuid) && ch.properties.includes('notify')) {
                    try {
                        await ch.subscribeAsync();
                    } catch (e) {
                        console.log('Subscribe error:', e.message);
                        continue;
                    }
                    ch.on('data', function (data) {
                        if (data.length === 1) {
                            const evt = data[0] === 1 ? 'press' : 'release';
                            emitter.emit(evt);
                            console.log(evt === 'press' ? 'Button pressed' : 'Button released');
                        } else {
                            const direction = data.readInt16LE(0) > 0 ? 1 : -1;
                            emitter.emit('rotate', direction);
                        }
                    });
                }
            }
        }
    }
}

// --- Public API ---

const MATRIX_TIMEOUT_MS = 1000;

/**
 * Draw a volume bar on the Nuimo matrix.
 * @param {number} normalized0to1 - Volume 0–1 (0 = empty, 1 = full)
 */
async function setVolumeBar(normalized0to1) {
    if (!ledCharacteristic) return;
    const n = Math.max(0, Math.min(1, normalized0to1));
    const arr = volumeBarMatrix(n);
    await writeMatrix(ledCharacteristic, arr, 0xff, MATRIX_TIMEOUT_MS);
}

/**
 * Draw a number (00–99) on the Nuimo matrix using glyphs from glyphs.json.
 * @param {number} value - 0–99
 */
async function setVolumeNumber(value) {
    if (!ledCharacteristic) return;
    const arr = numberToMatrix(value);
    await writeMatrix(ledCharacteristic, arr, 0xff, MATRIX_TIMEOUT_MS);
}

/**
 * Get last known battery level (0–100), or null if not yet read.
 */
function getBatteryLevel() {
    return batteryLevel;
}

/**
 * Show a built-in symbol by index (exploration mode).
 * Payload format is undocumented; we try buf[0]=index as a guess.
 * Logs each send to symbol-log.txt for mapping payload → observed symbol.
 * @param {number} index - 0–255
 */
async function setBuiltinSymbol(index) {
    if (!ledCharacteristic) return;
    const buf = Buffer.alloc(13);
    buf[0] = Math.max(0, Math.min(255, Math.round(index)));
    buf[10] = 0x30;  // onion skinning + BUILTIN_MATRIX
    buf[11] = 0xff;
    buf[12] = 20;  // 2s
    await ledCharacteristic.writeAsync(buf, true);

    const line = `${index}\t${buf.toString('hex')}\t${new Date().toISOString()}\t\n`;
    fs.appendFileSync(path.join(__dirname, 'symbol-log.txt'), line);
}

module.exports = { initialiseNuimo, emitter, setVolumeBar, setVolumeNumber, getBatteryLevel, setBuiltinSymbol };
