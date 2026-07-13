"""
Run headless with:
  blender -b --factory-startup -P generate_avatar.py -- \
    --base neutral_base_avatar.glb --measurements '{"height_cm":170, ...}' --output out.glb

Uses MPFB's own built-in measure-* shape keys directly (measure-bust-circ-decr /
measure-bust-circ-incr, etc.) rather than custom-invented ones. Each measurement has
TWO separate shape keys - one to shrink below baseline, one to grow above it - not a
single -1..1 key.

CHANGE FROM THE MALE/FEMALE VERSION: this project now uses a single neutral avatar,
not separate male/female base meshes - there's no more gender branching anywhere in
this script. If you want gender back later, reintroduce two BASELINES entries and a
gender arg the same way the old version did.

IMPORTANT - CALIBRATION IS A PLACEHOLDER RIGHT NOW: the baseline/range numbers below
were measured against the OLD male base mesh (Human.001, 172.9cm), not this specific
neutral_base_avatar.glb. They're a reasonable placeholder (the two meshes are likely
similar in scale), but not verified against this exact file. Re-run
server/blender/mpfb_measure_calibration.py against neutral_base_avatar.glb and paste
the real numbers in here once you can - see that script's own instructions.

SHAPE KEY NAMING QUIRK: Key_HeightMin/Max and Key_WeightMin/Max have repeatedly been
exported with a leading "$" (e.g. "$Key_HeightMin") because MPFB's own naming
convention for its internal macro targets starts with "$", and Blender's "New Shape
from Mix" bake picked that up. Rather than rely on manually renaming this in Blender
every time a new avatar is exported (which has already been missed more than once),
find_shape_key() below checks for both the plain and "$"-prefixed name automatically.
"""

import bpy
import sys
import json

# ---- Calibration data - see the PLACEHOLDER warning above ----
BASELINE_HEIGHT_CM = 172.9
HEIGHT_KEY_CALIB = {'baseline_cm': 172.9, 'min_cm': 136.3, 'max_cm': 245.2}
MEASURES = {
    'measure-bust-circ':        {'baseline': 115.8, 'neg_range': 3.6, 'pos_range': 6.7},
    'measure-underbust-circ':   {'baseline': 76.9,  'neg_range': 4.2, 'pos_range': 12.7},
    'measure-waist-circ':       {'baseline': 74.0,  'neg_range': 8.5, 'pos_range': 8.7},
    'measure-hips-circ':        {'baseline': 85.0,  'neg_range': 8.3, 'pos_range': 16.7},
    'measure-neck-circ':        {'baseline': 45.9,  'neg_range': 3.8, 'pos_range': 3.9},
    'measure-shoulder-dist':    {'baseline': 45.0,  'neg_range': 2.7, 'pos_range': 5.0},
    'measure-napetowaist-dist': {'baseline': 38.0,  'neg_range': 1.0, 'pos_range': 1.7},
    'measure-waisttohip-dist':  {'baseline': 12.1,  'neg_range': 0.3, 'pos_range': 0.5},
    'measure-neck-height':      {'baseline': 10.4,  'neg_range': 0.2, 'pos_range': 0.2},
    'measure-thigh-circ':       {'baseline': 48.8,  'neg_range': 7.4, 'pos_range': 6.6},
    'measure-calf-circ':        {'baseline': 15.0,  'neg_range': 2.7, 'pos_range': 2.7},
    'measure-knee-circ':        {'baseline': 35.3,  'neg_range': 3.6, 'pos_range': 6.2},
    'measure-upperleg-height':  {'baseline': 42.4,  'neg_range': 1.8, 'pos_range': 2.5},
    'measure-lowerleg-height':  {'baseline': 40.6,  'neg_range': 1.4, 'pos_range': 1.9},
}

# Weight isn't directly measurable from mesh geometry (a shape key moves vertices, not
# mass) - so unlike height, this is a DESIGN CHOICE, not something read off the mesh.
# Anchored to real BMI rather than raw kg, since BMI is already height-normalized.
WEIGHT_BMI_ANCHORS = {'baseline_bmi': 22.0, 'min_bmi': 17.0, 'max_bmi': 32.0}

