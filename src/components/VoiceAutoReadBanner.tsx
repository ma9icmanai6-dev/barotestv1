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
  const [activeSentence, setActiveSentence] = useState<string>('');
  const [rate, setRate] = useState<number>(0.9);
  const [volume, setVolume] = useState<number>(1.0);
  const [activeEngine, setActiveEngine] = useState<string>('idle');
  const [audioCtxState, setAudioCtxState] = useState<string>('unknown');
  const [lastError, setLastError] = useState<string | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [showDebug, setShowDebug] = useState<boolean>(false);
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
      setActiveSentence(state.activeSentence);
      setRate(state.rate);
      setVolume(state.volume);
      setActiveEngine(state.activeEngine);
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

  // One-click sound test: plays an audible chime using Web Audio API synchronously
  const handleTestSpeaker = () => {
    setIsTestingSound(true);
    voiceService.playTestChime();
    setTimeout(() => {
      setIsTestingSound(false);
    }, 1500);
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

  const directStreamUrl =
    audioUrl || (forecastScript ? `/api/tts?text=${encodeURIComponent(forecastScript)}` : null);

  const getEngineBadge = () => {
    switch (activeEngine) {
      case 'html5_mp3':
        return { label: 'MP3 Stream (HTML5)', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' };
      case 'webaudio_mp3':
        return { label: 'MP3 Stream (Web Audio)', color: 'bg-blue-100 text-blue-900 border-blue-300' };
      case 'web_speech':
        return { label: 'Local Voice Synth', color: 'bg-purple-100 text-purple-900 border-purple-300' };
      case 'synth_chime':
        return { label: 'Synth Alert Chime', color: 'bg-amber-100 text-amber-900 border-amber-300' };
      default:
        return { label: 'Standby / Ready', color: 'bg-slate-100 text-slate-700 border-slate-200' };
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
                : 'bg-emerald-600 text-white'
            }`}
          >
            {isSpeaking ? <VolumeX className="w-7 h-7" /> : <Volume2 className="w-7 h-7" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-emerald-600/15 text-emerald-900 uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                Spoken Voice Forecast
              </span>
              <span className="text-xs font-bold text-slate-700 bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                📍 {locationName}
              </span>
              {/* Sound Active Indicator */}
              {isSpeaking && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-200 text-amber-900">
                  <span className="flex items-end gap-0.5 h-3">
                    <span className="w-1 bg-amber-700 rounded-full animate-bounce h-3" />
                    <span className="w-1 bg-amber-700 rounded-full animate-bounce h-2" />
                    <span className="w-1 bg-amber-700 rounded-full animate-bounce h-3" />
                  </span>
                  Playing Audio
                </span>
              )}
            </div>
            <p className="text-base sm:text-lg font-bold text-slate-900 mt-1">
              {isSpeaking ? (
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
              className="flex-1 sm:flex-none px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 border-2 border-emerald-500"
            >
              <Play className="w-5 h-5 fill-white" />
              <span>🔊 Talk Daily Forecast</span>
            </button>
          )}

          {/* Test Speaker Button (Guaranteed Sound via Web Audio API Chime + Speech) */}
          <button
            id="btn-test-speaker"
            onClick={handleTestSpeaker}
            disabled={isTestingSound}
            title="Play an audible melodic chime and voice test to check speakers"
            className="px-4 py-3 rounded-2xl bg-white hover:bg-slate-50 border-2 border-emerald-300 text-emerald-900 font-bold text-sm shadow-2xs transition flex items-center justify-center gap-2 cursor-pointer active:scale-95 shrink-0"
          >
            <BellRing className={`w-4 h-4 text-emerald-600 ${isTestingSound ? 'animate-bounce' : ''}`} />
            <span>{isTestingSound ? 'Chiming...' : '🔔 Test Speaker'}</span>
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

      {/* Audio Engine Status Bar & Diagnostic Toggle */}
      <div className="mt-3 pt-2 pb-1 border-t border-emerald-200/60 flex items-center justify-between flex-wrap gap-2 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-600 flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-emerald-600" />
            Audio Engine:
          </span>
          <span className={`px-2.5 py-0.5 rounded-full font-bold border text-xs ${badge.color}`}>
            {badge.label}
          </span>
          <span className="text-slate-500 font-medium">
            AudioContext: <strong className={audioCtxState === 'running' ? 'text-emerald-700' : 'text-amber-700'}>{audioCtxState}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          {lastError && (
            <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md text-xs font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-rose-500" />
              {lastError}
            </span>
          )}
          <button
            id="btn-toggle-audio-debug"
            onClick={() => setShowDebug(!showDebug)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-300 transition cursor-pointer"
            title="Show audio stream diagnostics and execution logs"
          >
            <Terminal className="w-3 h-3 text-slate-600" />
            <span>Audio Debug {showDebug ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>

      {/* Audio Debug Log Drawer */}
      {showDebug && (
        <div className="mt-3 p-3.5 rounded-2xl bg-slate-900 text-slate-100 text-xs font-mono border border-slate-700 shadow-inner">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-emerald-400">Audio System Diagnostics & Live Logs</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestSpeaker}
                className="px-2 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-sans text-xs font-bold transition"
              >
                Test Chime + Voice
              </button>
              <button
                onClick={() => {
                  voiceService.unlockAudio();
                  voiceService.addLog('Manual AudioContext unlock triggered.');
                }}
                className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-white font-sans text-xs font-bold transition"
              >
                Unlock AudioContext
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2 pb-2 border-b border-slate-800 text-[11px]">
            <div>
              <span className="text-slate-400">Engine:</span> <strong className="text-sky-300">{activeEngine}</strong>
            </div>
            <div>
              <span className="text-slate-400">Context State:</span> <strong className="text-emerald-300">{audioCtxState}</strong>
            </div>
            <div>
              <span className="text-slate-400">Volume / Rate:</span> <strong className="text-amber-300">{Math.round(volume * 100)}% / {rate}x</strong>
            </div>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
            {debugLogs.length === 0 ? (
              <p className="text-slate-400 italic">No events logged yet. Press Talk Daily Forecast or Test Speaker.</p>
            ) : (
              debugLogs.map((log, i) => (
                <div key={i} className="leading-tight text-slate-300 flex items-start gap-1.5">
                  <span className="text-emerald-400 select-none">&gt;</span>
                  <span>{log}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Helper Bar: If running in iframe, offer Open in New Tab for 100% audio permission */}
      <div className="mt-2.5 flex items-center justify-between flex-wrap gap-2 text-xs font-medium text-slate-600 px-1">
        <div className="flex items-center gap-2">
          <span>💡 <strong>Audio Tip:</strong> Make sure computer volume is unmuted.</span>
          {isIframe && (
            <span className="text-emerald-800 font-semibold bg-emerald-100/80 px-2 py-0.5 rounded-md">
              Preview Mode Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {directStreamUrl && (
            <a
              id="btn-direct-audio-link"
              href={directStreamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-800 underline font-bold"
              title="Open audio file directly in browser player"
            >
              <ExternalLink className="w-3 h-3" />
              Listen in New Tab
            </a>
          )}
          <a
            id="btn-open-full-tab-audio"
            href={typeof window !== 'undefined' ? window.location.href : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shadow-2xs"
            title="Open in full browser window without iframe restrictions"
          >
            <ExternalLink className="w-3 h-3" />
            Open Full Window
          </a>
        </div>
      </div>

      {/* Active Spoken Sentence Highlight Banner */}
      {isSpeaking && activeSentence && (
        <div className="mt-3.5 p-3.5 sm:p-4 rounded-2xl bg-amber-100/90 border-2 border-amber-300 shadow-2xs animate-fadeIn flex items-start gap-3">
          <span className="text-xl shrink-0">💬</span>
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-900 block mb-0.5">
              Currently Speaking:
            </span>
            <p className="text-base sm:text-lg font-bold text-amber-950 leading-snug">
              "{activeSentence}"
            </p>
          </div>
        </div>
      )}

      {/* Spoken Text Transcript (Collapsible) */}
      {showTranscript && (
        <div className="mt-3.5 p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            Full Spoken Forecast Script
          </h4>
          <p className="text-base font-medium text-slate-800 leading-relaxed">
            {forecastScript ||
              "Hello! Here is today's joint health and weather guide. Barometric pressure and arthritis stiffness risk are calculated in real-time."}
          </p>
        </div>
      )}
    </div>
  );
};
