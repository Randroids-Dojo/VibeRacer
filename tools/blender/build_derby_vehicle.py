"""
Headless Blender builder for the Derby vehicle GLBs.

Run via:
    blender --background --python tools/blender/build_derby_vehicle.py \
        -- --variant sedan --out public/models/derby/car.glb

Goals:
- One script per car, output one GLB per variant (sedan, schoolBus, bigTruck,
  racecar). The shipping derby loader expects the following named meshes on
  the top-level group: body, hood, trunk, door_l, door_r,
  headlight_l, headlight_r, taillight_l, taillight_r,
  wheel_fl, wheel_fr, wheel_rl, wheel_rr.
- Each part is a separate Object so derbyDamageVisuals.applyHit can detach
  it. Materials are kept distinct for paint vs. wheels vs. lights so the
  visualizer can tint the body without recoloring the wheels.

Coordinate convention (Blender native, +Z up):
- X = width (left -X / right +X)
- Y = length (front +Y / rear -Y).  Note: Blender's +Y is "forward".
- Z = height (up +Z)

The glTF exporter rotates this to glTF's +Y up, -Z forward, so the
exported model has its front at local -Z and right at local +X, which is
exactly what derbyVehicleLoader's named-submesh contract expects.

Author guidance: aim for low-poly Kenney-style readability:
- Beveled hard edges (2-4 segments).
- Single saturated paint color per body, darker glass strip.
- Black tires with light rims so the wheels read at distance.
"""

from __future__ import annotations
import argparse
import math
import os
import sys
from dataclasses import dataclass

import bpy
import bmesh
from mathutils import Vector


# ---------------------------------------------------------------------------
# Variants
# ---------------------------------------------------------------------------

@dataclass
class Variant:
    name: str
    # Overall body bounding box in metres (X = width, Y = height, Z = length).
    body_w: float
    body_h: float
    body_l: float
    # Cabin proportions relative to body.
    cabin_w: float  # 0..1
    cabin_h: float  # extra height above body top
    cabin_front_frac: float  # 0..1 along length (front of cabin)
    cabin_rear_frac: float  # 0..1 along length (rear of cabin)
    # Wheel radius and offset from body sides.
    wheel_radius: float
    wheel_width: float
    wheel_inset_x: float  # how far inboard from body side
    wheel_inset_z: float  # how far in from body ends
    # Paint color (linear RGB).
    paint: tuple[float, float, float]
    # Glass color.
    glass: tuple[float, float, float]
    # Roof slope at front and rear (0 = flat, 0.5 = strongly sloped).
    front_slope: float
    rear_slope: float


VARIANTS: dict[str, Variant] = {
    "sedan": Variant(
        name="sedan",
        body_w=1.85,
        body_h=0.85,
        body_l=4.20,
        cabin_w=0.92,
        cabin_h=0.55,
        cabin_front_frac=0.34,
        cabin_rear_frac=0.78,
        wheel_radius=0.36,
        wheel_width=0.26,
        wheel_inset_x=0.04,
        wheel_inset_z=0.65,
        paint=(0.92, 0.16, 0.20),
        glass=(0.05, 0.07, 0.10),
        front_slope=0.32,
        rear_slope=0.22,
    ),
    "schoolBus": Variant(
        name="schoolBus",
        body_w=2.40,
        body_h=2.35,
        body_l=7.80,
        cabin_w=0.98,
        cabin_h=0.05,
        cabin_front_frac=0.18,
        cabin_rear_frac=0.96,
        wheel_radius=0.55,
        wheel_width=0.32,
        wheel_inset_x=0.04,
        wheel_inset_z=0.85,
        paint=(0.96, 0.78, 0.10),
        glass=(0.07, 0.09, 0.11),
        front_slope=0.10,
        rear_slope=0.05,
    ),
    "bigTruck": Variant(
        name="bigTruck",
        body_w=2.30,
        body_h=1.50,
        body_l=5.40,
        cabin_w=0.96,
        cabin_h=0.95,
        cabin_front_frac=0.14,
        cabin_rear_frac=0.55,
        wheel_radius=0.55,
        wheel_width=0.36,
        wheel_inset_x=0.02,
        wheel_inset_z=0.95,
        paint=(0.20, 0.28, 0.85),
        glass=(0.06, 0.08, 0.10),
        front_slope=0.22,
        rear_slope=0.18,
    ),
    "racecar": Variant(
        name="racecar",
        body_w=1.95,
        body_h=0.70,
        body_l=4.55,
        cabin_w=0.78,
        cabin_h=0.40,
        cabin_front_frac=0.42,
        cabin_rear_frac=0.72,
        wheel_radius=0.38,
        wheel_width=0.34,
        wheel_inset_x=0.08,
        wheel_inset_z=0.62,
        paint=(0.95, 0.45, 0.05),
        glass=(0.05, 0.06, 0.08),
        front_slope=0.48,
        rear_slope=0.35,
    ),
}


