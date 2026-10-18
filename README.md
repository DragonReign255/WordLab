# WordLab — Custom Wordle

Offline-first word guessing game, version 0.1.6. No build tools, accounts, or subscriptions. A remote dictionary is optional; a local dictionary is bundled.

## Run and install

The app consists of the files in this folder. To use it as an **installable Progressive Web App (PWA)**, it must be served from **HTTPS** or from **http://localhost**. Merely opening `index.html` with `file://` is not sufficient: browsers restrict service workers and PWA installation on file URLs.

With Python installed, open a terminal in this folder and run:

```sh
python -m http.server 8000
```

Visit `http://localhost:8000` in Chrome or Edge. Open the browser's install option or use the **Install app** button when it appears. Hosting the contents of this folder on an HTTPS site, such as GitHub Pages, enables installation on other devices. On iPhone/iPad use the browser's **Add to Home Screen** feature.

Alternatively, open the separate `WordLab_Standalone.html` file. That single file works without a server but cannot use PWA installation or the service worker. Browser `file://` storage support varies; use **Export progress** for backup.

## Saved progress

Finished puzzle stats, missed words, daily games and active game state are stored in browser `localStorage` for the current origin (not in the HTML itself). Closing the app retains data in normal browsing until the browser's site data is cleared. Different origins, private windows and devices do not automatically share progress. **Export progress** saves a JSON backup; **Import progress** restores statistics/history/settings and starts a fresh puzzle. The selected difficulty and categories are also restored.

Timers use wall-clock time and continue while the app is closed. Timed-out puzzles cannot resume.

## Rules and modes

**Mode-specific controls:** Classic fixes word-game rules (5 letters, 6 guesses, no hints or time restrictions), but now allows an optional answer seed. Daily permits only word length and number of guesses; its daily seed is automatic. Custom Challenge and Reverse use a specified secret, so the random seed field is hidden. Other modes show relevant controls, and disabled options cannot affect the puzzle or seed.

**Modes:** Classic (one puzzle), Unlimited, Daily (UTC seeded answer; same settings yield same answer), Speedrun, Survival (fresh attempts or shared guesses), Multi-word (2, 4, 8 boards), Blind (no color memory on keyboard), Reverse (computer tries to guess your word), Custom challenge (secret word and shareable challenge code), Progression (word length and difficulty rise), Practice (prior missed answers), **Chain Reaction** (one phrase-linked word at a time, with completed boards collapsing and upcoming words represented by a single row of empty squares).

**Keyboard:** Click/tap letters or type on a physical keyboard; press Enter to submit. **Editing is allowed only on the active, unsubmitted row.** Use Backspace/Delete, arrow keys, or click a tile to replace individual letters. The on-screen keyboard has a Backspace key. After Enter accepts a word, that entire submitted row is locked forever. A rejected non-dictionary guess remains editable without consuming an attempt. The on-screen keyboard shows letter feedback except in Blind mode; in Multi-word it shows the best-known marking across the boards.

**Seeds:** Below Game mode, check **Seed** and enter any text or number (maximum 100 characters). The same seed, mode configuration, word lists and sequence round reproduce the same puzzle, including random word lengths and Chain Reaction selections. Uncheck Seed to use non-deterministic random choices. Daily has its own date-derived selection and no seed field. Seed values affect the selected answers, not your guesses, timers or statistics.

