"""Generate a small GLB kit for Block Party without modelling by hand.

Run after installing Blender:
  blender --background --python tools/blender/generate_block_party_kit.py -- --output public/assets/kit
"""
import bpy
import json
import math
import os
import sys


def output_dir():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return args[args.index("--output") + 1] if "--output" in args else "public/assets/kit"


OUT = os.path.abspath(output_dir())
os.makedirs(OUT, exist_ok=True)


def material(name, color, metallic=0.0, roughness=0.75, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, alpha)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if alpha < 1:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = 'DITHERED'
    return mat


WOOD = material("Wood", (0.48, 0.20, 0.07), roughness=0.88)
WOOD_LIGHT = material("Wood Light", (0.68, 0.34, 0.12), roughness=0.84)
WOOD_DARK = material("Wood Dark", (0.23, 0.09, 0.035), roughness=0.92)
BRICK = material("Brick", (0.67, 0.18, 0.10), roughness=0.92)
BRICK_LIGHT = material("Brick Light", (0.79, 0.29, 0.16), roughness=0.90)
BRICK_DARK = material("Brick Dark", (0.47, 0.09, 0.055), roughness=0.94)
STONE = material("Stone", (0.31, 0.35, 0.35), roughness=0.96)
STONE_LIGHT = material("Stone Light", (0.46, 0.49, 0.46), roughness=0.94)
STONE_DARK = material("Stone Dark", (0.19, 0.23, 0.24), roughness=0.98)
GLASS = material("Glass", (0.18, 0.78, 0.82), metallic=0.08, roughness=0.13, alpha=0.42)
MORTAR = material("Mortar", (0.75, 0.62, 0.49), roughness=0.95)
METAL = material("Metal", (0.10, 0.15, 0.18), metallic=0.78, roughness=0.34)
CORAL = material("Coral", (0.85, 0.11, 0.06), metallic=0.05, roughness=0.58)
TEAL = material("Teal", (0.08, 0.62, 0.58), metallic=0.15, roughness=0.42)
GLOW = material("Glow", (0.60, 1.0, 0.84), metallic=0.1, roughness=0.18)
WARNING = material("Warning", (1.0, 0.68, 0.12), metallic=0.05, roughness=0.55)
SKIN = material("Skin", (0.92, 0.56, 0.34), roughness=0.72)
SKIN_LIGHT = material("Skin Light", (1.0, 0.68, 0.43), roughness=0.7)
HAIR = material("Hair", (0.10, 0.055, 0.035), roughness=0.9)
HELMET = material("Helmet", (0.92, 0.68, 0.25), roughness=0.58)
PANTS = material("Pants", (0.11, 0.16, 0.19), roughness=0.84)
BOOT = material("Boot", (0.075, 0.055, 0.045), roughness=0.9)
SHIRT = material("Shirt", (0.78, 0.74, 0.62), roughness=0.86)
WHITE = material("Eye White", (0.96, 0.96, 0.91), roughness=0.5)


def link(obj, root):
    obj.parent = root
    return obj


def cube(name, root, location, size, mat, bevel=0.03):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new("Soft edges", 'BEVEL')
        mod.width, mod.segments = bevel, 2
    return link(obj, root)


def cylinder(name, root, location, radius, depth, mat, axis="y"):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    if axis == "y": obj.rotation_euler.x = math.pi / 2
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Soft edges", 'BEVEL')
    bevel.width, bevel.segments = 0.025, 2
    return link(obj, root)


