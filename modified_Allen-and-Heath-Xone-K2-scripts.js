var XoneK2 = {};

XoneK2.seekRateFast = 3.0;
XoneK2.seekRateSlow = 0.5;

XoneK2.decksInMiddleMidiChannel = 0xE;
XoneK2.effectsInMiddleMidiChannel = 0xD;
XoneK2.decksOnLeftMidiChannel = 0xC;
XoneK2.decksOnRightMidiChannel = 0xB;
XoneK2.sensitivity = 0.5; // Multiplier for encoder sensitivity. 1.0 is default, lower is less sensitive.

// The MIDI note offsets for different colors with the layer button is different
// from the rest of the buttons.
XoneK2.layerButtonColors = {
    red: 0x0C,
    amber: 0x10,
    green: 0x14,
}
// Multiple K2s/K1s can be connected via X-Link and plugged in with one USB
// cable. The MIDI messages of the controllers can be distinguished by setting
// each one to its own MIDI channel. The XoneK2.controllers array maintains state
// for each controller. This also allows the same mapping to  be loaded for
// different use cases as long as the user sets the appropriate MIDI channel for
// the mapping they want.
XoneK2.controllers = [];
for (var ch = 0; ch <= 0xF; ++ch) {
    XoneK2.controllers[ch] = [];
    XoneK2.controllers[ch].columns = [];
    XoneK2.controllers[ch].isShifted = false;
    XoneK2.controllers[ch].leftEncoderIsPressed = false;
    XoneK2.controllers[ch].rightEncoderIsPressed = false;
    XoneK2.controllers[ch].deckPicked = false;
    // This gets incremented to 0 by the init function calling XoneK2.decksLayerButton
    XoneK2.controllers[ch].deckLayerIndex = -1;
    XoneK2.controllers[ch].focusedEffectUnit = 1;
    XoneK2.controllers[ch].singleEffectUnitModeActive = false;
}

XoneK2.init = function (id) {
    // Create a single, unified layout on Channel 8 (0x7)
    var channel = 0x7;
    XoneK2.controllers[channel].columns[1] = new XoneK2.Deck(1, 1, channel);
    XoneK2.controllers[channel].columns[2] = new XoneK2.Deck(2, 2, channel);
    XoneK2.controllers[channel].columns[3] = new XoneK2.Deck(3, 3, channel);
    XoneK2.controllers[channel].columns[4] = new XoneK2.Deck(4, 4, channel);
}

XoneK2.shutdown = function(id) {
    var turnOff = function (component) {
        component.send(0);
    };
    // Iterate through all possible controller configurations and shut them down
    // if they have been initialized.
    for (var ch = 0; ch <= 0xF; ++ch) {
        var controller = XoneK2.controllers[ch];
        if (controller && controller.columns.length > 0) {
            for (var i = 1; i < controller.columns.length; i++) {
                if (controller.columns[i]) {
                    controller.columns[i].forEachComponent(turnOff);
                }
            }
        }
    }
}


XoneK2.decksBottomLeftEncoderPress = function (channel, control, value, status) {
    // On button press, expand/collapse the selected sidebar item.
    if ((status & 0xF0) === 0x90) {
        engine.setValue('[Playlist]', 'ToggleSelectedSidebarItem', 1);
    }
};
XoneK2.decksBottomLeftEncoder = function (channel, control, value, status) {
    // This encoder will now only scroll through the library sidebar.
    if (value === 1) {
        engine.setValue('[Playlist]', 'SelectNextPlaylist', 1);
    } else {
        engine.setValue('[Playlist]', 'SelectPrevPlaylist', 1);
    }
};

XoneK2.decksBottomRightEncoderPress = function (channel, control, value, status) {
    // On button press (status 0x90), toggle the library view.
    if ((status & 0xF0) === 0x90) {
        script.toggleControl('[Skin]', 'show_maximized_library');
    }
};
XoneK2.decksBottomRightEncoder = function (channel, control, value, status) {
    // This encoder will now only scroll through the playlist, regardless of shift state.
    if (value === 1) {
        engine.setValue("[Playlist]", "SelectNextTrack", 1);
    } else {
        engine.setValue("[Playlist]", "SelectPrevTrack", 1);
    }
};

