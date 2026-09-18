// Universal Client-Side Voice and Audio Service
// Combines high-reliability server-side MP3 streaming (/api/tts), Web Audio API buffer playback, and Web Speech fallbacks
import { WeatherMetrics, PainScores } from '../types';

export interface VoiceState {
  isSpeaking: boolean;
  activeSentence: string;
  audioUrl: string | null;
  rate: number;
  volume: number;
  activeEngine: 'idle' | 'html5_mp3' | 'webaudio_mp3' | 'web_speech' | 'synth_chime';
  audioContextState: string;
  lastError: string | null;
  debugLogs: string[];
}

export type VoiceStateListener = (state: VoiceState) => void;

class VoiceService {
  private listeners: Set<VoiceStateListener> = new Set();
  private isSpeaking = false;
  private activeSentence = '';
  private currentAudioUrl: string | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private rate = 0.9; // Friendly, clear pacing for seniors
  private volume = 1.0;
  private audioContext: AudioContext | null = null;
  private activeSourceNode: AudioBufferSourceNode | null = null;
  private internalAudio: HTMLAudioElement | null = null;
  private attachedElement: HTMLAudioElement | null = null;
  private currentSentences: string[] = [];
  private sentenceInterval: any = null;
  private activeEngine: 'idle' | 'html5_mp3' | 'webaudio_mp3' | 'web_speech' | 'synth_chime' = 'idle';
  private lastError: string | null = null;
  private debugLogs: string[] = [];

