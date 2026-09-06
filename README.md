# ✈️ AeroAlert

> *"Wait, what plane was that?"* — A fun little project built so you never have to wonder again.

Have you ever been sitting at your desk, heard an aircraft roaring overhead, and scrambled to open Flightradar24 only to realize it already flew past? 

**AeroAlert** solves that very specific itch. It's a lightweight, portable desktop companion that quietly monitors the airspace directly above your roof and pings you whenever an aircraft enters your designated radar perimeter.

---

## ✨ Features

- 📍 **Interactive Radar Perimeter**: Pick your house (or any spot on Earth) using OpenStreetMap / Leaflet and adjust your detection radius with a live circle preview.
- 🔔 **Native Windows Alerts**: Subtle desktop notifications showing the airline, callsign, altitude, and distance. Clicking the notification takes you directly to the live flight on Flightradar24.
- 🔊 **Custom Sound Effect**: Plays a pleasant audio chime whenever a flight enters your airspace (with a handy one-click mute button if you need quiet focus time).
- 🕒 **First-Seen Timestamps**: See the exact minute an aircraft entered your perimeter directly in the app list.
- ⚡ **Zero Setup & Free APIs**: Powered by community ADS-B networks (`adsb.lol` with fallback to `airplanes.live`). No API keys, no subscriptions, and no tracking accounts required.
- 💼 **100% Portable**: No installer wizard cluttering your system. Just download the `.exe` and run.

---

## 🚀 Download & Quick Start

1. Head over to the **[Releases](https://github.com/fareskk/AeroAlert/releases)** page.
2. Under **Assets**, download the `.exe` file.
3. Launch it, choose your location on the map, set your alert radius (e.g. 5 km), and click **Apply & Monitor**.

---

## 🛠️ Built With

- **[Electron](https://www.electronjs.org/)** — Desktop container & native OS integrations
- **[Leaflet.js](https://leafletjs.com/)** & **OpenStreetMap** — Map UI & radius visualization
- **[Nominatim](https://nominatim.org/)** — Geocoding & reverse geocoding address search
- **[adsb.lol](https://adsb.lol/)** & **[airplanes.live](https://airplanes.live/)** — Open-source ADS-B aircraft data
- **[adsbdb.com](https://adsbdb.com/)** — Flight route resolution & airline metadata

---
> **Note for Windows users**: Because AeroAlert is an open-source hobby project without an expensive Code Signing certificate, Windows SmartScreen may show a warning on first launch. Simply click **"More info"** -> **"Run anyway"**.
