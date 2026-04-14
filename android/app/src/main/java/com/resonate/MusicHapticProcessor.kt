package com.resonate

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

// Real-time music -> vibration for deaf/hard-of-hearing users.
//
// Same DSP design as iOS: 2048-sample Hann-windowed FFT with 50% overlap,
// per-band AGC, voice-suppression band weights, spectral-flux onset detection.
// Output: Android Vibrator driven at ~30 Hz with amplitude tracking bass
// drive, plus transient pulses on detected beats.
class MusicHapticProcessor(
    private val context: Context,
    private val onFrame: (bands: FloatArray, amplitude: Float, intensity: Float, sharpness: Float) -> Unit,
    private val onBeat: (strength: Float) -> Unit,
) {

    companion object {
        private const val FFT_SIZE = 2048
        private const val HOP_SIZE = 1024
        private const val EMIT_INTERVAL_MS = 33L
        private const val VIBRATION_UPDATE_INTERVAL_MS = 33L
        private const val MIN_BEAT_INTERVAL_MS = 120L
        private const val SAMPLE_RATE = AudioCaptureCoordinator.SAMPLE_RATE

        // Hz band edges. 8 bands -> collapsed to 4 for JS.
        private val BAND_EDGES = floatArrayOf(
            20f, 60f, 150f, 400f, 1000f, 2500f, 5000f, 10000f, 16000f
        )
        private val BAND_WEIGHTS = floatArrayOf(
            1.4f, 1.3f, 0.45f, 0.2f, 0.3f, 0.5f, 1.25f, 1.0f
        )
        private val JS_BAND_GROUPS = arrayOf(
            intArrayOf(0, 1),
            intArrayOf(2),
            intArrayOf(3, 4),
            intArrayOf(5, 6, 7),
        )

        private const val ENV_ATTACK = 0.6f
        private const val ENV_RELEASE = 0.9985f
    }

    @Volatile private var running = false
    private var subscriberId: String? = null

    // FFT state
    private val window = hannWindow(FFT_SIZE)
    private val real = FloatArray(FFT_SIZE)
    private val imag = FloatArray(FFT_SIZE)
    private val sampleBuf = FloatArray(FFT_SIZE * 3)
    private var sampleLen = 0

    private val bandEnvelope = FloatArray(BAND_WEIGHTS.size) { 0.0001f }
    private val magnitude = FloatArray(FFT_SIZE / 2)
    private val bandEnergy = FloatArray(BAND_WEIGHTS.size)
    private val normalizedBands = FloatArray(BAND_WEIGHTS.size)
    private val uiBands = FloatArray(4)

    private val prevMag = FloatArray(FFT_SIZE / 2)
    private val fluxHistory = FloatArray(43)
    private var fluxIndex = 0
    private var lastBeatMs = 0L

    private var lastEmitMs = 0L
    private var lastVibrationMs = 0L
    private var lastContinuousIntensity = -1f

    // Vibrator
    private val vibrator: Vibrator? = run {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val mgr = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            mgr?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }
    private val hasAmplitudeControl = vibrator?.hasAmplitudeControl ?: false

    fun start() {
        if (running) return
        running = true
        resetState()
        subscriberId = AudioCaptureCoordinator.addSubscriber { bytes, len ->
            ingest(bytes, len)
        }
    }

    fun stop() {
        running = false
        subscriberId?.let { AudioCaptureCoordinator.removeSubscriber(it) }
        subscriberId = null
        vibrator?.cancel()
    }

    private fun resetState() {
        sampleLen = 0
        java.util.Arrays.fill(prevMag, 0f)
        java.util.Arrays.fill(fluxHistory, 0f)
        fluxIndex = 0
        for (i in bandEnvelope.indices) bandEnvelope[i] = 0.0001f
        lastBeatMs = 0L
        lastEmitMs = 0L
        lastVibrationMs = 0L
        lastContinuousIntensity = -1f
    }

    // Called on the coordinator's IO thread — do work here to keep audio path tight.
    private fun ingest(bytes: ByteArray, byteLen: Int) {
        if (!running) return
        val frames = byteLen / 2

        // Convert to normalized float samples [-1, 1]
        var i = 0
        while (i < frames) {
            if (sampleLen >= sampleBuf.size) break
            val lo = bytes[2 * i].toInt() and 0xFF
            val hi = bytes[2 * i + 1].toInt()
            val s = (hi shl 8) or lo
            val signed = if (s and 0x8000 != 0) s or -0x10000 else s
            sampleBuf[sampleLen++] = signed / 32768f
            i++
        }

        while (sampleLen >= FFT_SIZE) {
            processWindow()
            // Slide by HOP_SIZE
            System.arraycopy(sampleBuf, HOP_SIZE, sampleBuf, 0, sampleLen - HOP_SIZE)
            sampleLen -= HOP_SIZE
        }
    }

    private fun processWindow() {
        // Apply window, zero imag
        for (i in 0 until FFT_SIZE) {
            real[i] = sampleBuf[i] * window[i]
            imag[i] = 0f
        }
        fft(real, imag)

        // Magnitude spectrum
        val half = FFT_SIZE / 2
        for (k in 0 until half) {
            magnitude[k] = sqrt(real[k] * real[k] + imag[k] * imag[k])
        }

        // Spectral flux
        var flux = 0f
        for (k in 1 until half) {
            val d = magnitude[k] - prevMag[k]
            if (d > 0) flux += d
            prevMag[k] = magnitude[k]
        }

        // Collapse into bands
        val binHz = SAMPLE_RATE.toFloat() / FFT_SIZE
        java.util.Arrays.fill(bandEnergy, 0f)
        for (b in BAND_WEIGHTS.indices) {
            val lo = max(1, (BAND_EDGES[b] / binHz).toInt())
            val hi = min(half - 1, ((BAND_EDGES[b + 1] / binHz).toInt() + 1))
            if (hi <= lo) continue
            var sum = 0f
            for (k in lo..hi) sum += magnitude[k]
            bandEnergy[b] = sum / (hi - lo + 1)
        }

        // Voice-suppressed weighting + AGC per band
        for (b in BAND_WEIGHTS.indices) {
            val weighted = bandEnergy[b] * BAND_WEIGHTS[b]
            if (weighted > bandEnvelope[b]) {
                bandEnvelope[b] = bandEnvelope[b] * (1f - ENV_ATTACK) + weighted * ENV_ATTACK
            } else {
                bandEnvelope[b] = max(weighted, bandEnvelope[b] * ENV_RELEASE)
            }
            val denom = max(bandEnvelope[b], 0.0005f)
            val raw = min(weighted / denom, 1f)
            normalizedBands[b] = Math.pow(raw.toDouble(), 0.7).toFloat()
        }

        // Haptic drive
        val bassDrive = (normalizedBands[0] * 1.2f + normalizedBands[1] * 1.0f) / 2f
        val brillianceDrive = (normalizedBands[5] * 0.6f + normalizedBands[6] * 1.0f + normalizedBands[7] * 0.7f) / 2.3f
        val intensity = min(max(bassDrive * 0.9f + 0.05f, 0f), 1f)
        val sharpness = min(max(brillianceDrive, 0f), 1f)

        // Onset detection
        fluxHistory[fluxIndex] = flux
        fluxIndex = (fluxIndex + 1) % fluxHistory.size
        var mean = 0f
        for (v in fluxHistory) mean += v
        mean /= fluxHistory.size
        var varSum = 0f
        for (v in fluxHistory) varSum += (v - mean) * (v - mean)
        val std = sqrt(varSum / fluxHistory.size)
        val threshold = mean + 1.6f * std
        val now = System.currentTimeMillis()
        if (flux > threshold && flux > 0.05f && (now - lastBeatMs) > MIN_BEAT_INTERVAL_MS) {
            lastBeatMs = now
            val raw = (flux - threshold) / max(std, 0.01f)
            val strength = min(raw / 1.5f, 1f)
            fireBeat(strength)
        }

        updateContinuousVibration(intensity, now)

        if (now - lastEmitMs >= EMIT_INTERVAL_MS) {
            lastEmitMs = now
            emitFrame(normalizedBands, intensity, sharpness)
        }
    }

    // Ongoing hum — a quick low-amplitude oneshot re-issued every frame tracks
    // the bass envelope. The Android motor can't do intensity modulation on a
    // running effect, but back-to-back oneshots produce a continuous feel.
    private fun updateContinuousVibration(intensity: Float, now: Long) {
        val v = vibrator ?: return
        if (!v.hasVibrator()) return

        // Skip near-silent frames so we don't buzz continuously during quiet passages
        if (intensity < 0.08f) return

        val amp = if (hasAmplitudeControl) {
            (intensity * 255f).toInt().coerceIn(1, 255)
        } else {
            // No amplitude control — gate by duty cycle instead (skip weaker frames).
            if (intensity < 0.3f) return
            VibrationEffect.DEFAULT_AMPLITUDE
        }

        val intensityDelta = kotlin.math.abs(intensity - lastContinuousIntensity)
        if (
            lastVibrationMs > 0 &&
            now - lastVibrationMs < VIBRATION_UPDATE_INTERVAL_MS &&
            intensityDelta < 0.08f
        ) {
            return
        }

        try {
            val effect = VibrationEffect.createOneShot(40L, amp)
            v.vibrate(effect)
            lastVibrationMs = now
            lastContinuousIntensity = intensity
        } catch (_: Throwable) {}
    }

    private fun fireBeat(strength: Float) {
        val v = vibrator ?: return
        if (!v.hasVibrator()) return

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val scale = strength.coerceIn(0.2f, 1f)
                val composition = VibrationEffect.startComposition()
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_THUD, scale)
                    .addPrimitive(VibrationEffect.Composition.PRIMITIVE_TICK, (scale * 0.7f).coerceAtLeast(0.1f), 30)
                    .compose()
                v.vibrate(composition)
            } else {
                val amp = if (hasAmplitudeControl)
                    ((0.5f + strength * 0.5f) * 255f).toInt().coerceIn(1, 255)
                else VibrationEffect.DEFAULT_AMPLITUDE
                val dur = (60L + (strength * 40).toLong())
                v.vibrate(VibrationEffect.createOneShot(dur, amp))
            }
        } catch (_: Throwable) {}

        onBeat(strength)
    }

    private fun emitFrame(normalized: FloatArray, intensity: Float, sharpness: Float) {
        for ((i, group) in JS_BAND_GROUPS.withIndex()) {
            var sum = 0f
            for (g in group) sum += normalized[g]
            uiBands[i] = sum / group.size
        }
        for (i in uiBands.indices) {
            uiBands[i] = min(Math.pow(uiBands[i].toDouble(), 0.55).toFloat() * 1.15f, 1f)
        }
        val amp = (uiBands[0] + uiBands[1] + uiBands[2] + uiBands[3]) / 4f
        onFrame(uiBands, amp, intensity, sharpness)
    }

    // ---- Pure Kotlin radix-2 Cooley-Tukey FFT (in-place). Fine for 2048 samples. ----

    private fun fft(re: FloatArray, im: FloatArray) {
        val n = re.size
        // Bit-reverse permutation
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) {
                j = j xor bit
                bit = bit shr 1
            }
            j = j or bit
            if (i < j) {
                val tr = re[i]; re[i] = re[j]; re[j] = tr
                val ti = im[i]; im[i] = im[j]; im[j] = ti
            }
        }
        // Butterflies
        var size = 2
        while (size <= n) {
            val halfsize = size shr 1
            val angleStep = -2.0 * Math.PI / size
            var i = 0
            while (i < n) {
                var k = 0
                while (k < halfsize) {
                    val angle = angleStep * k
                    val wr = Math.cos(angle).toFloat()
                    val wi = Math.sin(angle).toFloat()
                    val iEven = i + k
                    val iOdd = iEven + halfsize
                    val tre = wr * re[iOdd] - wi * im[iOdd]
                    val tim = wr * im[iOdd] + wi * re[iOdd]
                    re[iOdd] = re[iEven] - tre
                    im[iOdd] = im[iEven] - tim
                    re[iEven] += tre
                    im[iEven] += tim
                    k++
                }
                i += size
            }
            size = size shl 1
        }
    }

    private fun hannWindow(n: Int): FloatArray {
        val w = FloatArray(n)
        for (i in 0 until n) {
            w[i] = (0.5 * (1.0 - Math.cos(2.0 * Math.PI * i / (n - 1)))).toFloat()
        }
        return w
    }
}
