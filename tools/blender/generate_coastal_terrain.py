"""Generate the visual coast, a decimated rock kit, and packed PBR textures.

blender --background --python tools/blender/generate_coastal_terrain.py -- --output public/assets/environment/arena_coast.glb
"""
import math
import os
import random
import struct
import sys
import zlib
import bpy

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
output = os.path.abspath(args[args.index("--output") + 1] if "--output" in args else "public/assets/environment/arena_coast.glb")
asset_dir = os.path.dirname(output)
os.makedirs(asset_dir, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
rng = random.Random(23)


def noise(x, y):
    return math.sin(x * .46 + y * .31) * .55 + math.sin(x * 1.39 - y * 1.13) * .28 + math.sin(x * 2.7 + y * 1.8) * .12


def image(name, size, pixel_fn, colorspace="sRGB"):
    # Write PNG bytes ourselves. Blender 5.2's generated-image save path can
    # silently emit black RGB channels in background mode on macOS.
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # PNG filter: None
        v = y / size
        for x in range(size):
            rgba = pixel_fn(x / size, v)
            rows.extend(max(0, min(255, round(channel * 255))) for channel in rgba)
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    path = os.path.join(asset_dir, name + ".png")
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)
    img = bpy.data.images.load(path, check_existing=False)
    img.name = name
    img.colorspace_settings.name = colorspace
    img.pack()
    return img


def periodic_height(u, v, seed=0):
    tau = math.tau
    return (.48 + math.sin((u * 7 + seed) * tau) * .16 * math.sin((v * 5 - seed) * tau)
            + math.sin((u * 19 + v * 13 + seed * .7) * tau) * .07
            + math.sin((u * 43 - v * 31 + seed * 1.3) * tau) * .025)


def pbr_set(prefix, rock=False, size=384):
    def height(u, v):
        variant = min(4, int(u * 5)) if rock else 0
        local_u = (u * 5) % 1 if rock else u
        h = periodic_height(local_u, v, variant * .41)
        if rock:
            crack = abs(math.sin((local_u * 3.2 + v * 2.1 + variant) * math.pi))
            h -= max(0, .12 - crack) * 1.7
        return h

    def albedo(u, v):
        h = height(u, v)
        if rock:
            variant = min(4, int(u * 5))
            bases = ((.62, .53, .42), (.50, .52, .50), (.43, .47, .47), (.66, .55, .42), (.50, .49, .44))
            base, shade = bases[variant], .82 + h * .28
        else:
            base, shade = (.96, .89, .72), .91 + h * .12
        return (*[max(.02, min(.95, c * shade)) for c in base], 1)

    step = 1 / size
    def normal(u, v):
        dx = height((u + step) % 1, v) - height((u - step) % 1, v)
        dy = height(u, (v + step) % 1) - height(u, (v - step) % 1)
        strength = 4.2 if rock else 2.4
        nx, ny, nz = -dx * strength, -dy * strength, 1
        length = math.sqrt(nx * nx + ny * ny + nz * nz)
        return (nx / length * .5 + .5, ny / length * .5 + .5, nz / length * .5 + .5, 1)

    albedo_img = image(prefix + "_albedo", size, albedo)
    normal_img = image(prefix + "_normal", size, normal, "Non-Color")
    roughness_img = image(prefix + "_roughness", size, lambda u, v: (min(1, .72 + (1 - height(u, v)) * .3),) * 3 + (1,), "Non-Color")
    ao_img = image(prefix + "_ao", size, lambda u, v: (max(.45, .7 + height(u, v) * .3),) * 3 + (1,), "Non-Color")
    return albedo_img, normal_img, roughness_img, ao_img


