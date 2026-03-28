import { google } from "googleapis";
import { loadSettings, saveSettings } from "./settings";

const PORT = 3847;

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    `http://localhost:${PORT}/auth/youtube/callback`,
  );
}

export function getAuthUrl(): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/youtube"],
    prompt: "consent",
  });
}

export async function handleCallback(code: string): Promise<void> {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const settings = loadSettings();
  settings.auth.youtube.accessToken = tokens.access_token || "";
  settings.auth.youtube.refreshToken =
    tokens.refresh_token || settings.auth.youtube.refreshToken || "";
  saveSettings(settings);
}

function getAuthedClient() {
  const settings = loadSettings();
  const client = createOAuth2Client();
  client.setCredentials({
    access_token: settings.auth.youtube.accessToken,
    refresh_token: settings.auth.youtube.refreshToken,
  });

  client.on("tokens", (tokens) => {
    const s = loadSettings();
    if (tokens.access_token) s.auth.youtube.accessToken = tokens.access_token;
    if (tokens.refresh_token)
      s.auth.youtube.refreshToken = tokens.refresh_token;
    saveSettings(s);
  });

  return client;
}

export interface BroadcastResult {
  videoId: string;
}

export async function createBroadcast(
  title: string,
  description: string,
  tags: string[],
  scheduledStartTime: string,
  privacyStatus: string,
): Promise<BroadcastResult> {
  const auth = getAuthedClient();
  const youtube = google.youtube({ version: "v3", auth });

  // Create the live broadcast
  const broadcastRes = await youtube.liveBroadcasts.insert({
    part: ["snippet", "status", "contentDetails"],
    requestBody: {
      snippet: {
        title,
        description,
        scheduledStartTime,
      },
      status: {
        privacyStatus,
        selfDeclaredMadeForKids: false,
      },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
      },
    },
  });

  const videoId = broadcastRes.data.id;
  if (!videoId) throw new Error("Broadcast created but no video ID returned");

  // Set tags on the video (tags aren't part of broadcast snippet)
  if (tags.length > 0) {
    const videoRes = await youtube.videos.list({
      part: ["snippet"],
      id: [videoId],
    });

    const currentSnippet = videoRes.data.items?.[0]?.snippet;
    await youtube.videos.update({
      part: ["snippet"],
      requestBody: {
        id: videoId,
        snippet: {
          title,
          description,
          tags,
          categoryId: currentSnippet?.categoryId || "20",
        },
      },
    });
  }

  // Try to bind to an existing stream
  try {
    const streamsRes = await youtube.liveStreams.list({
      part: ["id"],
      mine: true,
    });

    const streamId = streamsRes.data.items?.[0]?.id;
    if (streamId) {
      await youtube.liveBroadcasts.bind({
        id: videoId,
        part: ["id"],
        streamId,
      });
    }
  } catch (err) {
    console.warn("Could not bind to default stream (non-fatal):", err);
  }

  return { videoId };
}
