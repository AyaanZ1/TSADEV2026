package com.resonate

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

// Mirror of iOS AudioTapCoordinator: one AudioRecord, shared across ShazamKit
// recognition and MusicHapticProcessor so transitioning between them doesn't
// tear down and restart a recorder (~100–300 ms gap the user can feel).
//
// Subscribers receive raw PCM buffers (16-bit little-endian mono) as they
// arrive from the hardware. Engine stays alive while at least one subscriber
// is registered.
object AudioCaptureCoordinator {

    const val SAMPLE_RATE = 44_100
    const val BUFFER_FRAMES = 2048 // per-read chunk

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val subscribers = ConcurrentHashMap<String, (ByteArray, Int) -> Unit>()
    private var readJob: Job? = null
    @Volatile private var recorder: AudioRecord? = null

    @Synchronized
    fun addSubscriber(onBuffer: (ByteArray, Int) -> Unit): String {
        val id = UUID.randomUUID().toString()
        subscribers[id] = onBuffer
        if (readJob == null) startRecording()
        return id
    }

    @Synchronized
    fun removeSubscriber(id: String) {
        subscribers.remove(id)
        if (subscribers.isEmpty()) stopRecording()
    }

    private fun startRecording() {
        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT
        )
        val bufSize = maxOf(minBuf, BUFFER_FRAMES * 2)

        val rec = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufSize
        )
        recorder = rec

        readJob = scope.launch {
            val buffer = ByteArray(BUFFER_FRAMES * 2)
            try {
                rec.startRecording()
                while (isActive) {
                    val bytesRead = rec.read(buffer, 0, buffer.size)
                    if (bytesRead > 0) {
                        for ((_, cb) in subscribers) {
                            try { cb(buffer, bytesRead) } catch (_: Throwable) { /* isolate subscribers */ }
                        }
                    }
                }
            } catch (_: Throwable) {
                // Recorder might be yanked by another app / system; bail quietly.
            } finally {
                try { rec.stop() } catch (_: Throwable) {}
                rec.release()
                if (recorder === rec) recorder = null
            }
        }
    }

    private fun stopRecording() {
        readJob?.cancel()
        readJob = null
    }
}
