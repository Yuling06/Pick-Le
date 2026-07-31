"""
===============================================================================
Phase 6 - Texture Compositing + Final Export
File: garment_engine/core/apply_texture_and_export.py
===============================================================================

Purpose
-------
Takes the already-fitted garment (output of garment_engine's
pipeline.py, Phase 4+5) and a texture image, applies the texture
as a material on the garment, and exports the final combined
avatar+garment .glb.

Run headless:

    blender --background --python garment_engine/core/apply_texture_and_export.py -- \\
        --fitted_glb <path to fitted_*.glb> \\
        --texture_path <path to texture .png> \\
        --garment_object_name <name> \\
        --uv_rotation <degrees, e.g. 0, 90, 180, 270> \\
        --output <path to final .glb>

Assumes the garment mesh already has a valid UV layout, carried
over intact from the template through Phase 4/5 (deformation only
moves vertex positions, never UVs).

--uv_rotation corrects for a garment template's UV unwrap orientation
not matching the texture's natural "upright" direction. This value
is now per-template (stored in template_registry.json's
uv_rotation_degrees field, passed through by garmentFitter.js) rather
than a single hardcoded constant, since different templates' UV
unwraps can require different corrections.
===============================================================================
"""

import os
import sys
import math

# Ensure garment_engine/ (the parent of this file's `core/` folder) is on
# sys.path, since Blender's --python invocation doesn't add it automatically.
GARMENT_ENGINE_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

if GARMENT_ENGINE_ROOT not in sys.path:
    sys.path.insert(0, GARMENT_ENGINE_ROOT)

import bpy
import argparse

from core.exporter import Exporter


# =============================================================================
# Argument Parsing
# =============================================================================

def parse_args():

    if "--" in sys.argv:
        argv = sys.argv[sys.argv.index("--") + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser()

    parser.add_argument("--fitted_glb", required=True)
    parser.add_argument("--texture_path", required=True)
    parser.add_argument("--garment_object_name", required=True)
    parser.add_argument("--uv_rotation", type=float, default=0)
    parser.add_argument("--output", required=True)

    return parser.parse_args(argv)


# =============================================================================
# Import
# =============================================================================

def import_fitted_glb(fitted_glb_path):

    bpy.ops.wm.read_factory_settings(use_empty=True)

    bpy.ops.import_scene.gltf(filepath=fitted_glb_path)

    return list(bpy.context.scene.objects)


def find_garment_object(imported_objects, garment_object_name):

    for obj in imported_objects:

        if obj.name == garment_object_name:
            return obj

    for obj in imported_objects:

        if obj.name.startswith(garment_object_name):
            return obj

    available = ", ".join(obj.name for obj in imported_objects)

    raise RuntimeError(
        f"Garment object '{garment_object_name}' not found after "
        f"importing {len(imported_objects)} objects. "
        f"Available: {available}"
    )


# =============================================================================
# Texture Loading
# =============================================================================

def load_texture(image_path):

    if not os.path.isfile(image_path):

        raise RuntimeError(f"Texture file not found: {image_path}")

    for img in bpy.data.images:

        if os.path.abspath(img.filepath) == os.path.abspath(image_path):

            img.reload()
            return img

    return bpy.data.images.load(image_path)


# =============================================================================
# Material Construction
# =============================================================================

def build_fabric_material(material_name, diffuse_image, uv_rotation_degrees=0):

    if material_name in bpy.data.materials:
        material = bpy.data.materials[material_name]
    else:
        material = bpy.data.materials.new(material_name)

    material.use_nodes = True

    nodes = material.node_tree.nodes
    links = material.node_tree.links

    principled = nodes.get("Principled BSDF")

    if principled is None:
        raise RuntimeError(
            f"Material '{material_name}' has no Principled BSDF node."
        )

    # Clear any existing texture/mapping/coordinate nodes tied to
    # Base Color so re-running this doesn't accumulate duplicates.
    for link in list(links):
        if link.to_node == principled and link.to_socket.name == "Base Color":
            links.remove(link)

    texture_node = nodes.new("ShaderNodeTexImage")
    texture_node.image = diffuse_image
    texture_node.location = (principled.location.x - 300, principled.location.y)

    if uv_rotation_degrees != 0:

        # Insert UV coordinate -> Mapping (rotated) -> Image Texture,
        # since this garment template's UV unwrap orientation doesn't
        # match the texture's natural "upright" direction.
        uv_map_node = nodes.new("ShaderNodeUVMap")
        uv_map_node.location = (principled.location.x - 700, principled.location.y - 150)

        mapping_node = nodes.new("ShaderNodeMapping")
        mapping_node.location = (principled.location.x - 500, principled.location.y)

        mapping_node.inputs["Rotation"].default_value[2] = math.radians(uv_rotation_degrees)

        links.new(uv_map_node.outputs["UV"], mapping_node.inputs["Vector"])
        links.new(mapping_node.outputs["Vector"], texture_node.inputs["Vector"])

    links.new(texture_node.outputs["Color"], principled.inputs["Base Color"])

    return material


def assign_material(garment_object, material):

    mesh = garment_object.data

    mesh.materials.clear()
    mesh.materials.append(material)


# =============================================================================
# Pipeline
# =============================================================================

def run(fitted_glb_path, texture_path, garment_object_name, uv_rotation_degrees, output_path):

    print()
    print("=" * 70)
    print("TEXTURE COMPOSITING + EXPORT")
    print("=" * 70)

    imported_objects = import_fitted_glb(fitted_glb_path)

    garment = find_garment_object(imported_objects, garment_object_name)

    diffuse_image = load_texture(texture_path)

    material = build_fabric_material(
        material_name=f"{garment.name}_FabricMaterial",
        diffuse_image=diffuse_image,
        uv_rotation_degrees=uv_rotation_degrees
    )

    assign_material(garment, material)

    Exporter.export_glb(
        output_path=output_path,
        objects=imported_objects
    )

    print()
    print("=" * 70)
    print("COMPOSITING COMPLETE")
    print("Output:", output_path)
    print("=" * 70)


# =============================================================================
# Entry Point
# =============================================================================

if __name__ == "__main__":

    args = parse_args()

    run(
        fitted_glb_path=args.fitted_glb,
        texture_path=args.texture_path,
        garment_object_name=args.garment_object_name,
        uv_rotation_degrees=args.uv_rotation,
        output_path=args.output
    )