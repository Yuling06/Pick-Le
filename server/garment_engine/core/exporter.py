"""
===============================================================================
Phase 5.7 - Exporter
File: garment_engine/core/exporter.py
===============================================================================

Purpose
-------
Exports the avatar and fitted garment together as a single glTF/GLB file.

===============================================================================
"""

import bpy
import os


class Exporter:

    @staticmethod
    def export_glb(
        output_path,
        objects=None
    ):
        """
        Exports the given objects (or the full scene if none given)
        to a single .glb file.

        Parameters
        ----------
        output_path
            Full path to write the .glb file to.

        objects
            Optional list of Blender objects to export. If None,
            exports everything currently in the scene.
        """

        os.makedirs(
            os.path.dirname(output_path),
            exist_ok=True
        )

        if objects is not None:

            bpy.ops.object.select_all(action='DESELECT')

            for obj in objects:
                obj.select_set(True)

            use_selection = True

        else:

            use_selection = False

        bpy.ops.export_scene.gltf(
            filepath=output_path,
            export_format='GLB',
            use_selection=use_selection,
            export_apply=True
        )

        if not os.path.isfile(output_path):

            raise RuntimeError(
                f"Export reported success but file not found: "
                f"{output_path}"
            )

        print()
        print("=" * 70)
        print("EXPORT")
        print("=" * 70)
        print()
        print("Output:")
        print(output_path)
        print("=" * 70)

        return output_path