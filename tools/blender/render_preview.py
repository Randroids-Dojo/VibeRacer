"""
Headless render of a derby vehicle GLB to a PNG so we can sanity-check the
build output without spinning up Three.js.

Run via:
    blender --background --python tools/blender/render_preview.py \
        -- --glb public/models/derby/car.glb --out tools/blender/previews/sedan.png
"""

from __future__ import annotations
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.lights):
        bpy.data.lights.remove(block)


def add_studio_lighting() -> None:
    # Sky light using world background.
    world = bpy.context.scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg is not None:
        bg.inputs["Color"].default_value = (0.62, 0.68, 0.78, 1.0)
        bg.inputs["Strength"].default_value = 0.9

    # Key (sun) light.
    bpy.ops.object.light_add(type="SUN", location=(6, 10, 6))
    sun = bpy.context.active_object
    sun.rotation_euler = (math.radians(-50), math.radians(35), math.radians(-15))
    sun.data.energy = 4.0
    sun.data.angle = math.radians(2.5)

    # Fill light from the opposite side.
    bpy.ops.object.light_add(type="AREA", location=(-5, 4, -4))
    fill = bpy.context.active_object
    fill.data.energy = 90
    fill.data.size = 6
    fill.rotation_euler = (math.radians(-60), 0, math.radians(180))

    # Rim light from behind to define the silhouette.
    bpy.ops.object.light_add(type="AREA", location=(0, 6, -8))
    rim = bpy.context.active_object
    rim.data.energy = 120
    rim.data.size = 4
    rim.rotation_euler = (math.radians(-25), 0, math.radians(180))


def add_ground() -> None:
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    plane = bpy.context.active_object
    plane.name = "ground"
    mat = bpy.data.materials.new("ground")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.18, 0.16, 0.14, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.85
    plane.data.materials.append(mat)


def add_camera(target: tuple[float, float, float] = (0, 0, 1.0)) -> None:
    # The model is built with +Z up, +Y forward (Blender native). For a
    # hero front-3/4 shot the camera sits in front of the car (+Y), off to
    # the right (+X), and slightly above the ground (+Z).
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=target)
    aim = bpy.context.active_object
    aim.name = "cam_target"

    bpy.ops.object.camera_add(location=(6.5, 7.5, 2.8))
    cam = bpy.context.active_object
    cam.data.lens = 35
    constraint = cam.constraints.new(type="TRACK_TO")
    constraint.target = aim
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"
    bpy.context.scene.camera = cam


def configure_render(out_path: str, width: int = 1024, height: int = 768) -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = os.path.abspath(out_path)
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"


def parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument("--glb", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--width", type=int, default=1024)
    p.add_argument("--height", type=int, default=768)
    return p.parse_args(argv)


def main() -> None:
    args = parse_args(sys.argv)
    clear_scene()
    add_studio_lighting()
    add_ground()
    add_camera()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.glb))
    configure_render(args.out, args.width, args.height)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    bpy.ops.render.render(write_still=True)
    print(f"[render] wrote {os.path.abspath(args.out)}")


if __name__ == "__main__":
    main()
