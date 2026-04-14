package com.resonate

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*
import com.shazam.shazamkit.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collectLatest

class ShazamKitRecognitionModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "ShazamKitRecognition"
    }

    override fun getName() = NAME

    private var streamingSession: StreamingSession? = null
    private var subscriberId: String? = null
    private var isListening = false
    private var hasResolved = false
    private var pendingPromise: Promise? = null

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var collectionJob: Job? = null
    private var timeoutJob: Job? = null

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
        pendingPromise = promise

        val tokenProvider = DeveloperTokenProvider {
            DeveloperToken(token)
        }
        val catalog = ShazamKit.createShazamCatalog(tokenProvider)

        val result = ShazamKit.createStreamingSession(
            catalog,
            AudioSampleRateInHz.SAMPLE_RATE_44100,
            4096
        )

        when (result) {
            is ShazamKitResult.Success -> {
                streamingSession = result.data
                startListening()
                startTimeout()
            }
            is ShazamKitResult.Failure -> {
                hasResolved = true
                promise.reject("SESSION_ERROR", "Failed to create ShazamKit session")
                cleanup()
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
                        if (!hasResolved) {
                            hasResolved = true
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
                    is MatchResult.NoMatch -> { /* keep listening */ }
                    is MatchResult.Error -> { /* keep listening */ }
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
    }
}
