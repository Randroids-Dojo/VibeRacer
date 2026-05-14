"""
Headless Blender slicer that turns a Kenney Car Kit GLB into a destructible
derby vehicle GLB matching the loader's named-submesh contract:

    body, hood, trunk, door_l, door_r,
    headlight_l, headlight_r, taillight_l, taillight_r,
    wheel_fl, wheel_fr, wheel_rl, wheel_rr

Strategy:
- Import the Kenney source GLB. The pack consistently names the chassis
  `body` and the wheels `wheel-front-left` / `wheel-back-right` etc.
- Compute the body's local bounding box on import to drive parametric
  plane cuts (hood at the front, trunk at the rear).
- Slice the body using bmesh.ops.bisect_plane with `clear_outer` to keep
  only the piece on the desired side, plus `fill=True` so the cut leaves
  a closed solid we can re-color as a "damaged interior" surface. Run
  the slicer twice on a duplicated body: once to extract the hood (front
  cap), once to extract the trunk (rear cap), then once more on the
  chassis-only remainder to trim those regions off the original.
- Reuse pre-separated parts when present. The ambulance ships with
  door-left / door-right; we just rename them. Otherwise we cut left and
  right "door slabs" off the body's side regions.
- Add named light boxes (small emissive cubes) at the front and rear
  poles of the body bbox so the visualizer can break them on damage.
- Rename Kenney's `wheel-front-left` etc to `wheel_fl` (and friends) so
  assertVehicleContract finds them.

Run via:
    blender --background --python tools/blender/slice_kenney_vehicle.py -- \\
        --source /tmp/kenney-car-kit/Models/GLB\\ format/sedan.glb \\
        --variant sedan \\
        --out public/models/derby/car.glb
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
# Variant config
# ---------------------------------------------------------------------------

@dataclass
class SliceVariant:
    name: str
    # Fraction of the body's length-axis extent to dedicate to the hood
    # (front cap) and trunk (rear cap). Tuned per-vehicle so a long hood
    # (sedan, truck) or short hood (van, ambulance) reads correctly.
    hood_frac: float
    trunk_frac: float
    # Half-thickness of the door slabs that get cut off the body sides.
    # Set to 0 for vehicles whose Kenney source already exposes door-left /
    # door-right as separate Nodes (ambulance).
    door_slab_inset: float
    door_slab_len_frac: float  # along the forward axis
    door_slab_height_frac: float  # along the vertical axis
    # Uniform scale applied on import so the Kenney toy-scale meshes (sub-1m)
    # come out at real-world car size. Tuned per variant: a "racecar" reads
    # smaller than a "truck" in the same arena.
    import_scale: float = 2.5
    # Whether the source GLB already has door-left / door-right nodes.
    has_source_doors: bool = False
    # Color tint for the "interior" of cut surfaces. Reads as "damaged"
    # when a panel detaches.
    interior_color: tuple[float, float, float] = (0.04, 0.04, 0.05)


VARIANTS: dict[str, SliceVariant] = {
    "sedan": SliceVariant(
        name="sedan",
        hood_frac=0.28,
        trunk_frac=0.24,
        door_slab_inset=0.03,
        door_slab_len_frac=0.38,
        door_slab_height_frac=0.45,
        import_scale=3.0,
    ),
    "ambulance": SliceVariant(
        name="ambulance",
        hood_frac=0.20,
        trunk_frac=0.18,
        door_slab_inset=0.0,
        door_slab_len_frac=0.0,
        door_slab_height_frac=0.0,
        has_source_doors=True,
        import_scale=3.2,
    ),
    "truck": SliceVariant(
        name="truck",
        hood_frac=0.32,
        trunk_frac=0.20,
        door_slab_inset=0.03,
        door_slab_len_frac=0.34,
        door_slab_height_frac=0.42,
        import_scale=3.4,
    ),
    "race": SliceVariant(
        name="race",
        hood_frac=0.32,
        trunk_frac=0.26,
        door_slab_inset=0.02,
        door_slab_len_frac=0.30,
        door_slab_height_frac=0.30,
        import_scale=3.5,
    ),
}


# ---------------------------------------------------------------------------
# Scene helpers
# ---------------------------------------------------------------------------

def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for col in (bpy.data.meshes, bpy.data.materials, bpy.data.lights):
        for block in list(col):
            col.remove(block)


def import_kenney(path: str, scale: float = 1.0) -> None:
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(path))

    # Kenney vehicles orient their length along Blender +X after the glTF
    # import (their +X is forward). The derby loader expects the exported
    # GLB to have its forward axis along glTF -Z, which is Blender +Y after
    # re-import. Rotate the whole scene by -90 degrees around Z so the
    # longer horizontal axis becomes Blender +Y.
    body = bpy.data.objects.get("body")
    if body is not None:
        mn, mx = world_bbox(body)
        x_extent = mx.x - mn.x
        y_extent = mx.y - mn.y
        if x_extent > y_extent:
            import math
            # +90 around Z (CCW from above): Kenney's +X (front) becomes
            # Blender +Y. After the glTF Y-up export that maps to glTF -Z,
            # which is what the runtime loader expects as model-forward.
            for obj in bpy.context.scene.objects:
                if obj.parent is not None:
                    continue
                obj.rotation_euler.z = math.radians(90)
            bpy.ops.object.select_all(action="SELECT")
            bpy.ops.object.transform_apply(rotation=True, location=False, scale=False)

    if abs(scale - 1.0) >= 1e-6:
        # Scale BOTH the node's location and its mesh data by the same
        # factor. Without scaling location, the wheel nodes stay at
        # Kenney's source positions (±0.3, ±0.66) while the body mesh
        # grows ~3x, leaving the wheels bunched at the body's center.
        # We update location manually then apply scale (location=False
        # in apply because we already moved the nodes to their scaled
        # spot in object space).
        for obj in bpy.context.scene.objects:
            if obj.parent is not None:
                continue
            obj.location = obj.location * scale
            obj.scale = Vector((scale, scale, scale))
        bpy.ops.object.select_all(action="SELECT")
        bpy.ops.object.transform_apply(scale=True, location=False, rotation=False)


def find_object(name: str) -> bpy.types.Object | None:
    return bpy.data.objects.get(name)


def make_pbr(
    name: str,
    color: tuple[float, float, float],
    roughness: float = 0.55,
    metallic: float = 0.0,
    emissive: tuple[float, float, float] | None = None,
    emissive_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emissive is not None:
        bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emissive_strength
    return mat


# ---------------------------------------------------------------------------
# Mesh helpers
# ---------------------------------------------------------------------------

def world_bbox(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    """World-space axis-aligned bounding box."""
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    mx = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    return mn, mx


def duplicate(obj: bpy.types.Object, new_name: str) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.duplicate()
    dup = bpy.context.active_object
    dup.name = new_name
    return dup


def bisect_in_place(
    obj: bpy.types.Object,
    plane_co: Vector,
    plane_no: Vector,
    clear_outer: bool,
    clear_inner: bool,
) -> None:
    """Bisect the active mesh along a plane. clear_outer/clear_inner control
    which side of the cut is removed. Caps the cut so the piece stays a
    closed solid (fill=True). Coordinates are object-local."""
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    # Convert world-space plane into object-local space.
    local_co = obj.matrix_world.inverted() @ plane_co
    local_no = (obj.matrix_world.inverted().to_3x3() @ plane_no).normalized()
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(obj.data)
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    cut = bmesh.ops.bisect_plane(
        bm,
        geom=geom,
        plane_co=local_co,
        plane_no=local_no,
        clear_outer=clear_outer,
        clear_inner=clear_inner,
        use_snap_center=False,
    )
    # Fill the resulting hole with a planar n-gon so the piece stays a
    # closed solid.
    cut_edges = [
        item
        for item in cut.get("geom_cut", [])
        if isinstance(item, bmesh.types.BMEdge) and item.is_valid
    ]
    if cut_edges:
        bmesh.ops.holes_fill(bm, edges=cut_edges)
    bmesh.update_edit_mesh(obj.data)
    bpy.ops.object.mode_set(mode="OBJECT")


def add_interior_material_to_caps(
    obj: bpy.types.Object,
    interior_mat: bpy.types.Material,
    cap_axis: Vector,
) -> None:
    """Assign `interior_mat` to faces whose normal mostly faces along
    cap_axis. After a bisect we know the cap is roughly perpendicular to
    plane_no; we tag any face whose normal aligns with the cap axis as the
    interior face and recolor it."""
    if not obj.data.materials:
        obj.data.materials.append(interior_mat)
        cap_slot = 0
    else:
        obj.data.materials.append(interior_mat)
        cap_slot = len(obj.data.materials) - 1
    axis = cap_axis.normalized()
    for poly in obj.data.polygons:
        n = poly.normal
        if abs(n.x * axis.x + n.y * axis.y + n.z * axis.z) > 0.85:
            poly.material_index = cap_slot


# ---------------------------------------------------------------------------
# Vehicle-specific slicing
# ---------------------------------------------------------------------------

def detect_axes(body: bpy.types.Object) -> dict[str, str]:
    """Post-import-rotation, every vehicle has its length along Blender +Y
    (which the glTF exporter writes as -Z forward, matching the runtime
    loader's local-forward convention). Up is +Z."""
    return {"forward": "y", "side": "x", "up": "z"}


def axis_vec(name: str) -> Vector:
    return {"x": Vector((1, 0, 0)), "y": Vector((0, 1, 0)), "z": Vector((0, 0, 1))}[name]


def slice_body_into_parts(
    body: bpy.types.Object,
    variant: SliceVariant,
    interior_mat: bpy.types.Material,
) -> dict[str, bpy.types.Object]:
    """Cut hood (front cap) and trunk (rear cap) off the body. Returns a
    dict with keys 'body', 'hood', 'trunk' and (when applicable) door_l /
    door_r. The body entry is the original mutated to be the chassis-only
    remainder."""
    axes = detect_axes(body)
    fwd = axis_vec(axes["forward"])
    side = axis_vec(axes["side"])
    mn, mx = world_bbox(body)
    fwd_min = mn[("x", "y", "z").index(axes["forward"])]
    fwd_max = mx[("x", "y", "z").index(axes["forward"])]
    length = fwd_max - fwd_min

    # After import_kenney's +90 around Z rotation, every Kenney vehicle has
    # its front at Blender +Y (the higher end on the forward axis). That
    # maps to glTF -Z after the Y-up export, which is what the runtime
    # loader expects as model-local forward.
    front_at_min = False
    if front_at_min:
        hood_plane = fwd_min + variant.hood_frac * length
        trunk_plane = fwd_max - variant.trunk_frac * length
        hood_normal = fwd  # cut keeps the side towards -fwd (the front)
        trunk_normal = -fwd
    else:
        hood_plane = fwd_max - variant.hood_frac * length
        trunk_plane = fwd_min + variant.trunk_frac * length
        hood_normal = -fwd
        trunk_normal = fwd

    # Duplicate the body twice to extract hood and trunk solids. Then cut
    # those regions OFF the original body so the chassis has the right
    # geometry (a literal hole on the cut face).
    hood = duplicate(body, "hood")
    # Hood = keep the half on the -fwd side of hood_plane.
    plane_co = mn.copy()
    plane_co[("x", "y", "z").index(axes["forward"])] = hood_plane
    bisect_in_place(hood, plane_co, hood_normal, clear_outer=True, clear_inner=False)
    add_interior_material_to_caps(hood, interior_mat, hood_normal)

    trunk = duplicate(body, "trunk")
    plane_co_trunk = mx.copy()
    plane_co_trunk[("x", "y", "z").index(axes["forward"])] = trunk_plane
    bisect_in_place(trunk, plane_co_trunk, trunk_normal, clear_outer=True, clear_inner=False)
    add_interior_material_to_caps(trunk, interior_mat, trunk_normal)

    # Now trim the original body: remove the hood and trunk slabs from it.
    bisect_in_place(body, plane_co, -hood_normal, clear_outer=True, clear_inner=False)
    add_interior_material_to_caps(body, interior_mat, -hood_normal)
    bisect_in_place(body, plane_co_trunk, -trunk_normal, clear_outer=True, clear_inner=False)
    add_interior_material_to_caps(body, interior_mat, -trunk_normal)

    out: dict[str, bpy.types.Object] = {"body": body, "hood": hood, "trunk": trunk}

    # Door panels: only emitted when the source GLB ships door-left and
    # door-right nodes (ambulance). For shell-bodied variants (sedan,
    # truck, race) we skip doors entirely: overlay boxes look like blocky
    # protrusions on the shell, and bisecting the shell for a door slab
    # tends to leave empty meshes. The runtime contract treats doors as
    # optional and the damage visualizer falls back to hood / trunk
    # detach for these variants.
    return out


def build_door_slabs(
    body: bpy.types.Object,
    variant: SliceVariant,
    side: Vector,
    axes: dict[str, str],
    fwd_min: float,
    length: float,
    interior_mat: bpy.types.Material,
) -> tuple[bpy.types.Object, bpy.types.Object]:
    """Build "door" panel boxes embedded INSIDE the body shell so they sit
    flush at the body's outer surface and are occluded by the body until
    they detach. Truly slicing a door piece out of Kenney's shell bodies
    risks leaving zero-vertex meshes (the shell is thin so multi-axis
    bisect can over-eat); embedded overlays are reliable. When a panel
    detaches at runtime the body shell stays put and the door flies out
    as free-standing debris, so the visual reads as "a chunk popped off
    that side of the car" rather than "a thin flag detached from outside
    the car". The Kenney source for ambulance ships doors as separate
    Nodes and the rename_source_doors path uses those directly. This
    overlay code is only the fallback for variants that do not."""
    mn, mx = world_bbox(body)
    side_idx = ("x", "y", "z").index(axes["side"])
    fwd_idx = ("x", "y", "z").index(axes["forward"])
    up_idx = ("x", "y", "z").index("z")
    width = mx[side_idx] - mn[side_idx]
    height = mx[up_idx] - mn[up_idx]
    door_height = max(0.4, height * 0.45)
    door_z = mn[up_idx] + height * 0.30
    door_len = max(0.6, length * 0.42)
    door_fwd_center = fwd_min + length * 0.50
    # Thick enough to read as a real door slab once detached; we tuck it
    # entirely INSIDE the body shell on the side axis so the outer face is
    # roughly coplanar with the body's exterior. The body shell occludes
    # the door panel while it is still attached.
    door_thickness = max(0.18, width * 0.12)

    def make_door(name: str, side_sign: int) -> bpy.types.Object:
        loc = [0.0, 0.0, 0.0]
        # Center the door so its OUTER face sits ~1mm inside the body's
        # edge (width/2). Subtracting door_thickness/2 puts the outer face
        # exactly at width/2; pull in a tiny bit more so micro float
        # variance never lets the panel pop through the body.
        loc[side_idx] = side_sign * (width / 2 - door_thickness / 2 - 0.005)
        loc[fwd_idx] = door_fwd_center
        loc[up_idx] = door_z + door_height / 2
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=tuple(loc))
        obj = bpy.context.active_object
        obj.name = name
        scale = [0.0, 0.0, 0.0]
        scale[side_idx] = door_thickness
        scale[fwd_idx] = door_len
        scale[up_idx] = door_height
        obj.scale = Vector(scale)
        bpy.ops.object.transform_apply(scale=True, location=False, rotation=False)
        # Reuse the body's first material so the door's paint matches once
        # it detaches and becomes visible debris. The runtime tintBody
        # pass also recolors it per derby slot.
        if body.data.materials:
            obj.data.materials.append(body.data.materials[0])
        return obj

    door_l = make_door("door_l", -1)
    door_r = make_door("door_r", +1)
    return door_l, door_r


