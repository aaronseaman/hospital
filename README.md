# HOSPITAL FIGHTER

**▶ Play: https://aaronseaman.github.io/hospital/**

An 8-bit fighting game parody where Street Fighter's World Warriors are replaced by overworked hospital staff battling for budget, beds, and the last clean ultrasound probe. Welcome to **St. World Warrior Medical Center** — where every interdepartmental conflict is settled by sanctioned, best-of-three combat in the Grand Rounds Arena.

It's an installable PWA that runs on desktop and iPhone (portrait *and* landscape), works offline, and needs no build step: just static files.

## Features

- **18 playable fighters**, each with 3 special moves, a super, Level 1–3 supers and a **Critical Care** super at low health: Dr. Trauma, Nurse Nightingale, The Surgeon, Anesthesiologist, Pharmacist, Radiologist, Ortho Bro, Pediatrician, Psychiatrist, Administrator, Janitor, Paramedic, Lab Tech, Chaplain, Patient Zero, IT Support, Dietitian and the Chief of Staff (+ 6 "DLC" fighters pending budget approval).
- **12 stages** with day/night shifts and optional hazards: Emergency Dept (runaway gurneys), Operating Room, ICU (falling charts), MRI Suite (the magnet is always on), Pharmacy Queue, Waiting Room (wet floors), Helipad (rotor wash), Parking Garage (cars), Admin Office, Break Room, Cafeteria (Friday Fish Day) and an unlockable Morgue.
- **The full system, renamed for healthcare**: Patient Stability (health), Shift Timer, Adrenaline Meter (3 bars), Chart Gauge (Chart Impact, Hand Hygiene parry, Perfect Hand Hygiene, Sprint, Page Security, Double Shift), Charting Burnout, PPE Up (high/low/overhead blocking), Gurney Toss / Wheelchair Spin throws, Second Opinion throw techs, Malpractice Counters and Overwhelmed (dizzy) states.
- **Modes**: Grand Rounds (story with rivals, choices and two endings per character), Arcade, Versus (vs CPU or local 2P), Training (hitboxes, dummy settings), Extreme Battle (Outbreak, Budget Cuts, Full Code, JCAHO Inspection, Fish Day), plus Orders & Rank progression and an attract-mode demo.
- **Classic 6-button or Modern controls** (auto-combos, one-button supers), keyboard, gamepad and touch.
- Procedural pixel-art sprites, chiptune soundtrack and SFX synthesized live with Web Audio, and an announcer voice (toggleable).
- Online, Residency, the Break Room Hub and the Shift Pass are all... pending prior authorization.

## Controls

| | Classic | Modern |
|---|---|---|
| Move | WASD (or arrows vs CPU) | WASD |
| Attacks | U I O = Inject / Suture / Defib (punches) · J K L = Kick / Wheel / Gurney (kicks) | U I O = L / M / H · J = Special · hold K = Auto-combo |
| Hand Hygiene (parry) | P (or MP+MK) | P / L |
| Chart Impact | ; (or HP+HK) | ; |
| Throw | H (or LP+LK) | H |
| Super | Space, or the motions (↓↘→↓↘→ + P/K, ↓↙←↓↙← for Lv3) | Space |
| Taunt / Pause | T / Esc | T / Esc |

Specials use classic motions with parody names: **Round Rounds** (↓↘→), **Emergency Escalation** (→↓↘), **Insurance Hold** (charge ←, then →). Two buttons = **Double Shift** (EX).

**Gamepad**: X Y RB = punches, A B RT = kicks, LB = parry, LT = impact, L3 = throw, R3 = super.
**Touch**: drag on the left side to move; buttons on the right. Change the layout in Options.
**2P local**: P2 uses arrows + numpad (7 8 9 / 4 5 6) or a second gamepad. Press **F** for fullscreen on desktop.

On iPhone, open the link in Safari, tap **Share → Add to Home Screen**, and launch it from there for full-screen play.

## Development

No dependencies and no build. Serve the folder with any static server:

```sh
npx http-server -p 8123 -c-1 .
# open http://localhost:8123/  (add ?autoplay for CPU-vs-CPU demo)
```

- `src/` holds the game modules (ES modules): `match.js` (rounds, hits, camera, rendering), `fighter.js` (state machine, inputs, move types), `fighters.js` (roster data), `sprites.js` + `poses.js` + `looks.js` (procedural pixel sprites), `stages.js`, `audio.js`, `screens.js` (menus and modes), `input.js` (keyboard, gamepad, touch).
- `tools/` contains dev harnesses: sprite preview, CPU soak test (`sim.html`), move filmstrips (`film.html`) and the icon generator.
- `sw.js` caches the app for offline play. Bump `VERSION` when shipping changes.
- Pages deploys from the `gh-pages` branch, which the workflow in `.github/workflows/pages.yml` keeps in sync with `main`.

---

*Hospital Fighter is a parody. Not affiliated with any game company, hospital, or street. No patients were harmed. Some charts were. Any resemblance to your actual Administrator is purely coincidental.*
