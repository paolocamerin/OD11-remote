#!/usr/bin/env node
/**
 * Automated symbol exploration: cycles through built-in symbol indices 99–255,
 * logs each to symbol-log.txt. Press 'q' + Enter to quit.
 *
 * Usage: node explore-symbols.js
 * Requires: Nuimo powered on and in range.
 */

const nuimo = require('./nuimo');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const LOG_FILE = path.join(__dirname, 'symbol-log.txt');
const CYCLE_INTERVAL_MS = 800;
const MAX_INDEX = 255;
const START_INDEX = 99;

let index = START_INDEX;
let cycleTimer = null;
let ledReady = false;

// Write header if log is new
if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, 'index\tpayload_hex\ttimestamp\tobserved\n');
}

async function showNext() {
    if (!ledReady) return;
    index = index % (MAX_INDEX + 1);
    await nuimo.setBuiltinSymbol(index);
    console.log(`Symbol #${index}`);
    index++;
}

function startCycle() {
    if (cycleTimer) clearInterval(cycleTimer);
    cycleTimer = setInterval(showNext, CYCLE_INTERVAL_MS);
    showNext();
}

function stopCycle() {
    if (cycleTimer) {
        clearInterval(cycleTimer);
        cycleTimer = null;
    }
}

nuimo.initialiseNuimo();

nuimo.emitter.on('ledReady', async () => {
    ledReady = true;
    console.log('Nuimo ready. Auto-cycling symbols...');
    startCycle();
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.on('line', (line) => {
    if (line.trim().toLowerCase() === 'q' || line.trim().toLowerCase() === 'quit') {
        stopCycle();
        console.log('Done.');
        process.exit(0);
    }
});

process.on('SIGINT', () => {
    stopCycle();
    process.exit(0);
});
