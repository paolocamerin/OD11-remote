const Nuimo = require('nuimojs');

const nuimo = new Nuimo();

nuimo.on('discover', function (device) {
    console.log('Found Nuimo! <3')
    nuimo.stop();

    device.connect(function () {
        console.log('Connected! :O')
        const allOn = new Array(81).fill(1);
        device.setLEDMatrix(allOn, 255, 2000);
    })
})

nuimo.scan();