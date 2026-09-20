"""Generate the static 3D arena island; run with Blender's bundled Python.

  blender --background --python tools/blender/generate_coastal_terrain.py -- --output public/assets/environment/arena_coast.glb

The playable surface stays at y=0 in Three.js, matching the Cannon ground plane.
Only the coast and its rocks are decorative; they never change server physics.
"""
import math
import os
import random
import sys

import bpy


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
output = args[args.index("--output") + 1] if "--output" in args else "public/assets/environment/arena_coast.glb"
output = os.path.abspath(output)
os.makedirs(os.path.dirname(output), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
random.seed(23)


def mat(name, color, roughness=1):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return material


sand = [mat("Warm sand", (.69, .55, .35)), mat("Sunlit sand", (.81, .68, .46)), mat("Wet shoreline", (.49, .43, .33))]
rock = [mat("Warm limestone", (.48, .44, .36)), mat("Grey limestone", (.34, .36, .34)), mat("Shadowed rock", (.27, .30, .30))]

# A flat playable deck with an irregular outline, backed by three sloping
# strata. In Blender Z is up; glTF exports it as Three.js Y.
nx, ny = 48, 12
vertices, faces, face_materials = [], [], []


def vertex(x, y, z):
    vertices.append((x, y, z))
    return len(vertices) - 1


grid = []
for j in range(ny + 1):
    row = []
    for i in range(nx + 1):
        x = -24 + i
        y = -6.4 + j * 12.8 / ny
        edge = i in (0, nx) or j in (0, ny)
        if edge:
            x += math.sin(j * 1.9 + i * .27) * .28
            y += math.sin(i * .83 + j * .54) * .24
        row.append(vertex(x, y, .035))
    grid.append(row)

for j in range(ny):
    for i in range(nx):
        faces.append((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        shore = j in (0, ny - 1)
        face_materials.append(2 if shore and (i % 4 != 0) else 1 if (i * 13 + j * 7) % 9 < 2 else 0)

boundary = grid[0] + [grid[j][-1] for j in range(1, ny + 1)]
boundary += list(reversed(grid[-1][:-1]))
boundary += [grid[j][0] for j in range(ny - 1, 0, -1)]
ring = boundary
for level, flare in [(-.55, .25), (-2.0, .75), (-4.1, 1.1)]:
    next_ring = []
    for k, index in enumerate(boundary):
        x, y, _ = vertices[index]
        radial = math.hypot(x / 24, y / 6.4)
        jitter = math.sin(k * 1.77 + level) * .15
        next_ring.append(vertex(x + math.copysign(flare * radial + jitter, x), y + math.copysign(flare * radial + jitter, y), level + math.sin(k * 2.14) * .12))
    for k in range(len(ring)):
        n = (k + 1) % len(ring)
        faces.append((ring[k], ring[n], next_ring[n], next_ring[k]))
        face_materials.append(3 + (k * 11 + int(abs(level) * 3)) % 3)
    ring = next_ring

faces.append(tuple(reversed(ring)))
face_materials.append(5)
mesh = bpy.data.meshes.new("Coastal island mesh")
mesh.from_pydata(vertices, [], faces)
mesh.materials.clear()
for material in sand + rock:
    mesh.materials.append(material)
mesh.update()
island = bpy.data.objects.new("Arena coast - flat gameplay surface", mesh)
bpy.context.collection.objects.link(island)
for polygon, material_index in zip(mesh.polygons, face_materials):
    polygon.material_index = material_index


def boulder(name, x, y, z, size, material_index):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(x, y, z))
    obj = bpy.context.object
    obj.name = name
    for vertex_point in obj.data.vertices:
        vx, vy, vz = vertex_point.co
        vertex_point.co = (vx * size * 1.3, vy * size * .85, vz * size * .78)
    obj.data.materials.append(rock[material_index])
    obj.rotation_euler[2] = random.random() * math.pi


for side in (-1, 1):
    for i in range(30):
        x = -23.5 + i * 1.62 + random.uniform(-.45, .45)
        y = side * (6.8 + random.uniform(.1, 1.3))
        boulder("Shore rock", x, y, -2.0 + random.uniform(-.4, .4), random.uniform(.45, 1.35), i % 3)
    for i in range(8):
        y = -5.8 + i * 1.6
        boulder("Headland rock", side * (24.1 + random.uniform(0, 1.1)), y, -1.8, random.uniform(.65, 1.3), i % 3)

bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", export_apply=True)
print(f"Generated {output}")
