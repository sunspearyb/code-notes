#!/usr/bin/env python3
"""Soundtrack of the promotional films, made from arithmetic alone: no samples, no music library,
nothing to license. The same arguments always give the same file.

    python3 配乐.py <输出.wav> <时长秒> [--cuts 6,14,…] [--accents 16.2,27.6,…]

Each film has its own style (--style):
  A  structure and growth: D major, 92 beats a minute, D–A–Bm–G, soft plucked arpeggios over a
     warm pad, a quiet shaker; spacious, opening out like the rings of the film.
  B  curious and brisk: G major, 116 beats a minute, G–Em–C–D, bouncing marimba figures in
     syncopation, light claps on two and four.
  C  thoughtful but not heavy: F major, 84 beats a minute, F–C–Dm–B♭, a soft piano playing
     broken chords, no percussion; room for the six categories and the four steps.
  D  hopeful, going forward: A major, 104 beats a minute, A–E–F♯m–D, plucked arpeggios over a
     soft kick on every beat, like a long road ahead.
Scene cuts get a soft swell, the moments that matter a rising run of bells, and the film ends on
the home chord. 48 kHz, stereo, 16 bit.
"""
import argparse
import wave

import numpy as np

RATE = 48000
# One chord a bar (four beats), MIDI note numbers in root position. A pattern step is
# (eighth note, chord tone, octave up); a clap falls on the given eighths.
STYLES = {
    'A': {'bpm': 92, 'chords': [(62, 66, 69), (57, 61, 64), (59, 62, 66), (55, 59, 62)],
          'pattern': [(k, i, 0) for k, i in enumerate([0, 1, 2, 1, 0, 2, 1, 2])], 'timbre': 'pluck',
          'shaker': True, 'claps': [], 'bells': 74},
    'B': {'bpm': 116, 'chords': [(67, 71, 74), (64, 67, 71), (60, 64, 67), (62, 66, 69)],
          'pattern': [(0, 0, 0), (1.5, 2, 0), (3, 1, 1), (4, 2, 0), (5.5, 0, 1), (6.5, 1, 0), (7, 2, 1)], 'timbre': 'marimba',
          'shaker': False, 'claps': [2, 6], 'bells': 79},
    'C': {'bpm': 84, 'chords': [(65, 69, 72), (60, 64, 67), (62, 65, 69), (58, 62, 65)],
          'pattern': [(0, 0, 0), (1, 1, 0), (2, 2, 0), (3, 1, 0), (4, 2, 1), (6, 1, 0)], 'timbre': 'piano',
          'shaker': False, 'claps': [], 'bells': 77},
    'D': {'bpm': 104, 'chords': [(69, 73, 76), (64, 68, 71), (66, 69, 73), (62, 66, 69)],
          'pattern': [(k, i, 0) for k, i in enumerate([0, 2, 1, 2, 0, 2, 1, 2])], 'timbre': 'pluck',
          'shaker': True, 'claps': [], 'kick': True, 'bells': 81},
}
BPM = 92
BEAT = 60 / BPM
rng = np.random.default_rng(20261018)


def hz(note):
    return 440.0 * 2 ** ((note - 69) / 12)


def pluck(freq, seconds=1.1, bright=1.0):
    """A soft plucked tone, between a kalimba and a marimba: fundamental, a gentle octave and a
    touch of the twelfth, each dying away faster than the one below."""
    t = np.arange(int(seconds * RATE)) / RATE
    tone = (np.sin(2 * np.pi * freq * t) * np.exp(-t * 4.2)
            + 0.32 * bright * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t * 7)
            + 0.08 * bright * np.sin(2 * np.pi * 3 * freq * t) * np.exp(-t * 11))
    return tone * np.minimum(1, t / 0.004)


def marimba(freq, seconds=0.7, bright=1.0):
    """Wooden bar: a strong fundamental and the bar's fourth harmonic (about 3.9×), both short."""
    t = np.arange(int(seconds * RATE)) / RATE
    tone = (np.sin(2 * np.pi * freq * t) * np.exp(-t * 7.5)
            + 0.45 * bright * np.sin(2 * np.pi * 3.93 * freq * t) * np.exp(-t * 22)
            + 0.12 * np.sin(2 * np.pi * 9.2 * freq * t) * np.exp(-t * 60))
    return tone * np.minimum(1, t / 0.002)


