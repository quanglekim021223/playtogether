"""Generate a sculpted coast GLB around the game's unchanged flat physics surface.

blender --background --python tools/blender/generate_coastal_terrain.py -- --output public/assets/environment/arena_coast.glb
"""
import math
import os
import random
import sys
import bpy

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
output = os.path.abspath(args[args.index("--output") + 1] if "--output" in args else "public/assets/environment/arena_coast.glb")
os.makedirs(os.path.dirname(output), exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
rng = random.Random(23)

def material(name, color):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = .96
    return mat

sand = material("Coastal sand and limestone", (.55, .44, .29))
vcol = sand.node_tree.nodes.new("ShaderNodeVertexColor")
vcol.layer_name = "Coast color"
sand.node_tree.links.new(vcol.outputs["Color"], sand.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
rocks = [
    material("Honey limestone", (.42, .38, .31)),
    material("Salt-weathered limestone", (.35, .37, .35)),
    material("Dark tide rock", (.27, .31, .31)),
]

def noise(x, y):
    return math.sin(x * .46 + y * .31) * .55 + math.sin(x * 1.39 - y * 1.13) * .28 + math.sin(x * 2.7 + y * 1.8) * .12

def color_at(x, y, h):
    if h > -.4:
        base = (.70, .58, .40)
    elif h > -1.5:
        base = (.64, .52, .37)
    elif h > -3.5:
        base = (.50, .47, .39)
    else:
        base = (.38, .42, .40)
    shift = noise(x, y) * .055
    return tuple(max(.04, min(.95, c + shift)) for c in base) + (1,)

# 48 x 12.8 m central deck remains exactly flat at Three.js y=0.035.
nx, ny = 96, 28
vertices, faces = [], []
def vertex(x, y, z):
    vertices.append((x, y, z))
    return len(vertices) - 1

grid = []
for j in range(ny + 1):
    row = []
    for i in range(nx + 1):
        row.append(vertex(-24 + i * .5, -6.4 + j * 12.8 / ny, .035))
    grid.append(row)
for j in range(ny):
    for i in range(nx):
        faces.append((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))

boundary = grid[0] + [grid[j][-1] for j in range(1, ny + 1)]
boundary += list(reversed(grid[-1][:-1]))
boundary += [grid[j][0] for j in range(ny - 1, 0, -1)]
ring = boundary
for width, height in [(.4, -.03), (.9, -.22), (1.5, -1.1), (2.2, -2.4), (3.0, -4.9)]:
    next_ring = []
    for index in boundary:
        x, y, _ = vertices[index]
        spread = width + noise(x, y) * (.12 + width * .05)
        new_x = x + math.copysign(spread * (abs(x) / 24) ** 3, x)
        new_y = y + math.copysign(spread * (abs(y) / 6.4) ** 3, y)
        next_ring.append(vertex(new_x, new_y, height + noise(x, y) * min(width * .11, .34)))
    for k in range(len(ring)):
        n = (k + 1) % len(ring)
        faces.append((ring[k], ring[n], next_ring[n], next_ring[k]))
    ring = next_ring
faces.append(tuple(reversed(ring)))

mesh = bpy.data.meshes.new("Sculpted coast mesh")
mesh.from_pydata(vertices, [], faces)
mesh.materials.append(sand)
mesh.update()
colors = mesh.vertex_colors.new(name="Coast color")
for polygon in mesh.polygons:
    for loop_index in polygon.loop_indices:
        p = mesh.vertices[mesh.loops[loop_index].vertex_index].co
        colors.data[loop_index].color = color_at(p.x, p.y, p.z)
island = bpy.data.objects.new("Arena coast - flat gameplay surface", mesh)
bpy.context.collection.objects.link(island)

def boulder(name, x, y, z, size, kind, stretch=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1, location=(x, y, z))
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(rocks[kind])
    obj.rotation_euler = (rng.uniform(-.2, .2), rng.uniform(-.2, .2), rng.uniform(0, math.tau))
    obj.scale = (size * stretch[0], size * stretch[1], size * stretch[2])
    for point in obj.data.vertices:
        px, py, pz = point.co
        rough = 1 + .16 * noise(px * 2 + x, py * 2 + y)
        point.co = (px * rough, py * rough, pz * rough)
    return obj

def shore_height(distance):
    profile = [(0, .035), (.4, -.03), (.9, -.22), (1.5, -1.1), (2.2, -2.4), (3.0, -4.9)]
    for (a, ha), (b, hb) in zip(profile, profile[1:]):
        if distance <= b:
            return ha + (hb - ha) * max(0, (distance - a) / (b - a))
    return profile[-1][1]

# Asymmetric clusters replace the repeating row of oversized rocks.
for cx, count in [(-25, 8), (-17, 7), (-7, 10), (5, 9), (16, 8), (25, 7)]:
    for i in range(count):
        x = cx + rng.gauss(0, 2.1)
        y = -rng.uniform(6.75, 9.25)
        size = rng.uniform(.38, 1.15) * (1.35 if i == 0 else 1)
        z = shore_height(abs(y) - 6.4) + size * .22 + rng.uniform(-.18, .18)
        boulder("Shore limestone", x, y, z, size, rng.randrange(3), (1.3, .95, .72))

for side in (-1, 1):
    for i in range(17):
        boulder("Side coast rock", side * rng.uniform(24.7, 28.2), rng.uniform(-8.5, 8.5), rng.uniform(-3.5, -1.3), rng.uniform(.4, 1.25), rng.randrange(3), (1.1, 1, .8))

for i in range(100):
    x, y = rng.uniform(-27, 27), -rng.uniform(6.75, 9.1)
    size = rng.uniform(.08, .25)
    z = shore_height(abs(y) - 6.4) + size * .12
    boulder("Tide pebble", x, y, z, size, rng.randrange(3), (1.4, 1.1, .55))

# Join by material, keeping the detailed shoreline to four draw calls.
for mat in rocks:
    group = [obj for obj in bpy.context.scene.objects if obj.type == "MESH" and obj != island and mat.name in obj.data.materials]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in group:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = group[0]
    bpy.ops.object.join()
    group[0].name = mat.name + " clusters"

bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", export_apply=True)
print(f"Generated {output}")