def pbr_material(name, textures, vertex_color_layer=None):
    albedo, normal, roughness, _ao = textures
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF"); bsdf.inputs["Roughness"].default_value = .92
    color_node = nodes.new("ShaderNodeTexImage"); color_node.name = name + " albedo"; color_node.image = albedo
    normal_node = nodes.new("ShaderNodeTexImage"); normal_node.name = name + " normal"; normal_node.image = normal
    rough_node = nodes.new("ShaderNodeTexImage"); rough_node.name = name + " roughness"; rough_node.image = roughness
    normal_map = nodes.new("ShaderNodeNormalMap"); normal_map.inputs["Strength"].default_value = .82
    if vertex_color_layer:
        vertex_node = nodes.new("ShaderNodeVertexColor"); vertex_node.layer_name = vertex_color_layer
        multiply = nodes.new("ShaderNodeMixRGB"); multiply.blend_type = "MULTIPLY"; multiply.inputs[0].default_value = 1
        links.new(color_node.outputs["Color"], multiply.inputs[1]); links.new(vertex_node.outputs["Color"], multiply.inputs[2])
        links.new(multiply.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        links.new(color_node.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(normal_node.outputs["Color"], normal_map.inputs["Color"]); links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(rough_node.outputs["Color"], bsdf.inputs["Roughness"])
    return mat


sand_textures = pbr_set("coast_sand", False)
rock_textures = pbr_set("rock_atlas", True)
sand = pbr_material("Coastal sand PBR", sand_textures, "Coast color")
rock_material = pbr_material("Rock atlas PBR height blend", rock_textures, "Rock foot blend")


def color_at(x, y, h):
    if h > -.08: base = (.94, .82, .59)
    elif h > -.55: base = (.84, .72, .53)
    elif h > -1.6: base = (.68, .61, .50)
    elif h > -3.2: base = (.51, .50, .45)
    else: base = (.40, .44, .43)
    shift = noise(x, y) * .035
    return tuple(max(.04, min(.95, c + shift)) for c in base) + (1,)


# Flat gameplay center and a six-ring visual shore. Physics remains unchanged.
nx, ny = 96, 28
vertices, faces = [], []
def vertex(x, y, z):
    vertices.append((x, y, z)); return len(vertices) - 1

grid = []
for j in range(ny + 1):
    row = []
    for i in range(nx + 1): row.append(vertex(-24 + i * .5, -6.4 + j * 12.8 / ny, .035))
    grid.append(row)
for j in range(ny):
    for i in range(nx): faces.append((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
boundary = grid[0] + [grid[j][-1] for j in range(1, ny + 1)] + list(reversed(grid[-1][:-1])) + [grid[j][0] for j in range(ny - 1, 0, -1)]
ring = boundary
coast_profile = [(.5, -.025), (1.2, -.14), (2.1, -.52), (3.1, -1.35), (4.25, -2.75), (5.15, -4.75)]
for width, height in coast_profile:
    next_ring = []
    for index in boundary:
        x, y, _ = vertices[index]
        spread = width + noise(x, y) * (.12 + width * .05)
        next_ring.append(vertex(x + math.copysign(spread * (abs(x) / 24) ** 3, x), y + math.copysign(spread * (abs(y) / 6.4) ** 3, y), height + noise(x, y) * min(width * .11, .34)))
    for k in range(len(ring)):
        n = (k + 1) % len(ring); faces.append((ring[k], ring[n], next_ring[n], next_ring[k]))
    ring = next_ring
faces.append(tuple(reversed(ring)))
mesh = bpy.data.meshes.new("Sculpted coast mesh")
mesh.from_pydata(vertices, [], faces); mesh.materials.append(sand); mesh.update()
for polygon in mesh.polygons:
    polygon.use_smooth = True
colors = mesh.color_attributes.new(name="Coast color", type="BYTE_COLOR", domain="CORNER")
uvs = mesh.uv_layers.new(name="Sand UV")
for polygon in mesh.polygons:
    for loop_index in polygon.loop_indices:
        p = mesh.vertices[mesh.loops[loop_index].vertex_index].co
        colors.data[loop_index].color = color_at(p.x, p.y, p.z)
        uvs.data[loop_index].uv = (p.x / 7, p.y / 7)
island = bpy.data.objects.new("Arena coast - flat gameplay surface", mesh)
bpy.context.collection.objects.link(island)


def deform_rock(obj, variant):
    for point in obj.data.vertices:
        p = point.co.copy(); direction = p.normalized()
        strata = math.sin(direction.z * 13 + variant * 1.7) * .055
        fracture = abs(math.sin(direction.x * 7.1 + direction.y * 5.3 + variant)) ** 7 * .09
        rough = 1 + noise(direction.x * 5 + variant, direction.y * 5 - variant) * .14 + strata - fracture
        point.co = (p.x * rough, p.y * rough, p.z * rough * (.82 + variant % 3 * .06))


# Five high-poly archetypes are decimated into reusable low-poly meshes.
rock_prototypes = []
for variant in range(5):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1, location=(0, 0, 0))
    high = bpy.context.object; high.name = f"Rock high poly {variant}"; deform_rock(high, variant)
    low = high.copy(); low.data = high.data.copy(); bpy.context.collection.objects.link(low); low.name = f"Rock LOD0 {variant}"
    bpy.context.view_layer.objects.active = low
    modifier = low.modifiers.new("Game-ready decimation", "DECIMATE"); modifier.ratio = .18
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    low.data.materials.append(rock_material)
    bpy.ops.object.select_all(action="DESELECT"); low.select_set(True); bpy.context.view_layer.objects.active = low
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=.025); bpy.ops.object.mode_set(mode="OBJECT")
    uv_layer = low.data.uv_layers.active
    for uv in uv_layer.data:
        uv.uv.x = uv.uv.x * .18 + variant * .2 + .01; uv.uv.y = uv.uv.y * .96 + .02
    foot_color = low.data.color_attributes.new(name="Rock foot blend", type="BYTE_COLOR", domain="CORNER")
    z_values = [point.co.z for point in low.data.vertices]; z_min, z_max = min(z_values), max(z_values)
    for polygon in low.data.polygons:
        for loop_index in polygon.loop_indices:
            z = low.data.vertices[low.data.loops[loop_index].vertex_index].co.z
            blend = max(0, min(1, ((z - z_min) / max(.001, z_max - z_min) - .08) / .28))
            blend = blend * blend * (3 - 2 * blend)
            foot_color.data[loop_index].color = (.92 + blend * .08, .75 + blend * .25, .52 + blend * .48, 1)
    for polygon in low.data.polygons: polygon.use_smooth = True
    rock_prototypes.append(low.data)
    bpy.data.objects.remove(high, do_unlink=True); bpy.data.objects.remove(low, do_unlink=True)


def shore_height(distance):
    profile = [(0, .035)] + coast_profile
    for (a, ha), (b, hb) in zip(profile, profile[1:]):
        if distance <= b: return ha + (hb - ha) * max(0, (distance - a) / (b - a))
    return profile[-1][1]


rocks, shadows = [], []
def place_rock(name, x, y, z, size, variant, stretch=(1, 1, 1), blend=True):
    obj = bpy.data.objects.new(name, rock_prototypes[variant]); bpy.context.collection.objects.link(obj)
    obj.location = (x, y, z); obj.rotation_euler = (rng.uniform(-.14, .14), rng.uniform(-.14, .14), rng.uniform(0, math.tau))
    obj.scale = (size * stretch[0], size * stretch[1], size * stretch[2]); rocks.append(obj)
    if blend and size > .43:
        ground_z = z + size * .04
        bpy.ops.mesh.primitive_circle_add(vertices=20, radius=size * 1.02, fill_type="TRIFAN", location=(x, y, ground_z + .012))
        shadow = bpy.context.object; shadow.name = "Rock contact shadow"; shadow.scale.y = stretch[1] * .75; shadows.append(shadow)


for cx, count in [(-25, 10), (-17, 9), (-7, 11), (5, 10), (16, 9), (25, 9)]:
    for i in range(count):
        x, y = cx + rng.gauss(0, 2.1), -rng.uniform(7.15, 11.0); size = rng.uniform(.46, 1.28) * (1.3 if i == 0 else 1)
        place_rock("Shore rock PBR", x, y, shore_height(abs(y) - 6.4) - size * .04 + rng.uniform(-.14, .1), size, rng.randrange(5), (1.35, 1, .78))
for side in (-1, 1):
    for _ in range(19):
        x, y = side * rng.uniform(25, 29), rng.uniform(-10.5, 10.5); distance = max(abs(x) - 24, abs(y) - 6.4); size = rng.uniform(.42, 1.2)
        place_rock("Side rock PBR", x, y, shore_height(distance) - size * .04, size, rng.randrange(5), (1.18, 1, .82))
for _ in range(125):
    x, y = rng.uniform(-28, 28), -rng.uniform(7, 11.15); size = rng.uniform(.07, .23)
    place_rock("PBR tide pebble", x, y, shore_height(abs(y) - 6.4) + size * .04, size, rng.randrange(5), (1.4, 1.1, .55), False)


def join(objects, name):
    if not objects: return None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects: obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]; bpy.ops.object.join(); objects[0].name = name; return objects[0]


join(rocks, "PBR rock kit clusters")
shadow_mesh = join(shadows, "Contact shadow decals")
if shadow_mesh:
    shadow_mat = bpy.data.materials.new("Soft rock contact shadow"); shadow_mat.use_nodes = True
    bsdf = shadow_mat.node_tree.nodes.get("Principled BSDF"); bsdf.inputs["Base Color"].default_value = (.055, .045, .035, 1); bsdf.inputs["Roughness"].default_value = 1; bsdf.inputs["Alpha"].default_value = .16
    shadow_mat.surface_render_method = "DITHERED"; shadow_mesh.data.materials.append(shadow_mat)

bpy.ops.export_scene.gltf(filepath=output, export_format="GLB", export_apply=True, export_image_format="AUTO", export_vertex_color="ACTIVE")
print(f"Generated {output} with 5 decimated rock archetypes and PBR texture atlases")