**Chain Reaction:** Select a phrase theme (or All chain themes), optional **minimum**/**maximum** letters (leave Open for the library's full 3–9-letter range), and a chain length of 3–9 words or Random. Chains are curated as ordered paths: each adjacent pair forms a common phrase, compound word or familiar association. The first word is revealed as the starting link. Only the current word expands into a full Wordle board; the others are single-row placeholders showing how many letters they contain. On a correct guess, that board collapses to its completed word, the associated two-word phrase is shown, and the next board expands. Attempts and hints reset for each new word; a chain counts as one completed game in lifetime stats. A loss reveals the chain in the status text. Chain themes live in `chains.json` independently of regular answer categories. Because phrases may contain names or less common terms, authored chain words are always included in accepted guesses.

**Hints:** Configure an anytime hint and a final-try hint. The anytime hint can be used once at any point during the puzzle, and the final-try hint only once on the final attempt. Each reveals a correct letter **and position**; hints cannot be exchanged or carried over. Easy-mode starting letters are separate automatic reveals. In Multi-word, click a board to choose which answer receives the hint.

**Difficulty:** Uses a lightweight heuristic based on letter rarity, repeated characters and letter patterns among *curated* possible answers. It is not calibrated to a word-frequency corpus. A large offline dictionary is used to validate guesses; the much smaller set of curated answers prevents obscure dictionary entries from becoming arbitrary answers. Category selection restricts **answers**, not valid guesses.

**Custom codes:** Challenge codes are Base64-encoded, **not encrypted**. Anyone can decode the answer; they are for casual sharing. To share across devices, paste the code in the other person's app; links require deploying the app to a shared HTTPS URL.

**Statistics:** Statistics record completed rounds across modes. Skipping an Unlimited/Speedrun word counts as a loss. Active guesses are saved, and incomplete attempts do not count until resolved or timed out.

## Offline dictionary attribution

Accepted guesses are based on the Carnegie Mellon University Pronouncing Dictionary (CMUdict), accessed via the Python `cmudict` package, together with curated game vocabulary. See `DICTIONARY-NOTICE.txt` for attribution. Some legitimate English words may not be present, and some proper names may be accepted as guesses. The answers come from curated topical lists; spelling and subcategory classification may be refined in later releases.

## Technical structure

- `index.html` — interface
- `styles.css` — layout and appearance
- `app.js` — gameplay, validation, state, game modes, timers
- `categories.json` — editable hierarchical category sets
- `chains.json` — curated chains grouped into phrase themes
- `dictionary.txt` — offline accepted-guess wordlist
- `manifest.webmanifest`, `sw.js`, `icons/` — installability and offline caching

You can modify the project using any text editor. When deploying changes, increment `CACHE` in `sw.js` to update cached versions.

## Online dictionary

The offline file `dictionary.txt` remains fully available without a network connection. On an internet connection the app attempts to download a larger English word list from `dwyl/english-words` (`words_alpha.txt`, approximately 370,000 alphabetic entries of all lengths), keeping only 3–9-letter entries. The downloaded list is cached with IndexedDB when available and refreshed after approximately 30 days (or manually with **Refresh online dictionary**). Unrecognized guesses also get a per-word request to `dictionaryapi.dev` when internet access is available. Requests might fail due to browser network restrictions, CORS, privacy settings or the third-party services being offline; the game continues using its local list. Internet-only words are accepted as guesses but are NOT used as randomly selected answers. Some large-list entries are uncommon, archaic, or proper terms, so this is not equivalent to a comprehensive professionally edited dictionary.

Online data sources (not bundled with the download):
- https://github.com/dwyl/english-words — expanded word list; note its upstream licensing discussion.
- https://dictionaryapi.dev/ — optional per-word validation with no key.

## Video games

A new **Video Games** category contains **Legend of Zelda**, **Super Mario**, **Minecraft**, and **Pokémon**. Branded names are valid guesses because they are included in curated answer lists. Games-related answers remain limited to alphabetic words of length 3–9.

## v0.1.6 changes

- Copy Seed appears after a round ends. Unseeded runs now receive an internal random seed so their puzzles can be reproduced with the Seed checkbox and the same settings. Daily, custom, and reverse modes do not expose a copyable run seed.
- A small + in the category heading lets you add a 3–9 letter word to an existing category/subcategory. Unknown words are accepted as user additions to the local runtime dictionary. Changes persist in local storage, and are included in exported progress; they do not modify the read-only dictionary.txt or categories.json files on disk.
- Existing saved games and statistics are retained.
