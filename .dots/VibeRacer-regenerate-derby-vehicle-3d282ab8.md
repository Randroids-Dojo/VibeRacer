---
title: Regenerate derby vehicle GLBs after trunk_frac shrink
status: open
priority: 3
issue-type: task
created-at: "2026-05-16T01:20:00.000000-05:00"
---

tools/blender/slice_kenney_vehicle.py was retuned so the trunk piece is a trunk-lid-sized cap instead of the rear quarter of the body (sedan 0.24 to 0.12, ambulance 0.18 to 0.10, truck 0.20 to 0.08, race 0.26 to 0.13). The GLBs under public/models/derby/ still ship the old big-trunk slices because the regen requires Blender locally and the agent sandbox does not have it.

Next time you are on a machine with Blender, re-run the slicer for all four variants and commit the regenerated GLBs:

```
blender --background --python tools/blender/slice_kenney_vehicle.py -- \
    --source /path/to/kenney-car-kit/Models/GLB\ format/sedan.glb \
    --variant sedan --out public/models/derby/car.glb

blender --background --python tools/blender/slice_kenney_vehicle.py -- \
    --source /path/to/kenney-car-kit/Models/GLB\ format/ambulance.glb \
    --variant ambulance --out public/models/derby/schoolBus.glb

blender --background --python tools/blender/slice_kenney_vehicle.py -- \
    --source /path/to/kenney-car-kit/Models/GLB\ format/truck.glb \
    --variant truck --out public/models/derby/bigTruck.glb

blender --background --python tools/blender/slice_kenney_vehicle.py -- \
    --source /path/to/kenney-car-kit/Models/GLB\ format/race.glb \
    --variant race --out public/models/derby/racecar.glb
```

After the regen, verify in the derby round that a rear-on hit pops a small trunk lid rather than the whole rear section. The runtime visualizer already expects the smaller pieces (src/game/derbyDamageVisuals.ts pickPanelByHitDirection routes a rear hit to trunk).
