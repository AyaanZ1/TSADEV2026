package com.resonate

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class MusicHapticModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "MusicHapticEngine"
        private const val EVENT_FRAME = "musicHapticFrame"
        private const val EVENT_BEAT = "musicHapticBeat"
    }

    override fun getName() = NAME

    @Volatile private var listenerCount = 0
    @Volatile private var intensitySetting = 72f
    @Volatile private var bassBoostSetting = 55f
    @Volatile private var trebleBoostSetting = 40f

    // supportedEvents isn't strictly required on Android, but RN checks against
    // these counts via the NativeEventEmitter listener-added hooks.
    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount += 1
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount = maxOf(0, listenerCount - count)
    }

    private var processor: MusicHapticProcessor? = null

    @ReactMethod
    fun setConfig(config: ReadableMap) {
        intensitySetting = readSetting(config, "intensity", intensitySetting)
        bassBoostSetting = readSetting(config, "bassBoost", bassBoostSetting)
        trebleBoostSetting = readSetting(config, "trebleBoost", trebleBoostSetting)
        processor?.updateConfig(intensitySetting, bassBoostSetting, trebleBoostSetting)
    }

    @ReactMethod
    fun start(promise: Promise) {
        if (processor != null) {
            promise.resolve(null)
            return
        }
        val emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        val proc = MusicHapticProcessor(
            context = reactContext.applicationContext,
            onFrame = frame@{ bands, amplitude, intensity, sharpness ->
                if (listenerCount == 0) {
                    return@frame
                }
                val payload = Arguments.createMap().apply {
                    val arr = Arguments.createArray()
                    for (b in bands) arr.pushDouble(b.toDouble())
                    putArray("bands", arr)
                    putDouble("amplitude", amplitude.toDouble())
                    putDouble("intensity", intensity.toDouble())
                    putDouble("sharpness", sharpness.toDouble())
                }
                emitter.emit(EVENT_FRAME, payload)
            },
            onBeat = beat@{ strength ->
                if (listenerCount == 0) {
                    return@beat
                }
                val payload = Arguments.createMap().apply {
                    putDouble("strength", strength.toDouble())
                }
                emitter.emit(EVENT_BEAT, payload)
            },
        )
        try {
            proc.updateConfig(intensitySetting, bassBoostSetting, trebleBoostSetting)
            proc.start()
            processor = proc
            promise.resolve(null)
        } catch (e: Throwable) {
            promise.reject("MUSIC_HAPTIC_START", e.message, e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        processor?.stop()
        processor = null
        promise.resolve(null)
    }

    private fun readSetting(config: ReadableMap, key: String, fallback: Float): Float {
        if (!config.hasKey(key) || config.isNull(key)) {
            return fallback
        }
        return config.getDouble(key).toFloat().coerceIn(0f, 100f)
    }
}
