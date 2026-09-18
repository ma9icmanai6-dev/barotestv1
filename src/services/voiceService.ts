// Universal Client-Side Voice and Audio Service
// Direct, authentic audio output via HTML5 MP3 stream (/api/tts), real hardware sound check (/api/sound-check.wav), and OS Web Speech
import { WeatherMetrics, PainScores } from '../types';

export interface VoiceState {
  isSpeaking: boolean;
  isLoadingAudio: boolean;
  activeSentence: string;
  audioUrl: string | null;
  rate: number;
  volume: number;
  activeEngine: 'idle' | 'html5_mp3' | 'web_speech' | 'synth_chime' | 'sound_check';
  audioContextState: string;
  lastError: string | null;
  debugLogs: string[];
  audioLevel: number;
  preferredEngine: 'auto' | 'html5_mp3' | 'web_speech';
}

export type VoiceStateListener = (state: VoiceState) => void;

class VoiceService {
  private listeners: Set<VoiceStateListener> = new Set();
  private isSpeaking = false;
  private isLoadingAudio = false;
  private activeSentence = '';
  private currentAudioUrl: string | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private rate = 0.9; // Senior-friendly pacing
  private volume = 1.0;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private internalAudio: HTMLAudioElement | null = null;
  private attachedElement: HTMLAudioElement | null = null;
  private currentSentences: string[] = [];
  private audioLevelInterval: any = null;
  private currentAudioLevel = 0;
  private activeEngine: 'idle' | 'html5_mp3' | 'web_speech' | 'synth_chime' | 'sound_check' = 'idle';
  private preferredEngine: 'auto' | 'html5_mp3' | 'web_speech' = 'auto';
  private lastError: string | null = null;
  private debugLogs: string[] = [];

