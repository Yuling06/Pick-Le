"""
FULLY AUTOMATED CALIBRATION v4 - run this INSIDE Blender's Scripting tab, against ONE
MPFB character at a time (male, then female separately). This is NOT part of the
production app (server/blender/generate_avatar.py) - it's a one-time tool that reads
real cm measurements directly off your mesh for 17 measure-* shape keys.

CHANGE FROM v3: heavily optimized. The previous version re-extracted the entire mesh
from scratch (a "depsgraph evaluation") separately for almost every single measurement
and every joint lookup - dozens of redundant full-mesh extractions, which likely froze
your machine on a dense mesh. This version does exactly ONE mesh extraction per shape
key state (baseline once, then one per decr/incr toggle = 35 total instead of ~80+),
and computes every measurement from that single extraction before moving on.

HOW TO USE
----------
1. Open your MPFB character's .blend file (with clothes/hair already removed).
2. Click on the body mesh so it's the active object.
3. Scripting tab -> paste this into the Text Editor (big panel, not the ">>>" Console)
   -> Run (play triangle) or Alt+P.
4. Open the System Console for output (Window -> Toggle System Console on Windows;
   on Mac/Linux, launch Blender from a terminal instead).
5. Repeat for the other gender's character.

Does not save the file - shape key values are reset back to their originals when done.

If this STILL hangs for more than ~30 seconds on a single step, your mesh is likely
very dense (many tens of thousands of vertices) or has heavy modifiers still applied -
tell me and we can reduce this further (e.g. skip the 'body' filtering pass, or sample
every Nth vertex instead of all of them).
"""

import bpy
import math
import time
from mathutils import Vector

# ============ CONFIG ============
MESH_NAME = None
BODY_GROUP_NAME = 'body'
ARM_SIDE_PREFIX = 'l'

HEIGHT_FRACTIONS = {
    'neck_top': 0.90, 'neck_base': 0.87, 'shoulder': 0.82,
    'bust': 0.72, 'underbust': 0.68, 'waist': 0.60, 'hip': 0.53,
    'knee': 0.285, 'ankle': 0.05,
}
SLICE_TOLERANCE = 0.01
TORSO_X_LIMIT = 0.25
LEG_X_SIDE = 1
LEG_LATERAL_LIMIT = 0.15
ARM_RING_TOL_FRAC = 0.15

MEASURE_CONFIG = {
    'measure-bust-circ':        {'type': 'torso_ring',   'frac': 'bust'},
    'measure-underbust-circ':   {'type': 'torso_ring',   'frac': 'underbust'},
    'measure-waist-circ':       {'type': 'torso_ring',   'frac': 'waist'},
    'measure-hips-circ':        {'type': 'torso_ring',   'frac': 'hip'},
    'measure-neck-circ':        {'type': 'torso_ring',   'frac': 'neck_base'},
    'measure-shoulder-dist':    {'type': 'torso_width',  'frac': 'shoulder', 'x_limit': None},
    'measure-napetowaist-dist': {'type': 'torso_length', 'from': 'shoulder', 'to': 'waist'},
    'measure-waisttohip-dist':  {'type': 'torso_length', 'from': 'waist', 'to': 'hip'},
    'measure-neck-height':      {'type': 'torso_length', 'from': 'neck_top', 'to': 'neck_base'},
    'measure-thigh-circ':       {'type': 'leg_ring',   'frac_between': ('hip', 'knee'), 'at': 0.5},
    'measure-calf-circ':        {'type': 'leg_ring',   'frac_between': ('knee', 'ankle'), 'at': 0.5},
    'measure-knee-circ':        {'type': 'leg_ring',   'frac_between': ('knee', 'knee'), 'at': 0.5},
    'measure-upperleg-height':  {'type': 'leg_length', 'from': 'hip', 'to': 'knee'},
    'measure-lowerleg-height':  {'type': 'leg_length', 'from': 'knee', 'to': 'ankle'},
    'measure-upperarm-circ':    {'type': 'arm_ring',   'segment': 'upper'},
    'measure-upperarm-length':  {'type': 'arm_length', 'segment': 'upper'},
    'measure-lowerarm-length':  {'type': 'arm_length', 'segment': 'lower'},
}
# ==================================


def get_mesh_obj():
    if MESH_NAME:
        return bpy.data.objects[MESH_NAME]
    obj = bpy.context.active_object
    if obj and obj.type == 'MESH':
        return obj
    for o in bpy.context.selected_objects:
        if o.type == 'MESH':
            return o
    raise RuntimeError('No mesh selected - click on the body mesh in the viewport first')


