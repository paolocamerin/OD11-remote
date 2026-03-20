/**
 * Play/pause action probe.
 * Connects to the speaker, joins the group, then sends one candidate action
 * every 3 seconds and logs whatever the speaker sends back.
 *
 * Run: node test-playpause.js --ip=192.168.0.101
 *
 * Watch for any response line that looks like playback_state_changed,
 * or any other change — that tells you which action worked.
 */

const ws = require('ws');
const config = require('./config');

const CANDIDATES = [
    { action: 'playback_stop' },   // from Orthoplay Swift SDK (most likely)
    { action: 'playback_start' },  // from Orthoplay Swift SDK
    { action: 'group_play' },
    { action: 'group_pause' },
    { action: 'group_set_playing', playing: false },
    { action: 'group_toggle_play_pause' },
    { action: 'group_stop' },
    { action: 'playback_pause' },
    { action: 'playback_toggle' },
];

const socket = new ws.WebSocket(`ws://${config.speakerIp}/ws`);
const uid = 'uid-probe-' + Math.floor(1e8 * Math.random());
let step = 0;

socket.on('open', () => {
    console.log('Connected. Joining group...');
    socket.send(JSON.stringify({ protocol_major_version: 0, protocol_minor_version: 4, action: 'global_join' }));
    socket.send(JSON.stringify({ color_index: 0, name: 'od11-probe', realtime_data: false, uid, action: 'group_join' }));

    // Give the speaker 1s to send its initial state, then start probing
    setTimeout(probe, 1000);
});

function probe() {
    if (step >= CANDIDATES.length) {
        console.log('\nAll candidates tried. Press Ctrl+C.');
        return;
    }
    const payload = CANDIDATES[step++];
    console.log('\n--- Sending:', JSON.stringify(payload));
    socket.send(JSON.stringify(payload));
    setTimeout(probe, 3000);
}

socket.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (_) { return; }

    // Only log non-realtime, non-pong messages so output is readable
    const items = Array.isArray(msg) ? msg : [msg];
    for (const item of items) {
        if (!item) continue;
        const u = item.update || item.response;
        if (!u || u === 'realtime' || u === 'speaker_pong') continue;
        console.log('  <<', JSON.stringify(item));
    }
    // Also catch state arrays
    if (!Array.isArray(msg) && Array.isArray(msg.state)) {
        for (const s of msg.state) {
            if (s && s.update && s.update !== 'realtime') {
                console.log('  << (state)', JSON.stringify(s));
            }
        }
    }
});

socket.on('error', (e) => console.error('WS error:', e.message));
socket.on('close', () => console.log('Disconnected.'));
