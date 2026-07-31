"""
garment_fitter.py

Main controller for the Pick-le Garment Fitting Engine.
"""

import bpy
from mathutils import Vector

from core.region_factory import RegionFactory
from core.deformation_solver import DeformationSolver
from models.measurement import Measurement


class GarmentFitter:

    # Composite measurements that don't map to a single region —
    # they're built from paired left/right (or similar) sub-regions.
    GROUP_DEPENDENCIES = {
        "VG_ShoulderWidth": ["VG_LeftShoulder", "VG_RightShoulder"],
        "VG_SleeveLength": ["VG_LeftSleeve", "VG_RightSleeve"],
        "VG_Cuff": ["VG_LeftCuff", "VG_RightCuff"],
    }

    # Bust deformation has been observed to produce a chest bulge at
    # ratios above ~1.3x-1.4x, likely due to the bust region's pivot-
    # relative planar scale distorting curved geometry near the
    # shoulder seam at large expansions. Capping the ratio actually
    # applied lets smaller size differences still visibly scale, while
    # preventing extreme requests from breaking the mesh.
    MAX_BUST_RATIO = 1.1

    def __init__(self, garment_object):

        self.obj = garment_object
        self.mesh = garment_object.data

        # ------------------------------------------
        # Cache original mesh
        # ------------------------------------------

        self.original_vertices = [
            vertex.co.copy()
            for vertex in self.mesh.vertices
        ]

        # ------------------------------------------
        # Displacement buffer
        # ------------------------------------------

        self.displacements = [
            Vector((0, 0, 0))
            for _ in self.mesh.vertices
        ]

        # ------------------------------------------
        # Build measurement regions
        # ------------------------------------------

        self.regions = RegionFactory(
            garment_object
        ).build()

        # ------------------------------------------
        # Create solver
        # ------------------------------------------

        self.solver = DeformationSolver(
            self.original_vertices,
            self.displacements
        )

    # =====================================================
    # Fit Garment
    # =====================================================

    def fit(self, measurements):

        """
        Parameters
        ----------
        measurements

        list[Measurement]
        """

        for measurement in measurements:

            group = measurement.vertex_group

            # --------------------------------------
            # Resolve which region(s) this measurement
            # actually depends on. Composite groups
            # (shoulder width, sleeve length, cuff) map
            # to a pair of left/right sub-regions rather
            # than a region of their own name.
            # --------------------------------------

            required_regions = self.GROUP_DEPENDENCIES.get(
                group,
                [group]
            )

            missing = [
                r for r in required_regions
                if r not in self.regions
            ]

            if missing:

                print(
                    f"Missing region(s) for {group}: {missing}"
                )

                continue

            # --------------------------------------
            # Bust
            # --------------------------------------

            if group == "VG_Bust":

                capped_ratio = min(
                    measurement.ratio,
                    self.MAX_BUST_RATIO
                )

                capped_measurement = Measurement(
                    name=measurement.name,
                    vertex_group=measurement.vertex_group,
                    reference=measurement.reference,
                    target=measurement.reference * capped_ratio
                )

                self.solver.apply_bust(
                    self.regions[group],
                    capped_measurement
                )

            # --------------------------------------
            # Length
            # --------------------------------------

            elif group == "VG_Length":

                self.solver.apply_length(

                    self.regions[group],

                    measurement

                )

            # --------------------------------------
            # Neck
            # --------------------------------------

            elif group == "VG_NeckOpening":

                self.solver.apply_neck_opening(

                    self.regions[group],

                    measurement

                )

            # --------------------------------------
            # Shoulder Width
            # --------------------------------------

            elif group == "VG_ShoulderWidth":

                self.solver.apply_shoulder_width(

                    self.regions["VG_LeftShoulder"],

                    self.regions["VG_RightShoulder"],

                    measurement

                )

            # --------------------------------------
            # Sleeve Length
            # --------------------------------------

            elif group == "VG_SleeveLength":

                self.solver.apply_sleeve_length(

                    self.regions["VG_LeftSleeve"],

                    self.regions["VG_RightSleeve"],

                    measurement

                )

            # --------------------------------------
            # Cuff
            # --------------------------------------

            elif group == "VG_Cuff":

                self.solver.apply_cuff(

                    self.regions["VG_LeftCuff"],

                    self.regions["VG_RightCuff"],

                    measurement

                )

            else:

                print(

                    f"No solver registered for "

                    f"{group}"

                )

        self.apply()

    # =====================================================
    # Apply Final Mesh
    # =====================================================

    def apply(self):

        for index, vertex in enumerate(

            self.mesh.vertices

        ):

            vertex.co = (

                self.original_vertices[index]

                +

                self.displacements[index]

            )

        self.mesh.update()

    # =====================================================
    # Reset Mesh
    # =====================================================

    def reset(self):

        for index, vertex in enumerate(

            self.mesh.vertices

        ):

            vertex.co = (

                self.original_vertices[index]

            )

            self.displacements[index] = Vector(

                (0, 0, 0)

            )

        self.mesh.update()