def build_group_index_cache(mesh_obj, group_names):
    """ONE pass over all vertices (using the base mesh, not evaluated) to find which
    vertex indices belong to each requested group. Done once, reused for every state."""
    vg_index_to_name = {}
    for name in group_names:
        vg = mesh_obj.vertex_groups.get(name)
        if vg:
            vg_index_to_name[vg.index] = name
    result = {name: [] for name in group_names if any(n == name for n in vg_index_to_name.values())}
    for v in mesh_obj.data.vertices:
        for g in v.groups:
            name = vg_index_to_name.get(g.group)
            if name and g.weight > 0.1:
                result.setdefault(name, []).append(v.index)
    return result


def get_evaluated_world_coords(mesh_obj):
    """The ONLY place a full mesh extraction happens - one call per shape-key state."""
    depsgraph = bpy.context.evaluated_depsgraph_get()
    eval_obj = mesh_obj.evaluated_get(depsgraph)
    mesh = eval_obj.to_mesh()
    mat = mesh_obj.matrix_world
    coords = [mat @ v.co for v in mesh.vertices]
    eval_obj.to_mesh_clear()
    return coords


def ellipse_circumference(a, b):
    if a <= 0 or b <= 0:
        return 0
    h = ((a - b) ** 2) / ((a + b) ** 2)
    return math.pi * (a + b) * (1 + (3 * h) / (10 + math.sqrt(4 - 3 * h)))


