"""
region_factory.py

Creates MeasurementRegion objects from a Blender garment.

Responsibilities
----------------
- Cache vertex groups
- Cache landmarks
- Compute garment local axes
- Compute measurement axes
- Build MeasurementRegion objects
"""

import bpy

from mathutils import Vector

from models.measurement_region import MeasurementRegion


class RegionFactory:

    def __init__(self, garment_object):

        self.obj = garment_object
        self.mesh = garment_object.data

    # =====================================================
    # Public
    # =====================================================

    def build(self):

        """
        Returns
        -------
        dict[str, MeasurementRegion]
        """

        vertex_groups = self._cache_vertex_groups()

        landmarks = self._cache_landmarks()

        local_x, local_y, local_z = self._local_axes()

        shoulder_axis = (
            landmarks["LM_RightShoulder"]
            -
            landmarks["LM_LeftShoulder"]
        ).normalized()

        left_sleeve_axis = (
            landmarks["LM_LeftCuff"]
            -
            landmarks["LM_LeftShoulder"]
        ).normalized()

        right_sleeve_axis = (
            landmarks["LM_RightCuff"]
            -
            landmarks["LM_RightShoulder"]
        ).normalized()

        regions = {}

        # --------------------------------------------------
        # Bust
        # --------------------------------------------------

        if "VG_Bust" in vertex_groups:

            regions["VG_Bust"] = MeasurementRegion(

                name="Bust",

                vertex_group="VG_Bust",

                pivot=landmarks["LM_Bust"],

                vertex_weights=vertex_groups["VG_Bust"],

                local_x=local_x,

                local_y=local_y,

                local_z=local_z,

                primary_axis=local_x,

                secondary_axis=local_y

            )

        # --------------------------------------------------
        # Length
        # --------------------------------------------------

        if "VG_Length" in vertex_groups:

            regions["VG_Length"] = MeasurementRegion(

                name="Length",

                vertex_group="VG_Length",

                pivot=landmarks["LM_Neck"],

                vertex_weights=vertex_groups["VG_Length"],

                local_x=local_x,

                local_y=local_y,

                local_z=local_z,

                primary_axis=local_z

            )

        # --------------------------------------------------
        # Neck
        # --------------------------------------------------

        if "VG_NeckOpening" in vertex_groups:

            regions["VG_NeckOpening"] = MeasurementRegion(

                name="Neck",

                vertex_group="VG_NeckOpening",

                pivot=landmarks["LM_Neck"],

                vertex_weights=vertex_groups["VG_NeckOpening"],

                local_x=local_x,

                local_y=local_y,

                local_z=local_z,

                primary_axis=local_x,

                secondary_axis=local_y

            )

        # --------------------------------------------------
        # Left Shoulder
        # --------------------------------------------------

        if "VG_LeftShoulder" in vertex_groups:

            regions["VG_LeftShoulder"] = MeasurementRegion(

                name="Left Shoulder",

                vertex_group="VG_LeftShoulder",

                pivot=landmarks["LM_LeftShoulder"],

                vertex_weights=vertex_groups["VG_LeftShoulder"],

                local_x=local_x,

                local_y=local_y,

                local_z=local_z,

                primary_axis=-shoulder_axis

            )

        # --------------------------------------------------
        # Right Shoulder
        # --------------------------------------------------

        if "VG_RightShoulder" in vertex_groups:

            regions["VG_RightShoulder"] = MeasurementRegion(

                name="Right Shoulder",

                vertex_group="VG_RightShoulder",

                pivot=landmarks["LM_RightShoulder"],

                vertex_weights=vertex_groups["VG_RightShoulder"],

                local_x=local_x,

                local_y=local_y,

                local_z=local_z,

                primary_axis=shoulder_axis

            )

        # --------------------------------------------------
        # Left Sleeve
        # --------------------------------------------------

        if "VG_LeftSleeve" in vertex_groups:

            regions["VG_LeftSleeve"] = MeasurementRegion(

                name="Left Sleeve",

                vertex_group="VG_LeftSleeve",

                pivot=landmarks["LM_LeftShoulder"],

                vertex_weights=vertex_groups["VG_LeftSleeve"],

                local_x=local_x,

                local_y=local_y,

                local_z=local_z,

                primary_axis=left_sleeve_axis

            )

        # --------------------------------------------------
        # Right Sleeve
        # --------------------------------------------------

        if "VG_RightSleeve" in vertex_groups:

            regions["VG_RightSleeve"] = MeasurementRegion(

                name="Right Sleeve",

                vertex_group="VG_RightSleeve",

                pivot=landmarks["LM_RightShoulder"],

                vertex_weights=vertex_groups["VG_RightSleeve"],

                local_x=local_x,

                local_y=local_y,

                local_z=local_z,

                primary_axis=right_sleeve_axis

            )

        # --------------------------------------------------
        # Left Cuff
        # --------------------------------------------------

        if "VG_LeftCuff" in vertex_groups:

            regions["VG_LeftCuff"] = MeasurementRegion(

                name="Left Cuff",

                vertex_group="VG_LeftCuff",

                pivot=landmarks["LM_LeftCuff"],

                vertex_weights=vertex_groups["VG_LeftCuff"],

                local_x=local_x,

                local_y=local_y,

                local_z=local_z,

                primary_axis=left_sleeve_axis,

                secondary_axis=local_y

            )

        # --------------------------------------------------
        # Right Cuff
        # --------------------------------------------------

        if "VG_RightCuff" in vertex_groups:

            regions["VG_RightCuff"] = MeasurementRegion(

                name="Right Cuff",

                vertex_group="VG_RightCuff",

                pivot=landmarks["LM_RightCuff"],

                vertex_weights=vertex_groups["VG_RightCuff"],

                local_x=local_x,

                local_y=local_y,

                local_z=local_z,

                primary_axis=right_sleeve_axis,

                secondary_axis=local_y

            )

        return regions

# =====================================================
    # Vertex Groups
    # =====================================================

    def _cache_vertex_groups(self):

        groups = {
            group.name: {}
            for group in self.obj.vertex_groups
        }

        group_names = {
            group.index: group.name
            for group in self.obj.vertex_groups
        }

        for vertex in self.mesh.vertices:

            for group_element in vertex.groups:

                name = group_names.get(group_element.group)

                if name is not None:

                    groups[name][vertex.index] = group_element.weight

        return groups

    # =====================================================
    # Landmarks
    # =====================================================

    def _cache_landmarks(self):

        landmarks = {}

        inverse = self.obj.matrix_world.inverted()

        for obj in bpy.data.objects:

            if obj.name.startswith("LM_"):

                landmarks[obj.name] = (
                    inverse @ obj.matrix_world.translation
                )

        return landmarks

    # =====================================================
    # Local Axes
    # =====================================================

    def _local_axes(self):

        rotation = self.obj.matrix_world.to_3x3()

        x = (rotation @ Vector((1, 0, 0))).normalized()

        y = (rotation @ Vector((0, 1, 0))).normalized()

        z = (rotation @ Vector((0, 0, 1))).normalized()

        return x, y, z