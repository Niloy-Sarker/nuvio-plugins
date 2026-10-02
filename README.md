# DhakaFlix Nuvio Scraper

A local scraper for the [Nuvio](https://github.com/phisher98/phisher-nuvio-providers) streaming application that fetches streams from the DhakaFlix FTP server.

## Features

- **Movies**: Searches all DhakaFlix movie categories (English, Hindi, South Indian, Bengali, Animation, Foreign, IMDb Top-250, 3D)
- **TV Series**: English/International TV + Korean TV & WEB Series
- **Anime**: Anime & Cartoon TV Series
- **All qualities**: Returns all available qualities (1080p, 720p, 480p, etc.) sorted highest first
- **Audio labels**: Shows [Dual Audio] / [Multi Audio] tags in stream titles
- **Promise-based**: Fully compatible with Nuvio's React Native sandbox (no async/await)

## Installation

1. Open Nuvio app
2. Go to **Settings → Local Scrapers**
3. Add this repository URL:
   ```
   https://raw.githubusercontent.com/Niloy-Sarker/nuvio-plugins/refs/heads/main/
   ```
4. Enable the DhakaFlix scraper

> **Note**: This scraper only works when your device is on the same local network as the DhakaFlix server (172.16.50.x).

## Supported Categories

### Movies
| Category | Server | Quality |
|---|---|---|
| English Movies | 172.16.50.7 | 720p |
| English Movies | 172.16.50.14 | 1080p |
| Hindi Movies | 172.16.50.14 | Mixed |
| South Indian Movies | 172.16.50.14 | Mixed |
| South Indian Hindi Dubbed | 172.16.50.14 | Mixed |
| Kolkata Bangla Movies | 172.16.50.7 | Mixed |
| Animation Movies | 172.16.50.14 | 720p + 1080p |
| Foreign Language Movies | 172.16.50.7 | Mixed |
| IMDb Top-250 Movies | 172.16.50.14 | Mixed |
| 3D Movies | 172.16.50.7 | Mixed |

### TV Series
| Category | Server |
|---|---|
| TV & WEB Series | 172.16.50.12 |
| Korean TV & WEB Series | 172.16.50.14 |

### Anime
| Category | Server |
|---|---|
| Anime & Cartoon TV Series | 172.16.50.10 |

## Testing

```bash
npm install
node test_dhakaflix.js
```

## License

GPL-3.0
