#!/usr/bin/env python3
"""Soundtrack of the promotional films, made from arithmetic alone: no samples, no music library,
nothing to license. The same arguments always give the same file.

    python3 配乐.py <输出.wav> <时长秒> [--cuts 6,14,…] [--accents 16.2,27.6,…]
    python3 配乐.py <输出.wav> <时长秒> --style P --drop 9 --end 34 [--hits …] [--heart …]   # 短片

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
    if start < 0:                                # a sound that begins before the file: keep its tail
        sound = sound[-start:]
        start = 0
    if start >= len(buf) or len(sound) == 0:
        return
    end = min(len(buf), start + len(sound))
    buf[start:end] += sound[:end - start] * gain


def echo(signal, delay, feedback, taps=5):
    out = signal.copy()
    d = int(delay * RATE)
    for k in range(1, taps + 1):
        out[d * k:] += signal[:len(signal) - d * k] * feedback ** k
    return out


# ---------- short clips (短片): beat-driven, built towards a drop that lands on the visual climax ----------
# P  pulse: A minor, 124 bpm, Am–F–C–G; four-on-the-floor, pumping saw pad, sixteenth arpeggios.
# G  grow:  D minor, 118 bpm, Dm–B♭–F–C; starts sparse and fills in as the tree grows.
# E  epic:  C minor, 104 bpm (bar = 2.3 s, two heartbeats of the film), Cm–A♭–E♭–B♭; toms and
#    strings; before the drop the kick can follow the heartbeat drawn on screen (--heart).
# T  tech:  E minor, 112 bpm, Em–C–G–D; bright plucks with stutters, tight hats, sub bass.
CLIPS = {
    'P': {'bpm': 124, 'chords': [(57, 60, 64), (53, 57, 60), (52, 55, 60), (55, 59, 62)], 'drums': 'club'},
    'G': {'bpm': 118, 'chords': [(62, 65, 69), (58, 62, 65), (57, 60, 65), (55, 60, 64)], 'drums': 'club'},
    'E': {'bpm': 60 / 1.15 * 2, 'chords': [(60, 63, 67), (56, 60, 63), (58, 63, 67), (58, 62, 65)], 'drums': 'epic'},
    'T': {'bpm': 112, 'chords': [(64, 67, 71), (60, 64, 67), (59, 62, 67), (62, 66, 69)], 'drums': 'club', 'glitch': True},
}


def saw(freq, seconds, harmonics=8, bright=1.0, attack=0.02, release=0.2):
    t = np.arange(int(seconds * RATE)) / RATE
    tone = sum(np.sin(2 * np.pi * freq * k * t) * (bright ** (k - 1)) / k for k in range(1, harmonics + 1))
    return tone * np.minimum(1, t / attack) * np.minimum(1, (seconds - t) / release)


def saw_pad(notes, seconds, bright=0.6, attack=0.25):
    return sum(saw(hz(n) * d, seconds, 7, bright, attack, 0.4) for n in notes for d in (0.996, 1.004)) / (2 * len(notes))


def kick2(seconds=0.45):
    t = np.arange(int(seconds * RATE)) / RATE
    freq = 46 + 140 * np.exp(-t * 36)
    body = np.sin(2 * np.pi * np.cumsum(freq) / RATE) * np.exp(-t * 6.5)
    return body + 0.25 * rng.uniform(-1, 1, len(t)) * np.exp(-t * 420)


def hat(open_=False):
    n = int((0.22 if open_ else 0.05) * RATE)
    noise = np.diff(np.diff(rng.uniform(-1, 1, n + 2)))
    return noise * np.exp(-np.arange(n) / ((0.06 if open_ else 0.011) * RATE)) * 0.5


def tom(freq, seconds=0.7):
    t = np.arange(int(seconds * RATE)) / RATE
    f = freq * (1 + 0.6 * np.exp(-t * 18))
    return np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t * 4.5)


def impact(seconds=2.6):
    """A deep hit: a falling boom, a burst of dark noise, a long airy tail."""
    t = np.arange(int(seconds * RATE)) / RATE
    boom = np.sin(2 * np.pi * np.cumsum(36 + 90 * np.exp(-t * 9)) / RATE) * np.exp(-t * 2.1)
    dark = np.convolve(rng.uniform(-1, 1, len(t)), np.ones(30) / 30, mode='same') * np.exp(-t * 6) * 2.2
    air = np.diff(rng.uniform(-1, 1, len(t) + 1)) * np.exp(-t * 2.4) * 0.12
    return boom + dark + air


def riser(seconds=2.8):
    """Noise that brightens and a tone that climbs, into the drop."""
    n = int(seconds * RATE)
    t = np.arange(n) / RATE
    u = t / seconds
    noise = rng.uniform(-1, 1, n)
    low = np.convolve(noise, np.ones(24) / 24, mode='same')
    bright = noise - low
    sweep = np.sin(2 * np.pi * np.cumsum(220 * 8 ** u) / RATE)
    return ((1 - u) * low * 2 + u * bright * 0.8 + 0.25 * sweep) * u ** 2.2


def clip_main(args):
    style = CLIPS[args.style]
    beat = 60 / style['bpm']
    bar = 4 * beat
    seconds = args.seconds
    n = int(seconds * RATE)
    drop = args.drop if args.drop is not None else seconds * 0.3
    end = args.end if args.end is not None else seconds - 5
    hits = [float(x) for x in args.hits.split(',') if x]
    cuts = [float(x) for x in args.cuts.split(',') if x]
    heart = [float(x) for x in args.heart.split(',') if x]
    pad_, bass_, arp_, drums, fx = (np.zeros(n) for _ in range(5))
    tt = np.arange(n) / RATE
    bars = int(np.ceil(seconds / bar))
    home = style['chords'][0]
    for b in range(bars):
        start = b * bar
        post, final = start >= drop - 1e-6, start >= end - 1e-6
        chord = home if final else style['chords'][b % 4]
        add(pad_, start, saw_pad(chord, bar + 0.5, 0.75 if post else 0.45, 0.05 if post else 0.3), 1.0 if post else 0.7)
        if final:
            add(bass_, start, bass(hz(chord[0] - 24), bar * 1.5), 0.9)
            continue
        # Bass: held notes before the drop, pumping eighths after it.
        if post:
            for k in range(8):
                add(bass_, start + k * beat / 2, bass(hz(chord[0] - 24), beat / 2 * 0.9), 0.85 if k % 2 else 0.6)
        elif b >= 1:
            add(bass_, start, bass(hz(chord[0] - 24), bar), 0.5)
        # Arpeggio over two octaves: eighths before the drop, sixteenths after.
        tones = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 12, chord[2]]
        steps = 16 if post else 8
        for k in range(steps):
            at = start + k * bar / steps
            if at >= end:
                break
            note = tones[(k * (1 if post else 2)) % len(tones)] + 12
            g = (0.42 if k % 4 == 0 else 0.3) * (1.0 if post else 0.75)
            add(arp_, at, pluck(hz(note), 0.5, 1.3 if post else 0.7), g)
            # Stutter: now and then a note repeats in thirty-seconds (T only, after the drop).
            if style.get('glitch') and post and rng.random() < 0.12:
                for r in range(1, 3):
                    add(arp_, at + r * bar / 32, pluck(hz(note), 0.2, 1.4), g * 0.6)
        # Drums.
        for k in range(16):
            at = start + k * beat / 4
            if at >= end:
                break
            if style['drums'] == 'club':
                if post:
                    if k % 4 == 0: add(drums, at, kick2(), 1.0)
                    if k in (4, 12): add(drums, at, clap(), 0.8)
                    add(drums, at, hat(k % 4 == 2), 0.5 if k % 2 else 0.25)
                else:
                    if k == 0: add(drums, at, kick2(), 0.7)
                    if k % 2 == 1: add(drums, at, hat(), 0.22)
            else:
                if post:
                    if k in (0, 8): add(drums, at, kick2(), 1.0)
                    if k in (0, 6): add(drums, at, tom(70), 0.7)
                    if k in (8, 11): add(drums, at, tom(98), 0.55)
                    if k == 8: add(drums, at, clap(), 0.9)
                    if k % 2 == 1: add(drums, at, hat(), 0.18)
                elif not heart:
                    if k in (0, 8): add(drums, at, tom(65), 0.5)
        # The bar before the drop: a roll of claps that grows.
        if not post and start + bar > drop - 1e-6 and start < drop:
            for k in range(16):
                at = start + k * bar / 16
                if at < drop:
                    add(drums, at, clap(), 0.15 + 0.5 * k / 16)
    # Heartbeat: two soft thumps every 1.15 s, in time with the beating sphere.
    if heart:
        h0, h1 = heart
        at = h0
        while at < h1:
            add(drums, at + 0.046, kick2(), 0.75)
            add(drums, at + 0.23, kick2(), 0.45)
            at += 1.15
    # Pump: pad and bass duck on every beat after the drop, like a heartbeat of the mix.
    phase = (tt % beat) / beat
    pump = np.where(tt >= drop, 1 - 0.55 * np.exp(-phase * beat / 0.09), 1 - 0.2 * np.exp(-phase * beat / 0.09))
    pump = np.where(tt >= end, 1, pump)
    add(fx, 0, impact(), 0.35)
    add(fx, max(0, drop - 2.8), riser(2.8), 0.22)
    add(fx, drop, impact(), 0.5)
    add(fx, end, impact(), 0.45)
    for h in hits:
        add(fx, h, impact(1.4), 0.2)
        add(fx, h, bells(CLIPS[args.style]['chords'][0][0] + 12)[:int(1.4 * RATE)], 0.05)
    for c in cuts:
        add(fx, c - 0.5, swell(0.5), 0.06)
    arp_ = echo(arp_, 3 * beat / 4, 0.28)
    left = 0.30 * arp_ + 0.20 * pad_ * pump + 0.32 * bass_ * pump + 0.30 * drums + fx
    right = 0.30 * echo(arp_, beat / 4, 0.2, 2) + 0.20 * pad_ * pump + 0.32 * bass_ * pump + 0.30 * np.roll(drums, int(0.003 * RATE)) + fx
    stereo = np.stack([left, right], axis=1)
    stereo *= (np.minimum(1, (n - np.arange(n)) / (1.4 * RATE)))[:, None]
    stereo /= np.abs(stereo).max()
    # A little louder than the long films (about -15 dB mean): set the level, then round off the peaks.
    stereo *= 10 ** (-15 / 20) / np.sqrt(np.mean(stereo ** 2))
    stereo = np.tanh(stereo / 0.89) * 0.89
    with wave.open(args.out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((stereo * 32767).astype('<i2').tobytes())
    print(f'配乐：{args.out}（{seconds:.0f} 秒，短片 {args.style}）')


# ---------- 短片 U (upbeat): a bright pop groove for the 3D cut of D4 ----------
# A major, 128 bpm, A–F♯m–D–E. The beat is felt, not hit: a soft sine kick with no click, a shaker in
# sixteenths, a wooden rim on two and four, closed hats only after the full drop. Energy follows the
# hooks (--hooks): each one gets a gentle riser into it and a low bloom on it; the sections between
# them add a layer at a time, and the last hook lets the drums go.
POP = {'bpm': 128, 'chords': [(57, 61, 64), (54, 57, 61), (50, 54, 57), (52, 56, 59)], 'bells': 81}


def softkick(seconds=0.34):
    t = np.arange(int(seconds * RATE)) / RATE
    freq = 40 + 92 * np.exp(-t * 24)
    body = np.sin(2 * np.pi * np.cumsum(freq) / RATE) * np.exp(-t * 7.5) * np.minimum(1, t / 0.007)
    return np.tanh(body * 1.5) / np.tanh(1.5)


def rim(seconds=0.07):
    t = np.arange(int(seconds * RATE)) / RATE
    tone = np.sin(2 * np.pi * 760 * t) * np.exp(-t * 85) + 0.35 * np.sin(2 * np.pi * 1530 * t) * np.exp(-t * 150)
    return tone * np.minimum(1, t / 0.0025)


def sub(freq, seconds):
    t = np.arange(int(seconds * RATE)) / RATE
    return np.sin(2 * np.pi * freq * t) * np.minimum(1, t / 0.012) * np.minimum(1, (seconds - t) / 0.05)


def bloom_chord(chord, seconds=3.2, gain=1.0):
    t = np.arange(int(seconds * RATE)) / RATE
    env = np.minimum(1, t / 0.35) * np.exp(-np.maximum(0, t - 0.35) * 1.1)
    tone = sum(np.sin(2 * np.pi * hz(n + 12) * d * t) for n in chord for d in (0.997, 1.003)) / 6
    low = np.sin(2 * np.pi * hz(chord[0] - 24) * t) * np.minimum(1, t / 0.6) * np.exp(-t * 0.9)
    return (tone * env + 0.7 * low) * gain


def pop_main(args):
    beat = 60 / POP['bpm']
    bar = 4 * beat
    seconds = args.seconds
    n = int(seconds * RATE)
    hooks = sorted(float(x) for x in args.hooks.split(',') if x) or [0.0]
    sparkles = [float(x) for x in args.sparkles.split(',') if x]
    pad_, bass_, lead, drums, fx = (np.zeros(n) for _ in range(5))
    tt = np.arange(n) / RATE
    # Section of a time: how many hooks have passed (0 = intro).
    sec = lambda at: sum(1 for h in hooks if at >= h - 1e-6)
    peak, outro = len(hooks) - 2, len(hooks) - 1
    bars = int(np.ceil(seconds / bar))
    # The arpeggio, two octaves, with a lift on every fourth note.
    for b in range(bars):
        start = b * bar
        k = sec(start)
        if k >= outro:
            chord = POP['chords'][0]
            add(pad_, start, saw_pad(chord, bar * 1.6, 0.5, 0.4), 0.9)
            add(bass_, start, sub(hz(chord[0] - 24), bar * 1.4), 0.7)
            continue
        chord = POP['chords'][b % 4]
        add(pad_, start, saw_pad(chord, bar + 0.4, 0.45 + 0.1 * min(k, 3), 0.12 if k else 0.35), 0.55 + 0.12 * min(k, 3))
        if k >= 1:
            for q in range(8):
                at = start + q * beat / 2
                add(bass_, at, sub(hz(chord[0] - 24), beat / 2 * 0.92), 0.8 if q % 2 == 0 else 0.55)
        tones = [chord[0], chord[1], chord[2], chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 12, chord[2]]
        steps = 16 if k >= 3 else 8 if k >= 1 else 4
        for q in range(steps):
            at = start + q * bar / steps
            if sec(at) >= outro:
                break
            note = tones[(q * (1 if steps == 16 else 2)) % len(tones)] + 12 + (12 if k >= peak and q % 4 == 0 else 0)
            gain = (0.42 if q % 4 == 0 else 0.28) * (0.6 + 0.1 * min(k, 4))
            add(lead, at + (rng.random() - 0.5) * 0.006, pluck(hz(note), 0.55, 1.1 + 0.15 * min(k, 3)), gain)
        # Drums.
        for q in range(16):
            at = start + q * beat / 4
            if sec(at) >= outro:
                break
            kk = sec(at)
            if kk >= 1 and q % 4 == 0:
                add(drums, at, softkick(), 0.95 if kk >= 3 else 0.75)
            if kk >= 0:
                add(drums, at, shaker(), (0.3 if q % 2 else 0.14) * (0.5 + 0.12 * min(kk, 4)))
            if kk >= 2 and q in (4, 12):
                add(drums, at, rim(), 0.55)
            if kk >= 3 and q % 2 == 1:
                add(drums, at, hat(), 0.11)
            if kk >= peak and q == 14:
                add(drums, at, hat(True), 0.12)
    # Hooks: a riser into each, a soft low bloom on it; the first and the last are quieter.
    for i, h in enumerate(hooks):
        if h > 0.5:
            add(fx, max(0, h - 1.6), riser(1.6), 0.09 + 0.03 * min(i, 3))
        chord = POP['chords'][0]
        add(fx, h - 0.04, bloom_chord(chord, 3.0 if i == peak else 2.2, 1.0 if i == peak else 0.55), 0.14)
        add(fx, h, softkick(0.5), 0.9 if i else 0.4)
        if i == peak:
            add(fx, h, bells(POP['bells']), 0.16)
        elif 0 < i < outro:
            add(fx, h, bells(POP['bells'] + 12)[:int(1.4 * RATE)], 0.07)
    for sp in sparkles:
        for q, st in enumerate((0, 7, 12, 19)):
            t2 = np.arange(int(0.8 * RATE)) / RATE
            add(fx, sp + q * 0.05, np.sin(2 * np.pi * hz(POP['bells'] + 12 + st) * t2) * np.exp(-t2 * 7), 0.045)
    # Pump: everything but the drums ducks on the beat once the kick is in.
    phase = (tt % beat) / beat
    k_t = np.array([sec(x) for x in np.arange(0, seconds, 0.25)])
    k_at = k_t[np.minimum(len(k_t) - 1, (tt / 0.25).astype(int))]
    pump = np.where((k_at >= 1) & (k_at < outro), 1 - 0.42 * np.exp(-phase * beat / 0.085), 1.0)
    lead = echo(lead, 3 * beat / 4, 0.3)
    ir_n = int(1.6 * RATE)
    ir = rng.uniform(-1, 1, ir_n) * np.exp(-np.arange(ir_n) / RATE * 4.0)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(n + ir_n)))
    hall = lambda x: np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:n]
    lead = lead + 0.2 * hall(lead)
    fx = fx + 0.25 * hall(fx)
    left = 0.30 * lead + 0.2 * pad_ * pump + 0.3 * bass_ * pump + 0.3 * drums + fx
    right = 0.30 * echo(lead, beat / 4, 0.18, 2) + 0.2 * pad_ * pump + 0.3 * bass_ * pump + 0.3 * np.roll(drums, int(0.003 * RATE)) + fx
    stereo = np.stack([left, right], axis=1)
    stereo *= (np.minimum(1, (n - np.arange(n)) / (1.6 * RATE)))[:, None]
    stereo *= 10 ** (-16 / 20) / np.sqrt(np.mean(stereo ** 2))
    stereo = np.tanh(stereo / 0.89) * 0.89
    with wave.open(args.out, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((stereo * 32767).astype('<i2').tobytes())
    print(f'配乐：{args.out}（{seconds:.0f} 秒，短片 U，钩子 {len(hooks)} 处）')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('out')
    parser.add_argument('seconds', type=float)
    parser.add_argument('--cuts', default='')
    parser.add_argument('--accents', default='')
    parser.add_argument('--sfx', default='', help='秒:种类，逗号分隔；种类 chime、sparkle、rise、whoosh、shimmer、bloom')
    parser.add_argument('--style', choices=sorted(STYLES) + sorted(CLIPS) + ['U'], default='A')
    parser.add_argument('--hooks', default='', help='短片 U：钩子时刻（秒），逗号分隔；每处前有上升音效，当处有低音涌起')
    parser.add_argument('--sparkles', default='', help='短片 U：闪光音时刻，逗号分隔')
    parser.add_argument('--drop', type=float, help='短片：鼓点全部进入的时刻（秒）')
    parser.add_argument('--end', type=float, help='短片：落版开始的时刻（秒）')
    parser.add_argument('--hits', default='', help='短片：重音时刻，逗号分隔')
    parser.add_argument('--heart', default='', help='短片：心跳鼓点的起止秒，如 2.6,17.8')
    parser.add_argument('--reverb', type=float, default=0, help='旋律与音效的混响量，0 为不加（原有各片）；约 0.2 为小厅')
    args = parser.parse_args()
    if args.style in CLIPS:
        return clip_main(args)
    if args.style == 'U':
        return pop_main(args)
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
        elif kind == 'whoosh':
            # Air moving past: noise through a filter that opens and closes, no attack.
            m = int(1.8 * RATE)
            u = np.arange(m) / m
            noise = rng.uniform(-1, 1, m)
            dark, light = np.convolve(noise, np.ones(70) / 70, mode='same'), np.convolve(noise, np.ones(14) / 14, mode='same')
            open_ = np.sin(np.pi * u) ** 2
            add(fx, at - 0.9, (dark * (1 - open_) + light * open_) * np.sin(np.pi * u) ** 1.5 * 3.2, 0.05)
        elif kind == 'shimmer':
            # Particles: a scatter of soft high notes of the key, like dust catching light.
            for k in range(28):
                tt = np.arange(int(0.8 * RATE)) / RATE
                note = style['bells'] + 12 + [0, 4, 7, 12, 16, 19, 24][int(rng.random() * 7)] - 12 * (style['bells'] > 80)
                grain = np.sin(2 * np.pi * hz(note) * tt) * np.exp(-tt * 8) * np.minimum(1, tt / 0.006)
                add(fx, at + rng.random() * 2.2, grain, 0.018 * (0.6 + 0.4 * rng.random()))
        elif kind == 'bloom':
            # The model switches on: the home chord swells in, an octave up, over a warm low sine.
            home = style['chords'][0]
            m = int(4.5 * RATE)
            tt = np.arange(m) / RATE
            env = np.minimum(1, tt / 0.5) * np.exp(-np.maximum(0, tt - 0.5) * 0.9)
            chord = sum(np.sin(2 * np.pi * hz(n + 12) * d * tt) for n in home for d in (0.997, 1.003)) / 6
            sub = np.sin(2 * np.pi * hz(home[0] - 24) * tt) * np.minimum(1, tt / 0.8) * np.exp(-tt * 0.7)
            add(fx, at - 0.35, (chord * env + 0.8 * sub), 0.11)
    for a in accents:
        add(fx, a, bells(style['bells']), 0.16)
    melody = echo(melody, 3 * BEAT / 4, 0.32)
    if args.reverb:
        # A small hall on the melody and the effects: noise with an exponential tail, by FFT.
        ir_n = int(2.2 * RATE)
        ir = rng.uniform(-1, 1, ir_n) * np.exp(-np.arange(ir_n) / RATE * 3.2)
        ir /= np.sqrt(np.sum(ir ** 2))
        size = 1 << int(np.ceil(np.log2(n + ir_n)))
        hall = lambda x: np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:n]
        melody = melody + args.reverb * hall(melody)
        fx = fx + args.reverb * hall(fx)
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
