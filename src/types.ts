export interface LocationItem {
  name: string;
  lat: number;
  lon: number;
}

export interface DailyForecastItem {
  date: string;
  dayLabel: string;
  formattedDate: string;
  weatherCode: number;
  weatherDescription: string;
  tempMax: number;
  tempMin: number;
  tempChangeFromPrev: number;
  precipitationProbability: number;
  precipitationInches: number;
  windSpeedMax: number;
  avgPressureInHg: number;
  minPressureInHg: number;
  maxPressureInHg: number;
  pressureDeltaInHg: number;
  pressureTrend: string;
  frontType: string;
  frontCategory: 'cold_front' | 'warm_front' | 'low_pressure' | 'high_ridge' | 'stable';
  frontBadge: string;
  frontDescription: string;
  predictedPainScore: number;
  predictedRiskLevel: 'low' | 'moderate' | 'high';
  painHeadline: string;
  advice: string;
}

export type DailyForecastDay = DailyForecastItem;

export interface WeatherMetrics {
  currentPressureInHg: number;
  change3Hour: number;
  pressureTrend: string;
  humidity: string;
  windSpeed: string;
  temperature: string;
  past24HoursPressure: number[];
  hourlyTimestamps: string[];
  locationName: string;
  coordinates: {
    lat: number;
    lon: number;
  };
  elevationMeters?: number;
  observationTime?: string;
  timezone?: string;
  weatherCode?: number;
  surfacePressureInHg?: number;
  isRealLocation?: boolean;
  isLiveRealtime?: boolean;
  forecastDays?: DailyForecastItem[];
}

export interface PainScoresBreakdown {
  jointPressureComponent: number;
  jointHumidityComponent: number;
  headacheTrendComponent: number;
  headacheTempComponent: number;
  backWindComponent: number;
  backTempComponent: number;
}

export interface PainScores {
  HEADACHE: number;
  JOINT_PAIN: number;
  BACK_PAIN: number;
  NECK_PAIN: number;
  overallRisk: number;
  breakdown: PainScoresBreakdown;
}

export interface PainLogEntry {
  id: string;
  date_logged: string;
  time_logged: string;
  user_pain_score: number;
  pressure_in_hg: number;
  humidity_percent: number;
  wind_speed_mph: number;
  temperature_f: number;
  notes: string;
}

export interface CorrelationAnalysisResponse {
  summary: string;
  primaryTriggers: string[];
  sensitivityLevel: 'Low' | 'Moderate' | 'High' | 'Severe' | string;
  recommendations: string[];
}

export type AiDoctorCorrelation = CorrelationAnalysisResponse;
