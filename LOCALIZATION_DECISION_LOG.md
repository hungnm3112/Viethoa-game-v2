# Localization Decision Log

Purpose:

- Keep a compact record of what was proven while localizing State of Decay YOSE.
- Avoid repeating crash-prone tests.
- Separate source/authoring files from runtime files the game actually loads.

Last confirmed test: 2026-06-12.

## Current Stable Baseline

Game folder:

```text
D:\SteamLibrary\steamapps\common\State of Decay YOSE\Game
```

Confirmed working menu test:

- `Game\languages\english.win.btxt`
- `Game\languages\englishau.win.btxt`

The current menu can show ASCII Vietnamese strings:

```text
Tiep tuc
Choi moi
Chon ho so
Xep hang
Thanh tich
Tro giup
Thoat
```

Important note:

- This is Vietnamese without diacritics.
- This was intentional for the safe smoke test.
- Diacritics are a separate font/encoding problem and should not be mixed into crash triage.

## Proven Runtime Paths

### Main Menu Text

Correct runtime files:

```text
languages/english.win.btxt
languages/englishau.win.btxt
```

Evidence:

- Copying translated `embeddedstrings.xml` alone did not change visible menu text.
- Patching `english*.win.btxt` changed visible menu text immediately.
- The visible menu labels `Start a New Game`, `Help & Options`, `Exit Game`, etc. were found inside BTXT.

Conclusion:

- Main menu text must be localized through BTXT, not loose XML.

### Loose Embedded Strings XML

Source/output files:

```text
input/gamedata/languages/embeddedstrings.xml
output/gamedata/languages/embeddedstrings.xml
Game\languages\embeddedstrings.xml
```

What is known:

- The file can be copied into `Game\languages`.
- It can contain translated strings.
- It did not affect the visible main menu/autosave text in current tests.

Conclusion:

- Treat `embeddedstrings.xml` mostly as source/authoring data for BTXT or for systems not yet proven.
- Do not expect loose `embeddedstrings.xml` to localize the main menu.

### Tips and Tutorial Text

Likely source:

```text
input/gamedata/libs/class3/contentmanager/hints.xml
```

Examples found there:

```text
TIP: Press [crouch] to turn your flashlight on or off.
The survivor page is where you view your progress...
```

Current status:

- Not yet proven as a safe runtime loose override.
- May require `.win.bmd` runtime build or PAK route.

Conclusion:

- Do not assume copying `hints.xml` loose will work.
- Test hints as a small isolated cluster later.

## Crash-Prone Changes

### Legacy BTXT Padding With Null Bytes (OBSOLETE)

Bad behavior:

- Replacing a long null-terminated string with a shorter string.
- Filling all remaining bytes with `00`.

Example bad transformation:

```text
Start a New Game\0
Choi moi\0\0\0\0\0\0\0\0\0
```

Observed result:

- Game crashed or exited before menu.

**Update (02/07/2026):**
The legacy BTXT padding method has been **OBSOLETED**. We now use a Python `construct` parser (`tools/python/btxt_parser.py`) which correctly rebuilds the entire binary string table.
- You can now translate BTXT strings to any length (longer or shorter).
- No manual padding of any kind is required anymore.

### Broad Binary Replacement

Bad behavior:

- Replacing substrings broadly across the whole binary.
- Replacing non-unique text without verifying exactly one match.

Observed/recorded result:

- Earlier binary BTXT tests caused crash.

Rule:

- Only patch exact null-terminated strings.
- Only patch if the match is unique.
- Skip ambiguous strings.

### Deploying Broad Output Into Game

Risky command:

```bash
npm run sync-game
```

Reason:

- It may deploy many generated files at once.
- It may include patched BTXT, PAK, BMD, GFX, or loose folders whose safety is not currently proven together.

Rule:

- For smoke tests, copy only the small file cluster being tested.
- Keep backup per test.

## Confirmed Safe BTXT Patch Style (Modern Python Workflow)

Correct behavior (via Python `btxt_parser.py`):

