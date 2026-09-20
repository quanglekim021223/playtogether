"""Build a lightweight rigid-part character rig from a static construction-kid GLB.

Usage:
  blender --background --python tools/blender/rig_resident_lite.py -- \
    --input /path/to/source.glb --output /path/to/rigged.glb
"""

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args(sys.argv[sys.argv.index("--") + 1 :])


HEAD = ("head", "face", "hair", "helmet", "brim", "eye", "iris", "pupil", "brow", "lash", "nose", "ear", "cheek", "mouth", "lip", "temple")
ARM = ("arm", "sleeve", "cuff", "hand", "glove", "finger", "knuckle", "wrist")
LEG = ("leg", "trouser", "boot", "sole", "lace", "knee")


def world_bounds(objects):
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return Vector(map(min, zip(*points))), Vector(map(max, zip(*points)))


def region(obj, low, high):
    name = obj.name.lower()
    center = sum((obj.matrix_world @ Vector(corner) for corner in obj.bound_box), Vector()) / 8
    if any(word in name for word in HEAD):
        return "Head"
    if any(word in name for word in ARM):
        return "Arm_L" if center.x >= 0 else "Arm_R"
    if any(word in name for word in LEG):
        return "Leg_L" if center.x >= 0 else "Leg_R"
    height = high.z - low.z
    if center.z > low.z + height * .66:
        return "Head"
    if center.z < low.z + height * .30 and abs(center.x) > (high.x - low.x) * .06:
        return "Leg_L" if center.x >= 0 else "Leg_R"
    if abs(center.x) > (high.x - low.x) * .30 and center.z < low.z + height * .66:
        return "Arm_L" if center.x >= 0 else "Arm_R"
    return "Torso"


def join(objects, name):
    if not objects:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    modifier = obj.modifiers.new("Game LOD", "DECIMATE")
    modifier.ratio = .30
    modifier.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


options = args()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(options.input).resolve()))
meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
for obj in meshes:
    matrix = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = matrix
for obj in list(bpy.context.scene.objects):
    if obj.type != "MESH":
        bpy.data.objects.remove(obj, do_unlink=True)
low, high = world_bounds(meshes)
width, depth, height = high.x - low.x, high.y - low.y, high.z - low.z
groups = {name: [] for name in ("Torso", "Head", "Arm_L", "Arm_R", "Leg_L", "Leg_R")}
for obj in meshes:
    groups[region(obj, low, high)].append(obj)

rig = bpy.data.objects.new("CharacterRig", None)
bpy.context.collection.objects.link(rig)
pivots = {
    "Torso": Vector((0, 0, 0)),
    "Head": Vector((0, 0, low.z + height * .66)),
    "Arm_L": Vector((width * .24, 0, low.z + height * .54)),
    "Arm_R": Vector((-width * .24, 0, low.z + height * .54)),
    "Leg_L": Vector((width * .12, 0, low.z + height * .29)),
    "Leg_R": Vector((-width * .12, 0, low.z + height * .29)),
}

for name, objects in groups.items():
    mesh = join(objects, f"{name}_Mesh")
    if name == "Torso":
        if mesh:
            mesh.data.transform(mesh.matrix_world)
            mesh.matrix_world = Matrix.Identity(4)
            mesh.parent = rig
            mesh.matrix_parent_inverse.identity()
            mesh.matrix_basis = Matrix.Identity(4)
        continue
    pivot = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(pivot)
    pivot.location = pivots[name]
    pivot.parent = rig
    if mesh:
        mesh.data.transform(mesh.matrix_world)
        mesh.data.transform(Matrix.Translation(-pivots[name]))
        mesh.matrix_world = Matrix.Identity(4)
        mesh.parent = pivot
        mesh.matrix_parent_inverse.identity()
        mesh.matrix_basis = Matrix.Identity(4)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=str(Path(options.output).resolve()),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
    export_animations=False,
)
print("Rig groups:", {name: len(objects) for name, objects in groups.items()})