def piano(freq, seconds=2.2, bright=1.0):
    """A soft felt piano: several harmonics with their own decay and a little inharmonic stretch."""
    t = np.arange(int(seconds * RATE)) / RATE
    tone = sum((0.9 / k ** 1.4) * bright ** (k > 1) * np.sin(2 * np.pi * freq * k * (1 + 0.0004 * k * k) * t) * np.exp(-t * (1.1 + 1.3 * k))
               for k in range(1, 6))
    return tone * np.minimum(1, t / 0.006)


def kick(seconds=0.35):
    """Soft kick: a falling sine, felt more than heard."""
    t = np.arange(int(seconds * RATE)) / RATE
    freq = 48 + 70 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(freq) / RATE) * np.exp(-t * 9)


def clap(seconds=0.16):
    n = int(seconds * RATE)
    noise = np.convolve(rng.uniform(-1, 1, n), [1, -0.6], mode='same')
    t = np.arange(n) / RATE
    # Three quick bursts make a clap rather than a click.
    env = sum(np.exp(-np.maximum(0, t - d) / 0.012) * (t >= d) for d in (0, 0.009, 0.019))
    return noise * env / 3


def pad(notes, seconds):
    """Warm sustained chord: slightly detuned sines, slow attack and release."""
    t = np.arange(int(seconds * RATE)) / RATE
    tone = sum(np.sin(2 * np.pi * hz(n) * d * t) for n in notes for d in (0.998, 1.002)) / (2 * len(notes))
    env = np.minimum(1, t / 0.6) * np.minimum(1, (seconds - t) / 0.6)
    return tone * env


def bass(freq, seconds):
    t = np.arange(int(seconds * RATE)) / RATE
    return (np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * 2 * freq * t)) * np.exp(-t * 1.6) * np.minimum(1, t / 0.01)


def shaker(seconds=0.09):
    n = int(seconds * RATE)
    noise = rng.uniform(-1, 1, n)
    noise = np.diff(noise, prepend=0)            # high pass: a light tick, not a hiss
    return noise * np.exp(-np.arange(n) / (0.018 * RATE))


def swell(seconds=1.0):
    """Soft rising noise into a cut, filtered to sound like air."""
    n = int(seconds * RATE)
    noise = np.convolve(rng.uniform(-1, 1, n), np.ones(24) / 24, mode='same')
    env = np.linspace(0, 1, n) ** 2.2
    env[-int(0.06 * RATE):] *= np.linspace(1, 0, int(0.06 * RATE))
    return noise * env


def bells(root):
    """A rising run of four bell notes in the key: the moment lands."""
    out = np.zeros(int(2.4 * RATE))
    for i, step in enumerate((0, 4, 7, 12)):
        freq = hz(root + step)
        t = np.arange(int(1.8 * RATE)) / RATE
        tone = (np.sin(2 * np.pi * freq * t) + 0.4 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t * 6)) * np.exp(-t * 2.6)
        at = int(i * 0.11 * RATE)
        out[at:at + len(tone)] += tone * (0.9 - i * 0.12)
    return out


def add(buf, at, sound, gain):
    start = int(at * RATE)
    if start >= len(buf):
        return
    end = min(len(buf), start + len(sound))
    buf[start:end] += sound[:end - start] * gain