# ---------------------------------------------------------------------------
# Scene / material helpers
# ---------------------------------------------------------------------------

def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in list(bpy.data.meshes):
        bpy.data.meshes.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)


def make_pbr(
    name: str,
    color: tuple[float, float, float],
    roughness: float = 0.55,
    metallic: float = 0.0,
    emissive: tuple[float, float, float] | None = None,
    emissive_strength: float = 0.0,
    transmission: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    if emissive is not None:
        bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emissive_strength
    return mat


def add_bevel(obj: bpy.types.Object, width: float = 0.04, segments: int = 3) -> None:
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(30)


def apply_modifiers(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    for mod in list(obj.modifiers):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def shade_smooth_with_autosmooth(obj: bpy.types.Object, angle_deg: float = 35.0) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.shade_smooth()
    # 4.x renamed auto-smooth. Apply via mesh attribute if available.
    if hasattr(obj.data, "use_auto_smooth"):
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(angle_deg)
    else:
        # Blender 4.1+ uses a Smooth by Angle modifier added by shade_auto_smooth.
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(angle_deg))
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Primitive helpers
# ---------------------------------------------------------------------------

def box(
    name: str,
    size: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    bevel: float = 0.04,
    bevel_segs: int = 3,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = Vector(size)
    bpy.ops.object.transform_apply(scale=True, location=False, rotation=False)
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)
    if bevel > 0:
        add_bevel(obj, bevel, bevel_segs)
    return obj


def cylinder(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    rotation: tuple[float, float, float],
    material: bpy.types.Material,
    vertices: int = 24,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
        vertices=vertices,
    )
    obj = bpy.context.active_object
    obj.name = name
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)
    return obj


# ---------------------------------------------------------------------------
# Vehicle build
# ---------------------------------------------------------------------------

def build_body(v: Variant, paint_mat: bpy.types.Material) -> bpy.types.Object:
    """Lower chassis box. Top is mostly flat; cabin sits on top as a separate piece.
    Width along X, length along Y (Blender's +Y forward), height along Z."""
    body = box(
        name="body",
        size=(v.body_w, v.body_l, v.body_h),
        location=(0.0, 0.0, v.body_h / 2 + v.wheel_radius * 0.55),
        material=paint_mat,
        bevel=0.06,
        bevel_segs=4,
    )
    return body


def build_cabin(v: Variant, paint_mat: bpy.types.Material, glass_mat: bpy.types.Material) -> bpy.types.Object:
    """Cabin sits on top of the body. Slanted front (+Y) and rear (-Y) via
    vertex moves on the top edge. Glass material is on the side and top
    faces so it reads as windows; body paint on the pillars / nose. We keep
    cabin separate from `body` so the visualizer's body paint swap does not
    over-tint the glass."""
    cabin_len = v.body_l * (v.cabin_rear_frac - v.cabin_front_frac)
    cabin_w = v.body_w * v.cabin_w
    cabin_h = v.cabin_h + 0.18
    cabin_center_y = v.body_l * ((v.cabin_front_frac + v.cabin_rear_frac) / 2 - 0.5)
    # Note: cabin_front_frac is measured from the back of the body, so the
    # cabin sits BEHIND the front. front_frac < rear_frac. The center along
    # Y here is computed from the back (-Y) going forward; we flip below.
    cabin_center_y = -cabin_center_y  # convert: front (cabin_front_frac=0.34) → +Y
    cabin_z = v.body_h + v.wheel_radius * 0.55 + cabin_h / 2

    bpy.ops.mesh.primitive_cube_add(size=1.0, location=(0.0, cabin_center_y, cabin_z))
    cabin = bpy.context.active_object
    cabin.name = "cabin"
    cabin.scale = Vector((cabin_w, cabin_len, cabin_h))
    bpy.ops.object.transform_apply(scale=True, location=False, rotation=False)

    # Slope the cabin front (+Y end) and rear (-Y end) by moving the top
    # verts inward. Vertex coords are in object-local space.
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(cabin.data)
    bm.verts.ensure_lookup_table()
    for vert in bm.verts:
        if vert.co.z > 0:  # top edge in local space
            if vert.co.y > 0:  # front (cabin local +Y)
                vert.co.y -= cabin_len * v.front_slope * 0.5
            else:  # rear (cabin local -Y)
                vert.co.y += cabin_len * v.rear_slope * 0.5
    bmesh.update_edit_mesh(cabin.data)
    bpy.ops.object.mode_set(mode="OBJECT")

    # Slots: 0 = paint (body color), 1 = glass.
    if not cabin.data.materials:
        cabin.data.materials.append(paint_mat)
        cabin.data.materials.append(glass_mat)
    else:
        cabin.data.materials[0] = paint_mat
        cabin.data.materials.append(glass_mat)

    # Glass on the sides (normal mostly +/-X) and top (normal mostly +Z).
    # Front and rear "pillars" stay paint so the windshield reads clearly.
    for poly in cabin.data.polygons:
        nx = poly.normal.x
        nz = poly.normal.z
        if abs(nx) > 0.7:
            poly.material_index = 1  # side glass
        elif nz > 0.7:
            poly.material_index = 1  # roof glass strip
        else:
            poly.material_index = 0

    add_bevel(cabin, 0.03, 3)
    return cabin


