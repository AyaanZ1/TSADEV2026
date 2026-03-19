package com.resonate

import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
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
    private var audioRecord: AudioRecord? = null
    private var isListening = false
    private var hasResolved = false
    private var pendingPromise: Promise? = null

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var recordingJob: Job? = null
    private var collectionJob: Job? = null
    private var timeoutJob: Job? = null

    @ReactMethod
    fun identify(token: String, promise: Promise) {
        if (isListening) {
            promise.reject("BUSY", "Recognition session already active")
            return
        }

        // Check mic permission
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
            cleanup()
        }
    }

    private fun startListening() {
        isListening = true

        // Collect match results from the streaming session
        collectionJob = scope.launch {
            streamingSession?.recognitionResults()?.collectLatest { matchResult ->
                when (matchResult) {
                    is MatchResult.Match -> {
                        stopListening()
                        if (!hasResolved) {
                            hasResolved = true
                            val item = matchResult.matchedMediaItems.firstOrNull()
                            if (item != null) {
                                val map = Arguments.createMap().apply {
                                    putString("title", item.title ?: "")
                                    putString("artist", item.artist ?: "")
                                    putString("artworkURL", item.artworkURL?.toString() ?: "")
                                    putArray("genres", Arguments.fromList(item.genres))
                                    // predictedCurrentMatchOffset is in seconds on Android
                                    // (matches iOS TimeInterval convention)
                                    val offset = item.predictedCurrentMatchOffset?.toDouble() ?: 0.0
                                    putDouble("matchOffset", offset)
                                }
                                pendingPromise?.resolve(map)
                            } else {
                                pendingPromise?.reject("NO_MATCH", "No media items found")
                            }
                            cleanup()
                        }
                    }
                    is MatchResult.NoMatch -> {
                        // Keep listening until timeout or match
                    }
                    is MatchResult.Error -> {
                        // Keep listening, individual errors are ok
                    }
                }
            }
        }

        // Record mic audio and feed it to the streaming session
        recordingJob = scope.launch(Dispatchers.IO) {
            val bufferSize = AudioRecord.getMinBufferSize(
                44100,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT
            )

            val recorder = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                44100,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                bufferSize
            )
            audioRecord = recorder

            try {
                recorder.startRecording()
                val buffer = ByteArray(bufferSize)

                while (isListening && isActive) {
                    val bytesRead = recorder.read(buffer, 0, buffer.size)
                    if (bytesRead > 0) {
                        streamingSession?.matchStream(buffer, bytesRead, System.currentTimeMillis())
                    }
                }
            } finally {
                recorder.stop()
                recorder.release()
                audioRecord = null
            }
        }
    }

    private fun stopListening() {
        timeoutJob?.cancel()
        isListening = false
        recordingJob?.cancel()
        collectionJob?.cancel()
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