- Rebuild the entire binary BTXT structure.
- Variable-length translations are fully supported.
- Let the parser recalculate offsets automatically.

Current tool:

```text
tools/python/build_btxt_expanded.py
```

Current command:

```bash
npm run build-btxt:expanded-pilot:workflow
```

## BMD Same-Length Requirement (ACTIVE)

Unlike BTXT, BMD files use a proprietary `DMBU` binary structure that is not fully understood. Rebuilding them with variable lengths causes immediate runtime crashes.

Rule:
- BMD files (Items, Gameplay Text) MUST be patched using the `samelength` Node.js script. Translations must be abbreviated to fit the original byte length.

Current safe output:

```text
output/gamedata/languages/english.win.btxt
output/gamedata/languages/englishau.win.btxt
```

Current copy targets:

```text
Game\languages\english.win.btxt
Game\languages\englishau.win.btxt
```

Current confirmed behavior:

- Game reaches menu.
- Menu text changes to ASCII Vietnamese.

## Safe Deployment Rules

Before copying files:

- Close `StateOfDecay.exe`.
- Back up the current target files.
- Copy only the tested cluster.
- Verify the target file contains expected strings after copy.

Recommended BTXT smoke copy:

```text
copy output/gamedata/languages/english.win.btxt    -> Game/languages/english.win.btxt
copy output/gamedata/languages/englishau.win.btxt  -> Game/languages/englishau.win.btxt
```

Do not copy:

```text
output/gamedata/languages/*.win.btxt
```

as a broad wildcard unless the source set is known and verified.

## Rollback Notes

Recent known backup folders:

```text
Game\_codex_btxt_smoke_backup\20260612-211956
Game\_codex_btxt_spacepad_backup\20260612-212901
```

Meaning:

- `smoke_backup` was created before the null-padded BTXT test.
- `spacepad_backup` was created before the space-padded BTXT test.

If a BTXT test crashes:

1. Close the game.
2. Restore `english.win.btxt` and `englishau.win.btxt` from the latest backup made before the test.
3. Re-test game boot before changing anything else.

## Diacritics Status

Current visible result:

- Vietnamese without diacritics works in menu.

Not yet solved:

- Vietnamese with diacritics.

Known related systems:

- BTXT stores text bytes.
- Main menu rendering uses Scaleform/GFX embedded fonts.
- `class3_frontend.gfx` contains embedded fonts such as `Decaying Kuntry` and `BrainsForSale`.
- Loose `fonts/veramono.ttf` is not enough for main menu text.

Rule:

- Do not add diacritics to broad BTXT/menu patches until the font route is isolated again.
- Test diacritics with one string only.

## Next Recommended Plan

## 2026-06-12 Update: Diacritic Menu BTXT Probe

Status:

- Built and deployed a small UTF-8 diacritic BTXT patch for menu labels.
- File size is still unchanged.
- Replacement still uses the safe rule: fill remaining bytes with spaces and keep exactly one final null terminator.
- Deployed files:

```text
Game/languages/english.win.btxt
Game/languages/englishau.win.btxt
```

Backup before deploy:

```text
D:\SteamLibrary\steamapps\common\State of Decay YOSE\Game\_codex_btxt_diacritic_backup\20260612-214247
```

Confirmed strings present in both game BTXT files:

```text
Chơi mới
Hồ sơ
Xếp hạng
Thành tích
Trợ giúp
Thoát
Tiếp
```

Notes:

- `Continue -> Tiếp tục` is too long for the original `Continue\0` field, so current safe patch uses `Tiếp`.
- `Select Profile -> Chọn hồ sơ` is too long by 1 byte, so current safe patch uses `Hồ sơ`.
- `Close -> Đóng` is too long for `Close\0`, so it is intentionally skipped.
- If the game boots but accents render as boxes or broken glyphs, the next issue is font/GFX, not BTXT string encoding.
- Do not attempt variable-length BTXT patching yet; it may invalidate internal offsets.

Runtime verification:

