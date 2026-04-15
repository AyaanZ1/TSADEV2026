package com.resonate

import android.Manifest
import android.content.pm.PackageManager
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.shazam.shazamkit.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collectLatest

class ShazamKitRecognitionModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ShazamKitRecognition"
        private const val TAG = "ShazamKitRecognition"
        private const val MATCH_EVENT_MIN_INTERVAL_MS = 900L
        private const val MATCH_EVENT_MIN_OFFSET_DELTA_MS = 750.0
    }

    override fun getName() = NAME

    private var streamingSession: StreamingSession? = null
    private var subscriberId: String? = null
    private var isListening = false
    private var hasResolved = false
    private var matched = false
    private var signatureCount = 0
    private var pendingPromise: Promise? = null
    @Volatile private var listenerCount = 0
    private var lastEmittedSongKey = ""
    private var lastEmittedMatchOffsetMs = Double.NaN
    private var lastEmittedMatchRealtimeMs = 0L

    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private var collectionJob: Job? = null
    private var timeoutJob: Job? = null

    @ReactMethod
    fun addListener(eventName: String) {
        listenerCount += 1
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        listenerCount = maxOf(0, listenerCount - count)
    }

    @ReactMethod
    fun identify(token: String, promise: Promise) {
        if (isListening) {
            promise.reject("BUSY", "Recognition session already active")
            return
        }

        val hasMicPermission = ContextCompat.checkSelfPermission(
            reactContext, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        if (!hasMicPermission) {
            promise.reject("PERMISSION", "Microphone permission not granted")
            return
        }

        hasResolved = false
        matched = false
        signatureCount = 0
        lastEmittedSongKey = ""
        lastEmittedMatchOffsetMs = Double.NaN
        lastEmittedMatchRealtimeMs = 0L
        pendingPromise = promise

        val tokenProvider = DeveloperTokenProvider {
            DeveloperToken(token)
        }
        val catalog = ShazamKit.createShazamCatalog(tokenProvider)

        scope.launch {
            try {
                when (
                    val result = ShazamKit.createStreamingSession(
                        catalog,
                        AudioSampleRateInHz.SAMPLE_RATE_44100,
                        4096
                    )
                ) {
                    is ShazamKitResult.Success -> {
                        streamingSession = result.data
                        startListening()
                        startTimeout()
                    }
                    is ShazamKitResult.Failure -> {
                        rejectWithSessionFailure(result.reason)
                    }
                }
            } catch (error: Throwable) {
                rejectWithThrowable("SESSION_ERROR", "Failed to create ShazamKit session", error)
            }
        }
    }

    @ReactMethod
    fun stop() {
        stopListening()
        if (!hasResolved) {
            hasResolved = true
            pendingPromise?.reject("CANCELLED", "Recognition cancelled by user")
        }
        cleanup()
    }

    private fun startListening() {
        isListening = true

        collectionJob = scope.launch {
            streamingSession?.recognitionResults()?.collectLatest { matchResult ->
                when (matchResult) {
                    is MatchResult.Match -> {
                        emitMatch(matchResult)
                        if (!hasResolved) {
                            hasResolved = true
                            matched = true
                            timeoutJob?.cancel()
                            timeoutJob = null
                            val item = matchResult.matchedMediaItems.firstOrNull()
                            if (item != null) {
                                val map = Arguments.createMap().apply {
                                    putString("title", item.title ?: "")
                                    putString("artist", item.artist ?: "")
                                    putString("artworkURL", item.artworkURL?.toString() ?: "")
                                    putArray("genres", Arguments.fromList(item.genres))
                                    val offset = item.predictedCurrentMatchOffset?.toDouble() ?: 0.0
                                    putDouble("matchOffset", offset)
                                }
                                pendingPromise?.resolve(map)
                            } else {
                                pendingPromise?.reject("NO_MATCH", "No media items found")
                            }
                            pendingPromise = null
                        }
                    }
                    is MatchResult.NoMatch -> {
                        if (!matched) {
                            signatureCount += 1
                            emitDiagnostics(
                                Arguments.createMap().apply {
                                    putDouble("amplitude", -1.0)
                                    putInt("sigs", signatureCount)
                                }
                            )
                        }
                    }
                    is MatchResult.Error -> {
                        if (!matched) {
                            signatureCount += 1
                            emitDiagnostics(
                                Arguments.createMap().apply {
                                    putDouble("amplitude", -1.0)
                                    putInt("sigs", signatureCount)
                                    humanMatchErrorMessage(matchResult.exception)?.let {
                                        putString("error", it)
                                    }
                                }
                            )
                        }
                        if (!hasResolved) {
                            rejectWithMatchFailure(matchResult.exception)
                            stopListening()
                            cleanup()
                        }
                    }
                }
            }
        }

        subscriberId = AudioCaptureCoordinator.addSubscriber { bytes, bytesRead ->
            if (!isListening) return@addSubscriber
            try {
                streamingSession?.matchStream(bytes, bytesRead, System.currentTimeMillis())
            } catch (_: Throwable) {}
        }
    }

    private fun stopListening() {
        timeoutJob?.cancel()
        isListening = false
        collectionJob?.cancel()
        subscriberId?.let { AudioCaptureCoordinator.removeSubscriber(it) }
        subscriberId = null
    }

    private fun startTimeout() {
        timeoutJob = scope.launch {
            delay(45_000)
            stopListening()
            if (!hasResolved) {
                hasResolved = true
                pendingPromise?.reject("TIMEOUT", "No song recognized within 45 seconds")
                cleanup()
            }
        }
    }

    private fun cleanup() {
        pendingPromise = null
        streamingSession = null
        signatureCount = 0
        matched = false
        lastEmittedSongKey = ""
        lastEmittedMatchOffsetMs = Double.NaN
        lastEmittedMatchRealtimeMs = 0L
    }

    private fun emitMatch(matchResult: MatchResult.Match) {
        val item = matchResult.matchedMediaItems.firstOrNull() ?: return
        val offset = item.predictedCurrentMatchOffset?.toDouble() ?: 0.0
        val songKey = "${item.title ?: ""}::${item.artist ?: ""}"
        val now = SystemClock.elapsedRealtime()
        val isSameSong = songKey == lastEmittedSongKey
        val offsetDelta = kotlin.math.abs(offset - lastEmittedMatchOffsetMs)
        val tooSoon = now - lastEmittedMatchRealtimeMs < MATCH_EVENT_MIN_INTERVAL_MS

        if (
            isSameSong &&
            !lastEmittedMatchOffsetMs.isNaN() &&
            tooSoon &&
            offsetDelta < MATCH_EVENT_MIN_OFFSET_DELTA_MS
        ) {
            return
        }

        lastEmittedSongKey = songKey
        lastEmittedMatchOffsetMs = offset
        lastEmittedMatchRealtimeMs = now

        emitEvent(
            "shazamMatch",
            Arguments.createMap().apply {
                putString("title", item.title ?: "")
                putString("artist", item.artist ?: "")
                putString("artworkURL", item.artworkURL?.toString() ?: "")
                putArray("genres", Arguments.fromList(item.genres))
                putDouble("matchOffset", offset)
            }
        )
    }

    private fun emitDiagnostics(payload: WritableMap) {
        emitEvent("shazamAmplitude", payload)
    }

    private fun emitEvent(eventName: String, payload: WritableMap) {
        if (listenerCount <= 0) {
            return
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, payload)
    }

    private fun rejectWithSessionFailure(reason: ShazamKitException) {
        val internalError = reason.internalError.name
        val detail = reason.cause?.message ?: reason.message ?: internalError
        Log.e(TAG, "Failed to create ShazamKit session: $internalError - $detail", reason)
        hasResolved = true
        pendingPromise?.reject("SESSION_ERROR_$internalError", "Failed to create ShazamKit session: $detail", reason)
        cleanup()
    }

    private fun rejectWithMatchFailure(error: ShazamKitMatchException) {
        val matchError = error.matchError.name
        val detail = humanMatchErrorMessage(error) ?: error.cause?.message ?: error.message ?: matchError
        Log.e(TAG, "Shazam match failed: $matchError - $detail", error)
        hasResolved = true
        pendingPromise?.reject("MATCH_ERROR_$matchError", "Shazam match failed: $detail", error)
    }

    private fun rejectWithThrowable(code: String, message: String, error: Throwable) {
        val detail = error.message ?: error.javaClass.simpleName
        Log.e(TAG, "$message: $detail", error)
        hasResolved = true
        pendingPromise?.reject(code, "$message: $detail", error)
        cleanup()
    }

    private fun humanMatchErrorMessage(error: ShazamKitMatchException): String? {
        return when (error.matchError) {
            MatchError.PROVIDED_EMPTY_AUDIO_DATA ->
                "Keep the mic steady. Audio is too short to match."
            MatchError.MATCH_ATTEMPT_FAILED ->
                error.cause?.message ?: "Can't reach Shazam servers. Check your internet connection."
            MatchError.UNAUTHORIZED ->
                "Shazam authorization failed. Check your developer token."
            MatchError.INVALID_SIGNATURE,
            MatchError.INVALID_SIGNATURE_DURATION ->
                "Invalid audio signature."
            else -> error.cause?.message ?: error.message
        }
    }
}
