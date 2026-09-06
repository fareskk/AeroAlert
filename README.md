# ✈️ AeroAlert

> *"Wait, what plane was that?"* — A fun little project built so you never have to wonder again.

Have you ever been sitting at your desk, heard an aircraft roaring overhead, and scrambled to open Flightradar24 only to realize it already flew past? 

**AeroAlert** solves that very specific itch. It's a lightweight, portable desktop companion that quietly monitors the airspace directly above your roof and pings you whenever an aircraft enters your designated radar perimeter.

<p align="center">
  <img width="593" alt="AeroAlert Interface Preview" src="https://github.com/user-attachments/assets/f9129040-318f-4241-bf99-10d8aa3cc55e" />
</p>

---

## Download & Quick Start

1. Head over to the **[Releases](https://github.com/fareskk/AeroAlert/releases)** page.
2. Under **Assets**, download the latest `.exe` file.
3. Launch it, choose your location on the map, set your alert radius (e.g. 5 km), and click **Apply & Monitor**.

> ⚠️ **Note for Windows users**: Because AeroAlert is an open-source hobby project without a paid Code Signing certificate, Windows SmartScreen may show a warning on first launch. Simply click **"More info"** → **"Run anyway"**.

---

## Features

-  **Interactive Radar Perimeter**: Pick your house (or any spot on Earth) using OpenStreetMap / Leaflet and adjust your detection radius with a live circle preview.
-  **Native Windows Alerts**: Subtle desktop notifications showing the airline, callsign, altitude, and distance. Clicking the notification takes you directly to the live flight on Flightradar24.
  <p align="center">
  <img width="300" alt="Windows Toast Notification" src="https://github.com/user-attachments/assets/e0e771d4-74e6-40a9-8dd2-8a8bde7c34ee" />
  </p>
  
-  **In-Cabin Chime Alert**: Plays an airline cabin chime (the classic *ding-dong* cabin crew announcement chime) whenever a flight enters your airspace, complete with a one-click mute toggle for quiet focus hours.
-  **First-Seen Timestamps**: See the exact minute an aircraft entered your perimeter directly in the app list.
-  **Zero Setup & Free APIs**: Powered by community ADS-B networks (`adsb.lol` with fallback to `airplanes.live`). No API keys, no subscriptions, and no tracking accounts required.
-  **100% Portable**: No installer wizard cluttering your system. Just download the `.exe` and run.


---

##  Built With

- **[Electron](https://www.electronjs.org/)** — Desktop container & native OS integrations
- **[Leaflet.js](https://leafletjs.com/)** & **OpenStreetMap** — Map UI & radius visualization
- **[Nominatim](https://nominatim.org/)** — Geocoding & reverse geocoding address search
- **[adsb.lol](https://adsb.lol/)** & **[airplanes.live](https://airplanes.live/)** — Open-source ADS-B aircraft data
- **[adsbdb.com](https://adsbdb.com/)** — Flight route resolution & airline metadata

---

##  Disclaimer

This is an informal, hobby side-project made for aviation enthusiasts and curious minds. All airspace data relies on crowd-sourced community ADS-B feeders.
