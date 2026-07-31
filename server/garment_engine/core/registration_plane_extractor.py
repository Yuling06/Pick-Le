"""
===============================================================================
Phase 5 - Registration Plane Extractor v4
===============================================================================

Detects the avatar upper torso front surface.

Method:
--------
1. Work in local coordinates.
2. Remove extreme bottom and top regions.
3. Search upper torso only.
4. Detect front-facing vertices.
5. Filter out arm-side vertices.
6. Calculate registration plane.

===============================================================================
"""

from dataclasses import dataclass
from mathutils import Vector



@dataclass
class RegistrationPlane:

    center: Vector

    normal: Vector

    vertices: list

    width: float

    height: float

    average_z: float



class RegistrationPlaneExtractor:


    # Ignore legs
    LOWER_LIMIT = 0.60


    # Ignore head
    UPPER_LIMIT = 0.78


    # Front surface depth
    FRONT_DEPTH_RATIO = 0.035


    # Remove side/arm influence

    SIDE_WIDTH_RATIO = 0.9



    @staticmethod
    def extract(avatar_obj):


        mesh = avatar_obj.data


        local_vertices = [
            v.co.copy()
            for v in mesh.vertices
        ]


        min_z = min(
            v.z for v in local_vertices
        )

        max_z = max(
            v.z for v in local_vertices
        )


        height = max_z - min_z



        # =====================================================
        # Upper torso search area
        # =====================================================

        torso_vertices = [

            v

            for v in local_vertices

            if
            (
                min_z + height *
                RegistrationPlaneExtractor.LOWER_LIMIT
            )
            <= v.z <=
            (
                min_z + height *
                RegistrationPlaneExtractor.UPPER_LIMIT
            )

        ]



        if len(torso_vertices) < 50:

            raise RuntimeError(
                "Not enough torso vertices."
            )



        # =====================================================
        # Find front surface
        # =====================================================

        front_y = min(
            v.y for v in torso_vertices
        )


        front_depth = (

            height *
            RegistrationPlaneExtractor.FRONT_DEPTH_RATIO

        )


        front_vertices = [

            v

            for v in torso_vertices

            if
            v.y <= front_y + front_depth

        ]



        # =====================================================
        # Remove arm influence
        # Keep central torso width
        # =====================================================

        min_x = min(
            v.x for v in front_vertices
        )

        max_x = max(
            v.x for v in front_vertices
        )


        center_x = (

            min_x + max_x

        ) / 2



        width = max_x - min_x


        allowed_width = (

            width *

            RegistrationPlaneExtractor.SIDE_WIDTH_RATIO

        )


        filtered_vertices = [

            v

            for v in front_vertices

            if abs(
                v.x - center_x
            ) <= allowed_width / 2

        ]



        if len(filtered_vertices) < 20:

            raise RuntimeError(
                "Unable to isolate chest surface."
            )



        # =====================================================
        # Center
        # =====================================================

        center = Vector((0,0,0))


        for v in filtered_vertices:

            center += v


        center /= len(filtered_vertices)



        world_center = (

            avatar_obj.matrix_world

            @ center

        )



        # =====================================================
        # Dimensions
        # =====================================================

        xs = [
            v.x for v in filtered_vertices
        ]

        zs = [
            v.z for v in filtered_vertices
        ]


        plane_width = (
            max(xs)-min(xs)
        )


        plane_height = (
            max(zs)-min(zs)
        )



        return RegistrationPlane(

            center=world_center,

            normal=Vector(
                (0,-1,0)
            ),

            vertices=[
                avatar_obj.matrix_world @ v
                for v in filtered_vertices
            ],

            width=plane_width,

            height=plane_height,

            average_z=center.z

        )