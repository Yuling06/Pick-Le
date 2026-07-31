"""
===============================================================================
Shape Key Neck Extractor V3
===============================================================================

Extracts neck anchor from MPFB avatars using:

    measure-neck-circ-incr
    measure-neck-circ-decr

Outputs:
    - center (world coordinate)
    - radius
    - height_ratio (body-relative neck height)
    - vertices

===============================================================================
"""

from dataclasses import dataclass
from mathutils import Vector



@dataclass
class DetectedNeck:

    center: Vector

    radius: float

    normal: Vector

    vertices: list

    height_ratio: float




class ShapeKeyNeckExtractor:


    INCREASE_KEY = "measure-neck-circ-incr"

    DECREASE_KEY = "measure-neck-circ-decr"

    MOVEMENT_THRESHOLD = 0.0001



    @staticmethod
    def extract(avatar_obj):


        if avatar_obj is None:
            raise RuntimeError(
                "No avatar selected."
            )


        if avatar_obj.type != "MESH":
            raise RuntimeError(
                "Avatar must be mesh."
            )



        mesh = avatar_obj.data



        if mesh.shape_keys is None:
            raise RuntimeError(
                "Avatar has no shape keys."
            )



        keys = mesh.shape_keys.key_blocks



        if "Basis" not in keys:
            raise RuntimeError(
                "Missing Basis shape key."
            )


        if ShapeKeyNeckExtractor.INCREASE_KEY not in keys:
            raise RuntimeError(
                "Missing measure-neck-circ-incr"
            )


        if ShapeKeyNeckExtractor.DECREASE_KEY not in keys:
            raise RuntimeError(
                "Missing measure-neck-circ-decr"
            )



        basis = keys["Basis"]

        incr = keys[
            ShapeKeyNeckExtractor.INCREASE_KEY
        ]

        decr = keys[
            ShapeKeyNeckExtractor.DECREASE_KEY
        ]



        affected_vertices = []



        # =====================================================
        # Detect affected shape key vertices
        # =====================================================

        for i in range(len(basis.data)):


            base = basis.data[i].co

            incr_pos = incr.data[i].co

            decr_pos = decr.data[i].co



            move_incr = (
                incr_pos - base
            ).length


            move_decr = (
                decr_pos - base
            ).length



            if max(
                move_incr,
                move_decr
            ) > ShapeKeyNeckExtractor.MOVEMENT_THRESHOLD:


                world_pos = (

                    avatar_obj.matrix_world

                    @ base

                )


                affected_vertices.append(
                    world_pos
                )



        if len(affected_vertices) == 0:

            raise RuntimeError(
                "Unable to detect neck vertices."
            )



        # =====================================================
        # Calculate neck center
        # =====================================================

        center = Vector(
            (0,0,0)
        )


        for v in affected_vertices:

            center += v



        center /= len(
            affected_vertices
        )



        # =====================================================
        # Radius
        # =====================================================

        radii = []


        for v in affected_vertices:


            radius = Vector(

                (
                    v.x - center.x,

                    v.y - center.y,

                    0

                )

            ).length


            radii.append(radius)



        avg_radius = (

            sum(radii)

            /

            len(radii)

        )



        # =====================================================
        # Calculate avatar height ratio
        # =====================================================


        world_vertices = [

            avatar_obj.matrix_world @ v.co

            for v in mesh.vertices

        ]



        min_z = min(
            v.z
            for v in world_vertices
        )


        max_z = max(
            v.z
            for v in world_vertices
        )


        avatar_height = max_z - min_z



        if avatar_height > 0:


            height_ratio = (

                center.z - min_z

            ) / avatar_height


        else:

            height_ratio = 0



        # =====================================================
        # Debug
        # =====================================================

        print("=" * 70)
        print("SHAPE KEY NECK EXTRACTION")
        print("=" * 70)

        print("Avatar:")
        print(avatar_obj.name)

        print()

        print("Affected vertices:")
        print(len(affected_vertices))

        print()

        print("Center:")
        print(center)

        print()

        print("Radius:")
        print(avg_radius)

        print()

        print("Avatar Height:")
        print(avatar_height)

        print()

        print("Neck Height Ratio:")
        print(height_ratio)

        print("=" * 70)



        return DetectedNeck(

            center=center,

            radius=avg_radius,

            normal=Vector(
                (0,-1,0)
            ),

            vertices=affected_vertices,

            height_ratio=height_ratio

        )