- User tested the deployed diacritic BTXT build in game.
- Game boots and menu text changes, so the BTXT patch is being loaded.
- Vietnamese accent glyphs render as square boxes in the main menu.
- This confirms the current blocker is the Scaleform/GFX menu font, not BTXT encoding.
- The ASCII/no-accent menu is still the stable fallback if the font probe causes problems.

Implication:

- Keep the diacritic BTXT patch logic, but do not expand accented text coverage until the UI font route is fixed.
- Next work should target the front-end UI font cluster only.
- Do not mix font/GFX changes with XML/BMD/PAK text expansion during this probe.

## 2026-06-12 Update: Cluster A Front-End Font Probe

Status:

- Built and deployed a front-end UI font probe.
- Scope is limited to menu/front-end font assets only.
- No XML/BMD/text expansion was deployed in this step.

Build commands:

```text
npm run patch-cluster-a
npm run build-font-swf
npm run build-ui-aliases
```

Deployed files:

```text
Game/libs/ui/class3_frontend.gfx
Game/libs/ui/menus_startmenu.gfx
Game/libs/ui/menus_confirmation.gfx
Game/libs/ui/entityflashtag.gfx
Game/libs/ui/HUD_Font_LocFont.swf
Game/libs/ui/Menus_Startmenu.swf
Game/libs/ui/Menus_Confirmation.swf
Game/libs/ui/EntityFlashTag.swf
```

Backup before deploy:

```text
D:\SteamLibrary\steamapps\common\State of Decay YOSE\Game\_codex_cluster_a_font_backup\20260612-215525
```

Technical intent:

- `class3_frontend.gfx`: replace embedded `Decaying Kuntry` and `BrainsForSale` font glyph data with Arial glyph data from `class3_pause.gfx`.
- `menus_startmenu.gfx`, `menus_confirmation.gfx`, `entityflashtag.gfx`: replace imported `Font_Body` with embedded Arial glyph data.
- `HUD_Font_LocFont.swf`: export `Font_Body` using the same Arial glyph data.
- Alias SWFs are deployed because menu ActionScript loads `Menus_Startmenu.swf`, `Menus_Confirmation.swf`, and `EntityFlashTag.swf`.

Test expectation:

- If the game boots and Vietnamese accents render correctly in the main menu, Cluster A is the correct font route.
- If the game boots but accents are still boxes, `class3_frontend.gfx` text fields may still point to font classes that need deeper symbol/font mapping.
- If the game crashes or front-end UI disappears, rollback only the Cluster A files from the backup above.

### Phase A: Stabilize Menu Text

Goal:

- Keep menu translated without crash.

Method:

- Continue using `tools/build-btxt.js`.
- Prefer UTF-8 Vietnamese with accents only when the replacement fits inside the original byte budget.
- Use shorter Vietnamese labels when the full accented translation is too long.
- Patch a small set of unique menu strings only.

### Phase B: One-String Diacritic Probe

Goal:

- Determine whether diacritics fail because of BTXT encoding or embedded font glyphs.

Current result:

- BTXT can contain UTF-8 Vietnamese strings.
- Runtime rendering still needs user/game verification.

Method:

- Patch one unique menu string only.
- Use UTF-8 Vietnamese.
- Do not patch multiple strings in the same test.
- If the game boots but glyphs are wrong, the next issue is font rendering.

### Phase C: Font/GFX Probe

Goal:

- Make menu render Vietnamese diacritics.

Likely files:

```text
libs/ui/class3_frontend.gfx
libs/ui/menus_startmenu.gfx
libs/ui/menus_confirmation.gfx
libs/ui/HUD_Font_LocFont.swf
```

Rule:

- Test one UI asset cluster at a time.
- Do not combine font/GFX changes with large text/BMD/PAK changes.

### Phase D: Gameplay Tips

Goal:

- Localize tutorial tips and help panels.

Likely file:

```text
libs/class3/contentmanager/hints.xml
```

Unknown:

- Whether the game loads loose XML for hints.
- Whether it requires `.win.bmd`.

