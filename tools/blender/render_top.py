"""Top-down ortho render to debug part layout."""

from __future__ import annotations
import argparse
import math
import os
import sys

import bpy


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.lights):
        bpy.data.lights.remove(block)


def add_top_camera() -> None:
    bpy.ops.object.camera_add(location=(0, 10, 0))
    cam = bpy.context.active_object
    cam.rotation_euler = (math.radians(-90), 0, 0)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 10
    bpy.context.scene.camera = cam


def add_lights() -> None:
    bpy.ops.object.light_add(type="SUN", location=(0, 5, 0))
    sun = bpy.context.active_object
    sun.data.energy = 4.0


def parse_args(argv):
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument("--glb", required=True)
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


def main():
    args = parse_args(sys.argv)
    clear_scene()
    add_lights()
    add_top_camera()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.glb))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = os.path.abspath(args.out)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
