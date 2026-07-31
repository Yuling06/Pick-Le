"""
===============================================================================
Phase 5 - Collision Corrector
File: garment_engine/core/collision_corrector.py
===============================================================================

Purpose
-------
Removes garment/avatar intersections after deformation and registration.

Workflow

    Registered Garment
            ↓
    Collision Detection
            ↓
    Signed Distance
            ↓
    Move Vertices
            ↓
    Updated Garment

This module edits mesh vertices directly.

===============================================================================
"""

import bpy

from mathutils import Vector

from core.collision_detector import (
    CollisionDetector
)


class CollisionCorrector:

    # ==========================================================
    # Default visual clearance
    #
    # Increase:
    #     Looser appearance
    #
    # Decrease:
    #     Tighter appearance
    # ==========================================================

    DEFAULT_CLEARANCE = 0.010

    SAFETY_MARGIN = 0.010

    # ==========================================================
    # Constructor
    # ==========================================================

    def __init__(

        self,

        garment_obj,

        avatar_obj,

        clearance=None

    ):

        if garment_obj is None:

            raise RuntimeError(
                "Garment object is None."
            )

        if avatar_obj is None:

            raise RuntimeError(
                "Avatar object is None."
            )

        self.garment = garment_obj

        self.avatar = avatar_obj

        if clearance is None:

            self.clearance = (

                CollisionCorrector.DEFAULT_CLEARANCE

            )

        else:

            self.clearance = clearance

        # Build avatar BVH

        result = CollisionDetector.build_bvh(

            self.avatar

        )

        self.bvh = result["bvh"]

        self.mesh = self.garment.data

    # ==========================================================
    # World -> Local Vector
    # ==========================================================

    def _world_vector_to_local(

        self,

        vector

    ):

        matrix = (

            self.garment.matrix_world

            .to_3x3()

            .inverted()

        )

        return matrix @ vector

    # ==========================================================
    # Correct One Vertex
    # ==========================================================

    def correct_vertex(

        self,

        vertex

    ):

        world_position = (

            self.garment.matrix_world

            @

            vertex.co

        )

        query = (

            CollisionDetector.query_closest_point(

                self.bvh,

                world_position

            )

        )

        signed = (

            CollisionDetector.compute_signed_distance(

                world_position,

                query

            )

        )

        signed_distance = (

            signed["signed_distance"]

        )

        # Already sufficiently outside

        if signed_distance >= self.clearance:

            return False, 0.0

        movement_distance = (

            self.clearance

            -

            signed_distance

            +

            CollisionCorrector.SAFETY_MARGIN

        )

        world_offset = (

            query["normal"]

            * movement_distance

        )

        local_offset = (

            self._world_vector_to_local(

                world_offset

            )

        )

        vertex.co += local_offset

        return True, movement_distance

        # ==========================================================
    # Correct Entire Mesh
    # ==========================================================

    def correct_mesh(self):

        total_vertices = len(self.mesh.vertices)

        corrected_vertices = 0

        total_movement = 0.0

        maximum_movement = 0.0

        corrected_indices = []

        # ------------------------------------------------------
        # Loop through every vertex
        # ------------------------------------------------------

        for vertex in self.mesh.vertices:

            corrected, movement = self.correct_vertex(
                vertex
            )

            if corrected:

                corrected_vertices += 1

                total_movement += movement

                corrected_indices.append(
                    vertex.index
                )

                if movement > maximum_movement:

                    maximum_movement = movement

        # ------------------------------------------------------
        # Update mesh
        # ------------------------------------------------------

        self.mesh.update()

        bpy.context.view_layer.update()

        # ------------------------------------------------------
        # Statistics
        # ------------------------------------------------------

        if corrected_vertices > 0:

            average_movement = (

                total_movement

                /

                corrected_vertices

            )

        else:

            average_movement = 0.0

        result = {

            "total_vertices": total_vertices,

            "corrected_vertices": corrected_vertices,

            "average_movement": average_movement,

            "maximum_movement": maximum_movement,

            "corrected_indices": corrected_indices,

            "clearance": self.clearance

        }

        return result

    # ==========================================================
    # Print Summary
    # ==========================================================

    @staticmethod
    def print_summary(result):

        print()

        print("=" * 70)

        print("COLLISION CORRECTION")

        print("=" * 70)

        print()

        print("Total Vertices:")

        print(result["total_vertices"])

        print()

        print("Corrected Vertices:")

        print(result["corrected_vertices"])

        print()

        print("Visual Clearance:")

        print(result["clearance"])

        print()

        print("Average Movement:")

        print(result["average_movement"])

        print()

        print("Maximum Movement:")

        print(result["maximum_movement"])

        print()

        print("=" * 70)

        print()

            # ==========================================================
    # Convenience Wrapper
    # ==========================================================

    @staticmethod
    def correct(

        garment_obj,

        avatar_obj,

        clearance=None

    ):

        corrector = CollisionCorrector(

            garment_obj=garment_obj,

            avatar_obj=avatar_obj,

            clearance=clearance

        )

        result = corrector.correct_mesh()

        CollisionCorrector.print_summary(
            result
        )

        return result

    # ==========================================================
    # Retrieve Corrected Vertex List
    # ==========================================================

    @staticmethod
    def get_corrected_vertices(result):

        return result["corrected_indices"]