Method:

- Patch one obvious tip.
- Test loose XML first only if isolated.
- If no effect, build/deploy only the matching BMD.

## Short Rules To Remember

- Menu text: BTXT.
- Loose `embeddedstrings.xml`: not enough for menu.
- Tips: likely `hints.xml` or BMD, not yet proven.
- BTXT shorter replacement: pad with spaces, keep one null terminator.
- Extra null padding in BTXT can crash.

## 2026-06-12 Update: Expanded BTXT Rebuild Plan

### New Finding

The BTXT format is now understood enough for a controlled variable-length rebuild:

```text
TXDB header
version/reserved/count
count * uint32 hash/index values
count null-terminated UTF-8 strings
```

The 32-bit table after the header is not a direct string offset table. Preserve it exactly.

### New Rule

For Vietnamese text longer than the English source, do not patch bytes in place.

Use the expanded rebuild flow:

```text
tools/lib/btxt.js
tools/build-btxt-expanded.js
config/btxt-expanded-pilot.json
```

The pilot scope should stay at 5-10 front-end strings until the game confirms the rebuilt BTXT boots cleanly.

### Dashboard Scripts

```text
npm run build-btxt:expanded-pilot:dry
npm run build-btxt:expanded-pilot
npm run sync-btxt-languages
```

Report:

```text
output/reports/build-btxt-expanded-report.json
```

### Test Rule

When testing expanded BTXT, change only:

```text
Game/languages/english.win.btxt
Game/languages/englishau.win.btxt
```

Keep GFX/XML/PAK unchanged during this specific smoke test.

### Confirmed Result

User runtime test confirmed:

- Game boots cleanly with the expanded BTXT pilot.
- Main menu text is localized with Vietnamese diacritics.
- The longer Vietnamese strings no longer require shortening to fit the original English byte length.
- Cluster A front-end font patch is required and works with the expanded BTXT pilot.

### Rule To Keep

For front-end/menu text, the preferred safe path is now:

```text
Cluster A font files already deployed
BTXT expanded rebuild from original gamedata.pak
copy only languages/english.win.btxt and languages/englishau.win.btxt
```

Do not go back to broad binary string replacement for longer Vietnamese text.
Do not deploy broad PAK/XML/BMD changes in the same test as a BTXT expansion.

Dashboard-safe commands:

```text
npm run build-btxt:expanded-pilot:workflow
npm run deploy-btxt:expanded-pilot
```

The deploy workflow must:

1. Dry-run expanded BTXT first.
2. Build only after validation passes.
3. Back up current game BTXT files.
4. Copy only `english.win.btxt` and `englishau.win.btxt`.

### Loose Language Folder Rule

The vanilla game folder may not contain:

```text
Game\languages
```

This is not a build failure. Loose language deployment must create that folder when the game root itself is valid.

Rule:

- Throw if `GameRoot` does not exist.
- Throw if the computed `languages` target escapes `GameRoot`.
- Create `Game\languages` if it is missing.
- Then copy only the tested language files.

### Font Regression Rule

Symptom:

```text
Menu text is Vietnamese UTF-8 but accent glyphs show as square boxes.
```

Meaning:

- BTXT text is being loaded.
- Cluster A front-end font override is missing, stale, or was moved away by a broad deploy/cleanup.

Fix only the known font cluster:

```text
npm run patch-cluster-a
npm run build-font-swf
npm run build-ui-aliases
npm run sync-font-cluster-a
```

Do not rebuild or deploy PAK/XML just to fix this symptom.

2026-06-13 confirmation:

- The square-box regression returned after text/BTXT sync while Cluster A loose font files were not present/current in `Game\libs\ui`.
- Rebuilt and synced only Cluster A font files.
- Verified 8/8 game files match output hashes.
- Backup before copy:

```text
D:\SteamLibrary\steamapps\common\State of Decay YOSE\Game\_codex_cluster_a_font_backup\20260613-184252
```

### Dashboard UX Note

Observed after first dashboard deploy test:

