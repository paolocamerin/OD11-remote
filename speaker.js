/**
 * OD-11 speaker WebSocket client.
 * Connects to the speaker, parses volume from state updates, and exposes
 * getVolume() and changeVolume(). Does not change volume unless changeVolume() is called.
 */

const ws = require('ws');
const fs = require('fs');
const config = require('./config');
const EventEmitter = require('events');

const speakerEmitter = new EventEmitter();

let socket;
let currentVolume = 0;
let maxVolume = 100;

/**
 * Initialise the speaker WebSocket connection.
 * Sends global_join and group_join on open, then pings every 5s to stay connected.
 */
function initialiseSpeaker() {
    socket = new ws.WebSocket(`ws://${config.speakerIp}/ws`);
    const uid = 'uid-' + Math.floor(1e8 * Math.random());

    socket.on('open', function () {
        console.log('Connected to speaker!');

        // Join global and group to receive state updates
        socket.send(JSON.stringify({
            protocol_major_version: 0,
            protocol_minor_version: 4,
            action: 'global_join'
        }));
        socket.send(JSON.stringify({
            color_index: 0,
            name: 'od11-remote',
            realtime_data: true,
            uid: uid,
            action: 'group_join'
        }));

        // Keep connection alive
        setInterval(() => {
            socket.send(JSON.stringify({
                value: (new Date()).getTime() % 1e6,
                action: 'speaker_ping'
            }));
        }, 5000);
    });

    socket.on('message', function (data) {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch (_) {
            console.log('Message received (parse error):', data.toString());
            return;
        }

        // Parse volume from state updates (display only – does not change speaker volume)
        const items = Array.isArray(msg) ? msg : [msg];
        for (const item of items) {
            // Top-level updates (e.g. single-message volume change)
            if (item && item.update) {
                if (item.update === 'group_max_volume' && typeof item.value === 'number') {
                    maxVolume = item.value;
                }
                if (item.update === 'group_volume_changed' && typeof item.vol === 'number') {
                    currentVolume = item.vol;
                    speakerEmitter.emit('volumeChange', { vol: currentVolume, max: maxVolume });
                }
            }
            // Initial state is inside group_joined.state[] and global_joined.state[]
            if (item && Array.isArray(item.state)) {
                for (const stateItem of item.state) {
                    if (!stateItem || !stateItem.update) continue;
                    if (stateItem.update === 'group_max_volume' && typeof stateItem.value === 'number') {
                        maxVolume = stateItem.value;
                    }
                    if (stateItem.update === 'group_volume_changed' && typeof stateItem.vol === 'number') {
                        currentVolume = stateItem.vol;
                        speakerEmitter.emit('volumeChange', { vol: currentVolume, max: maxVolume });
                    }
                }
            }
        }

        fs.appendFileSync('speaker.log', data.toString() + '\n');
    });

    socket.on('error', function () {
        console.log('Speaker WebSocket error');
    });

    socket.on('close', function () {
        console.log('Disconnected from speaker');
    });

    console.log('Speaker IP:', config.speakerIp);
}

/**
 * Send a volume change command to the speaker.
 * @param {number} amount - Delta to apply (+/-)
 */
function changeVolume(amount) {
    if (!socket || socket.readyState !== ws.OPEN) return;
    socket.send(JSON.stringify({
        amount: amount,
        action: 'group_change_volume'
    }));
}

/**
 * Get the last known volume from the speaker.
 * @returns {{ vol: number, max: number }}
 */
function getVolume() {
    return { vol: currentVolume, max: maxVolume };
}

module.exports = { initialiseSpeaker, changeVolume, getVolume, speakerEmitter };