XoneK2.shiftButton = function (channel, control, value, status) {
    XoneK2.controllers[channel].isShifted = (status & 0xF0) === 0x90;
    if (XoneK2.controllers[channel].isShifted) {
        for (var z = 1; z <= 4; z++) {
            XoneK2.controllers[channel].columns[z].shift();
        }
        midi.sendShortMsg(status, 0x0F, 0x7F);
    } else {
        for (var z = 1; z <= 4; z++) {
            XoneK2.controllers[channel].columns[z].unshift();
        }
        midi.sendShortMsg(status, 0x0F, 0x00);
    }
};

// The Xone K2 uses different control numbers (second MIDI byte) to distinguish between
// different colors for the LEDs. The baseline control number sets the LED to red. Adding
// these offsets to the control number sets the LED to a different color.
XoneK2.color = {
    red: 0,
    amber: 36,
    green: 72
};
components.Component.prototype.color = XoneK2.color.red;
components.Component.prototype.send =  function (value) {
    if (this.midi === undefined || this.midi[0] === undefined || this.midi[1] === undefined) {
        return;
    }
    // The LEDs are turned on with a Note On MIDI message (first nybble of first byte 9)
    // and turned off with a Note Off MIDI message (first nybble of first byte 8).
    if (value > 0) {
        midi.sendShortMsg(this.midi[0] + 0x10, this.midi[1] + this.color, value);
    } else {
        midi.sendShortMsg(this.midi[0], this.midi[1], 0x7F);
    }
};
components.Button.prototype.isPress = function (channel, control, value, status) {
    return (status & 0xF0) === 0x90;
}

XoneK2.setTopEncoderPressMidi = function (topEncoderPressObject, columnNumber, midiChannel) {
    topEncoderPressObject.midi = [0x80 + midiChannel, 0x34 + (columnNumber-1)];
}

XoneK2.setTopButtonsMidi = function (topButtonsObject, columnNumber, midiChannel) {
    for (var c = 1; c <= 3; c++) {
        topButtonsObject[c].midi = [0x80 + midiChannel,
                                    0x30 - (c-1)*4 + (columnNumber-1)];
    }
};

XoneK2.setBottomButtonsMidi = function (bottomButtonsObject, columnNumber, midiChannel) {
    for (var c = 1; c <= 4; c++) {
        bottomButtonsObject[c].midi = [0x80 + midiChannel,
                                       0x24 - (c-1)*4 + (columnNumber-1)];
    }
};

XoneK2.setBottomButtonsMidiAmber = function (bottomButtonsObject, columnNumber, midiChannel) {
    for (var c = 1; c <= 4; c++) {
        // The amber layer notes start at 0x3C and decrement.
        bottomButtonsObject[c].midi = [0x80 + midiChannel,
                                       0x48 - (c-1)*4 + (columnNumber-1)];
    }
};

XoneK2.setBottomButtonsMidiGreen = function (bottomButtonsObject, columnNumber, midiChannel) {
    for (var c = 1; c <= 4; c++) {
        bottomButtonsObject[c].midi = [0x80 + midiChannel,
                                       0x6C - (c-1)*4 + (columnNumber-1)];
    }
};

XoneK2.setColumnMidi = function (columnObject, columnNumber, midiChannel) {
    XoneK2.setTopEncoderPressMidi(columnObject.encoderPress, columnNumber, midiChannel);
    XoneK2.setTopButtonsMidi(columnObject.topButtons, columnNumber, midiChannel);
    XoneK2.setBottomButtonsMidi(columnObject.bottomButtons, columnNumber, midiChannel);
};