def stone(name, root, location, scale, mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    return link(obj, root)


def sphere(name, root_obj, location, scale, mat, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    obj.data.materials.append(mat)
    return link(obj, root_obj)


def pivot(name, parent, location):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return link(obj, parent)


def root(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    # Assets are authored Y-up to match the game; rotate once for Blender's Z-up export.
    obj.rotation_euler.x = math.pi / 2
    obj["block_party_asset"] = name
    return obj


def wood_block():
    r = root("BP_WoodBlock")
    cube("wood_core", r, (0, 0.75, 0), (1.4, 1.5, 1.4), WOOD_DARK, .06)
    for row in range(5):
        cube("wood_plank", r, (0, .17 + row * .29, .706), (1.30, .245, .055), WOOD_LIGHT if row % 3 == 1 else WOOD, .035)
    brace = cube("wood_brace", r, (0, .75, .75), (.16, 1.28, .075), WOOD_DARK, .025)
    brace.rotation_euler.z = -.58
    for x in (-.52, .52):
        cylinder("wood_bolt", r, (x, .75, .715), .055, .04, METAL, axis="z")
    return r, (1.4, 1.5, 1.4), "wood"


def brick_block():
    r = root("BP_BrickBlock")
    cube("brick_mortar", r, (0, 0.75, 0), (1.4, 1.5, 1.4), MORTAR, .045)
    brick_mats = (BRICK, BRICK_LIGHT, BRICK_DARK)
    for row in range(4):
        count, width = (3, .42) if row % 2 == 0 else (4, .30)
        for column in range(count):
            x = (column - (count - 1) / 2) * (width + .035)
            cube("brick_face", r, (x, .205 + row * .375, .72), (width, .315, .075), brick_mats[(row + column) % 3], .025)
    return r, (1.4, 1.5, 1.4), "brick"


def stone_block():
    r = root("BP_StoneBlock")
    cube("stone_mortar", r, (0, 0.75, 0), (1.4, 1.5, 1.4), STONE_DARK, .07)
    stones = ((-.43,.25,.34,.22),(.02,.22,.30,.19),(.44,.27,.26,.23),(-.50,.72,.25,.28),(-.10,.68,.34,.24),(.40,.72,.29,.25),(-.42,1.18,.31,.22),(.05,1.18,.32,.27),(.47,1.20,.24,.20))
    stone_mats = (STONE, STONE_LIGHT, STONE_DARK)
    for index, (x, y, sx, sy) in enumerate(stones):
        rock = stone("stone_face", r, (x, y, .73), (sx, sy, .09), stone_mats[index % 3])
        rock.rotation_euler.z = (index % 3 - 1) * .14
    return r, (1.4, 1.5, 1.4), "stone"


def glass_block():
    r = root("BP_GlassBlock")
    cube("glass_panel", r, (0, 0.75, 0), (1.4, 1.5, .08), GLASS, .01)
    for x in (-.68, .68): cube("glass_frame", r, (x, .75, 0), (.07, 1.58, .13), METAL, .01)
    for y in (.02, 1.48): cube("glass_frame", r, (0, y, 0), (1.47, .07, .13), METAL, .01)
    cube("glass_crossbar", r, (0, .75, 0), (1.32, .045, .11), METAL, .01)
    glint = cube("glass_glint", r, (-.20, .82, .075), (.055, 1.05, .018), GLOW, .005)
    glint.rotation_euler.z = -.32
    return r, (1.4, 1.5, .13), "glass"


def fuel_barrel():
    r = root("BP_FuelBarrel")
    cylinder("barrel_body", r, (0, .55, 0), .34, 1.1, CORAL)
    for y in (.24, .86): cylinder("barrel_ring", r, (0, y, 0), .355, .06, METAL)
    cylinder("barrel_cap", r, (.12, 1.13, 0), .075, .08, METAL)
    warning = cube("warning_plate", r, (0, .55, .345), (.31, .31, .025), WARNING, .025)
    warning.rotation_euler.z = math.pi / 4
    cube("warning_mark", r, (0, .55, .362), (.055, .20, .018), METAL, .008)
    return r, (.72, 1.18, .72), "fuelBarrel"


def bounce_pad():
    r = root("BP_BouncePad")
    cube("pad_base", r, (0, .12, 0), (1.45, .24, .95), METAL, .08)
    cube("pad_glow", r, (0, .27, 0), (1.20, .07, .70), TEAL, .05)
    for x in (-.48, 0, .48):
        chevron = cube("pad_chevron", r, (x, .33, 0), (.24, .035, .45), GLOW, .01)
        chevron.rotation_euler.y = .62
    for x in (-.66, .66): cube("pad_warning", r, (x, .20, .43), (.08, .20, .08), WARNING, .018)
    return r, (1.45, .34, .95), "bouncePad"


def resident_asset(team):
    """Build a lightweight articulated character; named pivots are animated in Three.js."""
    team_name = "Coral" if team == 0 else "Teal"
    jacket = CORAL if team == 0 else TEAL
    r = root(f"BP_Resident{team_name}")
    rig = pivot("CharacterRig", r, (0, 0, 0))
    hips = pivot("Hips", rig, (0, -.10, 0))

    # Chunky silhouette remains readable from the shared-screen camera.
    sphere("Torso", hips, (0, .30, 0), (.36, .43, .25), jacket)
    cube("Shirt", hips, (0, .34, .245), (.28, .28, .035), SHIRT, .035)
    cube("JacketZip", hips, (0, .31, .278), (.035, .55, .025), METAL, .012)
    cube("Belt", hips, (0, -.04, .02), (.62, .10, .43), BOOT, .035)
    for x in (-.20, .20):
        cube("BeltPouch", hips, (x, -.08, .245), (.18, .19, .10), WOOD_DARK, .035)
    cube("Backpack", hips, (0, .31, -.25), (.46, .49, .16), WOOD_DARK, .07)

    head = pivot("Head", hips, (0, .78, 0))
    sphere("HeadMesh", head, (0, 0, .015), (.30, .33, .27), SKIN_LIGHT)
    sphere("Hair", head, (0, .15, -.015), (.285, .21, .265), HAIR)
    sphere("Helmet", head, (0, .25, 0), (.35, .18, .32), HELMET)
    cube("HelmetBrim", head, (0, .18, .17), (.72, .055, .40), HELMET, .025)
    cube("HelmetLamp", head, (0, .29, .30), (.16, .13, .08), WARNING, .025)
    for x in (-.105, .105):
        sphere("Eye", head, (x, .025, .256), (.075, .09, .035), WHITE, 16, 10)
        sphere("Pupil", head, (x, .018, .288), (.030, .042, .018), HAIR, 12, 8)
        brow = cube("Brow", head, (x, .115, .293), (.15, .035, .025), HAIR, .012)
        brow.rotation_euler.z = -.12 if x < 0 else .12
    sphere("Nose", head, (0, -.03, .286), (.055, .07, .055), SKIN)
    cube("Mouth", head, (0, -.13, .286), (.13, .028, .025), HAIR, .01)
    for x in (-.31, .31): sphere("Ear", head, (x, 0, 0), (.07, .105, .055), SKIN)

    for side, suffix in ((-1, "L"), (1, "R")):
        arm = pivot(f"Arm_{suffix}", hips, (side * .37, .54, 0))
        sphere(f"Sleeve_{suffix}", arm, (side * .025, -.17, 0), (.145, .24, .145), jacket)
        sphere(f"Glove_{suffix}", arm, (side * .035, -.40, .035), (.12, .14, .115), METAL)
        leg = pivot(f"Leg_{suffix}", hips, (side * .18, -.08, 0))
        sphere(f"Trouser_{suffix}", leg, (0, -.25, 0), (.17, .29, .18), PANTS)
        cube(f"Knee_{suffix}", leg, (0, -.34, .16), (.23, .16, .08), METAL, .04)
        cube(f"Boot_{suffix}", leg, (0, -.55, .075), (.28, .25, .42), BOOT, .065)
        cube(f"Sole_{suffix}", leg, (0, -.68, .095), (.31, .075, .46), STONE_DARK, .025)

    # Small shoulder badge gives the two team assets an unmistakable color read.
    badge = sphere("TeamBadge", hips, (-.31, .48, .22), (.075, .075, .035), WARNING, 16, 8)
    badge["team"] = team
    return r, (1.0, 1.65, .75), f"resident{team}"


def export(root_obj, name):
    bpy.ops.object.select_all(action='DESELECT')
    root_obj.select_set(True)
    for child in root_obj.children_recursive: child.select_set(True)
    bpy.context.view_layer.objects.active = root_obj
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{name}.glb"), export_format='GLB', use_selection=True, export_materials='EXPORT')


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
assets = [factory() for factory in (wood_block, brick_block, stone_block, glass_block, fuel_barrel, bounce_pad)]
assets.extend((resident_asset(0), resident_asset(1)))
manifest = []
for obj, size, kind in assets:
    export(obj, obj.name.lower())
    manifest.append({"file": f"{obj.name.lower()}.glb", "name": obj.name, "size": size, "kind": kind})
with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf8") as file:
    json.dump(manifest, file, indent=2)
print(f"Wrote {len(manifest)} GLB assets to {OUT}")
