/**
 * Application configuration.
 * Speaker IP: use --ip=192.168.0.101 when running, or create config.local.js (gitignored).
 * Battery logging: use --battery-log to enable writing battery readings to battery.log.
 */
const args = process.argv.slice(2);

function getArg(name) {
    for (let i = 0; i < args.length; i++) {
        if (args[i] === name && args[i + 1]) return args[i + 1];
        if (args[i].startsWith(name + '=')) return args[i].slice(name.length + 1);
    }
    return null;
}

function hasFlag(name) {
    return args.includes(name);
}

function getSpeakerIp() {
    const ip = getArg('--ip');
    if (ip) return ip;
    try {
        const local = require('./config.local');
        if (local && local.speakerIp) return local.speakerIp;
    } catch (_) {}
    return null;
}

const speakerIp = getSpeakerIp();
if (!speakerIp) {
    console.error('Usage: node index.js --ip=192.168.0.101 [--battery-log]');
    console.error('   or: create config.local.js with module.exports = { speakerIp: "192.168.0.101" }');
    process.exit(1);
}

const batteryLog = hasFlag('--battery-log');
const debug = hasFlag('--debug');
const atvName = getArg('--atv-name');

const KNOWN_ARGS = ['--ip', '--battery-log', '--debug', '--atv-name'];
for (const arg of args) {
    const argName = arg.startsWith('--') ? arg.split('=')[0] : null;
    if (argName && !KNOWN_ARGS.includes(argName)) {
        console.warn('Warning: unrecognised argument "' + arg + '". Known arguments: ' + KNOWN_ARGS.join(', ') + '. Continuing without it.');
    }
}

module.exports = { speakerIp, batteryLog, debug, atvName };
