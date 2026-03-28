# StreamTitler

Local tool for setting up Twitch and YouTube livestreams from a single UI.

## Features

- **Twitch**: Update stream title, category (with autocomplete search), and tags
- **YouTube**: Create a scheduled livestream with title, description, tags, and go-live time; automatically opens the chat pop-out window
- **Persistent settings**: Remembers everything from your last stream so you only need to change what's different

## Setup

### 1. Install & build

```sh
npm install
npm run build
```

### 2. Create API credentials

You need OAuth apps for both Twitch and YouTube.

**Twitch** — https://dev.twitch.tv/console/apps

- Create a new application
- Set the OAuth redirect URL to `http://localhost:3847/auth/twitch/callback`
- Note the **Client ID** and **Client Secret**

**YouTube (Google)** — https://console.cloud.google.com/apis/credentials

- Create a new OAuth 2.0 Client ID (type: Web application)
- Add `http://localhost:3847/auth/youtube/callback` as an authorized redirect URI
- Enable the **YouTube Data API v3** for your project
- Note the **Client ID** and **Client Secret**

### 3. Configure environment

Copy the example env file and fill in your credentials:

```sh
cp .env.example .env
```

Edit `.env`:

```
TWITCH_CLIENT_ID=your_twitch_client_id
TWITCH_CLIENT_SECRET=your_twitch_client_secret
YOUTUBE_CLIENT_ID=your_google_client_id
YOUTUBE_CLIENT_SECRET=your_google_client_secret
```

### 4. Run

```sh
npm start
```

Open http://localhost:3847 in your browser.

### 5. Connect accounts

Click **Connect** next to Twitch and YouTube in the header. Each will open an OAuth authorization flow — sign in and grant the requested permissions. The status dots turn green once connected.

## Usage

1. Enter your **Stream Title** (shared between both platforms)
2. **Twitch panel**: Pick a category, add tags, click **Update Twitch**
3. **YouTube panel**: Add extra title tags (appended to the base title), description, video tags, schedule time, and privacy. Click **Create YouTube Stream** — this creates the broadcast and opens the YouTube live chat in a pop-out Chrome window

All settings are saved to `settings.json` and restored the next time you open the app.
