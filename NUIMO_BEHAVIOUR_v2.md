# Nuimo Device Behaviour Reference

Derived from the `nuimo-swift` SDK source code. This document describes the complete
input/output model, BLE protocol, and behavioural logic of the Nuimo hardware controller.

---

## 1. Hardware Overview

The Nuimo is a BLE wireless controller with the following physical components:

| Component | Description |
|---|---|
| Rotation dial | Continuous rotary encoder |
| Touch surface | 4-directional capacitive touch ring |
| Central button | Physical press button |
| Fly sensor | Proximity/gesture sensor (detects hand movement above the device) |
| LED matrix | 9×9 grid (81 individually addressable LEDs) |
| Battery | Rechargeable, level reported over BLE (0–100%) |

---

## 2. Input Gestures

The device emits **22 distinct gesture types**, grouped by sensor.

### 2.1 Button

| Gesture | Trigger |
|---|---|
| `buttonPress` | Button pushed down |
| `buttonRelease` | Button released |

### 2.2 Rotation Dial

| Gesture | Value |
|---|---|
| `rotate` | Signed 16-bit integer — positive = clockwise, negative = counter-clockwise |

### 2.3 Touch Surface

| Gesture | Trigger |
|---|---|
| `touchLeft` | Brief touch on left zone |
| `touchRight` | Brief touch on right zone |
| `touchTop` | Brief touch on top zone |
| `touchBottom` | Brief touch on bottom zone |
| `longTouchLeft` | Sustained press on left zone |
| `longTouchRight` | Sustained press on right zone |
| `longTouchTop` | Sustained press on top zone |
| `longTouchBottom` | Sustained press on bottom zone |
| `swipeLeft` | Swipe gesture going left |
| `swipeRight` | Swipe gesture going right |
| `swipeUp` | Swipe gesture going up |
| `swipeDown` | Swipe gesture going down |

### 2.4 Fly Sensor

| Gesture | Value |
|---|---|
| `flyLeft` | Hand detected moving left above device |
| `flyRight` | Hand detected moving right above device |
| `flyUpDown` | Hand moving up/down; value = uint8 speed |

### 2.5 Gesture Event Payload

Every gesture is delivered as a `NuimoGestureEvent` with two fields:

- **gesture** — one of the 22 types above
- **value** — integer, only populated for `rotate` (int16 delta) and `flyUpDown` (uint8 speed); `nil` for all others

---

## 3. Output — LED Matrix

### 3.1 Physical Specs

- Resolution: 9×9 = **81 LEDs**
- Each LED: binary on/off
- Brightness: 0.0–1.0 (mapped to 0–255 internally)
- Display duration: configurable (units of 0.1 s; e.g. value 20 = 2.0 s)

### 3.2 Write Options (Flags)

| Flag | Effect |
|---|---|
| `ignoreDuplicates` (1) | Skip write if matrix is identical to the last one sent |
| `withFadeTransition` (2) | Apply hardware fade between frames |
| `withoutWriteResponse` (4) | Fire-and-forget — no BLE write confirmation expected |

### 3.3 Built-in Predefined Matrices (30+)

Categories of bundled patterns:

- **Playback**: `playMatrix`, `pauseMatrix`, `nextMatrix`, `previousMatrix`
- **UI symbols**: `musicNoteMatrix`, `lightBulbMatrix`, `bluetoothMatrix`, `shuffleMatrix`, `questionMarkMatrix`
- **Arrows**: `upArrowMatrix`, `downArrowMatrix`
- **Power**: `powerOnMatrix`, `powerOffMatrix`
- **Letters**: `letterBMatrix`, `letterOMatrix`, `letterGMatrix`, `letterWMatrix`, `letterYMatrix`
- **Blank**: `emptyMatrix`
- **Progress bars**: `progressWithVerticalBar()`, `progressWithVolumeBar()`

### 3.4 Custom Matrix Creation

Matrices can be constructed from:
- A **string**: space / `0` = LED off, any other character = LED on; auto-padded to 81 characters
- A **boolean array**: `[Bool]` of length ≤ 81, auto-padded

### 3.5 LED Write Wire Format (13 bytes)

| Byte(s) | Content |
|---|---|
| 0–9 | 80 LED bits packed into 10 bytes |
| 10 | Flags: bit 4 = fade transition, bit 5 = use built-in matrix |
| 11 | Brightness (0–255) |
| 12 | Duration (× 0.1 s) |

---

## 4. Bluetooth Low Energy Protocol

### 4.1 Services