# Maps our scan's field names (see server/src/services/measurements.js) to MPFB's
# measure-* base names. 13 of the 14 calibrated measurements now come from the scan -
# only neck-height is left at baseline (no reliable chin/jaw landmark available).
SCAN_FIELD_TO_MEASURE_KEY = {
    'chest_cm': 'measure-bust-circ',
    'waist_cm': 'measure-waist-circ',
    'hip_cm': 'measure-hips-circ',
    'shoulder_cm': 'measure-shoulder-dist',
    # everything below comes from measurements.avatarOnly, not top-level fields
    'neck_cm': 'measure-neck-circ',
    'underbust_cm': 'measure-underbust-circ',
    'napetowaist_cm': 'measure-napetowaist-dist',
    'waisttohip_cm': 'measure-waisttohip-dist',
    'thigh_cm': 'measure-thigh-circ',
    'calf_cm': 'measure-calf-circ',
    'knee_cm': 'measure-knee-circ',
    'upperleg_height_cm': 'measure-upperleg-height',
    'lowerleg_height_cm': 'measure-lowerleg-height',
}


def parse_args():
    argv = sys.argv
    if '--' not in argv:
        raise SystemExit('Expected " -- --base <path> --measurements <json> --output <path>" after blender args')
    argv = argv[argv.index('--') + 1:]

    base_path = measurements_json = output_path = None
    i = 0
    while i < len(argv):
        if argv[i] == '--base':
            base_path = argv[i + 1]; i += 2
        elif argv[i] == '--measurements':
            measurements_json = argv[i + 1]; i += 2
        elif argv[i] == '--output':
            output_path = argv[i + 1]; i += 2
        else:
            i += 1

    if not base_path or not measurements_json or not output_path:
        raise SystemExit('Missing --base, --measurements or --output argument')
    return base_path, json.loads(measurements_json), output_path


def find_avatar_mesh():
    """Looks up the body mesh generically (rather than by a hardcoded object name),
    since different exports have named their node differently in the past."""
    for obj in bpy.data.objects:
        if obj.type == 'MESH' and obj.data.shape_keys is not None:
            key_names = {k.name for k in obj.data.shape_keys.key_blocks}
            if 'measure-bust-circ-incr' in key_names:
                return obj
    return None


def find_shape_key(key_blocks, name):
    """Looks up a shape key by name, tolerating a leading "$" - Key_HeightMin/Max and
    Key_WeightMin/Max have repeatedly been exported as "$Key_HeightMin" etc. because
    MPFB's own internal macro naming convention starts with "$", and Blender's "New
    Shape from Mix" picked that up. Checks the plain name first, then the $-prefixed
    variant, so a fresh export doesn't silently break this if it happens again."""
    if name in key_blocks:
        return key_blocks[name]
    dollar_name = f'${name}'
    if dollar_name in key_blocks:
        return key_blocks[dollar_name]
    return None


def set_macro_key(mesh_obj, min_key_name, max_key_name, target, baseline, min_val, max_val):
    """Generic version of set_measurement() for the Key_HeightMin/Max and
    Key_WeightMin/Max pairs, which use baseline/min/max anchor points instead of a
    baseline + separate +/- range (min_val and max_val are absolute values at each
    extreme, not deltas)."""
    key_blocks = mesh_obj.data.shape_keys.key_blocks
    min_key = find_shape_key(key_blocks, min_key_name)
    max_key = find_shape_key(key_blocks, max_key_name)
    if min_key is None or max_key is None:
        print(f'[generate_avatar] WARNING: {min_key_name}/{max_key_name} not found on mesh (checked with '
              f'and without a leading "$"), skipping')
        return

    if target <= baseline:
        span = baseline - min_val
        value = (baseline - target) / span if span else 0
        min_key.value = max(0.0, min(1.0, value))
        max_key.value = 0.0
    else:
        span = max_val - baseline
        value = (target - baseline) / span if span else 0
        max_key.value = max(0.0, min(1.0, value))
        min_key.value = 0.0


