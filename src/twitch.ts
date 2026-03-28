import { loadSettings, saveSettings } from "./settings";

const TWITCH_API = "https://api.twitch.tv/helix";

async function twitchFetch(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  const settings = loadSettings();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${settings.auth.twitch.accessToken}`,
    "Client-Id": process.env.TWITCH_CLIENT_ID!,
    ...((options.headers as Record<string, string>) || {}),
  };

  let response = await fetch(`${TWITCH_API}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    await refreshToken();
    const refreshed = loadSettings();
    headers["Authorization"] = `Bearer ${refreshed.auth.twitch.accessToken}`;
    response = await fetch(`${TWITCH_API}${endpoint}`, { ...options, headers });
  }

  return response;
}

async function refreshToken(): Promise<void> {
  const settings = loadSettings();
  const response = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: settings.auth.twitch.refreshToken,
      client_id: process.env.TWITCH_CLIENT_ID!,
      client_secret: process.env.TWITCH_CLIENT_SECRET!,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Twitch token — please reconnect.");
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
  };
  settings.auth.twitch.accessToken = data.access_token;
  settings.auth.twitch.refreshToken = data.refresh_token;
  saveSettings(settings);
}

export async function getTwitchUserId(accessToken: string): Promise<string> {
  const response = await fetch(`${TWITCH_API}/users`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Client-Id": process.env.TWITCH_CLIENT_ID!,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to get Twitch user info");
  }

  const data = (await response.json()) as { data: Array<{ id: string }> };
  return data.data[0].id;
}

export async function updateChannel(
  title: string,
  categoryId: string,
  tags: string[],
): Promise<void> {
  const settings = loadSettings();
  const body: Record<string, unknown> = { title };
  if (categoryId) body.game_id = categoryId;
  if (tags.length > 0) body.tags = tags;

  const response = await twitchFetch(
    `/channels?broadcaster_id=${settings.auth.twitch.userId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Twitch channel update failed: ${text}`);
  }
}

export async function searchCategories(
  query: string,
): Promise<Array<{ id: string; name: string; box_art_url: string }>> {
  const response = await twitchFetch(
    `/search/categories?query=${encodeURIComponent(query)}&first=10`,
  );
  if (!response.ok) return [];

  const data = (await response.json()) as {
    data: Array<{ id: string; name: string; box_art_url: string }>;
  };
  return data.data || [];
}
