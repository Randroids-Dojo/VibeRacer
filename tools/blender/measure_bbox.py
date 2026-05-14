"""Print the body bounding box for a derby vehicle GLB."""
import argparse
import os
import sys
import bpy


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def parse_args(argv):
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument("--glb", required=True)
    return p.parse_args(argv)


def main():
    args = parse_args(sys.argv)
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(args.glb))
    body = bpy.data.objects.get("body")
    if not body:
        print("no body")
        return
    corners = [body.matrix_world @ c for c in (
        # bound_box returns 8 corners; we need a Vector wrapping
        __import__("mathutils").Vector(c) for c in body.bound_box
    )]
    mn_x = min(c.x for c in corners); mx_x = max(c.x for c in corners)
    mn_y = min(c.y for c in corners); mx_y = max(c.y for c in corners)
    mn_z = min(c.z for c in corners); mx_z = max(c.z for c in corners)
    w = mx_x - mn_x
    d = mx_y - mn_y
    h = mx_z - mn_z
    print(f"BBOX {os.path.basename(args.glb)} w={w:.3f} d={d:.3f} h={h:.3f}")


if __name__ == "__main__":
    main()
