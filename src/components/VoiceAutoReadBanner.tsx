import React, { useState, useRef, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Sparkles,
  Play,
  Square,
  BellRing,
  Gauge,
  FileText,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Activity,
  Terminal,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Sliders,
  HelpCircle,
  Loader2,
} from 'lucide-react';
import { voiceService, VoiceState } from '../services/voiceService';

interface VoiceAutoReadBannerProps {
  isSpeaking: boolean;
  onPlayForecast: () => void;
  onStopForecast: () => void;
  locationName: string;
  audioUrl?: string | null;
  forecastScript?: string;
}

export const VoiceAutoReadBanner: React.FC<VoiceAutoReadBannerProps> = ({
  isSpeaking,
  onPlayForecast,
  onStopForecast,
  locationName,
  audioUrl,
  forecastScript = '',
}) => {
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [activeSentence, setActiveSentence] = useState<string>('');
  const [rate, setRate] = useState<number>(0.9);
  const [volume, setVolume] = useState<number>(1.0);
  const [activeEngine, setActiveEngine] = useState<string>('idle');
  const [preferredEngine, setPreferredEngine] = useState<string>('auto');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [audioCtxState, setAudioCtxState] = useState<string>('unknown');
  const [lastError, setLastError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [showTroubleshoot, setShowTroubleshoot] = useState<boolean>(false);
  const [isTestingSound, setIsTestingSound] = useState<boolean>(false);
  const [showTranscript, setShowTranscript] = useState<boolean>(false);
  const [isIframe, setIsIframe] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Check if running inside an iframe (like AI Studio preview)
  useEffect(() => {
    try {
      setIsIframe(window.self !== window.top);
    } catch {
      setIsIframe(true);
    }
  }, []);

  // Subscribe to real-time voice updates and attach audio element
  useEffect(() => {
    if (audioRef.current) {
      voiceService.attachAudioElement(audioRef.current);
    }
    const unsub = voiceService.subscribe((state: VoiceState) => {
      setIsLoadingAudio(state.isLoadingAudio);
      setActiveSentence(state.activeSentence);
      setRate(state.rate);
      setVolume(state.volume);
      setActiveEngine(state.activeEngine);
      setPreferredEngine(state.preferredEngine);
      setAudioLevel(state.audioLevel);
      setAudioCtxState(state.audioContextState);
      setLastError(state.lastError);
      setDebugLogs(state.debugLogs);
    });
    return () => {
      unsub();
      voiceService.attachAudioElement(null);
    };
  }, []);

  // Update audio source safely without interrupting in-flight playback
  useEffect(() => {
    const el = audioRef.current;
    if (el && audioUrl) {
      if (!el.src || !el.src.includes('/api/tts')) {
        el.src = audioUrl;
      }
    }
  }, [audioUrl]);

  // One-click sound test: plays real PCM WAV + Web Audio + OS speech
  const handleTestSpeaker = async () => {
    setIsTestingSound(true);
    await voiceService.playHardwareSoundCheck();
    setTimeout(() => {
      setIsTestingSound(false);
    }, 2200);
  };

  const handleRateChange = (newRate: number) => {
    setRate(newRate);
    voiceService.setRate(newRate);
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    voiceService.setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  const handleEngineSelect = (engine: 'auto' | 'html5_mp3' | 'web_speech') => {
    voiceService.setPreferredEngine(engine);
  };

  const directStreamUrl =
    audioUrl || (forecastScript ? `/api/tts?text=${encodeURIComponent(forecastScript)}` : null);

  const getEngineBadge = () => {
    switch (activeEngine) {
      case 'html5_mp3':
        return { label: 'Real MP3 Audio Stream', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
      case 'web_speech':
        return { label: 'Device Speech Engine', color: 'bg-purple-100 text-purple-900 border-purple-300' };
      case 'sound_check':
        return { label: 'Hardware Sound Check (WAV)', color: 'bg-blue-100 text-blue-900 border-blue-300' };
      case 'synth_chime':
        return { label: 'Audio Hardware Chime', color: 'bg-amber-100 text-amber-900 border-amber-300' };
      default:
        return { label: 'Audio Ready', color: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  const badge = getEngineBadge();

  return (
    <div
      id="voice-autoread-banner"
      className="mb-6 rounded-3xl p-4 sm:p-6 border-2 shadow-sm transition-all bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border-emerald-300"
    >
      {/* Top Row: Title, Location, and Status */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-emerald-200/70">
        <div className="flex items-center gap-3.5">
          <div
            className={`w-13 h-13 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-all ${
              isSpeaking
                ? 'bg-amber-500 text-white ring-4 ring-amber-200 animate-pulse'
                : isLoadingAudio
                ? 'bg-emerald-500 text-white animate-spin'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {isLoadingAudio ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : isSpeaking ? (
              <VolumeX className="w-7 h-7" />
            ) : (
              <Volume2 className="w-7 h-7" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-600/15 text-emerald-900 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                Real Voice Forecast
              </span>
              <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                📍 {locationName}
              </span>
              <span className="text-xs font-bold text-emerald-800 bg-emerald-100/90 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Hardware Audio Output
              </span>
              {/* Sound Active & Signal Indicator */}
              {isSpeaking && (
                <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-200 text-amber-900 border border-amber-300">
                  <span className="flex items-end gap-1 h-3.5">
                    <span
                      className="w-1 bg-amber-700 rounded-full transition-all duration-75"
                      style={{ height: `${Math.max(4, Math.min(14, (audioLevel / 100) * 14))}px` }}
                    />
                    <span
                      className="w-1 bg-amber-700 rounded-full transition-all duration-75"
                      style={{ height: `${Math.max(6, Math.min(14, (audioLevel / 80) * 14))}px` }}
                    />
                    <span
                      className="w-1 bg-amber-700 rounded-full transition-all duration-75"
                      style={{ height: `${Math.max(3, Math.min(14, (audioLevel / 120) * 14))}px` }}
                    />
                    <span
                      className="w-1 bg-amber-700 rounded-full transition-all duration-75"
                      style={{ height: `${Math.max(5, Math.min(14, (audioLevel / 90) * 14))}px` }}
                    />
                  </span>
                  <span>Audio Playing Loud</span>
                </span>
              )}
            </div>
            <p className="text-base sm:text-lg font-bold text-slate-900 mt-1">
              {isLoadingAudio ? (
                <span className="text-emerald-800 font-extrabold flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                  Connecting real audio stream from station...
                </span>
              ) : isSpeaking ? (
                <span className="text-amber-900 font-extrabold flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                  Reading aloud today's weather & joint comfort forecast...
                </span>
              ) : (
                <span>Listen to today's barometric pressure & arthritis forecast read aloud</span>
              )}
            </p>
          </div>
        </div>

        {/* Big Action Buttons */}
        <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap sm:flex-nowrap">
          {/* Main Play / Stop Button */}
          {isSpeaking ? (
            <button
              id="btn-banner-stop-voice"
              onClick={onStopForecast}
              className="flex-1 sm:flex-none px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-base shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 border-2 border-amber-400"
            >
              <Square className="w-5 h-5 fill-white" />
              <span>Stop Audio</span>
            </button>
          ) : (
            <button
              id="btn-banner-play-voice"
              onClick={onPlayForecast}
              disabled={isLoadingAudio}
              className="flex-1 sm:flex-none px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 border-2 border-emerald-500 disabled:opacity-75"
            >
              {isLoadingAudio ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Connecting Stream...</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-white" />
                  <span>🔊 Talk Daily Forecast</span>
                </>
              )}
            </button>
          )}

          {/* Test Speaker Button (Plays real PCM WAV file + Web Audio chime + Speech check) */}
          <button
            id="btn-test-speaker"
            onClick={handleTestSpeaker}
            disabled={isTestingSound}
            title="Play an authentic sound check file directly to verify speakers"
            className="px-4 py-3 rounded-2xl bg-white hover:bg-slate-50 border-2 border-emerald-300 text-emerald-900 font-bold text-sm shadow-2xs transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 shrink-0"
          >
            <BellRing className={`w-4 h-4 text-emerald-600 ${isTestingSound ? 'animate-bounce' : ''}`} />
            <span>{isTestingSound ? 'Playing Sound...' : '🔔 Sound Check'}</span>
          </button>
        </div>
      </div>

      {/* Embedded Native Audio Controls Bar & Speech Preferences */}
      <div className="mt-4 pt-3 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white/80 p-3 sm:p-4 rounded-2xl border border-emerald-200/90 shadow-2xs">
        {/* Native HTML5 Audio Controller Widget */}
        <div className="flex items-center gap-2.5 flex-1 min-w-[240px]">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">
            Audio Bar:
          </span>
          <audio
            id="forecast-audio-player"
            ref={audioRef}
            controls
            preload="auto"
            className="w-full h-10 accent-emerald-600 rounded-lg"
          />
        </div>

        {/* Speed & Volume Sliders for Seniors */}
        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap justify-between sm:justify-end shrink-0 text-sm">
          {/* Speed Presets */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <Gauge className="w-4 h-4 text-slate-500 ml-1.5" />
            <button
              id="btn-voice-speed-slow"
              onClick={() => handleRateChange(0.8)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                rate <= 0.85
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              0.8x Slower
            </button>
            <button
              id="btn-voice-speed-normal"
              onClick={() => handleRateChange(1.0)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                rate > 0.85
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1.0x Normal
            </button>
          </div>

          {/* Volume Slider */}
          <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
            {volume === 0 ? (
              <VolumeX className="w-4 h-4 text-slate-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-600" />
            )}
            <input
              id="voice-volume-slider"
              aria-label="Spoken audio volume slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-20 h-1.5 accent-emerald-600 bg-slate-300 rounded-lg cursor-pointer"
            />
            <span className="text-xs font-bold text-slate-600 w-8 text-right">
              {Math.round(volume * 100)}%
            </span>
          </div>

          {/* Transcript Toggle Button */}
          <button
            id="btn-toggle-transcript"
            onClick={() => setShowTranscript(!showTranscript)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>Transcript</span>
            {showTranscript ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Audio Engine Status Bar & Diagnostic Controls */}
      <div className="mt-3 pt-2 pb-1 border-t border-emerald-200/60 flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-600 flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            Engine:
          </span>
          <span className={`px-2.5 py-0.5 rounded-full font-bold border text-xs ${badge.color}`}>
            {badge.label}
          </span>
          <span className="text-slate-500 font-medium">
            AudioContext: <strong className={audioCtxState === 'running' ? 'text-emerald-700' : 'text-amber-700'}>{audioCtxState}</strong>
          </span>
          {audioLevel > 0 && (
            <span className="text-emerald-700 font-semibold bg-emerald-100/70 px-2 py-0.5 rounded-md">
              Signal: {audioLevel}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {lastError && (
            <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-xs font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-500" />
              {lastError}
            </span>
          )}

          {/* Quick Troubleshooting Guide Toggle */}
          <button
            id="btn-toggle-troubleshoot"
            onClick={() => setShowTroubleshoot(!showTroubleshoot)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold border border-amber-300 transition cursor-pointer"
            title="Audio troubleshooting guide"
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
            <span>Audio Help {showTroubleshoot ? '▲' : '▼'}</span>
          </button>

          {/* Audio Debug Toggle */}
          <button
            id="btn-toggle-audio-debug"
            onClick={() => setShowDebug(!showDebug)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 transition cursor-pointer"
            title="Show audio stream diagnostics and execution logs"
          >
            <Terminal className="w-3.5 h-3.5 text-slate-600" />
            <span>Audio Logs {showDebug ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>

      {/* No Sound Troubleshooting Panel */}
      {showTroubleshoot && (
        <div className="mt-3 p-4 rounded-2xl bg-amber-50/95 border-2 border-amber-300 text-slate-800 text-sm shadow-sm animate-fadeIn">
          <div className="flex items-center justify-between pb-2 border-b border-amber-200 mb-3">
            <h4 className="font-extrabold text-amber-950 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Real Audio Hardware Output Guide
            </h4>
            <span className="text-xs font-semibold text-amber-800 bg-amber-200/80 px-2.5 py-0.5 rounded-full">
              Speaker Output
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="space-y-2 bg-white/80 p-3 rounded-xl border border-amber-200">
              <p className="font-bold text-slate-900">1. Hardware & System Sound Checks:</p>
              <ul className="list-disc list-inside space-y-1 text-slate-700">
                <li>Verify your computer or phone master volume is turned up.</li>
                <li>Ensure external headphones or Bluetooth speakers are disconnected or unmuted.</li>
                <li>Verify the browser tab is not muted (Right-click tab &gt; "Unmute site").</li>
              </ul>
            </div>

            <div className="space-y-2 bg-white/80 p-3 rounded-xl border border-amber-200">
              <p className="font-bold text-slate-900">2. Instant Audio Tests (Click to hear sound):</p>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleTestSpeaker}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition cursor-pointer"
                  title="Plays real PCM WAV file and Web Audio chime"
                >
                  🔔 Sound Check (WAV)
                </button>
                <button
                  onClick={() => voiceService.playPureTone(440, 1.2)}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold transition cursor-pointer"
                  title="Plays 440Hz sine wave tone"
                >
                  📢 440Hz Pure Tone
                </button>
                <button
                  onClick={() => voiceService.speakTestSpeech()}
                  className="px-2.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold transition cursor-pointer"
                  title="Speaks test phrase using local OS voice"
                >
                  🗣️ Device Voice
                </button>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-amber-200/70 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-700">Voice Engine:</span>
              <button
                onClick={() => handleEngineSelect('html5_mp3')}
                className={`px-2 py-1 rounded-md font-bold transition cursor-pointer ${
                  preferredEngine === 'html5_mp3' || preferredEngine === 'auto'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Natural Stream (MP3)
              </button>
              <button
                onClick={() => handleEngineSelect('web_speech')}
                className={`px-2 py-1 rounded-md font-bold transition cursor-pointer ${
                  preferredEngine === 'web_speech'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Device Local Voice
              </button>
            </div>

            {directStreamUrl && (
              <a
                href={directStreamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold text-emerald-700 hover:text-emerald-800 underline flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-emerald-300"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Direct MP3 Audio in New Tab ↗
              </a>
            )}
          </div>
        </div>
      )}

      {/* Audio Debug Log Drawer */}
      {showDebug && (
        <div className="mt-3 p-3.5 rounded-2xl bg-slate-900 text-slate-100 text-xs font-mono border border-slate-700 shadow-inner">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-emerald-400">Audio System Diagnostics & Live Logs</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestSpeaker}
                className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-sans text-xs font-bold transition cursor-pointer"
              >
                Test Sound
              </button>
              <button
                onClick={() => voiceService.playPureTone(440, 1.0)}
                className="px-2 py-0.5 rounded bg-amber-700 hover:bg-amber-600 text-white font-sans text-xs font-bold transition cursor-pointer"
              >
                440Hz Tone
              </button>
              <button
                onClick={() => {
                  voiceService.unlockAudio();
                  voiceService.addLog('Manual AudioContext unlock triggered.');
                }}
                className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-white font-sans text-xs font-bold transition cursor-pointer"
              >
                Unlock AudioContext
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-2 pb-2 border-b border-slate-800 text-[11px]">
            <div>
              <span className="text-slate-400">Engine:</span> <strong className="text-sky-300">{activeEngine}</strong>
            </div>
            <div>
              <span className="text-slate-400">AudioContext:</span> <strong className={audioCtxState === 'running' ? 'text-emerald-400' : 'text-amber-400'}>{audioCtxState}</strong>
            </div>
            <div>
              <span className="text-slate-400">Volume / Rate:</span> <strong className="text-amber-300">{Math.round(volume * 100)}% / {rate}x</strong>
            </div>
            <div>
              <span className="text-slate-400">Signal Level:</span> <strong className="text-emerald-300">{audioLevel}%</strong>
            </div>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
            {debugLogs.length === 0 ? (
              <div className="text-slate-500 italic">No events logged yet. Tap "Talk Daily Forecast" or "Sound Check".</div>
            ) : (
              debugLogs.map((log, idx) => (
                <div key={idx} className="text-slate-300 leading-relaxed font-mono">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Active Spoken Sentence Highlight (Karaoke style) */}
      {isSpeaking && activeSentence && (
        <div className="mt-3.5 p-3 sm:p-4 rounded-2xl bg-white/90 border-2 border-amber-300 shadow-sm transition-all animate-fadeIn">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
              Speaking Currently:
            </span>
          </div>
          <p className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
            "{activeSentence}"
          </p>
        </div>
      )}

      {/* Collapsible Full Transcript */}
      {showTranscript && (
        <div className="mt-4 p-4 rounded-2xl bg-white border border-emerald-200 text-slate-800 text-sm leading-relaxed shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
            <span className="font-bold text-slate-900 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              Full Spoken Script Transcript
            </span>
            <span className="text-xs text-slate-500">
              {forecastScript.length} characters
            </span>
          </div>
          <p className="whitespace-pre-line text-slate-700 font-medium">
            {forecastScript || 'No transcript generated yet.'}
          </p>
        </div>
      )}
    </div>
  );
};
