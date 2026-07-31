"""
===============================================================================
Phase 5 - Collision Detector
File: garment_engine/core/collision_detector.py
===============================================================================

Purpose
-------
Builds a BVH from the avatar mesh and provides collision queries.

Provides

    • Build BVH
    • Closest surface query
    • Signed distance
    • Collision analysis

Compatible with Blender 5.x

===============================================================================
"""

import bpy

from mathutils.bvhtree import BVHTree


class CollisionDetector:

    # =========================================================================
    # Build Avatar BVH
    # =========================================================================

    @staticmethod
    def build_bvh(avatar_obj):

        if avatar_obj is None:

            raise RuntimeError(
                "Avatar object is None."
            )

        if avatar_obj.type != "MESH":

            raise RuntimeError(
                "Avatar must be a mesh."
            )

        depsgraph = bpy.context.evaluated_depsgraph_get()

        avatar_eval = avatar_obj.evaluated_get(
            depsgraph
        )

        mesh = avatar_eval.to_mesh()

        vertices = [

            avatar_obj.matrix_world @ v.co

            for v in mesh.vertices

        ]

        polygons = [

            tuple(poly.vertices)

            for poly in mesh.polygons

        ]

        bvh = BVHTree.FromPolygons(

            vertices,

            polygons

        )

        result = {

            "bvh": bvh,

            "vertex_count": len(vertices),

            "face_count": len(polygons)

        }

        avatar_eval.to_mesh_clear()

        return result

    # =========================================================================
    # Closest Point Query
    # =========================================================================

    @staticmethod
    def query_closest_point(

        bvh,

        world_position

    ):

        location, normal, face_index, distance = (

            bvh.find_nearest(

                world_position

            )

        )

        return {

            "location": location,

            "normal": normal,

            "face_index": face_index,

            "distance": distance

        }

    # =========================================================================
    # Signed Distance
    # =========================================================================

    @staticmethod
    def compute_signed_distance(

        world_position,

        query

    ):

        offset = (

            world_position

            -

            query["location"]

        )

        signed_distance = offset.dot(

            query["normal"]

        )

        return {

            "signed_distance": signed_distance,

            "absolute_distance": abs(
                signed_distance
            ),

            "is_inside": (

                signed_distance < 0

            ),

            "offset_vector": offset

        }

    # =========================================================================
    # Analyze Entire Garment
    # =========================================================================

    @staticmethod
    def analyze_garment(

        garment_obj,

        bvh,

        clearance=0.005

    ):

        if garment_obj is None:

            raise RuntimeError(
                "Garment object is None."
            )

        mesh = garment_obj.data

        total_vertices = len(
            mesh.vertices
        )

        colliding_vertices = []

        signed_distances = []

        for vertex in mesh.vertices:

            world_position = (

                garment_obj.matrix_world

                @

                vertex.co

            )

            query = CollisionDetector.query_closest_point(

                bvh,

                world_position

            )

            signed = CollisionDetector.compute_signed_distance(

                world_position,

                query

            )

            signed_distance = signed["signed_distance"]

            signed_distances.append(
                signed_distance
            )

            if signed_distance < clearance:

                colliding_vertices.append(

                    {

                        "index": vertex.index,

                        "signed_distance": signed_distance,

                        "query": query,

                        "world_position": world_position

                    }

                )

        if len(signed_distances) > 0:

            minimum = min(
                signed_distances
            )

            maximum = max(
                signed_distances
            )

            average = (

                sum(signed_distances)

                /

                len(signed_distances)

            )

        else:

            minimum = 0

            maximum = 0

            average = 0

        return {

            "total_vertices": total_vertices,

            "colliding_vertices": len(
                colliding_vertices
            ),

            "collision_list": colliding_vertices,

            "minimum_distance": minimum,

            "maximum_distance": maximum,

            "average_distance": average,

            "clearance": clearance

        }