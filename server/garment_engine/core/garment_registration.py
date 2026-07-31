"""
===============================================================================
Phase 5 - Garment Registration
File: garment_engine/core/garment_registration.py
===============================================================================

Purpose
-------
Registers a garment onto an avatar by aligning:

    Avatar Neck Center
            ↓
    Garment Neck Opening Center

Current Stage
-------------
✔ Translation only

Future
------
- Rotation
- Scaling
- Deformation

===============================================================================
"""

from dataclasses import dataclass

from mathutils import Vector

from core.shape_key_neck_extractor import (
    ShapeKeyNeckExtractor
)

from core.neck_opening_extractor import (
    NeckOpeningExtractor
)


# =============================================================================
# Result
# =============================================================================

@dataclass
class RegistrationResult:

    translation: Vector

    avatar_center: Vector

    garment_center: Vector


# =============================================================================
# Registration
# =============================================================================

class GarmentRegistration:

    # -------------------------------------------------------------------------
    # Temporary collar fitting offset
    #
    # Increase -> shirt sits lower
    # Decrease -> shirt sits higher
    # -------------------------------------------------------------------------

    COLLAR_DROP_OFFSET = 0.02

    # -------------------------------------------------------------------------

    @staticmethod
    def register(

        avatar_obj,

        garment_obj

    ):

        if avatar_obj is None:

            raise RuntimeError(
                "Avatar object is None."
            )

        if garment_obj is None:

            raise RuntimeError(
                "Garment object is None."
            )

        # ==============================================================
        # Extract avatar neck
        # ==============================================================

        avatar_neck = ShapeKeyNeckExtractor.extract(
            avatar_obj
        )

        # ==============================================================
        # Extract garment neck
        # ==============================================================

        garment_neck = NeckOpeningExtractor.extract(
            garment_obj
        )

        # ==============================================================
        # Compute translation
        # ==============================================================

        translation = (

            avatar_neck.center

            -

            garment_neck.center

        )

        # ==============================================================
        # Temporary vertical offset
        # ==============================================================

        translation.z -= GarmentRegistration.COLLAR_DROP_OFFSET

        # ==============================================================
        # Move garment
        # ==============================================================

        garment_obj.location += translation

        # ==============================================================
        # Debug
        # ==============================================================

        print()
        print("=" * 70)
        print("GARMENT REGISTRATION")
        print("=" * 70)

        print()

        print("Avatar Center:")
        print(avatar_neck.center)

        print()

        print("Garment Center:")
        print(garment_neck.center)

        print()

        print("Translation:")
        print(translation)

        print()

        print("Collar Drop Offset:")
        print(GarmentRegistration.COLLAR_DROP_OFFSET)

        print()

        print("Garment New Location:")
        print(garment_obj.location)

        print()

        print("=" * 70)

        return RegistrationResult(

            translation=translation,

            avatar_center=avatar_neck.center,

            garment_center=garment_neck.center

        )