def build_panel_hood_trunk(
    v: Variant, paint_mat: bpy.types.Material
) -> tuple[bpy.types.Object, bpy.types.Object]:
    """Hood (front, +Y) and trunk (rear, -Y) are thin slabs flush with the
    body top. cabin_front_frac/rear_frac measure from the BACK of the
    body, so front_len is the portion between the cabin and the +Y end
    while rear_len sits between the cabin and the -Y end."""
    panel_h = 0.05
    body_top = v.body_h + v.wheel_radius * 0.55
    front_len = v.body_l * v.cabin_front_frac
    rear_len = v.body_l * (1.0 - v.cabin_rear_frac)
    panel_w = v.body_w * 0.92

    hood = box(
        name="hood",
        size=(panel_w, front_len * 0.9, panel_h),
        location=(
            0.0,
            v.body_l / 2 - (front_len * 0.9) / 2 - v.body_l * 0.02,
            body_top + panel_h / 2,
        ),
        material=paint_mat,
        bevel=0.02,
        bevel_segs=2,
    )

    trunk = box(
        name="trunk",
        size=(panel_w, rear_len * 0.9, panel_h),
        location=(
            0.0,
            -v.body_l / 2 + (rear_len * 0.9) / 2 + v.body_l * 0.02,
            body_top + panel_h / 2,
        ),
        material=paint_mat,
        bevel=0.02,
        bevel_segs=2,
    )
    return hood, trunk


def build_doors(v: Variant, paint_mat: bpy.types.Material) -> tuple[bpy.types.Object, bpy.types.Object]:
    """Door panels: thin slabs on each body side, centered between front and
    rear axles (the same Y range as the cabin)."""
    door_t = 0.06
    door_h = v.body_h * 0.7
    door_l = v.body_l * (v.cabin_rear_frac - v.cabin_front_frac) * 0.92
    door_z = v.body_h / 2 + v.wheel_radius * 0.55
    door_center_y = -v.body_l * ((v.cabin_front_frac + v.cabin_rear_frac) / 2 - 0.5)

    door_left = box(
        name="door_l",
        size=(door_t, door_l, door_h),
        location=(-(v.body_w / 2 + door_t / 2), door_center_y, door_z),
        material=paint_mat,
        bevel=0.015,
        bevel_segs=2,
    )
    door_right = box(
        name="door_r",
        size=(door_t, door_l, door_h),
        location=(v.body_w / 2 + door_t / 2, door_center_y, door_z),
        material=paint_mat,
        bevel=0.015,
        bevel_segs=2,
    )
    return door_left, door_right