- `Build + copy BTXT pilot` did run successfully.
- The game files were copied and backed up correctly.
- The dashboard looked like "nothing happened" because the persistent translation queue notice had priority over the just-finished deploy action.

Rule:

- Short build/deploy actions must show their own recent success/failure message even when translation jobs are still pending.
- After starting an action from the dashboard, refresh progress immediately instead of waiting for the next polling interval.
- Broad deploy can crash.
- ASCII Vietnamese menu currently works.
- Diacritics are not fixed yet; treat as separate font/encoding task.

### Dashboard Encoding Rule

Observed:

- Editing `dashboard/index.html` through a Windows shell path can corrupt UTF-8 text into mojibake, for example `Việt hóa` becoming `Viá»‡t hÃ³a`.
- This breaks the dashboard UI text itself, even though game font patches are unrelated.

Rule:

- Keep dashboard HTML/JS/CSS as UTF-8.
- Do not patch Vietnamese dashboard text with ad-hoc shell text replacement.
- After editing dashboard text, verify with `rg`, `git diff`, or a browser refresh, not only `Get-Content` in Windows PowerShell because UTF-8 without BOM may display incorrectly there.

## 2026-06-13 Update: Cluster B Font + Scenes BMD Deploy

### Findings Before This Deploy

Direct inspection of `D:\SteamLibrary\steamapps\common\State of Decay YOSE\Game`:

- Menu works: game loads `Game\languages\english.win.btxt`, `englishau.win.btxt` and 8 Cluster A font files in `Game\libs\ui`.
- In-game menu font broken (square boxes): `class3_pause.gfx` was missing from `Game\libs\ui`. Game fell back to PAK version which has no Vietnamese glyphs.
- Dialogue still English: `Game\libs\class3\contentmanager\scenes.win.bmd` was never copied. Output file confirmed to contain Vietnamese.

### Step 1: Cluster B Font (in-game pause/menu fix)

```text
Source:      output/gamedata/libs/ui/class3_pause.gfx
Destination: Game/libs/ui/class3_pause.gfx
Size:        2,049.6 KB
Built with:  npm run patch-cluster-b
```

New file — did not exist in game folder before.

### Step 2: Scenes BMD (dialogue test)

```text
Source:      output/gamedata/libs/class3/contentmanager/scenes.win.bmd
Destination: Game/libs/class3/contentmanager/scenes.win.bmd
Size:        2,122.6 KB
```

