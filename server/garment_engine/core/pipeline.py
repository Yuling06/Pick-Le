"""
===============================================================================
Phase 4 + Phase 5 - Garment Engine Pipeline
File: garment_engine/core/pipeline.py
===============================================================================

Purpose
-------
Chains the existing garment_engine stages into one callable pipeline:

    Phase 4: GarmentFitter.fit()              (deformation to measurements)
    Phase 5: GarmentRegistration.register()    (position on avatar)
    Phase 5: CollisionCorrector.correct()      (resolve intersections)
    Phase 5: Exporter.export_glb()             (write result)

Intended to be run headless:

    blender --background --python garment_engine/core/pipeline.py -- \\
        --avatar_glb <path> \\
        --garment_blend <path> \\
        --garment_name <name> \\
        --measurements <path to measurements json> \\
        --output <path to output .glb>

This file does not decide *what* the target measurements are —
that comes from Gemini upstream and is passed in as a JSON file.
===============================================================================
"""

import os
import sys

# Ensure garment_engine/ (the parent of this file's `core/` folder) is on
# sys.path, since Blender's --python invocation doesn't add it automatically
# the way running `python pipeline.py` from the right cwd normally would.
GARMENT_ENGINE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if GARMENT_ENGINE_ROOT not in sys.path:
    sys.path.insert(0, GARMENT_ENGINE_ROOT)

import bpy
import json
import argparse

from core.garment_fitter import GarmentFitter
from core.garment_registration import GarmentRegistration
from core.collision_corrector import CollisionCorrector
from core.exporter import Exporter
from models.measurement import Measurement


# =============================================================================
# Argument Parsing
# =============================================================================

def parse_args():

    if "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser()

    parser.add_argument("--avatar_glb", required=True)
    parser.add_argument("--garment_blend", required=True)
    parser.add_argument("--garment_name", required=True)
    parser.add_argument("--measurements", required=True)
    parser.add_argument("--output", required=True)

    return parser.parse_args(argv)


# =============================================================================
# Measurement Loading
# =============================================================================

def load_measurements(measurements_path):
    """
    Expects a JSON file shaped like:

    {
        "measurements": [
            {"name": "Bust", "vertex_group": "VG_Bust", "reference": 106, "target": 114},
            {"name": "Length", "vertex_group": "VG_Length", "reference": 71, "target": 75},
            ...
        ]
    }
    """

    with open(measurements_path, "r") as file:
        data = json.load(file)

    measurements = []

    for entry in data["measurements"]:

        measurements.append(
            Measurement(
                name=entry["name"],
                vertex_group=entry["vertex_group"],
                reference=entry["reference"],
                target=entry["target"]
            )
        )

    return measurements


# =============================================================================
# Scene Loading
# =============================================================================

def load_scene(avatar_glb, garment_blend, garment_name):
    """
    Loads the avatar from a .glb (glTF import) and appends the
    garment mesh + its landmark empties (LM_*) from a .blend
    into the same scene.

    The avatar object is auto-detected rather than matched by name,
    since each user's avatar .glb is generated independently and
    its internal object name isn't guaranteed to be identical
    across every user/session.

    Landmark empties (LM_Neck, LM_LeftShoulder, LM_RightShoulder,
    LM_LeftCuff, LM_RightCuff, LM_Bust, LM_Length, LM_LeftSleeve,
    LM_RightSleeve, etc.) must be explicitly loaded alongside the
    garment mesh — bpy.data.libraries.load only loads objects that
    are explicitly listed in data_to.objects, so they would
    otherwise never be brought into bpy.data at all.
    """

    bpy.ops.wm.read_factory_settings(use_empty=True)

    bpy.ops.import_scene.gltf(filepath=avatar_glb)

    mesh_objects = [
        obj for obj in bpy.context.scene.objects
        if obj.type == 'MESH'
    ]

    if len(mesh_objects) == 0:

        raise RuntimeError(
            f"No mesh object found after importing avatar: {avatar_glb}"
        )

    if len(mesh_objects) > 1:

        names = ", ".join(obj.name for obj in mesh_objects)

        raise RuntimeError(
            f"Expected exactly one avatar mesh after importing "
            f"{avatar_glb}, found {len(mesh_objects)}: {names}. "
            f"Check whether the avatar export included extra objects."
        )

    avatar = mesh_objects[0]

    # ------------------------------------------------------------------
    # Load the garment mesh AND all its landmark empties (LM_*) from
    # the same .blend file.
    # ------------------------------------------------------------------

    with bpy.data.libraries.load(garment_blend, link=False) as (data_from, data_to):

        if garment_name not in data_from.objects:
            raise RuntimeError(f"Garment object '{garment_name}' not found in {garment_blend}")

        objects_to_load = [garment_name] + [
            name for name in data_from.objects
            if name.startswith("LM_")
        ]

        data_to.objects = objects_to_load

    garment = None

    for obj in data_to.objects:

        if obj is not None:

            bpy.context.scene.collection.objects.link(obj)

            if obj.name == garment_name:
                garment = obj

    if garment is None:
        raise RuntimeError(f"Failed to append garment '{garment_name}' from {garment_blend}")

    return avatar, garment


# =============================================================================
# Pipeline
# =============================================================================

def run_pipeline(
    avatar_glb,
    garment_blend,
    garment_name,
    measurements_path,
    output_path
):

    print()
    print("=" * 70)
    print("GARMENT ENGINE PIPELINE")
    print("=" * 70)

    avatar, garment = load_scene(
        avatar_glb,
        garment_blend,
        garment_name
    )

    measurements = load_measurements(measurements_path)

    # -------------------------------------------------------------------
    # Phase 4: Deformation
    # -------------------------------------------------------------------

    fitter = GarmentFitter(garment)
    fitter.fit(measurements)

    # -------------------------------------------------------------------
    # Phase 5: Registration
    # -------------------------------------------------------------------

    GarmentRegistration.register(
        avatar_obj=avatar,
        garment_obj=garment
    )

    # -------------------------------------------------------------------
    # Phase 5: Collision Correction
    # -------------------------------------------------------------------

    CollisionCorrector.correct(
        garment_obj=garment,
        avatar_obj=avatar
    )

    # -------------------------------------------------------------------
    # Phase 5: Export
    # -------------------------------------------------------------------

    Exporter.export_glb(
        output_path=output_path,
        objects=[avatar, garment]
    )

    print()
    print("=" * 70)
    print("PIPELINE COMPLETE")
    print("=" * 70)
    print("Output:", output_path)
    print("=" * 70)


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":

    args = parse_args()

    run_pipeline(
        avatar_glb=args.avatar_glb,
        garment_blend=args.garment_blend,
        garment_name=args.garment_name,
        measurements_path=args.measurements,
        output_path=args.output
    )