def build_lights(v: Variant) -> list[bpy.types.Object]:
    head_mat = make_pbr(
        "headlight",
        color=(1.0, 0.96, 0.78),
        roughness=0.25,
        emissive=(1.0, 0.96, 0.78),
        emissive_strength=2.5,
    )
    tail_mat = make_pbr(
        "taillight",
        color=(1.0, 0.18, 0.18),
        roughness=0.30,
        emissive=(1.0, 0.10, 0.10),
        emissive_strength=1.8,
    )
    body_top = v.body_h + v.wheel_radius * 0.55
    light_z = body_top - v.body_h * 0.25
    side_x = v.body_w * 0.36
    front_y = v.body_l / 2 - 0.06
    rear_y = -v.body_l / 2 + 0.06
    size_w = v.body_w * 0.18
    size_l = 0.10
    size_h = 0.14

    objs = []
    for name, x, y, mat in [
        ("headlight_l", -side_x, front_y, head_mat),
        ("headlight_r", side_x, front_y, head_mat),
        ("taillight_l", -side_x, rear_y, tail_mat),
        ("taillight_r", side_x, rear_y, tail_mat),
    ]:
        obj = box(
            name=name,
            size=(size_w, size_l, size_h),
            location=(x, y, light_z),
            material=mat,
            bevel=0.012,
            bevel_segs=2,
        )
        objs.append(obj)
    return objs


def build_wheels(v: Variant) -> list[bpy.types.Object]:
    tire_mat = make_pbr("tire", color=(0.06, 0.06, 0.06), roughness=0.92, metallic=0.0)
    rim_mat = make_pbr("rim", color=(0.78, 0.80, 0.82), roughness=0.35, metallic=0.85)
    # Y sign: +1 = front, -1 = rear.
    wheel_offsets = [
        ("wheel_fl", -1, +1),
        ("wheel_fr", +1, +1),
        ("wheel_rl", -1, -1),
        ("wheel_rr", +1, -1),
    ]
    objs = []
    for name, sx, sy in wheel_offsets:
        x = sx * (v.body_w / 2 - v.wheel_inset_x)
        y = sy * (v.body_l / 2 - v.wheel_inset_z)
        # Tire: cylinder default axis is Z. Rotate around Y to lay it on its
        # side so its rotation axis points along X (the world width axis).
        tire = cylinder(
            name=name,
            radius=v.wheel_radius,
            depth=v.wheel_width,
            location=(x, y, v.wheel_radius),
            rotation=(0.0, math.pi / 2, 0.0),
            material=tire_mat,
            vertices=32,
        )
        rim = cylinder(
            name=f"{name}_rim",
            radius=v.wheel_radius * 0.62,
            depth=v.wheel_width * 1.02,
            location=(x, y, v.wheel_radius),
            rotation=(0.0, math.pi / 2, 0.0),
            material=rim_mat,
            vertices=20,
        )
        rim.parent = tire
        rim.matrix_parent_inverse = tire.matrix_world.inverted()
        objs.append(tire)
    return objs


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def export_glb(out_path: str) -> None:
    out_path = os.path.abspath(out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    # Select everything for export.
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        # Keep object hierarchy so each named submesh is its own Node.
        use_selection=True,
        export_apply=True,  # apply modifiers
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
    )
    size = os.path.getsize(out_path)
    print(f"[derby] wrote {out_path} ({size} bytes)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args(argv: list[str]) -> argparse.Namespace:
    # When Blender invokes with `--`, args after `--` are the script's.
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", required=True, choices=sorted(VARIANTS.keys()))
    parser.add_argument("--out", required=True)
    return parser.parse_args(argv)


def main() -> None:
    args = parse_args(sys.argv)
    variant = VARIANTS[args.variant]
    clear_scene()

    paint_mat = make_pbr(
        f"paint_{variant.name}",
        color=variant.paint,
        roughness=0.42,
        metallic=0.15,
    )
    glass_mat = make_pbr(
        f"glass_{variant.name}",
        color=variant.glass,
        roughness=0.10,
        metallic=0.0,
        transmission=0.55,
    )

    body = build_body(variant, paint_mat)
    cabin = build_cabin(variant, paint_mat, glass_mat)
    hood, trunk = build_panel_hood_trunk(variant, paint_mat)
    door_l, door_r = build_doors(variant, paint_mat)
    lights = build_lights(variant)
    wheels = build_wheels(variant)

    # Apply modifiers up front so the exporter writes clean geometry.
    for obj in [body, cabin, hood, trunk, door_l, door_r] + lights + wheels:
        if obj.modifiers:
            apply_modifiers(obj)
        shade_smooth_with_autosmooth(obj)

    # Parent everything under an empty so the GLB scene root is tidy.
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = f"derbyVehicle_{variant.name}"
    for obj in bpy.data.objects:
        if obj is root or obj.parent is not None:
            continue
        obj.parent = root
        obj.matrix_parent_inverse = root.matrix_world.inverted()

    export_glb(args.out)


if __name__ == "__main__":
    main()