  constructor() {
    this.addLog('Audio service initialized.');
    if (typeof window !== 'undefined') {
      // Warm up Web Speech voices in background if supported
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.getVoices();
          if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => {
              try {
                const count = window.speechSynthesis.getVoices().length;
                this.addLog(`System voices ready (${count} voices available).`);
              } catch {}
            };
          }
        } catch {}
      }

      // Pre-create and unlock AudioContext on first user interaction anywhere in window
      const unlockListener = () => {
        this.unlockAudio();
        this.addLog('Browser audio unlocked on user gesture.');
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
    this.debugLogs = [line, ...this.debugLogs.slice(0, 19)];
    this.notify();
  }

  public getDebugLogs(): string[] {
    return this.debugLogs;
  }

  // Synchronously unlock and return the browser's AudioContext
  public unlockAudio(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
          this.addLog(`AudioContext created (sampleRate: ${this.audioContext.sampleRate}Hz, state: ${this.audioContext.state})`);
        }
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().then(() => {
          this.addLog('AudioContext state changed to: running');
        }).catch((err) => {
          this.addLog(`AudioContext resume rejected: ${err?.message || err}`);
        });
      }
      return this.audioContext;
    } catch (e: any) {
      this.addLog(`AudioContext error: ${e?.message || e}`);
      return null;
    }
  }

  // Attach a DOM <audio> element to synchronize with VoiceAutoReadBanner
  public attachAudioElement(element: HTMLAudioElement | null) {
    this.attachedElement = element;
    if (element) {
      element.volume = this.volume;
      element.playbackRate = this.rate;

      element.onplay = () => {
        this.isSpeaking = true;
        this.notify();
      };

      element.onpause = () => {
        if (!element.seeking && element.currentTime < element.duration) {
          this.isSpeaking = false;
          this.notify();
        }
      };

      element.onended = () => {
        this.stop();
      };

      element.onerror = () => {
        console.warn('[VoiceService] Attached audio element reported error');
      };
    }
  }

  // 100% Guaranteed Sound: Play an audible melodic chime directly from Web Audio API
  public playTestChime(): void {
    this.addLog('🔔 Testing Speaker: Generating audible chime...');
    const ctx = this.unlockAudio();

    if (ctx) {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      // 3-note ascending cheerful chime with triangle wave (warm, rich, highly audible on all speakers)
      // Notes: G4 (392Hz) -> C5 (523Hz) -> G5 (784Hz)
      const notes = [
        { freq: 392.0, time: 0, dur: 0.22 },
        { freq: 523.25, time: 0.16, dur: 0.22 },
        { freq: 783.99, time: 0.32, dur: 0.5 },
      ];

      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0.001, now + time);
        gain.gain.linearRampToValueAtTime(0.85 * this.volume, now + time + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur);
      });
      this.addLog('Chime generated successfully on audio output.');
    } else {
      this.addLog('AudioContext unavailable for chime.');
    }

    // Simultaneously trigger spoken confirmation through audio element synchronously
    try {
      const testAudioUrl = `/api/tts?text=${encodeURIComponent('Testing speakers. Sound is working loud and clear.')}`;
      const testAudio = new Audio(testAudioUrl);
      testAudio.volume = this.volume;
      testAudio.playbackRate = 1.0;
      testAudio.play().then(() => {
        this.addLog('Spoken test audio played successfully.');
      }).catch((err) => {
        this.addLog(`Spoken test audio blocked: ${err?.message || err}`);
      });
    } catch (e: any) {
      this.addLog(`Spoken test audio error: ${e?.message || e}`);
    }
  }

  // Quick soft activation chime on button tap
  public playActivationChime() {
    const ctx = this.unlockAudio();
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

      gain.gain.setValueAtTime(0.4 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.22);
    } catch {}
  }

  public subscribe(listener: VoiceStateListener): () => void {
    this.listeners.add(listener);
    listener({
      isSpeaking: this.isSpeaking,
      activeSentence: this.activeSentence,
      audioUrl: this.currentAudioUrl,
      rate: this.rate,
      volume: this.volume,
      activeEngine: this.activeEngine,
      audioContextState: this.audioContext?.state || 'not-initialized',
      lastError: this.lastError,
      debugLogs: [...this.debugLogs],
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const state: VoiceState = {
      isSpeaking: this.isSpeaking,
      activeSentence: this.activeSentence,
      audioUrl: this.currentAudioUrl,
      rate: this.rate,
      volume: this.volume,
      activeEngine: this.activeEngine,
      audioContextState: this.audioContext?.state || 'not-initialized',
      lastError: this.lastError,
      debugLogs: [...this.debugLogs],
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
    this.notify();
  }

  public stop() {
    if (this.sentenceInterval) {
      clearInterval(this.sentenceInterval);
      this.sentenceInterval = null;
    }

    // Stop active Web Audio buffer source if running
    if (this.activeSourceNode) {
      try {
        this.activeSourceNode.stop();
        this.activeSourceNode.disconnect();
      } catch {}
      this.activeSourceNode = null;
    }

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
    this.activeEngine = 'idle';
    this.activeSentence = '';
    this.currentUtterance = null;
    this.addLog('Playback stopped.');
    this.notify();
  }

  // Split text into natural, bite-sized sentences
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

  // Primary Speech Engine: Streams natural voice audio from /api/tts with multi-layer browser fallback
  public async speak(fullText: string, onEnd?: () => void): Promise<void> {
    if (!fullText || !fullText.trim()) return;

    // Stop prior audio and play immediate activation chime
    this.stop();
    const ctx = this.unlockAudio();
    this.playActivationChime();

    const sentences = this.splitSentences(fullText);
    this.currentSentences = sentences;
    this.activeSentence = sentences[0] || fullText;

    const ttsUrl = `/api/tts?text=${encodeURIComponent(fullText)}`;
    this.currentAudioUrl = ttsUrl;
    this.isSpeaking = true;
    this.lastError = null;
    this.addLog(`Starting voice playback (${sentences.length} sentences)...`);
    this.notify();

    let playbackStarted = false;

    // Track active sentence progression
    let sentenceIndex = 0;
    const startSentenceTracking = (getDuration: () => number, getCurrentTime: () => number) => {
      if (this.sentenceInterval) clearInterval(this.sentenceInterval);
      this.sentenceInterval = setInterval(() => {
        if (!this.isSpeaking) {
          clearInterval(this.sentenceInterval);
          return;
        }
        const duration = getDuration();
        const currentTime = getCurrentTime();
        if (duration > 0 && sentences.length > 0) {
          const progress = Math.min(1, currentTime / duration);
          const targetIndex = Math.min(
            sentences.length - 1,
            Math.floor(progress * sentences.length)
          );
          if (targetIndex !== sentenceIndex) {
            sentenceIndex = targetIndex;
            this.activeSentence = sentences[sentenceIndex] || fullText;
            this.notify();
          }
        }
      }, 300);
    };

    // Strategy 1: HTML5 Audio Element playback (direct MP3 stream)
    try {
      this.addLog('Attempting Strategy 1: HTML5 Audio direct streaming...');
      const player = this.getOrCreateInternalAudio();
      player.src = ttsUrl;
      player.playbackRate = this.rate;
      player.volume = this.volume;

      // Sync attached element if available
      if (this.attachedElement) {
        try {
          this.attachedElement.src = ttsUrl;
          this.attachedElement.playbackRate = this.rate;
          this.attachedElement.volume = this.volume;
        } catch {}
      }

      startSentenceTracking(
        () => player.duration || 20,
        () => player.currentTime || 0
      );

      player.onended = () => {
        this.addLog('HTML5 Audio playback completed.');
        this.stop();
        if (onEnd) onEnd();
      };

      const playPromise = player.play();
      if (playPromise !== undefined) {
        await playPromise;
        playbackStarted = true;
        this.activeEngine = 'html5_mp3';
        this.addLog('Strategy 1 successful: HTML5 Audio playing MP3.');
        this.notify();
      }
    } catch (err: any) {
      this.addLog(`Strategy 1 (HTML5 Audio) blocked or failed: ${err?.message || err}`);
      console.warn('[VoiceService] HTML5 audio playback failed, falling back:', err);
    }

    // Strategy 2: Web Audio API Buffer Decoding (bypasses iframe media element restrictions)
    if (!playbackStarted) {
      this.addLog('Attempting Strategy 2: Web Audio API Buffer fetch & decode...');
      if (ctx) {
        try {
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          const response = await fetch(ttsUrl);
          if (!response.ok) {
            throw new Error(`TTS server HTTP ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.playbackRate.value = this.rate;

          const gainNode = ctx.createGain();
          gainNode.gain.value = this.volume;

          source.connect(gainNode);
          gainNode.connect(ctx.destination);

          const startTime = ctx.currentTime;
          const duration = audioBuffer.duration / this.rate;

          startSentenceTracking(
            () => duration,
            () => ctx.currentTime - startTime
          );

          source.onended = () => {
            this.addLog('Web Audio Buffer playback completed.');
            this.stop();
            if (onEnd) onEnd();
          };

          source.start(0);
          this.activeSourceNode = source;
          playbackStarted = true;
          this.activeEngine = 'webaudio_mp3';
          this.addLog(`Strategy 2 successful: Web Audio buffer decoded (${audioBuffer.duration.toFixed(1)}s).`);
          this.notify();
        } catch (webAudioErr: any) {
          this.addLog(`Strategy 2 (Web Audio) failed: ${webAudioErr?.message || webAudioErr}`);
          console.warn('[VoiceService] Web Audio buffer decoding failed:', webAudioErr);
        }
      } else {
        this.addLog('Strategy 2 skipped: AudioContext unavailable.');
      }
    }

    // Strategy 3: Web Speech API fallback (local browser speech synthesis)
    if (!playbackStarted) {
      this.addLog('Attempting Strategy 3: Web Speech API synthesis...');
      const speechStarted = this.fallbackSpeechSynthesis(fullText, onEnd);
      if (speechStarted) {
        playbackStarted = true;
        this.activeEngine = 'web_speech';
        this.notify();
      }
    }

    // Strategy 4: Web Audio Synth Sound Alert (guaranteed audible tones so user ALWAYS gets audio feedback)
    if (!playbackStarted) {
      this.activeEngine = 'synth_chime';
      this.lastError = 'Audio playback was restricted by browser autoplay policy. Tap Test Speaker or unmute.';
      this.addLog('Falling back to Strategy 4: Web Audio Synth Melody.');
      this.playTestChime();
      this.stop();
      if (onEnd) onEnd();
    }
  }

  private getOrCreateInternalAudio(): HTMLAudioElement {
    if (!this.internalAudio && typeof window !== 'undefined') {
      this.internalAudio = new Audio();
    }
    return this.internalAudio!;
  }

  // Fallback engine: Web Speech API (used if offline or server stream unavailable)
  private fallbackSpeechSynthesis(fullText: string, onEnd?: () => void): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.addLog('Web Speech API is not supported in this browser.');
      return false;
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    } catch {}

    const sentences = this.splitSentences(fullText);
    let currentIndex = 0;

    const speakNextSentence = () => {
      if (!this.isSpeaking) return;

      if (currentIndex >= sentences.length) {
        this.addLog('Web Speech reading completed.');
        this.stop();
        if (onEnd) onEnd();
        return;
      }

      const currentText = sentences[currentIndex];
      this.activeSentence = currentText;
      this.notify();

      const utterance = new SpeechSynthesisUtterance(currentText);
      this.currentUtterance = utterance;

      if (typeof window !== 'undefined') {
        (window as any).__activeUtterances = [utterance];
      }

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const preferredVoice =
          voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha') || v.name.includes('Alex'))) ||
          voices.find((v) => v.lang.startsWith('en')) ||
          voices[0];
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
      }

      utterance.rate = this.rate;
      utterance.pitch = 1.0;
      utterance.volume = this.volume;

      utterance.onstart = () => {
        this.addLog(`Web Speech speaking sentence ${currentIndex + 1}/${sentences.length}`);
      };

      utterance.onend = () => {
        currentIndex++;
        speakNextSentence();
      };

      utterance.onerror = (evt) => {
        this.addLog(`Web Speech error on sentence ${currentIndex + 1}: ${evt.error}`);
        currentIndex++;
        if (currentIndex < sentences.length && this.isSpeaking) {
          speakNextSentence();
        } else {
          this.stop();
          if (onEnd) onEnd();
        }
      };

      try {
        window.speechSynthesis.speak(utterance);
      } catch (err: any) {
        this.addLog(`Speech synthesis speak() failed: ${err?.message || err}`);
        this.stop();
      }
    };

    speakNextSentence();
    return true;
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
    // Generate text and prepare the real MP3 audio stream URL
    const script = this.generateForecastText(locationName, weather, painScores);
    this.activeSentence = '';
    this.currentAudioUrl = `/api/tts?text=${encodeURIComponent(script)}`;
    this.notify();
  }
}

export const voiceService = new VoiceService();