XoneK2.Deck = function (column, deckNumber, midiChannel) {
    var theDeck = this;

    var effectUnitString = '[EffectRack1_EffectUnit' + column + ']';
    this.deckString = '[Channel' + deckNumber + ']';

    this.encoder = new components.Encoder({
        unshift: function () {
            // When the encoder is turned, double or halve the loop size
            this.input = function (channel, control, value, status) {
                engine.setValue(this.group, (value === 1) ? 'loop_double' : 'loop_halve', 1);
            };
        },
        shift: function () {
            this.input = function (channel, control, value, status) {
                direction = (value === 1) ? 1 : -1;
                var gain = engine.getValue(this.group, "pregain");
                engine.setValue(this.group, "pregain", gain + (0.025 * XoneK2.sensitivity) * direction);
            };
        },
    });

    this.encoderPress = new components.Button({
        outKey: 'loop_enabled',
        color: XoneK2.color.amber,
        unshift: function () {
            this.group = theDeck.deckString;
            this.inKey = 'beatloop_activate';
            this.type = components.Button.prototype.types.push;
        },
        shift: function () {
            this.group = '[QuickEffectRack1_' + theDeck.deckString + ']';
            this.inKey = 'enabled';
            this.type = components.Button.prototype.types.toggle;
        },
    });

    this.knobs = new components.ComponentContainer();
    // Knobs control effect parameters 1-3 for the corresponding effect unit.
    for (var k = 1; k <= 3; k++) {
        this.knobs[k] = new components.Pot({
            group: '[EffectRack1_EffectUnit' + column + '_Effect' + k + ']',
            inKey: 'meta',
            unshift: function () {
                this.input = function (channel, control, value, status, group) {
                    this.inSetParameter(this.inValueScale(value));

                    if (this.previousValueReceived === undefined) {
                        engine.softTakeover(this.group, this.inKey, true);
                    }
                    this.previousValueReceived = value;
                };
            },
            shift: function () {
                engine.softTakeoverIgnoreNextValue(this.group, this.inKey);
                this.valueAtLastEffectSwitch = this.previousValueReceived;
                // Floor the threshold to ensure that every effect can be selected
                this.changeThreshold = Math.floor(this.max /
                    engine.getValue('[Master]', 'num_effectsavailable'));

                this.input = function (channel, control, value, status, group) {
                    var change = value - this.valueAtLastEffectSwitch;
                    if (Math.abs(change) >= this.changeThreshold
                        // this.valueAtLastEffectSwitch can be undefined if
                        // shift was pressed before the first MIDI value was received.
                        || this.valueAtLastEffectSwitch === undefined) {
                        engine.setValue(this.group, 'effect_selector', change);
                        this.valueAtLastEffectSwitch = value;
                    }

                    this.previousValueReceived = value;
                };
            },
        });
    }

    this.fader = new components.Pot({
        group: effectUnitString,
        inKey: 'mix'
    });

    this.topButtons = new components.ComponentContainer();
    // Top buttons enable effects 1-3 for the corresponding effect unit.
    for (var k = 1; k <= 3; k++) {
        this.topButtons[k] = new components.Button({
            group: '[EffectRack1_EffectUnit' + column + '_Effect' + k + ']',
            key: 'enabled',
            type: components.Button.prototype.types.toggle,
            color: XoneK2.color.green,
        });
    }

    // This should not be a ComponentContainer, otherwise strange things will
    // happen when iterating over the Deck with reconnectComponents.
    this.bottomButtonLayers = [];

    var CueAndSeekButton = function (options) {
        if (options.cueName === undefined) {
            print('ERROR! cueName not specified');
        } else if (options.seekRate === undefined) {
            print('ERROR! seekRate not specified');
        }

        this.effect_unit = options.effect_unit;
        this.outKey = options.cueName + '_enabled';
        components.Button.call(this, options);
    };
    CueAndSeekButton.prototype = new components.Button({
        unshift: function () {
            this.inKey = this.cueName + '_activate';
            this.input = components.Button.prototype.input;
            this.group = theDeck.deckString;
            // Avoid log spam on startup
            if (this.group !== undefined) {
                engine.setValue(this.group, 'rateSearch', 0);
            }
        },
        shift: function () {
            // The group for effect assignment is the effect unit itself.
            this.group = '[EffectRack1_EffectUnit' + this.effect_unit + ']';
            // The key is the deck we want to assign it to.
            this.key = 'group_' + theDeck.deckString + '_enable';
            this.inKey = this.key;
            this.outKey = this.key;
            this.input = components.Button.prototype.input;
            this.type = components.Button.prototype.types.toggle;
        }
    });

    this.bottomButtonLayers.hotcue = new components.ComponentContainer();
    this.bottomButtonLayers.hotcue[1] = new CueAndSeekButton({
        cueName: "hotcue_1",
        seekRate: XoneK2.seekRateFast,
        effect_unit: 1,
        color: XoneK2.color.red,
    });
    this.bottomButtonLayers.hotcue[2] = new CueAndSeekButton({
        cueName: "hotcue_2",
        seekRate: -1 * XoneK2.seekRateFast,
        effect_unit: 2,
        color: XoneK2.color.red,
    });
    this.bottomButtonLayers.hotcue[3] = new CueAndSeekButton({
        cueName: "hotcue_3",
        seekRate: XoneK2.seekRateSlow,
        effect_unit: 3,
        color: XoneK2.color.red,
    });
    this.bottomButtonLayers.hotcue[4] = new CueAndSeekButton({
        cueName: "hotcue_4",
        seekRate: -1 * XoneK2.seekRateSlow,
        effect_unit: 4,
        color: XoneK2.color.red,
    });

    this.bottomButtonLayers.syncAndLoadLayer = new components.ComponentContainer();
    this.bottomButtonLayers.syncAndLoadLayer[1] = new components.Button({
        inKey: 'sync_leader',
        outKey: 'sync_leader',
        type: components.Button.prototype.types.push,
        color: XoneK2.color.green,
    });
    this.bottomButtonLayers.syncAndLoadLayer[2] = new components.Button({
        key: 'sync_enabled',
        outKey: 'sync_enabled',
        type: components.Button.prototype.types.toggle,
        color: XoneK2.color.green,
    });
    this.bottomButtonLayers.syncAndLoadLayer[3] = new components.Button({
        input: function() {}, // Unused
        color: XoneK2.color.green,
    });
    this.bottomButtonLayers.syncAndLoadLayer[4] = new components.Button({
        input: function(channel, control, value, status) {
            if (this.isPress(channel, control, value, status)) {
                engine.setValue(this.group, 'LoadSelectedTrack', 1);
            }
        },
        outKey: 'track_ends_soon',
        color: XoneK2.color.green,
    });

    this.bottomButtonLayers.playAndPitch  = new components.ComponentContainer();
    // Button 1: Increase speed (rate_temp_up)
    this.bottomButtonLayers.playAndPitch [1] = new components.Button({
        inKey: 'rate_temp_up',
        type: components.Button.prototype.types.push,
        color: XoneK2.color.amber,
    });
    // Button 2: Decrease speed (rate_temp_down)
    this.bottomButtonLayers.playAndPitch [2] = new components.Button({
        inKey: 'rate_temp_down',
        type: components.Button.prototype.types.push,
        color: XoneK2.color.amber,
    });
    // Button 3: Cue
    this.bottomButtonLayers.playAndPitch [3] = new components.Button({
        inKey: 'cue_default',
        outKey: 'cue_indicator',
        type: components.Button.prototype.types.push,
        color: XoneK2.color.gamberreen,
    });
    // Button 4: Play/Pause
    this.bottomButtonLayers.playAndPitch [4] = new components.Button({
        key: 'play',
        type: components.Button.prototype.types.toggle,
        color: XoneK2.color.amber,
    });

    var setGroup = function (component) {
        if (component.group === undefined) {
            component.group = theDeck.deckString;
        }
    };

    // Set up MIDI for both layers
    for (var layerName in this.bottomButtonLayers) {
        if (this.bottomButtonLayers.hasOwnProperty(layerName)) {
            var layer = this.bottomButtonLayers[layerName];
            if (layerName === 'syncAndLoadLayer') {
                XoneK2.setBottomButtonsMidiAmber(layer, column, midiChannel);
            } else { // 'hotcue' layer
                XoneK2.setBottomButtonsMidi(layer, column, midiChannel);
            }
            layer.forEachComponent(setGroup);
        }
    }

    this.bottomButtons = this.bottomButtonLayers.hotcue;

    XoneK2.setColumnMidi(this, column, midiChannel);
    this.reconnectComponents(setGroup);

};
XoneK2.Deck.prototype = new components.Deck();