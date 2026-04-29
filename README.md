# VibeRacer

A browser-based 3D arcade racer where every URL is its own track. Build a loop from toy-like snap pieces, share the link, and let friends race to beat your lap time.

## Docs

- [Game Design Document](docs/GDD.md): the full design spec. Start here.
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md): the continuous slice loop and definition of done.
- [Working Agreement](docs/WORKING_AGREEMENT.md): branch, PR, verification, review, merge, and deploy rules.
- [Progress Log](docs/PROGRESS_LOG.md): newest-first continuity notes for each completed slice.
- [Open Questions](docs/OPEN_QUESTIONS.md): decision queue for ambiguous or blocked work.
- [Followups](docs/FOLLOWUPS.md): backlog spillover that should not expand the current slice.
- [GDD Coverage](docs/GDD_COVERAGE.json): ledger mapping product scope to implementation evidence and gaps.

More docs will land in [`docs/`](docs/) as the game comes together (setup, physics tuning, deployment, API reference).

## Fork it, reimplement it, vibe your own

This repo is meant as a ghost library: a spec anyone can reimplement in their own stack. Fork it, ask your agent of choice (Claude, Codex, whoever) to update [`docs/GDD.md`](docs/GDD.md) to swap Three.js for something else, and vibe a second implementation.

A few 3D stacks worth trying:

- [Babylon.js](https://www.babylonjs.com/): big, batteries-included engine with a built-in physics pick and an excellent editor.
- [PlayCanvas](https://playcanvas.com/): engine plus hosted editor, solid mobile performance, commercial-friendly.
- [Wonderland Engine](https://wonderlandengine.com/): WebXR-first, very fast, ECS under the hood.
- [luma.gl](https://luma.gl/): lower-level, more GPU-native API if you want to write your own renderer on top of WebGPU.

Keep the game design pillars and the URL-as-track model from the GDD. Swap the rendering, physics, audio, or framework freely. Share your fork.

## Contributing

Any agent or human touching this repo should read [`AGENTS.md`](AGENTS.md) first. It has hard rules (starting with: no em-dashes, ever) and stack constraints.
