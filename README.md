# Takeover · השתלטות

A trivia territory game for a living room: one shared screen (laptop → TV), a host at the keyboard, and friends shouting answers. Each player starts with one tile and one category. Win a duel and you take over every tile your opponent owned. Last player standing owns the board.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (grid/adjacency, reducer, packs)
npm run build    # production build in dist/
```

No backend. Everything is saved to `localStorage`, so a refresh never loses the game. A duel that was running when the page reloaded comes back paused.

## How a game goes

1. **Setup.** Add players, give each a name and a category (pick a pack or create one on the spot). Pick a grid shape whose tile count equals the player count, drag tiles to rearrange seating, and set the duel clock, pass penalty and an optional prize.
2. **Randomizer.** Press **Spin** (or Space/Enter). It lands on a random remaining player.
3. **Challenge.** That player's orthogonal neighbours glow. Click one.
4. **Duel.** The category is the category of the defender's tile that borders the challenger. If the bordering tiles carry different categories, the defender's original category is used.
5. **Takeover.** The winner takes all of the loser's tiles. Conquered tiles keep their original category. The loser is out.
6. The winner chooses **Duel again** or **Back to the randomizer**. When one player owns the whole board, the winner screen appears.

### Host keys during a duel

| Key | Action |
| --- | --- |
| Space or → | Correct. Next question, clock switches to the other player |
| P | Pass. Penalty deducted, same player keeps answering |
| Esc | Pause or resume. The pause menu can also declare a winner |
| Enter | Continue after the result screen |

The previous answer flashes at the top after each correct or pass. Questions never repeat within a game. If a category runs out, the clock pauses and the host can reuse questions or declare a winner.

### Fixing mistakes

The history panel has **Undo last result**, which restores the board to just before the duel. It also has **Give last duel to the other player**, which reverses the result. Both work repeatedly, back through the last 50 duels.

## Question packs

Built-in packs live in `public/packs/` and are listed in `public/packs/index.json`.

```json
{
  "id": "en-world-capitals",
  "name": "World Capitals",
  "lang": "en",
  "questions": [{ "prompt": "France", "answer": "Paris", "image": "https://… (optional)" }]
}
```

**Picture mode (current).** The shipped packs use an `images` array instead. When `images` is present, it replaces `questions`, and each picture is shown full size. Every entry is an object with the image URL and the answer the host sees after a correct or a pass:

```json
"images": [
  { "url": "https://example.com/ferrari.jpg", "answer": "Ferrari" },
  { "url": "https://example.com/porsche.jpg", "answer": "Porsche" }
]
```

Entries with an empty `url` or `answer` are skipped, so the blank template entry in each pack is harmless.

An entry with an empty `url` is a placeholder. It keeps the answer in the list but is skipped in the game until it gets a picture.

To add a built-in pack, drop the JSON file in `public/packs/` and add its filename to `index.json`.

### Building a picture pack

Every shipped pack already lists its answers with empty URLs. To fill in the pictures automatically, run the script with the pack id and a source:

```bash
npm run build-pack -- --id he-fruits --source wikipedia-he
```

Only entries without a picture are looked up. To start a new pack from a text file of answers, one per line, add `--answers`:

```bash
npm run build-pack -- --answers fruits.txt --source wikipedia-he --id he-fruits --name "פירות"
# short form: npm run build-pack fruits.txt wikipedia-he he-fruits
```

| Source | Finds | Notes |
| --- | --- | --- |
| `wikipedia-he`, `wikipedia-en` | The article's lead image | Exact title first, then the best search hit with an image |
| `flagcdn` | Country flags | Accepts Hebrew or English country names, or an ISO code such as `il` |
| `tmdb` | Movie posters, actor photos | Needs `TMDB_API_KEY` (v3 key or v4 token) in the environment |
| `itunes` | Album artwork | iTunes has no artist photos, so singers get an album cover |

- **Images** are saved to `public/packs/<id>/` and referenced as `/packs/<id>/<file>`. The pack JSON is written to `public/packs/<id>.json` and registered in `index.json`.
- **Missing images** are printed at the end. The answer stays in the pack with an empty URL. With `--answers`, the list is also saved to `<answers file>.missing.txt`.
- **Different search term:** in an answers file, write `answer | search term`, for example `רימון | רימון (פרי)`. Hebrew words with several meanings need this; "רימון" alone finds a grenade.
- **Re-running** keeps pictures already downloaded for the same answer. Pass `--force` to fetch them again; if a forced lookup fails, the old picture is kept. Entries added in the review page that aren't in the answers file are kept.
- Lines starting with `#` are ignored. Other options: `--lang he|en`, `--delay <ms>` between lookups (default 1000).

