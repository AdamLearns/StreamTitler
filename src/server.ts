import express from "express";
import path from "path";
import { execFile } from "child_process";
import dotenv from "dotenv";
import { loadSettings, saveSettings } from "./settings";
import { getTwitchUserId, updateChannel, searchCategories } from "./twitch";
import * as youtube from "./youtube";

dotenv.config();

const app = express();
const PORT = 3847;

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

app.get("/api/settings", (_req, res) => {
  const settings = loadSettings();
  // Send settings without raw auth tokens
  res.json({
    sharedDescription: settings.sharedDescription,
    twitch: settings.twitch,
    youtube: settings.youtube,
    auth: {
      twitch: { connected: !!settings.auth.twitch.accessToken },
      youtube: { connected: !!settings.auth.youtube.accessToken },
    },
  });
});

app.post("/api/settings", (req, res) => {
  const settings = loadSettings();
  const { twitch, youtube: yt, sharedDescription } = req.body;
  if (sharedDescription !== undefined)
    settings.sharedDescription = sharedDescription;
  if (twitch) settings.twitch = { ...settings.twitch, ...twitch };
  if (yt) settings.youtube = { ...settings.youtube, ...yt };
  saveSettings(settings);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Twitch Auth
// ---------------------------------------------------------------------------

app.get("/auth/twitch", (_req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.TWITCH_CLIENT_ID!,
    redirect_uri: `http://localhost:${PORT}/auth/twitch/callback`,
    response_type: "code",
    scope: "channel:manage:broadcast user:read:email",
  });
  res.redirect(`https://id.twitch.tv/oauth2/authorize?${params}`);
});

app.get("/auth/twitch/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).send("Missing code parameter");
      return;
    }

    const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.TWITCH_CLIENT_ID!,
        client_secret: process.env.TWITCH_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `http://localhost:${PORT}/auth/twitch/callback`,
      }),
    });

    if (!tokenRes.ok) throw new Error(await tokenRes.text());

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
    };

    const userId = await getTwitchUserId(tokenData.access_token);

    const settings = loadSettings();
    settings.auth.twitch = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      userId,
    };
    saveSettings(settings);
    res.redirect("/");
  } catch (err) {
    console.error("Twitch auth error:", err);
    res.status(500).send("Twitch auth failed — check the console for details.");
  }
});

// ---------------------------------------------------------------------------
// YouTube Auth
// ---------------------------------------------------------------------------

app.get("/auth/youtube", (_req, res) => {
  res.redirect(youtube.getAuthUrl());
});

app.get("/auth/youtube/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).send("Missing code parameter");
      return;
    }
    await youtube.handleCallback(code);
    res.redirect("/");
  } catch (err) {
    console.error("YouTube auth error:", err);
    res
      .status(500)
      .send("YouTube auth failed — check the console for details.");
  }
});

// ---------------------------------------------------------------------------
// Twitch API
// ---------------------------------------------------------------------------

app.get("/api/twitch/categories", async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) {
      res.json([]);
      return;
    }
    const results = await searchCategories(q);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/twitch/update", async (req, res) => {
  try {
    const { title, categoryId, categoryName, tags } = req.body;
    await updateChannel(title, categoryId, tags);

    // Persist the settings that were used
    const settings = loadSettings();
    settings.twitch = { title, categoryId, categoryName, tags };
    saveSettings(settings);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ---------------------------------------------------------------------------
// YouTube API
// ---------------------------------------------------------------------------

app.post("/api/youtube/create", async (req, res) => {
  try {
    const {
      title,
      description,
      tags,
      scheduledStartTime,
      privacyStatus,
      playlistId,
    } = req.body;
    const result = await youtube.createBroadcast(
      title,
      description,
      tags || [],
      scheduledStartTime,
      privacyStatus || "public",
    );

    // Add to playlist if one is selected
    if (playlistId) {
      try {
        await youtube.addToPlaylist(result.videoId, playlistId);
      } catch (err) {
        console.warn("Could not add to playlist (non-fatal):", err);
      }
    }

    // Persist youtube-specific settings (not the composed description)
    const settings = loadSettings();
    Object.assign(settings.youtube, {
      tags,
      scheduledStartTime,
      privacyStatus,
    });
    saveSettings(settings);

    res.json(result);
  } catch (err) {
    console.error("YouTube create error:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/youtube/playlists", async (_req, res) => {
  try {
    const playlists = await youtube.listPlaylists();
    res.json(playlists);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/youtube/open-chat", (req, res) => {
  const { videoId } = req.body;
  if (!videoId || !/^[a-zA-Z0-9_-]+$/.test(videoId)) {
    res.status(400).json({ error: "Invalid video ID" });
    return;
  }

  const url = `https://studio.youtube.com/live_chat?is_popout=1&v=${videoId}`;

  // Try Chrome app-mode first (no browser chrome), fall back to default browser
  execFile(
    "open",
    ["-na", "Google Chrome", "--args", `--app=${url}`],
    (err) => {
      if (err) {
        execFile("open", [url]);
      }
    },
  );

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`StreamTitler running at ${url}`);
  execFile("open", [url]);
});
