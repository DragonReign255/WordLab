# WordLab

**WordLab v0.1.6** is a customizable, offline-first Wordle-style word game. Play in a browser or install it as a **Progressive Web App (PWA)** on supported desktop and mobile devices. No account or build process is required.

## Play

Open the published WordLab website in a browser. To install it on an iPhone, open the HTTPS site in Safari, tap **Share → Add to Home Screen**, and select **Add**. The game can work offline after the required files have been cached.

To run a local copy, download the repository and run this command in the directory containing `index.html`:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`. PWA installation and service workers require HTTPS or a supported localhost origin; they do not work when opening `index.html` directly as a `file://` URL.

## Features

- **12 game modes:** Classic, Unlimited, Daily, Speedrun, Survival, Multi-word, Blind, Reverse, Custom Challenge, Progression, Practice, and Chain Reaction.
- **Mode-aware settings:** Classic uses fixed traditional rules; Daily exposes word length and guess count; other modes expose relevant options.
- **Configurable puzzles:** 3–9-letter words, variable guess counts, difficulty levels, random word length, optional timers, repeated-letter rules, and easy-mode starting letters (where supported).
- **Seeded runs:** Optionally enter a text or numeric seed to reproduce puzzle selection. A **Copy Seed** button appears after eligible games end. Daily games use an automatic date-based seed.
- **Hints:** Optional once-per-word hint available during play and an optional extra hint on the final attempt.
- **Word categories:** Searchable categories and subcategories, including engineering, manufacturing, automotive, and video games (Legend of Zelda, Super Mario, Minecraft, and Pokémon).
- **Add your own words:** Use the **+** button near the category library to add a word to a category/subcategory. Custom additions are saved in local browser storage and merged with the accepted-word list.
- **Chain Reaction:** Solve a sequence of words connected by familiar phrases or associations. Completed boards collapse into words; upcoming words remain one-row length placeholders until unlocked. Choose chain theme, word-length bounds, and chain length.
- **Editable current guess:** Change or erase letters before submitting with Enter. Submitted valid guesses are locked.
- **Offline and online dictionaries:** Bundled accepted-word list for offline play; optional expanded word-list download and online validation when available.
- **Persistent progress:** Local statistics, saved game state, and export/import backups.

## How to play

Enter a word of the required length and press **Enter**. Feedback shows which letters are correct and correctly positioned, present in the answer but elsewhere, or absent. Use the on-screen keyboard or a physical keyboard. You can edit the current guess until it is submitted; previous accepted guesses cannot be changed.

In **Chain Reaction**, the first word is supplied. Solve the next word, using the relationship between adjacent words as a clue, to reveal the next board.

## Data and privacy

WordLab saves progress in your browser's local storage. It does **not** automatically synchronize between browsers, devices, or website addresses. Clearing site data may erase statistics and custom words; use **Export progress** to keep a backup. Internet dictionary requests contact third-party services when enabled/available. There is no WordLab account requirement.

Custom words do **not** modify the repository's `dictionary.txt` or `categories.json` files. They are stored per browser and included in exported progress.

## Project files

| File | Purpose |
| --- | --- |
| `index.html` | Game interface |
| `styles.css` | Styling and responsive layout |
| `app.js` | Game logic, settings, storage, and dictionary handling |
| `categories.json` | Curated categories and subcategories |
| `chains.json` | Curated Chain Reaction themes and word sequences |
| `dictionary.txt` | Bundled offline accepted-word dictionary |
| `manifest.webmanifest` | PWA metadata |
| `sw.js` | Service worker and offline caching |
| `icons/` | Installable app icons |
| `DICTIONARY-NOTICE.txt` | Dictionary attribution and license notice |

## Updating the published game

This project is a static site and can be hosted on **GitHub Pages**. Commit updated files to the branch and directory configured under **Settings → Pages**. If the game keeps showing an older version, update the service-worker cache identifier in `sw.js`, publish the change, and reload. Existing statistics generally remain intact when the site origin and local storage are unchanged.

## Dictionary notes

The bundled offline accepted-word list is derived in part from the **Carnegie Mellon University Pronouncing Dictionary (CMUdict)**. See [`DICTIONARY-NOTICE.txt`](DICTIONARY-NOTICE.txt) for required attribution and terms.

When connected, the game can also use the [`dwyl/english-words`](https://github.com/dwyl/english-words) word list and the [Free Dictionary API](https://dictionaryapi.dev/) for supplemental validation. External word lists can contain rare words or omissions; they are used to validate guesses, not to indiscriminately select random answers.

## Version history

### v0.1.6
- Added **Copy Seed** after eligible completed rounds.
- Added a **+** dialog for user-defined words in existing categories and subcategories.
- Preserved local progress and existing modes.

### Earlier builds
- Added Chain Reaction, seeded puzzles, searchable categories, game-specific settings, online/offline dictionary support, and PWA installation.

## Development status

WordLab is under active development. Feature behavior and curated vocabulary may change. Please report reproducible bugs with the game mode, settings, browser/device, and steps to reproduce.
