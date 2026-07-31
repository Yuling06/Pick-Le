"""
reference_measurement_extractor.py

Measures the reference garment and exports the
reference measurements as JSON.

Run this once for every base garment.

Example output:

reference_measurements.json
"""

import bpy
import json
import math
from mathutils import Vector

# ==========================================================
# CONFIG
# ==========================================================

GARMENT_NAME = "Shirt"

OUTPUT_PATH = bpy.path.abspath("//reference_measurements.json")

# ==========================================================
# HELPERS
# ==========================================================

def get_landmark(name):

    if name not in bpy.data.objects:
        raise Exception(f"Missing landmark: {name}")

    return bpy.data.objects[name].location.copy()


def get_vertex_group(obj, group_name):

    if group_name not in obj.vertex_groups:
        raise Exception(f"Missing vertex group: {group_name}")

    vg = obj.vertex_groups[group_name]

    vertices = []

    for vertex in obj.data.vertices:

        for g in vertex.groups:

            if g.group == vg.index:

                if g.weight > 0:

                    vertices.append(vertex)

                break

    return vertices


# ==========================================================
# MEASUREMENTS
# ==========================================================

def measure_bust(obj):

    vertices = get_vertex_group(obj, "VG_Bust")

    xs = [
        (obj.matrix_world @ v.co).x
        for v in vertices
    ]

    width = max(xs) - min(xs)

    # Approximate circumference

    return width * 2.0


def measure_length(obj):

    neck = get_landmark("LM_Neck")

    vertices = get_vertex_group(obj, "VG_Length")

    lowest = min(

        (obj.matrix_world @ v.co).z

        for v in vertices

    )

    return neck.z - lowest


def measure_shoulder_width():

    left = get_landmark("LM_LeftShoulder")

    right = get_landmark("LM_RightShoulder")

    return (right - left).length


def measure_sleeve_length():

    left_shoulder = get_landmark("LM_LeftShoulder")

    right_shoulder = get_landmark("LM_RightShoulder")

    left_cuff = get_landmark("LM_LeftCuff")

    right_cuff = get_landmark("LM_RightCuff")

    left = (left_cuff - left_shoulder).length

    right = (right_cuff - right_shoulder).length

    return (left + right) / 2


def measure_neck_opening(obj):

    center = get_landmark("LM_Neck")

    vertices = get_vertex_group(obj, "VG_NeckOpening")

    radius = 0

    for vertex in vertices:

        world = obj.matrix_world @ vertex.co

        offset = world - center

        offset.z = 0

        radius += offset.length

    radius /= len(vertices)

    return 2 * math.pi * radius


def measure_cuff(obj):

    left_center = get_landmark("LM_LeftCuff")

    right_center = get_landmark("LM_RightCuff")

    left_vertices = get_vertex_group(obj, "VG_LeftCuff")

    right_vertices = get_vertex_group(obj, "VG_RightCuff")

    left_radius = 0

    for vertex in left_vertices:

        world = obj.matrix_world @ vertex.co

        offset = world - left_center

        left_radius += offset.length

    left_radius /= len(left_vertices)

    right_radius = 0

    for vertex in right_vertices:

        world = obj.matrix_world @ vertex.co

        offset = world - right_center

        right_radius += offset.length

    right_radius /= len(right_vertices)

    radius = (left_radius + right_radius) / 2

    return 2 * math.pi * radius


# ==========================================================
# MAIN
# ==========================================================

def main():

    if GARMENT_NAME not in bpy.data.objects:

        raise Exception(

            f"Object '{GARMENT_NAME}' not found."

        )

    obj = bpy.data.objects[GARMENT_NAME]

    measurements = {

        "garment_type": "shirt",

        "mesh_name": GARMENT_NAME,

        "version": "1.0",

        "measurements": {

            "bust": round(

                measure_bust(obj),

                3

            ),

            "length": round(

                measure_length(obj),

                3

            ),

            "shoulder_width": round(

                measure_shoulder_width(),

                3

            ),

            "sleeve_length": round(

                measure_sleeve_length(),

                3

            ),

            "neck_opening": round(

                measure_neck_opening(obj),

                3

            ),

            "cuff": round(

                measure_cuff(obj),

                3

            )

        }

    }

    with open(

        OUTPUT_PATH,

        "w"

    ) as file:

        json.dump(

            measurements,

            file,

            indent=4

        )

    print()

    print("=" * 50)

    print("Reference measurements generated.")

    print()

    print(json.dumps(

        measurements,

        indent=4

    ))

    print()

    print(f"Saved to: {OUTPUT_PATH}")

    print("=" * 50)


if __name__ == "__main__":

    main()