def rename_wheels() -> None:
    """Kenney uses wheel-front-left etc; the loader contract uses
    wheel_fl etc. Rename objects in place."""
    mapping = {
        "wheel-front-left": "wheel_fl",
        "wheel-front-right": "wheel_fr",
        "wheel-back-left": "wheel_rl",
        "wheel-back-right": "wheel_rr",
        # The SUV pack has an extra `wheel-back` we just leave alone.
    }
    for old, new in mapping.items():
        obj = bpy.data.objects.get(old)
        if obj:
            obj.name = new


def rename_source_doors() -> None:
    """Some Kenney models pre-expose door-left / door-right. Rename them
    to match the loader contract."""
    mapping = {"door-left": "door_l", "door-right": "door_r"}
    for old, new in mapping.items():
        obj = bpy.data.objects.get(old)
        if obj:
            obj.name = new


def add_lights(body: bpy.types.Object, variant: SliceVariant) -> list[bpy.types.Object]:
    """Add 4 small named emissive cubes at front / rear of the car.

    Positions are derived from the WHEEL positions, not the body bbox.
    After slicing, the body's bound_box reads inflated on some variants
    (sedan: ~4m × ~4m × ~3.7m) and produces lamp positions that float far
    outside the actual car silhouette, which blows up the model-viewer
    camera framing and hides the wheels. Wheels keep their authored
    positions through the pipeline and are reliable anchors.
    """
    head_mat = make_pbr(
        "derbyHeadlight",
        color=(1.0, 0.96, 0.78),
        roughness=0.25,
        emissive=(1.0, 0.96, 0.78),
        emissive_strength=2.5,
    )
    tail_mat = make_pbr(
        "derbyTaillight",
        color=(1.0, 0.18, 0.18),
        roughness=0.30,
        emissive=(1.0, 0.10, 0.10),
        emissive_strength=1.8,
    )
    axes = detect_axes(body)
    fwd_axis = axes["forward"]
    side_axis = axes["side"]
    fwd_idx = ("x", "y", "z").index(fwd_axis)
    side_idx = ("x", "y", "z").index(side_axis)
    up_idx = 2

    # Pull the four wheel positions to anchor lamp placement.
    wheel_objs = [
        bpy.data.objects.get(f"wheel_{w}") for w in ("fl", "fr", "rl", "rr")
    ]
    wheel_positions = [
        w.matrix_world.translation for w in wheel_objs if w is not None
    ]
    if not wheel_positions:
        # Fallback to the body bbox; should never hit because rename_wheels
        # runs before us, but keep the path safe.
        mn, mx = world_bbox(body)
        wheel_fwd_min = mn[fwd_idx]
        wheel_fwd_max = mx[fwd_idx]
        wheel_side_max = (mx[side_idx] - mn[side_idx]) * 0.5
        wheel_up = mn[up_idx] + (mx[up_idx] - mn[up_idx]) * 0.35
    else:
        wheel_fwd_max = max(p[fwd_idx] for p in wheel_positions)
        wheel_fwd_min = min(p[fwd_idx] for p in wheel_positions)
        wheel_side_max = max(abs(p[side_idx]) for p in wheel_positions)
        wheel_up = max(p[up_idx] for p in wheel_positions)

    # Lamp face sized in absolute units (works regardless of import_scale
    # because the wheel reference itself absorbs the scale).
    size_long = 0.06
    size_side = 0.22
    size_up = 0.12
    # Lamps sit at ~70% of the wheel-side extent so they read as a
    # headlight pair and don't bleed onto the wheel wells.
    side_offset = wheel_side_max * 0.7
    # Lamps mounted at the body-belt height: above the wheel centers by
    # a bit so they hit the chassis face, not the wheel arch.
    light_z = wheel_up + 0.30
    # Place the lamp just past the outermost wheel along the forward
    # axis. This puts them at roughly the front / rear bumper line, which
    # is where Kenney's painted lamps land on the source body.
    front_pos = wheel_fwd_max + 0.55
    rear_pos = wheel_fwd_min - 0.55

    def place(name: str, mat: bpy.types.Material, fwd_v: float, side_sign: int) -> bpy.types.Object:
        loc = [0.0, 0.0, 0.0]
        loc[fwd_idx] = fwd_v
        loc[side_idx] = side_sign * side_offset
        loc[up_idx] = light_z
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=tuple(loc))
        obj = bpy.context.active_object
        obj.name = name
        scale = [0.0, 0.0, 0.0]
        scale[fwd_idx] = size_long
        scale[side_idx] = size_side
        scale[up_idx] = size_up
        obj.scale = Vector(scale)
        bpy.ops.object.transform_apply(scale=True, location=False, rotation=False)
        if obj.data.materials:
            obj.data.materials[0] = mat
        else:
            obj.data.materials.append(mat)
        return obj

    return [
        place("headlight_l", head_mat, front_pos, -1),
        place("headlight_r", head_mat, front_pos, +1),
        place("taillight_l", tail_mat, rear_pos, -1),
        place("taillight_r", tail_mat, rear_pos, +1),
    ]


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def export_glb(out_path: str, variant_name: str) -> None:
    out_path = os.path.abspath(out_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    # Parent everything under one root empty so the GLB scene is tidy.
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    root = bpy.context.active_object
    root.name = f"derbyVehicle_{variant_name}"
    for obj in bpy.data.objects:
        if obj is root or obj.parent is not None:
            continue
        obj.parent = root
        obj.matrix_parent_inverse = root.matrix_world.inverted()

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
    )
    size = os.path.getsize(out_path)
    print(f"[slice] wrote {out_path} ({size} bytes)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args(argv: list[str]) -> argparse.Namespace:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True, help="Kenney source GLB path")
    p.add_argument("--variant", required=True, choices=sorted(VARIANTS.keys()))
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


def main() -> None:
    args = parse_args(sys.argv)
    variant = VARIANTS[args.variant]
    clear_scene()
    import_kenney(args.source, variant.import_scale)

    body = find_object("body")
    if body is None:
        raise RuntimeError(f"Kenney source {args.source} did not export a 'body' node")

    interior_mat = make_pbr(
        "derbyInterior",
        color=variant.interior_color,
        roughness=0.75,
        metallic=0.20,
    )

    # 1. Reuse pre-separated doors if present, otherwise carve them.
    rename_source_doors()

    # 2. Slice hood / trunk (and doors when not source-provided).
    slice_body_into_parts(body, variant, interior_mat)

    # 3. Wheels: rename Kenney's wheel-front-left etc.
    rename_wheels()

    # 4. Lights.
    add_lights(body, variant)

    # 5. Strip any leftover Kenney objects that are not in the contract
    # (spoilers, grills, debris bits) for v1. Future polish: keep them and
    # add them to REQUIRED_SUBMESHES as optional extras.
    keep_names = {
        "body", "hood", "trunk", "door_l", "door_r",
        "headlight_l", "headlight_r", "taillight_l", "taillight_r",
        "wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr",
    }
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" and obj.name not in keep_names:
            bpy.data.objects.remove(obj, do_unlink=True)

    export_glb(args.out, variant.name)


if __name__ == "__main__":
    main()
