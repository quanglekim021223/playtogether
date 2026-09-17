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


WOOD = material("Wood", (0.42, 0.16, 0.055), roughness=0.88)
BRICK = material("Brick", (0.58, 0.12, 0.07), roughness=0.93)
STONE = material("Stone", (0.27, 0.31, 0.32), roughness=0.96)
GLASS = material("Glass", (0.18, 0.78, 0.82), metallic=0.08, roughness=0.13, alpha=0.42)
MORTAR = material("Mortar", (0.75, 0.62, 0.49), roughness=0.95)
METAL = material("Metal", (0.10, 0.15, 0.18), metallic=0.78, roughness=0.34)
CORAL = material("Coral", (0.85, 0.11, 0.06), metallic=0.05, roughness=0.58)
TEAL = material("Teal", (0.08, 0.62, 0.58), metallic=0.15, roughness=0.42)


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


def root(name):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    # Assets are authored Y-up to match the game; rotate once for Blender's Z-up export.
    obj.rotation_euler.x = math.pi / 2
    obj["block_party_asset"] = name
    return obj


def wood_block():
    r = root("BP_WoodBlock")
    cube("wood_core", r, (0, 0.75, 0), (1.4, 1.5, 1.4), WOOD, .06)
    for x in (-.52, .52):
        cylinder("wood_bolt", r, (x, .75, .715), .055, .04, METAL, axis="z")
    return r, (1.4, 1.5, 1.4), "wood"


def brick_block():
    r = root("BP_BrickBlock")
    cube("brick_core", r, (0, 0.75, 0), (1.4, 1.5, 1.4), BRICK, .035)
    for y in (.23, .60, .98, 1.36): cube("mortar_row", r, (0, y, .706), (1.37, .032, .018), MORTAR, 0)
    for index, y in enumerate((.41, .79, 1.17)):
        offset = -.34 if index % 2 else 0
        for x in (-.34 + offset, .34 + offset): cube("mortar_joint", r, (x, y, .706), (.025, .34, .018), MORTAR, 0)
    return r, (1.4, 1.5, 1.4), "brick"


def stone_block():
    r = root("BP_StoneBlock")
    cube("stone_core", r, (0, 0.75, 0), (1.4, 1.5, 1.4), STONE, .08)
    for x, y, scale in ((-.42, .38, .18), (.35, .79, .13), (-.10, 1.23, .16), (.49, 1.33, .09)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=scale, location=(x, y, .72))
        chip = bpy.context.object
        chip.name = "stone_chip"
        chip.scale.z = .22
        chip.data.materials.append(MORTAR)
        link(chip, r)
    return r, (1.4, 1.5, 1.4), "stone"


def glass_block():
    r = root("BP_GlassBlock")
    cube("glass_panel", r, (0, 0.75, 0), (1.4, 1.5, .08), GLASS, .01)
    for x in (-.68, .68): cube("glass_frame", r, (x, .75, 0), (.07, 1.58, .13), METAL, .01)
    for y in (.02, 1.48): cube("glass_frame", r, (0, y, 0), (1.47, .07, .13), METAL, .01)
    cube("glass_crossbar", r, (0, .75, 0), (1.32, .045, .11), METAL, .01)
    return r, (1.4, 1.5, .13), "glass"


def fuel_barrel():
    r = root("BP_FuelBarrel")
    cylinder("barrel_body", r, (0, .55, 0), .34, 1.1, CORAL)
    for y in (.24, .86): cylinder("barrel_ring", r, (0, y, 0), .355, .06, METAL)
    cylinder("barrel_cap", r, (.12, 1.13, 0), .075, .08, METAL)
    return r, (.72, 1.18, .72), "fuelBarrel"


def bounce_pad():
    r = root("BP_BouncePad")
    cube("pad_base", r, (0, .12, 0), (1.45, .24, .95), METAL, .08)
    cube("pad_glow", r, (0, .27, 0), (1.20, .07, .70), TEAL, .05)
    for x in (-.48, 0, .48):
        chevron = cube("pad_chevron", r, (x, .33, 0), (.24, .035, .45), MORTAR, .01)
        chevron.rotation_euler.y = .62
    return r, (1.45, .34, .95), "bouncePad"


def export(root_obj, name):
    bpy.ops.object.select_all(action='DESELECT')
    root_obj.select_set(True)
    for child in root_obj.children_recursive: child.select_set(True)
    bpy.context.view_layer.objects.active = root_obj
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{name}.glb"), export_format='GLB', use_selection=True, export_materials='EXPORT')


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
assets = [factory() for factory in (wood_block, brick_block, stone_block, glass_block, fuel_barrel, bounce_pad)]
manifest = []
for obj, size, kind in assets:
    export(obj, obj.name.lower())
    manifest.append({"file": f"{obj.name.lower()}.glb", "name": obj.name, "size": size, "kind": kind})
with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf8") as file:
    json.dump(manifest, file, indent=2)
print(f"Wrote {len(manifest)} GLB assets to {OUT}")
