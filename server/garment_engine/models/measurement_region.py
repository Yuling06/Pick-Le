"""
measurement_region.py

Represents a deformable garment region.

A region contains:

- pivot
- vertex weights
- local garment axes
- deformation axes

The deformation solver never interacts with Blender directly.
It only works with MeasurementRegion objects.
"""

from mathutils import Vector


class MeasurementRegion:
    """
    Represents one deformable garment region.

    Example
    -------
    Bust region

    - Vertex Group : VG_Bust
    - Pivot        : LM_Bust
    - Primary Axis : Garment Local X
    - Secondary    : Garment Local Y
    """

    def __init__(
        self,
        name: str,
        vertex_group: str,
        pivot: Vector,
        vertex_weights: dict[int, float],
        local_x: Vector,
        local_y: Vector,
        local_z: Vector,
        primary_axis: Vector | None = None,
        secondary_axis: Vector | None = None
    ):

        self.name = name

        self.vertex_group = vertex_group

        self.pivot = pivot.copy()

        self.vertex_weights = vertex_weights

        # --------------------------------------------------
        # Garment coordinate system
        # --------------------------------------------------

        self.local_x = local_x.normalized()

        self.local_y = local_y.normalized()

        self.local_z = local_z.normalized()

        # --------------------------------------------------
        # Measurement deformation axes
        # --------------------------------------------------

        self.primary_axis = (
            primary_axis.normalized()
            if primary_axis is not None
            else self.local_x
        )

        self.secondary_axis = (
            secondary_axis.normalized()
            if secondary_axis is not None
            else self.local_y
        )

    # ======================================================
    # Convenience Properties
    # ======================================================

    @property
    def vertex_count(self):

        return len(self.vertex_weights)

    @property
    def has_secondary_axis(self):

        return self.secondary_axis is not None

    # ======================================================
    # Utility
    # ======================================================

    def weight(self, vertex_id: int):

        """
        Returns the stored vertex weight.

        Returns 0 if the vertex does not belong
        to this region.
        """

        return self.vertex_weights.get(vertex_id, 0.0)

    # ======================================================
    # Debug
    # ======================================================

    def __repr__(self):

        return (

            f"MeasurementRegion("

            f"name='{self.name}', "

            f"group='{self.vertex_group}', "

            f"vertices={self.vertex_count}"

            f")"

        )