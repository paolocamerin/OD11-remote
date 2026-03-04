/**
 * Application configuration.
 * Speaker IP: use --ip=192.168.0.101 when running, or create config.local.js (gitignored).
 */
function getSpeakerIp() {
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--ip' && args[i + 1]) return args[i + 1];
        if (args[i].startsWith('--ip=')) return args[i].slice(5);
    }
    try {
        const local = require('./config.local');
        if (local && local.speakerIp) return local.speakerIp;
    } catch (_) {}
    return null;
}

const speakerIp = getSpeakerIp();
if (!speakerIp) {
    console.error('Usage: node index.js --ip=192.168.0.101');
    console.error('   or: create config.local.js with module.exports = { speakerIp: "192.168.0.101" }');
    process.exit(1);
}

module.exports = { speakerIp };