def set_measurement(mesh_obj, base_name, target_cm, calibration):
    """Sets the correct one of the -decr/-incr key pair (and zeroes the other) based on
    whether target_cm is below or above this measurement's calibrated baseline."""
    key_blocks = mesh_obj.data.shape_keys.key_blocks
    decr_key = find_shape_key(key_blocks, f'{base_name}-decr')
    incr_key = find_shape_key(key_blocks, f'{base_name}-incr')
    if decr_key is None or incr_key is None:
        print(f'[generate_avatar] WARNING: {base_name}-decr/-incr not found on mesh, skipping')
        return

    baseline = calibration['baseline']
    delta = target_cm - baseline

    if delta >= 0:
        value = delta / calibration['pos_range'] if calibration['pos_range'] else 0
        incr_key.value = max(0.0, min(1.0, value))
        decr_key.value = 0.0
    else:
        value = -delta / calibration['neg_range'] if calibration['neg_range'] else 0
        decr_key.value = max(0.0, min(1.0, value))
        incr_key.value = 0.0


def main():
    base_path, measurements, output_path = parse_args()

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=base_path)

    mesh_obj = find_avatar_mesh()
    if mesh_obj is None:
        raise SystemExit(f'Could not find a mesh with "measure-bust-circ-incr" in {base_path}')

    avatar_only = measurements.get('avatarOnly', {}) or {}
    scan_values = {
        'chest_cm': measurements.get('chest_cm'),
        'waist_cm': measurements.get('waist_cm'),
        'hip_cm': measurements.get('hip_cm'),
        'shoulder_cm': measurements.get('shoulder_cm'),
        'neck_cm': avatar_only.get('neck_cm'),
        'underbust_cm': avatar_only.get('underbust_cm'),
        'napetowaist_cm': avatar_only.get('napetowaist_cm'),
        'waisttohip_cm': avatar_only.get('waisttohip_cm'),
        'thigh_cm': avatar_only.get('thigh_cm'),
        'calf_cm': avatar_only.get('calf_cm'),
        'knee_cm': avatar_only.get('knee_cm'),
        'upperleg_height_cm': avatar_only.get('upperleg_height_cm'),
        'lowerleg_height_cm': avatar_only.get('lowerleg_height_cm'),
    }

    # Apply every measurement the scan actually supplied (13 of 14 - see module docstring).
    for scan_field, measure_key in SCAN_FIELD_TO_MEASURE_KEY.items():
        target_cm = scan_values.get(scan_field)
        if target_cm is None:
            continue  # scan didn't provide this one - leave the shape key at its default
        set_measurement(mesh_obj, measure_key, target_cm, MEASURES[measure_key])

    # neck-height is the one calibrated measurement with no scan estimate (needs a
    # chin/jaw landmark MediaPipe's body Pose model doesn't have) - its -decr/-incr
    # keys are intentionally left at 0 (this mesh's baseline).

    # Height - driven by the real sculpted Key_HeightMin/Key_HeightMax shape keys
    # (calibrated against actual measured cm at each extreme) instead of a uniform
    # mesh.scale stretch.
    height_cm = measurements.get('height_cm', BASELINE_HEIGHT_CM)
    set_macro_key(
        mesh_obj, 'Key_HeightMin', 'Key_HeightMax',
        target=height_cm,
        baseline=HEIGHT_KEY_CALIB['baseline_cm'],
        min_val=HEIGHT_KEY_CALIB['min_cm'],
        max_val=HEIGHT_KEY_CALIB['max_cm'],
    )

    # Weight - driven by real BMI (computed in measurements.js as avatarOnly.bmi), not
    # raw kg, since BMI is already height-normalized. See WEIGHT_BMI_ANCHORS above for
    # why 17/22/32 were chosen - adjust those three numbers directly if a different
    # slim/heavy range is wanted, no other code changes needed.
    bmi = avatar_only.get('bmi')
    if bmi is not None:
        set_macro_key(
            mesh_obj, 'Key_WeightMin', 'Key_WeightMax',
            target=bmi,
            baseline=WEIGHT_BMI_ANCHORS['baseline_bmi'],
            min_val=WEIGHT_BMI_ANCHORS['min_bmi'],
            max_val=WEIGHT_BMI_ANCHORS['max_bmi'],
        )

    bpy.context.view_layer.update()

    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        use_selection=False,
        export_apply=True,
    )
    print(f'[generate_avatar] wrote {output_path}')


if __name__ == '__main__':
    main()