| Service | UUID | Type |
|---|---|---|
| Battery | `180F` | Standard BLE |
| Device Information | `180A` | Standard BLE |
| LED Matrix | `F29B1523-CB19-40F3-BE5C-7241ECB82FD1` | Custom |
| Sensor | `F29B1525-CB19-40F3-BE5C-7241ECB82FD2` | Custom |

### 4.2 Battery Service Characteristics

| Characteristic | UUID | Data |
|---|---|---|
| Battery Level | `2A19` | 1 byte, 0–100%; notifications enabled |

### 4.3 Device Information Characteristics

| Characteristic | UUID | Data |
|---|---|---|
| Hardware Version | `2A27` | String |
| Firmware Version | `2A26` | String |
| Model / Color | `2A24` | String |

### 4.4 Sensor Service Characteristics

| Name | UUID (suffix …FD2) | Direction | Data |
|---|---|---|---|
| Fly Sensor | `F29B1526-…` | Notify | 2 bytes: direction + speed |
| Touch Sensor | `F29B1527-…` | Notify | 1 byte: gesture index 0–11 |
| Rotation Sensor | `F29B1528-…` | Notify | 2 bytes: int16 little-endian |
| Button Sensor | `F29B1529-…` | Notify | 1 byte: 1=press, 0=release |
| Reboot to DFU | `F29B152A-…` | Write | Write 1 to trigger DFU reboot |
| Heart Beat | `F29B152B-…` | Notify | Periodic keepalive notification |
| Fly Calibration | `F29B152C-…` | Write | Write 1 to recalibrate fly sensor |

### 4.5 Touch Sensor Byte Decoding

| Value | Gesture |
|---|---|
| 0 | `swipeLeft` |
| 1 | `swipeRight` |
| 2 | `swipeUp` |
| 3 | `swipeDown` |
| 4 | `touchLeft` |
| 5 | `touchRight` |
| 6 | `touchTop` |
| 7 | `touchBottom` |
| 8 | `longTouchLeft` |
| 9 | `longTouchRight` |
| 10 | `longTouchTop` |
| 11 | `longTouchBottom` |

### 4.6 Fly Sensor Byte Decoding

| Byte | Meaning |
|---|---|
| 0 | Direction: 0=left, 1=right, 4=up/down |
| 1 | Speed (uint8, relevant only for up/down) |

---

## 5. Connection Behaviour

### 5.1 Discovery

- Device advertises under the name **"Nuimo"**
- Standard BLE scan discovers it via Central Manager
- If no advertising packet is seen within the max interval (~10 s), device is considered unreachable

### 5.2 Connection State Machine

```
                connect()
disconnected ──────────────► connecting
                                  │  services discovered
                                  ▼  + firmware version read
                             connected
                                  │  disconnect() / error
                                  ▼
                          disconnecting
                                  │
                                  ▼
                          disconnected
                                  │  (peripheral lost / BT off)
                                  ▼
                           invalidated
```

- **autoReconnect**: if `true`, the stack automatically calls `connect()` on loss, up to 5 retries
- **Session restoration**: iOS/tvOS support re-attaching to a connected peripheral after app relaunch

### 5.3 LED Write Queue

- LED writes are queued via an internal `LEDMatrixWriter`
- Each write waits for a BLE confirmation before the next frame is sent (500 ms timeout)
- The `ignoreDuplicates` flag skips redundant identical frames
- `withoutWriteResponse` bypasses the confirmation step for lower-latency display

---

## 6. Defaults & Configuration

| Property | Default |
|---|---|
| `defaultMatrixDisplayInterval` | 2.0 s |
| `matrixBrightness` | 1.0 (full) |
| `heartBeatInterval` | 0 (disabled) |
| Connection retry count | 5 |
| LED write response timeout | 500 ms |

---

## 7. Delegate Callbacks (API Surface)

```swift
// Connection state changed (with optional error)
nuimoController(_:didChangeConnectionState:withError:)

// Battery level updated (0–100)
nuimoController(_:didUpdateBatteryLevel:)

// Gesture event received
nuimoController(_:didReceiveGestureEvent:)

// LED matrix display confirmed by device
nuimoControllerDidDisplayLEDMatrix(_:)
```

---

## 8. Advanced Features

| Feature | Details |
|---|---|
| DFU reboot | Write `1` to characteristic `F29B152A-…` — reboots device into firmware update mode |
| Fly sensor calibration | Write `1` to characteristic `F29B152C-…` — recalibrates proximity baseline |
| Heart beat | Set `heartBeatInterval` (1–255 s) to receive periodic liveness notifications |
| Hardware/firmware/color | Readable string properties once connected |
