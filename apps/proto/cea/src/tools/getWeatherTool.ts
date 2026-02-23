import { tool } from "@langchain/core/tools";
import { z } from "zod";

interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
  timezone: string;
}

interface GeocodingResponse {
  results?: GeocodingResult[];
}

const weatherCodeDescriptions: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snowfall",
  73: "Moderate snowfall",
  75: "Heavy snowfall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

function describeWeatherCode(code: number): string {
  return weatherCodeDescriptions[code] ?? "Unknown";
}

async function geocodeLocation(location: string): Promise<GeocodingResult> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding API request failed with status ${response.status}`);
  }

  const data: GeocodingResponse = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error(`Location "${location}" not found. Please try a different or more specific location name.`);
  }

  return data.results[0];
}

function resolveLocationName(geo: GeocodingResult): string {
  return geo.admin1
    ? `${geo.name}, ${geo.admin1}, ${geo.country}`
    : `${geo.name}, ${geo.country}`;
}

interface ForecastDaily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  weathercode: number[];
  windspeed_10m_max: number[];
  apparent_temperature_max: number[];
  apparent_temperature_min: number[];
  uv_index_max: number[];
}

interface ForecastResponse {
  latitude: number;
  longitude: number;
  timezone: string;
  daily: ForecastDaily;
}

async function fetchForecast(latitude: number, longitude: number): Promise<ForecastResponse> {
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,windspeed_10m_max,apparent_temperature_max,apparent_temperature_min,uv_index_max` +
    `&timezone=auto`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API request failed with status ${response.status}`);
  }

  return response.json() as Promise<ForecastResponse>;
}

function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function findDateIndex(dailyTimes: string[], requestedDate: string): number {
  const parsed = new Date(requestedDate);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Could not parse the date "${requestedDate}". Please provide a date in YYYY-MM-DD format.`);
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const normalizedDate = `${year}-${month}-${day}`;

  const index = dailyTimes.indexOf(normalizedDate);
  if (index === -1) {
    const rangeStart = dailyTimes[0];
    const rangeEnd = dailyTimes[dailyTimes.length - 1];
    throw new Error(
      `The date ${normalizedDate} is outside the available forecast range (${rangeStart} to ${rangeEnd}). Open-Meteo provides forecasts for the next 7 days only.`,
    );
  }

  return index;
}

function buildDayResult(daily: ForecastDaily, index: number) {
  return {
    date: daily.time[index],
    temperatureMaxC: daily.temperature_2m_max[index],
    temperatureMinC: daily.temperature_2m_min[index],
    feelsLikeMaxC: daily.apparent_temperature_max[index],
    feelsLikeMinC: daily.apparent_temperature_min[index],
    precipitationMm: daily.precipitation_sum[index],
    windSpeedMaxKmh: daily.windspeed_10m_max[index],
    uvIndexMax: daily.uv_index_max[index],
    weatherDescription: describeWeatherCode(daily.weathercode[index]),
    weatherCode: daily.weathercode[index],
  };
}

export const getWeatherTool = tool(
  async ({ date, endDate, location }) => {
    const resolvedDate = date || getTodayDate();
    console.log("Getting weather for", location, resolvedDate, endDate ?? "");

    try {
      const geo = await geocodeLocation(location);
      const resolvedLocation = resolveLocationName(geo);
      const forecast = await fetchForecast(geo.latitude, geo.longitude);
      const startIndex = findDateIndex(forecast.daily.time, resolvedDate);

      if (!endDate) {
        return {
          location: resolvedLocation,
          ...buildDayResult(forecast.daily, startIndex),
        };
      }

      const endIndex = findDateIndex(forecast.daily.time, endDate);
      if (endIndex < startIndex) {
        return { error: `endDate (${endDate}) is before date (${resolvedDate}).` };
      }

      const days = [];
      for (let i = startIndex; i <= endIndex; i++) {
        days.push(buildDayResult(forecast.daily, i));
      }

      return {
        location: resolvedLocation,
        forecastDays: days,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "An unknown error occurred";
      return { error: message };
    }
  },
  {
    name: "GetWeather",
    description:
      "Get the weather for a location. " +
      "Omit 'date' to get today's weather. " +
      "Provide 'date' for a specific day's forecast, or both 'date' and 'endDate' for a multi-day range. " +
      "Forecasts are available for approximately the next 7 days.",
    schema: z.object({
      location: z.string().describe("The city or location name, e.g. 'Mumbai' or 'Seattle, WA'"),
      date: z.string().optional().describe(
        "Optional date in YYYY-MM-DD format. Defaults to today if omitted.",
      ),
      endDate: z.string().optional().describe(
        "Optional end date in YYYY-MM-DD format for multi-day forecasts.",
      ),
    }),
  },
);