Created new directory `Game\libs\class3\contentmanager\` (did not exist before).
Loose BMD override — game should prefer loose file over PAK version.

### Backup Reference

```text
D:\SteamLibrary\steamapps\common\State of Decay YOSE\Game\_codex_cluster_b_bmd_deploy\20260613-190733
```

Both files were new additions. To rollback, delete:

```text
Game\libs\ui\class3_pause.gfx
Game\libs\class3\contentmanager\scenes.win.bmd
```

### Test Expectations

- Game boots + pause/HUD menus show Vietnamese diacritics → Cluster B font route confirmed.
- Game boots + early dialogue shows Vietnamese → loose BMD override works.
- Game crashes → rollback `scenes.win.bmd` first (new directory, higher crash risk), then `class3_pause.gfx` separately.

### Rule

Do not deploy PAK or `embeddedstrings.xml` alongside this test.
Keep each system isolated until runtime behavior is confirmed.

## 2026-06-13 Update: BMD Same-Length Runtime Rule

Confirmed by follow-up testing:

- The crash root cause for translated BMD runtime files is string position shifting.
- Variable-length BMD rebuilds can boot to menu and then crash later because internal string references no longer point at the same byte positions.
- A runtime-safe BMD patch must keep each original string slot at the exact same byte length.

Operational rule:

- `tools/build-bmd.js` may produce normal translated BMD files for analysis and matching reports.
- Before a BMD is embedded into a PAK for game testing, run the same-length pass.
- Same-length pass behavior:
  - If translated UTF-8 bytes are shorter than the original slot, pad with spaces.
  - If translated UTF-8 bytes are longer than the original slot, truncate at a valid UTF-8 boundary.
  - The output BMD file size must remain exactly equal to the original extracted BMD size.

Known tradeoff:

- Same-length BMD is stable but may truncate Vietnamese text.
- This is acceptable for the current runtime route because game stability has priority.
- Later UX polish should improve source translation length, abbreviations, or per-field wording before the same-length pass.

Current safe PAK route:

```text
npm run build-bmd
npm run build-bmd:samelength
npm run pak:bmd-fonts
npm run pak:bmd-fonts:apply
```

Deployment rule:

- PAK deploy scripts must default to dry-run/build-output behavior.
- Copying into `Game\gamedata.pak` requires an explicit apply script or `--apply`.
- Use `SOD_GAME_ROOT` when set; otherwise use the documented YOSE default game path.
- Refuse to deploy while `StateOfDecay` is running.
- Always backup `gamedata.pak` before replacement.
- Do not remove loose `.bmd` files unless a command explicitly asks for that cleanup.

Font route note:

- Cluster A loose font files fix the external/front-end menu.
- In-game menu and other HUD/GFX surfaces may need PAK-level GFX font-name patching or a matching Cluster B/C embedded-glyph patch.
- Do not mix a new font route with a new text route unless the previous route has already booted successfully.

## 2026-06-13 Update: In-Game Journal/Stats Font Rule

Observed:

- External menu renders Vietnamese accents correctly.
- In-game character/journal screen still shows square boxes for Vietnamese accents.
- Affected surfaces include the survivor page/help panel/name traits and some in-game menu text.

Root cause:

- The affected UI is not covered by Cluster A.
- It uses embedded fonts inside:
  - `libs/ui/class3_journal.gfx`
  - `libs/ui/class3_stats.gfx`
  - plus `class3_pause.gfx` for pause/in-game menu surfaces.
- The PAK-level font-name replacement route (`ZomNotes -> Segoe UI`, `BrainsForSale -> Calibri Light`) is not enough for these surfaces because text fields still rely on embedded glyph tables.

Rule:

- For PAK deployment with fonts, build embedded-glyph clusters first:

```text
npm run patch-cluster-a
npm run patch-cluster-b
npm run patch-cluster-c
npm run pak:bmd-fonts
```

- `pak:bmd-fonts` / `pak:bmd-fonts:apply` must prefer patched GFX files from `output/gamedata/libs/ui` for known UI font clusters.
- Do not rely on font-name replacement alone for `class3_journal.gfx` or `class3_stats.gfx`.

## 2026-06-13 Update: HUD/Survey Device Font Rule

### Observed

- Missions and some journal text can render Vietnamese correctly after BMD + Cluster C patches.
- Other runtime HUD/survey surfaces still show square boxes, especially:
  - tutorial/survivor help panel,
  - small objective/status prompts near the bottom of the screen,
  - some home/status HUD labels.
- Font audit shows these surfaces often do not contain embedded font glyph tables, so the Cluster A/B/C embedded-glyph patch cannot fix every case.

### Root Cause

- Several non-embedded GFX files still reference device font names such as `Decaying Kuntry`.
- Previous PAK font-name patch only changed:
  - `ZomNotes -> Segoe UI`
  - `BrainsForSale -> Calibri Light`
- That left `Decaying Kuntry` active in HUD/survey files, and that font lacks Vietnamese glyph coverage.

### Rule

- For embedded GFX fonts, replace glyph tables with the known-good Arial glyph source.
- For non-embedded/device-font GFX references, use same-length Vietnamese-capable Windows font names to avoid shifting binary offsets.
- Do not replace `Decaying Kuntry` with `Arial` by raw byte patch because `Arial` is shorter and padding may become part of the font name.
- Safe same-length replacement:
  - `Decaying Kuntry` (15 chars) -> `Times New Roman` (15 chars)

### Current Safe Command

```powershell
npm run pak:bmd-fonts
npm run pak:bmd-fonts:apply
```

This rebuilds Cluster A/B/C embedded font patches and applies same-length device-font replacements before building/deploying the PAK.

Expected fixed files inside the generated PAK:

```text
libs/ui/class3_frontend.gfx
libs/ui/class3_journal.gfx
libs/ui/class3_pause.gfx
libs/ui/class3_stats.gfx
libs/ui/entityflashtag.gfx
libs/ui/menus_confirmation.gfx
libs/ui/menus_startmenu.gfx
```

## 2026-06-14 Update: Length-Budgeted AI Translation Rule

### Observed

- Same-length BMD output is stable, but Vietnamese text longer than the original English slot is truncated by the final safe build.
- Truncation is visible in journal/event/item text and loses meaning.

### Rule

- The AI translation step must receive a byte budget for every source string.
- `maxUtf8Bytes` is the UTF-8 byte length of the original English string.
- Gemini must return a Vietnamese translation whose UTF-8 byte length is less than or equal to that budget.
- Shorter translations are allowed because the same-length BMD build can pad with spaces.
- If a normal Vietnamese translation is too long, the prompt allows compact wording, abbreviations, removing filler words, and Vietnamese without diacritics only when needed.
- The translator must not write a result to `cache/translations.json` unless it passes both:
  - placeholder preservation,
  - UTF-8 byte budget.

### Current Safe Command

```powershell
npm run translate:all:fresh
```

This rebuilds the full job queue, ignores existing translated output for queue planning, and refreshes cached translations as each job runs through Gemini.

After translation, keep the same runtime-safe build/deploy path:

```powershell
npm run build-bmd
npm run build-bmd:samelength
npm run pak:bmd-fonts
npm run pak:bmd-fonts:apply
```

### 2026-06-14 Follow-up Diagnosis

Observed after running build/deploy again:

- `build-bmd:samelength` still reported `truncated: 9027`.
- The latest translation session processed only 73 jobs and 581 strings total (`translatedStrings: 94`, `reusedCachedStrings: 487`).
- A true fresh queue currently contains about 975 jobs / 30,594 strings.
- `cache/translations.json` still contains many old translations longer than the English UTF-8 byte budget.

Root cause:

- The dashboard/manual flow used `build-jobs:all` + `translate:resume`, not `translate:all:fresh`.
- That only translated strings still considered missing from `output/`; old long translations stayed in cache/output and were later truncated by the same-length BMD pass.

Fix:

- Dashboard primary queue/translate buttons now point to:
  - `build-jobs:all:fresh`
  - `translate:all:fresh`
- `writeOutput()` now refuses to write cached translations unless they pass placeholder and UTF-8 byte-budget checks.

### 2026-06-14 Follow-up: Translation API Logging

Observed:

- Fresh queue was created correctly: `975` jobs.
- The dashboard then ran `translate:resume`, and the user stopped it twice while a batch was still inside Gemini/repair calls.
- Command logs only showed `Cycle ...` and sometimes `Done job ...`, so long API calls looked like "nothing is happening".
- `translation-session.json` stayed `running` after Stop because dashboard used force-kill and the child process could not write `translate-stop`.

Fix:

- Added `translate:resume:fresh` for continuing a fresh queue with `--refresh-cache=true`.
- Dashboard resume button now uses `translate:resume:fresh`.
- `tools/translate.js` now logs:
  - job start,
  - Gemini request start,
  - Gemini HTTP response,
  - parsed/matched key counts,
  - length-repair request/response.
- Dashboard Stop now marks translation session as `paused` when stopping a translate command.


## Phase 2 (BMD Patching) Post-Mortem

- Finding: BMD files contain strings that are used BOTH as UI Display Names AND internal engine tags (e.g. Junk, Baton Cop).
- Finding: Translating these internal tags causes immediate or delayed engine crashes because the logic checks fail.
- Finding: XML extraction is insufficient to filter tags if the tags contain spaces or are stored inside generic <Data> nodes.
- Conclusion: BMD binary patching is highly unstable unless we can strictly isolate UI strings from internal identifiers.