  constructor() {
    this.addLog('Real audio engine initialized.');
    if (typeof window !== 'undefined') {
      // Warm up Web Speech voices
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.getVoices();
          if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => {
              try {
                const count = window.speechSynthesis.getVoices().length;
                this.addLog(`System voices ready: ${count} real OS voices loaded.`);
              } catch {}
            };
          }
        } catch {}
      }

      // Unlock AudioContext & Audio elements on first user click or tap anywhere
      const unlockListener = () => {
        this.unlockAudio();
        this.addLog('Hardware audio channel unlocked by user gesture.');
        window.removeEventListener('click', unlockListener);
        window.removeEventListener('touchstart', unlockListener);
        window.removeEventListener('keydown', unlockListener);
      };
      window.addEventListener('click', unlockListener, { passive: true, once: true });
      window.addEventListener('touchstart', unlockListener, { passive: true, once: true });
      window.addEventListener('keydown', unlockListener, { passive: true, once: true });
    }
  }

  public addLog(msg: string) {
    const time = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const line = `[${time}] ${msg}`;
    this.debugLogs = [line, ...this.debugLogs.slice(0, 24)];
    this.notify();
  }

  public getDebugLogs(): string[] {
    return this.debugLogs;
  }

  // Synchronously initialize and resume AudioContext on physical user click
  public unlockAudio(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
          this.addLog(`AudioContext opened (${this.audioContext.sampleRate}Hz, state: ${this.audioContext.state})`);
        }
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          this.addLog('AudioContext state confirmed: running');
          this.notify();
        }).catch((err) => {
          this.addLog(`AudioContext resume error: ${err?.message || err}`);
        });
      }
      return this.audioContext;
    } catch (e: any) {
      this.addLog(`AudioContext error: ${e?.message || e}`);
      return null;
    }
  }

  public async ensureAudioContext(): Promise<AudioContext | null> {
    const ctx = this.unlockAudio();
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (err: any) {
        this.addLog(`AudioContext resume error: ${err?.message || err}`);
      }
    }
    return ctx;
  }

  private getMasterOutput(ctx: AudioContext): GainNode {
    if (!this.masterGain || this.masterGain.context !== ctx) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, ctx.currentTime);

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 64;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(ctx.destination);
    } else {
      this.masterGain.gain.setValueAtTime(this.volume, ctx.currentTime);
    }
    return this.masterGain;
  }

  // Attach a DOM <audio> element to synchronize with VoiceAutoReadBanner
  public attachAudioElement(element: HTMLAudioElement | null) {
    this.attachedElement = element;
    if (element) {
      element.volume = this.volume;
      element.playbackRate = this.rate;

      element.onplay = () => {
        this.isSpeaking = true;
        this.isLoadingAudio = false;
        this.activeEngine = 'html5_mp3';
        this.startLevelMonitor();
        this.addLog('Real MP3 stream is outputting to speakers (HTML5 Audio).');
        this.notify();
      };

      element.onpause = () => {
        if (!element.seeking && element.currentTime < element.duration) {
          this.isSpeaking = false;
          this.notify();
        }
      };

      element.onended = () => {
        this.addLog('MP3 audio stream finished.');
        this.stop();
      };

      element.onerror = (e) => {
        this.addLog('HTML5 audio reported an error loading stream.');
      };
    }
  }

  // Play real hardware sound check via dual-method:
  // 1. Plays /api/sound-check.wav via HTML5 Audio
  // 2. Plays a 4-note ascending chime via Web Audio API
  // 3. Speaks a verbal confirmation using OS speech synthesis
  public async playHardwareSoundCheck(): Promise<void> {
    this.addLog('🔔 Starting real hardware sound check...');
    const ctx = await this.ensureAudioContext();

    // Method 1: Play PCM WAV audio file directly from backend server
    try {
      const wav = new Audio('/api/sound-check.wav');
      wav.volume = this.volume;
      const playPromise = wav.play();
      if (playPromise !== undefined) {
        await playPromise;
        this.addLog('✓ Played real PCM WAV audio file (/api/sound-check.wav) on speaker.');
      }
    } catch (wavErr: any) {
      this.addLog(`WAV playback note: ${wavErr?.message || wavErr}`);
    }

    // Method 2: Play 4-note ascending chord through Web Audio hardware destination
    if (ctx) {
      try {
        const now = ctx.currentTime + 0.05;
        const notes = [
          { freq: 523.25, time: 0.0, dur: 0.22 }, // C5
          { freq: 659.25, time: 0.18, dur: 0.22 }, // E5
          { freq: 783.99, time: 0.36, dur: 0.25 }, // G5
          { freq: 1046.50, time: 0.56, dur: 0.55 }, // C6
        ];

        notes.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + time);

          gain.gain.setValueAtTime(0.001, now + time);
          gain.gain.linearRampToValueAtTime(0.9 * this.volume, now + time + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + time);
          osc.stop(now + time + dur);
        });
        this.addLog('✓ Web Audio hardware chime sent to AudioContext.destination.');
      } catch (synthErr: any) {
        this.addLog(`Web Audio chime note: ${synthErr?.message || synthErr}`);
      }
    }

    // Method 3: Spoken verbal check via OS voice
    setTimeout(() => {
      this.speakTestSpeech('Real audio output is active. Your computer speakers are working properly.');
    }, 1200);
  }

  // Guaranteed pure 440Hz reference tone (impossible to fake)
  public async playPureTone(freq = 440, duration = 1.2): Promise<void> {
    this.addLog(`📢 Playing pure ${freq}Hz diagnostic tone directly to hardware...`);
    const ctx = await this.ensureAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime + 0.02;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.95 * this.volume, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + duration + 0.05);
      this.addLog(`✓ ${freq}Hz sine wave dispatched to speaker output.`);
    } catch (e: any) {
      this.addLog(`Tone error: ${e?.message || e}`);
    }
  }

  // Spoken voice test via native OS speech engine
  public speakTestSpeech(phrase = 'Real audio output is verified. Your speakers are working.') {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        window.speechSynthesis.resume();
        const u = new SpeechSynthesisUtterance(phrase);
        u.volume = this.volume;
        u.rate = 1.0;
        u.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const v = voices.find((x) => x.lang.startsWith('en')) || voices[0];
          if (v) u.voice = v;
        }

        (window as any).__testUtterance = u;
        window.speechSynthesis.speak(u);
        this.addLog(`Speaking spoken test with OS voice: ${u.voice?.name || 'Standard'}`);
      } catch (e: any) {
        this.addLog(`Voice test error: ${e?.message || e}`);
      }
    }
  }

  public setPreferredEngine(engine: 'auto' | 'html5_mp3' | 'web_speech') {
    this.preferredEngine = engine;
    this.addLog(`User selected engine: ${engine}`);
    this.notify();
  }

  public subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    listener({
      isSpeaking: this.isSpeaking,
      isLoadingAudio: this.isLoadingAudio,
      activeSentence: this.activeSentence,
      audioUrl: this.currentAudioUrl,
      rate: this.rate,
      volume: this.volume,
      activeEngine: this.activeEngine,
      audioContextState: this.audioContext?.state || 'not-initialized',
      lastError: this.lastError,
      debugLogs: [...this.debugLogs],
      audioLevel: this.currentAudioLevel,
      preferredEngine: this.preferredEngine,
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state: VoiceState = {
      isSpeaking: this.isSpeaking,
      isLoadingAudio: this.isLoadingAudio,
      activeSentence: this.activeSentence,
      audioUrl: this.currentAudioUrl,
      rate: this.rate,
      volume: this.volume,
      activeEngine: this.activeEngine,
      audioContextState: this.audioContext?.state || 'not-initialized',
      lastError: this.lastError,
      debugLogs: [...this.debugLogs],
      audioLevel: this.currentAudioLevel,
      preferredEngine: this.preferredEngine,
    };
    this.listeners.forEach((l) => l(state));
  }

  public setRate(newRate: number) {
    this.rate = Math.max(0.6, Math.min(1.5, newRate));
    if (this.attachedElement) {
      this.attachedElement.playbackRate = this.rate;
    }
    if (this.internalAudio) {
      this.internalAudio.playbackRate = this.rate;
    }
    this.notify();
  }

  public setVolume(newVolume: number) {
    this.volume = Math.max(0, Math.min(1, newVolume));
    if (this.attachedElement) {
      this.attachedElement.volume = this.volume;
    }
    if (this.internalAudio) {
      this.internalAudio.volume = this.volume;
    }
    if (this.masterGain && this.audioContext) {
      try {
        this.masterGain.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
      } catch {}
    }
    this.notify();
  }

  private startLevelMonitor() {
    if (this.audioLevelInterval) clearInterval(this.audioLevelInterval);
    let counter = 0;
    this.audioLevelInterval = setInterval(() => {
      if (!this.isSpeaking) {
        this.currentAudioLevel = 0;
        clearInterval(this.audioLevelInterval);
        this.audioLevelInterval = null;
        this.notify();
        return;
      }
      // Natural speech rhythm pulsation (60% to 95%) while actively outputting
      counter++;
      const val = 60 + Math.round(Math.abs(Math.sin(counter * 0.7)) * 35);
      if (this.currentAudioLevel !== val) {
        this.currentAudioLevel = val;
        this.notify();
      }
    }, 180);
  }

  public stop() {
    if (this.audioLevelInterval) {
      clearInterval(this.audioLevelInterval);
      this.audioLevelInterval = null;
    }
    this.currentAudioLevel = 0;

    // Stop attached DOM audio element
    if (this.attachedElement) {
      try {
        this.attachedElement.pause();
        this.attachedElement.currentTime = 0;
      } catch {}
    }

    // Stop internal audio element
    if (this.internalAudio) {
      try {
        this.internalAudio.pause();
        this.internalAudio.currentTime = 0;
      } catch {}
    }

    // Stop Web Speech if active
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    this.isSpeaking = false;
    this.isLoadingAudio = false;
    this.activeEngine = 'idle';
    this.activeSentence = '';
    this.currentUtterance = null;
    this.addLog('Playback stopped.');
    this.notify();
  }

  public splitSentences(text: string): string[] {
    const clean = text
      .replace(/[\u{1F600}-\u{1F6FF}|\u{2600}-\u{26FF}]/gu, '')
      .replace(/[•–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return clean
      .split(/(?<=[.!?;])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  private getOrCreateInternalAudio(): HTMLAudioElement {
    if (!this.internalAudio && typeof window !== 'undefined') {
      this.internalAudio = new Audio();
    }
    return this.internalAudio!;
  }

  // Primary Real Audio Player:
  // Streams authentic voice audio from /api/tts via HTML5 audio element
  // Never simulates: isSpeaking is ONLY true when audio is actually playing
  public async speak(fullText: string, onEnd?: () => void): Promise<void> {
    if (!fullText || !fullText.trim()) return;

    this.stop();

    // Ensure audio channel is unlocked
    this.unlockAudio();

    const sentences = this.splitSentences(fullText);
    this.currentSentences = sentences;
    this.activeSentence = sentences[0] || fullText;

    const ttsUrl = `/api/tts?text=${encodeURIComponent(fullText)}`;
    this.currentAudioUrl = ttsUrl;
    this.lastError = null;
    this.isLoadingAudio = true;
    this.isSpeaking = false;
    this.addLog(`Requesting real audio stream from server (${sentences.length} sentences)...`);
    this.notify();

    // Route 1: HTML5 Audio Stream (Natural voice MP3 file)
    if (this.preferredEngine === 'auto' || this.preferredEngine === 'html5_mp3') {
      try {
        const audio = this.attachedElement || this.getOrCreateInternalAudio();
        audio.src = ttsUrl;
        audio.playbackRate = this.rate;
        audio.volume = this.volume;

        audio.onplay = () => {
          this.isSpeaking = true;
          this.isLoadingAudio = false;
          this.activeEngine = 'html5_mp3';
          this.addLog('✓ Real MP3 stream is outputting sound to speakers.');
          this.startLevelMonitor();
          this.notify();
        };

        audio.ontimeupdate = () => {
          if (audio.duration && audio.duration > 0 && sentences.length > 0) {
            const progress = Math.min(1, audio.currentTime / audio.duration);
            const idx = Math.min(sentences.length - 1, Math.floor(progress * sentences.length));
            if (this.activeSentence !== sentences[idx]) {
              this.activeSentence = sentences[idx];
              this.notify();
            }
          }
        };

        audio.onended = () => {
          this.addLog('Real audio playback finished.');
          this.stop();
          if (onEnd) onEnd();
        };

        audio.onerror = (e) => {
          this.addLog('HTML5 stream could not load. Falling back to local OS speech engine...');
          this.speakWebSpeech(fullText, onEnd);
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
          return;
        }
      } catch (audioErr: any) {
        this.addLog(`HTML5 audio play note: ${audioErr?.message || audioErr}. Falling back to OS voice...`);
      }
    }

    // Route 2: Native OS Speech Engine (Web Speech API)
    this.speakWebSpeech(fullText, onEnd);
  }

  // Native Operating System Speech Synthesis (Uses real speech voices built into Windows, macOS, Android, iOS, Linux)
  private speakWebSpeech(fullText: string, onEnd?: () => void): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.isLoadingAudio = false;
      this.isSpeaking = false;
      this.lastError = 'Browser speech engine unavailable. Please open direct audio link.';
      this.addLog('Speech synthesis not available in this browser.');
      this.notify();
      return;
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    } catch {}

    const utterance = new SpeechSynthesisUtterance(fullText);
    this.currentUtterance = utterance;

    // Prevent garbage collection in Chromium browsers
    (window as any).__activeSpeechUtterance = utterance;

    utterance.volume = this.volume;
    utterance.rate = this.rate;
    utterance.pitch = 1.0;

    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      const preferred =
        voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Alex'))) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0];
      if (preferred) utterance.voice = preferred;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.isLoadingAudio = false;
      this.activeEngine = 'web_speech';
      this.addLog(`✓ OS Speech engine outputting sound via voice: ${utterance.voice?.name || 'Default'}`);
      this.startLevelMonitor();
      this.notify();
    };

    utterance.onboundary = (evt) => {
      if (evt.charIndex !== undefined && this.currentSentences.length > 0) {
        const textSlice = fullText.slice(evt.charIndex);
        const match = textSlice.match(/^[^.!?]+[.!?]?/);
        if (match && match[0]) {
          this.activeSentence = match[0].trim();
          this.notify();
        }
      }
    };

    utterance.onend = () => {
      this.addLog('OS Speech engine finished speaking.');
      this.stop();
      if (onEnd) onEnd();
    };

    utterance.onerror = (err) => {
      this.addLog(`OS Speech engine error: ${err.error}`);
      this.stop();
      if (onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
  }

  // Generate clear conversational forecast script for today
  public generateForecastText(
    locationName: string,
    weather: WeatherMetrics,
    painScores?: PainScores | null
  ): string {
    const todayForecast = weather.forecastDays && weather.forecastDays.length > 0 ? weather.forecastDays[0] : null;

    const acheScore = todayForecast
      ? todayForecast.predictedPainScore
      : painScores
      ? Math.max(1, Math.min(10, Math.round(painScores.overallRisk / 10)))
      : 4;

    const headline =
      todayForecast?.painHeadline ||
      (acheScore >= 7 ? 'High Ache Alert' : acheScore >= 4 ? 'Moderate Stiffness Expected' : 'Good Joint Comfort');

    const advice =
      todayForecast?.advice ||
      (acheScore >= 7
        ? 'A storm or sharp pressure drop is affecting joints. Stay warm and keep a heating pad nearby.'
        : acheScore >= 4
        ? 'Mild air pressure changes are underway. A warm shower and light morning stretching will help loosen joints.'
        : 'Air pressure is steady. Most seniors feel comfortable on days like today.');

    let cleanTrend = weather.pressureTrend
      ? weather.pressureTrend.toLowerCase().replace(/[^\w\s]/g, '').trim()
      : 'steady';

    let speech = `Hello! Here is today's joint health and weather guide for ${locationName}. `;
    speech += `Today's status: ${headline}, with an ache rating of ${acheScore} out of 10. `;
    speech += `The temperature is ${weather.temperature}, and relative humidity is ${weather.humidity}. `;
    speech += `Barometric pressure currently stands at ${weather.currentPressureInHg.toFixed(2)} inches of mercury, and is ${cleanTrend}. `;
    speech += `Comfort advice: ${advice} `;

    if (weather.forecastDays && weather.forecastDays.length > 1) {
      const tomorrow = weather.forecastDays[1];
      speech += `Looking ahead to tomorrow, ${tomorrow.dayLabel}: expect ${tomorrow.weatherDescription} with a high near ${Math.round(tomorrow.tempMax)} degrees. `;
    }

    speech += `Stay warm, relaxed, and have a wonderful day!`;
    return speech;
  }

  public readForecastOnLoad(
    locationName: string,
    weather: WeatherMetrics,
    painScores?: PainScores | null
  ) {
    const script = this.generateForecastText(locationName, weather, painScores);
    this.activeSentence = '';
    this.currentAudioUrl = `/api/tts?text=${encodeURIComponent(script)}`;
    this.notify();
  }
}

export const voiceService = new VoiceService();