def echo(signal, delay, feedback, taps=5):
    out = signal.copy()
    d = int(delay * RATE)
    for k in range(1, taps + 1):
        out[d * k:] += signal[:len(signal) - d * k] * feedback ** k
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out')
    parser.add_argument('seconds', type=float)
    parser.add_argument('--cuts', default='')
    parser.add_argument('--accents', default='')
    parser.add_argument('--sfx', default='', help='秒:种类，逗号分隔；种类 chime、sparkle、rise')
    parser.add_argument('--style', choices=sorted(STYLES), default='A')
    args = parser.parse_args()
    global BPM, BEAT
    style = STYLES[args.style]
    BPM = style['bpm']
    BEAT = 60 / BPM
    chords, voice = style['chords'], {'pluck': pluck, 'marimba': marimba, 'piano': piano}[style['timbre']]
    seconds = args.seconds
    cuts = [float(x) for x in args.cuts.split(',') if x]
    accents = [float(x) for x in args.accents.split(',') if x]
    n = int(seconds * RATE)
    melody, harmony, low, perc, fx = (np.zeros(n) for _ in range(5))
    bar = 4 * BEAT
    bars = int(np.ceil(seconds / bar))
    last = int((seconds - 2.5) // bar)          # the bar where the film resolves
    for b in range(bars):
        start = b * bar
        chord = chords[0] if b >= last else chords[b % 4]
        add(harmony, start, pad(chord, bar + 0.6), 1.0)
        if b >= 1:                              # bass enters in the second bar
            add(low, start, bass(hz(chord[0] - 24), bar), 1.0)
            add(low, start + 2.5 * BEAT, bass(hz(chord[0] - 24), 1.2), 0.55)
        if b >= last:
            add(melody, start, voice(hz(chord[2] + 12), 3.0), 0.8)
            continue
        for k, idx, up in style['pattern']:
            octave = 12 if (up or (k == 4 and b % 2 and style['timbre'] == 'pluck')) else 0
            # A small, fixed human variation in timing and touch keeps the line from sounding mechanical.
            jitter = (rng.random() - 0.5) * 0.012
            add(melody, start + k * BEAT / 2 + jitter, voice(hz(chord[idx] + 12 + octave), bright=0.8 + 0.4 * rng.random()), 0.5 + 0.18 * (k % 2 == 0))
        if b >= 2 and style['shaker']:          # shaker from the third bar, on the off-beats
            for k in range(8):
                add(perc, start + k * BEAT / 2, shaker(), 0.35 if k % 2 else 0.16)
        if b >= 2 and style.get('kick'):
            for k in range(4):
                add(low, start + k * BEAT, kick(), 0.5)
        if b >= 2:
            for k in style['claps']:
                add(perc, start + k * BEAT / 2, clap(), 0.5)
    for c in cuts:
        add(fx, c - 1.0, swell(1.0), 0.05)
    # Sound effects: a single chime, a quick sparkle of high notes, a slow rising shimmer.
    for item in (x for x in args.sfx.split(',') if x):
        at, kind = item.split(':')
        at = float(at)
        if kind == 'chime':
            add(fx, at, bells(style['bells'] + 12)[:int(1.6 * RATE)], 0.09)
        elif kind == 'sparkle':
            for k, st in enumerate((0, 7, 12, 19)):
                tt = np.arange(int(0.9 * RATE)) / RATE
                add(fx, at + k * 0.06, np.sin(2 * np.pi * hz(style['bells'] + 12 + st) * tt) * np.exp(-tt * 6), 0.05)
        elif kind == 'rise':
            tt = np.arange(int(6 * RATE)) / RATE
            freq = hz(style['bells']) * (1 + tt / 6)
            tone = np.sin(2 * np.pi * np.cumsum(freq) / RATE) * np.minimum(1, tt / 2) * np.minimum(1, (6 - tt) / 1.5)
            add(fx, at, tone, 0.025)
    for a in accents:
        add(fx, a, bells(style['bells']), 0.16)
    melody = echo(melody, 3 * BEAT / 4, 0.32)
    left = 0.30 * melody + 0.15 * harmony + 0.30 * low + 0.10 * perc + fx
    right = 0.30 * echo(melody, BEAT / 4, 0.2, 2) + 0.15 * harmony + 0.30 * low + 0.12 * np.roll(perc, int(0.004 * RATE)) + fx
    stereo = np.stack([left, right], axis=1)
    fade_in = np.minimum(1, np.arange(n) / (1.2 * RATE))
    fade_out = np.minimum(1, (n - np.arange(n)) / (2.5 * RATE))
    stereo *= (fade_in * fade_out)[:, None]
    stereo *= 0.7 / np.abs(stereo).max()        # -3 dBFS peak
    with wave.open(args.out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((stereo * 32767).astype('<i2').tobytes())
    print(f'配乐：{args.out}（{seconds:.0f} 秒）')


if __name__ == '__main__':
    main()
