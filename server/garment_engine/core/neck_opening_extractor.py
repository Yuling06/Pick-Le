"""
===============================================================================
Phase 5 - Neck Opening Extractor
File: garment_engine/core/neck_opening_extractor.py
===============================================================================

Purpose
-------
Extracts the neck opening vertex group from a garment mesh and computes
geometric information required for garment registration.

Supported Vertex Group Names
----------------------------
- VG_NeckOpening   (Recommended)
- Neck_Opening
- NeckOpening
- Collar

Outputs
-------
NeckOpeningData
    - vertex_indices
    - world_vertices
    - center
    - average_radius
    - opening_normal
===============================================================================
"""

from dataclasses import dataclass
from mathutils import Vector


# =============================================================================
# Data Class
# =============================================================================

@dataclass
class NeckOpeningData:

    vertex_indices: list

    world_vertices: list

    center: Vector

    average_radius: float

    opening_normal: Vector


# =============================================================================
# Extractor
# =============================================================================

class NeckOpeningExtractor:

    POSSIBLE_GROUPS = [

        "VG_NeckOpening",

        "Neck_Opening",

        "NeckOpening",

        "Collar"

    ]

    # -------------------------------------------------------------------------

    @staticmethod
    def extract(garment_obj):

        if garment_obj is None:
            raise RuntimeError("Garment object is None.")

        if garment_obj.type != "MESH":
            raise RuntimeError("Selected object must be a mesh.")

        mesh = garment_obj.data

        group = None
        group_name = None

        for name in NeckOpeningExtractor.POSSIBLE_GROUPS:

            group = garment_obj.vertex_groups.get(name)

            if group is not None:
                group_name = name
                break

        if group is None:

            raise RuntimeError(

                "Unable to locate a neck opening vertex group.\n\n"

                "Supported names:\n"

                + "\n".join(
                    f"  • {name}"
                    for name in NeckOpeningExtractor.POSSIBLE_GROUPS
                )

            )

        print(f"Using Vertex Group : {group_name}")

        vertex_indices = []

        world_vertices = []

        for vertex in mesh.vertices:

            try:

                group.weight(vertex.index)

                vertex_indices.append(vertex.index)

                world_vertices.append(

                    garment_obj.matrix_world @ vertex.co

                )

            except RuntimeError:

                pass

        if len(world_vertices) < 3:

            raise RuntimeError(

                f"Vertex group '{group_name}' contains fewer than 3 vertices."

            )

        # ---------------------------------------------------------------------
        # Centre
        # ---------------------------------------------------------------------

        center = Vector((0.0, 0.0, 0.0))

        for v in world_vertices:

            center += v

        center /= len(world_vertices)

        # ---------------------------------------------------------------------
        # Average Radius
        # ---------------------------------------------------------------------

        radius_sum = 0.0

        for v in world_vertices:

            radius_sum += (v - center).length

        average_radius = radius_sum / len(world_vertices)

        # ---------------------------------------------------------------------
        # Approximate Opening Normal
        #
        # NOTE:
        # This is a temporary implementation.
        # Blender vertex groups do NOT preserve boundary ordering.
        #
        # We'll replace this in a later phase with a proper best-fit plane
        # computed from the boundary loop.
        # ---------------------------------------------------------------------

        normal = Vector((0.0, -1.0, 0.0))

        # ---------------------------------------------------------------------

        return NeckOpeningData(

            vertex_indices=vertex_indices,

            world_vertices=world_vertices,

            center=center,

            average_radius=average_radius,

            opening_normal=normal

        )