### Reviewing a pack

In the app, open **Category editor** and press **Review** on a built-in pack. The page shows every picture with its answer. While `npm run dev` is running you can:

- edit an answer in place,
- delete a picture,
- replace a picture by searching any source with another term, pasting an image URL, or uploading a file,
- add a picture.

Changes are written straight to the pack files by a dev-only Vite plugin in [scripts/lib/dev-pack-api.mjs](scripts/lib/dev-pack-api.mjs). Image files that are no longer used are deleted. In a production build the review page is read-only.

The in-app **Category editor** creates custom packs, adds text and image questions (URL or uploaded image, downscaled and stored as a data URL), and imports or exports JSON. Built-in packs are read-only; duplicate one to edit it. Custom packs are stored in `localStorage`. Large uploaded images can fill the browser quota, and the editor warns when that happens. Packs with fewer than 30 questions get a warning, since a duel can plausibly need that many.

Shipped packs (Hebrew picture packs; answers are listed, pictures still to be added):

| Pack | Id | Answers | Suggested source |
| --- | --- | --- | --- |
| פוליטיקאים ישראלים | he-israeli-politicians | 40 | wikipedia-he |
| פירות | he-fruits | 40 | wikipedia-he |
| זמרים ישראלים | he-israeli-singers | 40 | wikipedia-he |
| ערים ויישובים בישראל | he-israeli-cities | 40 | wikipedia-he |
| ספורט | he-sports | 40 | wikipedia-he |
| דגלי העולם | he-flags | 40 | flagcdn |
| בירות העולם | he-world-capitals | 60 | wikipedia-he |
| דמויות היסטוריות | he-historical-figures | 40 | wikipedia-he |
| ציורים מפורסמים | he-paintings | 40 | wikipedia-he |
| דמויות דיסני ופיקסאר | he-disney-pixar | 40 | wikipedia-he |
| סמלי רכבים | he-car-logos | 40 | wikipedia-he |
| תבלינים | he-spices | 40 | wikipedia-he |
| כלי מטבח | he-kitchen-tools | 40 | wikipedia-he |
| עולם החי | he-animals | 42 | wikipedia-he |
| ישראל | he-israel | 40 | wikipedia-he |
| גוף האדם | he-human-body | 40 | wikipedia-he |

## Architecture

```
src/
  game/                 pure logic + small runtime helpers
    types.ts            GameState, Player, Tile, Duel, Pack…
    grid.ts             neighbours, adjacency, border tiles, duel category, conquest, grid shapes
    reducer.ts          every game transition (turns, duel clock, undo/swap, history)
    packs.tsx           pack loading (public/packs + localStorage), validation, PacksProvider
    storage.ts          localStorage helpers and keys
    colors.ts           TV-friendly player palette
    sounds.ts           Web Audio sound effects + mute state
  i18n/
    translations.ts     every UI string, Hebrew and English
    i18n.tsx            language provider, sets <html dir/lang>, t()
  components/
    Board.tsx           territory grid, merged borders, staggered takeover flip
    HistoryLog.tsx      game log + undo/swap
    PackForm.tsx        category editor form (shared by setup and editor)
    ui.tsx              top bar, modal, confirm button, global toggles
  screens/
    SetupScreen.tsx  BoardScreen.tsx (randomizer, picking)  DuelScreen.tsx  WinnerScreen.tsx  EditorScreen.tsx
```

### State model

One serialisable `GameState` drives everything through a single reducer, and it is written to `localStorage` on every change.

```ts
GameState {
  phase: 'setup' | 'board' | 'duel' | 'winner'
  settings: { rows, cols, duelSeconds, passPenalty, prize }
  players: { id, name, color, categoryId, eliminated }[]
  tiles:   { index, ownerId, categoryId }[]        // categoryId never changes
  turn:    { stage: 'randomize' | 'choose' | 'postWin', activePlayerId }
  duel:    { challengerId, defenderId, categoryId, remaining: {challenger, defender} (ms),
             active, status: 'ready'|'running'|'paused'|'over', questionIndex, reveal, winner, … } | null
  used:    Record<categoryId, questionIndex[]>     // no repeats within a game
  history: { winnerId, loserId, categoryId, tilesTaken, kind, undone? }[]
  undo:    snapshots of tiles/players/turn taken before each result
}
```

The reducer stays pure. Actions that draw a question carry the pack size and a random number, so tests can replay them deterministically. The duel screen commits elapsed time to the reducer every 100 ms and flushes the remainder just before any host key, so the clock is exact at each switch.