def measure_ring_at_z(coords, z_target, tol, x_limit=None, x_side=None, lateral_limit=None):
    band = [c for c in coords if abs(c.z - z_target) <= tol]
    if x_limit is not None:
        band = [c for c in band if abs(c.x) <= x_limit]
    if x_side is not None:
        center_x = x_side * (lateral_limit or 0.1) * 1.2
        band = [c for c in band if (c.x * x_side) > 0 and abs(c.x - center_x) <= (lateral_limit or 0.15)]
    if not band:
        return None
    xs = [c.x for c in band]
    ys = [c.y for c in band]
    return ellipse_circumference((max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2) * 100


def measure_width_at_z(coords, z_target, tol, x_limit=None):
    band = [c for c in coords if abs(c.z - z_target) <= tol]
    if x_limit is not None:
        band = [c for c in band if abs(c.x) <= x_limit]
    if not band:
        return None
    xs = [c.x for c in band]
    return (max(xs) - min(xs)) * 100


def measure_ring_along_points(coords, p1, p2, tol_frac=ARM_RING_TOL_FRAC):
    mid = (p1 + p2) / 2
    direction = p2 - p1
    length = direction.length
    if length == 0:
        return None
    axis = max(range(3), key=lambda i: abs(direction[i]))
    tol = length * tol_frac
    band = [c for c in coords if abs(c[axis] - mid[axis]) <= tol]
    if not band:
        return None
    other_axes = [i for i in range(3) if i != axis]
    a_vals = [c[other_axes[0]] for c in band]
    b_vals = [c[other_axes[1]] for c in band]
    return ellipse_circumference((max(a_vals) - min(a_vals)) / 2, (max(b_vals) - min(b_vals)) / 2) * 100


def group_center(coords_all, indices):
    if not indices:
        return None
    pts = [coords_all[i] for i in indices if i < len(coords_all)]
    if not pts:
        return None
    center = Vector((0.0, 0.0, 0.0))
    for p in pts:
        center += p
    return center / len(pts)


def measure_all_from_state(coords_all, body_coords, group_cache):
    """Given ONE evaluated mesh state, compute every one of the 17 measurements."""
    zs = [c.z for c in body_coords]
    height = max(zs) - min(zs)
    base_z = min(zs)
    z_at = {name: base_z + height * frac for name, frac in HEIGHT_FRACTIONS.items()}

    # Recenter x/y relative to THIS body's own bounding-box center, rather than assuming
    # the object sits at world x=0/y=0 - important if multiple characters share a scene
    # (e.g. male and female placed side by side) since only one may actually be centered.
    xs_all = [c.x for c in body_coords]
    ys_all = [c.y for c in body_coords]
    center_x = (max(xs_all) + min(xs_all)) / 2
    center_y = (max(ys_all) + min(ys_all)) / 2
    body_coords = [Vector((c.x - center_x, c.y - center_y, c.z)) for c in body_coords]
    coords_all = [Vector((c.x - center_x, c.y - center_y, c.z)) for c in coords_all]

    shoulder = group_center(coords_all, group_cache.get(f'joint-{ARM_SIDE_PREFIX}-shoulder', []))
    elbow = group_center(coords_all, group_cache.get(f'joint-{ARM_SIDE_PREFIX}-elbow', []))
    hand = group_center(coords_all, group_cache.get(f'joint-{ARM_SIDE_PREFIX}-hand', []))

    results = {'_height_cm': height * 100}
    for name, cfg in MEASURE_CONFIG.items():
        t = cfg['type']
        if t == 'torso_ring':
            results[name] = measure_ring_at_z(body_coords, z_at[cfg['frac']], SLICE_TOLERANCE, TORSO_X_LIMIT)
        elif t == 'torso_width':
            results[name] = measure_width_at_z(body_coords, z_at[cfg['frac']], SLICE_TOLERANCE, cfg['x_limit'])
        elif t == 'torso_length':
            results[name] = (z_at[cfg['from']] - z_at[cfg['to']]) * 100
        elif t == 'leg_ring':
            f1, f2 = cfg['frac_between']
            z_mid = z_at[f1] + (z_at[f2] - z_at[f1]) * cfg['at']
            results[name] = measure_ring_at_z(body_coords, z_mid, SLICE_TOLERANCE,
                                               x_side=LEG_X_SIDE, lateral_limit=LEG_LATERAL_LIMIT)
        elif t == 'leg_length':
            results[name] = abs(z_at[cfg['from']] - z_at[cfg['to']]) * 100
        elif t == 'arm_ring':
            if shoulder is None or elbow is None or hand is None:
                results[name] = None
            elif cfg['segment'] == 'upper':
                results[name] = measure_ring_along_points(body_coords, shoulder, elbow)
            else:
                results[name] = measure_ring_along_points(body_coords, elbow, hand)
        elif t == 'arm_length':
            if shoulder is None or elbow is None or hand is None:
                results[name] = None
            elif cfg['segment'] == 'upper':
                results[name] = (elbow - shoulder).length * 100
            else:
                results[name] = (hand - elbow).length * 100
    return results


def snapshot(mesh_obj, group_cache, body_idx):
    coords_all = get_evaluated_world_coords(mesh_obj)
    body_coords = [coords_all[i] for i in body_idx if i < len(coords_all)] if body_idx else coords_all
    return measure_all_from_state(coords_all, body_coords, group_cache)


def run():
    t_start = time.time()
    mesh_obj = get_mesh_obj()
    key_blocks = mesh_obj.data.shape_keys.key_blocks if mesh_obj.data.shape_keys else None
    if not key_blocks:
        raise RuntimeError(f'{mesh_obj.name} has no shape keys at all')

    needed_groups = [BODY_GROUP_NAME, f'joint-{ARM_SIDE_PREFIX}-shoulder',
                      f'joint-{ARM_SIDE_PREFIX}-elbow', f'joint-{ARM_SIDE_PREFIX}-hand']
    group_cache = build_group_index_cache(mesh_obj, needed_groups)
    body_idx = group_cache.get(BODY_GROUP_NAME)
    if not body_idx:
        print(f"WARNING: no '{BODY_GROUP_NAME}' vertex group found - using all vertices.")

    print(f"\n{'=' * 70}\nCALIBRATING '{mesh_obj.name}'\n{'=' * 70}")

    baseline = snapshot(mesh_obj, group_cache, body_idx)
    print(f"Baseline total height: {baseline['_height_cm']:.1f} cm "
          f"<- sanity check against this character's real intended height")
    print(f"\n{'name':28s} {'baseline':>9s} {'at decr=1':>10s} {'at incr=1':>10s} "
          f"{'-range':>8s} {'+range':>8s}")

    for base_name in MEASURE_CONFIG:
        decr_key = key_blocks.get(f'{base_name}-decr')
        incr_key = key_blocks.get(f'{base_name}-incr')
        if decr_key is None or incr_key is None:
            missing = [n for n, k in [(f'{base_name}-decr', decr_key), (f'{base_name}-incr', incr_key)] if k is None]
            print(f"{base_name:28s}  ** missing key(s): {', '.join(missing)} **")
            continue

        orig_decr, orig_incr = decr_key.value, incr_key.value
        decr_key.value, incr_key.value = 0, 0

        decr_key.value = 1
        at_decr = snapshot(mesh_obj, group_cache, body_idx).get(base_name)
        decr_key.value = 0

        incr_key.value = 1
        at_incr = snapshot(mesh_obj, group_cache, body_idx).get(base_name)
        incr_key.value = 0

        decr_key.value, incr_key.value = orig_decr, orig_incr

        base_val = baseline.get(base_name)
        if base_val is None or at_decr is None or at_incr is None:
            print(f"{base_name:28s}  ** measurement failed (check assumptions for this body part) **")
            continue

        print(f"{base_name:28s} {base_val:9.1f} {at_decr:10.1f} {at_incr:10.1f} "
              f"{base_val - at_decr:8.1f} {at_incr - base_val:8.1f}")

    print(f"\nDone in {time.time() - t_start:.1f}s. '-range'/'+range' are your "
          f"SHAPE_KEY_RANGE_CM values for generate_avatar.py.")


run()
