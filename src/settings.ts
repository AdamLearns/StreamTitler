import fs from "fs";
import path from "path";

const SETTINGS_PATH = path.join(__dirname, "..", "settings.json");

export interface TwitchSettings {
  title: string;
  categoryId: string;
  categoryName: string;
  tags: string[];
}

export interface YouTubeSettings {
  youtubeDescription: string;
  extraTitleTags: string;
  tags: string[];
  scheduledStartTime: string;
  privacyStatus: string;
}

export interface AuthTokens {
  twitch: {
    accessToken: string;
    refreshToken: string;
    userId: string;
  };
  youtube: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface Settings {
  sharedDescription: string;
  twitch: TwitchSettings;
  youtube: YouTubeSettings;
  auth: AuthTokens;
}

const DEFAULT_SETTINGS: Settings = {
  sharedDescription: "",
  twitch: {
    title: "",
    categoryId: "",
    categoryName: "",
    tags: [],
  },
  youtube: {
    youtubeDescription: "",
    extraTitleTags: "",
    tags: [],
    scheduledStartTime: "",
    privacyStatus: "public",
  },
  auth: {
    twitch: { accessToken: "", refreshToken: "", userId: "" },
    youtube: { accessToken: "", refreshToken: "" },
  },
};

export function loadSettings(): Settings {
  try {
    const data = fs.readFileSync(SETTINGS_PATH, "utf-8");
    const saved = JSON.parse(data);
    return {
      sharedDescription:
        saved.sharedDescription ?? DEFAULT_SETTINGS.sharedDescription,
      twitch: { ...DEFAULT_SETTINGS.twitch, ...saved.twitch },
      youtube: { ...DEFAULT_SETTINGS.youtube, ...saved.youtube },
      auth: {
        twitch: { ...DEFAULT_SETTINGS.auth.twitch, ...saved.auth?.twitch },
        youtube: { ...DEFAULT_SETTINGS.auth.youtube, ...saved.auth?.youtube },
      },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }
}

export function saveSettings(settings: Settings): void {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}
