# Avatar generation (Blender)

`generate_avatar.py` imports `neutral_base_avatar.glb`, dials in its shape keys based
on the user's measurements, and exports a new `.glb`. There is a single neutral avatar
now, not separate male/female base meshes - no gender branching happens anywhere in
this script.

## Your base asset

`neutral_base_avatar.glb` contains one mesh with MPFB's own `measure-*` morph targets
(glTF's version of Blender shape keys), each as a **pair**, not a single -1..1 key:

```
measure-bust-circ-decr / measure-bust-circ-incr
measure-underbust-circ-decr / -incr
measure-waist-circ-decr / -incr
measure-hips-circ-decr / -incr
measure-neck-circ-decr / -incr
measure-neck-height-decr / -incr
measure-shoulder-dist-decr / -incr
measure-napetowaist-dist-decr / -incr
measure-waisttohip-dist-decr / -incr
measure-thigh-circ-decr / -incr
measure-calf-circ-decr / -incr
measure-knee-circ-decr / -incr
measure-upperleg-height-decr / -incr
measure-lowerleg-height-decr / -incr
```

Plus two custom-baked macro pairs (made via Blender's "New Shape from Mix", not MPFB's
own internal macros - those turned out unreliable to calibrate, see project history):

```
Key_HeightMin / Key_HeightMax
Key_WeightMin / Key_WeightMax
```

No armature/skin is present - height is driven entirely by the `Key_Height*` shape
keys deforming the mesh, not by scaling an armature or the object transform.

### The `$` naming quirk

`Key_HeightMin/Max` and `Key_WeightMin/Max` have repeatedly been exported with a
leading `$` (e.g. `$Key_HeightMin`), because MPFB's own internal macro naming
convention starts with `$`, and Blender's "New Shape from Mix" bake picked that up.
`find_shape_key()` in `generate_avatar.py` checks for both the plain and `$`-prefixed
name automatically, so this shouldn't need manual fixing in Blender anymore - if you
re-export a new base avatar and it still isn't working, run this quick check:

```python
# In Blender's Scripting tab, with the mesh selected:
import bpy
obj = bpy.context.active_object
for k in obj.data.shape_keys.key_blocks:
    if 'eight' in k.name.lower() or 'Key' in k.name:
        print(repr(k.name))
```

## Calibration status

`MEASURES` and `HEIGHT_KEY_CALIB` in `generate_avatar.py` currently hold values
**measured against an earlier male-only base mesh (172.9cm baseline)**, not this
specific `neutral_base_avatar.glb`. They're a reasonable placeholder (the meshes are
likely similar in scale), but haven't been re-verified against this exact file.

To get real numbers for this file, run `mpfb_measure_calibration.py` in Blender's
Scripting tab with `neutral_base_avatar.glb`'s mesh selected - it automatically sets
each `-decr`/`-incr` key to 1.0, measures the real resulting cm value, and prints a
table of baseline/range numbers ready to paste into `MEASURES`. See that script's own
docstring for exact steps.

## Environment variables (server/.env - already updated)

```
BLENDER_PATH=blender
NEUTRAL_BASE_AVATAR=./blender/neutral_base_avatar.glb
BLENDER_TIMEOUT_MS=60000
```

## Testing the script standalone (without the Node server)

```bash
blender -b --factory-startup -P blender/generate_avatar.py -- \
  --base blender/neutral_base_avatar.glb \
  --measurements '{"chest_cm":98,"waist_cm":82,"hip_cm":100,"shoulder_cm":46,"height_cm":178,"avatarOnly":{"neck_cm":38,"bmi":22}}' \
  --output /tmp/test_avatar.glb
```

Check the console output ends with `[generate_avatar] wrote ...` and no WARNING lines
about missing shape keys. Then open the resulting `.glb` in a viewer (e.g.
https://gltf-viewer.donmccurdy.com/) to sanity-check it looks like a scaled/deformed
version of the base model, not distorted or inside-out.

## Performance note

Launching Blender per request is slow (several seconds of startup + import + export).
Fine for a student project / first phase. If this needs to scale later, keep a pool of
persistent Blender instances behind a small Python RPC service instead of spawning a
fresh process per request.

## Troubleshooting

- **"Could not find a mesh with measure-bust-circ-incr"**: the `--base` path is wrong,
  or the glb doesn't have that morph target - re-check the file wasn't re-exported
  without shape keys.
- **WARNING about a missing shape key**: generation still succeeds, that one
  dimension is just left at the mesh's default.
- **Height/weight not changing anything**: almost always the `$` naming quirk above -
  run the quick check script to confirm the actual key names on this specific mesh.
- **Avatar looks correct but not "sized right"**: this is the calibration-status caveat
  above - the direction is right, the magnitude needs re-verifying against this file.
- **Blender exits non-zero**: run the standalone command above directly in a terminal
  and read Blender's own stderr - it's almost always more informative than the Node
  wrapper's error message.
