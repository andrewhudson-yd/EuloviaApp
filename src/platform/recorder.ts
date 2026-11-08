import { IOSOutputFormat, AudioQuality, type AudioRecorder, type RecordingOptions, setAudioModeAsync } from 'expo-audio';
import type { Recorder } from '../core/recordingSession';
import { keepRecording } from './files';

/**
 * Speech-quality settings: AAC, mono, 16 kHz, 48 kbit/s ≈ 11 MB per 30-minute part — clear for
 * transcription and comfortably under the provider's per-file limit.
 */
export const SPEECH_RECORDING: RecordingOptions = {
    extension: '.m4a',
    sampleRate: 16000,
    numberOfChannels: 1,
    bitRate: 48000,
    directory: 'document',
    android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
    ios: { outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.HIGH, linearPCMBitDepth: 16, linearPCMIsBigEndian: false, linearPCMIsFloat: false },
    web: { mimeType: 'audio/webm', bitsPerSecond: 48000 },
};

/** Keep recording with the screen locked; stop other apps' audio while we record. */
export async function enableRecordingAudioMode(): Promise<void> {
    await setAudioModeAsync({
        allowsRecording: true,
        allowsBackgroundRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldPlayInBackground: true,
    });
}

export async function disableRecordingAudioMode(): Promise<void> {
    await setAudioModeAsync({ allowsRecording: false, allowsBackgroundRecording: false, shouldPlayInBackground: false });
}

/** Adapts expo-audio's recorder to the session's Recorder interface. */
export function expoRecorder(recorder: AudioRecorder): Recorder {
    let name = '';
    let lastMs = 0;
    return {
        async start(fileName) {
            name = fileName;
            lastMs = 0;
            await recorder.prepareToRecordAsync({ ...SPEECH_RECORDING, fileName });
            recorder.record();
        },
        pause() {
            recorder.pause();
        },
        resume() {
            recorder.record();
        },
        async stop() {
            const durationMs = Math.round(Math.max(lastMs, recorder.currentTime * 1000));
            await recorder.stop();
            if (!recorder.uri) throw new Error('The recording could not be saved.');
            return { uri: keepRecording(recorder.uri, name), durationMs };
        },
        currentMs() {
            lastMs = Math.max(lastMs, recorder.currentTime * 1000);
            return lastMs;
        },
    };
}
