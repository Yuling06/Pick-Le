"""
deformation_solver.py

Core deformation engine for Pick-le.

This class computes vertex displacements but NEVER modifies
the mesh directly.

GarmentFitter is responsible for applying the final
displacement buffer to the mesh.
"""

from mathutils import Vector

from models.measurement import Measurement
from models.measurement_region import MeasurementRegion


class DeformationSolver:

    def __init__(
        self,
        original_vertices: list[Vector],
        displacement_buffer: list[Vector]
    ):

        self.original_vertices = original_vertices
        self.displacements = displacement_buffer

    # =====================================================
    # Internal Helpers
    # =====================================================

    def _move_vertex(
        self,
        vertex_id: int,
        movement: Vector,
        weight: float
    ):
        """
        Adds weighted movement to the displacement buffer.
        """

        self.displacements[vertex_id] += movement * weight

    # =====================================================
    # Generic Directional Scaling
    # =====================================================

    def _directional_scale(
        self,
        region: MeasurementRegion,
        ratio: float
    ):
        """
        Scales vertices along the region's primary axis.

        Used by:
            - Length
            - Shoulder Width
            - Sleeve Length
        """

        direction = region.primary_axis.normalized()

        for vertex_id, weight in region.vertex_weights.items():

            vertex = self.original_vertices[vertex_id]

            offset = vertex - region.pivot

            amount = offset.dot(direction)

            new_amount = amount * ratio

            movement = direction * (new_amount - amount)

            self._move_vertex(
                vertex_id,
                movement,
                weight
            )

    # =====================================================
    # Generic Radial Scaling
    # =====================================================

    def _radial_scale(
        self,
        region: MeasurementRegion,
        ratio: float
    ):
        """
        Expands vertices away from the pivot using

            primary_axis
            secondary_axis

        Used by:
            - Neck Opening
            - Cuff
        """

        axis1 = region.primary_axis.normalized()
        axis2 = region.secondary_axis.normalized()

        for vertex_id, weight in region.vertex_weights.items():

            vertex = self.original_vertices[vertex_id]

            offset = vertex - region.pivot

            x = offset.dot(axis1)
            y = offset.dot(axis2)

            radius = (
                axis1 * x
                +
                axis2 * y
            )

            movement = radius * (ratio - 1.0)

            self._move_vertex(
                vertex_id,
                movement,
                weight
            )

    # =====================================================
    # Generic Planar Scaling
    # =====================================================

    def _planar_scale(
        self,
        region: MeasurementRegion,
        ratio: float
    ):
        """
        Expands vertices inside a plane defined by

            primary_axis
            secondary_axis

        while preserving depth.

        Used by:
            - Bust
        """

        axis1 = region.primary_axis.normalized()
        axis2 = region.secondary_axis.normalized()

        normal = axis1.cross(axis2).normalized()

        for vertex_id, weight in region.vertex_weights.items():

            vertex = self.original_vertices[vertex_id]

            offset = vertex - region.pivot

            x = offset.dot(axis1)
            y = offset.dot(axis2)
            z = offset.dot(normal)

            scaled = (
                axis1 * (x * ratio)
                +
                axis2 * (y * ratio)
                +
                normal * z
            )

            original = (
                axis1 * x
                +
                axis2 * y
                +
                normal * z
            )

            movement = scaled - original

            self._move_vertex(
                vertex_id,
                movement,
                weight
            )

    # =====================================================
    # Bust
    # =====================================================

    def apply_bust(
        self,
        region: MeasurementRegion,
        measurement: Measurement
    ):
        """
        Increase bust circumference.
        """

        self._planar_scale(
            region,
            measurement.ratio
        )

    # =====================================================
    # Remaining measurement functions
    # (implemented in Part 2)
    # =====================================================
        # =====================================================
    # Length
    # =====================================================

    def apply_length(
        self,
        region: MeasurementRegion,
        measurement: Measurement
    ):
        """
        Increase garment length.

        The pivot (neck) stays fixed while the hem
        moves along the primary axis.
        """

        self._directional_scale(
            region,
            measurement.ratio
        )

    # =====================================================
    # Neck Opening
    # =====================================================

    def apply_neck_opening(
        self,
        region: MeasurementRegion,
        measurement: Measurement
    ):
        """
        Increase neck opening.

        Expands equally inside the neck plane.
        """

        self._radial_scale(
            region,
            measurement.ratio
        )

    # =====================================================
    # Shoulder Width
    # =====================================================

    def apply_shoulder_width(
        self,
        left_region: MeasurementRegion,
        right_region: MeasurementRegion,
        measurement: Measurement
    ):
        """
        Increase shoulder width.

        Left shoulder moves outward.

        Right shoulder moves outward.
        """

        self._directional_scale(
            left_region,
            measurement.ratio
        )

        self._directional_scale(
            right_region,
            measurement.ratio
        )

    # =====================================================
    # Sleeve Length
    # =====================================================

    def apply_sleeve_length(
        self,
        left_region: MeasurementRegion,
        right_region: MeasurementRegion,
        measurement: Measurement
    ):
        """
        Increase sleeve length.

        Uses the shoulder->cuff direction.
        """

        self._directional_scale(
            left_region,
            measurement.ratio
        )

        self._directional_scale(
            right_region,
            measurement.ratio
        )

    # =====================================================
    # Cuff
    # =====================================================

    def apply_cuff(
        self,
        left_region: MeasurementRegion,
        right_region: MeasurementRegion,
        measurement: Measurement
    ):
        """
        Increase cuff circumference.
        """

        self._radial_scale(
            left_region,
            measurement.ratio
        )

        self._radial_scale(
            right_region,
            measurement.ratio
        )