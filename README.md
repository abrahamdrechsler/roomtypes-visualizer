# Room Types Visualizer

Small static website for browsing room type definitions from `room_types.json`.

## Run

1. Open this folder in a terminal.
2. Start a local server:
   - `python -m http.server 5500`
3. Open `http://localhost:5500` in your browser.

## Data source

- The app auto-loads `./room_types.json` (included in this repo for GitHub Pages).
- To refresh data from your product repo, re-copy:
  - `Copy-Item "c:\Users\abrah\Documents\GitHub\product\room_types.json" ".\room_types.json" -Force`

## Features

- Search bar for room names/type keys.
- Card view for each room type.
- Clear attribute list with readable values.
- Behavior tags and unique behaviors per room.
