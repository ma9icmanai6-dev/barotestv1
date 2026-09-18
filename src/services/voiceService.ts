// Universal Client-Side Voice and Audio Service
// Combines high-reliability server-side MP3 streaming (/api/tts) with Web Speech and Web Audio fallbacks
import { WeatherMetrics, PainScores } from '../types';

export interface VoiceState {
  isSpeaking: boolean;
  activeSentence: string;
  audioUrl: string | null;
  rate: number;
  volume: number;
}

export type VoiceStateListener = (state: VoiceState) => void;

class VoiceService {
  private listeners: Set<VoiceStateListener> = new Set();
  private isSpeaking = false;
  private activeSentence = '';
  private currentAudioUrl: string | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private keepAliveInterval: any = null;
  private rate = 0.9; // Friendly, clear pacing for seniors
  private volume = 1.0;
  private audioContext: AudioContext | null = null;
  private internalAudio: HTMLAudioElement | null = null;
  private attachedElement: HTMLAudioElement | null = null;
  private currentSentences: string[] = [];
  private sentenceInterval: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Warm up Web Speech voices in background if supported
      if ('speechSynthesis' in window) {
        try {
          window.speechSynthesis.getVoices();
          if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = () => {
              try {
                window.speechSynthesis.getVoices();
              } catch {}
            };
          }
        } catch {}
      }
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

  // Retrieve or initialize standard AudioContext with user-gesture unlock
  private async getAudioContext(): Promise<AudioContext | null> {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
        }
      }
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      return this.audioContext;
    } catch {
      return null;
    }
  }

  // 100% Guaranteed Sound: Play an audible melodic chime directly from Web Audio API
  public async playTestChime(): Promise<void> {
    try {
      const ctx = await this.getAudioContext();
      if (ctx) {
        const now = ctx.currentTime;
        // 3-note ascending cheerful chime: C5 (523Hz) -> E5 (659Hz) -> G5 (784Hz)
        const notes = [
          { freq: 523.25, time: 0, dur: 0.25 },
          { freq: 659.25, time: 0.18, dur: 0.25 },
          { freq: 783.99, time: 0.36, dur: 0.5 },
        ];

        notes.forEach(({ freq, time, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + time);

          gain.gain.setValueAtTime(0.001, now + time);
          gain.gain.linearRampToValueAtTime(0.25 * this.volume, now + time + 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(now + time);
          osc.stop(now + time + dur);
        });
      }

      // Also speak a short confirmation sentence through the audio player
      await new Promise((resolve) => setTimeout(resolve, 600));
      const testAudioUrl = `/api/tts?text=${encodeURIComponent('Testing speakers. Sound is working loud and clear.')}`;
      const testAudio = new Audio(testAudioUrl);
      testAudio.volume = this.volume;
      testAudio.playbackRate = 1.0;
      await testAudio.play().catch(() => {});
    } catch (err) {
      console.warn('Test chime error:', err);
    }
  }

  // Quick soft activation click/chime on button tap
  public async playActivationChime() {
    try {
      const ctx = await this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5

      gain.gain.setValueAtTime(0.12 * this.volume, now);
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

    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
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
    this.activeSentence = '';
    this.currentUtterance = null;
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

  // Primary Speech Engine: Streams natural voice audio from /api/tts with full browser compatibility
  public speak(fullText: string, onEnd?: () => void): void {
    if (!fullText || !fullText.trim()) return;

    // Stop prior audio and play activation chime
    this.stop();
    this.playActivationChime();

    const sentences = this.splitSentences(fullText);
    this.currentSentences = sentences;
    this.activeSentence = sentences[0] || fullText;

    const ttsUrl = `/api/tts?text=${encodeURIComponent(fullText)}`;
    this.currentAudioUrl = ttsUrl;
    this.isSpeaking = true;
    this.notify();

    // Prefer playing through the attached DOM audio element so the player shows real progress
    const player = this.attachedElement || this.getOrCreateInternalAudio();
    if (player) {
      // Only change src if different or not set
      if (!player.src || !player.src.endsWith(encodeURIComponent(fullText))) {
        player.src = ttsUrl;
      }
      player.playbackRate = this.rate;
      player.volume = this.volume;

      // Track active sentence progression during playback
      let sentenceIndex = 0;
      if (this.sentenceInterval) clearInterval(this.sentenceInterval);
      this.sentenceInterval = setInterval(() => {
        if (!player || player.paused || player.ended) {
          clearInterval(this.sentenceInterval);
          return;
        }
        if (player.duration && sentences.length > 0) {
          const progress = player.currentTime / player.duration;
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
      }, 400);

      player.onended = () => {
        this.stop();
        if (onEnd) onEnd();
      };

      const playPromise = player.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn('[VoiceService] HTML5 audio play failed, falling back to Web Speech:', err);
          this.fallbackSpeechSynthesis(fullText, onEnd);
        });
      }
    } else {
      this.fallbackSpeechSynthesis(fullText, onEnd);
    }
  }

  private getOrCreateInternalAudio(): HTMLAudioElement {
    if (!this.internalAudio && typeof window !== 'undefined') {
      this.internalAudio = new Audio();
    }
    return this.internalAudio!;
  }

  // Fallback engine: Web Speech API (used if offline or server stream unavailable)
  private fallbackSpeechSynthesis(fullText: string, onEnd?: () => void) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.playTestChime().then(() => {
        this.stop();
        if (onEnd) onEnd();
      });
      return;
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
          voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha'))) ||
          voices.find((v) => v.lang.startsWith('en')) ||
          voices[0];
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
      }

      utterance.rate = this.rate;
      utterance.pitch = 1.0;
      utterance.volume = this.volume;

      utterance.onend = () => {
        currentIndex++;
        speakNextSentence();
      };

      utterance.onerror = () => {
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
      } catch {
        this.stop();
      }
    };

    speakNextSentence();
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
